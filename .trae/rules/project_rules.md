# 项目规则

## 1. ESLint 合规性

- 生成的代码**必须**符合 `eslint.config.mjs` 的配置
- 每次修改代码后，应运行 `npx eslint <file>` 验证合规性
- 禁止使用 ESLint 配置中禁止的语法和模式

## 2. 数据类型判断

- 判断数据类型时**优先使用** `src/utils/helper.js` 中提供的工具函数
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

### 4.1 JSDoc 访问权限标识规范

**强制要求：所有 JSDoc 注释必须在首行明确标识方法的访问权限**

#### 标识格式

```javascript
/**
 * @private 私有方法 - 方法简述
 * 详细说明...
 */

/**
 * @static 静态公共方法 - 方法简述
 * 详细说明...
 */

/**
 * @static @private 静态私有字段 - 字段简述
 */
```

#### 分类与示例

| 类型 | JSDoc 标识 | 代码声明 | 适用场景 |
|------|-----------|---------|---------|
| 公共实例方法 | 无需特殊标识（默认） | `methodName() {}` | 对外暴露的API |
| 私有实例方法 | `@private 私有方法 - 简述` | `#methodName() {}` | 内部实现细节 |
| 公共静态方法 | `@static 静态公共方法 - 简述` | `static methodName() {}` | 工具函数、工厂方法 |
| 私有静态方法/字段 | `@static @private 静态私有 - 简述` | `static #FIELD = value` | 内部常量、配置 |

#### 实际应用示例

✅ **正确示例：**
```javascript
class FormulaEngine {
    /**
     * @private 私有方法 - 生成单元格的唯一标识键
     *
     * 将工作表名、行号、列号组合成唯一的字符串键，
     * 用于在依赖图Map中标识特定单元格。
     */
    #cellKey(sheetName, row, col) {
        return `${sheetName}!${row},${col}`;
    }

    /**
     * @static @private 静态私有字段 - 单元格键的正则表达式模式
     */
    static #CELL_KEY_RE = /^(.+)!(\d+),(\d+)$/;

    /**
     * @static 静态公共方法 - 注册自定义公式函数
     *
     * 允许用户向公式引擎添加自定义函数。
     */
    static registerFunction(name, fn) {
        functionRegistry.register(name, fn, { category: "custom" });
    }

    /**
     * 公共方法 - 设置单元格公式（默认无需标识）
     *
     * 解析公式字符串并建立依赖关系。
     */
    setFormula(sheet, row, col, formulaStr) {
        // ...
    }
}
```

❌ **错误示例：**
```javascript
// ❌ 缺少访问权限标识
/**
 * 生成单元格的唯一标识键
 * 将工作表名、行号、列号组合成唯一的字符串键
 */
#cellKey(sheetName, row, col) { ... }

// ❌ 静态方法未标识
/**
 * 注册自定义公式函数
 */
static registerFunction(name, fn) { ... }

// ❌ 私有字段未标识
static #CELL_KEY_RE = /^(.+)!(\d+),(\d+)$/;
```

#### 检查清单

在代码审查时，请验证以下要点：

- [ ] **每个私有方法**（以 `#` 开头）的 JSDoc 是否以 `@private 私有方法 -` 开头？
- [ ] **每个静态方法**（`static` 关键字）的 JSDoc 是否包含 `@static` 标识？
- [ ] **静态私有成员**是否同时标注 `@static @private`？
- [ ] **公共实例方法**可以省略标识（但建议添加功能描述）？
- [ ] 标识格式是否符合：`@{type} {描述} - {简短功能说明}`？

#### 为什么需要此规范？

1. **IDE 支持更好**：VS Code、WebStorm 等 IDE 可识别这些标记，提供更精准的代码提示
2. **文档生成自动化**：JSDoc、TypeDoc 等工具可自动生成分类清晰的 API 文档
3. **代码可读性提升**：开发者一眼就能区分方法的可见性和类型，降低认知负担
4. **团队协作规范**：明确的访问权限标识有助于代码审查和维护
5. **重构安全性**：清晰标识私有成员可防止误修改内部实现

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
## 15. 策略优先级管理（EventStrategy）

- **必须**使用 `src/constants/strategyPriority.js` 中定义的 `STRATEGY_PRIORITY` 常量设置策略优先级
- **禁止**直接使用魔法数字（如 `priority = 120`），应使用语义化常量

### 优先级体系架构（V3.0 - 100 间隔线性递增）

采用 **100 为基准的大间隔线性递增**：100 → 200 → 300 → ... → 1100

