# Canvas Sheet — AI Agent 上下文

## 项目概述

Canvas Sheet 是一个基于 HTML5 Canvas 的高性能电子表格引擎，使用原生 JavaScript 构建，无框架依赖。
核心渲染通过 Canvas 2D API 实现，UI 组件使用 Web Components（Shadow DOM），状态管理使用自研 ReactiveStore。

## 技术栈

- **语言**：JavaScript（ES Module，无 TypeScript）
- **构建**：Webpack 5 + Babel
- **测试**：Vitest + jsdom
- **Lint**：ESLint 10（flat config）+ eslint-plugin-import-x
- **路径别名**：`@/` → `src/`，`@store/` → `src/store/`，`@render/` → `src/render/`，`@plugin/` → `src/plugins/`
- **模块规范**：导入必须带 `.js` 后缀

## 项目结构

```
src/
├── api/                    # 对外公开 API 入口
├── constants/              # 常量定义（eventNames, hookNames, sheetEvents, config, enums/）
├── core/                   # 核心基础设施
│   ├── Disposable.js       # 生命周期基类（trackEvent / trackChild / destroy）
│   ├── DOMComponent.js     # DOM 组件基类（extends Disposable）
│   ├── WebComponent.js     # Web Components 基类（Shadow DOM + Disposable）
│   ├── ErrorHandler.js     # 统一日志与错误处理
│   ├── EventBus.js         # 内部事件总线（信封模式）
│   ├── EventHandler.js     # 事件处理器（Strategy 模式 + Hooks 桥接）
│   └── Hooks.js            # 对外钩子系统（before/after 拦截）
├── editor/                 # 编辑器与交互策略
│   ├── editors/            # 单元格编辑器（Text, Numeric, Date, Select, Textarea）
│   ├── strategies/         # 事件策略（Mouse, Keyboard, Resize, CopyPaste, AutoFill...）
│   ├── ClipboardManager.js # 剪贴板管理
│   └── EditorManager.js    # 编辑器管理
├── formula/                # 公式引擎
│   ├── FormulaEngine.js    # 公式计算引擎
│   ├── FormulaParser.js    # 公式解析器
│   ├── FormulaEvaluator.js # 公式求值器
│   └── functions/          # 内置函数库（math, statistical, text, logical, lookup, conditional）
├── model/                  # 数据模型层
│   ├── store/              # 单元格存储（ChunkedCellStore + Cell + Chunk）
│   ├── grid/               # 行列管理（RowColManager + RowColSync + CellDataAccessor）
│   ├── selection/          # 选区管理（SelectionManager）
│   ├── merge/              # 合并单元格（MergeManager）
│   ├── history/            # 撤销/重做（HistoryStack）
│   ├── command/            # 命令模式（SetCellCommand, MergeCommand, BatchCommand...）
│   ├── styles/             # 样式池
│   ├── chart/              # 图表模型（ChartModel + ChartManager）
│   └── rules/              # 条件格式规则
├── plugins/                # 插件系统
│   ├── BasePlugin.js       # 插件基类（生命周期 + 资源自动清理）
│   ├── PluginManager.js    # 插件管理器
│   ├── registry.js         # 插件注册表
│   ├── AutoFillPlugin.js   # 自动填充
│   ├── FilterPlugin.js     # 筛选
│   ├── SortPlugin.js       # 排序
│   ├── FreezePlugin.js     # 冻结窗格
│   ├── ChartPlugin.js      # 图表
│   ├── CopyPastePlugin.js  # 复制粘贴
│   ├── ContextMenuPlugin.js# 右键菜单
│   ├── ExportFilePlugin.js # 导出文件
│   ├── ImportFilePlugin.js # 导入文件
│   ├── FormulaPlugin.js    # 公式
│   ├── data-validation/    # 数据验证
│   ├── filter/             # 筛选子模块
│   └── sort/               # 排序子模块
├── render/                 # 渲染层
│   ├── RenderEngine.js     # 渲染引擎
│   ├── BaseLayer.js        # 图层基类
│   ├── LayerCompositor.js  # 图层合成器
│   ├── layers/             # 具体图层（Tile, Selection, Frozen, Header, Interaction, Chart）
│   ├── TileRenderer.js     # 瓦片渲染器
│   ├── HeaderRenderer.js   # 表头渲染器
│   ├── OverlayRenderer.js  # 覆盖层渲染器
│   ├── header/             # 表头布局与绘制
│   └── chart/              # 图表渲染（NativeChartRenderer + 策略模式）
├── state/                  # 响应式状态管理
│   └── ReactiveStore.js    # Proxy-based 响应式存储
├── types/                  # 单元格类型系统
│   ├── BaseColumnType.js   # 列类型基类
│   ├── renderers/          # 自定义渲染器（Checkbox, ProgressBar, StarRating, Sparkline, ColorPreview）
│   └── CellRenderContext.js# 渲染上下文
├── ui/                     # UI 组件层
│   ├── components/         # 通用组件（PopupPanel, PopupManager）
│   ├── sheetTab/           # 工作表标签栏（SheetTabBarElement + SheetTabManager）
│   ├── formulaBar/         # 公式栏（FormulaBarElement + FormulaBarManager）
│   └── ScrollManager.js    # 滚动管理
├── utils/                  # 工具函数
│   ├── utils.js            # 类型判断（isNumber, isFunction, isObject...）
│   ├── canvasUtils.js      # Canvas 绘图工具
│   ├── cellRef.js          # 单元格引用解析
│   └── excelUnits.js       # Excel 单位转换
└── workbook/               # 工作簿与工作表
    ├── Workbook.js         # 工作簿（顶层入口）
    ├── Sheet.js            # 工作表（协调者模式）
    ├── coordinators/       # 协调者（Data, Style, Merge, Operation, Meta）
    ├── managers/           # 管理器（SheetStyleManager, ColumnTypeManager, HeaderLabelManager...）
    └── interfaces/         # 接口定义
```

