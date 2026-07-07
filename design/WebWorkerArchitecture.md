# 🚀 Web Worker 全局引入技术方案

**版本**: v1.0  
**日期**: 2025-01-XX  
**作者**: jiangsuiting 
**状态**: ✅ 已完成设计，待实施

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [技术背景与问题分析](#2-技术背景与问题分析)
3. [全局 Web Worker 架构设计](#3-全局-web-worker-架构设计)
4. [Worker 池管理系统](#4-worker-池管理系统)
5. [各模块 Worker 化方案](#5-各模块-worker-化方案)
   - 5.1 [公式引擎 Worker](#51-公式引擎-worker-formulaworkerjs)
   - 5.2 [排序引擎 Worker](#52-排序引擎-worker-sortworkerjs)
   - 5.3 [数据验证 Worker](#53-数据验证-worker-validationworkerjs)
   - 5.4 [自动填充 Worker](#54-自动填充-worker-autofillworkerjs)
   - 5.5 [文件导出 Worker](#55-文件导出-worker-exportworkerjs)
   - 5.6 [图表引擎 Worker](#56-图表引擎-worker-chartdataextractorjs)
6. [通信协议设计](#6-通信协议设计)
7. [性能优化策略](#7-性能优化策略)
8. [错误处理与降级机制](#8-错误处理与降级机制)
9. [调试与监控体系](#9-调试与监控体系)
10. [部署与兼容性](#10-部署与兼容性)
11. [实施路线图](#11-实施路线图)
12. [总结与展望](#12-总结与展望)

---

## 1. 执行摘要

### 核心目标

将 Web Worker 技术深度集成到 Excel-like 电子表格引擎中，实现 **CPU 密集型任务的后台并行化处理**，彻底解决主线程阻塞导致的 UI 卡顿问题。

### 关键收益

| 维度 | 当前状态 | 目标状态 | 提升幅度 |
|------|----------|----------|----------|
| **公式重算** | 主线程阻塞 100-500ms | **0ms 阻塞** 🚀 | ∞ |
| **大规模排序** | 10000行 × 3列 = 80ms | **<16ms 主线程** | 5x |
| **批量验证** | 10000单元格 = 200ms | **后台异步完成** | 完全无感 |
| **文件导出** | 大文件导致 UI 冻结 | **后台生成 + 进度反馈** | UX 质的飞跃 |
| **图表渲染** | 数据提取阻塞 200ms | **Worker 并行提取** | 0ms |
| **整体 FPS** | 复杂操作时降至 20fps | **稳定 60fps** | 3x |

### 适用范围

```
✅ 推荐使用 Worker 的场景：
  - 公式依赖图计算与批量重算
  - 1000+ 行的大规模排序操作
  - 1000+ 单元格的批量数据验证
  - 1000+ 单元格的自动填充模式识别
  - 10000+ 单元格的文件导出
  - 5000+ 单元格的图表数据提取
  
⚠️ 不建议使用 Worker 的场景：
  - < 100 个单元格的小规模操作（通信开销 > 计算成本）
  - 需要 DOM 操作的任务（Worker 无法访问 DOM）
  - 需要同步返回结果的实时交互（如单元格编辑时的即时验证）
```

---

## 2. 技术背景与问题分析

### 2.1 当前性能瓶颈识别

通过对项目代码的深入分析，我们识别出以下 **CPU 密集型热点**：

#### 🔴 **P0 - 严重瓶颈（必须解决）**

| 模块 | 操作 | 数据规模 | 预估耗时 | 用户感知 |
|------|------|----------|----------|----------|
| **FormulaEngine** | 批量公式重算 | 100个依赖链 | 100-500ms | ❌ 明显卡顿 |
| **SortEngine** | 多列排序 | 10000行×3列 | 80-150ms | ❌ UI冻结 |
| **ValidationEngine** | 全表验证 | 10000单元格 | 150-300ms | ❌ 无响应 |

#### 🟡 **P1 - 中等瓶颈（应该优化）**

| 模块 | 操作 | 数据规模 | 预估耗时 | 用户感知 |
|------|------|----------|----------|----------|
| **AutoFillStrategy** | 模式识别+生成 | 1000单元格 | 30-80ms | ⚠️ 轻微延迟 |
| **ExportFilePlugin** | CSV/TSV序列化 | 50000单元格 | 50-120ms | ⚠️ 导出卡顿 |
| **ChartDataExtractor** | 数据范围提取 | 26000单元格 | 150-250ms | ⚠️ 图表加载慢 |

#### 🟢 **P2 - 可选优化（锦上添花）**

| 模块 | 操作 | 数据规模 | 预估耗时 | 用户感知 |
|------|------|----------|----------|----------|
| **ConditionalFormatManager** | 条件格式规则评估 | 5000单元格 | 20-50ms | ✅ 可接受 |
| **ChunkedCellStore** | 大块数据查询 | 10000单元格 | 10-30ms | ✅ 基本流畅 |

### 2.2 为什么选择 Web Worker？

#### **对比其他优化方案**

| 方案 | CPU利用率 | 主线程阻塞 | 实现复杂度 | 兼容性 | 推荐指数 |
|------|-----------|------------|------------|--------|----------|
| **Web Worker** ⭐ | ✅ 多核并行 | **0ms** | ⭐⭐⭐ 中等 | ✅ 所有浏览器 | ⭐⭐⭐⭐⭐ |
| requestIdleCallback | 单核 | 部分 | ⭐ 简单 | ⚠️ Safari不支持 | ⭐⭐⭐ |
| 时间分片（setTimeout(0)）| 单核 | <16ms/帧 | ⭐⭐ 简单 | ✅ 全支持 | ⭐⭐⭐⭐ |
| WASM + SIMD | 多核 | 0ms | ⭐⭐⭐⭐⭐ 复杂 | ✅ 现代浏览器 | ⭐⭐⭐ |
| GPU Compute Shader | GPU | 0ms | ⭐⭐⭐⭐⭐ 极复杂 | ⚠️ WebGL2/WebGPU | ⭐⭐ |

#### **Web Worker 的核心优势**

```javascript
// ✅ 优势1：真正的多线程并行
// 主线程：UI 渲染、事件响应
// Worker线程：CPU密集型计算
// 结果：双核机器性能翻倍！

// ✅ 优势2：零阻塞体验
// Worker中的长时间计算不会影响：
//   - 滚动流畅性
//   - 点击响应速度  
//   - 动画帧率
//   - 键盘输入延迟

// ✅ 优势3：易于调试
// Chrome DevTools 原生支持：
//   - Sources → Workers → 选择线程
//   - Performance 面板可查看各线程时间线
//   - Console 可切换日志输出源

// ✅ 优势4：成熟稳定
// 浏览器支持率 > 98%（IE10+）
// 无需 Polyfill
// 社区生态丰富（Comlink、Workerize 等）
```

### 2.3 项目现状分析

通过代码分析发现：

```javascript
// ❌ 当前问题1：FormulaEngine 重算在主线程执行
class FormulaEngine {
    onCellChanged(sheet, row, col) {
        // 这里会触发整个依赖链的重算
        // 如果有100个公式形成复杂依赖图...
        this.#recalculateDependents(cellKey);  // ⛔ 阻塞主线程！
    }
}

// ❌ 当前问题2：SortEngine 排序在主线程执行
class SortEngine {
    sortMultiple(columns, options) {
        const sortedIndices = indices.sort(comparator);  // ⛔ O(n log n) 阻塞！
        this.#batchMoveRows(sortedIndices);              // ⛔ 又是O(n)操作！
    }
}

// ❌ 当前问题3：ValidationEngine 批量验证在主线程
class ValidationEngine {
    async validateRange(rangeStr) {
        for (const cell of cells) {
            await this.validateCell(cell);  // ⛔ 串行执行，累积延迟！
        }
    }
}
```

**结论**：这些 CPU 密集型操作必须在后台线程执行！

---

## 3. 全局 Web Worker 架构设计

### 3.1 整体架构视图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        主线程（Main Thread）                          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   WorkerPoolManager (核心调度器)               │    │
│  │                                                             │    │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │    │
│  │  │ Formula   │ │ Sort      │ │ Validation│ │ Export    │   │    │
│  │  │ WorkerPool│ │ WorkerPool│ │ WorkerPool│ │ WorkerPool│   │    │
│  │  │ (2 workers)│ │ (1 worker)│ │ (2 workers)│ │ (1 worker)│   │    │
│  │  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘   │    │
│  │        │             │             │             │          │    │
│  │        └─────────────┴─────────────┴─────────────┘          │    │
│  │                           │                                  │    │
│  │                    Task Scheduler                            │    │
│  │              （优先级队列 + 负载均衡）                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│         ┌────────────────────┼────────────────────┐                 │
│         ▼                    ▼                    ▼                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐           │
│  │ FormulaEngine │   │  SortEngine  │   │ValidationEng │           │
│  │ (轻量化代理)  │   │ (轻量化代理)  │   │ (轻量化代理)  │           │
│  └──────────────┘   └──────────────┘   └──────────────┘           │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                     Web Worker 线程池                               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  Formula Worker #1                           │    │
│  │  • 公式解析 (AST 构建)                                       │    │
│  │  • 依赖图计算                                                │    │
│  │  • 批量公式求值                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  Formula Worker #2                           │    │
│  │  • 公式解析 (AST 构建)                                       │    │
│  │  • 依赖图计算                                                │    │
│  │  • 批量公式求值                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   Sort Worker                                │    │
│  │  • 多列索引构建                                              │    │
│  │  • Timsort 排序算法                                          │    │
│  │  • 行位置映射计算                                            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                Validation Worker #1                          │    │
│  │  • 规则匹配与分发                                            │    │
│  │  • 数值/文本/日期验证                                        │    │
│  │  • 唯一性检查                                                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                Validation Worker #2                          │    │
│  │  • 规则匹配与分发                                            │    │
│  │  • 正则表达式验证                                           │    │
│  │  • 自定义公式验证                                           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  Export Worker                               │    │
│  │  • 数据快照创建                                              │    │
│  │  • CSV/TSV 序列化                                           │    │
│  │  • 文件内容编码                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 核心设计原则

#### **原则1：透明代理模式**

```javascript
/**
 * 使用方式对调用者完全透明
 * 
 * ✅ 调用者无需知道是否使用了 Worker
 * ✅ API 保持不变（同步→异步转换由内部处理）
 * ✅ 错误处理统一封装
 */

// 旧代码（主线程执行）
const result = formulaEngine.recalculate(sheet);

// 新代码（Worker 后台执行，API不变！）
const result = await formulaEngine.recalculate(sheet);
// 内部自动判断：
//   if (taskSize > THRESHOLD) → 发送到 Worker
//   else → 主线程直接执行
```

#### **原则2：智能阈值决策**

```javascript
/**
 * 自动选择最优执行路径
 */
class SmartExecutor {
    async execute(taskType, data, options = {}) {
        const complexity = this.#estimateComplexity(taskType, data);
        
        // 三层策略选择
        if (complexity < SMALL_THRESHOLD) {
            return this.#executeSync(data);           // Layer 1: 同步
        } else if (complexity < LARGE_THRESHOLD) {
            return this.#executeAsyncChunked(data);   // Layer 2: 异步分帧
        } else {
            return this.#executeInWorker(data);       // Layer 3: Worker
        }
    }
    
    #estimateComplexity(taskType, data) {
        switch (taskType) {
            case 'formula-recalc':
                return data.dependents.size * data.formulaCount;
            case 'sort':
                return data.rowCount * Math.log2(data.rowCount) * data.columns.length;
            case 'validation':
                return data.cellCount * data.ruleCount;
            case 'export':
                return data.totalCells;
            default:
                return data.cellCount || 0;
        }
    }
}
```

#### **原则3：资源池化管理**

```javascript
/**
 * 统一管理所有 Worker 实例
 * 
 * 优点：
 * - 避免频繁创建/销毁开销
 * - 支持动态扩缩容
 * - 负载均衡分配任务
 * - 统一错误处理和监控
 */
class WorkerPoolManager {
    #pools = new Map();
    
    constructor() {
        // 根据硬件能力初始化 Worker 池
        const cpuCores = navigator.hardwareConcurrency || 4;
        
        this.#pools.set('formula', new WorkerPool({
            name: 'Formula',
            workerCount: Math.min(cpuCores - 1, 2),  // 保留1核给主线程
            script: FormulaWorkerScript
        }));
        
        this.#pools.set('sort', new WorkerPool({
            name: 'Sort',
            workerCount: 1,
            script: SortWorkerScript
        }));
        
        // ... 其他 Worker 池
    }
    
    getPool(type) {
        return this.#pools.get(type);
    }
    
    // 统一销毁
    destroy() {
        this.#pools.forEach(pool => pool.destroy());
    }
}
```

---

## 4. Worker 池管理系统

### 4.1 WorkerPool 基础类

```javascript
/**
 * Worker 池 - 管理同类型 Worker 的生命周期
 */
export class WorkerPool {
    /** @type {string} 池名称 */
    #name;
    
    /** @type {number} Worker数量 */
    #workerCount;
    
    /** @type {Array<Worker>} 空闲 Worker 队列 */
    #idleWorkers = [];
    
    /** @type {Array<{worker: Worker, resolve: Function, reject: Function}>} 任务队列 */
    #taskQueue = [];
    
    /** @type {Function} Worker脚本代码 */
    #workerScript;
    
    /** @type {number} 最大并发数 */
    #maxConcurrency;
    
    /**
     * @param {object} options
     * @param {string} options.name - 池名称
     * @param {number} options.workerCount - 初始Worker数量
     * @param {Function|string} options.workerScript - Worker代码或URL
     * @param {number} [options.maxConcurrency=Infinity] - 最大并发数
     */
    constructor(options) {
        this.#name = options.name;
        this.#workerCount = options.workerCount;
        this.#maxConcurrency = options.maxConcurrency ?? Infinity;
        this.#workerScript = options.workerScript;
        
        this.#initWorkers();
        
        console.log(`[WorkerPool] "${this.#name}" pool initialized with ${this.#workerCount} workers`);
    }
    
    /**
     * 初始化 Worker 实例
     */
    #initWorkers() {
        for (let i = 0; i < this.#workerCount; i++) {
            const worker = this.#createWorker();
            this.#idleWorkers.push(worker);
        }
    }
    
    /**
     * 创建单个 Worker
     */
    #createWorker() {
        let worker;
        
        if (typeof this.#workerScript === 'function') {
            // 内联 Blob Worker
            const blob = new Blob([`(${this.#workerScript.toString())()`], {
                type: 'application/javascript'
            });
            worker = new Worker(URL.createObjectURL(blob));
        } else if (typeof this.#workerScript === 'string' && this.#workerScript.startsWith('http')) {
            // 外部 URL Worker
            worker = new Worker(this.#workerScript);
        } else {
            throw new Error(`Invalid workerScript type: ${typeof this.#workerScript}`);
        }
        
        // 错误处理
        worker.onerror = (error) => {
            console.error(`[WorkerPool:${this.#name}] Worker error:`, error);
            this.#handleWorkerError(worker, error);
        };
        
        return worker;
    }
    
    /**
     * 提交任务到池中
     * 
     * @param {object} taskData - 任务数据
     * @returns {Promise<object>} 任务结果
     */
    submit(taskData) {
        return new Promise((resolve, reject) => {
            const task = { taskData, resolve, reject, timestamp: Date.now() };
            
            // 检查是否有空闲 Worker
            if (this.#idleWorkers.length > 0 && this.#getActiveCount() < this.#maxConcurrency) {
                this.#dispatchTask(task);
            } else {
                // 加入等待队列
                this.#taskQueue.push(task);
                console.log(`[WorkerPool:${this.#name}] Task queued (${this.#taskQueue.length} pending)`);
            }
        });
    }
    
    /**
     * 分发任务给空闲 Worker
     */
    #dispatchTask(task) {
        const worker = this.#idleWorkers.shift();
        
        // 设置消息处理器（一次性）
        worker.onmessage = (event) => {
            this.#onTaskComplete(worker, event.data, task);
        };
        
        // 发送任务
        worker.postMessage(task.taskData);
        
        console.log(`[WorkerPool:${this.#name}] Task dispatched to worker`);
    }
    
    /**
     * 任务完成回调
     */
    #onTaskComplete(worker, result, task) {
        // 归还 Worker 到空闲池
        this.#idleWorkers.push(worker);
        
        // 解析结果
        if (result.success) {
            task.resolve(result.data);
        } else {
            task.reject(new Error(result.error));
        }
        
        // 检查是否有等待的任务
        if (this.#taskQueue.length > 0) {
            const nextTask = this.#taskQueue.shift();
            this.#dispatchTask(nextTask);
        }
    }
    
    /**
     * Worker 错误处理
     */
    #handleWorkerError(worker, error) {
        // 从空闲列表移除
        const index = this.#idleWorkers.indexOf(worker);
        if (index > -1) {
            this.#idleWorkers.splice(index, 1);
        }
        
        // 尝试重建 Worker
        try {
            const newWorker = this.#createWorker();
            this.#idleWorkers.push(newWorker);
            console.warn(`[WorkerPool:${this.#name}] Worker recreated after error`);
        } catch (e) {
            console.error(`[WorkerPool:${this.#name}] Failed to recreate worker:`, e);
        }
    }
    
    /**
     * 获取当前活跃 Worker 数量
     */
    #getActiveCount() {
        return this.#workerCount - this.#idleWorkers.length;
    }
    
    /**
     * 获取池状态信息
     */
    getStatus() {
        return {
            name: this.#name,
            totalWorkers: this.#workerCount,
            idleWorkers: this.#idleWorkers.length,
            activeWorkers: this.#getActiveCount(),
            queuedTasks: this.#taskQueue.length
        };
    }
    
    /**
     * 销毁池（释放所有 Worker）
     */
    destroy() {
        this.#idleWorkers.forEach(worker => worker.terminate());
        this.#idleWorkers = [];
        this.#taskQueue = [];  // 拒绝所有排队任务
        
        console.log(`[WorkerPool] "${this.#name}" pool destroyed`);
    }
}
```

### 4.2 全局调度器

```javascript
/**
 * WorkerPoolManager - 全局 Worker 池管理器
 * 
 * 单例模式，统一管理所有类型的 Worker 池
 */
export class WorkerPoolManager {
    static #instance = null;
    
    /** @type {Map<string, WorkerPool>} */
    #pools = new Map();
    
    /** @type {boolean} 是否已初始化 */
    #initialized = false;
    
    private constructor() {}
    
    /**
     * 获取单例实例
     */
    static getInstance() {
        if (!WorkerPoolManager.#instance) {
            WorkerPoolManager.#instance = new WorkerPoolManager();
        }
        return WorkerPoolManager.#instance;
    }
    
    /**
     * 初始化所有 Worker 池
     * 
     * @param {object} [options={}] 配置选项
     * @param {number} [options.maxWorkers=4] - 最大总Worker数（默认为CPU核心数-1）
     */
    init(options = {}) {
        if (this.#initialized) {
            console.warn('[WorkerPoolManager] Already initialized');
            return;
        }
        
        const cpuCores = navigator.hardwareConcurrency || 4;
        const maxWorkers = options.maxWorkers || Math.max(cpuCores - 1, 2);
        
        console.log(`[WorkerPoolManager] Initializing with max ${maxWorkers} workers (CPU cores: ${cpuCores})`);
        
        // 注册各个 Worker 池
        this.#registerPool('formula', {
            workerCount: Math.min(Math.floor(maxWorkers * 0.5), 2),
            script: FormulaWorkerScript
        });
        
        this.#registerPool('sort', {
            workerCount: 1,
            script: SortWorkerScript
        });
        
        this.#registerPool('validation', {
            workerCount: Math.min(Math.floor(maxWorkers * 0.25), 2),
            script: ValidationWorkerScript
        });
        
        this.#registerPool('export', {
            workerCount: 1,
            script: ExportWorkerScript
        });
        
        this.#registerPool('autofill', {
            workerCount: 1,
            script: AutoFillWorkerScript
        });
        
        this.#registerPool('chart', {
            workerCount: 1,
            script: ChartDataExtractorScript
        });
        
        this.#initialized = true;
        console.log('[WorkerPoolManager] ✅ All pools initialized');
    }
    
    /**
     * 注册 Worker 池
     */
    #registerPool(name, config) {
        const pool = new WorkerPool({ name, ...config });
        this.#pools.set(name, pool);
    }
    
    /**
     * 获取指定类型的 Worker 池
     * 
     * @param {string} type - 池类型 ('formula'|'sort'|'validation'|...)
     * @returns {WorkerPool|null}
     */
    getPool(type) {
        return this.#pools.get(type) || null;
    }
    
    /**
     * 提交任务到指定池
     * 
     * @param {string} poolType - 池类型
     * @param {object} taskData - 任务数据
     * @returns {Promise<object>}
     */
    async submit(poolType, taskData) {
        const pool = this.getPool(poolType);
        if (!pool) {
            throw new Error(`Unknown pool type: ${poolType}`);
        }
        return pool.submit(taskData);
    }
    
    /**
     * 获取所有池的状态
     */
    getStatus() {
        const status = {};
        this.#pools.forEach((pool, name) => {
            status[name] = pool.getStatus();
        });
        return status;
    }
    
    /**
     * 销毁所有池（应用卸载时调用）
     */
    destroy() {
        this.#pools.forEach(pool => pool.destroy());
        this.#pools.clear();
        this.#initialized = false;
        console.log('[WorkerPoolManager] All pools destroyed');
    }
}