**核心设计理念：**
- 百位数直接表示层级编号（1xx=基础层, 2xx=标准层, 3xx=高级层, 10xx+ =关键层）
- 每个主锚点之间预留 99 个位置，提供极致的扩展能力
- 纯线性递增，符合人类十进制直觉，零学习成本

#### 四层优先级体系

| 层级 | 数值范围 | 层级标识 | 适用场景 | 主锚点示例 |
|------|---------|---------|---------|-----------|
| Layer 1 | 100 - 299 | 基础操作层 | 键盘输入、快捷键 | KEYBOARD_BASE(100), SHORTCUT_KEY(200) |
| Layer 2 | 300 - 599 | 标准交互层 | 鼠标行为、UI组件、单元格类型 | MOUSE_DEFAULT(300), CELL_TYPE_INTERACTION(400), POPUP_UI(500) |
| Layer 3 | 600 - 999 | 高级功能层 | 拖拽操作、智能功能、特殊对象 | ROW_COLUMN_MOVE(600), AUTO_FILL(700), CHART_INTERACTION(800), RESIZE_LAYOUT(900) |
| Layer 4 | 1000+ | 关键操作层 | 数据结构变更、全局性影响操作 | DATA_SORT(1000), DATA_FILTER(1100) |

### 使用规范

#### ✅ 正确示例

```javascript
import { EventStrategy } from "@/editor/strategies/EventStrategy.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";

export class MyStrategy extends EventStrategy {
    /** 
     * 策略优先级
     * 使用语义化常量，值为 300（Layer 2 标准交互层的基准值）
     * @type {number} 
     */
    priority = STRATEGY_PRIORITY.MOUSE_DEFAULT;
    
    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => this.#handleMouseDown(e),
        };
    }
}
```

#### ❌ 错误示例

```javascript
export class BadStrategy extends EventStrategy {
    // ❌ 禁止：魔法数字，无法看出优先级意图
    priority = 120;  
    
    // ❌ 禁止：不符合 100 间隔规范
    priority = 55;
}
```

### 扩展指南

当需要新增策略时，按以下步骤确定优先级：

1. **确定所属层级**
   - 基础功能（键盘、快捷键）→ Layer 1 (100-299)
   - 标准交互（鼠标、UI）→ Layer 2 (300-599)
   - 高级功能（拖拽、图表）→ Layer 3 (600-999)
   - 关键操作（排序、筛选）→ Layer 4 (1000+)

2. **选择具体数值**
   
   **方式 A: 使用工具函数自动计算**
   ```javascript
   import { PriorityUtils } from '@/constants/strategyPriority.js';
   
   // 在 MOUSE_DEFAULT(300) 和 CELL_TYPE_INTERACTION(400) 之间计算
   const myPriority = PriorityUtils.between(
       STRATEGY_PRIORITY.MOUSE_DEFAULT,      // 300
       STRATEGY_PRIORITY.CELL_TYPE_INTERACTION, // 400
       'middle'  // 返回 350
   );
   ```
   
   **方式 B: 手动选择（推荐间隔 ≥ 20）**
   ```javascript
   // 在 300 和 400 之间的合理选择：
   priority = 320;  // 接近下层
   priority = 350;  // 中间位置
   priority = 380;  // 接近上层
   ```

3. **验证唯一性**
   ```javascript
   import { PriorityUtils } from '@/constants/strategyPriority.js';
   
   const result = PriorityUtils.validate(myPriority);
   console.log(result.valid, result.message);  // 检查是否合法
   ```

### 已有策略优先级清单

| 策略类名 | 常量名称 | 优先级值 | 层级 | 说明 |
|---------|---------|---------|------|------|
| KeyboardStrategy | KEYBOARD_BASE | 100 | Layer 1 | 基础键盘输入 |
| CopyPasteStrategy | SHORTCUT_KEY | 200 | Layer 1 | 快捷键操作 |
| MouseStrategy | MOUSE_DEFAULT | 300 | Layer 2 | 默认鼠标行为 |
| InteractionPlugin* | CELL_TYPE_INTERACTION | 400 | Layer 2 | 单元格类型交互 |
| FilterStrategy | POPUP_UI | 500 | Layer 2 | 弹出式 UI 组件 |
| RowMoveStrategy | ROW_COLUMN_MOVE | 600 | Layer 3 | 行列拖拽移动 |
| ColumnMoveStrategy | ROW_COLUMN_MOVE | 600 | Layer 3 | 行列拖拽移动 |
| AutoFillStrategy | AUTO_FILL | 700 | Layer 3 | 自动填充 |
| ChartSelectionStrategy | CHART_INTERACTION | 800 | Layer 3 | 图表选择/移动/缩放 |
| ResizeStrategy | RESIZE_LAYOUT | 900 | Layer 3 | 行列大小调整 |
| SortStrategy | DATA_SORT | 1000 | Layer 4 | 数据排序 |

