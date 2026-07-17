# 项目规则

## 1. ESLint 合规性

- 生成的代码**必须**符合 `eslint.config.mjs` 的配置
- 每次修改代码后，应运行 `npx eslint <file>` 验证合规性
- 禁止使用 ESLint 配置中禁止的语法和模式

## 2. 数据类型判断

- 判断数据类型时**优先使用** `src/utils/utils.js` 中提供的工具函数
- 可用函数：`isNumber()`, `isFunction()`, `isObject()`, `isString()`, `isBoolean()`
- 导入方式：`import { isNumber, isFunction, isObject, isString, isBoolean } from "@/utils/index.js";`
- **禁止**在业务代码中直接使用 `typeof` 进行类型判断，应使用上述工具函数

## 3. 相等判断

- 判断相等时**必须**使用 `===`（严格相等），**禁止**使用 `==`（宽松相等）
- 判断不等时**必须**使用 `!==`，**禁止**使用 `!=`
- 原因：
  - `==` 会进行类型隐式转换，可能导致意外结果（如 `0 == ""` 为 `true`、`null == undefined` 为 `true`）
  - `===` 同时比较值和类型，语义更明确，避免潜在 bug
- 特殊情况：仅在显式需要类型转换的场景下允许使用 `==`（如与 `null` 比较），但应添加注释说明意图
- ESLint 已配置 `eqeqeq: ["error", "always"]` 强制此规则

## 4. 注释规范

- 生成的代码**必须**有明确的注释
- 类和类方法必须使用 JSDoc 注释（`/** */`）
- 复杂逻辑必须添加行内注释说明意图
- 公共 API 必须包含 `@param` 和 `@returns` 说明
- 注释语言：中文

## 5. 日志与错误处理

- 日志和错误处理**必须使用** `src/core/ErrorHandler.js`
- 导入方式：`import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "@/core/ErrorHandler.js";`
- 使用方式：
- 日志级别：`ERROR_LEVEL`，可选值：`DEBUG`, `WARN`, `ERROR`, `FATAL`
  - 调试：`errorHandler.debug(ERROR_CODE.XXX, "message")`
  - 警告：`errorHandler.warn(ERROR_CODE.XXX, "message")`
  - 错误：`errorHandler.handle(ERROR_CODE.XXX, "message", meta)`
  - 致命：`errorHandler.throw(ERROR_CODE.XXX, "message")`
- **禁止**直接使用 `console.log`、`console.warn`、`console.error`，统一通过 `errorHandler` 输出

## 6. 对外事件（Hooks）

- 对外暴露的事件**必须使用** `src/core/Hooks.js`
- 钩子名称**必须**使用 `src/constants/hookNames.js` 中的 `HOOKS` 常量
- **禁止**硬编码钩子名称字符串
- **必须通过** `workbook.eventHandler` 访问 Hooks 系统，**禁止**直接 `new Hooks()`
- 使用方式（应用开发者 — 通过 Workbook 代理方法）：
  - 添加钩子：`workbook.addHook(HOOKS.XXX, callback)` — 支持 eventHandler 创建前缓存（Early Hooks）
  - 一次性钩子：`workbook.addHookOnce(HOOKS.XXX, callback)`
  - 移除钩子：`workbook.removeHook(HOOKS.XXX, callback)`
  - 触发钩子：`workbook.runHooks(HOOKS.XXX, ...args)`
  - 阻断式触发：`workbook.runHooksUntil(HOOKS.XXX, ...args)` — 返回 `false` 可阻止操作
- 使用方式（内部模块 — 通过 EventHandler 直接操作）：
  - `workbook.eventHandler.runHooks(HOOKS.XXX, ...args)`
  - `workbook.eventHandler.runHooksUntil(HOOKS.XXX, ...args)`
  - `workbook.eventHandler.addHook(HOOKS.XXX, callback)`