/**
 * 便捷的全局访问方法
 */
export function getWorkerPoolManager() {
    return WorkerPoolManager.getInstance();
}

export function submitToWorker(poolType, taskData) {
    return WorkerPoolManager.getInstance().submit(poolType, taskData);
}
```

---

## 5. 各模块 Worker 化方案

### 5.1 公式引擎 Worker (`FormulaWorker.js`)

#### **5.1.1 问题分析**

```javascript
/**
 * 当前 FormulaEngine 性能瓶颈：
 * 
 * 场景：修改 A1 单元格，触发 100 个公式的级联重算
 * 
 * 调用链路：
 *   FormulaEngine.onCellChanged("Sheet1!A1")
 *     → dirtyCells.add("B1", "C1", "D1", ..., "Z100")  // 100个脏单元格
 *     → for each dirtyCell:
 *         → evaluator.evaluate(ast, context)              // 每个可能需要 1-5ms
 *         → 总耗时：100-500ms ⛔
 * 
 * 依赖图拓扑排序本身也是 O(V+E) 的复杂计算
 */

// ❌ 当前实现在主线程执行
class FormulaEngine {
    #recalculateDirtyCells() {
        while (this.dirtyCells.size > 0) {
            const cellKey = this.dirtyCells.values().next().value;
            this.dirtyCells.delete(cellKey);
            
            // 这个 evaluate 可能很慢（涉及多个嵌套函数调用）
            const result = this.evaluator.evaluate(
                this.astCache.get(cellKey),
                this.buildContext(cellKey)
            );
            
            // 更新单元格值
            sheet.setCellValue(...cellKey, result);
        }
    }
}
```

#### **5.1.2 Worker 化方案**

```javascript
/**
 * FormulaWorker - 公式计算专用 Worker
 * 
 * 职责：
 * 1. 接收公式 AST 和上下文数据
 * 2. 在后台线程执行公式求值
 * 3. 返回计算结果集合
 */
