# ErrorHandler — 统一错误处理系统

## 概述

`ErrorHandler` 是表格的统一错误处理模块，替代原来分散在代码库各处的 `console.error/warn`、`throw new Error`、`try/catch`、`.catch(){}` 等零散错误处理模式。提供分级日志、错误码归类、可插拔监听器、同步/异步异常包装等能力。

## 文件位置

```
src/constants/errorCodes.js   — 错误级别常量 + 错误码常量
src/core/ErrorHandler.js      — 错误处理器单例
```

## 设计意图

- **统一入口**：所有错误/警告/调试信息均通过 `errorHandler` 单例输出，避免 `console.log` 散落各处。
- **分级过滤**：支持 DEBUG / INFO / WARN / ERROR / FATAL 五级日志，通过 `configure()` 动态调整输出阈值，开发模式输出所有级别，生产模式仅输出 ERROR 及以上。
- **错误码归类**：所有错误按职责域（插件、钩子、类型、剪贴板、数据、渲染）分配唯一错误码，便于日志检索和监控。
- **可插拔监听**：通过 `onError()` 注册监听器，插件可监听全局错误事件用于上报、告警等。
- **消除静默吞错**：原来 `catch {}`、`.catch(() => {})` 等静默忽略异常的模式全部替换为 `errorHandler.warn()/handle()`，确保所有异常可追溯。
- **guard 模式**：提供 `guard()` / `guardAsync()` 同步/异步异常包装，避免业务代码中反复写 `try/catch`。

## 架构图

```
┌─────────────────────────────────────────────────────────┐
│                     errorHandler                         │
│                    (全局单例)                             │
├─────────────────────────────────────────────────────────┤
│  configure({ level, throwOnFatal, devMode })            │  ← 配置
│  onError(listener) / offError(listener)                 │  ← 监听器管理
│                                                         │
│  handle(code, msg, meta)    → ERROR   级别，仅记录       │
│  warn(code, msg, meta)      → WARN    级别，仅记录       │
│  debug(code, msg, meta)     → DEBUG   级别，仅开发模式   │
│  info(code, msg, meta)      → INFO    级别，仅记录       │
│  throw(code, msg, meta)     → FATAL   级别，记录 + throw  │
│                                                         │
│  guard(fn, code, msg, meta)     → 同步异常包装           │
│  guardAsync(promise, ...)       → 异步异常包装           │
└──────────┬──────────────────────────────────────────────┘
           │
    ┌──────▼──────┐    ┌──────────────┐
    │  console.xxx │    │  listeners[]  │
    │  (按级别输出) │    │  (通知监听器)  │
    └─────────────┘    └──────────────┘
```

## ERROR_CODE 常量

所有错误码定义在 `src/constants/errorCodes.js` 中，按职责域分组：

### 插件相关

| 常量 | 值 | 说明 |
|------|-----|------|
| `PLUGIN_NOT_REGISTERED` | `"PLUGIN_NOT_REGISTERED"` | 插件未注册，调用 `loadPlugin()` 前需先 `register()` |
| `PLUGIN_ALREADY_LOADED` | `"PLUGIN_ALREADY_LOADED"` | 插件已加载，重复调用 `loadPlugin()` |
| `PLUGIN_INVALID_CLASS` | `"PLUGIN_INVALID_CLASS"` | 插件类未继承 `BasePlugin` |
| `PLUGIN_ABSTRACT_METHOD` | `"PLUGIN_ABSTRACT_METHOD"` | 子类未覆写抽象方法/属性 |

### 钩子相关

| 常量 | 值 | 说明 |
|------|-----|------|
| `HOOK_CALLBACK_INVALID` | `"HOOK_CALLBACK_INVALID"` | 钩子回调不是函数 |
| `HOOK_EXECUTION_ERROR` | `"HOOK_EXECUTION_ERROR"` | 钩子回调执行时抛出异常 |

### 类型相关

| 常量 | 值 | 说明 |
|------|-----|------|
| `TYPE_NOT_REGISTERED` | `"TYPE_NOT_REGISTERED"` | 列类型未注册，回退到 text 类型 |
| `TYPE_INVALID_INSTANCE` | `"TYPE_INVALID_INSTANCE"` | 注册的类型实例无效 |
| `TYPE_PARSE_ERROR` | `"TYPE_PARSE_ERROR"` | 类型解析/校验失败 |

### 剪贴板相关

| 常量 | 值 | 说明 |
|------|-----|------|
| `CLIPBOARD_READ_ERROR` | `"CLIPBOARD_READ_ERROR"` | 系统剪贴板读取失败 |
| `CLIPBOARD_WRITE_ERROR` | `"CLIPBOARD_WRITE_ERROR"` | 系统剪贴板写入失败 |
| `CLIPBOARD_TYPE_MISMATCH` | `"CLIPBOARD_TYPE_MISMATCH"` | 粘贴时源列类型与目标列类型不一致 |