- EventBus → Hooks 桥接模式：`sheet.bus.on(SHEET_EVENTS.XXX, (envelope) => { this.runHooks(HOOKS.XXX, ...args); })`
- **禁止**直接 `new EventBus()` 或 `new Hooks()`，应使用已有实例

## 7. 内部事件订阅（EventBus）

- 项目内部的事件订阅/发布**必须使用** `src/core/EventBus.js`
- 事件类型**必须**使用 `src/constants/sheetEvents.js` 中的常量
- **必须通过** `sheet.bus` 访问 EventBus 实例，**禁止**直接 `new EventBus()`
- 使用方式：
  - 订阅：`sheet.bus.on(SHEET_EVENTS.XXX, handler)` — 返回取消函数
  - 发射：`sheet.bus.emit(SHEET_EVENTS.XXX, payload, { source: "ModuleName" })`
  - 监听器接收的是信封对象：`{ source, sheetId, timestamp, type, payload }`
- **禁止**在模块间直接回调通信，应通过 `sheet.bus` 解耦

## 8. 自定义 DOM 组件

- 自定义 DOM 元素**必须继承** `src/core/WebComponent.js`
- **禁止**直接继承 `HTMLElement`，应继承 `WebComponent`
- 参考实现：`src/ui/sheetTab/SheetTabBarElement.js`
- 标准结构模板：
  ```javascript
  import { WebComponent } from "@/core/WebComponent";

  const template = document.createElement("template");
  template.innerHTML = `<style>/* Shadow DOM 样式 */</style>/* Shadow DOM 结构 */`;

  export class MyElement extends WebComponent {
      static get observedAttributes() { return []; }

      onConnect(disposable) {
          // ① 使用 disposable.trackEvent() 注册 DOM 事件（自动清理）
          const btn = this.shadowRoot.querySelector(".btn");
          disposable.trackEvent(btn, "click", this.#handleClick);
      }

      render() {
          // ② 首次渲染：挂载 Shadow DOM 模板
          if (!this.shadowRoot.querySelector(".container")) {
              this.shadowRoot.appendChild(template.content.cloneNode(true));
          }
      }

      onDisconnect() {
          // ③ 清理私有状态（DOM 事件由 Disposable 自动解绑）
      }
  }

  customElements.define("my-element", MyElement);
  ```
- 关键规范：
  - `onConnect(disposable)` — 初始化逻辑，**必须**使用 `disposable.trackEvent(target, eventName, handler)` 注册事件，禁止手动 `addEventListener`
  - `render()` — 首次渲染时将 template 挂载到 `this.shadowRoot`
  - `onDisconnect()` — 清理私有状态（DOM 事件由 Disposable 自动解绑，无需手动 `removeEventListener`）
  - `destroy()` — 显式销毁（设置 `#shouldDestroy` 后移除 DOM），由父组件调用
  - `this.emit(eventName, payload)` — 通过 WebComponent 内置方法发射自定义事件
  - `this.isDestroyed` — 检查组件是否已销毁
  - 组件注册**必须**使用 `customElements.define("tag-name", ClassName)`

## 9. 数据读取（CellDataAccessor）

- 读取单元格数据**必须使用** `sheet.cellDataAccessor`（即 `CellDataAccessor` 实例）
- **禁止**在 Strategy / Plugin / UI 层直接访问 `sheet.cellStore`，应通过 `sheet.cellDataAccessor` 统一访问
- 可用方法：
  - 单个读取：`sheet.cellDataAccessor.get(row, col)` — 返回 `Cell | null`
  - 非空单元格：`sheet.cellDataAccessor.getNonEmptyCells(topRow, topCol, bottomRow, bottomCol)`
  - 值矩阵：`sheet.cellDataAccessor.getValueMatrix(topRow, topCol, bottomRow, bottomCol)`
  - 批量遍历：`sheet.cellDataAccessor.forEach(topRow, topCol, bottomRow, bottomCol, (r, c, cell) => {})`
  - 迭代器：`for (const { row, col, cell } of sheet.cellDataAccessor[Symbol.iterator](...)) {}`
  - 批量写入：`sheet.cellDataAccessor.setRange(topRow, topCol, cells)` — ⚠️ 不触发事件和撤销历史