## 核心架构模式

### 1. 协调者模式（Coordinator Pattern）

Sheet.js 采用协调者模式拆分职责，每个 Coordinator 通过 Sheet 的懒初始化 getter 访问：

```
Sheet.js（协调者，~150 行）
├── SheetDataCoordinator     → sheet.data / sheet.cellDataAccessor
├── SheetStyleCoordinator    → sheet.styleManager
├── SheetMergeCoordinator    → sheet.merges
├── SheetOperationCoordinator→ sheet.undo / sheet.redo / sheet.insertRow
└── SheetMetaCoordinator     → sheet.meta / sheet.colHeaders
```

### 2. 图层架构（Layer Architecture）

渲染采用图层合成模式，每个图层继承 BaseLayer：

```
RenderEngine
└── LayerCompositor
    ├── TileLayer          — 瓦片数据层
    ├── SelectionLayer     — 选区覆盖层
    ├── FrozenLayer        — 冻结区域层
    ├── HeaderLayer        — 表头层
    ├── InteractionLayer   — 交互装饰层
    └── ChartLayer         — 图表层
```

### 3. 策略模式（Strategy Pattern）

事件处理采用策略模式，每种交互对应一个 EventStrategy：

```
EventHandler
├── MouseStrategy          — 鼠标交互
├── KeyboardStrategy       — 键盘交互
├── ResizeStrategy         — 行列调整
├── CopyPasteStrategy      — 复制粘贴
├── AutoFillStrategy       — 自动填充
├── ContextMenuStrategy    — 右键菜单
├── SortStrategy           — 排序
├── ColumnMoveStrategy     — 列移动
└── RowMoveStrategy        — 行移动
```

### 4. 插件体系（Plugin System）

三层架构：Workbook → PluginManager → BasePlugin