> *注：InteractionPlugin 未来重构为 EventStrategy 后使用此优先级

### 工具函数说明

`src/constants/strategyPriority.js` 提供 `PriorityUtils` 工具对象：

- **`between(lower, higher, position)`**: 在两个锚点间生成新优先级
  - position: `'early'` (25%位置) | `'middle'` (50%位置) | `'late'` (75%位置)
  
- **`validate(priority)`**: 验证优先级合法性
  - 返回 `{ valid: boolean, message: string }`
  
- **`getLayerInfo(priority)`**: 获取层级信息
  - 返回 `{ layer: number, name: string, range: string, description: string }`

### 设计原则总结

1. **语义化优先**: 使用常量而非魔法数字
2. **层级清晰**: 百位数体现功能重要性
3. **扩展友好**: 每层预留充足空间（99个位置）
4. **团队协作**: 零学习成本，新人 3 秒理解
5. **未来-proof**: 支持 1900+ 策略，100 年够用

### 导入方式

```javascript
// 导入优先级常量
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";

// 导入工具函数（可选）
import { PriorityUtils } from "@/constants/strategyPriority.js";

// 同时导入两者
import { STRATEGY_PRIORITY, PriorityUtils } from "@/constants/strategyPriority.js";
```

## 16. 图层 Z-Index 管理（Layer Rendering）

- **必须**使用 `src/constants/layerZIndex.js` 中定义的 `LAYER_Z_INDEX` 常量设置图层顺序
- **禁止**直接使用魔法数字（如 `zIndex = 350`），应使用语义化常量

### 图层 Z-Index 体系架构（100 间隔线性递增）

采用 **100 为基准的大间隔线性递增**：100 → 200 → 300 → ... → 600

**核心设计理念：**
- 数值越小表示图层越靠下（先渲染，作为背景）
- 数值越大表示图层越靠上（后渲染，覆盖上层）
- 每层之间预留 99 个位置，支持插入子图层或特效层
- 线性递增策略，与策略优先级体系保持一致的设计哲学

#### 六层渲染体系（从底到顶）

| 层级 | Z-Index | 层名 | 渲染内容 | 视觉效果 |
|------|---------|------|---------|---------|
| Layer 1 | 100 | TILE (瓦片层) | 非冻结区域的单元格数据、文本、边框 | 最底层背景 |
| Layer 2 | 200 | SELECTION (选区层) | 选区高亮、合并单元格边框、拖拽指示器 | 覆盖在瓦片之上 |
| Layer 3 | 300 | FROZEN (冻结层) | 冻结区域瓦片、冻结线效果 | 固定不滚动的内容 |
| Layer 4 | 400 | CHART (图表层) | 图表对象渲染 | 浮动在数据之上 |
| Layer 5 | 500 | INTERACTION (交互层) | 编辑框、调整指示线、调试信息、临时UI | 用户交互反馈 |
| Layer 6 | 600 | HEADER (表头层) | 行号列标题、表头背景 | 最顶层固定元素 |

### 渲染流程说明

```
渲染顺序（Canvas 绘制调用顺序）：

1️⃣ TILE (100)     → 清空画布 → 绘制所有可见瓦片 → 单元格背景+文字+网格线
                    ↓
2️⃣ SELECTION (200) → 绘制当前选区高亮 → 合并单元格边框 → 拖拽预览
                    ↓
3️⃣ FROZEN (300)   → 绘制冻结区域瓦片 → 冻结线分隔符
                    ↓
4️⃣ CHART (400)    → 绘制图表对象 → 图片→ 形状等浮动元素
                    ↓
5️⃣ INTERACTION (500) → 绘制活动编辑框 → Resize手柄 → 调试信息
                    ↓
6️⃣ HEADER (600)   → 绘制行号列标题 → 表头背景 → 最终合成输出
```

### 使用规范

#### ✅ 正确示例

