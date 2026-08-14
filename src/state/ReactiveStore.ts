import { errorHandler } from "../core/ErrorHandler.js";
import { Scheduler } from "./Scheduler.js";
import { ERROR_CODE } from "../constants/errorCodes.js";

/** 副作用对象 */
interface Effect {
    /** 依赖路径集合 */
    deps: Set<string>;
    /** 执行函数 */
    run: (newValue?: unknown, oldValue?: unknown) => void;
    /** 是否同步执行 */
    sync: boolean;
}

/** 计算属性条目 */
interface ComputedEntry {
    /** 取值函数 */
    getter: (state: any) => unknown;
    /** 依赖路径集合 */
    deps: Set<string>;
    /** 是否需要重新计算 */
    dirty: boolean;
    /** 缓存值 */
    cachedValue: unknown;
    /** 取消监听函数列表 */
    unwatchers: (() => void)[];
}

/** ReactiveStore 配置项 */
interface ReactiveStoreOptions {
    /** 自定义调度器实例 */
    scheduler?: Scheduler;
}

/**
 * 响应式状态管理器 (Reactive Store)
 *
 * 基于 Proxy 实现的响应式数据存储，提供以下核心能力：
 * - 响应式代理：通过 Proxy 拦截 get/set，自动追踪依赖与触发更新
 * - watch 监听：订阅指定路径的变化，支持同步/异步回调
 * - computed 计算属性：惰性求值 + 缓存，依赖变化时标记为 dirty
 * - batch 批量更新：合并多次修改，统一触发一次更新
 * - 调度器集成：异步 watcher 通过 Scheduler 在下一帧执行，避免重复渲染
 *
 * @class ReactiveStore
 */
export class ReactiveStore {
    /** 原始未代理的数据对象，用于序列化和内部直接写入 */
    _raw: Record<string, unknown>;
    /** watcher 注册表：Map<path, Set<effect>> */
    _watchers: Map<string, Set<Effect>> = new Map();
    /** 批量更新嵌套深度，> 0 时表示处于 batch 中 */
    _batchDepth: number = 0;
    /** batch 期间累积的变更路径集合 */
    _batchedPaths: Set<string> = new Set();
    /** batch 期间累积的旧值映射 path -> oldValue */
    _batchedOldValues: Map<string, unknown> = new Map();
    /** 当前正在收集依赖的副作用 */
    _activeEffect: Effect | ComputedEntry | null = null;
    /** 计算属性注册表 */
    _computeds: Map<string, ComputedEntry> = new Map();
    /** 已代理对象的缓存 */
    _proxyMap: WeakMap<object, any> = new WeakMap();
    /** 调度器 */
    _scheduler: Scheduler;
    /** 响应式状态代理 */
    state: any;

    /**
     * @param initialState - 初始状态对象（纯数据）
     * @param options - 配置项
     */
    constructor(initialState: Record<string, unknown>, options: ReactiveStoreOptions = {}) {
        this._raw = initialState;
        this._scheduler = options.scheduler || new Scheduler();
        this.state = this._createProxy(initialState, "");
    }

    /**
     * 为目标对象创建响应式 Proxy
     * @param target - 需要代理的原始对象
     * @param basePath - 当前对象在状态树中的路径
     * @returns 响应式代理对象
     */
    _createProxy(target: Record<string, unknown>, basePath: string): any {
        const self = this;

        return new Proxy(target, {
            get(obj: any, key: string | symbol): any {
                if (typeof key === "symbol") return obj[key];
                const path = basePath ? `${basePath}.${key}` : String(key);

                const computed = self._computeds.get(path);
                if (computed) {
                    if (computed.dirty) {
                        computed.cachedValue = computed.getter(self.state);
                        computed.dirty = false;
                        self._setValueByPath(self._raw, path, computed.cachedValue);
                    }
                    if (self._activeEffect) {
                        self._activeEffect.deps.add(path);
                    }
                    return computed.cachedValue;
                }

                const value = obj[key];

                if (typeof value === "object" && value !== null) {
                    let proxy = self._proxyMap.get(value);
                    if (!proxy) {
                        proxy = self._createProxy(value, path);
                        self._proxyMap.set(value, proxy);
                    }
                    return proxy;
                }

                if (self._activeEffect) {
                    self._activeEffect.deps.add(path);
                }

                return value;
            },

            set(obj: any, key: string | symbol, value: unknown): boolean {
                if (typeof key === "symbol") {
                    obj[key] = value;
                    return true;
                }
                const old = obj[key];
                const path = basePath ? `${basePath}.${key}` : String(key);

                if (old === value) return true;
                obj[key] = value;

                if (self._batchDepth > 0) {
                    self._batchedPaths.add(path);
                    self._batchedOldValues.set(path, old);
                } else {
                    self._trigger(path, value, old);
                }
                return true;
            },
        });
    }

