# ReactiveStore & Scheduler

响应式状态管理与帧级调度器，为 Excel Canvas 渲染引擎提供集中化状态、自动依赖追踪和防掉帧调度能力。

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                        ReactiveStore                        │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Proxy   │  │ computed │  │  watch   │  │  batch   │  │
│  │ 响式代理  │  │ 延迟计算  │  │ 依赖追踪  │  │ 批量更新  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │             │             │             │          │
│       └─────────────┴─────────────┴─────────────┘          │
│                          │                                  │
│                     _trigger                              │
│                          │                                  │
│              ┌───────────┴───────────┐                    │
│              ▼                       ▼                    │
│         sync: true             sync: false               │
│     (computed 内部)            (用户 watch)               │
│              │                       │                    │
│              ▼                       ▼                    │
│         同步执行              Scheduler.queueJob()        │
│     标记 dirty               (去重 + rAF 调度)           │
│              │                       │                    │
│              │              ┌────────┴────────┐          │
│              │              ▼                 ▼          │
│              │        rAF 等待         flush() 同步      │
│              │        下一帧执行         测试用断言       │
│              │              │                 │          │
│              ▼              ▼                 ▼          │
│         computed ✓    用户 watcher 执行  用户 watcher 执行│
│         读取时重算    图层标记脏 ✓       图层标记脏 ✓     │
└─────────────────────────────────────────────────────────────┘
```

---

## Scheduler

基于 `requestAnimationFrame` 的帧级任务调度器，防止高频状态变化（如 scroll）导致一帧内多次渲染。

### 构造函数

```javascript
const scheduler = new Scheduler();
```

### 方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `queueJob` | `queueJob(job: { id?, run })` | 入队一个任务。若提供 `id`，相同 `id` 的 job 会被去重 |
| `flush` | `flush()` | 同步执行队列中所有任务 |
| `nextTick` | `nextTick(): Promise<void>` | 返回 Promise，在队列清空后的下一帧 resolve |
| `cancel` | `cancel()` | 取消所有待执行任务和 rAF 回调 |

### 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `pending` | `number` | 队列中待执行的任务数 |

### 调度流程

```
queueJob(job)
    │
    ├── id 去重检查
    │
    ├── 入队 _queue
    │
    └── _scheduleFlush()
            │
            └── requestAnimationFrame
                    │
                    └── flush()
                            │
                            ├── 取出全部 jobs
                            │
                            └── 逐个执行 job.run()
```

### 示例

```javascript
const scheduler = new Scheduler();

let count = 0;
scheduler.queueJob({ id: 'a', run: () => { count++; } });
scheduler.queueJob({ id: 'a', run: () => { count++; } }); // 去重，不重复入队
scheduler.queueJob({ id: 'b', run: () => { count++; } });

console.log(scheduler.pending); // 2
console.log(count);             // 0（未同步执行）

scheduler.flush();
console.log(count);             // 2
console.log(scheduler.pending); // 0
```

---

## ReactiveStore

基于 Proxy 的响应式状态管理，支持深层嵌套对象的自动依赖追踪、延迟计算属性和批量更新。

### 构造函数

```javascript
const store = new ReactiveStore(initialState, options?);
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `initialState` | `object` | 初始状态对象，将被 Proxy 代理 |
| `options.scheduler` | `Scheduler` | 可选，注入自定义调度器实例 |

### 状态结构规范

```
ReactiveStore
  ├── scroll        { x, y }              滚动偏移
  ├── frozen        { rows, cols }         冻结行列数
  ├── frozenOffset  { colsWidth, rowsHeight }  冻结偏移（computed）
  ├── selection     { ranges, activeRange, merges }  选区
  ├── editor        { visible, row, col, value }  浮动编辑器
  ├── viewport      { width, height }     视口尺寸
  └── tile          { size, cacheMax }     Tile 参数
```

---

## API

### state

响应式状态代理，直接读写即触发依赖追踪和变更通知。

```javascript
// 读取
store.state.scroll.x        // → 0

// 写入（自动触发 watcher）
store.state.scroll.x = 100

// 深层嵌套同样响应式
store.state.nested.deep.value = 42
```

### watch(path, fn)

监听指定路径的状态变化，返回取消函数。

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | `string` | 监听路径，支持点号分隔的深层路径 |
| `fn` | `(newValue, oldValue) => void` | 变化回调 |
| 返回 | `() => void` | 取消监听函数 |

**调度行为**：用户 `watch` 注册的回调通过 Scheduler 异步调度（`sync: false`），不会同步执行。

