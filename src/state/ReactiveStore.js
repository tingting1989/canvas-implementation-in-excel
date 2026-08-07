import { errorHandler } from "../core/ErrorHandler.js";
import { Scheduler } from "./Scheduler.js";
import { ERROR_CODE } from "../constants/errorCodes";

/**
 * 响应式状态管理器
 *
 * 基于 Proxy 实现的响应式数据存储，提供以下核心能力：
 * - 响应式代理：通过 Proxy 拦截 get/set，自动追踪依赖与触发更新
 * - watch 监听：订阅指定路径的变化，支持同步/异步回调
 * - computed 计算属性：惰性求值 + 缓存，依赖变化时标记为 dirty
 * - batch 批量更新：合并多次修改，统一触发一次更新
 * - 调度器集成：异步 watcher 通过 Scheduler 在下一帧执行，避免重复渲染
 */
export class ReactiveStore {
    /**
     * @param {Object} initialState - 初始状态对象（纯数据）
     * @param {Object} [options] - 配置项
     * @param {Scheduler} [options.scheduler] - 自定义调度器实例，默认创建新的 Scheduler
     */
    constructor(initialState, options = {}) {
        // 原始未代理的数据对象，用于序列化和内部直接写入
        this._raw = initialState;
        // watcher 注册表：Map<path, Set<effect>>
        this._watchers = new Map();
        // 批量更新嵌套深度，> 0 时表示处于 batch 中
        this._batchDepth = 0;
        // batch 期间累积的变更路径集合
        this._batchedPaths = new Set();
        // batch 期间累积的旧值映射 path -> oldValue
        this._batchedOldValues = new Map();
        // 当前正在收集依赖的副作用（watch/computed 执行期间设置）
        this._activeEffect = null;
        // 计算属性注册表：Map<path, ComputedEntry>
        this._computeds = new Map();
        // 已代理对象的缓存，避免对同一对象重复创建 Proxy
        this._proxyMap = new WeakMap();
        // 调度器，负责异步 watcher 的队列调度
        this._scheduler = options.scheduler || new Scheduler();

        // 对初始状态创建顶层响应式代理
        this.state = this._createProxy(initialState, "");
    }

    /**
     * 为目标对象创建响应式 Proxy
     *
     * - get 拦截：收集依赖（如果存在 _activeEffect），对对象值递归代理
     * - set 拦截：检测值变化，触发 watcher 或累积到 batch 队列
     *
     * @param {Object} target - 需要代理的原始对象
     * @param {string} basePath - 当前对象在状态树中的路径（如 "sheet.cells"）
     * @returns {Proxy} 响应式代理对象
     */
    _createProxy(target, basePath) {
        const self = this;

        return new Proxy(target, {
            /**
             * 读取拦截
             * - 若路径命中 computed，返回缓存值（dirty 时重新计算）
             * - 若值为对象，返回其代理（利用 _proxyMap 去重）
             * - 否则直接返回原始值
             * - 任何读取都会将路径加入当前 _activeEffect 的依赖集合
             */
            get(obj, key) {
                const path = basePath ? `${basePath}.${key}` : String(key);

                // 检查是否为计算属性
                const computed = self._computeds.get(path);
                if (computed) {
                    // dirty 标记为 true 时需要重新求值
                    if (computed.dirty) {
                        computed.cachedValue = computed.getter(self.state);
                        computed.dirty = false;
                        // 同步更新 _raw 中的值，保证快照一致性
                        self._setValueByPath(self._raw, path, computed.cachedValue);
                    }
                    // 收集依赖：当前 effect 依赖此 computed 路径
                    if (self._activeEffect) {
                        self._activeEffect.deps.add(path);
                    }
                    return computed.cachedValue;
                }

                const value = obj[key];

                // 对象值递归创建代理，利用 WeakMap 缓存避免重复代理
                if (typeof value === "object" && value !== null) {
                    let proxy = self._proxyMap.get(value);
                    if (!proxy) {
                        proxy = self._createProxy(value, path);
                        self._proxyMap.set(value, proxy);
                    }
                    return proxy;
                }

                // 原始值：收集依赖
                if (self._activeEffect) {
                    self._activeEffect.deps.add(path);
                }

                return value;
            },

            /**
             * 写入拦截
             * - 值未变化时跳过（浅比较）
             * - 处于 batch 中时累积变更，否则立即触发 watcher
             */
            set(obj, key, value) {
                const old = obj[key];
                const path = basePath ? `${basePath}.${key}` : String(key);

                // 浅比较：值相同则不触发更新
                if (old === value) return true;
                obj[key] = value;

                if (self._batchDepth > 0) {
                    // 批量模式：累积路径和旧值，等 batch 结束统一触发
                    self._batchedPaths.add(path);
                    self._batchedOldValues.set(path, old);
                } else {
                    // 非批量模式：立即触发
                    self._trigger(path, value, old);
                }
                return true;
            },
        });
    }