### 数据相关

| 常量 | 值 | 说明 |
|------|-----|------|
| `CELL_INVALID_DATA` | `"CELL_INVALID_DATA"` | 单元格数据无效或 cellsFn 执行失败 |
| `INDEX_OUT_OF_BOUNDS` | `"INDEX_OUT_OF_BOUNDS"` | 行列索引越界 |

### 渲染相关

| 常量 | 值 | 说明 |
|------|-----|------|
| `RENDER_ERROR` | `"RENDER_ERROR"` | 渲染异常 |

### 通用

| 常量 | 值 | 说明 |
|------|-----|------|
| `UNKNOWN` | `"UNKNOWN"` | 未分类的未知错误 |

## ERROR_LEVEL 常量

| 常量 | 值 | 含义 | 输出方式 |
|------|-----|------|---------|
| `DEBUG` | 0 | 调试信息，仅 `devMode: true` 时输出 | `console.log` |
| `INFO` | 1 | 普通信息 | `console.log` |
| `WARN` | 2 | 警告（**默认阈值**） | `console.warn` |
| `ERROR` | 3 | 可恢复错误 | `console.error` |
| `FATAL` | 4 | 不可恢复错误，默认自动 throw | `console.error` + `throw` |

## ErrorHandler API

### 配置

#### `configure(options)`

```js
errorHandler.configure({
    level: ERROR_LEVEL.WARN,   // 最低输出级别，低于此级别的消息被忽略
    throwOnFatal: true,         // FATAL 级别是否自动抛出异常
    devMode: false,             // 是否开发模式，开发模式输出 DEBUG/INFO
});
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `options.level` | `number` | `ERROR_LEVEL.WARN` | 最低输出级别 |
| `options.throwOnFatal` | `boolean` | `true` | FATAL 是否自动 throw |
| `options.devMode` | `boolean` | `false` | 是否开发模式 |

### 错误报告

#### `handle(code, message, meta?)`

记录 ERROR 级别错误，不抛出异常。用于可恢复的业务错误。

```js
errorHandler.handle(
    ERROR_CODE.PLUGIN_NOT_REGISTERED,
    `Plugin "${name}" is not registered`,
    { name }
);
```

#### `warn(code, message, meta?)`

记录 WARN 级别警告。

```js
errorHandler.warn(
    ERROR_CODE.PLUGIN_ALREADY_LOADED,
    `Plugin "${name}" is already loaded`
);
```

#### `debug(code, message, meta?)`

记录 DEBUG 级别调试信息，仅 `devMode: true` 时输出。

```js
errorHandler.debug(
    ERROR_CODE.UNKNOWN,
    `Rendering tile (${tileX}, ${tileY})`
);
```

#### `info(code, message, meta?)`

记录 INFO 级别普通信息。

```js
errorHandler.info(
    ERROR_CODE.UNKNOWN,
    "Workbook initialization complete"
);
```

#### `throw(code, message, meta?)`

记录 FATAL 级别错误并抛出异常。用于不可恢复的编程错误（如子类未覆写抽象方法）。

```js
// 不抛出（throwOnFatal: false 时）
errorHandler.throw(ERROR_CODE.UNKNOWN, "Something went wrong");

// 默认抛出 Error
errorHandler.throw(
    ERROR_CODE.PLUGIN_ABSTRACT_METHOD,
    "PLUGIN_NAME must be overridden in subclass"
);
// → throws: Error("[PLUGIN_ABSTRACT_METHOD] PLUGIN_NAME must be overridden in subclass")
```

### 异常包装

#### `guard(fn, code, message?, meta?)`

包装同步函数，捕获异常后通过 `errorHandler.handle()` 记录，返回 `undefined`。

```js
const result = errorHandler.guard(
    () => this.cellsFn(r, c),
    ERROR_CODE.CELL_INVALID_DATA,
    `cellsFn execution failed at (${r},${c})`,
    { row: r, col: c }
);
// 正常：返回 cellsFn(r, c) 的返回值
// 异常：记录错误，返回 undefined
```

#### `guardAsync(promise, code, message?, meta?)`

包装异步 Promise，捕获 reject 后通过 `errorHandler.handle()` 记录，返回 `undefined`。

```js
const data = await errorHandler.guardAsync(
    fetch("/api/data").then(r => r.json()),
    ERROR_CODE.UNKNOWN,
    "API request failed"
);
// 正常：返回解析后的数据
// 异常：记录错误，返回 undefined
```

### 监听器

#### `onError(listener)`

注册全局错误监听器。每次发生错误时，无论级别过滤结果如何，都会通知所有监听器。

```js
errorHandler.onError((code, message, level, meta) => {
    if (level >= ERROR_LEVEL.ERROR) {
        // 上报到监控系统
        analytics.trackError(code, message, meta);
    }
});
```

#### `offError(listener)`

移除已注册的错误监听器。

```js
const listener = (code, msg, level, meta) => { /* ... */ };
errorHandler.onError(listener);
// ...
errorHandler.offError(listener);
```

### 只读属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `errorHandler.level` | `number` | 当前错误级别阈值 |
| `errorHandler.devMode` | `boolean` | 是否开发模式 |

## 使用示例

### 基础用法

```js
import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "../core/ErrorHandler.js";