function FormulaWorkerScript() {
    self.onmessage = function(event) {
        const { type, payload } = event.data;
        
        switch (type) {
            case 'RECALCULATE':
                handleRecalculate(payload);
                break;
            case 'PARSE_FORMULAS':
                handleParseFormulas(payload);
                break;
            case 'BUILD_DEPENDENCY_GRAPH':
                handleBuildDependencyGraph(payload);
                break;
            default:
                self.postMessage({
                    success: false,
                    error: `Unknown message type: ${type}`
                });
        }
    };
    
    /**
     * 批量重算公式
     */
    function handleRecalculate(payload) {
        const { dirtyCells, astCache, cellValues, dependencies } = payload;
        const results = {};
        const errors = {};
        
        console.time('[FormulaWorker] Batch recalculation');
        
        try {
            // 拓扑排序确保依赖顺序正确
            const sortedCells = topologicalSort(dirtyCells, dependencies);
            
            // 逐个计算（保证依赖顺序）
            for (const cellKey of sortedCells) {
                try {
                    const ast = astCache[cellKey];
                    if (!ast) continue;
                    
                    // 构建计算上下文（从快照读取值）
                    const context = buildEvaluationContext(cellKey, cellValues);
                    
                    // 执行公式求值
                    const value = evaluateAST(ast, context);
                    
                    results[cellKey] = value;
                } catch (error) {
                    errors[cellKey] = {
                        error: error.message,
                        stack: error.stack
                    };
                }
            }
            
            console.timeEnd('[FormulaWorker] Batch recalculation');
            
            self.postMessage({
                type: 'RECALCULATE_RESULT',
                success: true,
                data: {
                    results,
                    errors,
                    processedCount: sortedCells.length,
                    timestamp: Date.now()
                }
            });
            
        } catch (error) {
            self.postMessage({
                type: 'RECALCULATE_RESULT',
                success: false,
                error: error.message,
                stack: error.stack
            });
        }
    }
    
    /**
     * 拓扑排序（Kahn 算法）
     */
    function topologicalSort(cells, dependencies) {
        const inDegree = new Map();
        const graph = new Map();
        const queue = [];
        const result = [];
        
        // 初始化
        cells.forEach(cell => inDegree.set(cell, 0));
        
        // 构建邻接表和入度
        cells.forEach(cell => {
            const deps = dependencies[cell] || new Set();
            graph.set(cell, deps);
            deps.forEach(dep => {
                if (cells.has(dep)) {
                    inDegree.set(cell, (inDegree.get(cell) || 0) + 1);
                }
            });
        });
        
        // 入度为0的节点入队
        inDegree.forEach((degree, cell) => {
            if (degree === 0) queue.push(cell);
        });
        
        // BFS 拓扑排序
        while (queue.length > 0) {
            const current = queue.shift();
            result.push(current);
            
            graph.forEach((deps, node) => {
                if (deps.has(current)) {
                    inDegree.set(node, inDegree.get(node) - 1);
                    if (inDegree.get(node) === 0) {
                        queue.push(node);
                    }
                }
            });
        }
        
        return result;
    }
    
    /**
     * AST 求值器（简化版，实际需要完整实现）
     */
    function evaluateAST(ast, context) {
        switch (ast.type) {
            case 'NumberLiteral':
                return ast.value;
            case 'StringLiteral':
                return ast.value;
            case 'CellReference':
                return context.getCell(ast.sheet, ast.row, ast.col);
            case 'FunctionCall':
                return evaluateFunctionCall(ast, context);
            case 'BinaryExpression':
                return evaluateBinaryOp(ast, context);
            default:
                throw new Error(`Unknown AST node type: ${ast.type}`);
        }
    }
    
    // ... 其他辅助函数（省略详细实现）
}

// 导出供 WorkerPool 使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FormulaWorkerScript;
}
```

#### **5.1.3 FormulaEngine 适配层**

```javascript
/**
 * FormulaEngine - 适配 Worker 的重构版
 */
export class FormulaEngine {
    /** @type {WorkerPoolManager|null} Worker池引用 */
    #poolManager = null;
    
    /** @type {number} 触发Worker的阈值（脏单元格数）*/
    #workerThreshold = 50;
    
    constructor(workbook) {
        this.workbook = workbook;
        this.evaluator = new FormulaEvaluator(workbook);
        
        // 尝试获取 Worker 池
        try {
            this.#poolManager = getWorkerPoolManager();
        } catch (e) {
            console.warn('[FormulaEngine] Worker unavailable, fallback to main thread');
        }
    }
    
    /**
     * 触发重算（智能路由）
     */
    async recalculate(dirtyCells) {
        const cellCount = dirtyCells.size;
        
        console.log(`[FormulaEngine] Recalculating ${cellCount} dirty cells...`);
        
        // 智能决策
        if (this.#shouldUseWorker(cellCount)) {
            return await this.#recalculateInWorker(dirtyCells);
        } else {
            return this.#recalculateSync(dirtyCells);
        }
    }
    
    /**
     * 判断是否应该使用 Worker
     */
    #shouldUseWorker(cellCount) {
        return (
            this.#poolManager &&                    // Worker可用
            cellCount >= this.#workerThreshold &&   // 超过阈值
            navigator.hardwareConcurrency >= 2      // 多核CPU
        );
    }
    
    /**
     * Worker 路径：异步后台重算
     */
    async #recalculateInWorker(dirtyCells) {
        console.time('[FormulaEngine] Worker recalculation');
        
        try {
            // 准备数据快照（快速，只读操作）
            const snapshot = this.#createSnapshot(dirtyCells);
            
            // 提交到 Worker
            const result = await this.#poolManager.submit('formula', {
                type: 'RECALCULATE',
                payload: {
                    dirtyCells: Array.from(dirtyCells),
                    astCache: Object.fromEntries(this.astCache),
                    cellValues: snapshot.cellValues,
                    dependencies: Object.fromEntries(this.dependents)
                }
            });
            
            // 应用结果回主线程
            this.#applyResults(result.results, result.errors);
            
            console.timeEnd('[FormulaEngine] Worker recalculation');
            
            return {
                source: 'worker',
                processedCount: result.processedCount,
                errorCount: Object.keys(result.errors).length
            };
            
        } catch (error) {
            console.error('[FormulaEngine] Worker failed, fallback:', error);
            // 降级到同步路径
            return this.#recalculateSync(dirtyCells);
        }
    }
    
    /**
     * 同步路径：主线程直接执行（小规模数据）
     */
    #recalculateSync(dirtyCells) {
        console.time('[FormulaEngine] Sync recalculation');
        
        // 原有的同步逻辑保持不变
        // ...
        
        console.timeEnd('[FormulaEngine] Sync recalculation');
        
        return { source: 'sync', processedCount: dirtyCells.size };
    }
    
    /**
     * 创建数据快照（线程安全）
     */
    #createSnapshot(dirtyCells) {
        const cellValues = {};
        
        dirtyCells.forEach(cellKey => {
            const [sheetName, row, col] = this.#parseCellKey(cellKey);
            const sheet = this.workbook.getSheet(sheetName);
            if (sheet) {
                cellValues[cellKey] = sheet.getCell(row, col)?.value;
            }
        });
        
        return { cellValues };
    }
    
    /**
     * 应用 Worker 计算结果
     */
    #applyResults(results, errors) {
        // 更新成功的单元格
        Object.entries(results).forEach(([cellKey, value]) => {
            const [sheetName, row, col] = this.#parseCellKey(cellKey);
            const sheet = this.workbook.getSheet(sheetName);
            if (sheet) {
                sheet.setCellValue(row, col, value, { silent: true });  // 静默更新避免循环
            }
        });
        
        // 处理错误的单元格
        Object.entries(errors).forEach(([cellKey, error]) => {
            console.error(`[FormulaEngine] Error in ${cellKey}:`, error.error);
            // 可以设置错误标记或显示 #ERROR!
        });
    }
    
    // ... 其他原有方法保持不变
}
```

#### **5.1.4 性能预期**

| 场景 | 主线程耗时 | Worker耗时 | 提升 |
|------|------------|------------|------|
| 10个公式重算 | 15ms | 20ms (+5ms通信) | ❌ 略慢（不应使用Worker）|
| 50个公式重算 | 75ms | 45ms | ✅ 40%提升 |
| 100个公式重算 | 150ms | 65ms | ✅ 57%提升 |
| 500个公式重算 | 750ms | 180ms | ✅ **76%提升** |
| 1000个公式重算 | 1500ms | 320ms | ✅ **79%提升** |

---

### 5.2 排序引擎 Worker (`SortWorker.js`)

#### **5.2.1 问题分析**

```javascript
/**
 * SortEngine 当前瓶颈：
 * 
 * 场景：10000行 × 3列多列排序
 * 
 * 耗时分拆：
 *   1. 数据收集：~10ms（读取单元格值）
 *   2. Map索引构建：~15ms
 *   3. Timsort排序：~40ms（O(n log n)）
 *   4. 位置映射计算：~10ms
 *   5. batchMoveRows：~5ms
 *   总计：~80ms（对于60fps来说太长！）
 */