    /**
     * 触发指定路径的 watcher
     *
     * 将匹配的 watcher 分为同步和异步两组：
     * - 同步 watcher 立即执行
     * - 异步 watcher 通过 Scheduler 排队，在下一帧执行
     *
     * @param {string} path - 发生变化的路径
     * @param {*} newValue - 新值
     * @param {*} oldValue - 旧值
     */
    _trigger(path, newValue, oldValue) {
        const syncEffects = [];
        const asyncEffects = [];

        // 遍历所有 watcher，筛选路径匹配的副作用
        for (const [watchPath, effects] of this._watchers) {
            if (this._pathsMatch(path, watchPath)) {
                for (const e of effects) {
                    if (e.sync) {
                        syncEffects.push(e);
                    } else {
                        asyncEffects.push(e);
                    }
                }
            }
        }

        // 同步 watcher：立即执行
        for (const e of syncEffects) {
            try {
                e.run(newValue, oldValue);
            } catch (err) {
                errorHandler.handle(ERROR_CODE.GENERIC_ERROR, `[ReactiveStore] sync watcher error on "${path}":`, err);
            }
        }

        // 异步 watcher：加入调度器队列，下一帧执行
        // 执行时重新读取最新值，确保回调拿到的是当前值而非入队时的快照
        for (const e of asyncEffects) {
            const effectRef = e;
            this._scheduler.queueJob({
                id: e,
                run: () => {
                    try {
                        const currentVal = this._getValueByPath(this.state, path);
                        effectRef.run(currentVal, oldValue);
                    } catch (err) {
                        errorHandler.handle(ERROR_CODE.GENERIC_ERROR, `[ReactiveStore] watcher error on "${path}":`, err);
                    }
                },
            });
        }
    }

    /**
     * 判断两个路径是否匹配
     *
     * 匹配规则：
     * - 完全相同 → 匹配
     * - changedPath 是 watchPath 的子路径 → 匹配（如 "a.b.c" 匹配 "a"）
     * - watchPath 是 changedPath 的子路径 → 匹配（如 "a" 匹配 "a.b.c"）
     *
     * @param {string} changedPath - 实际变化的路径
     * @param {string} watchPath - 监听的路径
     * @returns {boolean}
     */
    _pathsMatch(changedPath, watchPath) {
        if (changedPath === watchPath) return true;
        if (changedPath.startsWith(watchPath + ".")) return true;
        return watchPath.startsWith(changedPath + ".");
    }

    /**
     * 注册路径监听器
     *
     * 执行一次路径读取以收集依赖，当路径对应的值变化时调用 fn。
     * 返回取消监听函数。
     *
     * @param {string} path - 监听的状态路径（如 "sheet.rowCount"）
     * @param {Function} fn - 回调函数 (newValue, oldValue) => void
     * @returns {Function} 取消监听函数
     */
    watch(path, fn) {
        // 创建异步副作用对象
        const effect = { deps: new Set(), run: fn, sync: false };

        // 临时设置 _activeEffect，执行一次读取以收集依赖
        this._activeEffect = effect;
        this._getValueByPath(this.state, path);
        this._activeEffect = null;

        // 注册到 watcher 表
        if (!this._watchers.has(path)) {
            this._watchers.set(path, new Set());
        }
        this._watchers.get(path).add(effect);

        // 返回 unwatch 函数
        return () => {
            const set = this._watchers.get(path);
            if (set) {
                set.delete(effect);
                if (set.size === 0) this._watchers.delete(path);
            }
        };
    }

