# 📊 Canvas Spreadsheet Engine

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.15-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-green.svg" alt="License" />
  <img src="https://img.shields.io/badge/TypeScript-Ready-blue.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/JavaScript-ES6%2B-yellow.svg" alt="Language" />
  <a href="#技术架构"><img src="https://img.shields.io/badge/Web_Components-Custom_Elements-orange.svg" alt="Web Components" /></a>
</p>

<p align="center">
  <strong>高性能 Canvas 渲染的 Web 电子表格引擎</strong><br/>
  基于 Canvas API + Web Components 的现代化表格解决方案<br/>
  支持 10万+ 行数据流畅渲染、公式计算、数据验证、图表可视化<br/>
  <strong>完整 TypeScript 类型支持</strong> — 开箱即用的类型定义
</p>

---

## 📖 目录

- [✨ 核心特性](#核心特性)
- [🚀 快速开始](#快速开始)
- [📘 TypeScript 支持](#typescript-支持)
- [🏗️ 技术架构](#技术架构)
- [📦 安装与构建](#安装与构建)
- [💻 API 参考](#api-参考)
- [🪝 Hooks 钩子系统](#hooks-钩子系统)
- [🎨 自定义与扩展](#自定义与扩展)
- [📋 已完成功能](#已完成功能)
- [🔮 待开发功能](#待开发功能)
- [🤝 贡献指南](#贡献指南)
- [📄 许可证](#许可证)

---

## ✨ 核心特性

### 🎯 极致性能
- ✅ **Canvas 硬件加速渲染**
- ✅ **瓦片化渲染架构** (Tile Rendering) — 只绘制可视区域
- ✅ **智能缓存机制** — TileCache + ChartCache 双层缓存
- ✅ **支持 100,000+ 行**数据流畅滚动（在主流桌面浏览器环境下实测），实际性能受硬件配置、浏览器实现、单元格复杂度影响，建议在目标环境中自行验证

### 🧮 强大的公式系统
- ✅ **Excel 兼容语法** — `=SUM(A1:A100)`, `=VLOOKUP(...)`
- ✅ **52 个内置函数** — 数学(13)、统计(9)、逻辑(7)、文本(13)、查找(4)、条件(6)，全部经过测试验证
- ✅ **自定义函数注册** — `functionRegistry.register('MYFUNC', impl)`
- ✅ **循环引用检测** — 防止无限递归
- ✅ **惰性求值** — 按需计算，避免不必要的开销

### 🎨 丰富的数据类型
- ✅ **11 种列类型**:
  - 基础数据类型 (6种): text, numeric, date, select, textarea, hyperlink
  - 可视化渲染器 (5种): checkbox, progressBar, starRating, sparkline, colorPreview
- ✅ **可扩展的类型系统** — 继承 `BaseColumnType` 创建自定义类型
- ✅ **增强的日期解析** — 支持如 "2021年05月10日" 等中文日期格式

### 📊 企业级图表系统
- ✅ **10 类内置图表类型**（全部经过测试验证）:
  - 柱状图 (Bar)、折线图 (Line)、饼图 (Pie)、面积图 (Area)
  - 散点图 (Scatter)、K线图 (Candlestick)、仪表盘 (Gauge)
  - 漏斗图 (Funnel)、雷达图 (Radar)、热力图 (Heatmap)
- ✅ **自定义图表** — 继承 `BaseChartStrategy` 创建任意图表类型，通过 `NativeChartRenderer.register()` 注册
- ✅ **策略模式架构** — `ChartRendererFactory` → `NativeChartRenderer` → `BaseChartStrategy`，每层可扩展
- ✅ **ECharts 桥接预留** — `ChartRendererFactory` 支持 ECharts 类型分发（treemap、sunburst 等）
- ✅ **多图表支持** — 同一 Sheet 中可导出多张图表
- ✅ **数据联动** — 图表与数据的实时同步更新
- ✅ **Tooltip 提示** — 图表悬浮提示功能，支持自定义格式化
- ✅ **命中测试** — 点击/悬停检测，`hitTest()` 可覆写
- ✅ **高清导出** — `renderWithPixelRatio()` 支持指定像素比渲染
- ✅ **样式导出** — 支持带样式的图表导出到 Excel

### 🔌 插件化架构
- ✅ **20+ 内置插件** — 冻结窗格、排序、筛选、搜索、自动填充、数据验证...
- ✅ **事件驱动** — EventBus + Hooks 双向通信机制
- ✅ **策略模式** — 键盘、鼠标、复制粘贴等行为可定制
- ✅ **Hook 事件系统** — 完善的生命周期钩子和功能钩子

### 🛡️ 企业级特性
- ✅ **数据验证规则** — 必填、唯一性、正则表达式、范围限制、自定义公式验证
- ✅ **条件格式** — 基于规则的动态样式应用
- ✅ **撤销/重做栈** — Command Pattern 实现的完整历史记录
- ✅ **合并单元格** — 支持跨行跨列合并
- ✅ **多工作表管理** — SheetTab 切换与管理
- ✅ **导入导出功能** — 企业级 Excel 导入导出（嵌套表头、样式、列宽行高、图表）
- ✅ **筛选功能** — 支持 text/numeric/date 类型，支持正则匹配过滤
- ✅ **搜索替换** — 全文搜索、正则匹配、导航定位、结果高亮
- ✅ **主题系统** — 2 种内置主题 (Default/Light + Dark) + 自定义主题注册能力
- ✅ **批量操作** — 批量更新选区内数据

---

## 🚀 快速开始

### 📦 NPM 安装

```bash
npm install @canvas-sheet/core
```

### 💻 最简示例

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Canvas Spreadsheet Demo</title>
    <style>
        #spreadsheet-container {
            width: 800px;
            height: 600px;
            border: 1px solid #ddd;
        }
    </style>
</head>
<body>
    <canvas id="spreadsheet-container"></canvas>

    <!-- 方式1: UMD 全局变量 -->
    <script src="./dist/canvas-sheet.umd.js"></script>
    <script>
        const container = document.getElementById('spreadsheet-container');

        const workbook = new CanvasSheet.Workbook(container, {
            startRows: 100,
            startCols: 26,
            defaultStyle: {
                fontSize: 14,
                fontFamily: 'Microsoft YaHei'
            }
        });
        const sheet = workbook.activeSheet;

        sheet.setCell(0, 0, 'Hello World');
        sheet.setCell(1, 0, 42);
        sheet.setCell(2, 0, '=SUM(A1:A10)');

        sheet.setCellStyle(0, 0, {
            color: 'red',
            fontWeight: 'bold',
            textAlign: 'center',
            backgroundColor: '#fff'
        });
    </script>
</body>
</html>
```

### 🎯 ES Module 方式（推荐）

```javascript
import { Workbook } from '@canvas-sheet/core';

const container = document.getElementById('spreadsheet-container');
const wb = new Workbook(container, {
    width: window.innerWidth,
    height: window.innerHeight,
    startRows: 1000,
    startCols: 50,
    defaultStyle: {
        fontSize: 13,
        fontFamily: 'Arial',
        textAlign: 'left'
    }
});

wb.activeSheet.loadData([
    ["姓名", "年龄", "城市"],
    ["张三", 30, "北京"],
    ["李四", 25, "上海"],
]);
```

---

## 📘 TypeScript 支持

`@canvas-sheet/core` 自 v1.0.15 起提供**完整的 TypeScript 类型定义**，无需额外安装 `@types` 包。

### 类型解析机制

```
import { Workbook } from "@canvas-sheet/core"
  │
  ├─ TypeScript → package.json exports["."].types → ./dist/types/api/index.d.ts
  ├─ ESM 运行时 → exports["."].import              → ./dist/canvas-sheet.esm.mjs
  └─ CJS 运行时 → exports["."].require             → ./dist/canvas-sheet.umd.js
```

### 消费者项目配置

确保 `tsconfig.json` 中 `moduleResolution` 支持 `exports` 字段：

```jsonc
{
    "compilerOptions": {
        "module": "ESNext",
        "moduleResolution": "bundler",   // "node16" | "nodenext" 亦可
        "strict": true,
        "skipLibCheck": true
    }
}
```

> **说明**：`moduleResolution: "bundler"` / `"node16"` / `"nodenext"` 会读取 `package.json` 的 `exports.types` 条件。旧的 `"node"` 模式回退到顶层 `types` 字段，也能工作。

### 导入方式

#### 值 + 类型同时导入

```typescript
import { Workbook, BasePlugin, EVENT_NAMES, HOOKS, CONFIG } from "@canvas-sheet/core";

const workbook = new Workbook(document.getElementById("app")!);
```

#### 仅导入类型（零运行时开销）

```typescript
import type { Workbook, BasePlugin } from "@canvas-sheet/core";

// 或内联 type 修饰符
import { type Workbook, EVENT_NAMES } from "@canvas-sheet/core";
```

#### 类型标注

```typescript
import { Workbook, BasePlugin, BaseColumnType } from "@canvas-sheet/core";

const workbook: Workbook = new Workbook(container);

class MyPlugin extends BasePlugin {
    static get PLUGIN_NAME() { return "myPlugin"; }
    onInit() { console.log("initialized"); }
}

Workbook.registerColumnType("myCol", BaseColumnType);
```

### 完整 TypeScript 使用示例

```typescript
import {
    Workbook,
    ReactiveStore,
    BasePlugin,
    PluginManager,
    AutoFillPlugin,
    WebComponent,
    DOMComponent,
    Disposable,
    FormulaEngine,
    FormulaEvaluator,
    BaseColumnType,
    themeStyleProvider,
    functionRegistry,
    FUNCTION_CATEGORY,
    BaseLayer,
    ViewportTransform,
    AUTO_FILL_DIR,
    BORDER_STYLE,
    CHART_TYPE,
    CONTENT_TYPE,
    ERROR_STYLE,
    FONT_STYLE,
    SCROLL_AXIS,
    SORT_ARROW_DIR,
    SORT_ORDER,
    STYLE_SCOPE,
    TEXT_ALIGN,
    VALIDATION_RULE_TYPE,
    VERTICAL_ALIGN,
    EVENT_NAMES,
    HOOKS,
    SHEET_EVENTS,
    CONFIG,
    HIT_TYPE,
    LAYER_Z_INDEX
} from "@canvas-sheet/core";

const appEl = document.getElementById("app")!;
const workbook = new Workbook(appEl);

Workbook.registerPlugin("autoFill", AutoFillPlugin);
workbook.loadPlugin("autoFill");

const sheet = workbook.addSheet("Sheet1");

sheet.setCell(0, 0, "Hello");
sheet.setCell(0, 1, 42);
sheet.setCell(0, 2, "=A1&B1");

const engine = new FormulaEngine(sheet);
const result = engine.evaluateFormula("=SUM(A1:A10)");

functionRegistry.register(
    "MY_FUNC",
    (args: unknown[]) => args[0] || 0,
    { category: FUNCTION_CATEGORY.MATH }
);

class MyPlugin extends BasePlugin {
    static get PLUGIN_NAME() { return "myPlugin"; }
    onInit() { console.log("MyPlugin initialized"); }
}

Workbook.registerPlugin("myPlugin", MyPlugin);
workbook.loadPlugin("myPlugin");

const store = new ReactiveStore();
store.subscribe((state: unknown) => { console.log("State changed:", state); });

themeStyleProvider.setTheme("dark");

console.log(CONFIG, EVENT_NAMES, HOOKS, SHEET_EVENTS, HIT_TYPE, LAYER_Z_INDEX);
```

### 导出的类型与常量总览

| 分类 | 导出名称 | 说明 |
|------|---------|------|
| **核心类** | `Workbook` | 工作簿顶层管理对象 |
| | `ReactiveStore` | 响应式状态管理器 |
| | `EventStrategy` | 事件策略 |
| | `CellEditor` | 单元格编辑器 |
| | `WebComponent` | Web Components 基类 |
| | `DOMComponent` | DOM 操作封装类 |
| | `Disposable` | 生命周期资源管理类 |
| **插件类** | `BasePlugin` | 插件基类 |
| | `PluginManager` | 插件管理器 |
| | `AutoFillPlugin` | 自动填充插件 |
| | `ChartPlugin` | 图表插件 |
| | `ColumnMovePlugin` | 列移动插件 |
| | `ContextMenuPlugin` | 右键菜单插件 |
| | `CopyPastePlugin` | 复制粘贴插件 |
| | `FreezePlugin` | 冻结窗格插件 |
| | `HiddenColumnsPlugin` | 隐藏列插件 |
| | `HiddenRowsPlugin` | 隐藏行插件 |
| | `RowMovePlugin` | 行移动插件 |
| | `ImportFilePlugin` | 导入文件插件 |
| | `ExportFilePlugin` | 导出文件插件 |
| | `FormulaPlugin` | 公式插件 |
| | `SortPlugin` | 排序插件 |
| | `FilterPlugin` | 筛选插件 |
| | `SearchPlugin` | 搜索替换插件 |
| | `DataValidationPlugin` | 数据验证插件 |
| **公式引擎** | `FormulaEngine` | 公式引擎 |
| | `FormulaEvaluator` | 公式求值器 |
| | `functionRegistry` | 函数注册表实例 |
| | `FUNCTION_CATEGORY` | 函数分类常量 |
| **类型系统** | `BaseColumnType` | 列类型基类 |
| | `themeStyleProvider` | 主题样式提供者 |
| | `PopupManager` | 弹窗管理器 |
| | `PopupPanel` | 弹窗面板 |
| **渲染** | `BaseLayer` | 图层基类 |
| | `ViewportTransform` | 视口坐标转换器 |
| **图表** | `ChartModel` | 图表数据模型 |
| | `ChartManager` | 图表管理器 |
| | `ChartRendererFactory` | 图表渲染工厂 |
| | `NativeChartRenderer` | 原生图表渲染器 |
| | `IChartRenderer` | 图表渲染器接口 |
| | `BaseChartStrategy` | 图表策略基类 |
| | `DataExtractor` | 数据提取器 |
| | `ChartCacheManager` | 图表缓存管理器 |
| | `ChartCache` | 图表缓存 |
| **枚举常量** | `AUTO_FILL_DIR` | 自动填充方向 |
| | `BORDER_STYLE` | 边框样式 |
| | `CHART_TYPE` | 图表类型 |
| | `CONTENT_TYPE` | 内容类型 |
| | `ERROR_STYLE` | 错误样式 |
| | `FONT_STYLE` | 字体样式 |
| | `SCROLL_AXIS` | 滚动轴 |
| | `SORT_ARROW_DIR` | 排序箭头方向 |
| | `SORT_ORDER` | 排序顺序 |
| | `STYLE_SCOPE` | 样式作用域 |
| | `TEXT_ALIGN` | 文本对齐 |
| | `VALIDATION_RULE_TYPE` | 验证规则类型 |
| | `VERTICAL_ALIGN` | 垂直对齐 |
| **系统常量** | `EVENT_NAMES` | DOM 事件名称 |
| | `HOOKS` | 生命周期钩子名称 |
| | `SHEET_EVENTS` | 工作表事件名称 |
| | `CONFIG` | 全局配置 |
| | `HIT_TYPE` | 命中类型 |
| | `LAYER_Z_INDEX` | 图层 Z 轴顺序 |

---

## 🏗️ 技术架构

### 📐 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户界面层 (UI Layer)                      │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐   │
│  │ FormulaBar   │ │ SheetTabBar  │ │ ContextMenu           │   │
│  │ (公式栏)      │ │ (标签栏)     │ │ (右键菜单)             │   │
│  └──────────────┘ └──────────────┘ └────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                        工作簿层 (Workbook Layer)                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Workbook (工作簿)                       │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────────┐  │   │
│  │  │ Sheet 1 │ │ Sheet 2 │ │ Sheet 3 │ │ ...          │  │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └──────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                        引擎层 (Engine Layer)                     │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │ RenderEngine   │  │ FormulaEngine  │  │ ValidationEngine │  │
│  │ (渲染引擎)      │  │ (公式引擎)     │  │ (验证引擎)       │  │
│  ├────────────────┤  ├────────────────┤  ├──────────────────┤  │
│  │ • TileRenderer │  │ • Parser       │  │ • Rule Manager   │  │
│  │ • LayerComp.   │  │ • Evaluator    │  │ • Validators     │  │
│  │ • ViewportSvc  │  │ • FunctionReg. │  │ • Batch Coord.   │  │
│  └────────────────┘  └────────────────┘  └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                        数据层 (Data Layer)                       │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │ ChunkedCellStore│  │ TypeRegistry   │  │ StylePool        │  │
│  │ (分块存储)      │  │ (类型注册表)    │  │ (样式池)         │  │
│  ├────────────────┤  ├────────────────┤  ├──────────────────┤  │
│  │ • Chunk (分块)  │  │ • ColumnTypes  │  │ • Cell Styles    │  │
│  │ • Cell (单元格) │  │ • Renderers    │  │ • RowCol Styles  │  │
│  └────────────────┘  └────────────────┘  └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                        基础设施层 (Infrastructure)                │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│  │ EventBus   │ │ Hooks      │ │ ErrorHandler│ │ Disposable │  │
│  │ (事件总线)  │ │ (钩子系统)  │ │ (错误处理)  │ │ (资源管理) │  │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                        插件系统 (Plugin System)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ AutoFill  │ │ Sort     │ │ Freeze   │ │ DataValidation   │  │
│  │ (自动填充) │ │ (排序)   │ │ (冻结)   │ │ (数据验证)       │  │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────────────┤  │
│  │ CopyPaste │ │ Export   │ │ Chart    │ │ HiddenRows/Cols  │  │
│  │ (复制粘贴) │ │ (导出)   │ │ (图表)   │ │ (隐藏行/列)      │  │
│  └──────────┘ └──────────┘ └────────────┘ └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 🎨 渲染管线

```
用户操作 (Scroll/Resize/Edit)
    ↓
[ViewportService] 计算可见区域
    ↓
[TileRenderer] 确定需要绘制的瓦片
    ↓
[TileCache] 检查缓存命中
    ↓ (未命中)
[LayerCompositor] 图层合成:
    ├── BackgroundLayer (背景网格)
    ├── FrozenLayer (冻结区域)
    ├── HeaderLayer (行列标题)
    ├── TileLayer (数据瓦片)
    ├── SelectionLayer (选区高亮)
    ├── InteractionLayer (交互反馈)
    ├── ChartLayer (图表覆盖)
    └── OverlayLayer (悬浮元素)
    ↓
[CanvasContext] GPU 加速绘制
    ↓
屏幕输出 (60 FPS)
```

---

## 📦 安装与构建

### 📋 前置要求

- **Node.js**: >= 16.x
- **现代浏览器**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

### 🛠️ 开发环境搭建

```bash
git clone https://github.com/tingting1989/canvas-implementation-in-excel.git
cd canvas-implementation-in-excel

npm install

npm run dev              # 启动开发服务器 (热更新) → http://localhost:9000
npm run build:lib        # 生产构建 + 类型生成
npm test                 # 运行测试
npm run test:watch       # 监听模式
npm run test:coverage    # 覆盖率报告
npm run lint             # ESLint
npm run format           # Prettier
npm run typecheck        # TypeScript 类型检查
npm run docs             # JSDoc → HTML
```

### 构建产物

| 文件 | 格式 | 说明 |
|------|------|------|
| `dist/canvas-sheet.esm.mjs` | ESM | ES Module 格式，支持 Tree Shaking |
| `dist/canvas-sheet.umd.js` | UMD | 通用格式，全局变量 `CanvasSheet` |
| `dist/types/api/index.d.ts` | TypeScript | 完整类型声明 |

### 📖 在项目中引入

#### 方式 1: ES Module（推荐）

```javascript
import { Workbook } from '@canvas-sheet/core';

const wb = new Workbook(document.getElementById('container'), options);
```

#### 方式 2: CommonJS

```javascript
const { Workbook } = require('@canvas-sheet/core');

const wb = new Workbook(document.getElementById('container'), options);
```

#### 方式 3: CDN / UMD

```html
<script src="https://cdn.example.com/canvas-sheet.umd.js"></script>
<script>
    const { Workbook } = CanvasSheet;
    const wb = new Workbook(document.getElementById('app'));
</script>
```

---

## 💻 API 参考

### 📘 Workbook 类 — 工作簿核心

> 顶层管理对象，作为 Facade 协调 Sheet、RenderEngine、EventHandler、EditorManager、PluginManager 等子系统。

#### 📌 构造函数

```typescript
new Workbook(element: HTMLElement | string, options?: WorkbookOptions)
```

#### 🔧 静态方法：全局插件注册

```typescript
Workbook.registerPlugin(name: string, PluginClass: typeof BasePlugin): void
Workbook.unregisterPlugin(name: string): void
```

#### 🔌 插件委托方法

```typescript
workbook.loadPlugin(name: string, options?: Record<string, unknown>): unknown | null
workbook.loadPluginClass(PluginClass: typeof BasePlugin, options?: Record<string, unknown>): unknown | null
workbook.unloadPlugin(name: string): void
workbook.getPlugin(name: string): unknown | null
workbook.enablePlugin(name: string): void
workbook.disablePlugin(name: string): void
```

#### ⚙️ 初始化与生命周期

```typescript
const workbook = new Workbook(container, options);       // autoInit=true（默认）
const workbook = new Workbook(container, { ...options, autoInit: false });
workbook.initRender();   // 手动初始化渲染引擎
workbook.render();       // 手动触发首次渲染
workbook.destroy();      // 销毁所有资源
```

#### 📑 工作表管理

```typescript
workbook.addSheet(name: string): Sheet
workbook.removeSheet(name: string): boolean
workbook.renameSheet(oldName: string, newName: string): boolean
workbook.switchTo(name: string): void
workbook.getActiveSheet(): Sheet | null
```

#### 🎨 渲染控制

```typescript
workbook.render(): void
```

#### 📋 剪贴板操作

```typescript
workbook.copy(): void
workbook.paste(): void
```

#### ↩️ 撤销/重做

```typescript
workbook.undo(): void
workbook.redo(): void
```

#### 📊 单元格操作

```typescript
workbook.disableCell(row: number, col: number): void
workbook.enableCell(row: number, col: number): void
workbook.mergeCells(topRow: number, topCol: number, bottomRow: number, bottomCol: number): void
workbook.unmergeCells(): void
workbook.insertRow(atRow: number): void
workbook.insertCol(atCol: number): void
workbook.deleteRow(atRow: number): void
workbook.deleteCol(atCol: number): void
```

#### 🎯 钩子系统

```typescript
workbook.addHook(hookName: string, callback: Function): void
workbook.addHookOnce(hookName: string, callback: Function): void
workbook.removeHook(hookName: string, callback: Function): void
workbook.clearHook(hookName: string): void
workbook.hasHook(hookName: string): boolean
workbook.runHooks(hookName: string, ...args: unknown[]): unknown
workbook.runHooksUntil(hookName: string, ...args: unknown[]): unknown
```

#### 💅 样式操作

```typescript
workbook.getCellStyle(row: number, col: number): StyleObject
workbook.setCellStyle(row: number, col: number, style: StyleObject): void
workbook.clearCellStyle(row: number, col: number): void
workbook.setRangeStyle(range: Range, style: StyleObject): void
workbook.clearRangeStyle(range: Range): void
workbook.setRowStyle(row: number, style: StyleObject): void
workbook.setColStyle(col: number, style: StyleObject): void
workbook.clearRowStyle(row: number): void
workbook.clearColStyle(col: number): void
workbook.setDefaultStyle(style: StyleObject): void
workbook.getDefaultStyle(): StyleObject
workbook.batchStyleUpdate(fn: () => void): void
workbook.updateSettings(settings: Partial<WorkbookOptions>): void
```

#### 📤 导出功能

```typescript
workbook.exportAsString(format: 'csv' | 'xlsx', options?: object): string
workbook.exportAsBlob(format: 'csv' | 'xlsx', options?: object): Blob
workbook.downloadFile(format: 'csv' | 'xlsx', options?: object): void
```

#### 🏷️ 公共属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `sheets` | `Map<string, Sheet>` | 所有工作表 |
| `activeSheet` | `Sheet \| null` | 当前活动工作表 |
| `clipboard` | `ClipboardManager \| null` | 剪贴板管理器 |
| `renderEngine` | `RenderEngine \| null` | 渲染引擎 |
| `editor` | `EditorManager \| null` | 编辑器管理器 |
| `eventHandler` | `EventHandler \| null` | 事件处理器 |
| `pluginManager` | `PluginManager \| null` | 插件管理器 |
| `formulaEngine` | `FormulaEngine \| null` | 公式引擎 |
| `formulaBar` | `FormulaBarManager \| null` | 公式栏管理器 |

### 📗 配置选项

#### 🔹 Workbook 级别配置（WorkbookOptions）

```typescript
interface WorkbookOptions {
    width?: number;
    height?: number;
    sheetName?: string;
    sheets?: SheetConfig[];
    defaultStyle?: CellStyle;
    plugins?: string[];
    pluginOptions?: { [pluginName: string]: any };
    hooks?: { [hookName: string]: Function };
    afterInit?: (workbook: Workbook) => void;
}
```

#### 🔸 Sheet 级别配置（SheetConfig）

```typescript
interface SheetConfig {
    name?: string;
    data?: Array<Array<any>>;
    startRows?: number;
    startCols?: number;
    maxRows?: number;
    maxCols?: number;
    rowHeights?: number | number[];
    colWidths?: number | number[];
    colHeaders?: true | string[] | Function;
    rowHeaders?: true | string[] | Function;
    headerHeight?: number;
    rowHeaderWidth?: number;
    nestedHeaders?: Array<Array<{
        label: string;
        colspan?: number;
        rowspan?: number;
        style?: object;
    }>>;
    defaultStyle?: CellStyle;
    rowStyles?: Array<object>;
    colStyles?: Array<object>;
    rangeStyles?: Array<object>;
    cell?: Array<{
        row: number;
        col: number;
        style?: object;
        disabled?: boolean;
        readOnly?: boolean;
        value?: any;
    }>;
    cells?: (row: number, col: number) => object;
    mergeCells?: Array<{
        row: number;
        col: number;
        rowspan: number;
        colspan: number;
    }>;
    conditionalStyles?: Array<{
        range: object;
        condition: (value: any) => boolean;
        style: object;
    }>;
    columns?: Array<object | Function>;
    fixedRowsTop?: number;
    fixedColumnsStart?: number;
    cellPadding?: number;
    textOverflowEllipsis?: boolean;
    readOnly?: boolean;
}
```

#### 📊 配置优先级

```
Workbook.defaultStyle (全局基础 - 最低优先级)
    ↓
Sheet.defaultStyle (Sheet 级别 - 中等)
    ↓
rangeStyles / cell / cells (最高优先级)
```

#### 📝 配置示例

```typescript
import { Workbook } from '@canvas-sheet/core';

const workbook = new Workbook(document.getElementById('container')!, {
    width: window.innerWidth,
    height: window.innerHeight,
    defaultStyle: {
        fontSize: 13,
        fontFamily: 'Arial',
        textAlign: 'left',
        color: '#333'
    },
    plugins: ['freeze', 'sort', 'filter', 'autoFill', 'search'],
    pluginOptions: {
        freeze: { fixedRowsTop: 2, fixedColsLeft: 1 }
    },
    sheets: [
        {
            name: 'Sheet1',
            startRows: 100,
            startCols: 26,
            colHeaders: true,
            rowHeaders: true,
            defaultStyle: { backgroundColor: '#fff' },
            data: [
                ['姓名', '年龄', '城市'],
                ['张三', 25, '北京'],
                ['李四', 30, '上海']
            ],
            mergeCells: [
                { row: 0, col: 0, rowspan: 1, colspan: 3 }
            ],
            cell: [
                { row: 1, col: 0, value: '张三', readOnly: true },
                { row: 1, col: 1, value: 25, style: { color: 'blue' } }
            ]
        },
        {
            name: '数据统计',
            startRows: 50,
            startCols: 10,
            readOnly: true,
            data: [
                ['项目', '数值'],
                ['总计', '=SUM(Sheet1!B:B)']
            ]
        }
    ],
    afterInit: (wb) => {
        wb.addHook('afterSelection', (row: number, col: number) => {
            console.log(`选中单元格: ${row}, ${col}`);
        });
    }
});
```

---

## 🪝 Hooks 钩子系统

Canvas Spreadsheet 提供完整的 **Hooks（钩子）系统**，允许在关键节点注入自定义逻辑。

### 📋 Hooks 总览表

| 分类 | Hook 名称 | 常量引用 | 触发时机 | 可阻止 | 参数 |
|------|----------|---------|----------|--------|------|
| **📝 编辑** |
| 编辑开始前 | `beforeBeginEditing` | `HOOKS.BEFORE_BEGIN_EDITING` | 编辑器未打开时 | ✅ | `(row, col)` |
| 编辑开始后 | `afterBeginEditing` | `HOOKS.AFTER_BEGIN_EDITING` | 编辑器已打开 | ❌ | `(row, col)` |
| 编辑结束前 | `beforeFinishEditing` | `HOOKS.BEFORE_FINISH_EDITING` | 提交编辑时 | ✅ | `(row, col, newVal, oldVal)` |
| 编辑结束后 | `afterFinishEditing` | `HOOKS.AFTER_FINISH_EDITING` | 新值已写入 | ❌ | `(row, col, newVal, oldVal)` |
| 数据变更前 | `beforeChange` | `HOOKS.BEFORE_CHANGE` | 修改单元格值之前 | ✅ | `changes[]` |
| 数据变更后 | `afterChange` | `HOOKS.AFTER_CHANGE` | 值已更新到存储层 | ❌ | `changes[]` |
| 设置值前 | `beforeSetValueAt` | `HOOKS.BEFORE_SET_VALUE_AT` | 单元格写入前 | ✅ | `(row, col, value)` |
| 设置值后 | `afterSetValueAt` | `HOOKS.AFTER_SET_VALUE_AT` | 单元格写入后 | ❌ | `(row, col, value)` |
| **🎯 选择** |
| 选择开始前 | `beforeSelection` | `HOOKS.BEFORE_SELECTION` | 新选择操作 | ✅ | `(startRow, startCol, endRow, endCol)` |
| 选择完成后 | `afterSelection` | `HOOKS.AFTER_SELECTION` | 选区已确定 | ❌ | `(startRow, startCol, endRow, endCol)` |
| 选择结束前 | `beforeSelectionEnd` | `HOOKS.BEFORE_SELECTION_END` | 拖拽即将释放 | ✅ | `(range)` |
| 选择结束后 | `afterSelectionEnd` | `HOOKS.AFTER_SELECTION_END` | 拖拽完成 | ❌ | `(range)` |
| **🖱️ 单元格交互** |
| 鼠标按下 | `onCellMouseDown` | `HOOKS.ON_CELL_MOUSE_DOWN` | 单元格内按下 | ❌ | `(row, col, event)` |
| 鼠标移入 | `onCellMouseOver` | `HOOKS.ON_CELL_MOUSE_OVER` | 进入单元格 | ❌ | `(row, col, event)` |
| 鼠标移出 | `onCellMouseOut` | `HOOKS.ON_CELL_MOUSE_OUT` | 离开单元格 | ❌ | `(row, col, event)` |
| 单元格点击 | `onCellClick` | `HOOKS.ON_CELL_CLICK` | click 事件 | ❌ | `(row, col, event)` |
| 单元格双击 | `onCellDblClick` | `HOOKS.ON_CELL_DBL_CLICK` | 双击 | ❌ | `(row, col, event)` |
| **⌨️ 键盘** |
| 键盘按下前 | `beforeKeyDown` | `HOOKS.BEFORE_KEY_DOWN` | 按键处理前 | ✅ | `(event)` |
| 键盘按下后 | `afterKeyDown` | `HOOKS.AFTER_KEY_DOWN` | 按键已处理 | ❌ | `(event)` |
| **📜 滚动** |
| 水平滚动后 | `afterScrollHorizontally` | `HOOKS.AFTER_SCROLL_HORIZONTALLY` | 水平位置改变 | ❌ | `(newScrollLeft)` |
| 垂直滚动后 | `afterScrollVertically` | `HOOKS.AFTER_SCROLL_VERTICALLY` | 垂直位置改变 | ❌ | `(newScrollTop)` |
| **🔗 合并单元格** |
| 合并前 | `beforeMergeCells` | `HOOKS.BEFORE_MERGE_CELLS` | 即将合并 | ✅ | `(topRow, topCol, bottomRow, bottomCol)` |
| 合并后 | `afterMergeCells` | `HOOKS.AFTER_MERGE_CELLS` | 已合并 | ❌ | `(mergeRange)` |
| 取消合并前 | `beforeUnmergeCells` | `HOOKS.BEFORE_UNMERGE_CELLS` | 即将拆分 | ✅ | `(topRow, topCol)` |
| 取消合并后 | `afterUnmergeCells` | `HOOKS.AFTER_UNMERGE_CELLS` | 已拆分 | ❌ | `(row, col)` |
| **📋 剪贴板** |
| 复制前 | `beforeCopy` | `HOOKS.BEFORE_COPY` | 即将复制 | ✅ | `(range)` |
| 复制后 | `afterCopy` | `HOOKS.AFTER_COPY` | 已复制 | ❌ | `(data, range)` |
| 剪切前 | `beforeCut` | `HOOKS.BEFORE_CUT` | 即将剪切 | ✅ | `(range)` |
| 剪切后 | `afterCut` | `HOOKS.AFTER_CUT` | 已剪切 | ❌ | `(data, range)` |
| 粘贴前 | `beforePaste` | `HOOKS.BEFORE_PASTE` | 即将粘贴 | ✅ | `(target, data)` |
| 粘贴后 | `afterPaste` | `HOOKS.AFTER_PASTE` | 已粘贴 | ❌ | `(changes)` |
| **↔️ 列/行移动** |
| 列移动前 | `beforeColumnMove` | `HOOKS.BEFORE_COLUMN_MOVE` | 即将移动列 | ✅ | `(sourceCol, targetCol)` |
| 列移动后 | `afterColumnMove` | `HOOKS.AFTER_COLUMN_MOVE` | 列已移动 | ❌ | `(sourceCol, targetCol)` |
| 行移动前 | `beforeRowMove` | `HOOKS.BEFORE_ROW_MOVE` | 即将移动行 | ✅ | `(sourceRow, targetRow)` |
| 行移动后 | `afterRowMove` | `HOOKS.AFTER_ROW_MOVE` | 行已移动 | ❌ | `(sourceRow, targetRow)` |
| **👁️ 隐藏显示** |
| 列隐藏后 | `afterHideColumn` | `HOOKS.AFTER_HIDE_COLUMN` | 列已隐藏 | ❌ | `(colIndex)` |
| 列显示后 | `afterShowColumn` | `HOOKS.AFTER_SHOW_COLUMN` | 列已显示 | ❌ | `(colIndex)` |
| 行隐藏后 | `afterHideRow` | `HOOKS.AFTER_HIDE_ROW` | 行已隐藏 | ❌ | `(rowIndex)` |
| 行显示后 | `afterShowRow` | `HOOKS.AFTER_SHOW_ROW` | 行已显示 | ❌ | `(rowIndex)` |
| **❄️ 冻结窗格** |
| 冻结后 | `afterFreeze` | `HOOKS.AFTER_FREEZE` | 冻结已生效 | ❌ | `(fixedRows, fixedCols)` |
| 解冻后 | `afterUnfreeze` | `HOOKS.AFTER_UNFREEZE` | 冻结已取消 | ❌ | — |
| **📑 工作表管理** |
| 新增前 | `beforeSheetAdd` | `HOOKS.BEFORE_SHEET_ADD` | 即将创建 | ✅ | `(sheetName)` |
| 新增后 | `afterSheetAdd` | `HOOKS.AFTER_SHEET_ADD` | 已创建 | ❌ | `(sheetName, sheet)` |
| 删除前 | `beforeSheetRemove` | `HOOKS.BEFORE_SHEET_REMOVE` | 即将删除 | ✅ | `(sheetName)` |
| 删除后 | `afterSheetRemove` | `HOOKS.AFTER_SHEET_REMOVE` | 已删除 | ❌ | `(sheetName, sheet)` |
| 重命名前 | `beforeSheetRename` | `HOOKS.BEFORE_SHEET_RENAME` | 即将重命名 | ✅ | `(oldName, newName)` |
| 重命名后 | `afterSheetRename` | `HOOKS.AFTER_SHEET_RENAME` | 已重命名 | ❌ | `(oldName, newName)` |
| 切换前 | `beforeSheetSwitch` | `HOOKS.BEFORE_SHEET_SWITCH` | 即将切换 | ✅ | `(current, target)` |
| 切换后 | `afterSheetSwitch` | `HOOKS.AFTER_SHEET_SWITCH` | 已切换 | ❌ | `(previous, current)` |
| **📊 排序** |
| 排序后 | `afterSort` | `HOOKS.AFTER_SORT` | 数据已排序 | ❌ | `(colIndex, options, result)` |
| 排序恢复后 | `afterSortRestore` | `HOOKS.AFTER_SORT_RESTORE` | 已撤销排序 | ❌ | `(swappedRows)` |
| **🎨 图表** |
| 图表添加后 | `afterChartAdd` | `HOOKS.AFTER_CHART_ADD` | 图表已创建 | ❌ | `(config, instance)` |
| 图表删除后 | `afterChartRemove` | `HOOKS.AFTER_CHART_REMOVE` | 图表已删除 | ❌ | `(chartId)` |
| 图表更新后 | `afterChartUpdate` | `HOOKS.AFTER_CHART_UPDATE` | 图表已变更 | ❌ | `(chartId, newConfig)` |
| **🔗 URL 超链接** |
| URL 检测到 | `onUrlDetected` | `HOOKS.ON_URL_DETECTED` | 值被识别为 URL | ❌ | `(row, col, url)` |
| URL 点击前 | `beforeOpenUrl` | `HOOKS.BEFORE_OPEN_URL` | Ctrl+Click 时 | ✅ | `(row, col, url, event)` |
| URL 已打开 | `afterOpenUrl` | `HOOKS.AFTER_OPEN_URL` | 链接已打开 | ❌ | `(row, col, url)` |
| **📥 导入** |
| 导入进度 | `onImportProgress` | `HOOKS.IMPORT_PROGRESS` | 导入进行中 | ❌ | `(progress)` |
| 导入完成 | `onImportComplete` | `HOOKS.IMPORT_COMPLETE` | 导入完成 | ❌ | `(result)` |
| 导入错误 | `onImportError` | `HOOKS.IMPORT_ERROR` | 导入出错 | ❌ | `(error)` |
| **📤 导出** |
| 导出完成 | `onExportComplete` | `HOOKS.EXPORT_COMPLETE` | 导出完成 | ❌ | `(result)` |
| 导出错误 | `onExportError` | `HOOKS.EXPORT_ERROR` | 导出出错 | ❌ | `(error)` |
| **🛡️ 数据验证** |
| 验证前 | `beforeValidate` | `HOOKS.BEFORE_VALIDATE` | 即将验证 | ✅ | `(rule, value)` |
| 验证后 | `afterValidate` | `HOOKS.AFTER_VALIDATE` | 验证完成 | ❌ | `(result)` |
| 验证失败 | `validationFailed` | `HOOKS.VALIDATION_FAILED` | 验证不通过 | ❌ | `(rule, value, error)` |
| **🔍 搜索** |
| 搜索前 | `beforeSearch` | `HOOKS.BEFORE_SEARCH` | 即将搜索 | ✅ | `(query)` |
| 搜索后 | `afterSearch` | `HOOKS.AFTER_SEARCH` | 搜索完成 | ❌ | `(results)` |
| 替换前 | `beforeSearchReplace` | `HOOKS.BEFORE_SEARCH_REPLACE` | 即将替换 | ✅ | `(target, replacement)` |
| 替换后 | `afterSearchReplace` | `HOOKS.AFTER_SEARCH_REPLACE` | 替换完成 | ❌ | `(changes)` |
| **🔄 生命周期** |
| 初始化完成 | `init` | `HOOKS.INIT` | 构造完成 | ❌ | `(instance)` |
| 销毁前 | `destroy` | `HOOKS.DESTROY` | 即将销毁 | ❌ | `(instance)` |

### 💡 Hooks 使用示例

<details>
<summary><b>🔧 实战案例集</b></summary>

#### 1️⃣ 数据验证拦截

```typescript
import { Workbook, HOOKS } from '@canvas-sheet/core';

const wb = new Workbook(container);

wb.addHook(HOOKS.BEFORE_CHANGE, (changes: Array<{row: number, col: number, newValue: unknown}>) => {
    for (const change of changes) {
        if (change.col === 1 && typeof change.newValue === 'number' && change.newValue < 0) {
            alert('第 1 列不允许负数！');
            return false;
        }
    }
    return true;
});
```

#### 2️⃣ 操作日志记录

```typescript
wb.addHook(HOOKS.AFTER_CHANGE, (changes: Array<{row: number, col: number, oldValue: unknown, newValue: unknown}>) => {
    const timestamp = new Date().toISOString();
    changes.forEach(({ row, col, oldValue, newValue }) => {
        console.log(`[${timestamp}] [${row},${col}]: "${oldValue}" → "${newValue}"`);
    });
});
```

#### 3️⃣ 自定义快捷键

```typescript
wb.addHook(HOOKS.BEFORE_KEY_DOWN, (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        saveWorkbook();
        return true;
    }
    return undefined;
});
```

#### 4️⃣ 单元格交互增强

```typescript
wb.addHook(HOOKS.ON_CELL_DBL_CLICK, (row: number, col: number, event: MouseEvent) => {
    if (col === 0) {
        openDetailModal(wb.getCellValue(row, col));
        event.preventDefault();
    }
});
```

#### 5️⃣ URL 超链接安全控制

```typescript
wb.addHook(HOOKS.BEFORE_OPEN_URL, (row: number, col: number, urlValue: string, event: MouseEvent) => {
    const allowedDomains = ['example.com', 'company-internal.com'];
    try {
        const url = new URL(urlValue);
        if (!allowedDomains.some(d => url.hostname.endsWith(d))) {
            event.preventDefault();
            const confirmed = confirm(`您即将访问外部链接：\n\n${urlValue}\n\n是否继续？`);
            if (confirmed) window.open(urlValue, '_blank', 'noopener,noreferrer');
            return false;
        }
    } catch { return false; }
    return true;
});
```

#### 6️⃣ 一次性钩子

```typescript
wb.addHookOnce(HOOKS.INIT, (workbook: Workbook) => {
    loadUserPreferences(workbook);
    setupAutoSave(workbook);
});
```

</details>

### 🔐 Hooks 最佳实践

| 场景 | 推荐 | 不推荐 |
|------|------|--------|
| **数据验证** | `BEFORE_CHANGE`, `BEFORE_SET_VALUE_AT` | `AFTER_CHANGE`（太晚） |
| **UI 反馈** | `AFTER_*` 系列 | `BEFORE_*`（可能被取消） |
| **日志记录** | `AFTER_CHANGE`, `AFTER_SORT` | `BEFORE_*`（可能未实际发生） |
| **权限控制** | `BEFORE_*` 系列（可阻止） | `ON_*`（仅通知） |

> **性能提示**: Hooks 回调应尽量轻量化（< 1ms），复杂逻辑建议使用 `requestIdleCallback` 或 `setTimeout(fn, 0)` 异步处理。

---

## 🎨 自定义与扩展

### 🔌 插件开发指南

```typescript
import { BasePlugin, HOOKS } from '@canvas-sheet/core';
import type { Workbook } from '@canvas-sheet/core';

export class MyCustomPlugin extends BasePlugin {
    static get PLUGIN_NAME() { return "myCustom"; }

    init(options: Record<string, any> = {}) {
        super.init(options);
        // 注册策略、钩子等
    }

    destroy() {
        // 清理资源
        super.destroy();
    }

    enable() {
        super.enable();
    }

    disable() {
        super.disable();
    }
}

// 全局注册
Workbook.registerPlugin("myCustom", MyCustomPlugin);

// 或在初始化时加载
const wb = new Workbook(container, {
    plugins: ["myCustom"],
    pluginOptions: { myCustom: { enabled: true } }
});
```

### 🎭 自定义列类型渲染器

```typescript
import { BaseColumnType, Workbook } from '@canvas-sheet/core';
import type { CellRenderContext } from '@canvas-sheet/core';

class TrafficLightType extends BaseColumnType {
    get name() { return 'trafficLight'; }
    get editorType() { return 'select'; }

    getEditorOptions() {
        return {
            source: [
                { value: 'green', label: '🟢 正常' },
                { value: 'yellow', label: '🟡 警告' },
                { value: 'red', label: '🔴 危险' },
            ]
        };
    }

    format(value: string): string {
        const map: Record<string, string> = { green: '正常', yellow: '警告', red: '危险' };
        return map[value] || String(value);
    }

    render(context: CellRenderContext): void {
        const { ctx, x, y, width, height, value } = context;
        const colors: Record<string, string> = {
            green: '#4caf50', yellow: '#ff9800', red: '#f44336'
        };
        const radius = Math.min(width, height) / 3;
        const centerX = x + width / 2;
        const centerY = y + height / 2;

        ctx.fillStyle = colors[value as string] || '#ccc';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();

        if (context.isSelected) {
            ctx.strokeStyle = colors[value as string] || '#999';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
}

Workbook.registerColumnType("trafficLight", TrafficLightType);
```

### 🧮 自定义公式函数

```typescript
import { functionRegistry, FUNCTION_CATEGORY } from '@canvas-sheet/core';

functionRegistry.register('TAX', (args: unknown[]) => {
    const amount = args[0] as number;
    const rate = (args[1] as number) || 0.13;
    return amount * rate;
}, { category: FUNCTION_CATEGORY.CUSTOM });

// 使用: =TAX(1000, 0.13) → 130
```

### 📊 自定义图表

图表系统基于**策略模式**架构，每类图表对应一个 `BaseChartStrategy` 子类。你可以继承基类创建任意图表类型，并通过 `NativeChartRenderer.register()` 注册到渲染器中。

#### 架构层次

```
ChartRendererFactory.getRenderer(type)   ← 工厂分发渲染器
    ↓
NativeChartRenderer                      ← 渲染管线编排（网格→坐标轴→图表→标题→图例）
    ↓
BaseChartStrategy 子类                   ← 具体图表绘制逻辑（你自定义的这一层）
```

#### 自定义图表步骤

```typescript
import {
    BaseChartStrategy,
    NativeChartRenderer,
    ChartRendererFactory
} from '@canvas-sheet/core';
import type { ChartData, PlotArea, ChartStyle, YScale, HitInfo } from '@canvas-sheet/core';

// 1. 继承 BaseChartStrategy 创建自定义策略
class WaterfallStrategy extends BaseChartStrategy {
    constructor() {
        super("waterfall", "瀑布图");   // type 标识 + 显示名称
    }

    // 2. 覆写 render() 实现绘制逻辑（必须）
    render(
        ctx: CanvasRenderingContext2D,
        data: ChartData,
        area: PlotArea,
        style: ChartStyle,
        yScale?: YScale | null
    ): void {
        const { headers, data: rows } = data;
        const { x, y, w, h } = area;

        // ... 你的 Canvas 绘制逻辑 ...
        // ctx.fillRect(), ctx.fillText(), etc.
    }

    // 3. 可选：覆写 hitTest() 实现点击检测
    hitTest(
        px: number, py: number,
        data: ChartData,
        area: PlotArea,
        style: ChartStyle
    ): HitInfo | null {
        // 返回命中信息或 null
        return null;
    }

    // 4. 可选：覆写 formatTooltip() 自定义提示格式
    formatTooltip(hitInfo: HitInfo): string {
        return `${hitInfo.category}: ${hitInfo.value}`;
    }

    // 5. 可选：覆写 isAxisFree() 声明是否无坐标轴（如饼图）
    isAxisFree(): boolean {
        return false;  // 瀑布图有坐标轴
    }
}

// 6. 注册到 NativeChartRenderer
NativeChartRenderer.register(new WaterfallStrategy());

// 7.（可选）扩展 ChartRendererFactory 的原生类型列表
ChartRendererFactory.NATIVE_TYPES.push("waterfall");

// 现在可以在工作表中使用 "waterfall" 类型
const chart = sheet.addChart({
    type: "waterfall",
    anchorRow: 0,
    anchorCol: 5,
    width: 400,
    height: 300,
    dataRange: { startRow: 0, startCol: 0, endRow: 6, endCol: 1 },
    style: {
        title: "月度利润瀑布图",
        colors: ["#5470c6", "#91cc75", "#ee6666"],
        showLegend: true,
        showTooltip: true
    }
});
```

#### 可覆写的方法

| 方法 | 必须 | 说明 |
|------|------|------|
| `render(ctx, data, area, style, yScale)` | ✅ | 核心绘制逻辑 |
| `hitTest(px, py, data, area, style)` | ❌ | 点击/悬停命中检测，返回 `HitInfo \| null` |
| `formatTooltip(hitInfo)` | ❌ | Tooltip 文本格式化 |
| `formatDetail(hitInfo)` | ❌ | 详细信息格式化（K线、仪表盘等） |
| `isAxisFree()` | ❌ | 是否无坐标轴（饼图、雷达图等返回 `true`） |
| `computeYScale(data, area, style)` | ❌ | 自定义 Y 轴刻度计算 |

#### ChartStyle 配置项

```typescript
interface ChartStyle {
    title?: string;              // 图表标题
    showLegend?: boolean;        // 是否显示图例（默认 true）
    showGrid?: boolean;         // 是否显示网格线（默认 true）
    showTooltip?: boolean;      // 是否启用 Tooltip（默认 true）
    colors?: string[];          // 系列颜色列表
    smooth?: boolean;           // 平滑曲线（折线图/面积图）
    fill?: boolean;             // 填充区域（面积图）
    xAxisLabel?: string;        // X 轴标签
    yAxisLabel?: string;        // Y 轴标签
    min?: number;               // Y 轴最小值
    max?: number;               // Y 轴最大值
    indicators?: IndicatorConfig[];  // 雷达图维度配置
    showValue?: boolean;        // 单元格内显示数值（热力图）
    cellPadding?: number;       // 单元格内边距（热力图）
}
```

#### 高清导出

```typescript
// 使用指定像素比渲染（用于导出高清图片）
NativeChartRenderer.renderWithPixelRatio(
    ctx, chart, data, plotArea, style, 2  // 2x 高清
);
```

### 🎨 主题定制

```typescript
import { themeStyleProvider } from '@canvas-sheet/core';

// 切换内置主题
themeStyleProvider.setTheme("dark");

// 订阅主题变化
const unsubscribe = themeStyleProvider.subscribe(() => {
    console.log("Theme changed!");
    workbook.render();
});

// 取消订阅
unsubscribe();
```

### 📊 条件格式

```typescript
const workbook = new Workbook(container, {
    sheets: [{
        name: 'Sheet1',
        conditionalStyles: [
            {
                range: { topRow: 0, topCol: 0, bottomRow: 10000, bottomCol: 25 },
                condition: (v: unknown) => typeof v === 'number' && v > 25,
                style: { backgroundColor: '#ffcccc' }
            }
        ]
    }]
});
```

### 🛡️ 数据验证

```typescript
const workbook = new Workbook(container, {
    plugins: ['dataValidation'],
    pluginOptions: {
        dataValidation: {
            conflictStrategy: 'short-circuit',
            rules: [
                {
                    range: 'B:B',
                    type: 'number',
                    operator: 'between',
                    value: [0, 100],
                    errorMessage: '必须输入 0-100 之间的数',
                    errorStyle: 'stop'
                },
                {
                    range: 'A:A',
                    type: 'textLength',
                    operator: 'greaterThan',
                    value: 5,
                    errorMessage: '至少输入 5 个字符',
                    errorStyle: 'warning'
                },
                {
                    range: 'D:D',
                    type: 'unique',
                    errorMessage: '值不能重复'
                },
                {
                    range: 'G:G',
                    type: 'date',
                    operator: 'between',
                    value: ['01/01/2020', '12/31/2026'],
                    errorMessage: '日期超出范围',
                    errorStyle: 'stop'
                },
                {
                    range: 'H:H',
                    type: 'regex',
                    pattern: '^[A-Z]{2}\\d{4}$',
                    errorMessage: '格式应为两位大写字母+4位数字'
                }
            ]
        }
    }
});
```

### 🔍 搜索替换

```typescript
const workbook = new Workbook(container, {
    plugins: ['search'],
});

// 搜索插件支持：
// - 全文搜索 / 正则匹配
// - 大小写敏感选项
// - 结果导航（上一个/下一个）
// - 搜索结果高亮
// - 替换（单个/全部）
```

---

## 📋 已完成功能

### ✅ 核心引擎 (100%)
- ✅ Canvas 2D 渲染引擎
- ✅ 瓦片化渲染架构 (Tile Rendering)
- ✅ 智能视口裁剪 (Viewport Clipping)
- ✅ 双缓冲绘图 (Double Buffering)
- ✅ 硬件加速 (GPU Acceleration)

### ✅ 数据模型 (95%)
- ✅ 分块存储系统 (ChunkedCellStore)
- ✅ 单元格对象池 (Cell Pool)
- ✅ 行列管理器 (RowColManager)
- ✅ 合并单元格 (Merge Cells)
- ✅ 隐藏行/列 (Hidden Rows/Cols)
- [ ] 数据版本控制 (Data Versioning)

### ✅ 公式系统 (95%)
- ✅ 公式解析器 (FormulaParser)
- ✅ 公式求值器 (FormulaEvaluator)
- ✅ **52 个内置函数** — 数学(13)、统计(9)、逻辑(7)、文本(13)、查找(4)、条件(6)
- ✅ 循环引用检测
- ✅ 惰性求值 (Lazy Evaluation)
- ✅ 自定义函数注册
- [ ] 数组公式 (Array Formulas)

### ✅ 类型系统 (98%)
- ✅ **11 种列类型**: text, numeric, date, select, textarea, hyperlink, checkbox, progressBar, starRating, sparkline, colorPreview
- ✅ 可扩展的类型注册表
- ✅ 格式化/解析/验证管道
- ✅ 增强的日期解析（支持中文日期格式）

### ✅ 插件生态 (95%)
- ✅ 冻结窗格插件 (FreezePlugin)
- ✅ 排序插件 (SortPlugin) — 升序/降序/多列排序
- ✅ 自动填充插件 (AutoFillPlugin)
- ✅ 复制粘贴插件 (CopyPastePlugin)
- ✅ 数据验证插件 (DataValidationPlugin) — number/text/date/unique/regex/formula 验证
- ✅ 右键菜单插件 (ContextMenuPlugin)
- ✅ 导出文件插件 (ExportFilePlugin) — 企业级导出（嵌套表头/样式/列宽行高/多图表）
- ✅ 导入文件插件 (ImportFilePlugin)
- ✅ 公式插件 (FormulaPlugin)
- ✅ 图表插件 (ChartPlugin) — 10 类内置图表 + 自定义图表支持（BaseChartStrategy 策略模式）
- ✅ 行/列移动插件 (RowMovePlugin / ColumnMovePlugin)
- ✅ 隐藏行/列插件 (HiddenRowsPlugin / HiddenColumnsPlugin)
- ✅ 筛选插件 (FilterPlugin) — text/numeric/date 类型，正则匹配
- ✅ 搜索替换插件 (SearchPlugin) — 全文搜索、正则匹配、导航定位、结果高亮

### ✅ UI 组件 (95%)
- ✅ 公式栏 (FormulaBar)
- ✅ 工作表标签栏 (SheetTabBar)
- ✅ 右键上下文菜单 (ContextMenu)
- ✅ 滚动条 (Scrollbar)
- ✅ 单元格编辑器 (Text/Numeric/Date/Select/Textarea/Hyperlink/Checkbox/StarRating)
- ✅ 选区高亮 (Selection Highlight)
- ✅ 主题系统 — 2 种内置主题 + 自定义主题注册

### ✅ 事件与钩子 (100%)
- ✅ 事件总线 (EventBus) — 标准信封格式、契约校验
- ✅ 生命周期钩子 (Lifecycle Hooks) — 40+ 钩子点
- ✅ DOM 事件常量 (EVENT_NAMES)
- ✅ 工作表事件 (SHEET_EVENTS)

### ✅ 基础设施 (100%)
- ✅ Disposable — 资源生命周期管理
- ✅ DOMComponent — DOM 操作封装
- ✅ WebComponent — Web Components 基类
- ✅ ReactiveStore — 响应式状态管理
- ✅ ErrorHandler — 统一错误处理
- ✅ ViewportTransform — 视口坐标转换

### ✅ TypeScript 支持 (100%)
- ✅ 完整的 `.d.ts` 类型声明文件
- ✅ `package.json` exports.types 条件导出
- ✅ 类型导出路径验证通过
- ✅ TS 使用示例代码 (`test-ts-support/`)

### ✅ 开发者工具 (95%)
- ✅ ESLint + Prettier 代码规范
- ✅ Vitest 测试框架
- ✅ JSDoc 自动文档生成
- ✅ Husky Git Hooks
- ✅ Webpack 5 构建优化
- ✅ ESM + UMD 双模块输出

---

## 🔮 待开发功能

### 🎯 短期目标 (v1.2.0)

- [ ] 评论/批注插件 (CommentPlugin)
- [ ] 迷你地图 (Minimap)
- [ ] 缩放控件 (Zoom Control)
- [ ] 数据验证与列类型样式集成

### 🚀 中期目标 (v2.0.0)

- [ ] 插件按需加载 / 动态导入
- [ ] 数组公式 (Array Formulas)
- [ ] 实时协作 (WebSocket + OT)
- [ ] 光标同步显示
- [ ] 版本历史回放

### 🌟 长期愿景 (v3.0.0+)

- [ ] AI 集成 — 智能数据补全、自然语言查询
- [ ] WebAssembly 加速 — 核心计算引擎移植
- [ ] 地理位置类型 (GeoLocation)
- [ ] Playground 在线演示

---

## 🤝 贡献指南

### 🐛 报告问题

1. 在 [Issues](../../issues) 中搜索现有问题
2. 点击 **New Issue**，填写复现步骤、期望行为、实际行为、环境信息

### 💻 提交代码

```bash
git clone https://github.com/YOUR_USERNAME/canvas-implementation-in-excel.git
cd canvas-implementation-in-excel
git checkout -b feature/your-feature-name

npm install
npm run dev          # 开发调试
npm run lint         # 代码检查
npm run typecheck    # 类型检查
npm test             # 运行测试

git commit -m "feat(scope): description"   # Conventional Commits
git push origin feature/your-feature-name
```

#### 代码规范

- ✅ **ESLint**: `npm run lint` 必须通过
- ✅ **Prettier**: `npm run format` 自动格式化
- ✅ **TypeCheck**: `npm run typecheck` 必须通过
- ✅ **Commit Message**: 遵循 [Conventional Commits](https://www.conventionalcommits.org/)
- ✅ **Test Coverage**: 新增代码覆盖率 > 80%
- ✅ **JSDoc**: 公共 API 必须有完整注释

---

## 📄 许可证

本项目采用 **Apache License 2.0** 开源协议。

```
Copyright 2026 jiangsuiting <1158973435@qq.com>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE.org/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

**您可以自由地：** 商业使用、修改源码、分发副本、再授权、私人使用

**您必须遵守：** 保留版权声明和许可证文本、修改的文件必须标注变更

---

## 🙏 致谢

- **Handsontable** — 电子表格领域标准
- **HyperFormula** — 公式引擎参考实现
- **Canvas API** — 高性能 Web 图形
- **Web Components** — 组件化未来标准
- **Vitest** — 快速可靠的测试框架
- **Webpack** — 强大的模块打包工具

---

## 📞 联系我们

- **作者**: jiangsuiting
- **邮箱**: 1158973435@qq.com
- **Issues**: [GitHub Issues](../../issues)
- **讨论区**: [GitHub Discussions](../../discussions)

---

<div align="center">

**如果这个项目对您有帮助，请给一个 ⭐ Star 支持一下！**

Made with ❤️ by [jiangsuiting](mailto:1158973435@qq.com)

</div>