class SortEngine {
    sortMultiple(columns, options) {
        const startTime = performance.now();
        
        // 步骤1-4都在主线程执行，阻塞UI
        const columnData = this.#collectColumnData(columns, fixedRows, hiddenRows);
        const rowMap = this.#buildRowIndexMap(columnData);
        const sortedIndices = rowMap.keys.sort(multiComparator);  // ⛔ 最耗时的部分
        const positionMapping = this.#calculatePositionMapping(sortedIndices);
        
        // 步骤5：批量移动（这个必须在主线程，因为要操作DOM/Canvas）
        const swapped = this.#batchMoveRows(positionMapping);
        
        const elapsed = performance.now() - startTime;
        console.log(`[SortEngine] Sorted in ${elapsed.toFixed(2)}ms`);
        
        return { swapped, time: elapsed };
    }
}
```

#### **5.2.2 Worker 化方案**

```javascript
/**
 * SortWorker - 排序计算专用 Worker
 * 
 * 职责：
 * 1. 接收原始数据和排序列配置
 * 2. 在后台执行排序算法
 * 3. 返回排序后的位置映射表
 */
function SortWorkerScript() {
    self.onmessage = function(event) {
        const { type, payload } = event.data;
        
        if (type === 'SORT_ROWS') {
            handleSortRows(payload);
        } else {
            self.postMessage({ success: false, error: `Unknown type: ${type}` });
        }
    };
    
    function handleSortRows(payload) {
        const {
            rowData,          // 扁平化的行数据 [{row: 0, values: [val1, val2, val3]}, ...]
            columns,          // 排序列配置 [{col: 0, order: 'asc'}, ...]
            fixedRows,        // 冻结行数
            hiddenRows        // 隐藏行数组
        } = payload;
        
        console.time('[SortWorker] Sorting rows');
        
        try {
            // 过滤掉固定行和隐藏行
            const sortableRows = rowData.filter(row => 
                row.row >= fixedRows && !hiddenRows.includes(row.row)
            );
            
            // 构建比较器函数
            const comparator = buildMultiColumnComparator(columns);
            
            // 执行排序（V8 Timsort，O(n log n)）
            sortableRows.sort(comparator);
            
            // 生成位置映射：旧位置 → 新位置
            const positionMapping = new Map();
            sortableRows.forEach((row, newIndex) => {
                positionMapping.set(row.originalIndex, newIndex + fixedRows);
            });
            
            // 固定行保持在原位
            for (let i = 0; i < fixedRows; i++) {
                positionMapping.set(i, i);
            }
            
            console.timeEnd('[SortWorker] Sorting rows');
            
            self.postMessage({
                type: 'SORT_RESULT',
                success: true,
                data: {
                    positionMapping: Array.from(positionMapping.entries()),
                    totalRows: rowData.length,
                    sortedRows: sortableRows.length,
                    fixedRows,
                    timestamp: Date.now()
                }
            });
            
        } catch (error) {
            self.postMessage({
                type: 'SORT_RESULT',
                success: false,
                error: error.message,
                stack: error.stack
            });
        }
    }
    
    /**
     * 构建多列比较器
     */
    function buildMultiColumnComparator(columns) {
        return (a, b) => {
            for (const {col, order, comparator, caseSensitive} of columns) {
                const valA = a.values[col];
                const valB = b.values[col];
                
                let cmpResult;
                
                if (comparator) {
                    // 自定义比较函数
                    cmpResult = comparator(valA, valB);
                } else {
                    // 默认类型感知比较
                    cmpResult = compareValues(valA, valB, caseSensitive);
                }
                
                if (cmpResult !== 0) {
                    return order === 'desc' ? -cmpResult : cmpResult;
                }
            }
            
            return 0;  // 完全相等
        };
    }
    
    /**
     * 类型感知比较（与主线程逻辑一致）
     */
    function compareValues(a, b, caseSensitive) {
        // null/undefined 排最后
        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        
        // 类型优先级：boolean < number < date < string
        const typeOrder = { boolean: 0, number: 1, date: 2, string: 3 };
        const typeA = typeof a === 'boolean' ? 'boolean' : 
                      (typeof a === 'number' ? 'number' :
                       (a instanceof Date ? 'date' : 'string'));
        const typeB = typeof b === 'boolean' ? 'boolean' : 
                      (typeof b === 'number' ? 'number' :
                       (b instanceof Date ? 'date' : 'string'));
        
        if (typeA !== typeB) {
            return (typeOrder[typeA] || 99) - (typeOrder[typeB] || 99);
        }
        
        // 同类型比较
        if (typeA === 'string') {
            const strA = caseSensitive ? a : a.toLowerCase();
            const strB = caseSensitive ? b : b.toLowerCase();
            return strA.localeCompare(strB);
        }
        
        if (typeA === 'date') {
            return a.getTime() - b.getTime();
        }
        
        // number 或 boolean 直接相减
        return a - b;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SortWorkerScript;
}
```

#### **5.2.3 SortEngine 适配层**

```javascript
/**
 * SortEngine - 适配 Worker 版本
 */
export class SortEngine {
    #poolManager = null;
    #workerThreshold = 1000;  // 超过1000行使用Worker
    
    constructor(cellStore, sortState, rowCount) {
        this.#cellStore = cellStore;
        this.#sortState = sortState;
        this.#rowCount = rowCount;
        
        try {
            this.#poolManager = getWorkerPoolManager();
        } catch (e) {
            console.warn('[SortEngine] Worker unavailable');
        }
    }
    
    async sortMultiple(columns, options = {}) {
        const { fixedRows = 0, hiddenRows = [] } = options;
        const sortableRowCount = this.#rowCount - fixedRows - hiddenRows.length;
        
        console.log(`[SortEngine] Sorting ${sortableRowCount} rows...`);
        
        if (this.#shouldUseWorker(sortableRowCount)) {
            return await this.#sortInWorker(columns, options);
        } else {
            return this.#sortSync(columns, options);
        }
    }
    
    async #sortInWorker(columns, options) {
        console.time('[SortEngine] Total sort (Worker)');
        
        try {
            // Step 1: 快速数据收集（主线程，只读）
            const rowData = this.#collectRowData(columns, options);
            
            // Step 2: 发送到 Worker 排序
            const result = await this.#poolManager.submit('sort', {
                type: 'SORT_ROWS',
                payload: {
                    rowData,
                    columns: columns.map(col => ({
                        col: col.col,
                        order: col.order,
                        caseSensitive: col.caseSensitive
                        // 注意：自定义 comparator 无法传递给 Worker
                    })),
                    fixedRows: options.fixedRows || 0,
                    hiddenRows: options.hiddenRows || []
                }
            });
            
            // Step 3: 应用排序结果（必须在主线程）
            const swapped = this.#applyPositionMapping(result.positionMapping);
            
            console.timeEnd('[SortEngine] Total sort (Worker)');
            
            return {
                swapped,
                time: performance.now() - result.timestamp,
                source: 'worker'
            };
            
        } catch (error) {
            console.error('[SortEngine] Worker sort failed:', error);
            return this.#sortSync(columns, options);
        }
    }
    
    #collectRowData(columns, options) {
        const { fixedRows = 0, hiddenRows = [] } = options;
        const rowData = [];
        
        for (let row = 0; row < this.#rowCount; row++) {
            if (hiddenRows.includes(row)) continue;
            
            const values = columns.map(col => 
                this.#cellStore.getCell(row, col.col)?.value
            );
            
            rowData.push({
                row,
                originalIndex: row,
                values
            });
        }
        
        return rowData;
    }
    
    #applyPositionMapping(mappingArray) {
        // 将数组转换为 Map
        const mapping = new Map(mappingArray);
        
        // 调用原有的 batchMoveRows 方法
        return this.#batchMoveRows(mapping);
    }
    
    // #sortSync 保持原有实现不变...
}
```

---

### 5.3 数据验证 Worker (`ValidationWorker.js`)

#### **5.3.1 问题分析**

```javascript
/**
 * ValidationEngine 当前瓶颈：
 * 
 * 场景：全表验证（10000单元格 × 5条规则）
 * 
 * 耗时分拆：
 *   - 规则匹配：每个单元格检查适用哪条规则 ~20ms
 *   - 验证执行：数值/文本/正则等验证 ~100ms
 *   - 唯一性检查：跨范围比对 ~50ms
 *   - 结果汇总：~10ms
 *   总计：~180ms
 */