    /**
     * 注册计算属性
     *
     * 惰性求值 + 缓存策略：
     * - 首次注册时执行 getter 获取初始值
     * - 依赖变化时仅标记 dirty，下次读取时才重新计算
     * - 内部为每个依赖路径注册同步 watcher，用于标记 dirty 并触发下游
     *
     * @param {string} path - 计算属性在状态树中的路径
     * @param {Function} getter - 取值函数 (state) => value
     * @returns {Function} 取消注册函数
     */
    computed(path, getter) {
        const entry = {
            getter,
            deps: new Set(),
            dirty: false,
            cachedValue: undefined,
            unwatchers: [],
        };

        // 执行 getter 以收集依赖并缓存初始值
        this._activeEffect = entry;
        entry.cachedValue = getter(this.state);
        this._activeEffect = null;

        // 将计算结果写入 _raw，保证快照一致性
        this._setValueByPath(this._raw, path, entry.cachedValue);

        // 为每个依赖路径注册同步 watcher
        // 当依赖变化时，标记 dirty 并触发此 computed 路径的下游 watcher
        for (const dep of entry.deps) {
            const effect = {
                deps: new Set(),
                sync: true,
                run: () => {
                    if (!entry.dirty) {
                        entry.dirty = true;
                        this._trigger(path, undefined, entry.cachedValue);
                    }
                },
            };

            if (!this._watchers.has(dep)) {
                this._watchers.set(dep, new Set());
            }
            this._watchers.get(dep).add(effect);

            // 保存 unwatcher 以便销毁时清理
            entry.unwatchers.push(() => {
                const set = this._watchers.get(dep);
                if (set) {
                    set.delete(effect);
                    if (set.size === 0) this._watchers.delete(dep);
                }
            });
        }

        this._computeds.set(path, entry);

        // 返回取消注册函数
        return () => {
            for (const u of entry.unwatchers) u();
            this._computeds.delete(path);
        };
    }

    /**
     * 批量更新
     *
     * 在 fn 执行期间，所有 set 操作不会立即触发 watcher，
     * 而是累积到 batch 结束后统一触发一次，减少不必要的重复计算。
     * 支持嵌套调用（引用计数 _batchDepth）。
     *
     * @param {Function} fn - 批量操作函数
     */
    batch(fn) {
        this._batchDepth++;
        try {
            fn();
        } finally {
            this._batchDepth--;

            // 最外层 batch 结束时，统一触发所有累积的变更
            if (this._batchDepth === 0 && this._batchedPaths.size > 0) {
                const paths = Array.from(this._batchedPaths);
                for (const p of paths) {
                    const oldVal = this._batchedOldValues.get(p);
                    const val = this._getValueByPath(this.state, p);
                    this._trigger(p, val, oldVal);
                }
                // 立即刷新调度器队列，确保异步 watcher 也被执行
                this._scheduler.flush();
                this._batchedPaths.clear();
                this._batchedOldValues.clear();
            }
        }
    }

    /**
     * 立即执行调度器中排队的所有异步任务
     */
    flush() {
        this._scheduler.flush();
    }

    /**
     * 返回一个 Promise，在调度器队列清空后 resolve
     * 常用于等待异步 watcher 执行完毕
     *
     * @returns {Promise<void>}
     */
    nextTick() {
        return this._scheduler.nextTick();
    }

    /**
     * 根据路径从对象中取值
     *
     * @param {Object} obj - 目标对象
     * @param {string} path - 点分隔的路径（如 "sheet.cells.A1"）
     * @returns {*} 路径对应的值，路径不存在时返回 undefined
     */
    _getValueByPath(obj, path) {
        const keys = path.split(".");
        let cur = obj;
        for (const k of keys) {
            if (cur == null) return undefined;
            cur = cur[k];
        }
        return cur;
    }

    /**
     * 根据路径向对象中写入值
     *
     * @param {Object} obj - 目标对象
     * @param {string} path - 点分隔的路径
     * @param {*} value - 要写入的值
     */
    _setValueByPath(obj, path, value) {
        const keys = path.split(".");
        let cur = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (cur == null) return;
            cur = cur[keys[i]];
        }
        if (cur != null) cur[keys[keys.length - 1]] = value;
    }

    /**
     * 刷新所有 dirty 的计算属性
     * 在获取状态快照前调用，确保 computed 值是最新的
     */
    _flushComputeds() {
        for (const [path, entry] of this._computeds) {
            if (entry.dirty) {
                entry.cachedValue = entry.getter(this.state);
                entry.dirty = false;
                this._setValueByPath(this._raw, path, entry.cachedValue);
            }
        }
    }

    /**
     * 获取当前状态的深拷贝快照
     * 先刷新所有 dirty 的 computed，再序列化 _raw
     *
     * @returns {Object} 状态的深拷贝
     */
    getStateSnapshot() {
        this._flushComputeds();
        return JSON.parse(JSON.stringify(this._raw));
    }

    /**
     * 销毁响应式存储
     * 清理调度器、计算属性监听、watcher 注册表和代理缓存
     */
    destroy() {
        this._scheduler.cancel();
        for (const [, entry] of this._computeds) {
            for (const u of entry.unwatchers) u();
        }
        this._computeds.clear();
        this._watchers.clear();

        this._activeEffect = null;
        this._proxyMap = new WeakMap();
    }
}