```javascript
const unwatch = store.watch('scroll', (newVal, oldVal) => {
    console.log('scroll changed:', newVal);
});

store.state.scroll.x = 100;
// 此时回调尚未执行（异步调度）

store.flush();
// 回调执行

unwatch(); // 取消监听
```

### computed(path, getter)

注册延迟计算属性。依赖变化时仅标记 dirty，读取时才重算。

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | `string` | 计算属性路径 |
| `getter` | `(state) => any` | 计算函数，通过读取 `state` 自动追踪依赖 |
| 返回 | `() => void` | 取消计算属性函数 |

**Lazy 机制**：

```
依赖变化 → 标记 dirty → 通知下游 watcher（同步）→ 结束
              │
              └── 读取时 → 发现 dirty → 重算 → 缓存 → 返回
```

```javascript
store.computed('frozenOffset', (state) => ({
    colsWidth: state.frozen.cols > 0 ? calcColsWidth(state.frozen.cols) : 0,
    rowsHeight: state.frozen.rows > 0 ? calcRowsHeight(state.frozen.rows) : 0
}));

store.computed('hasFrozen', (state) => {
    return state.frozen.rows > 0 || state.frozen.cols > 0;
});

// 依赖变化后不会立即重算
store.state.frozen.rows = 3;
// frozenOffset getter 尚未执行

// 读取时才重算
console.log(store.state.frozenOffset.rowsHeight); // 此刻重算
```

### batch(fn)

批量更新，在回调内的所有状态修改合并为一次触发。

| 参数 | 类型 | 说明 |
|------|------|------|
| `fn` | `() => void` | 批量操作函数 |

```javascript
store.batch(() => {
    store.state.scroll.x = 200;
    store.state.scroll.y = 300;
    store.state.frozen.rows = 2;
    store.state.frozen.cols = 1;
});
store.flush();
// 所有 watcher 只在 flush 后统一触发
```

### flush()

同步执行 Scheduler 队列中所有待执行的 watcher 回调。主要用于测试场景。

```javascript
store.state.scroll.x = 100;
// watcher 尚未执行

store.flush();
// watcher 已执行
```

### nextTick()

返回 Promise，在 Scheduler 队列清空后的下一帧 resolve。

```javascript
store.state.scroll.x = 100;
await store.nextTick();
// 此时 watcher 已执行
```

### getStateSnapshot()

返回当前状态的深拷贝快照（自动刷新所有 dirty 的 computed）。

```javascript
const snapshot = store.getStateSnapshot();
snapshot.scroll.x = 999;  // 不影响 store
```

### destroy()

销毁 store，取消所有 watcher、computed 和 Scheduler。

```javascript
store.destroy();
// 所有监听已清除，Scheduler 已取消
```

---

## 核心机制

### 1. Proxy 响应式代理

通过 `Proxy` 的 `get`/`set` 拦截实现深层响应式：

- **get**：自动创建嵌套对象的代理（通过 `WeakMap` 缓存），追踪依赖
- **set**：触发变更通知，支持 batch 延迟

```javascript
// Proxy get 拦截逻辑
get(obj, key) {
    // 1. 检查是否为 computed → dirty 则重算
    // 2. 嵌套对象 → WeakMap 缓存代理
    // 3. 原始值 → 追踪依赖
}

// Proxy set 拦截逻辑
set(obj, key, value) {
    // 1. 相同值跳过
    // 2. batch 中 → 收集路径
    // 3. 否则 → _trigger
}
```

### 2. WeakMap 代理缓存

使用 `WeakMap` 缓存嵌套对象的 Proxy 实例，避免污染原始对象：

```
原始对象 ──(WeakMap)──→ Proxy 实例
                         ↑
                    同一对象同一 Proxy
                    不同 Store 各自独立
```

**优势**：
- 原始对象无任何附加属性
- 多个 Store 共享同一对象不冲突
- 对象被回收时 Proxy 自动释放

### 3. 精确路径匹配

`_pathsMatch` 通过 `.` 边界精确匹配父子路径，防止前缀污染：

```javascript
_pathsMatch('frozenOffset.colsWidth', 'frozen')    // false（不同路径）
_pathsMatch('frozenOffset.colsWidth', 'frozenOffset') // true（父子关系）
_pathsMatch('scroll.x', 'scroll')                  // true（父子关系）
_pathsMatch('scrollBackup.x', 'scroll')            // false（不同路径）
```

### 4. 双通道调度

