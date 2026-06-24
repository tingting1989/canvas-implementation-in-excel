const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
const caf = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : clearTimeout;

export class Scheduler {
    constructor() {
        this._queue = [];
        this._flushing = false;
        this._pendingRaf = false;
        this._rafId = 0;
    }

    queueJob(job) {
        if (job.id !== undefined) {
            const exists = this._queue.some((j) => j.id === job.id);
            if (exists) return;
        }
        this._queue.push(job);
        this._scheduleFlush();
    }

    _scheduleFlush() {
        if (this._pendingRaf) return;
        this._pendingRaf = true;
        this._rafId = raf(() => {
            this._pendingRaf = false;
            this.flush();
        });
    }

    flush() {
        if (this._flushing) return;
        this._flushing = true;

        const jobs = this._queue.splice(0);
        for (const job of jobs) {
            try {
                job.run();
            } catch (err) {
                console.error("[Scheduler] job error:", err);
            }
        }

        this._flushing = false;
    }

    nextTick() {
        return new Promise((resolve) => {
            if (this._queue.length === 0) {
                resolve();
                return;
            }
            const check = () => {
                if (this._queue.length === 0) {
                    resolve();
                } else {
                    raf(check);
                }
            };
            raf(check);
        });
    }

    cancel() {
        if (this._pendingRaf) {
            caf(this._rafId);
        }
        this._pendingRaf = false;
        this._queue.length = 0;
    }

    get pending() {
        return this._queue.length;
    }
}

export class ReactiveStore {
    constructor(initialState, options = {}) {
        this._raw = initialState;
        this._watchers = new Map();
        this._batchDepth = 0;
        this._batchedPaths = new Set();
        this._activeEffect = null;
        this._computeds = new Map();
        this._proxyMap = new WeakMap();
        this._scheduler = options.scheduler || new Scheduler();

        this.state = this._createProxy(initialState, "");
    }

    _createProxy(target, basePath) {
        const self = this;

        return new Proxy(target, {
            get(obj, key) {
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

            set(obj, key, value) {
                const old = obj[key];
                const path = basePath ? `${basePath}.${key}` : String(key);

                if (old === value) return true;
                obj[key] = value;

                if (self._batchDepth > 0) {
                    self._batchedPaths.add(path);
                } else {
                    self._trigger(path, value, old);
                }
                return true;
            },
        });
    }

    _trigger(path, newValue, oldValue) {
        const syncEffects = [];
        const asyncEffects = [];

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
                console.error(`[ReactiveStore] sync watcher error on "${path}":`, err);
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
                        console.error(`[ReactiveStore] watcher error on "${path}":`, err);
                    }
                },
            });
        }
    }

    _pathsMatch(changedPath, watchPath) {
        if (changedPath === watchPath) return true;
        if (changedPath.startsWith(watchPath + ".")) return true;
        if (watchPath.startsWith(changedPath + ".")) return true;
        return false;
    }

    watch(path, fn) {
        const effect = { deps: new Set(), run: fn, sync: false };

        this._activeEffect = effect;
        this._getValueByPath(this.state, path);
        this._activeEffect = null;

        if (!this._watchers.has(path)) {
            this._watchers.set(path, new Set());
        }
        this._watchers.get(path).add(effect);

        return () => {
            const set = this._watchers.get(path);
            if (set) {
                set.delete(effect);
                if (set.size === 0) this._watchers.delete(path);
            }
        };
    }

    computed(path, getter) {
        const entry = {
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

    batch(fn) {
        this._batchDepth++;
        try {
            fn();
        } finally {
            this._batchDepth--;
            if (this._batchDepth === 0 && this._batchedPaths.size > 0) {
                const paths = Array.from(this._batchedPaths);
                this._batchedPaths.clear();
                for (const p of paths) {
                    const val = this._getValueByPath(this.state, p);
                    this._trigger(p, val, undefined);
                }
            }
        }
    }

    flush() {
        this._scheduler.flush();
    }

    nextTick() {
        return this._scheduler.nextTick();
    }

    _getValueByPath(obj, path) {
        const keys = path.split(".");
        let cur = obj;
        for (const k of keys) {
            if (cur == null) return undefined;
            cur = cur[k];
        }
        return cur;
    }

    _setValueByPath(obj, path, value) {
        const keys = path.split(".");
        let cur = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (cur == null) return;
            cur = cur[keys[i]];
        }
        if (cur != null) cur[keys[keys.length - 1]] = value;
    }

    _flushComputeds() {
        for (const [path, entry] of this._computeds) {
            if (entry.dirty) {
                entry.cachedValue = entry.getter(this.state);
                entry.dirty = false;
                this._setValueByPath(this._raw, path, entry.cachedValue);
            }
        }
    }

    getStateSnapshot() {
        this._flushComputeds();
        return JSON.parse(JSON.stringify(this._raw));
    }

    destroy() {
        this._scheduler.cancel();
        for (const [, entry] of this._computeds) {
            for (const u of entry.unwatchers) u();
        }
        this._computeds.clear();
        this._watchers.clear();
        this._batchedPaths.clear();
        this._activeEffect = null;
        this._proxyMap = new WeakMap();
    }
}