```
BasePlugin（基类）
├── addHook() / addHookOnce()   — 注册钩子（自动清理）
├── addStrategy()               — 注册策略（自动清理）
├── addDOMEvent()               — 注册 DOM 事件（自动清理）
├── enable() / disable()        — 启用/禁用
└── destroy()                   — 销毁（自动清理所有资源）
```

### 5. 命令模式（Command Pattern）

撤销/重做通过 Command 对象实现：

```
HistoryStack
├── SetCellCommand        — 单元格值变更
├── MergeCommand          — 合并单元格
├── UnmergeCommand        — 取消合并
├── ToggleDisableCommand  — 禁用/启用单元格
└── BatchCommand          — 批量操作
```

### 6. 生命周期管理（Disposable Pattern）

```
Disposable（基类）
├── trackEvent()  — 注册事件监听器，destroy 时自动移除
├── trackChild()  — 注册子 Disposable，级联销毁
├── destroy()     — 幂等销毁（final，子类不应覆写）
└── onDestroy()   — 子类覆写钩子

WebComponent extends Disposable
├── onConnect(disposable)    — 初始化
├── render()                 — 首次渲染
├── onDisconnect()           — 清理
└── destroy()                — 显式销毁
```

## 关键实例访问路径

| 需求 | 访问路径 | 说明 |
|------|---------|------|
| 读取单元格 | `sheet.cellDataAccessor` | CellDataAccessor 实例 |
| 写入单元格 | `sheet.setCell(r, c, value, styleId)` | 保留撤销/重做 |
| 样式操作 | `sheet.styleManager` | SheetStyleManager 实例 |
| 对外事件 | `workbook.eventHandler` / `workbook.addHook()` | Hooks 系统 |
| 内部事件 | `sheet.bus` | EventBus 实例 |
| 选区 | `sheet.selection` | SelectionManager 实例 |
| 行列尺寸 | `sheet.rowColManager` | RowColManager 实例 |
| 合并单元格 | `sheet.merges` | SheetMergeCoordinator 懒初始化 |
| 撤销/重做 | `sheet.history` | HistoryStack 实例 |
| 渲染 | `workbook.renderEngine` | RenderEngine 实例 |
| 编辑器 | `workbook.editorManager` | EditorManager 实例 |
| 剪贴板 | `workbook.clipboardManager` | ClipboardManager 实例 |

## 编码规范速查

| 场景 | 正确 ✅ | 错误 ❌ |
|------|---------|---------|
| 类型判断 | `isNumber(x)` | `typeof x === "number"` |
| 日志输出 | `errorHandler.debug(CODE, "msg")` | `console.log("msg")` |
| DOM 事件 | `disposable.trackEvent(el, "click", fn)` | `el.addEventListener("click", fn)` |
| 钩子注册 | `workbook.addHook(HOOKS.ON_CELL_CLICK, cb)` | `workbook.addHook("onCellClick", cb)` |
| 内部事件 | `sheet.bus.emit(EVENTS.XX, payload)` | `callback(payload)` |
| 常量引用 | `EVENT_NAMES.CLICK` | `"click"` |
| 模块导入 | `import {} from "@/core/X.js"` | `import {} from "../../../core/X.js"` |
| 样式设置 | `sheet.styleManager.setCellStyle(r, c, obj)` | `cell.styleId = newId` |
| 数据读取 | `sheet.cellDataAccessor.get(r, c)` | `sheet.cellStore.get(r, c)` |
| 插件开发 | `class P extends BasePlugin` | 独立实现生命周期 |
| DOM 组件 | `class E extends WebComponent` | `class E extends HTMLElement` |
| 生命周期 | `onDestroy()` 钩子 | 覆写 `destroy()` |

## 测试

- 测试框架：Vitest + jsdom
- 测试目录：`tests/`
- 运行命令：`npx vitest run`
- 覆盖率：`npx vitest run --coverage`

## 构建

- 开发：`npm run dev`（webpack-dev-server，端口 9000）
- 生产：`npm run build`（Webpack + Terser）
- 库构建：`npm run build:lib`（ESM + UMD 双格式）
- Lint：`npx eslint src/`