- 写入操作**必须**使用 `sheet.setCell(r, c, value, styleId)` 以保留撤销/重做功能
- 性能建议：方法开始时缓存引用 `const accessor = sheet.cellDataAccessor;`，避免重复 getter 调用

## 10. 插件开发（BasePlugin）

- 所有自定义插件**必须继承** `src/plugins/BasePlugin.js`
- **禁止**独立实现插件生命周期，应复用 BasePlugin 的自动清理机制
- 参考实现：`src/plugins/AutoFillPlugin.js`
- 标准结构模板：
  ```javascript
  import { BasePlugin } from "./BasePlugin.js";

  export class MyPlugin extends BasePlugin {
      static get PLUGIN_NAME() { return "myPlugin"; }

      init(options = {}) {
          super.init(options);
          // ① 注册钩子（destroy 时自动清理）
          this.addHook(HOOKS.ON_CELL_CLICK, (row, col) => { /* ... */ });
          // ② 注册策略（destroy 时自动清理）
          const strategy = new MyStrategy(this.eventHandler);
          this.addStrategy("myStrategy", strategy);
          
          // ③ 注册 DOM 事件（destroy 时自动清理）
          this.addDOMEvent(canvas, "click", this.#handleClick);
            if (options.enabled === false) {
              this.disable();
          }    
        }

      destroy() {
          // ④ 清理插件私有状态
          // 基类 super.destroy() 会自动清理 hooks/strategies/DOM events
          super.destroy();
      }

      enable() {
          super.enable();
          // ⑤ 启用时恢复策略等
      }

      disable() {
          super.disable();
          // ⑥ 禁用时暂停策略等
      }
  }
  ```
- 生命周期方法：
  - `static get PLUGIN_NAME()` — **必须覆盖**，返回插件唯一标识字符串
  - `init(options)` — 初始化，**必须调用** `super.init(options)`
  - `destroy()` — 销毁，**必须调用** `super.destroy()`（自动清理 hooks/strategies/DOM events）
  - `enable()` / `disable()` — 可选覆盖，**必须调用** `super.enable()` / `super.disable()`
- 资源注册方法（自动跟踪，destroy 时自动清理）：
  - `this.addHook(hookName, callback)` — 注册钩子（禁用时自动跳过回调）
  - `this.addHookOnce(hookName, callback)` — 注册一次性钩子
  - `this.addStrategy(name, strategy)` — 注册事件策略
  - `this.addDOMEvent(target, eventType, handler, options)` — 注册 DOM 事件
- 可用属性（通过 BasePlugin getter 访问）：
  - `this.workbook` — Workbook 实例
  - `this.sheet` — 当前活动工作表
  - `this.renderEngine` — 渲染引擎
  - `this.eventHandler` — 事件处理器
  - `this.editor` — 编辑器管理器
  - `this.hooks` — 钩子系统
  - `this.clipboard` — 剪贴板管理器
  - `this.options` — 插件配置
  - `this.initialized` / `this.enabled` — 状态标志
- **禁止**在插件中手动 `addEventListener` 而不通过 `addDOMEvent`，否则 destroy 时无法自动清理
- **禁止**在插件中直接 `new Hooks()` 或 `new EventBus()`，应使用 `this.hooks` 和 `this.sheet.bus`

## 11. 常量管理