// 开发模式配置（在 main.js 中）
errorHandler.configure({
    level: ERROR_LEVEL.DEBUG,
    devMode: true,
});

// 记录警告
errorHandler.warn(ERROR_CODE.TYPE_NOT_REGISTERED, `Type "${name}" not found`);

// 记录错误
errorHandler.handle(ERROR_CODE.CLIPBOARD_WRITE_ERROR, "Clipboard write failed", { err });

// 抛出不可恢复错误
errorHandler.throw(ERROR_CODE.HOOK_CALLBACK_INVALID, "Hook callback must be a function");
```

### 生产模式配置

```js
errorHandler.configure({
    level: ERROR_LEVEL.ERROR,   // 仅输出 ERROR 和 FATAL
    throwOnFatal: true,          // FATAL 仍然抛出
    devMode: false,              // 关闭 DEBUG 和 INFO
});
```

### 插件监听错误

```js
class MonitoringPlugin extends BasePlugin {
    static get PLUGIN_NAME() { return "monitoring"; }

    init() {
        this.#errorListener = (code, message, level, meta) => {
            if (level >= ERROR_LEVEL.ERROR) {
                this.#sendToServer(code, message, meta);
            }
        };
        errorHandler.onError(this.#errorListener);
    }

    destroy() {
        errorHandler.offError(this.#errorListener);
        super.destroy();
    }
}
```

### 替换 try/catch 模式

```js
// 旧模式：静默吞错
try {
    return this.cellsFn(r, c);
} catch {
    return null;
}

// 新模式：统一错误处理
return errorHandler.guard(
    () => this.cellsFn(r, c),
    ERROR_CODE.CELL_INVALID_DATA,
    `cellsFn execution failed at (${r},${c})`,
    { row: r, col: c }
);
```

### 替换 Promise catch 模式

```js
// 旧模式：静默吞错
navigator.clipboard.writeText(text).catch(() => {
    this.#fallbackWriteText(text);
});

// 新模式：记录错误后 fallback
navigator.clipboard.writeText(text).catch((err) => {
    errorHandler.warn(
        ERROR_CODE.CLIPBOARD_WRITE_ERROR,
        "System clipboard write failed, using fallback",
        { originalError: err }
    );
    this.#fallbackWriteText(text);
});
```

## 已迁移模块

以下模块已从原始错误处理模式迁移到 `errorHandler`：

| 文件 | 原模式 | 新模式 |
|------|--------|--------|
| `editor/Hooks.js` | `throw new Error()` / `console.error()` | `errorHandler.throw()` / `errorHandler.handle()` |
| `plugins/PluginManager.js` | `throw new Error()` / `console.error/warn()` | `errorHandler.throw()/handle()/warn()` |
| `plugins/BasePlugin.js` | `throw new Error()` | `errorHandler.throw()` |
| `plugins/BaseHidePlugin.js` | 3 处 `throw new Error()` | `errorHandler.throw()` |
| `plugins/BaseMovePlugin.js` | `throw new Error()` | `errorHandler.throw()` |
| `types/index.js` | `console.warn()` / `catch {}` | `errorHandler.warn()/handle()` |
| `editor/ClipboardManager.js` | `console.warn()` / `.catch(){}` / `catch(_){}` | `errorHandler.warn()` |
| `workbook/Sheet.js` | `catch { return null }` | `errorHandler.handle()` |
| `workbook/ColumnTypeManager.js` | `catch { continue }` | `errorHandler.handle()` |

## 扩展指南

### 新增错误码

在 `src/constants/errorCodes.js` 的 `ERROR_CODE` 对象中添加新常量，按职责域分组：

```js
export const ERROR_CODE = {
    // ...existing codes...

    // ── 新模块 ──
    /** 新模块错误描述 */
    NEW_MODULE_ERROR: "NEW_MODULE_ERROR",
};
```

### 新增错误级别

在 `src/constants/errorCodes.js` 的 `ERROR_LEVEL` 对象中添加新级别，并在 `ErrorHandler.#getLevelPrefix()` 中添加对应的前缀映射：

```js
// errorCodes.js
export const ERROR_LEVEL = {
    // ...existing levels...
    TRACE: -1,
};

// ErrorHandler.js #getLevelPrefix
case ERROR_LEVEL.TRACE:
    return "[TRACE]";
```