```

#### **5.3.2 Worker 化方案**

```javascript
function ValidationWorkerScript() {
    // 内置验证器逻辑（纯函数，无副作用）
    const validators = {
        number: validateNumber,
        text: validateTextLength,
        list: validateList,
        unique: validateUnique,
        regex: validateRegex,
        date: validateDate,
        custom: validateCustom
    };
    
    self.onmessage = function(event) {
        const { type, payload } = event.data;
        
        if (type === 'VALIDATE_RANGE') {
            handleValidateRange(payload);
        } else if (type === 'VALIDATE_CELL') {
            handleValidateCell(payload);
        } else {
            self.postMessage({ success: false, error: `Unknown type: ${type}` });
        }
    };
    
    function handleValidateRange(payload) {
        const { cells, rules, options } = payload;
        const results = new Map();
        let validCount = 0;
        let invalidCount = 0;
        
        console.time(`[ValidationWorker] Validating ${cells.length} cells`);
        
        try {
            for (const cell of cells) {
                const { row, col, value } = cell;
                const cellKey = `${row},${col}`;
                const cellResults = [];
                
                for (const rule of rules) {
                    // 检查单元格是否在规则的范围内
                    if (!isInRange(row, col, rule.range)) continue;
                    
                    // 执行对应类型的验证
                    const validatorFn = validators[rule.type];
                    if (!validatorFn) continue;
                    
                    const result = validatorFn(value, rule.params, cells);
                    cellResults.push({
                        ruleId: rule.id,
                        valid: result.valid,
                        errorMessage: result.errorMessage || null
                    });
                    
                    if (!result.valid) invalidCount++;
                    else validCount++;
                }
                
                results.set(cellKey, cellResults);
            }
            
            console.timeEnd(`[ValidationWorker] Validating ${cells.length} cells`);
            
            self.postMessage({
                type: 'VALIDATION_RESULT',
                success: true,
                data: {
                    results: Array.from(results.entries()),
                    summary: {
                        total: cells.length,
                        valid: validCount,
                        invalid: invalidCount
                    },
                    timestamp: Date.now()
                }
            });
            
        } catch (error) {
            self.postMessage({
                type: 'VALIDATION_RESULT',
                success: false,
                error: error.message,
                stack: error.stack
            });
        }
    }
    
    // 验证器函数实现（纯计算逻辑）
    function validateNumber(value, params) {
        const num = Number(value);
        if (isNaN(num)) return { valid: false, errorMessage: '不是有效数字' };
        
        if (params.min !== undefined && num < params.min) {
            return { valid: false, errorMessage: `不能小于 ${params.min}` };
        }
        if (params.max !== undefined && num > params.max) {
            return { valid: false, errorMessage: `不能大于 ${params.max}` };
        }
        
        return { valid: true };
    }
    
    function validateTextLength(value, params) {
        const str = String(value || '');
        const len = str.length;
        
        if (params.minLength !== undefined && len < params.minLength) {
            return { valid: false, errorMessage: `长度不能小于 ${params.minLength}` };
        }
        if (params.maxLength !== undefined && len > params.maxLength) {
            return { valid: false, errorMessage: `长度不能大于 ${params.maxLength}` };
        }
        
        return { valid: true };
    }
    
    function validateUnique(value, params, allCells) {
        const duplicates = allCells.filter(c => c.value === value);
        if (duplicates.length > 1) {
            return { valid: false, errorMessage: `'${value}' 重复出现` };
        }
        return { valid: true };
    }
    
    function validateRegex(value, params) {
        const regex = new RegExp(params.pattern);
        if (!regex.test(String(value))) {
            return { valid: false, errorMessage: params.errorMessage || '格式不正确' };
        }
        return { valid: true };
    }
    
    // ... 其他验证器省略
    
    function isInRange(row, col, range) {
        // 简化的范围检查逻辑
        return true;  // 实际需要根据 range 格式解析
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ValidationWorkerScript;
}
```

#### **5.3.3 ValidationEngine 适配层**

```javascript
export class ValidationEngine {
    #poolManager = null;
    #threshold = 500;  // 超过500个单元格使用Worker
    
    constructor(cellStore) {
        this.#cellStore = cellStore;
        
        try {
            this.#poolManager = getWorkerPoolManager();
        } catch (e) {
            console.warn('[ValidationEngine] Worker unavailable');
        }
    }
    
    async validateRange(rangeStr) {
        const cells = this.#parseRange(rangeStr);
        
        if (cells.length < this.#threshold || !this.#poolManager) {
            return this.#validateSync(cells);
        }
        
        return this.#validateInWorker(cells);
    }
    
    async #validateInWorker(cells) {
        const rules = Array.from(this.#rules.values());
        const cellData = cells.map(({row, col}) => ({
            row, col,
            value: this.#cellStore.getCell(row, col)?.value
        }));
        
        const result = await this.#poolManager.submit('validation', {
            type: 'VALIDATE_RANGE',
            payload: {
                cells: cellData,
                rules: rules.map(r => ({
                    id: r.id,
                    type: r.type,
                    range: r.range,
                    params: r.params
                }))
            }
        });
        
        // 缓存结果
        result.results.forEach(([key, cellResults]) => {
            this.#cache.set(key, cellResults);
        });
        
        return {
            summary: result.summary,
            details: result.results,
            source: 'worker'
        };
    }
}
```

---

### 5.4 自动填充 Worker (`AutoFillWorker.js`)

#### **5.4.1 Worker 实现**

```javascript
function AutoFillWorkerScript() {
    self.onmessage = function(event) {
        const { type, payload } = event.data;
        
        if (type === 'DETECT_PATTERN') {
            handleDetectPattern(payload);
        } else if (type === 'GENERATE_DATA') {
            handleGenerateData(payload);
        }
    };
    
    function handleDetectPattern(payload) {
        const { sourceData } = payload;  // [{value, type}, ...]
        
        console.time('[AutoFillWorker] Pattern detection');
        
        // 分析数据模式
        const pattern = detectPattern(sourceData);
        
        console.timeEnd('[AutoFillWorker] Pattern detection');
        
        self.postMessage({
            type: 'PATTERN_DETECTED',
            success: true,
            data: pattern
        });
    }
    
    function handleGenerateData(payload) {
        const { pattern, count } = payload;
        const generatedData = [];
        
        console.time('[AutoFillWorker] Data generation');
        
        // 根据模式生成数据
        for (let i = 0; i < count; i++) {
            generatedData.push(generateValue(pattern, i));
        }
        
        console.timeEnd('[AutoFillWorker] Data generation');
        
        self.postMessage({
            type: 'DATA_GENERATED',
            success: true,
            data: generatedData
        });
    }
    
    function detectPattern(data) {
        if (data.length < 2) return { type: 'copy' };
        
        // 检测数值递增模式
        const numericDiff = data[1].value - data[0].value;
        const isArithmetic = data.every((item, i) => 
            i === 0 || (item.value - data[i-1].value) === numericDiff
        );
        
        if (isArithmetic && !isNaN(numericDiff)) {
            return {
                type: 'arithmetic',
                startValue: data[0].value,
                step: numericDiff
            };
        }
        
        // 检测日期递增模式
        if (data.every(item => item.value instanceof Date)) {
            const dateDiff = data[1].value - data[0].value;
            return {
                type: 'date-arithmetic',
                startValue: data[0].value.getTime(),
                step: dateDiff
            };
        }
        
        // 默认：复制模式
        return { type: 'copy', values: data.map(d => d.value) };
    }
    
    function generateValue(pattern, index) {
        switch (pattern.type) {
            case 'arithmetic':
                return pattern.startValue + pattern.step * (index + 1);
            case 'date-arithmetic':
                return new Date(pattern.startValue + pattern.step * (index + 1));
            case 'copy':
                return pattern.values[index % pattern.values.length];
            default:
                return null;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AutoFillWorkerScript;
}
```

---

### 5.5 文件导出 Worker (`ExportWorker.js`)

#### **5.5.1 Worker 实现**

```javascript
function ExportWorkerScript() {
    self.onmessage = function(event) {
        const { type, payload } = event.data;
        
        if (type === 'EXPORT_CSV') {
            handleExportCSV(payload);
        } else if (type === 'EXPORT_TSV') {
            handleExportTSV(payload);
        }
    };
    
    function handleExportCSV(payload) {
        const { cells, options } = payload;
        const { separator = ',', bom = true, columnHeaders = true, rowHeaders = true } = options;
        
        console.time('[ExportWorker] CSV generation');
        
        let content = '';
        
        // BOM头（Excel中文不乱码）
        if (bom) content += '\uFEFF';
        
        // 表头行
        if (columnHeaders && payload.headers) {
            content += payload.headers.map(h => escapeField(h, separator)).join(separator) + '\n';
        }
        
        // 数据行
        for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
            const row = cells[rowIndex];
            const rowData = [];
            
            if (rowHeaders && row.header) {
                rowData.push(escapeField(row.header, separator));
            }
            
            for (let colIndex = 0; colIndex < row.values.length; colIndex++) {
                rowData.push(escapeField(row.values[colIndex], separator));
            }
            
            content += rowData.join(separator) + '\n';
            
            // 定期报告进度（每1000行）
            if ((rowIndex + 1) % 1000 === 0) {
                self.postMessage({
                    type: 'EXPORT_PROGRESS',
                    progress: (rowIndex + 1) / cells.length
                });
            }
        }
        
        console.timeEnd('[ExportWorker] CSV generation');
        
        self.postMessage({
            type: 'EXPORT_COMPLETE',
            success: true,
            data: {
                content,
                size: new Blob([content]).size,
                rowCount: cells.length,
                timestamp: Date.now()
            }
        });
    }
    
    function escapeField(value, separator) {
        const str = value == null ? '' : String(value);
        if (str.includes(separator) || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExportWorkerScript;
}
```

#### **5.5.2 ExportFilePlugin 适配**

```javascript
export class ExportFilePlugin extends BasePlugin {
    async exportAsString(format, userOptions = {}) {
        const options = buildOptions(format, userOptions);
        resolveHeaderDefaults(this.sheet, options);
        
        // 收集数据
        const { cells, headers } = this.#collectData(options);
        
        if (cells.length > 1000 && this.#poolManager) {
            // 大数据量：使用 Worker
            const result = await this.#poolManager.submit('export', {
                type: format.toUpperCase() === 'CSV' ? 'EXPORT_CSV' : 'EXPORT_TSV',
                payload: { cells, headers, options }
            });
            
            return result.content;
        } else {
            // 小数据量：主线程直接生成
            return this.#generateSync(format, cells, headers, options);
        }
    }
}
```

---

### 5.6 图表引擎 Worker (`ChartDataExtractor.js`)

> **注意**：此部分已在 ChartEngine.md 中详细设计，此处为简要说明。

```javascript
/**
 * ChartDataExtractor - 图表数据提取 Worker
 * 
 * 详细实现见：design/ChartEngine.md 第4.2节
 * 
 * 核心功能：
 * - 三层数据提取策略（同步/异步分帧/Worker）
 * - 数据快照创建（线程安全）
 * - 隐藏行列过滤
 * - 性能监控和日志
 */
function ChartDataExtractorScript() {
    // 完整实现见 ChartEngine.md
    // 此处省略重复代码...
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChartDataExtractorScript;
}
```

---

## 6. 通信协议设计

### 6.1 统一消息格式

```javascript
/**
 * 主线程 → Worker 消息格式
 */
const MainToWorkerMessage = {
    id: 'uuid-v4',                    // 消息唯一ID（用于追踪）
    type: 'TASK_TYPE',                // 任务类型
    payload: {                        // 任务数据（纯JSON对象）
        // 具体字段根据任务类型不同而变化
    },
    priority: 'normal',               // 'low'|'normal'|'high'|'urgent'
    timeout: 30000,                   // 超时时间（毫秒），0=无限
    metadata: {
        createdAt: Date.now(),
        source: 'FormulaEngine',      // 来源模块
        traceId: 'span-id'            // 分布式追踪ID
    }
};

/**
 * Worker → 主线程消息格式
 */
const WorkerToMainMessage = {
    id: 'uuid-v4',                    // 对应请求的消息ID
    type: 'RESULT_TYPE',              // 结果类型
    success: true/false,              // 是否成功
    data: {},                         // 成功时的结果数据
    error: null,                      // 失败时的错误信息
    stack: null,                      // 错误堆栈
    performance: {                    // 性能指标
        workerTime: 145.32,           // Worker内部耗时(ms)
        totalTime: 152.87,            // 包含通信的总耗时(ms)
        memoryUsage: 12582912         // 内存占用(bytes)
    },
    timestamp: Date.now()
};
```

### 6.2 任务类型枚举

```javascript
const TASK_TYPES = {
    // 公式引擎
    FORMULA_RECALCULATE: 'RECALCULATE',
    FORMULA_PARSE: 'PARSE_FORMULAS',
    FORMULA_BUILD_DEPS: 'BUILD_DEPENDENCY_GRAPH',
    
    // 排序引擎
    SORT_ROWS: 'SORT_ROWS',
    SORT_INDEX_BUILD: 'SORT_INDEX_BUILD',
    
    // 数据验证
    VALIDATE_RANGE: 'VALIDATE_RANGE',
    VALIDATE_CELL: 'VALIDATE_CELL',
    VALIDATE_BATCH: 'VALIDATE_BATCH',
    
    // 自动填充
    AUTOFILL_DETECT_PATTERN: 'DETECT_PATTERN',
    AUTOFILL_GENERATE_DATA: 'GENERATE_DATA',
    
    // 文件导出
    EXPORT_CSV: 'EXPORT_CSV',
    EXPORT_TSV: 'EXPORT_TSV',
    EXPORT_JSON: 'EXPORT_JSON',
    
    // 图表数据
    CHART_EXTRACT_DATA: 'EXTRACT_DATA',
    CHART_CREATE_SNAPSHOT: 'CREATE_SNAPSHOT'
};

const RESULT_TYPES = {
    SUCCESS: 'SUCCESS',
    ERROR: 'ERROR',
    PROGRESS: 'PROGRESS',            // 进度更新（用于长任务）
    CANCELLED: 'CANCELLED',          // 任务被取消
    TIMEOUT: 'TIMEOUT'               // 超时
};
```

### 6.3 通信示例

```javascript
// ===== 主线程发送任务 =====
const taskId = generateUUID();

worker.postMessage({
    id: taskId,
    type: TASK_TYPES.FORMULA_RECALCULATE,
    payload: {
        dirtyCells: ['A1', 'B1', 'C1'],
        astCache: { /* ... */ },
        cellValues: { /* ... */ }
    },
    priority: 'high',
    timeout: 10000,
    metadata: {
        source: 'FormulaEngine',
        traceId: getCurrentTraceId()
    }
});

// ===== Worker 处理并返回 =====
self.onmessage = function(event) {
    const msg = event.data;
    
    if (msg.type === RESULT_TYPES.SUCCESS) {
        console.log(`✅ Task ${msg.id} completed in ${msg.performance.totalTime}ms`);
        applyResults(msg.data);
    } else if (msg.type === RESULT_TYPES.ERROR) {
        console.error(`❌ Task ${msg.id} failed:`, msg.error);
    } else if (msg.type === RESULT_TYPES.PROGRESS) {
        updateProgressBar(msg.data.progress);
    }
};
```

---

## 7. 性能优化策略

### 7.1 Transferable Objects（零拷贝传输）

```javascript
/**
 * 对于大型数据（如 ArrayBuffer），使用 Transferable 避免复制
 * 
 * 性能对比：
 *   - 结构化克隆：10MB 数据 ≈ 50ms
 *   - Transferable：10MB 数据 ≈ 1ms（快50倍！）
 */

// 主线程
const largeBuffer = new ArrayBuffer(1024 * 1024 * 10);  // 10MB

worker.postMessage(
    { type: 'PROCESS_LARGE_DATA', buffer: largeBuffer },
    [largeBuffer]  // Transferable list：所有权转移给Worker
);

// 注意：转移后，主线程的 largeBuffer 变成空（length=0）

// Worker 接收后拥有所有权
self.onmessage = function(event) {
    const buffer = event.data.buffer;  // 现在属于 Worker
    
    // 处理完成后可以传回主线程
    self.postMessage(
        { type: 'RESULT', result: processedBuffer },
        [processedBuffer]  // 所有权转回主线程
    );
};
```

### 7.2 SharedArrayBuffer（共享内存）

```javascript
/**
 * 高级优化：主线程和 Worker 共享同一块内存
 * 
 * 前提条件：
 * - 需要特殊的 CORS 头（Cross-Origin-Isolation）
 * - 适用于高频读写共享数据的场景
 * 
 * ⚠️ 需要小心处理竞态条件（Atomics API）
 */

// 主线程
const sharedBuffer = new SharedArrayBuffer(1024);
const sharedView = new Int32Array(sharedBuffer);

const worker = new Worker('worker.js');
worker.postMessage({ sharedBuffer }, [sharedBuffer]);

// 写入数据
Atomics.store(sharedView, 0, 42);

// Worker 可以立即看到（无需 postMessage）
```

### 7.3 OffscreenCanvas（离屏渲染）

```javascript
/**
 * 未来优化：在 Worker 中直接渲染 Canvas
 * 
 * 适用场景：
 * - 图表渲染（完全离屏）
 * - 复杂图形绘制
 * - 图片处理
 */

// 主线程
const offscreen = canvas.transferControlToOffscreen();
worker.postMessage({ canvas: offscreen }, [offscreen]);

// Worker 中可以直接绑定 Canvas 2D/WebGL 上下文
self.onmessage = function(event) {
    const canvas = event.data.canvas;
    const ctx = canvas.getContext('2d');
    
    // 在 Worker 中绘制！
    ctx.fillStyle = 'red';
    ctx.fillRect(0, 0, 100, 100);
    
    // 自动同步到主线程的 Canvas
};
```

### 7.4 数据压缩传输

```javascript
/**
 * 对于超大数据（>5MB），先压缩再传输
 */

async function sendCompressedData(worker, data) {
    const json = JSON.stringify(data);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(json);
    
    // 使用 CompressionStream API（Chrome 80+）
    if (window.CompressionStream) {
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(bytes);
        writer.close();
        
        const compressed = await new Response(cs.readable).arrayBuffer();
        
        console.log(`压缩率: ${(compressed.byteLength / bytes.length * 100).toFixed(1)}%`);
        
        worker.postMessage({
            type: 'COMPRESSED_DATA',
            data: compressed,
            originalSize: bytes.length
        }, [compressed]);
    } else {
        // 降级：未压缩传输
        worker.postMessage({ type: 'DATA', data });
    }
}

// Worker 端解压
self.onmessage = async function(event) {
    if (event.data.type === 'COMPRESSED_DATA') {
        const ds = new DecompressionStream('gzip');
        const reader = ds.readable.getReader();
        const writer = ds.writable.getWriter();
        writer.write(new Uint8Array(event.data.data));
        writer.close();
        
        const decompressed = await readAllChunks(reader);
        const decoder = new TextDecoder();
        const json = decoder.decode(decompressed);
        const data = JSON.parse(json);
        
        processData(data);
    }
};
```

---

## 8. 错误处理与降级机制

### 8.1 分层降级策略

```javascript
/**
 * 三层降级保障系统
 * 
 * Level 1: Web Worker（最优）
 * Level 2: 异步分帧（次优）
 * Level 3: 同步执行（保底）
 */

class ResilientExecutor {
    async executeWithFallback(task, data) {
        const strategies = [
            { name: 'worker', fn: () => this.executeInWorker(task, data) },
            { name: 'async-chunked', fn: () => this.executeAsyncChunked(task, data) },
            { name: 'sync', fn: () => this.executeSync(task, data) }
        ];
        
        let lastError = null;
        
        for (const strategy of strategies) {
            try {
                console.log(`[ResilientExecutor] Trying strategy: ${strategy.name}`);
                const result = await strategy.fn();
                console.log(`[ResilientExecutor] ✅ Success with: ${strategy.name}`);
                return { ...result, strategy: strategy.name };
            } catch (error) {
                lastError = error;
                console.warn(`[ResilientExecutor] ❌ Failed: ${strategy.name}`, error.message);
                
                // 如果是致命错误（如数据损坏），不再尝试其他策略
                if (this.isFatalError(error)) throw error;
            }
        }
        
        // 所有策略都失败
        throw lastError;
    }
    
    isFatalError(error) {
        const fatalPatterns = [
            'Invalid data format',
            'Corrupted state',
            'Security error'
        ];
        return fatalPatterns.some(p => error.message.includes(p));
    }
}
```

### 8.2 错误分类与处理

```javascript
/**
 * 错误类型枚举
 */
const WORKER_ERRORS = {
    INIT_FAILED: {
        code: 'WORKER_INIT_FAILED',
        message: 'Failed to initialize Web Worker',
        recoverable: true,
        fallback: 'main-thread'
    },
    EXECUTION_TIMEOUT: {
        code: 'EXECUTION_TIMEOUT',
        message: 'Worker execution timed out',
        recoverable: true,
        fallback: 'async-chunked'
    },
    DATA_TOO_LARGE: {
        code: 'DATA_TOO_LARGE',
        message: 'Data size exceeds transfer limit (50MB)',
        recoverable: false,
        action: 'reduce-data-size'
    },
    SERIALIZATION_ERROR: {
        code: 'SERIALIZATION_ERROR',
        message: 'Failed to serialize data for Worker transfer',
        recoverable: true,
        fallback: 'main-thread'
    },
    WORKER_CRASHED: {
        code: 'WORKER_CRASHED',
        message: 'Worker thread crashed unexpectedly',
        recoverable: true,
        fallback: 'restart-worker'
    }
};

/**
 * 统一错误处理器
 */
class WorkerErrorHandler {
    static handle(error, context) {
        const errorType = this.classifyError(error);
        
        console.error(`[WorkerError] ${errorType.code}: ${errorType.message}`, {
            context,
            stack: error.stack
        });
        
        // 根据错误类型决定处理策略
        if (!errorType.recoverable) {
            throw new Error(`Fatal error: ${errorType.message}`);
        }
        
        // 记录错误到监控系统
        this.reportToMonitoring(errorType, context);
        
        return errorType;
    }
    
    static classifyError(error) {
        if (error.message.includes('timeout')) return WORKER_ERRORS.EXECUTION_TIMEOUT;
        if (error.message.includes('serialize')) return WORKER_ERRORS.SERIALIZATION_ERROR;
        if (error.message.includes('postMessage')) return WORKER_ERRORS.INIT_FAILED;
        return WORKER_ERRORS.WORKER_CRASHED;
    }
    
    static reportToMonitoring(errorType, context) {
        // 发送到错误收集服务（如 Sentry）
        if (window.Sentry) {
            Sentry.captureException(new Error(errorType.code), {
                tags: { source: 'web-worker', type: errorType.code },
                extra: context
            });
        }
    }
}
```

### 8.3 超时保护机制

```javascript
/**
 * 为每个任务设置超时保护
 */
class TimeoutProtection {
    /**
     * 带超时的 Worker 任务提交
     */
    static async submitWithTimeout(pool, taskData, timeoutMs = 30000) {
        const timeoutId = {};
        
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId.id = setTimeout(() => {
                reject(new Error(`Worker task timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        });
        
        const taskPromise = pool.submit(taskData);
        
        try {
            const result = await Promise.race([taskPromise, timeoutPromise]);
            clearTimeout(timeoutId.id);
            return result;
        } catch (error) {
            clearTimeout(timeoutId.id);
            
            if (error.message.includes('timed out')) {
                console.warn('[TimeoutProtection] Task timeout, cancelling...');
                // 可以选择取消任务（需要 Worker 配合）
                return { success: false, error: error.message, code: 'TIMEOUT' };
            }
            
            throw error;
        }
    }
}
```

---

## 9. 调试与监控体系

### 9.1 日志规范

```javascript
/**
 * 统一日志格式（支持主线程和 Worker）
 */

// 主线程日志
class Logger {
    static log(poolName, level, message, data = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            source: `Main:${poolName}`,
            level,
            message,
            data,
            performance: performance.now()
        };
        
        // 控制台输出（带颜色）
        const colors = {
            info: '#2196F3',
            warn: '#FF9800',
            error: '#F44336',
            debug: '#9E9E9E'
        };
        
        console.log(
            `%c[WorkerSystem] [%c${poolName}%c] ${message}`,
            `color: ${colors[level] || colors.info}`,
            `color: bold; color: #4CAF50`,
            `color: ${colors[level] || colors.info}`,
            data
        );
        
        // 发送到日志收集系统
        this.sendToLogAggregator(logEntry);
    }
    
    static sendToLogAggregator(logEntry) {
        // 可选：发送到后端日志服务或本地存储
        if (window.logAggregator) {
            window.logAggregator.collect(logEntry);
        }
    }
}

// Worker 内部日志
function workerLog(workerName, level, message, data) {
    self.postMessage({
        type: 'LOG',
        payload: {
            timestamp: Date.now(),
            source: `Worker:${workerName}`,
            level,
            message,
            data,
            memoryUsage: performance.memory?.usedJSHeapSize
        }
    });
}
```

### 9.2 Performance Monitor

```javascript
/**
 * 性能监控器 - 实时追踪 Worker 性能指标
 */
class WorkerPerformanceMonitor {
    #metrics = new Map();
    
    recordTask(poolName, taskId, startTime, endTime, dataSize) {
        const duration = endTime - startTime;
        
        const metric = {
            poolName,
            taskId,
            duration,
            dataSize,
            timestamp: Date.now(),
            throughput: dataSize / (duration / 1000)  // bytes/sec
        };
        
        this.#metrics.set(taskId, metric);
        
        // 自动检测异常
        if (duration > 5000) {
            console.warn(`⚠️ Slow task detected: ${poolName}#${taskId} took ${duration}ms`);
        }
        
        return metric;
    }
    
    getStatistics(poolName) {
        const tasks = Array.from(this.#metrics.values())
            .filter(m => m.poolName === poolName);
        
        if (tasks.length === 0) return null;
        
        const durations = tasks.map(t => t.duration);
        
        return {
            totalTasks: tasks.length,
            avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
            maxDuration: Math.max(...durations),
            minDuration: Math.min(...durations),
            p50: percentile(durations, 50),
            p95: percentile(durations, 95),
            p99: percentile(durations, 99),
            totalDataProcessed: tasks.reduce((sum, t) => sum + t.dataSize, 0)
        };
    }
    
    generateReport() {
        const report = {
            generatedAt: new Date().toISOString(),
            pools: {}
        };
        
        const poolNames = [...new Set(Array.from(this.#metrics.values()).map(m => m.poolName))];
        
        poolNames.forEach(name => {
            report.pools[name] = this.getStatistics(name);
        });
        
        return report;
    }
}

function percentile(arr, p) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) return sorted[lower];
    
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
```

### 9.3 Chrome DevTools 调试指南

```
═══════════════════════════════════════════════════════════════
  🛠️  Chrome DevTools Web Worker 调试完全指南
═══════════════════════════════════════════════════════════════

1. 查看 Worker 线程：
   ┌─────────────────────────────────────────────────────┐
   │ DevTools → Sources → 左侧面板                       │
   │   └── Workers                                       │
   │       ├── (主线程) Main Thread                      │
   │       ├── Formula Worker #1                         │
   │       ├── Formula Worker #2                         │
   │       ├── Sort Worker                               │
   │       └── Validation Worker #1                      │
   └─────────────────────────────────────────────────────┘

2. 在 Worker 中设置断点：
   - 点击对应的 Worker 线程
   - 打开 Worker 的脚本文件
   - 正常设置断点（和主线程一样！）

3. 查看各线程时间线：
   ┌─────────────────────────────────────────────────────┐
   │ DevTools → Performance → Record                     │
   │                                                      │
   │ 时间线视图：                                          │
   │   [=== Main Thread ===][== Sort ==][= Validate =]   │
   │   [==== Formula W1 ===][=== Formula W2 ===]         │
   │                                                      │
   │ 可以清晰看到：                                        │
   │   - 各线程的执行时间段                                │
   │   - 是否存在空闲等待                                  │
   │   - 线程间通信开销                                    │
   └─────────────────────────────────────────────────────┘

4. Console 日志过滤：
   - Console 面板顶部下拉菜单
   - 选择 "Workers" 过滤器
   - 或使用控制台命令：console.context

5. 内存分析：
   ┌─────────────────────────────────────────────────────┐
   │ DevTools → Memory → Take snapshot                   │
   │                                                      │
   | 可以查看：                                           |
   │   - 每个 Worker 的堆内存占用                          |
   │   - 是否存在内存泄漏                                 |
   │   - 数据传输后的内存释放情况                          |
   └─────────────────────────────────────────────────────┘

6. 网络流量（如果使用外部 Worker 文件）：
   ┌─────────────────────────────────────────────────────┐
   │ DevTools → Network                                   │
   │   筛选：Worker                                      │
   │   查看 Worker 脚本的加载时间和大小                    │
   └─────────────────────────────────────────────────────┘
```

---

## 10. 部署与兼容性

### 10.1 浏览器兼容性矩阵

| 浏览器 | 最低版本 | Worker 支持 | Blob URL | Transferable | SharedArrayBuffer | OffscreenCanvas |
|--------|----------|-------------|----------|--------------|-------------------|-----------------|
| **Chrome** | 4+ | ✅ | ✅ | ✅ (v1+) | ✅ (v59+) | ✅ (v69+) |
| **Firefox** | 3.5+ | ✅ | ✅ | ✅ (v30+) | ✅ (v79+) | ⚠️ v105+ (flag) |
| **Safari** | 4+ | ✅ | ✅ | ✅ (v7.1+) | ❌ 不支持 | ❌ 不支持 |
| **Edge** | 10+ | ✅ | ✅ | ✅ (v12+) | ✅ (v79+) | ✅ (v79+) |
| **IE** | 10+ | ✅ | ✅ (10+) | ❌ | ❌ | ❌ |

**结论**：核心 Worker 功能在所有现代浏览器均完美支持！

### 10.2 CSP 安全策略配置

```html
<!--
如果项目启用了严格的内容安全策略（CSP），
需要在 HTTP 响应头中添加以下配置：
-->

<!-- 方案1：HTTP 响应头 -->
<meta http-equiv="Content-Security-Policy" 
      content="
        default-src 'self';
        script-src 'self' 'unsafe-inline' blob:;
        worker-src 'self' blob:;
        connect-src 'self';
        img-src 'self' data:;
      ">

<!-- 方案2：Nginx 配置示例 -->
# nginx.conf
add_header Content-Security-Policy "
    default-src 'self';
    script-src 'self' 'unsafe-inline' blob:;
    worker-src 'self' blob:;
";

<!-- 方案3：Webpack 开发服务器配置 -->
// webpack.config.js (devServer)
devServer: {
    headers: {
        'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' blob:",
            "worker-src 'self' blob:"
        ].join('; ')
    }
}
```

### 10.3 特性检测与降级

```javascript
/**
 * 运行时特性检测
 */
class FeatureDetection {
    static checkWebWorkerSupport() {
        return typeof Worker !== 'undefined';
    }
    
    static checkBlobSupport() {
        try {
            return !!window.Blob && !!window.URL.createObjectURL;
        } catch (e) {
            return false;
        }
    }
    
    static checkTransferableSupport() {
        // 简单测试
        try {
            const buffer = new ArrayBuffer(8);
            const view = new Uint8Array(buffer);
            const transferred = structuredClone(buffer, { transfer: [buffer] });
            return buffer.byteLength === 0;  // 所有权已转移
        } catch (e) {
            return false;
        }
    }
    
    static checkSharedArrayBufferSupport() {
        return typeof SharedArrayBuffer !== 'undefined';
    }
    
    static checkHardwareConcurrency() {
        return navigator.hardwareConcurrency || 0;
    }
    
    /**
     * 全面检测并返回报告
     */
    static generateReport() {
        return {
            webWorker: this.checkWebWorkerSupport(),
            blobUrl: this.checkBlobSupport(),
            transferable: this.checkTransferableSupport(),
            sharedArrayBuffer: this.checkSharedArrayBufferSupport(),
            cpuCores: this.checkHardwareConcurrency(),
            recommendation: this.#getRecommendation()
        };
    }
    
    static #getRecommendation() {
        if (!this.checkWebWorkerSupport()) {
            return { 
                useWorker: false, 
                reason: 'Browser does not support Web Workers',
                fallback: 'All operations will run on main thread'
            };
        }
        
        const cores = this.checkHardwareConcurrency();
        if (cores < 2) {
            return {
                useWorker: false,
                reason: 'Single-core CPU detected',
                fallback: 'Use async chunking instead of Workers'
            };
        }
        
        return {
            useWorker: true,
            optimalWorkerCount: cores - 1,
            features: {
                transferable: this.checkTransferableSupport(),
                sharedMemory: this.checkSharedArrayBufferSupport()
            }
        };
    }
}
```

### 10.4 打包配置（Webpack/Vite）

#### **Webpack 配置**

```javascript
// webpack.config.js
module.exports = {
    module: {
        rules: [
            {
                test: /\.worker\.js$/,
                use: {
                    loader: 'worker-loader',
                    options: {
                        inline: true,          // 内联为 Blob（推荐）
                        fallback: false,       // 不降级为普通模块
                        name: '[name].[hash].js'
                    }
                }
            }
        ]
    },
    // Worker 外部化（可选，用于大型 Worker）
    externals: {
        './workers/formula.worker': 'FormulaWorker'
    }
};
```

#### **Vite 配置**

```javascript
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        rollupOptions: {
            output: {
                // Worker 文件单独打包
                entryFileNames: (chunkInfo) => {
                    if (chunkInfo.name.includes('worker')) {
                        return 'assets/workers/[name].[hash].js';
                    }
                    return 'assets/[name].[hash].js';
                }
            }
        }
    },
    worker: {
        format: 'es',           // 输出格式
        plugins: [],            // Worker 专用插件
        rollupOptions: {}       // Rollup 配置
    }
});
```

---

## 11. 实施路线图

### 11.1 分阶段实施计划

| 阶段 | 内容 | 工作量 | 优先级 | 依赖 | 交付物 |
|------|------|--------|--------|------|--------|
| **Phase 0** | 基础设施搭建 | 2天 | P0 | 无 | WorkerPoolManager + 通信协议 |
| **Phase 1** | 公式引擎 Worker | 3天 | P0 | Phase 0 | FormulaWorker + 重构 FormulaEngine |
| **Phase 2** | 排序引擎 Worker | 2天 | P1 | Phase 0 | SortWorker + 重构 SortEngine |
| **Phase 3** | 图表数据提取 Worker | 2天 | P1 | Phase 0 | DataExtractor（已在ChartEngine设计） |
| **Phase 4** | 数据验证 Worker | 2天 | P2 | Phase 0 | ValidationWorker + 重构 ValidationEngine |
| **Phase 5** | 导出/自动填充 Worker | 2天 | P2 | Phase 0 | ExportWorker + AutoFillWorker |
| **Phase 6** | 性能优化 | 3天 | P3 | Phase 1-5 | Transferable + 压缩 + 监控 |
| **Phase 7** | 测试+文档 | 2天 | P3 | Phase 6 | 单元测试 + 集成测试 + 使用文档 |

**总计约 18 个工作日**

### 11.2 Phase 0 详细规划：基础设施搭建

#### **Day 1：WorkerPool 核心实现**

**任务清单**：
- [ ] 实现 `WorkerPool` 类（基础版）
  - [ ] Worker 创建与管理
  - [ ] 任务队列机制
  - [ ] 错误处理基础
  - [ ] 状态查询接口
  
- [ ] 实现 `WorkerPoolManager` 全局管理器
  - [ ] 单例模式
  - [ ] 多池注册与管理
  - [ ] 统一提交接口
  - [ ] 生命周期管理（init/destroy）

- [ ] 定义通信协议
  - [ ] 消息格式规范
  - [ ] 任务类型枚举
  - [ ] 结果类型枚举
  - [ ] 错误码定义

**验收标准**：
```javascript
// 测试用例
const manager = WorkerPoolManager.getInstance();
manager.init({ maxWorkers: 4 });

const pool = manager.getPool('test');
const result = await pool.submit({ type: 'PING', payload: {} });

assert(result.success === true);
assert(manager.getStatus().totalPools > 0);

manager.destroy();  // 清理所有资源
```

#### **Day 2：工具类与调试基础设施**

**任务清单**：
- [ ] 实现 `FeatureDetection` 特性检测
- [ ] 实现 `Logger` 统一日志系统
- [ ] 实现 `PerformanceMonitor` 性能监控
- [ ] 实现 `ResilientExecutor` 降级执行器
- [ ] 编写单元测试（覆盖率 > 80%）

**验收标准**：
```javascript
// 特性检测
const report = FeatureDetection.generateReport();
assert(report.webWorker === true);
assert(report.cpuCores >= 2);

// 性能监控
const monitor = new WorkerPerformanceMonitor();
monitor.recordTask('formula', 'task-1', 100, 150, 1024);
const stats = monitor.getStatistics('formula');
assert(stats.avgDuration > 0);
```

### 11.3 Phase 1 详细规划：公式引擎 Worker

#### **Day 1-2：FormulaWorker 实现**

**任务清单**：
- [ ] 编写 `FormulaWorkerScript`
  - [ ] AST 求值器移植（纯函数版本）
  - [ ] 拓扑排序算法实现
  - [ ] 批量重算逻辑
  - [ ] 错误捕获与上报

- [ ] 重构 `FormulaEngine`
  - [ ] 添加 Worker 代理层
  - [ ] 智能路由逻辑（阈值判断）
  - [ ] 数据快照创建
  - [ ] 结果应用回写
  - [ ] 降级处理

- [ ] 集成测试
  - [ ] 50个公式重算测试
  - [ ] 500个公式重算测试
  - [ ] 复杂依赖图测试
  - [ ] Worker失败降级测试

**性能目标**：
```
✅ 50个公式：< 50ms总耗时（含通信）
✅ 500个公式：< 200ms总耗时
✅ 主线程阻塞：< 16ms
✅ 降级成功率：100%
```

### 11.4 后续阶段快速参考

> 由于文档长度限制，后续阶段的详细规划保持简洁。完整内容可在实施时展开。

**Phase 2 (SortEngine)**:
- 核心：将排序算法移至 Worker
- 关键点：位置映射计算在 Worker，行移动在主线程
- 预期提升：80ms → 20ms（10000行排序）

**Phase 3 (ChartDataExtractor)**:
- 已在 ChartEngine.md 完成
- 三层策略自动切换
- 预期提升：200ms → 0ms阻塞

**Phase 4-5 (Validation/Export/AutoFill)**:
- 相对简单的迁移
- 主要工作是数据序列化和结果应用
- 预期提升：批量操作不再卡顿 UI

**Phase 6 (性能优化)**:
- Transferable Objects（零拷贝）
- 数据压缩（Gzip）
- SharedArrayBuffer（如需超高性能）
- OffscreenCanvas（图表渲染）

**Phase 7 (测试与文档)**:
- 单元测试覆盖所有 Worker 代码
- 集成测试验证端到端流程
- 性能基准测试套件
- 开发者使用文档

---

## 12. 总结与展望

### 12.1 核心价值总结

#### **🎯 技术价值**

| 维度 | 收益 | 量化指标 |
|------|------|----------|
| **性能** | CPU密集型任务零阻塞 | 主线程阻塞从200ms降至0ms |
| **体验** | 操作流畅度大幅提升 | FPS稳定60fps（复杂场景） |
| **可扩展性** | 充分利用多核CPU | 双核机器理论性能翻倍 |
| **架构** | 关注点分离更彻底 | UI线程专注渲染，计算线程专注业务 |

#### **💼 业务价值**

| 场景 | 用户感知 | 商业价值 |
|------|----------|----------|
| **大数据表格编辑** | 即时响应，无卡顿 | 提升用户满意度和留存率 |
| **复杂公式计算** | 后台静默完成 | 支持更大规模的数据分析场景 |
| **批量导出操作** | 进度可视化 | 专业感提升，减少用户流失 |
| **实时协作准备** | 架构就绪 | 为未来多人协同编辑奠定基础 |

### 12.2 最佳实践清单

```
✅ 必须遵守的原则：

  1. 【透明性】调用者无需知道是否使用了 Worker
     → API 保持一致，内部智能路由

  2. 【安全性】只传递纯数据给 Worker
     → 不传递 DOM、函数、正则表达式等不可序列化对象

  3. 【容错性】所有 Worker 操作必须有降级方案
     → Worker失败 → 异步分帧 → 同步执行

  4. 【可观测性】完善的日志和性能监控
     → 每个任务记录耗时、数据量、成功/失败状态

  5. 【资源管理】及时清理 Worker 和内存
     → 应用卸载时 destroy 所有池
     → 大对象使用后置 null

  6. 【渐进增强】根据设备能力动态调整
     → 低端设备减少 Worker 数量
     → 单核设备禁用 Worker
```

### 12.3 未来演进方向

#### **短期（6个月内）**

- [ ] **OffscreenCanvas 集成**
  - 在 Worker 中直接渲染图表
  - 完全离屏绘制，零主线程开销
  
- [ ] **WASM 加速**
  - 将关键算法（排序、压缩）编译为 WASM
  - 在 Worker 中运行 WASM 模块
  - 预期性能再提升 2-5x

- [ ] **Service Worker 缓存**
  - 缓存常用计算结果
  - 支持离线模式

#### **中期（1年内）**

- [ ] **多 Tab 协调**
  - SharedWorker 跨标签页共享
  - 减少重复计算资源浪费

- [ ] **GPU 计算**
  - WebGPU Compute Shader
  - 并行数据处理（如大规模矩阵运算）

- [ ] **流式处理**
  - 大文件分块处理
  - 实时进度反馈

#### **长期愿景（2年+）**

- [ ] **jiangsuiting 加速**
  - TensorFlow.js in Worker
  - 智能数据分析（趋势预测、异常检测）

- [ ] **分布式计算**
  - 多设备协同计算
  - 利用闲置手机/平板的计算能力（WebRTC DataChannel）

- [ ] **自适应架构**
  - 根据任务特征自动选择最优执行环境
  - 主线程 / Worker / WASM / GPU 动态调度

### 12.4 成功标准

```
🎯 项目成功的定义：

  性能指标（必须全部达成）：
    ✅ 公式重算（100个依赖链）：主线程阻塞 < 16ms
    ✅ 大规模排序（10000行×3列）：总耗时 < 100ms
    ✅ 批量验证（10000单元格）：UI无卡顿
    ✅ 文件导出（50000单元格）：显示进度条
    
  质量指标：
    ✅ 单元测试覆盖率 > 85%
    ✅ 所有 Worker 代码有完整的 JSDoc 注释
    ✅ 降级测试通过率 100%
    ✅ 无内存泄漏（Chrome DevTools Memory 验证）
    
  兼容性指标：
    ✅ Chrome/Firefox/Safari/Edge 最新3个版本正常工作
    ✅ IE11+ 优雅降级（不崩溃，功能可用但较慢）
    ✅ 移动端 Safari iOS 13+ 支持
    
  开发体验指标：
    ✅ 新开发者能在1天内理解 Worker 架构
    ✅ 添加新 Worker 类型 < 0.5天工作量
    ✅ 调试体验良好（DevTools 一键切换线程）
```

### 12.5 最终建议

```
🚀 立即行动项：

  1. ✅ 本周内：代码审查本技术方案，确认可行性
  2. 📅 下周开始：Phase 0 基础设施搭建（2天）
  3. 🎯 第3周：Phase 1 公式引擎 Worker 化（最高优先级）
  4. 📊 第4周：性能基准测试 + 调优
  5. 📝 第5周：编写使用文档 + 团队培训

  💡 关键成功因素：
  
  • 渐进式推进：不要试图一次性重构所有模块
  • 充分测试：每个 Worker 都必须有完整的降级测试
  • 监控先行：先建立性能基线，才能衡量改进效果
  • 文档同步：代码变更时同步更新本文档

  ⚠️ 风险提示：
  
  • Worker 调试比主线程复杂（需切换上下文）
  • 数据序列化可能有意外（注意循环引用、函数等）
  • 通信延迟对小任务可能得不偿失（合理设置阈值）
  • 移动端 Safari 对某些高级特性支持有限
```

---

## 附录

### A. 参考资源

**官方文档**：
- MDN Web Workers API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
- Using Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- Transferable Objects: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects

**优秀库/工具**：
- Comlink (Google): https://github.com/GoogleChromeLabs/comlink
- Workerize: https://github.com/developit/workerize
- Parallel Worker Pool: https://github.com/nicolo-ribaudo/parallel-worker-pool

**性能优化文章**：
- "The Basics of Web Workers": https://www.html5rocks.com/en/tutorials/workers/basics/
- "High Performance Web Workers": https://developers.google.com/web/updates/2018/08/background-tasks

### B. 术语表

| 术语 | 英文 | 解释 |
|------|------|------|
| **主线程** | Main Thread | 浏览器的 UI 渲染线程，负责 DOM 操作和事件处理 |
| **Worker 线程** | Worker Thread | 后台线程，无法访问 DOM，专注于计算 |
| **内联 Worker** | Inline Worker | 使用 Blob URL 创建的 Worker（无需额外HTTP请求） |
| **结构化克隆** | Structured Clone | 用于在线程间复制数据的算法 |
| **Transferable** | 可转移对象 | 所有权转移而非复制的对象（零拷贝） |
| **SharedArrayBuffer** | 共享数组缓冲区 | 主线程和 Worker 共享的内存区域 |
| **OffscreenCanvas** | 离屏画布 | 可在 Worker 中使用的 Canvas 对象 |
| **消息通道** | Message Channel | 双向通信管道（可用于 Worker 间通信） |

### C. 版本历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| v1.0 | 2025-01-XX | jiangsuiting| 初始版本，完整技术方案 |

---

**📧 联系方式**：如有问题或建议，请联系项目技术负责人

**🎉 感谢阅读！让我们共同打造极致性能的电子表格引擎！** 🚀