- 所有魔法值（字符串、数字、配置项）**必须**定义为常量，**禁止**硬编码
- 常量文件统一放在 `src/constants/` 目录下
- 常量对象**必须**使用 `Object.freeze()` 冻结，防止运行时修改
- 常量分类与对应文件：
  - DOM 事件名称：`src/constants/eventNames.js` → `EVENT_NAMES.CLICK` / `EVENT_NAMES.KEYDOWN` 等
  - 钩子名称：`src/constants/hookNames.js` → `HOOKS.ON_CELL_CLICK` 等
  - 内部事件：`src/constants/sheetEvents.js` → `SHEET_EVENTS.CELL_CHANGED` 等
  - 错误码：`src/constants/errorCodes.js` → `ERROR_CODE.XXX` / `ERROR_LEVEL.WARN` 等
  - 枚举值：`src/constants/enums/` 目录（`BorderStyle`、`TextAlign`、`ChartType` 等）
  - 核心配置：`src/constants/config.js` → `CONFIG.MAX_ROWS` / `CONFIG.DEFAULT_COL_WIDTH` 等
- 导入方式：`import { EVENT_NAMES } from "@/constants/eventNames";`
- **禁止**在代码中直接使用字符串字面量如 `"click"`、`"keydown"`，应使用 `EVENT_NAMES.CLICK`、`EVENT_NAMES.KEYDOWN`

## 12. 资源生命周期（Disposable）

- 需要管理事件监听器和子对象生命周期的类**应该继承** `src/core/Disposable.js`
- Disposable 核心方法：
  - `trackEvent(target, type, handler, options)` — 注册事件监听器，destroy 时自动移除
  - `trackChild(disposable)` — 注册子 Disposable，父级 destroy 时级联销毁
  - `destroy()` — 幂等销毁入口（**禁止子类覆写**，子类应覆写 `onDestroy()`）
  - `onDestroy()` — 子类覆写钩子，释放特有资源（无需手动 `super.onDestroy()`）
  - `isDisposed` — 检查是否已销毁
- 销毁顺序：标记 disposed → `onDestroy()` → 沿原型链调用所有父类 `onDestroy()` → 移除事件监听器 → 级联销毁子对象
- **禁止**在 Disposable 子类中覆写 `destroy()`，应使用 `onDestroy()` 钩子
- **禁止**手动 `addEventListener` 而不通过 `trackEvent`，否则 destroy 时无法自动清理

## 13. 模块导入路径

- **必须**使用 `@/` 路径别名引用 `src/` 下的模块，**禁止**使用相对路径 `../` 跨越 2 层以上
- 路径别名映射（在 `webpack.config.js` / `jsconfig.json` 中配置）：
  - `@/` → `src/`（主别名，所有模块通用）
  - `@store/` → `src/store/`（状态存储层）
  - `@render/` → `src/render/`（渲染层）
  - `@plugin/` → `src/plugins/`（插件层）
- 导入示例：
  - ✅ `import { errorHandler } from "@/core/ErrorHandler.js";`
  - ✅ `import { CONFIG } from "@/constants/config";`
  - ❌ `import { errorHandler } from "../../../core/ErrorHandler.js";`（层级过深的相对路径）
- 导入**必须**带 `.js` 后缀（项目使用原生 ES Module，无扩展名自动解析）

## 14. 样式操作

- 样式操作**必须**通过 `sheet.styleManager` 进行，**禁止**直接操作 `cell.styleId`
- 样式管理器：`src/workbook/managers/SheetStyleManager.js`
- 可用方法：
  - 设置单元格样式：`sheet.styleManager.setCellStyle(r, c, styleObj)` — 增量合并
  - 设置行样式：`sheet.styleManager.setRowStyle(row, styleObj)`
  - 设置列样式：`sheet.styleManager.setColStyle(col, styleObj)`
  - 清除区域样式：`sheet.styleManager.clearRangeStyle({ topRow, topCol, bottomRow, bottomCol })`
  - 解析最终样式：`sheet.styleManager.resolveStyle(r, c)` — 按优先级合并所有层
  - 使缓存失效：`sheet.styleManager.invalidateCache()` — 样式变更后必须调用
- 样式合并优先级（从低到高）：defaultStyle → colStyle → rowStyle → cellStyle → cellType默认样式 → cellProps.style → conditionalFormat
- **禁止**绕过 styleManager 直接修改 styleId，否则样式缓存不会失效