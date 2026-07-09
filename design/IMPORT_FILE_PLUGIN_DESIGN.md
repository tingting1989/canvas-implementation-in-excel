# 导入Excel功能插件设计文档 (v2.0)

**项目名称**: ImportFilePlugin  
**版本**: v2.0 (增强版 - 含共享模块与Hooks架构)  
**作者**: Canvas-Sheet Team  
**创建日期**: 2026-07-09  
**状态**: 📋 设计阶段（待实现）  
**前置依赖**: ExportFilePlugin (已完成)

---

## 📋 文档目录

- [1. 项目概述](#1-项目概述)
- [2. 核心架构设计](#2-核心架构设计)
  - [2.1 插件类结构](#21-插件类结构)
  - [2.2 Hooks事件系统](#22-hooksevent系统) ⭐ **新增**
  - [2.3 共享样式转换模块](#23-共享样式转换模块) ⭐ **核心**
- [3. API接口设计](#3-api接口设计)
- [4. 数据处理流程](#4-数据处理流程)
- [5. 样式双向转换体系](#5-样式双向转换体系) ⭐ **重点**
- [6. 测试策略](#6-测试策略)
- [7. 实现路线图](#7-实现路线图)
- [8. 附录](#8-附录)

---

## 1. 项目概述

### 1.1 设计目标

构建一个**与ExportFilePlugin完全对称**的导入插件，实现Excel文件到Canvas-Sheet工作表的完整数据流。

### 1.2 核心原则

| 原则 | 描述 | 实现方式 |
|------|------|---------|
| **🔄 双向对称** | 导入/导出使用同一套转换逻辑 | 共享 `style-converter.js` 模块 |
| **🎯 Hook驱动** | 遵循Canvas-Sheet插件规范 | 使用 `BasePlugin.addHook()` 机制 |
| **⚡ 性能优先** | 支持大数据量导入 | Web Worker + 分块处理 |
| **🛡️ 安全可靠** | 完善的错误处理 | 统一错误码体系 |

### 1.3 与ExportFilePlugin的关系

```
┌─────────────────────────────────────────────────────────────┐
│                     Canvas-Sheet Core                        │
│                                                              │
│   ┌─────────────────────┐    ┌─────────────────────┐        │
│   │  ExportFilePlugin   │    │  ImportFilePlugin   │        │
│   │  (导出: CS → Excel) │    │  (导入: Excel → CS) │        │
│   └──────────┬──────────┘    └──────────┬──────────┘        │
│              │                          │                   │
│              └──────────┬───────────────┘                   │
│                         ↓                                   │
│              ┌─────────────────────┐                       │
│              │  Shared Style       │ ← 共享模块            │
│              │  Converter Module   │   (style-converter.js)│
│              └─────────────────────┘                       │
│                         ↓                                   │
│              ┌─────────────────────┐                       │
│              │  BasePlugin Hooks   │ ← 统一事件系统         │
│              │  (addHook/clearOwn) │                       │
│              └─────────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 核心架构设计

### 2.1 插件类结构

```typescript
/**
 * 导入文件插件主类
 * 
 * 继承自 BasePlugin，完全遵循 Canvas-Sheet 插件规范
 * 使用 Hooks 机制进行事件通信
 * 
 * @extends BasePlugin
 */
class ImportFilePlugin extends BasePlugin {
    static get PLUGIN_NAME(): string {
        return 'importFile';
    }

    // ══════════════════════════════════════
    // 私有属性
    // ══════════════════════════════════════
    
    /** 解析器注册表 */
    #parsers = new Map<string, FileParser>();
    
    /** 样式转换器实例（使用共享模块） */
    #styleConverter: StyleConverter;
    
    /** 验证引擎 */
    #validationEngine: ValidationEngine;
    
    /** 当前导入任务ID（用于取消操作） */
    #currentTaskId: number = 0;

    /**
     * 初始化插件
     * 注册自定义Hook并初始化各子系统
     */
    async init(options?: ImportOptions): Promise<void> {
        // 1️⃣ 调用基类初始化
        await super.init(options);
        
        // 2️⃣ 初始化共享样式转换器
        this.#styleConverter = new StyleConverter();
        
        // 3️⃣ 注册解析器
        this.#registerParsers();
        
        // 4️⃣ 初始化验证引擎
        this.#validationEngine = new ValidationEngine();
        
        // 5️⃣ 注册插件自定义Hooks（见2.2节）
        this.#registerCustomHooks();
        
        console.log('[ImportFilePlugin] 插件初始化完成');
    }

    /**
     * 销毁插件
     * 清理所有资源（包括自动清理已注册的Hooks）
     */
    destroy(): void {
        // 清理解析器
        this.#parsers.clear();
        
        // 基类会自动调用 clearOwnHooks() 清理所有通过 addHook 注册的钩子
        super.destroy();
        
        console.log('[ImportFilePlugin] 插件已销毁');
    }
}
```

### 2.2 Hooks事件系统 ⭐ **新增**

#### **设计理念**

遵循 **BasePlugin.addHook()** 规范，将所有事件定义为**可订阅的Hooks**，而非传统的EventEmitter模式。

**核心原则：与现有插件保持一致**
- 📌 **直接调用 `this.hooks?.runHooks()`** - 与 SortPlugin、FreezePlugin、DataValidationPlugin 等现有插件完全一致
- 📌 **不定义包装方法** - 遵循 KISS 原则和 YAGNI 原则，避免过度工程化
- 📌 **利用 BasePlugin 封装** - BasePlugin 已提供完善的 hooks 属性访问和生命周期管理

**优势**：
- ✅ 自动生命周期管理（destroy时自动调用 `clearOwnHooks()` 清理所有已注册的钩子）
- ✅ 插件启用/禁用状态感知（`addHook()` 创建 `guardedCallback`，禁用时回调不执行）
- ✅ 与Canvas-Sheet生态统一（所有插件都使用相同的 Hooks 调用方式）
- ✅ 支持一次性钩子（`addHookOnce`）
- ✅ 代码简洁直观（无需额外的抽象层）

#### **自定义Hook定义**

```typescript
/**
 * ImportFilePlugin 自定义Hook名称常量
 * 
 * 所有Hook都通过 BasePlugin.addHook() 注册，
 * 遵循 Canvas-Sheet 插件规范
 */
const IMPORT_HOOKS = {
    /** 
     * 导入进度更新
     * 参数: ImportProgress 对象
     * 触发频率: 每处理100行或每500ms（取较频繁者）
     */
    PROGRESS: 'onImportProgress',
    
    /** 
     * 导入完成（成功）
     * 参数: ImportResult 对象
     * 触发时机: 数据全部写入cellStore后
     */
    COMPLETE: 'onImportComplete',
    
    /** 
     * 导入失败
     * 参数: ImportError 对象
     * 触发时机: 任何步骤抛出异常时
     */
    ERROR: 'onImportError',
    
    /** 
     * 导入开始前（可用于拦截或确认）
     * 参数: FilePreview 对象
     * 返回值: boolean (false可取消导入)
     */
    BEFORE_IMPORT: 'beforeImport',
    
    /** 
     * 单行数据处理完成（细粒度进度）
     * 参数: { rowIndex, rowData, processedCount, totalCount }
     * 用途: 实时显示当前处理的行
     */
    ROW_PROCESSED: 'onRowProcessed',
    
    /** 
     * 样式转换警告（非致命问题）
     * 参数: { message, cellLocation, originalStyle, convertedStyle }
     * 场景: 边框宽度降级、不支持的属性等
     */
    STYLE_WARNING: 'onStyleWarning',
} as const;

type ImportHookName = typeof IMPORT_HOOKS[keyof typeof IMPORT_HOOKS];
```

#### **Hook注册与触发实现**

```typescript
class ImportFilePlugin extends BasePlugin {
    
    /**
     * 注册插件自定义Hooks（可选）
     * 在 init() 中调用，用于注册插件内部的默认处理器
     * 
     * ⚠️ 注意：
     * - 实际的 addHook 调用主要由外部使用者完成（通过 onImportProgress 等公共API）
     * - 插件内部通过 this.hooks?.runHooks() 直接触发事件（遵循现有插件规范）
     * 
     * @example
     * #registerCustomHooks(): void {
     *     // 可选：注册内部默认处理器（如日志记录）
     *     this.addHook(IMPORT_HOOKS.STYLE_WARNING, (warning) => {
     *         errorHandler.handle(ERROR_CODE.IMPORT_STYLE_WARNING, warning.message);
     *     });
     * }
     */
    #registerCustomHooks(): void {
        // 默认不注册任何内部处理器
        // 子类可根据需要覆盖此方法
    }

    // ══════════════════════════════════════
    // 公共API：提供便捷的事件订阅方法
    // ══════════════════════════════════════

    /**
     * 监听导入进度
     * 
     * @param callback - 进度回调函数
     * @returns 取消订阅函数（调用后移除此监听器）
     * 
     * @example
     * const unsubscribe = plugin.onImportProgress((progress) => {
     *     console.log(`${progress.percent}% 完成`);
     * });
     * 
     * // 不再需要时取消订阅
     * unsubscribe();
     */
    onImportProgress(
        callback: (progress: ImportProgress) => void
    ): () => void {
        this.addHook(IMPORT_HOOKS.PROGRESS, callback);
        
        // 返回取消订阅函数
        return () => {
            // BasePlugin 不直接支持移除单个Hook，
            // 但可以通过记录引用手动管理（见下方实现）
        };
    }

    /**
     * 监听导入完成
     */
    onImportComplete(
        callback: (result: ImportResult) => void
    ): () => void {
        this.addHook(IMPORT_HOOKS.COMPLETE, callback);
        return this.#createUnsubscriber(IMPORT_HOOKS.COMPLETE, callback);
    }

    /**
     * 监听导入错误
     */
    onImportError(
        callback: (error: ImportError) => void
    ): () => void {
        this.addHook(IMPORT_HOOKS.ERROR, callback);
        return this.#createUnsubscriber(IMPORT_HOOKS.ERROR, callback);
    }

    /**
     * 创建取消订阅函数的内部实现
     */
    #createUnsubscriber<T>(
        hookName: ImportHookName,
        callback: (data: T) => void
    ): () => void {
        // 方案：包装回调以支持移除
        const wrapper = (...args: any[]) => callback(...args);
        
        // 存储引用以便后续移除
        this.#hookWrappers.set(callback, wrapper);
        
        return () => {
            // 从registeredHooks数组中移除
            const index = this.#registeredHooks.findIndex(
                h => h.hookName === hookName && h.callback === wrapper
            );
            if (index > -1) {
                this.#registeredHooks.splice(index, 1);
            }
            
            // 从hooks系统中移除
            this.hooks?.removeHook(hookName, wrapper);
            
            this.#hookWrappers.delete(callback);
        };
    }

    /** 包装函数映射表 */
    #hookWrappers = new Map<Function, Function>();
}
```

#### **Hook触发时机示例**

```typescript
/**
 * 导入文件主方法
 * 
 * ⚠️ 重要：遵循现有插件规范（SortPlugin、FreezePlugin、DataValidationPlugin）
 * 直接使用 this.hooks?.runHooks() 触发事件，不定义包装方法！
 * 
 * @see SortPlugin.js - 第380行：this.hooks?.runHooks(HOOKS.AFTER_SORT, ...)
 * @see FreezePlugin.js - 第228行：this.hooks?.runHooks(HOOKS.AFTER_UNFREEZE)
 * @see DataValidationPlugin.js - 第159行：this.hooks?.runHooks(HOOKS.VALIDATION_FAILED, ...)
 */
async importFromFile(file: File, options?: ImportFileOptions): Promise<ImportResult> {
    const taskId = ++this.#currentTaskId;
    
    try {
        // 1️⃣ 触发 BEFORE_IMPORT Hook（导入前拦截/确认点）
        const preview = await this.previewFile(file, { previewRows: 10 });
        this.hooks?.runHooks(IMPORT_HOOKS.BEFORE_IMPORT, preview);  // ✅ 直接调用
        
        // 2️⃣ 开始读取文件
        this.hooks?.runHooks(IMPORT_HOOKS.PROGRESS, {  // ✅ 直接调用
            percent: 0,
            stage: 'reading',
            message: '正在读取文件...',
        } as ImportProgress);

        const arrayBuffer = await file.arrayBuffer();

        // 3️⃣ 解析文件
        this.hooks?.runHooks(IMPORT_HOOKS.PROGRESS, {  // ✅ 直接调用
            percent: 10,
            stage: 'parsing',
            message: '正在解析文件结构...',
        });

        const parsedData = await this.#parseFile(arrayBuffer, file.name, options);

        // 4️⃣ 逐行处理数据（触发 ROW_PROCESSED + PROGRESS）
        for (let r = 0; r < parsedData.cells.length; r++) {
            // ... 处理每一行 ...
            
            // 触发行级进度Hook（每100行触发一次）
            if (r % 100 === 0) {
                this.hooks?.runHooks(IMPORT_HOOKS.ROW_PROCESSED, {  // ✅ 直接调用
                    rowIndex: r,
                    rowData: parsedData.cells[r],
                    processedCount: r + 1,
                    totalCount: parsedData.cells.length,
                });

                // 触发总体进度Hook（20%-100%）
                this.hooks?.runHooks(IMPORT_HOOKS.PROGRESS, {  // ✅ 直接调用
                    percent: ((r + 1) / parsedData.cells.length) * 80 + 20,
                    stage: 'applying',
                    processedRows: r + 1,
                    totalRows: parsedData.cells.length,
                } as ImportProgress);
            }
        }

        // 5️⃣ 应用样式（可能触发 STYLE_WARNING）
        for (const [row, col, excelStyle] of styleIterator) {
            try {
                const canvasStyle = this.#styleConverter.convertFromExcel(excelStyle);
                // ... 应用样式到单元格 ...
            } catch (warning) {
                // 触发样式警告Hook（非致命错误，不影响导入流程）
                this.hooks?.runHooks(IMPORT_HOOKS.STYLE_WARNING, {  // ✅ 直接调用
                    message: warning.message,
                    cellLocation: { row, col },
                    originalStyle: excelStyle,
                    convertedStyle: warning.fallbackStyle,
                });
            }
        }

        // 6️⃣ 导入完成
        const result: ImportResult = {
            success: true,
            rowCount: parsedData.cells.length,
            colCount: parsedData.cells[0]?.length || 0,
            taskId,
            timestamp: new Date(),
        };
        
        this.hooks?.runHooks(IMPORT_HOOKS.COMPLETE, result);  // ✅ 直接调用
        
        return result;

    } catch (error) {
        // 7️⃣ 触发错误Hook（任何步骤失败都会进入这里）
        const importError: ImportError = {
            code: this.#classifyError(error),
            message: error.message,
            taskId,
            timestamp: new Date(),
            stack: error.stack,
        };
        
        this.hooks?.runHooks(IMPORT_HOOKS.ERROR, importError);  // ✅ 直接调用
        
        throw error;  // 重新抛出供上层捕获
    }
}
```

#### **外部使用方式对比**

```javascript

import { HOOKS } from '../../src/constants/hookNames.js';
// 方式一：通过插件方法（内部自动使用 HOOKS.IMPORT_PROGRESS）
plugin.onImportProgress(callback);

// 方式二：直接使用全局 Hook（推荐）
wb.addHook(HOOKS.IMPORT_PROGRESS, (progress) => {
    console.log(`${progress.percent}%`);
});

// Workbook 初始化时配置
const wb = new Workbook(el, {
    hooks: {
        [HOOKS.IMPORT_BEFORE_IMPORT]: (preview) => {
            return confirm('确定导入吗？');
        },
        [HOOKS.IMPORT_COMPLETE]: (result) => {
            alert(`成功！${result.rowCount} 行`);
        }
    }
});

```

---

### 2.2.4 Hooks API 参考手册 ⭐ **重要**

本章节详细说明 Canvas-Sheet Hooks 系统的完整 API，帮助开发者正确使用 Hooks 机制。

#### **Hooks 类核心 API**

基于 [`src/core/Hooks.js`](../../src/core/Hooks.js) 的实际实现：

| 方法名 | 签名 | 用途 | 使用场景 |
|--------|------|------|---------|
| **addHook** | `addHook(name, callback)` | 注册监听器 | 用户订阅事件、插件内部注册处理器 |
| **addHookOnce** | `addHookOnce(name, callback)` | 注册一次性监听器（触发后自动移除） | 只需监听一次的场景（如初始化完成） |
| **removeHook** | `removeHook(name, callback)` | 移除指定监听器 | 取消订阅、动态管理事件监听 |
| **clearHook** | `clearHook(name)` | 清空指定Hook的所有监听器 | 重置状态、插件销毁时清理 |
| **clearAllHooks** | `clearAllHooks()` | 清空所有Hook的所有监听器 | 完全重置、系统级清理 |
| **runHooks** | `runHooks(name, ...args)` | ⭐ **触发所有监听器** | **插件内部触发事件的主要方法** |
| **runHooksUntil** | `runHooksUntil(name, ...args)` | 触发并返回第一个非undefined值 | 拦截/确认场景（如 `beforeImport` 可返回 false 取消操作） |
| **runHooksWithCallback** | `runHooksWithCallback(name, invoker)` | 通过invoker函数控制回调执行时机 | 需要异步处理或条件执行的复杂场景 |
| **runHooksUntilWithCallback** | `runHooksUntilWithCallback(name, invoker)` | 结合上述两种特性 | 高级拦截场景 |
| **getHooks** | `getHooks(name)` | 获取指定Hook的所有监听器数组 | 调试、测试、检查已注册的监听器 |
| **getHookNames** | `getHookNames()` | 获取所有已注册的Hook名称列表 | 调试、文档生成 |
| **hasHook** | `hasHook(name)` | 检查指定Hook是否存在（有监听器） | 条件判断、防御性编程 |

#### **BasePlugin 封装层增强**

[`src/plugins/BasePlugin.js`](../../src/plugins/BasePlugin.js) 在 Hooks 基础上提供了以下增强功能：

##### **1. 状态守卫机制**
```javascript
// [BasePlugin.js 第168-175行]
addHook(hookName, callback) {
    const guardedCallback = (...args) => {
        if (!this.#enabled) return;  // ⚠️ 插件禁用时回调不会执行
        return callback(...args);
    };
    
    this.hooks?.addHook(hookName, guardedCallback);  // 注册的是包装后的回调
    this.#registeredHooks.push({ hookName, callback: guardedCallback });  // 追踪引用
}
```

**优势**：
- 🛡️ **自动状态感知** - 调用 `plugin.disable()` 后所有回调静默失败
- 🔄 **可恢复性** - 再次调用 `plugin.enable()` 后恢复正常工作
- 📝 **透明封装** - 对使用者完全无感

##### **2. 引用追踪与自动清理**
```javascript
// [BasePlugin.js 第46行]
#registeredHooks = [];  // 存储本插件注册的所有钩子引用

// [BasePlugin.js 第135-141行]
destroy() {
    this.clearOwnHooks();  // 自动清理所有通过 addHook 注册的钩子
    this.removeOwnStrategies();
    this.removeOwnDOMEvents();
    this.#initialized = false;
    this.#enabled = false;
}

// [BasePlugin.js 第204-208行]
clearOwnHooks() {
    for (const { hookName, callback } of this.#registeredHooks) {
        this.hooks?.removeHook(hookName, callback);  // 逐个移除
    }
    this.#registeredHooks = [];  // 清空追踪列表
}
```

**优势**：
- 🧹 **防止内存泄漏** - destroy 时自动清理，无需手动管理
- 🔒 **隔离性** - 只清理本插件注册的钩子，不影响其他插件
- ⚡ **幂等安全** - 多次调用 destroy 不会报错

##### **3. Hooks 属性访问**
```javascript
// [BasePlugin.js 第95-97行]
get hooks() {
    return this.#workbook?.eventHandler?.hooks;  // 从 Workbook 获取 Hooks 实例
}
```

**访问路径**：
```
Workbook → EventHandler → Hooks
```

#### **最佳实践示例**

##### **✅ 示例1：插件内部正确触发事件**
```typescript
class ImportFilePlugin extends BasePlugin {
    
    async importFromFile(file: File): Promise<ImportResult> {
        try {
            // ✅ 正确：直接使用 this.hooks?.runHooks()
            this.hooks?.runHooks(IMPORT_HOOKS.PROGRESS, {
                percent: 50,
                stage: 'processing',
            });
            
            // ... 业务逻辑 ...
            
            this.hooks?.runHooks(IMPORT_HOOKS.COMPLETE, result);
            return result;
            
        } catch (error) {
            // ✅ 正确：错误时也要触发 Hook
            this.hooks?.runHooks(IMPORT_HOOKS.ERROR, {
                code: 'PARSE_ERROR',
                message: error.message,
            });
            
            throw error;  // 记得重新抛出！
        }
    }
}
```

##### **✅ 示例2：外部使用者正确订阅事件**
```typescript
// 在 React 组件中使用
function ImportButton({ plugin }) {
    useEffect(() => {
        // ✅ 推荐：使用便捷方法订阅
        const unsubProgress = plugin.onImportProgress((progress) => {
            setProgressValue(progress.percent);
            setStatusMessage(progress.message);
        });
        
        const unsubComplete = plugin.onImportComplete((result) => {
            showSuccessToast(`成功导入 ${result.rowCount} 行数据`);
        });
        
        const unsubError = plugin.onImportError((error) => {
            showErrorToast(`导入失败: ${error.message}`);
        });
        
        // ⚠️ 重要：在 cleanup 中取消所有订阅！
        return () => {
            unsubProgress();
            unsubComplete();
            unsubError();
        };
    }, [plugin]);
    
    return <button onClick={handleImport}>导入Excel</button>;
}
```

##### **✅ 示例3：一次性监听场景**
```typescript
// 场景：只在首次导入完成时显示引导提示
function showFirstTimeGuide(plugin) {
    let hasShownGuide = false;
    
    plugin.addHookOnce('onImportComplete', (result) => {
        if (!hasShownGuide && result.rowCount > 0) {
            hasShownGuide = true;
            showTutorialModal('导入成功！您可以继续编辑数据或保存。');
        }
    });
}
```

#### **Hooks 触发流程图**

```
用户调用 importFromFile()
         ↓
    ┌────────────────────┐
    │  BEFORE_IMPORT     │ ← runHooksUntil（可返回 false 取消）
    │  (拦截点)          │
    └────────┬───────────┘
             ↓ 返回 true 继续
    ┌────────────────────┐
    │  PROGRESS: 0%      │ ← runHooks（通知开始）
    │  stage: reading    │
    └────────┬───────────┘
             ↓
    ┌────────────────────┐
    │  PROGRESS: 10%     │ ← runHooks
    │  stage: parsing    │
    └────────┬───────────┘
             ↓
    ┌────────────────────┐
    │  ROW_PROCESSED     │ ← runHooks（每100行）
    │  PROGRESS: 20-100% │ ← runHooks
    │  stage: applying   │
    └────────┬───────────┘
             ↓
    ┌────────────────────┐
    │  STYLE_WARNING     │ ← runHooks（可选，仅样式转换有问题时）
    │  (非致命警告)       │
    └────────┬───────────┘
             ↓
    ┌────────────────────┐
    │  COMPLETE          │ ← runHooks（成功）
    │  或 ERROR          │ ← runHooks（失败）
    └────────────────────┘
```

#### **性能优化建议**

1. **控制触发频率**
   ```typescript
   // ✅ 好：节流处理（每100行或每500ms触发一次）
   if (r % 100 === 0 || Date.now() - lastTriggerTime > 500) {
       this.hooks?.runHooks(IMPORT_HOOKS.PROGRESS, progressData);
       lastTriggerTime = Date.now();
   }
   
   // ❌ 差：每行都触发（性能杀手）
   for (let r = 0; r < rows.length; r++) {
       this.hooks?.runHooks(IMPORT_HOOKS.ROW_PROCESSED, rowData);  // 10万行=10万次调用！
   }
   ```

2. **轻量化回调参数**
   ```typescript
   // ✅ 好：只传递必要数据
   this.hooks?.runHooks(IMPORT_HOOKS.PROGRESS, {
       percent: 50,
       message: 'Processing...',
   });
   
   // ❌ 差：传递大量冗余数据
   this.hooks?.runHooks(IMPORT_HOOKS.PROGRESS, {
       percent: 50,
       message: 'Processing...',
       fullData: hugeArray,      // 不必要的内存开销
       debugInfo: complexObject,  // 回调可能根本不用
   });
   ```

3. **批量通知 vs 细粒度通知**
   ```typescript
   // 对于大数据量（>10000行），优先使用 PROGRESS 而非 ROW_PROCESSED
   if (totalRows > 10000) {
       // 只触发总体进度
       this.hooks?.runHooks(IMPORT_HOOKS.PROGRESS, progress);
   } else {
       // 小数据量可以触发行级别事件
       this.hooks?.runHooks(IMPORT_HOOKS.ROW_PROCESSED, rowDetail);
       this.hooks?.runHooks(IMPORT_HOOKS.PROGRESS, progress);
   }
   ```

---

### 2.3 共享样式转换模块 ⭐ **核心**

#### **模块定位**

```
src/
├── plugins/
│   ├── ExportFilePlugin.js      # 导出插件（消费者）
│   └── ImportFilePlugin.js      # 导入插件（消费者）
└── shared/
    └── style-converter.js       # 共享样式转换模块（生产者）← 新增！
```

**核心价值**：
- 🔄 **保证双向一致性**：导入/导出使用相同算法
- 📦 **代码复用**：避免重复实现
- 🔧 **易于维护**：修改一处即可同步两端
- 🧪 **便于测试**：独立单元测试

#### **模块架构**

```javascript
/**
 * @module shared/style-converter
 * @description Canvas-Sheet ↔ ExcelJS 双向样式转换工具集
 * 
 * 设计原则：
 * 1. 纯函数：无副作用，输入→输出确定性强
 * 2. 双向对称：每个转换函数都有对应的逆函数
 * 3. 缓存友好：颜色等昂贵操作内置缓存
 * 4. 容错性：对异常输入返回安全默认值
 * 
 * @author Canvas-Sheet Team
 * @version 1.0.0
 */

// ============================================================================
// [Section 1] 颜色转换系统（双向通用）
// ============================================================================

/**
 * 颜色缓存（模块级单例，避免重复DOM操作）
 * @type {Map<string, string>}
 */
const _colorCache = new Map<string, string>();

/** 
 * DOM元素复用（用于浏览器原生颜色解析）
 * @type {HTMLDivElement|null}
 */
let _colorParserElement: HTMLDivElement | null = null;

/**
 * 将任意颜色格式转换为 ARGB 格式（8位十六进制）
 * 
 * 用于：导出时 Canvas-Sheet → ExcelJS
 * 
 * 支持格式：
 * - HEX: '#FF5733', 'FF5733', '#F53' (标准/完整/简写)
 * - ARGB: 'FFFF5733' (8位，直接返回)
 * - RGB: 'rgb(255, 87, 51)'
 * - 名称: 'red', 'blue' (使用浏览器原生API)
 * - 透明: 'transparent' → '00000000'
 *
 * @param {string} color - 输入颜色值
 * @returns {string} ARGB格式颜色（如 'FFFF5733'）
 * 
 * @example
 * toArgb('#FF5733')       // → 'FFFF5733'
 * toArgb('rgb(255,0,0)')  // → 'FFFF0000'
 * toArgb('red')           // → 'FFFF0000'
 * toArgb('transparent')   // → '00000000'
 */
export function toArgb(color: string): string {
    // ... 实现细节与 ExportFilePlugin.js 中的 toArgb 完全一致 ...
    // （此处省略，详见源码第552-620行）
}

/**
 * 将 ARGB 格式转换为 HEX 格式（6位十六进制带#号）
 * 
 * 用于：导入时 ExcelJS → Canvas-Sheet
 * 
 * 与 toArgb() 互为逆函数（忽略Alpha通道差异）
 *
 * @param {argb} argb - ARGB格式颜色（如 'FFFF5733' 或 'FF5733'）
 * @returns {string} HEX格式颜色（如 '#FF5733'）
 *
 * @example
 * argbToHex('FFFF5733')  // → '#FF5733'
 * argbToHex('FF5733')    // → '#5733' (4位补全为6位)
 * argbToHex('00000000')  // → '#000000' (透明→黑色)
 */
export function argbToHex(argb: string): string {
    if (!argb || typeof argb !== 'string') return '#000000';

    let hex = argb.trim().toUpperCase();

    // 移除Alpha通道（保留RGB部分）
    if (hex.length === 8) {
        hex = hex.substring(2);  // 取后6位 RGB
    }

    // 处理3位简写（如 'F53' → 'FF5533'）
    if (hex.length === 3) {
        hex = hex[0]+hex[0] + hex[1]+hex[1] + hex[2]+hex[2];
    }

    // 补全至6位
    hex = hex.padStart(6, '0').substring(0, 6);

    return `#${hex}`;
}

/**
 * 批量转换颜色（带缓存优化）
 * 
 * @param colors - 颜色值数组
 * @param converter - 转换函数 (toArgb | argbToHex)
 * @returns 转换后的颜色数组
 */
export function batchConvertColors(
    colors: string[],
    converter: (color: string) => string
): string[] {
    return colors.map(color => converter(color));
}

// ============================================================================
// [Section 2] 字体属性转换（双向通用）
// ============================================================================

/** 默认字体族 */
const DEFAULT_FONT_FAMILY = 'Arial';

/** 默认字体大小（像素） */
const DEFAULT_FONT_SIZE_PX = 14;

/** 默认字体大小（磅） */
const DEFAULT_FONT_SIZE_PT = 11;

/**
 * 像素转换为磅（px → pt）
 * 
 * 用于：导出时 Canvas-Sheet → Excel
 * 
 * 公式: pt = px / 1.333 (近似值)
 * 
 * @param px - 像素值
 * @returns {number} 磅值（四舍五入）
 */
export function pxToPt(px: number): number {
    if (!px || typeof px !== 'number' || px <= 0) return DEFAULT_FONT_SIZE_PT;
    return Math.round(px / 1.333);
}

/**
 * 磅转换为像素（pt → px）
 * 
 * 用于：导入时 Excel → Canvas-Sheet
 * 
 * 与 pxToPt() 互为逆函数（存在±1px精度损失）
 * 
 * @param pt - 磅值
 * @returns {number} 像素值（四舍五入）
 */
export function ptToPx(pt: number): number {
    if (!pt || typeof pt !== 'number' || pt <= 0) return DEFAULT_FONT_SIZE_PX;
    return Math.round(pt * 1.333);
}

/**
 * 字体粗细转换（双向枚举映射）
 */
export const FontWeightMap = {
    // Canvas-Sheet → Excel
    toExcel: {
        'bold': true,
        'normal': false,
        'bolder': true,
        'lighter': false,
        // 数值映射 (100-900)
        '700': true,
        '400': false,
    } as Record<string, boolean>,
    
    // Excel → Canvas-Sheet
    fromExcel: {
        true: 'bold',
        false: 'normal',
    } as Record<boolean, string>,
} as const;

/**
 * 字体样式转换（双向枚举映射）
 */
export const FontStyleMap = {
    toExcel: {
        'italic': true,
        'normal': false,
        'oblique': true,
    } as Record<string, boolean>,
    
    fromExcel: {
        true: 'italic',
        false: 'normal',
    } as Record<boolean, string>,
} as const;

// ============================================================================
// [Section 3] 对齐方式转换（双向通用）
// ============================================================================

/**
 * 水平对齐方式映射表
 * 
 * 注意：Canvas-Sheet 和 Excel 的枚举值基本一致，
 * 但需要处理一些特殊情况（如 'distributed' vs 'justify'）
 */
export const HorizontalAlignMap = {
    // Canvas-Sheet → Excel (identity mapping with exceptions)
    toExcel: {
        'left': 'left',
        'center': 'center',
        'right': 'right',
        'justify': 'justify',
        'start': 'left',       // CSS logical property → physical
        'end': 'right',
        'distributed': 'justify',  // 近似映射
    } as Record<string, string>,
    
    // Excel → Canvas-Sheet
    fromExcel: {
        'left': 'left',
        'center': 'center',
        'right': 'right',
        'justify': 'justify',
        'distributed': 'justify',  // 信息损失（无法区分）
        'centerContinuous': 'center',
    } as Record<string, string>,
} as const;

/**
 * 垂直对齐方式映射表
 * 
 * 注意：Canvas-Sheet 使用 'center'，Excel 使用 'middle'
 */
export const VerticalAlignMap = {
    // Canvas-Sheet → Excel
    toExcel: {
        'top': 'top',
        'center': 'middle',     // 关键差异点！
        'bottom': 'bottom',
        'baseline': 'bottom',   // 近似映射
    } as Record<string, string>,
    
    // Excel → Canvas-Sheet
    fromExcel: {
        'top': 'top',
        'middle': 'center',     // 关键差异点！
        'bottom': 'bottom',
        'distributed': 'stretch',
    } as Record<string, string>,
} as const;

// ============================================================================
// [Section 4] 边框样式转换（双向通用）
// ============================================================================

/**
 * 边框样式映射表
 * 
 * ⚠️ 信息损失警告：
 * Excel 有多种线宽（thin/medium/thick/hair等），
 * 但 Canvas-Sheet 只有4种基础样式（solid/dashed/dotted/double）
 * 
 * 解决方案：导入时记录警告信息
 */
export const BorderStyleMap = {
    // Canvas-Sheet → Excel (细化映射)
    toExcel: {
        'solid': 'thin',          // 默认细线
        'dashed': 'dashed',
        'dotted': 'dotted',
        'double': 'double',
        'none': 'none',
    } as Record<string, string>,
    
    // Excel → Canvas-Sheet (粗化映射)
    fromExcel: {
        'thin': 'solid',         // 细线 → 实线
        'medium': 'solid',       // 中等 → 实线 (⚠️ 宽度信息丢失)
        'thick': 'solid',        // 粗线 → 实线 (⚠️ 宽度信息丢失)
        'hair': 'solid',         // 发丝线 → 实线
        'dashed': 'dashed',
        'dotted': 'dotted',
        'double': 'double',
        'mediumDashed': 'dashed',
        'dashDot': 'dashed',
        'mediumDashDot': 'dashed',
        'dashDotDot': 'dashed',
        'mediumDashDotDot': 'dashed',
        'slantDashDot': 'dashed',
        'none': 'none',
    } as Record<string, string>,
} as const;

/**
 * 检测边框样式是否存在精度损失
 * 
 * @param excelBorderStyle - Excel边框样式名
 * @returns {boolean} 是否有信息损失
 */
export function hasBorderWidthLoss(excelBorderStyle: string): boolean {
    return ['medium', 'thick', 'hair'].includes(excelBorderStyle);
}

// ============================================================================
// [Section 5] 主转换器类（整合所有子转换器）
// ============================================================================

/**
 * 样式转换器主类
 * 
 * 整合所有转换逻辑，提供统一的转换接口
 * 同时被 ExportFilePlugin 和 ImportFilePlugin 使用
 */
export class StyleConverter {
    private colorCache = new Map<string, string>();
    
    /**
     * Canvas-Sheet 样式 → ExcelJS 样式
     * 
     * 用于：导出功能
     * 
     * @param canvasStyle - Canvas-Sheet 扁平样式对象
     * @returns {Partial<ExcelJS.Style>} ExcelJS 样式对象
     */
    convertToExcel(canvasStyle: Partial<CanvasSheetStyle>): Partial<ExcelJS.Style> {
        const excelStyle: Partial<ExcelJS.Style> = {};
        
        // 1. 字体转换
        if (this.hasFontProperties(canvasStyle)) {
            excelStyle.font = this.convertFontToExcel(canvasStyle);
        }
        
        // 2. 填充（背景色）转换
        if (canvasStyle.backgroundColor) {
            excelStyle.fill = this.convertFillToExcel(canvasStyle.backgroundColor);
        }
        
        // 3. 对齐方式转换
        if (canvasStyle.textAlign || canvasStyle.verticalAlign) {
            excelStyle.alignment = this.convertAlignmentToExcel(canvasStyle);
        }
        
        // 4. 边框转换
        if (this.hasBorderProperties(canvasStyle)) {
            excelStyle.border = this.convertBorderToExcel(canvasStyle);
        }
        
        // 5. 数字格式
        if (canvasStyle.format) {
            excelStyle.numFmt = this.convertNumberFormatToExcel(canvasStyle.format);
        }
        
        return excelStyle;
    }

    /**
     * ExcelJS 样式 → Canvas-Sheet 样式
     * 
     * 用于：导入功能
     * 
     * @param excelStyle - ExcelJS 样式对象
     * @returns {Partial<CanvasSheetStyle>} Canvas-Sheet 扁平样式对象
     * @throws {StyleConversionWarning} 非致命警告（通过Hook通知）
     */
    convertFromExcel(excelStyle: Partial<ExcelJS.Style>): Partial<CanvasSheetStyle> {
        const canvasStyle: Partial<CanvasSheetStyle> = {};
        const warnings: StyleWarning[] = [];
        
        // 1. 字体转换
        if (excelStyle.font) {
            Object.assign(canvasStyle, this.convertFontFromExcel(excelStyle.font));
        }
        
        // 2. 填充（背景色）转换
        if (excelStyle.fill) {
            const bg = this.convertFillFromExcel(excelStyle.fill);
            if (bg) canvasStyle.backgroundColor = bg;
        }
        
        // 3. 对齐方式转换
        if (excelStyle.alignment) {
            Object.assign(canvasStyle, this.convertAlignmentFromExcel(excelStyle.alignment));
        }
        
        // 4. 边框转换（含警告检测）
        if (excelStyle.border) {
            const { style, borderWarnings } = this.convertBorderFromExcel(excelStyle.border);
            Object.assign(canvasStyle, style);
            warnings.push(...borderWarnings);
        }
        
        // 5. 数字格式
        if (excelStyle.numFmt) {
            canvasStyle.format = this.convertNumberFormatFromExcel(excelStyle.numFmt);
        }
        
        // 如果有警告，通过某种方式传递给调用方
        // （可以是返回值、回调、或全局状态）
        if (warnings.length > 0 && this.onWarning) {
            warnings.forEach(w => this.onWarning(w));
        }
        
        return canvasStyle;
    }

    // ══════════════════════════════════════
    // 子转换方法（私有）
    // ══════════════════════════════════════

    private convertFontToExcel(style: Partial<CanvasSheetStyle>): Partial<ExcelJS.Font> {
        return {
            name: style.fontFamily || DEFAULT_FONT_FAMILY,
            size: pxToPt(style.fontSize!),
            bold: FontWeightMap.toExcel[style.fontWeight!] ?? false,
            italic: FontStyleMap.toExcel[style.fontStyle!] ?? false,
            underline: style.textDecoration === 'underline',
            color: { argb: toArgb(style.color!) },
        }.filter(Boolean);  // 移除undefined属性
    }

    private convertFontFromExcel(font: Partial<ExcelJS.Font>): Partial<CanvasSheetStyle> {
        return {
            fontFamily: font.name,
            fontSize: ptToPx(font.size!),
            fontWeight: FontWeightMap.fromExcel[font.bold!],
            fontStyle: FontStyleMap.fromExcel[font.italic!],
            textDecoration: font.underline ? 'underline' : undefined,
            color: argbToHex(font.color?.argb),
        };
    }

    private convertFillToExcel(backgroundColor: string): Partial<ExcelJS.Fill> {
        const argb = toArgb(backgroundColor);
        return {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb },
            bgColor: { argb },
        };
    }

    private convertFillFromExcel(fill: Partial<ExcelJS.Fill>): string | null {
        if (fill.type !== 'pattern' || !fill.fgColor?.argb) return null;
        return argbToHex(fill.fgColor.argb);
    }

    private convertAlignmentToExcel(style: Partial<CanvasSheetStyle>): Partial<ExcelJS.Alignment> {
        return {
            horizontal: HorizontalAlignMap.toExcel[style.textAlign!],
            vertical: VerticalAlignMap.toExcel[style.verticalAlign!],
            wrapText: style.wordWrap,
        };
    }

    private convertAlignmentFromExcel(alignment: Partial<ExcelJS.Alignment>): Partial<CanvasSheetStyle> {
        return {
            textAlign: HorizontalAlignMap.fromExcel[alignment.horizontal!],
            verticalAlign: VerticalAlignMap.fromExcel[alignment.vertical!],
            wordWrap: alignment.wrapText,
        };
    }

    private convertBorderToExcel(style: Partial<CanvasSheetStyle>): Partial<ExcelJS.Borders> {
        const sides = ['Top', 'Right', 'Bottom', 'Left'] as const;
        const border: Partial<ExcelJS.Borders> = {};
        
        for (const side of sides) {
            const prop = `border${side}` as keyof CanvasSheetStyle;
            const colorProp = `border${side}Color` as keyof CanvasSheetStyle;
            
            if (style[prop] || style[colorProp]) {
                border[side.toLowerCase()] = {
                    style: BorderStyleMap.toExcel[(style[prop] as string)] || 'thin',
                    color: { argb: toArgb((style[colorProp] as string)) },
                };
            }
        }
        
        return border;
    }

    private convertBorderFromExcel(border: Partial<ExcelJS.Borders>): {
        style: Partial<CanvasSheetStyle>;
        borderWarnings: StyleWarning[];
    } {
        const style: Partial<CanvasSheetStyle> = {};
        const warnings: StyleWarning[] = [];
        const sides = ['top', 'right', 'bottom', 'left'] as const;
        
        for (const side of sides) {
            const borderStyle = border[side];
            if (!borderStyle?.style || borderStyle.style === 'none') continue;
            
            const sidePascal = side.charAt(0).toUpperCase() + side.slice(1);
            style[`border${sidePascal}`] = BorderStyleMap.fromExcel[borderStyle.style];
            style[`border${sidePascal}Color`] = argbToHex(borderStyle.color?.argb);
            
            // 检测边框宽度损失
            if (hasBorderWidthLoss(borderStyle.style)) {
                warnings.push({
                    type: 'border_width_loss',
                    message: `边框宽度 ${borderStyle.style} 被转换为 solid，可能存在视觉差异`,
                    location: `${side} border`,
                    originalValue: borderStyle.style,
                    convertedValue: 'solid',
                });
            }
        }
        
        return { style, borderWarnings: warnings };
    }

    private convertNumberFormatToExcel(format: string): string {
        const MAP: Record<string, string> = {
            '#,##0': 'General',
            '#,##0.00': '0.00',
            'YYYY-MM-DD': 'yyyy-mm-dd',
            'HH:mm:ss': 'hh:mm:ss',
        };
        return MAP[format] || format;
    }

    private convertNumberFormatFromExcel(numFmt: string): string {
        const MAP: Record<string, string> = {
            'General': '',
            '0': '#,##0',
            '0.00': '#,##0.00',
            'yyyy-mm-dd': 'YYYY-MM-DD',
            'hh:mm:ss': 'HH:mm:ss',
            '@': '',  // 文本格式
        };
        return MAP[numFmt] || numFmt;
    }

    // 辅助方法
    private hasFontProperties(style: any): boolean {
        return !!(style.fontFamily || style.fontSize || style.fontWeight || 
                 style.fontStyle || style.color);
    }

    private hasBorderProperties(style: any): boolean {
        const borderProps = ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'];
        return borderProps.some(prop => style[prop]);
    }

    /** 警告回调（可选） */
    onWarning?: (warning: StyleWarning) => void;
}

// ============================================================================
// [Section 6] 类型定义
// ============================================================================

/**
 * Canvas-Sheet 样式对象（扁平格式）
 */
interface CanvasSheetStyle {
    fontFamily?: string;
    fontSize?: number;           // px
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    textDecoration?: 'underline' | 'none';
    color?: string;             // #RRGGBB
    backgroundColor?: string;   // #RRGGBB
    textAlign?: HorizontalAlignment;
    verticalAlign?: VerticalAlignment;
    wordWrap?: boolean;
    borderTop?: BorderStyle;
    borderTopColor?: string;
    borderRight?: BorderStyle;
    borderRightColor?: string;
    borderBottom?: BorderStyle;
    borderBottomColor?: string;
    borderLeft?: BorderStyle;
    borderLeftColor?: string;
    format?: string;
}

/**
 * 样式转换警告（非致命）
 */
interface StyleWarning {
    type: 'border_width_loss' | 'color_precision_loss' | 'unsupported_property';
    message: string;
    location?: string;
    originalValue: any;
    convertedValue: any;
}

type HorizontalAlignment = 'left' | 'center' | 'right' | 'justify';
type VerticalAlignment = 'top' | 'center' | 'bottom';
type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double' | 'none';

// ============================================================================
// [Section 7] 导出汇总
// ============================================================================

export {
    // 工具函数
    toArgb,
    argbToHex,
    batchConvertColors,
    pxToPt,
    ptToPx,
    
    // 映射表
    FontWeightMap,
    FontStyleMap,
    HorizontalAlignMap,
    VerticalAlignMap,
    BorderStyleMap,
    hasBorderWidthLoss,
    
    // 主类
    StyleConverter,
    
    // 类型
    type CanvasSheetStyle,
    type StyleWarning,
};
```

#### **在ExportFilePlugin中的集成**

```javascript
// src/plugins/ExportFilePlugin.js

// 替换原有的本地 toArgb 函数
import { 
    toArgb, 
    StyleConverter,
    // ... 其他需要的导出
} from '../shared/style-converter.js';

// 创建全局转换器实例
const styleConverter = new StyleConverter();

// 在需要的地方使用
function convertToExcelStyle(style) {
    // 直接委托给共享模块
    return styleConverter.convertToExcel(style);
}

// 或者继续使用独立的 toArgb 函数（向后兼容）
// （两者指向同一个实现）
```

#### **在ImportFilePlugin中的集成**

```javascript
// src/plugins/ImportFilePlugin.js

import { 
    StyleConverter,
    argbToHex,
    // ... 其他需要的导入
} from '../shared/style-converter.js';

class ImportFilePlugin extends BasePlugin {
    #styleConverter = new StyleConverter();

    async importFromFile(file: File, options: ImportOptions): Promise<ImportResult> {
        // 解析Excel文件...
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);

        // 转换样式（自动处理警告）
        for (const cell of cells) {
            if (cell.style) {
                // 设置警告回调（触发STYLE_WARNING Hook）
                this.#styleConverter.onWarning = (warning) => {
                    this.hooks?.runHooks(IMPORT_HOOKS.STYLE_WARNING, {  // ✅ 直接调用，遵循现有插件规范
                        ...warning,
                        cellLocation: { row: cell.row, col: cell.col },
                    });
                };

                // 执行转换
                const canvasStyle = this.#styleConverter.convertFromExcel(cell.style);
                
                // 应用到cellStore
                sheet.cellStore.setStyleId(row, col, stylePool.getStyleId(canvasStyle));
            }
        }
    }
}
```

---

## 3. API接口设计

### 3.1 公共方法（基于Hooks）

```typescript
class ImportFilePlugin extends BasePlugin {
    // ══════════════════════════════════════
    // 核心导入方法
    // ══════════════════════════════════════
    
    /**
     * 从文件导入（主要入口）
     * 内部触发以下Hooks:
     * - beforeImport: 导入前确认
     * - onImportProgress: 进度更新
     * - onRowProcessed: 行处理完成
     * - onStyleWarning: 样式警告
     * - onImportComplete: 导入成功
     * - onImportError: 导入失败
     */
    async importFromFile(
        file: File,
        options?: ImportFileOptions
    ): Promise<ImportResult>;

    /**
     * 从ArrayBuffer导入
     */
    async importFromArrayBuffer(
        buffer: ArrayBuffer,
        fileName: string,
        options?: ImportFileOptions
    ): Promise<ImportResult>;

    /**
     * 从URL远程导入
     */
    async importFromUrl(
        url: string,
        options?: ImportFileOptions & { fetchOptions?: RequestInit }
    ): Promise<ImportResult>;

    // ══════════════════════════════════════
    // 预览与校验
    // ══════════════════════════════════════
    
    /**
     * 预览文件内容（不实际导入）
     * 不触发任何修改性的Hook
     */
    async previewFile(
        file: File,
        options?: PreviewOptions
    ): Promise<FilePreview>;

    /**
     * 校验文件是否符合要求
     * 可能触发 onValidationError Hook（未来扩展）
     */
    async validateFile(
        file: File,
        rules?: ValidationRules
    ): Promise<ValidationResult>;

    // ══════════════════════════════════════
    // Hook便捷方法（返回取消订阅函数）
    // ══════════════════════════════════════
    
    /**
     * 监听导入进度
     * 内部调用: this.addHook(IMPORT_HOOKS.PROGRESS, callback)
     */
    onImportProgress(
        callback: (progress: ImportProgress) => void
    ): () => void;  // 返回unsubscribe函数

    /**
     * 监听导入完成
     */
    onImportComplete(
        callback: (result: ImportResult) => void
    ): () => void;

    /**
     * 监听导入错误
     */
    onImportError(
        callback: (error: ImportError) => void
    ): () => void;

    /**
     * 监听样式转换警告
     */
    onStyleWarning(
        callback: (warning: StyleWarningWithContext) => void
    ): () => void;

    /**
     * 监听导入前事件（可用于拦截）
     * 
     * @example
     * plugin.beforeImport(async (preview) => {
     *     const confirmed = await showConfirmDialog(preview);
     *     return confirmed;  // false可取消导入
     * });
     */
    beforeImport(
        callback: (preview: FilePreview) => boolean | Promise<boolean>
    ): () => void;

    // ══════════════════════════════════════
    // 控制方法
    // ══════════════════════════════════════
    
    /**
     * 取消当前正在进行的导入操作
     * 触发 onImportError Hook（code: IMPORT_CANCELLED）
     */
    cancelImport(): void;

    /**
     * 获取支持的文件格式列表
     */
    getSupportedFormats(): SupportedFormat[];
}
```

### 3.2 Workbook快捷方法

```typescript
class Workbook {
    /**
     * 快捷导入方法
     * 内部获取 ImportFilePlugin 实例并调用
     */
    async importFile(
        file: File,
        options?: ImportFileOptions
    ): Promise<ImportResult> {
        const plugin = this.getPlugin('importFile') as ImportFilePlugin;
        if (!plugin) {
            throw new Error('ImportFilePlugin 未安装。请先调用 workbook.installPlugin(new ImportFilePlugin(this))');
        }
        return plugin.importFromFile(file, options);
    }

    /**
     * 启用拖拽上传
     * 自动绑定 DOM 事件并调用 importFile
     */
    enableDragDropImport(
        container: HTMLElement,
        options?: DragDropOptions & ImportFileOptions
    ): () => void;  // 返回清理函数
}
```

---

## 4. 数据处理流程

### 4.1 完整导入流程（含Hook触发点）

```
用户调用 importFromFile(file, options)
         │
         ▼
    ┌──────────────────────────────────────────────┐
    │ 1. 触发 beforeImport Hook                     │
    │    ↓                                          │
    │    返回 false? → 取消导入                      │
    │    返回 true?  → 继续                         │
    └──────────────────┬───────────────────────────┘
                       ▼
    ┌──────────────────────────────────────────────┐
    │ 2. 文件读取                                   │
    │    ↓                                          │
    │    触发 onImportProgress ({stage:'reading'})  │
    └──────────────────┬───────────────────────────┘
                       ▼
    ┌──────────────────────────────────────────────┐
    │ 3. 格式检测与解析                             │
    │    ↓                                          │
    │    触发 onImportProgress ({stage:'parsing'})  │
    └──────────────────┬───────────────────────────┘
                       ▼
    ┌──────────────────────────────────────────────┐
    │ 4. 数据校验                                   │
    │    ↓                                          │
    │    校验失败? → 触发 onImportError             │
    └──────────────────┬───────────────────────────┘
                       ▼
    ┌──────────────────────────────────────────────┐
    │ 5. 逐行应用数据                               │
    │    ↓                                          │
    │    循环:                                      │
    │      ├─ 触发 onRowProcessed Hook               │
    │      ├─ 触发 onImportProgress (每100行)       │
    │      └─ 写入 cellStore                        │
    └──────────────────┬───────────────────────────┘
                       ▼
    ┌──────────────────────────────────────────────┐
    │ 6. 样式转换与应用                             │
    │    ↓                                          │
    │    对于每个有样式的单元格:                     │
    │      ├─ 调用 StyleConverter.convertFromExcel  │
    │      ├─ 如有警告 → 触发 onStyleWarning Hook   │
    │      └─ 设置 styleId 到 cellStore             │
    └──────────────────┬───────────────────────────┘
                       ▼
    ┌──────────────────────────────────────────────┐
    │ 7. 合并单元格应用                             │
    └──────────────────┬───────────────────────────┘
                       ▼
    ┌──────────────────────────────────────────────┐
    │ 8. 触发 onImportComplete Hook                  │
    │    ↓                                          │
    │    返回 ImportResult                          │
    └──────────────────────────────────────────────┘
```

---

## 5. 样式双向转换体系 ⭐ **重点**

### 5.1 转换对照矩阵

| 属性类别 | Canvas-Sheet 属性 | Excel 属性 | 导出转换函数 | 导入转换函数 | 是否完全可逆 |
|---------|------------------|------------|-------------|-------------|-------------|
| **字体名称** | `fontFamily` | `font.name` | 直接映射 | 直接映射 | ✅ 100% |
| **字体大小** | `fontSize` (px) | `font.size` (pt) | `pxToPt()` | `ptToPx()` | ⚠️ ±1px误差 |
| **字体粗细** | `fontWeight` | `font.bold` | `FontWeightMap.toExcel` | `FontWeightMap.fromExcel` | ✅ 100% |
| **字体斜体** | `fontStyle` | `font.italic` | `FontStyleMap.toExcel` | `FontStyleMap.fromExcel` | ✅ 100% |
| **文字颜色** | `color` (#RRGGBB) | `font.color.argb` (AARRGGBB) | `toArgb()` | `argbToHex()` | ✅ 100%* |
| **背景颜色** | `backgroundColor` | `fill.fgColor.argb` | `toArgb()` | `argbToHex()` | ✅ 100%* |
| **水平对齐** | `textAlign` | `alignment.horizontal` | `HorizontalAlignMap.toExcel` | `HorizontalAlignMap.fromExcel` | ⚠️ distributed差异 |
| **垂直对齐** | `verticalAlign` | `alignment.vertical` | `VerticalAlignMap.toExcel` (center→middle) | `VerticalAlignMap.fromExcel` (middle→center) | ✅ 100% |
| **自动换行** | `wordWrap` | `alignment.wrapText` | 直接映射 | 直接映射 | ✅ 100% |
| **上边框** | `borderTop` | `border.top.style` | `BorderStyleMap.toExcel` | `BorderStyleMap.fromExcel` | ⚠️ 宽度损失 |
| **上边框颜色** | `borderTopColor` | `border.top.color.argb` | `toArgb()` | `argbToHex()` | ✅ 100%* |
| **数字格式** | `format` | `numFmt` | 自定义映射 | 自定义映射 | ⚠️ 部分格式 |

*\* Alpha通道在往返中丢失（Excel不支持透明单元格），但不影响视觉效果*

### 5.2 往返测试自动化

```javascript
describe('样式往返测试套件', () => {
    let converter: StyleConverter;

    beforeEach(() => {
        converter = new StyleConverter();
    });

    // ══════════════════════════════════════
    // 颜色转换测试
    // ══════════════════════════════════════
    
    describe('颜色往返', () => {
        it('HEX颜色应该完美往返', () => {
            const original = '#FF5733';
            const argb = toArgb(original);           // → 'FFFF5733'
            const restored = argbToHex(argb);        // → '#FF5733'
            expect(restored).toBe(original);
        });

        it('RGB颜色应该完美往返', () => {
            const original = 'rgb(255, 87, 51)';
            const argb = toArgb(original);           
            const restored = argbToHex(argb);        
            expect(restored).toBe('#FF5733');
        });

        it('透明色应该转为黑色（Alpha丢失）', () => {
            const argb = toArgb('transparent');      // → '00000000'
            const hex = argbToHex(argb);             // → '#000000'
            expect(hex).toBe('#000000');             // 黑色（合理回退）
        });
    });

    // ══════════════════════════════════════
    // 字体大小往返测试
    // ══════════════════════════════════════
    
    describe('字体大小往返', () => {
        it('整数像素值应该在±1px误差内往返', () => {
            const testCases = [10, 12, 14, 16, 18, 24, 32];
            
            for (const px of testCases) {
                const pt = pxToPt(px);
                const restoredPx = ptToPx(pt);
                
                expect(Math.abs(restoredPx - px)).toBeLessThanOrEqual(1);
            }
        });
    });

    // ══════════════════════════════════════
    // 完整样式对象往返测试
    // ══════════════════════════════════════
    
    describe('完整样式往返', () => {
        it('复杂样式应该高度还原', () => {
            const originalStyle: Partial<CanvasSheetStyle> = {
                fontFamily: 'Microsoft YaHei',
                fontSize: 16,
                fontWeight: 'bold',
                fontStyle: 'italic',
                color: '#FF5733',
                backgroundColor: '#C70039',
                textAlign: 'center',
                verticalAlign: 'middle',
                wordWrap: true,
                borderTop: 'solid',
                borderTopColor: '#000000',
                format: '#,##0.00',
            };

            // 导出转换
            const excelStyle = converter.convertToExcel(originalStyle);
            
            // 导入转换
            const restoredStyle = converter.convertFromExcel(excelStyle);

            // 验证完全匹配的属性
            expect(restoredStyle.fontFamily).toBe(originalStyle.fontFamily);
            expect(restoredStyle.fontWeight).toBe(originalStyle.fontWeight);
            expect(restoredStyle.fontStyle).toBe(originalStyle.fontStyle);
            expect(restoredStyle.color).toBe(originalStyle.color);
            expect(restoredStyle.backgroundColor).toBe(originalStyle.backgroundColor);
            expect(restoredStyle.textAlign).toBe(originalStyle.textAlign);
            expect(restoredStyle.verticalAlign).toBe(originalStyle.verticalAlign);
            expect(restoredStyle.wordWrap).toBe(originalStyle.wordWrap);
            expect(restoredStyle.borderTop).toBe(originalStyle.borderTop);
            expect(restoredStyle.borderTopColor).toBe(originalStyle.borderTopColor);

            // 允许误差的属性
            expect(Math.abs(restoredStyle.fontSize! - originalStyle.fontSize!)).toBeLessThanOrEqual(1);
        });

        it('边框宽度降级应该产生警告', () => {
            const excelStyleWithMediumBorder: Partial<ExcelJS.Style> = {
                border: {
                    top: { style: 'medium', color: { argb: 'FF000000' } },
                },
            };

            const warnings: StyleWarning[] = [];
            converter.onWarning = (w) => warnings.push(w);

            converter.convertFromExcel(excelStyleWithMediumBorder);

            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0].type).toBe('border_width_loss');
            expect(warnings[0].originalValue).toBe('medium');
            expect(warnings[0].convertedValue).toBe('solid');
        });
    });
});
```

---

## 6. 测试策略

### 6.1 测试分层

```
tests/
├── unit/
│   ├── shared/
│   │   └── style-converter.test.js      # 共享模块单元测试（最高优先级）
│   ├── plugins/
│   │   └── ImportFilePlugin.test.js     # 插件主类测试
│   └── parsers/
│       ├── XLSXParser.test.js
│       └── CSVParser.test.js
├── integration/
│   ├── round-trip-style.test.js         # 样式往返集成测试
│   ├── import-export-cycle.test.js      # 导入导出循环测试
│   └── hooks-system.test.js             # Hooks系统测试
└── e2e/
    └── large-file-import.spec.js        # 大文件端到端测试
```

### 6.2 关键测试场景

```javascript
describe('ImportFilePlugin Hooks系统测试', () => {
    it('应该在正确的时机触发所有Hooks', async () => {
        const plugin = new ImportFilePlugin(workbook);
        await plugin.init();

        const hookCallLog = [];

        // 注册所有Hook监听器
        plugin.beforeImport(() => {
            hookCallLog.push('beforeImport');
            return true;
        });

        plugin.onImportProgress((progress) => {
            hookCallLog.push(`progress:${progress.stage}`);
        });

        plugin.onImportComplete((result) => {
            hookCallLog.push('complete');
        });

        // 执行导入
        await plugin.importFromFile(testFile);

        // 验证Hook调用顺序
        expect(hookCallLog[0]).toBe('beforeImport');
        expect(hookCallLog[1]).toBe('progress:reading');
        expect(hookCallLog[hookCallLog.length-1]).toBe('complete');

        // 应该包含多个进度更新
        const progressCalls = hookCallLog.filter(s => s.startsWith('progress:'));
        expect(progressCalls.length).toBeGreaterThan(3);
    });

    it('beforeImport返回false应该取消导入', async () => {
        const plugin = new ImportFilePlugin(workbook);
        await plugin.init();

        plugin.beforeImport(() => {
            return false;  // 取消导入
        });

        await expect(
            plugin.importFromFile(testFile)
        ).rejects.toThrow('导入被用户取消');
    });

    it('onStyleWarning应该接收样式转换警告', async () => {
        const plugin = new ImportFilePlugin(workbook);
        await plugin.init();

        const warnings = [];
        plugin.onStyleWarning((warning) => {
            warnings.push(warning);
        });

        // 导入包含medium边框的文件
        await plugin.importFromFile(fileWithMediumBorders);

        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings[0].type).toBe('border_width_loss');
    });
});
```

---

## 7. 实现路线图

### Phase 1: MVP版本（2周）

**目标**: 实现基础导入功能 + 共享样式转换模块

**交付物**:
- [ ] 创建 `src/shared/style-converter.js` 模块
- [ ] 实现 `StyleConverter` 类（双向转换）
- [ ] 实现 `ImportFilePlugin` 基础框架
- [ ] 实现 XLSX/CSV 解析器
- [ ] 集成 Hooks 事件系统
- [ ] 编写样式往返测试（覆盖率>90%）

**验收标准**:
```bash
# 运行测试
npm test -- --grep "StyleConverter"

# 预期结果
✅ Tests: 50/50 passed
✅ Coverage: 92% (目标>90%)

# 往返测试
npm test -- --grep "RoundTrip"

# 预期结果
✅ 所有样式属性往返误差在允许范围内
```

### Phase 2: 功能完善（2周）

**交付物**:
- [ ] 合并单元格导入
- [ ] 嵌套表头检测
- [ ] 拖拽上传支持
- [ ] 预览与校验功能
- [ ] Web Worker 异步解析

### Phase 3: 性能优化（1周）

**交付物**:
- [ ] 分块处理（Chunked Processing）
- [ ] 内存监控
- [ ] 虚拟滚动加载

---

## 8. 附录

### A. 文件清单

```
新增文件:
├── src/shared/
│   └── style-converter.js          # 共享样式转换模块 (NEW!)
├── src/plugins/
│   └── ImportFilePlugin.js         # 导入插件主类
├── src/plugins/parsers/
│   ├── BaseParser.js               # 解析器基类
│   ├── XLSXParser.js              # ExcelJS解析器
│   └── CSVParser.js               # PapaParse解析器
├── tests/unit/shared/
│   └── style-converter.test.js     # 共享模块测试
├── tests/integration/
│   └── round-trip-style.test.js    # 往返测试
└── design/
    └── IMPORT_FILE_PLUGIN_DESIGN.md # 本文档

修改文件:
├── src/plugins/ExportFilePlugin.js # 集成共享模块（重构）
├── src/plugins/index.js            # 注册新插件
└── package.json                    # 添加依赖（papaparse）
```

### B. 与旧版设计的差异

| 特性 | v1.0设计（旧） | v2.0设计（新版） | 改进点 |
|------|---------------|-----------------|--------|
| **样式转换** | 各自独立实现 | 共享 `style-converter.js` | ✅ 避免重复代码+保证一致性 |
| **事件系统** | EventEmitter模式 | BasePlugin Hooks | ✅ 符合插件规范+自动清理 |
| **错误处理** | 自定义ErrorHandler | 复用现有体系 | ✅ 统一体验 |
| **类型安全** | JSDoc注释 | TypeScript接口 | ✅ 更好的IDE支持 |
| **可测试性** | 集成测试为主 | 单元+集成+E2E分层 | ✅ 快速定位问题 |

### C. 迁移指南（从v1.0升级）

如果你已经开始基于v1.0设计开发，迁移到v2.0的步骤：

1. **提取样式转换逻辑**
   ```javascript
   // 旧：在 ImportFilePlugin 内部实现
   class ImportFilePlugin {
       private convertStyle(excelStyle) { /* ... */ }
   }
   
   // 新：使用共享模块
   import { StyleConverter } from '../shared/style-converter.js';
   ```

2. **替换事件系统**
   ```javascript
   // 旧：EventEmitter
   this.eventEmitter.on('progress', callback);
   
   // 新：BasePlugin Hooks
   this.addHook('onImportProgress', callback);
   // 或使用便捷方法
   this.onImportProgress(callback);
   ```

3. **更新测试用例**
   ```javascript
   // 旧：测试插件内部方法
   it('should convert style', () => {
       const result = plugin.convertStyle(testStyle);
   });
   
   // 新：测试共享模块（独立于插件）
   it('should convert style', () => {
       const converter = new StyleConverter();
       const result = converter.convertFromExcel(testStyle);
   });
   ```

---

## 总结

本文档是 **v2.0增强版**设计，重点解决了两个核心问题：

### ✅ **问题1：样式转换是否对应？**

**答案：完全对应！** 通过引入**共享样式转换模块** (`shared/style-converter.js`)，确保：
- 导入/导出使用**同一套转换算法**
- 颜色、字体、边框等所有属性**双向可逆**
- 通过**自动化往返测试**保证一致性
- 不可避免的精度损失（如字体大小±1px）有明确的**容差策略**

### ✅ **问题2：是否应该使用Hooks？**

**答案：必须使用！** 基于以下理由：
- **符合Canvas-Sheet插件规范**：所有插件都应使用 `BasePlugin.addHook()`
- **自动生命周期管理**：`destroy()` 时自动清理所有监听器
- **启用/禁用感知**：插件禁用时回调不会执行
- **统一的用户体验**：与其他插件（ExportFilePlugin等）保持一致的API风格

### 🎯 **下一步行动**

1. **审阅本文档**，确认设计方向
2. **开始Phase 1开发**：
   - 先创建 `src/shared/style-converter.js`
   - 编写完整的单元测试
   - 再实现 `ImportFilePlugin`
3. **运行往返测试**，确保样式100%兼容

**预期成果**：8周后，Canvas-Sheet将具备**生产级别的Excel双向交互能力**！🚀