```javascript
import { LAYER_Z_INDEX } from "@/constants/layerZIndex.js";

class CustomRenderer {
    /**
     * 渲染自定义组件到指定图层
     * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
     */
    render(ctx) {
        // ✅ 使用语义化常量
        this.zIndex = LAYER_Z_INDEX.CHART;  // = 400，图表层级
        
        // 或者相对于标准图层的偏移
        this.zIndex = LAYER_Z_INDEX.SELECTION + 50;  // = 250，在选区和冻结之间
        
        ctx.save();
        // ... 绘制逻辑
        ctx.restore();
    }
}
```

#### ❌ 错误示例

```javascript
class BadRenderer {
    // ❌ 禁止：魔法数字，无法看出图层意图
    zIndex = 350;
    
    // ❌ 禁止：不符合 100 间隔规范
    zIndex = 123;
    
    // ❌ 禁止：负数或过大数值
    zIndex = -100;
    zIndex = 9999;
}
```

### 扩展指南

当需要新增自定义图层时，按以下步骤确定 z-index：

1. **确定视觉层级**
   - 背景类（水印、网格辅助线）→ TILE 附近 (100-199)
   - 数据标注类（批注、条件格式标记）→ SELECTION 附近 (200-299)
   - 特殊区域类（打印区域、分页符）→ FROZEN 附近 (300-399)
   - 浮动对象类（图片、形状、批注框）→ CHART 附近 (400-499)
   - 临时 UI 类（工具提示、下拉菜单）→ INTERACTION 附近 (500-599)
   - 全局覆盖类（加载遮罩、错误提示）→ HEADER 以上 (600+)

2. **选择具体数值**

   **方式 A: 相对于主锚点偏移（推荐）**
   ```javascript
   import { LAYER_Z_INDEX } from "@/constants/layerZIndex.js";
   
   // 在选区层(200)和冻结层(300)之间：
   const myZIndex = LAYER_Z_INDEX.SELECTION + 50;    // = 250
   
   // 在图表层(400)之后：
   const chartAnnotationZIndex = LAYER_Z_INDEX.CHART + 30;  // = 430
   
   // 在交互层(500)之前：
   const tooltipZIndex = LAYER_Z_INDEX.INTERACTION - 20;  // = 480
   ```
   
   **方式 B: 使用固定值（需确保唯一性）**
   ```javascript
   // 批注图层：在选区之后、冻结之前
   const COMMENT_LAYER = 250;
   
   // 工具提示层：在交互层内靠前位置
   const TOOLTIP_LAYER = 520;
   
   // 全局遮罩层：高于所有图层
   const OVERLAY_LAYER = 700;
   ```

3. **验证合理性**
   ```javascript
   // 检查是否在合理范围内
   if (zIndex < 0 || zIndex > 1000) {
       console.warn('Z-Index 超出推荐范围 (0-1000)');
   }
   
   // 检查是否与现有图层冲突
   const existingLayers = [100, 200, 300, 400, 500, 600];
   if (existingLayers.includes(zIndex)) {
       console.warn('Z-Index 与现有主图层冲突');
   }
   ```

### 已有图层清单

| 常量名称 | Z-Index 值 | 层级 | 典型用途 | 渲染时机 |
|---------|-----------|------|---------|---------|
| TILE | 100 | Layer 1 | 瓦片渲染、单元格数据 | 每帧首先渲染 |
| SELECTION | 200 | Layer 2 | 选区高亮、合并边框 | 数据渲染后 |
| FROZEN | 300 | Layer 3 | 冻结区域、分隔线 | 选区之后 |
| CHART | 400 | Layer 4 | 图表、浮动对象 | 冻结层之上 |
| INTERACTION | 500 | Layer 5 | 编辑框、临时UI | 交互响应时 |
| HEADER | 600 | Layer 6 | 行号列标题 | 最后渲染 |

### 设计原则总结

1. **语义化优先**: 使用常量而非魔法数字，代码自解释
2. **层级清晰**: 数值大小直观反映叠加顺序
3. **扩展友好**: 每层预留 99 个位置，支持子图层插入
4. **性能优化**: 按 Z-Index 排序批量渲染，减少 Canvas 状态切换
5. **一致性**: 与策略优先级体系(V3.0)保持相同的 100 间隔设计哲学

### 导入方式

```javascript
// 导入图层常量
import { LAYER_Z_INDEX } from "@/constants/layerZIndex.js";

// 使用示例
const rendererConfig = {
    backgroundZIndex: LAYER_Z_INDEX.TILE,           // = 100
    selectionZIndex: LAYER_Z_INDEX.SELECTION,       // = 200
    chartZIndex: LAYER_Z_INDEX.CHART,               // = 400
    overlayZIndex: LAYER_Z_INDEX.HEADER + 100,      // = 700（自定义扩展）
};
```