`_trigger` 将 watcher 分为同步和异步两个通道：

| 通道 | 标记 | 执行方式 | 用途 |
|------|------|----------|------|
| sync | `sync: true` | 同步立即执行 | computed 内部依赖 watcher，标记 dirty |
| async | `sync: false` | Scheduler 异步调度 | 用户 watch 回调，防止掉帧 |

### 5. Lazy Computed

计算属性采用延迟求值策略：

| 阶段 | 行为 |
|------|------|
| 创建 | 执行 getter 1 次，缓存结果，注册依赖 watcher |
| 依赖变化 | 同步标记 `dirty = true`，通知下游 computed（同步），通知用户 watcher（异步） |
| 读取 | 若 dirty → 重算并缓存；否则返回缓存值 |

**防止死循环**：computed 的依赖 watcher 仅在 `!dirty` 时标记，避免重复触发。

### 6. 去重与最新值

Scheduler 通过 `job.id` 去重，同一 watcher 一帧内只入队一次。执行时从 `state` 重新读取最新值，确保回调接收到的是最终状态而非入队时的中间值。

```
store.state.x = 1;  // watcher 入队
store.state.x = 2;  // 去重，不重复入队
store.state.x = 3;  // 去重，不重复入队

store.flush();
// watcher 执行 1 次，接收到值 3（从 state 重新读取）
```

---

## 自定义 Scheduler

通过构造函数 `options.scheduler` 注入自定义调度器，实现不同的调度策略：

### 同步调度器（测试用）

```javascript
const syncScheduler = new Scheduler();
const originalQueueJob = syncScheduler.queueJob.bind(syncScheduler);
syncScheduler.queueJob = (job) => {
    originalQueueJob(job);
    syncScheduler.flush(); // 立即执行
};

const store = new ReactiveStore({ x: 0 }, { scheduler: syncScheduler });
// watcher 现在同步执行
```

### 微任务调度器

```javascript
const microScheduler = new Scheduler();
microScheduler._scheduleFlush = () => {
    queueMicrotask(() => microScheduler.flush());
};

const store = new ReactiveStore({ x: 0 }, { scheduler: microScheduler });
```

---

## 完整示例

```javascript
import { ReactiveStore, Scheduler } from './src/state/ReactiveStore.js';

// 1. 创建 store
const store = new ReactiveStore({
    scroll: { x: 0, y: 0 },
    frozen: { rows: 0, cols: 0 },
    frozenOffset: { colsWidth: 0, rowsHeight: 0 },
    selection: { ranges: [], activeRange: null },
    editor: { visible: false, row: -1, col: -1, value: '' },
    viewport: { width: 0, height: 0 },
    tile: { size: 256, cacheMax: 512 }
});

// 2. 注册 computed
store.computed('hasFrozen', (state) => {
    return state.frozen.rows > 0 || state.frozen.cols > 0;
});

// 3. 监听状态变化
store.watch('scroll', (newVal) => {
    console.log('scroll:', newVal);
});

store.watch('hasFrozen', (newVal) => {
    console.log('hasFrozen:', newVal);
});

// 4. 修改状态
store.state.scroll.x = 100;

// 5. 批量更新
store.batch(() => {
    store.state.frozen.rows = 3;
    store.state.frozen.cols = 2;
    store.state.viewport.width = 1920;
    store.state.viewport.height = 1080;
});

// 6. 同步刷出（测试用）
store.flush();

// 7. 异步等待
await store.nextTick();

// 8. 获取快照
const snapshot = store.getStateSnapshot();

// 9. 销毁
store.destroy();
```

---

## 设计决策记录

| 问题 | 决策 | 原因 |
|------|------|------|
| Proxy 缓存 | `WeakMap` 而非 `Object.defineProperty` | 不污染原始对象，多 store 共享安全 |
| computed 求值时机 | Lazy（依赖变化标记 dirty，读取时重算） | 避免链式依赖死循环，减少不必要计算 |
| watcher 调度 | 用户 watcher 异步，computed watcher 同步 | 防止高频 scroll 掉帧，同时保证 computed dirty 及时标记 |
| 路径匹配 | `.` 边界精确匹配 | 防止 `frozenOffset` 误触发 `frozen` 的 watcher |
| 去重策略 | 按 `effect` 对象引用去重 | 同一 watcher 一帧内只执行一次，执行时取最新值 |
| Scheduler 可注入 | 构造函数 `options.scheduler` | 支持测试同步模式、微任务模式等自定义策略 |