    /**
     * 触发指定路径的 watcher
     * @param path - 发生变化的路径
     * @param newValue - 新值
     * @param oldValue - 旧值
     */
    _trigger(path: string, newValue: unknown, oldValue: unknown): void {
        const syncEffects: Effect[] = [];
        const asyncEffects: Effect[] = [];

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

        for (const e of syncEffects) {
            try {
                e.run(newValue, oldValue);
            } catch (err) {
                errorHandler.error(ERROR_CODE.GENERIC_ERROR, `[ReactiveStore] sync watcher error on "${path}":`, err);
            }
        }

        for (const e of asyncEffects) {
            const effectRef = e;
            this._scheduler.queueJob({
                id: e,
                run: () => {
                    try {
                        const currentVal = this._getValueByPath(this.state, path);
                        effectRef.run(currentVal, oldValue);
                    } catch (err) {
                        errorHandler.error(ERROR_CODE.GENERIC_ERROR, `[ReactiveStore] watcher error on "${path}":`, err);
                    }
                },
            });
        }
    }

    /**
     * 判断两个路径是否匹配
     * @param changedPath - 实际变化的路径
     * @param watchPath - 监听的路径
     */
    _pathsMatch(changedPath: string, watchPath: string): boolean {
        if (changedPath === watchPath) return true;
        if (changedPath.startsWith(watchPath + ".")) return true;
        return watchPath.startsWith(changedPath + ".");
    }

    /**
     * 注册路径监听器
     * @param path - 监听的状态路径
     * @param fn - 回调函数
     * @returns 取消监听函数
     */
    watch(path: string, fn: (newValue: unknown, oldValue: unknown) => void): () => void {
        const effect: Effect = { deps: new Set(), run: fn, sync: false };

        this._activeEffect = effect;
        this._getValueByPath(this.state, path);
        this._activeEffect = null;

        if (!this._watchers.has(path)) {
            this._watchers.set(path, new Set());
        }
        this._watchers.get(path)!.add(effect);

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
     * @param path - 计算属性在状态树中的路径
     * @param getter - 取值函数
     * @returns 取消注册函数
     */
    computed(path: string, getter: (state: any) => unknown): () => void {
        const entry: ComputedEntry = {
            getter,
            deps: new Set(),
            dirty: false,
            cachedValue: undefined,
            unwatchers: [],
        };

        this._activeEffect = entry;
        entry.cachedValue = getter(this.state);
        this._activeEffect = null;

        this._setValueByPath(this._raw, path, entry.cachedValue);

        for (const dep of entry.deps) {
            const effect: Effect = {
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
            this._watchers.get(dep)!.add(effect);

            entry.unwatchers.push(() => {
                const set = this._watchers.get(dep);
                if (set) {
                    set.delete(effect);
                    if (set.size === 0) this._watchers.delete(dep);
                }
            });
        }

        this._computeds.set(path, entry);

        return () => {
            for (const u of entry.unwatchers) u();
            this._computeds.delete(path);
        };
    }

    /**
     * 批量更新
     * 在 fn 执行期间，所有 set 操作不会立即触发 watcher，
     * 而是累积到 batch 结束后统一触发一次。
     * 支持嵌套调用（引用计数 _batchDepth）。
     * @param fn - 批量操作函数
     */
    batch(fn: () => void): void {
        this._batchDepth++;
        try {
            fn();
        } finally {
            this._batchDepth--;

            if (this._batchDepth === 0 && this._batchedPaths.size > 0) {
                const paths = Array.from(this._batchedPaths);
                for (const p of paths) {
                    const oldVal = this._batchedOldValues.get(p);
                    const val = this._getValueByPath(this.state, p);
                    this._trigger(p, val, oldVal);
                }
                this._scheduler.flush();
                this._batchedPaths.clear();
                this._batchedOldValues.clear();
            }
        }
    }

    /** 立即执行调度器中排队的所有异步任务 */
    flush(): void {
        this._scheduler.flush();
    }

    /**
     * 返回一个 Promise，在调度器队列清空后 resolve
     */
    nextTick(): Promise<void> {
        return this._scheduler.nextTick();
    }

    /**
     * 根据路径从对象中取值
     * @param obj - 目标对象
     * @param path - 点分隔的路径
     */
    _getValueByPath(obj: any, path: string): unknown {
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
     * @param obj - 目标对象
     * @param path - 点分隔的路径
     * @param value - 要写入的值
     */
    _setValueByPath(obj: any, path: string, value: unknown): void {
        const keys = path.split(".");
        let cur = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (cur == null) return;
            cur = cur[keys[i]];
        }
        if (cur != null) cur[keys[keys.length - 1]] = value;
    }

    /** 刷新所有 dirty 的计算属性 */
    _flushComputeds(): void {
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
     */
    getStateSnapshot(): Record<string, unknown> {
        this._flushComputeds();
        return JSON.parse(JSON.stringify(this._raw));
    }

    /** 销毁响应式存储 */
    destroy(): void {
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