## 17. 列类型默认样式（Column Type Default Styles）

- 列类型的**默认样式必须在主题配置中定义**，**禁止**在 Column Type 类中使用 `getDefaultStyle()` 方法
- 主题配置文件：`src/theme/config.js` 中的 `defaultThemeConfig.config.cell`
- **原因**：主题配置集中管理所有单元格类型的默认样式，便于统一修改和切换主题

### 主题配置结构

```javascript
// src/theme/config.js
export const defaultThemeConfig = {
    name: "default",
    config: {
        cell: {
            // 默认样式
            default: { ... },
            // 各类型样式（必须为每个 Column Type 定义）
            numeric: { ... },
            text: { ... },
            date: { ... },
            boolean: { ... },
            checkbox: { ... },    // ← CheckboxColumnType
            hyperlink: { ... },
            textarea: { ... },
        },
    },
};
```

### 列类型与主题样式映射

| Column Type 类 | 主题样式键 | 说明 |
|---------------|-----------|------|
| NumericColumnType | `cell.numeric` | 数字类型居右对齐 |
| TextColumnType | `cell.text` | 文本类型居左对齐 |
| DateColumnType | `cell.date` | 日期类型居中对齐 |
| CheckboxColumnType | `cell.boolean` | 布尔类型居中对齐 |
| CheckboxColumnType | `cell.checkbox` | 复选框类型居中对齐 |
| HyperlinkColumnType | `cell.hyperlink` | 超链接类型下划线 |
| TextAreaColumnType | `cell.textarea` | 多行文本类型 |

### 添加新 Column Type 的样式配置

#### 步骤 1: 在 `src/theme/config.js` 中添加主题样式

```javascript
// defaultThemeConfig.config.cell 中添加
export const defaultThemeConfig = {
    config: {
        cell: {
            // ... 其他类型
            myNewType: {
                fontFamily: "Microsoft YaHei",
                fontSize: 14,
                fontWeight: "normal",
                color: "#333",
                backgroundColor: "transparent",
                textAlign: "center",      // ← 根据需求设置对齐方式
                verticalAlign: "middle",
                textDecoration: "none",
            },
        },
    },
};
```

#### 步骤 2: 在 `ThemeStyleProvider.js` 中注册映射

```javascript
// src/theme/ThemeStyleProvider.js
const typeToStyleMap = {
    // ... 其他类型
    myNewType: "cell.myNewType",
};
```

#### 步骤 3: 创建 Column Type 类（**不要**实现 `getDefaultStyle()`）

```javascript
// src/types/MyNewColumnType.js
export class MyNewColumnType extends BaseColumnType {
    get name() { return "myNewType"; }
    get editorType() { return "text"; }

    // ✅ 正确：不实现 getDefaultStyle()
    // ✅ 正确：不在这里定义默认样式

    format(value) { ... }
    parse(input) { ... }
    validate(value) { ... }
}
```

### ❌ 错误示例

```javascript
// ❌ 禁止：在 Column Type 中使用 getDefaultStyle()
export class BadColumnType extends BaseColumnType {
    get name() { return "bad"; }

    // ❌ 错误：应该在主题配置中定义
    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: "center" };
    }
}
```

### 设计原则总结

1. **样式集中管理**：所有单元格类型的默认样式在主题配置中统一定义
2. **主题一致性**：切换主题时自动应用新主题的样式定义
3. **易于维护**：修改样式只需改一处，无需修改多个 Column Type 类
4. **扩展性强**：支持自定义主题覆盖默认样式
## 17. if 语句大括号规范

- 所有 `if` / `else if` / `else` 语句**必须**使用大括号 `{}` 包裹代码块，**禁止**省略大括号的单行写法
- 即使代码块只有一行，也**必须**用大括号包裹
- 原因：
  - 省略大括号容易在后续添加语句时遗漏大括号，导致逻辑错误
  - 大括号使代码结构更清晰，减少代码审查时的歧义
  - 符合主流代码规范（如 ESLint `curly: ["error", "all"]`）

#### ✅ 正确示例

```javascript
if (!chart) { return null; }
if (updates.offsetX !== undefined) { chart.offsetX = updates.offsetX; }
if (value > 0) {
    doSomething();
}
```

#### ❌ 错误示例

```javascript
if (!chart) return null;
if (updates.offsetX !== undefined) chart.offsetX = updates.offsetX;
if (value > 0) doSomething();
```