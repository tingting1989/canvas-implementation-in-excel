# 📊 Canvas Spreadsheet Engine

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.12-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-green.svg" alt="License" />
  <img src="https://img.shields.io/badge/JavaScript-ES6%2B-yellow.svg" alt="Language" />
  <a href="#技术栈"><img src="https://img.shields.io/badge/Web_Components-Custom_Elements-orange.svg" alt="Web Components" /></a>
</p>

<p align="center">
  <strong>高性能 Canvas 渲染的 Web 电子表格引擎</strong><br/>
  基于 Canvas API + Web Components 的现代化表格解决方案<br/>
  支持 10万+ 行数据流畅渲染、公式计算、数据验证、图表可视化
</p>

---

## 📖 目录

- [✨ 核心特性](#核心特性)
- [🚀 快速开始](#快速开始)
- [🏗️ 技术架构](#技术架构)
- [📦 安装与使用](#安装与使用)
- [💻 API 参考](#api-参考)
- [🎨 自定义与扩展](#自定义与扩展)
- [📋 已完成功能](#已完成功能)
- [🔮 待开发功能](#待开发功能)
- [🤝 贡献指南](#贡献指南)
- [📄 许可证](#许可证)

---

## ✨ 核心特性

### 🎯 **极致性能**
- ✅ **Canvas 硬件加速渲染** 
- ✅ **瓦片化渲染架构** (Tile Rendering) - 只绘制可视区域
- ✅ **智能缓存机制** - TileCache + ChartCache 双层缓存
- ✅ **支持 100,000+ 行**数据流畅滚动（在主流桌面浏览器环境下实测）,实际性能受硬件配置、浏览器实现、单元格复杂度影响，建议在目标环境中自行验证

### 🧮 **强大的公式系统**
- ✅ **Excel 兼容语法** - `=SUM(A1:A100)`, `=VLOOKUP(...)`
- ✅ **50+ 内置函数** - 数学、统计、逻辑、文本、查找、条件函数
- ✅ **自定义函数注册** - `registerFunction('MYFUNC', impl)`
- ✅ **循环引用检测** - 防止无限递归
- ✅ **惰性求值** - 按需计算，避免不必要的开销

### 🎨 **丰富的数据类型**
- ✅ **6 种基础类型**: text, numeric, date, boolean, select, textarea
- ✅ **5 种可视化渲染器**: checkbox, progressBar, starRating, sparkline, colorPreview
- ✅ **可扩展的类型系统** - 继承 BaseColumnType 创建自定义类型

### 🔌 **插件化架构**
- ✅ **20+ 内置插件** - 冻结窗格、排序、筛选、自动填充、数据验证...
- ✅ **事件驱动** - EventBus + Hooks 双向通信机制
- ✅ **策略模式** - 键盘、鼠标、复制粘贴等行为可定制

### 🛡️ **企业级特性**
- ✅ **数据验证规则** - 必填、唯一性、正则表达式、范围限制
- ✅ **条件格式** - 基于规则的动态样式应用
- ✅ **撤销/重做栈** - Command Pattern 实现的完整历史记录
- ✅ **合并单元格** - 支持跨行跨列合并
- ✅ **多工作表管理** - SheetTab 切换与管理
- ✅ **导出功能** - CSV/Excel 格式导出

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
        
        // 创建工作簿实例
        const workbook = new CanvasSheet.Workbook(container, {
            startRows: 100,
            startCols: 26,
            defaultStyle: {
                fontSize: 14,
                fontFamily: 'Microsoft YaHei'
            }
        });
        const sheet = workbook.activeSheet;
        
        // 禁用单元格
        sheet.disableCell(1, 0);
        
        // 启用
        sheet.enableCell(1, 0);

        // 设置样式
        sheet.setCellStyle(1,,0 , {
            color: 'red',
            fontWeight: 'bold',
            textAlign: 'center'
            fontStyle: 'italic'
            backgroundColor: '#fff'
        });
        // 或者
        workbook.setCellStyle(row, col, {
            color: 'red',
            fontWeight: 'bold',
            textAlign: 'center'
            fontStyle: 'italic'
            backgroundColor: '#fff'
        });
        // 设置文本值
        sheet.setCell(0, 0, 'Hello World');

        // 设置数值
        sheet.setCell(2, 0, 42);

        // 设置公式（以 = 开头）
        sheet.setCell(4, 0, '=SUM(A1:A10)');           // 求和
        sheet.setCell(5, 0, '=AVERAGE(B1:B100)');      // 平均值
        sheet.setCell(6, 0, '=IF(C1>100,"High","Low")'); // 条件
    </script>
</body>
</html>
```

### 🎯 ES Module 方式（推荐）

```javascript
import { Workbook } from '@canvas-sheet/core';

// 初始化工作簿
const container = document.getElementById('spreadsheet-container');
const wb = new Workbook(container, {
    width: window.innerWidth,
    height: window.innerHeight,
    
    // 初始行列数
    startRows: 1000,
    startCols: 50,
    
    // 默认样式
    defaultStyle: {
        fontSize: 13,
        fontFamily: 'Arial',
        textAlign: 'left'
    }
});

// 批量填充数据
wb.activeSheet.loadData([
    ["姓名", "年龄", "green"],
    ["张三", 30, "yellow"],
    ["李四", 25, "red"],
]);

```

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
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
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

## 📦 安装与使用

### 📋 前置要求

- **Node.js**: >= 16.x
- **现代浏览器**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **构建工具**: Webpack 5+ (已配置)

### 🛠️ 开发环境搭建

```bash
# 克隆项目
git clone https://github.com/your-repo/canvas-implementation-in-excel.git
cd canvas-implementation-in-excel

# 安装依赖
npm install

# 启动开发服务器 (热更新)
npm run dev
# 访问 http://localhost:9000

# 生产构建
npm run build:lib
# 输出: dist/canvas-sheet.esm.mjs (ES Module)
#       dist/canvas-sheet.umd.js  (UMD)

# 运行测试
npm test              # 单次运行
npm run test:watch    # 监听模式
npm run test:coverage # 覆盖率报告

# 代码检查
npm run lint          # ESLint
npm run format        # Prettier

# 生成文档
npm run docs          # JSDoc → HTML
```

### 📖 在项目中引入

#### 方式 1: CDN 直接引用 (UMD)

```html
<script src="https://cdn.example.com/canvas-sheet.umd.js"></script>
<script>
    const { Workbook } = CanvasSheet;
    const wb = new Workbook(document.getElementById('app'));
</script>
```

#### 方式 2: ES Module (推荐)

```javascript
// main.js
import { Workbook } from '@canvas-sheet/core';

const wb = new Workbook(document.getElementById('container'), options);
```

---

## 💻 API 参考

### 📘 Workbook 类 - 工作簿核心

> **顶层管理对象**，作为 Facade 协调 Sheet、RenderEngine、EventHandler、EditorManager、PluginManager 等子系统。
>
> 对齐 Handsontable 的 `new Handsontable(container, options)` 模式。

#### 📌 构造函数

```javascript
/**
 * @param {HTMLElement|string} element - 容器元素或 Canvas 元素 ID
 * @param {object} [options={}] - 配置选项
 */
new Workbook(element, options)
```

#### 🔧 静态方法：全局插件注册

```javascript
// 全局注册插件类（统一注册源）
Workbook.registerPlugin(name, PluginClass);

// 全局注销插件类
Workbook.unregisterPlugin(name);
```

#### 🔌 插件委托方法

```javascript
// 加载已注册的插件（按名称）
workbook.loadPlugin(name, options);

// 直接加载插件类
workbook.loadPluginClass(PluginClass, options);

// 卸载插件
workbook.unloadPlugin(name);

// 获取插件实例
workbook.getPlugin(name);

// 启用/禁用插件
workbook.enablePlugin(name);
workbook.disablePlugin(name);
```

#### ⚙️ 初始化与生命周期

```javascript
// 初始化渲染引擎、编辑器、事件处理、插件系统（延迟初始化）
workbook.initRender();

// 销毁所有资源（必须在移除 DOM 前调用）
workbook.destroy();
```

#### 📑 工作表管理

```javascript
// 添加工作表
const sheet = workbook.addSheet(name);

// 删除工作表（至少保留一个）
const success = workbook.removeSheet(name);

// 重命名工作表
const success = workbook.renameSheet(oldName, newName);

// 切换到指定工作表
workbook.switchTo(name);

// 获取当前活动工作表
const sheet = workbook.getActiveSheet();
```

#### 🎨 渲染控制

```javascript
// 重新渲染当前活动工作表
workbook.render();
```

#### 📋 剪贴板操作（委托到 CopyPastePlugin）

```javascript
// 复制当前选区
workbook.copy();

// 粘贴到当前选区
workbook.paste();
```

#### ↩️ 撤销/重做

```javascript
// 撤销
workbook.undo();

// 重做
workbook.redo();
```

#### 📊 单元格操作

```javascript
// 禁用/启用单元格
workbook.disableCell();
workbook.enableCell();

// 合并/取消合并单元格
workbook.mergeCells(topRow, topCol, bottomRow, bottomCol);
workbook.unmergeCells();

// 插入/删除行和列
// atRow:第几行
// atCol:第几列
workbook.insertRow(atRow);
workbook.insertCol(atCol);
workbook.deleteRow(atRow);
workbook.deleteCol(atCol);
```


#### 🎯 钩子系统（Hooks）（委托到 EventHandler，支持 Early Hooks）

```javascript
// 添加钩子监听器（eventHandler 创建前会缓存）
workbook.addHook(hookName, callback);

// 添加一次性钩子监听器
workbook.addHookOnce(hookName, callback);

// 移除钩子监听器
workbook.removeHook(hookName, callback);

// 清空指定钩子的所有监听器
workbook.clearHook(hookName);

// 检查是否有指定钩子的监听器
const exists = workbook.hasHook(hookName);

// 触发所有监听器
workbook.runHooks(hookName, ...args);

// 触发监听器直到返回 false
workbook.runHooksUntil(hookName, ...args);
```

#### 💅 样式操作

```javascript
// 更新配置（对齐 Handsontable 的 updateSettings API）
workbook.updateSettings(settings);

// 单元格样式

const style = workbook.getCellStyle(row, col);
workbook.clearCellStyle(row, col);

// 范围样式
workbook.setRangeStyle(range, styleObj);
workbook.clearRangeStyle(range);

// 行列样式
workbook.setRowStyle(row, styleObj);
workbook.setColStyle(col, styleObj);
workbook.clearRowStyle(row);
workbook.clearColStyle(col);

// 默认样式（全局基础）
workbook.setDefaultStyle(styleObj);  // 所有 Sheet 继承
const defaultStyle = workbook.getDefaultStyle();

// 批量样式更新（性能优化）
workbook.batchStyleUpdate(fn);
```

#### 📤 导出功能（委托到 exportFile 插件）

```javascript
// 导出为字符串
const csvString = workbook.exportAsString('csv', options);

// 导出为 Blob 对象
const blob = workbook.exportAsBlob('xlsx', options);

// 直接触发下载
workbook.downloadFile('csv', options);
```

#### 🏷️ 公共属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `sheets` | `Map<string, Sheet>` | 所有工作表的 Map |
| `activeSheet` | `Sheet\|null` | 当前活动的工作表 |
| `clipboard` | `ClipboardManager\|null` | 剪贴板管理器（由 CopyPastePlugin 注入） |
| `renderEngine` | `RenderEngine\|null` | 渲染引擎实例 |
| `editor` | `EditorManager\|null` | 编辑器管理器 |
| `eventHandler` | `EventHandler\|null` | 事件处理器 |
| `pluginManager` | `PluginManager\|null` | 插件管理器 |
| `formulaEngine` | `FormulaEngine\|null` | 公式引擎（由 FormulaPlugin 注入） |
| `formulaBar` | `FormulaBarManager\|null` | 公式栏管理器（由 FormulaPlugin 注入） |

### 📗 配置选项

#### 🔹 Workbook 级别配置（WorkbookOptions）

> 以下配置项作用于 **Workbook 全局**，或作为**默认值**应用到所有 Sheet。

```typescript
interface WorkbookOptions {
    // ========== 尺寸设置（Workbook 全局）==========
    width?: number;                              // 画布宽度（px），默认自适应容器
    height?: number;                             // 画布高度（px），默认自适应容器
    
    // ========== 工作表配置 ==========
    sheetName?: string;                          // 初始工作表名称（默认: 'Sheet1'）
    sheets?: SheetConfig[];                      // 多工作表配置数组（推荐使用）
    
    // ========== 全局默认样式 ==========
    defaultStyle?: CellStyle;                    // 单元格默认样式（所有 Sheet 继承的基础样式）
    
    // ========== 插件系统（Workbook 全局）==========
    plugins?: string[];                          // 要加载的插件名称列表
    pluginOptions?: { [pluginName: string]: any }; // 插件选项映射 { pluginName: options }
    
    // ========== 钩子系统（Workbook 全局）==========
    hooks?: { [hookName: string]: Function };    // 事件钩子映射 { hookName: callback }
    
    // ========== 生命周期回调 ==========
    afterInit?: Function;                        // 初始化完成回调 (workbook) => void
}
```

#### 🔸 Sheet 级别配置（SheetConfig）

> ⚠️ **重要：** 以下配置项属于**具体某个 Sheet** 的配置，建议放在 `sheets` 数组的每个 sheet 对象中。
>
> 如果直接放在顶层 `options` 中，将作为**默认值**应用到所有 Sheet。

```typescript
interface SheetConfig {
    // ========== 基础信息 ==========
    name?: string;                               // 工作表名称（默认自动生成 'SheetN'）
    
    // ========== 数据初始化 ==========
    data?: Array<Array<any>>;                    // 初始数据（二维数组）
    
    // ========== 行列配置 ==========
    startRows?: number;                          // 初始行数（默认: 100）
    startCols?: number;                          // 初始列数（默认: 26）
    maxRows?: number;                            // 最大行数限制（超过则忽略新增）
    maxCols?: number;                            // 最大列数限制（超过则忽略新增）
    rowHeights?: number | number[];              // 行高配置
    colWidths?: number | number[];               // 列宽配置
    
    // ========== 表头配置 ==========
    colHeaders?: true | string[] | Function;     // 列头标签（默认: true）
    rowHeaders?: true | string[] | Function;     // 行头标签（默认: true）
    headerHeight?: number;                       // 表头高度
    rowHeaderWidth?: number;                     // 行头宽度
    nestedHeaders?: Array<Array<{                // 嵌套表头配置
        label: string;
        colspan?: number;
        rowspan?: number;
        style?: object;
    }>>;
    
    // ========== 样式配置 ==========
    defaultStyle?: CellStyle;                    // 该 Sheet 的默认样式（覆盖 Workbook 级别）
    rowStyles?: Array<object>;                   // 行样式数组
    colStyles?: Array<object>;                   // 列样式数组
    rangeStyles?: Array<object>;                 // 区域样式数组
    
    // ========== 单元格配置 ==========
    cell?: Array<{
        row: number;
        col: number;
        style?: object;
        disabled?: boolean;
        readOnly?: boolean;
        value?: any;
    }>;                                         // 静态单元格配置
    cells?: Function;                            // 动态单元格属性函数 (row, col) => { style?, disabled?, ... }
    
    // ========== 合并单元格 ==========
    mergeCells?: Array<{
        row: number;
        col: number;
        rowspan: number;
        colspan: number;
    }>;
    
    // ========== 条件格式 ==========
    conditionalStyles?: Array<{
        range: object;
        condition: Function;
        style: object;
    }>;
    
    // ========== 列定义 ==========
    columns?: Array<object | Function>;          // 列配置数组
    
    // ========== 冻结窗格 ==========
    fixedRowsTop?: number;                       // 固定顶部行数
    fixedColumnsStart?: number;                  // 固定左侧列数
    
    // ========== 渲染配置 ==========
    cellPadding?: number;                        // 单元格内边距
    textOverflowEllipsis?: boolean;              // 文本溢出显示省略号
    
    // ========== 功能开关 ==========
    readOnly?: boolean;                          // 只读模式
}
```

#### 📊 配置优先级说明

```
┌─────────────────────────────────────────┐
│  Workbook.defaultStyle (全局基础 - 最低优先级) │
└─────────────────────┬───────────────────┘
                      ↓
┌─────────────────────────────────────────┐
│   Sheet.defaultStyle (Sheet 级别 - 中等)    │
└─────────────────────┬───────────────────┘
                      ↓
┌─────────────────────────────────────────┐
│  rangeStyles / cell / cells (最高优先级)  │
└─────────────────────────────────────────┘
```

当同一属性在多个层级都有配置时，**越具体的配置优先级越高**。

---

#### 📝 使用示例

```javascript
import { Workbook } from '@canvas-sheet/core';

const workbook = new Workbook(document.getElementById('container'), {
    // ✅ Workbook 级别配置（全局）
    width: window.innerWidth,
    height: window.innerHeight,
    
    // 全局默认样式（所有 Sheet 继承的基础）
    defaultStyle: {
        fontSize: 13,
        fontFamily: 'Arial',
        textAlign: 'left',
        color: '#333'
    },
    
    // 加载插件（全局）
    plugins: ['freeze', 'sort', 'filter', 'autoFill'],
    pluginOptions: {
        freeze: { fixedRowsTop: 2, fixedColsLeft: 1 }
    },
    
    // 推荐方式：使用 sheets 数组配置每个 Sheet
    sheets: [
        {
            name: 'Sheet1',
            
            // ✅ Sheet 级别配置
            startRows: 100,
            startCols: 26,
            
            // 表头配置
            colHeaders: true,
            rowHeaders: true,
            
            // 该 Sheet 的默认样式（会合并全局 defaultStyle）
            defaultStyle: {
                backgroundColor: '#fff'
            },
            
            // 初始数据
            data: [
                ['姓名', '年龄', '城市'],
                ['张三', 25, '北京'],
                ['李四', 30, '上海']
            ],
            
            // 合并单元格
            mergeCells: [
                { row: 0, col: 0, rowspan: 1, colspan: 3 }
            ],
            
            // 单元格配置
            cell: [
                { row: 1, col: 0, value: '张三', readOnly: true },
                { row: 1, col: 1, value: 25, style: { color: 'blue' } }
            ]
        },
        {
            name: '数据统计',
            
            // 另一个 Sheet 可以有完全不同的配置
            startRows: 50,
            startCols: 10,
            readOnly: true,
            
            data: [
                ['项目', '数值'],
                ['总计', '=SUM(Sheet1!B:B)']
            ]
        }
    ],
    
    // 初始化完成回调
    afterInit: (workbook) => {
        console.log('准备就绪！', workbook);
        
        // 添加自定义钩子
        workbook.addHook('afterSelection', (row, col) => {
            console.log(`选中单元格: ${row}, ${col}`);
        });
    }
});

// 必须调用 initRender() 完成初始化
workbook.initRender();
```

### 📙 示例代码库

<details>
<summary><b>🔧 高级用法示例</b></summary>

#### 1️⃣ 自定义列类型

```javascript
import { BaseColumnType,Workbook,registerColumnTypeClass } from '@canvas-sheet/core';


class TrafficLightType extends BaseColumnType {
    get name() {
        return "trafficLight";
    }

    get editorType() {
        return "select";
    }

    getEditorOptions() {
        return {
            source: [
                { value: "green", label: "🟢 正常" },
                { value: "yellow", label: "🟡 警告" },
                { value: "red", label: "🔴 危险" },
            ],
        };
    }

    format(value) {
        const map = { green: "正常", yellow: "警告", red: "危险" };
        return map[value] || String(value);
    }

    render(context) {
        const { ctx, x, y, width, height, value, displayValue, style } = context;

        const indicatorSize = Math.min(width, height) * 0.35;
        const indicatorRadius = indicatorSize / 2;
        const indicatorCy = context.getCenterY();
        const gap = 6;
        const padding = context.getPadding(context.sheet);

        const colors = {
            green: "#4caf50",
            yellow: "#ff9800",
            red: "#f44336",
        };

        const fontSize = style?.fontSize || 14;
        const fontFamily = style?.fontFamily || "Microsoft YaHei";
        const textColor = style?.color || "#000";
        const textAlign = style?.textAlign || "left";

        ctx.font = `${fontSize}px ${fontFamily}`;
        const textWidth = displayValue ? ctx.measureText(displayValue).width : 0;
        const totalWidth = indicatorSize + gap + textWidth;

        let startX;
        if (textAlign === "right") {
            startX = x + width - totalWidth - padding;
        } else if (textAlign === "center") {
            startX = x + (width - totalWidth) / 2;
        } else {
            startX = x + padding;
        }

        const indicatorCx = startX + indicatorRadius;
        const textX = startX + indicatorSize + gap;

        ctx.fillStyle = colors[value] || "#ccc";
        ctx.beginPath();
        ctx.arc(indicatorCx, indicatorCy, indicatorRadius, 0, Math.PI * 2);
        ctx.fill();

        if (context.isSelected) {
            ctx.strokeStyle = colors[value] || "#999";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(indicatorCx, indicatorCy, indicatorRadius + 3, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (displayValue) {
            ctx.fillStyle = textColor;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(displayValue, textX, indicatorCy);
        }
    }
}
// 注册自定义类型
registerColumnTypeClass("trafficLight", TrafficLightType);

const wb = new Workbook('canvas', {
    defaultStyle: {},

    // readOnly: true,
    // 工作表高度和宽度（像素值）
    // height: 600,
    // 工作表高度和宽度（像素值）
    // width: 800,

    // 初始行数
    // startRows: 10,
    // 初始列数
    // startCols: 10,
    // cellPadding: 30,
    sheets: [
       
        {
            name: "Sheet1",
            // 是否只读
            readOnly: false,
            headerHeight: 48,
            // 嵌套表头配置
            nestedHeaders: [
                [
                    {
                        label: "日报表",
                        colspan: 5,
                        style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                    },
                ],
                [
                    { label: "日期：yyyy-mm-dd", style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" } },
                    {
                        label: "时间",
                        colspan: 4,

                        style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                    },
                ],
                [
                    {
                        label: "名称",
                        style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                    },
                    {
                        label: "0:00",
                        style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                    },

                    {
                        label: "2:00",
                        style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                    },

                    {
                        label: "4:00",
                        style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                    },
                    {
                        label: "6:00",
                        style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                    },
                ],
            ],

            // 单元格内容超出单元格宽度时是否显示省略号
            textOverflowEllipsis: false,

            // 每个单元格的内边距（像素值）
            cellPadding: 10,

            // 固定行列数上限（使用 maxRows/maxCols）
            maxRows: 50,
            maxCols: 14,

            colWidths: [600],
            columns: [
                { type: "text", width: 120, style: { textAlign: "left" } },
                { type: "select", width: 80, style: { textAlign: "right" }, source: ["正常", "异常"] },
                { type: "textarea", width: 200, maxRows: 4, style: { textAlign: "right" } },
            ],

            cell: [
                { row: 0, col: 2, type: "trafficLight" }, // 第0行第2列 → trafficLight
                { row: 1, col: 2, type: "select", source: ["正常", "异常"] }, // → select
            ],
        },
        {
            name: "Sheet2",

            // readOnly: false,
            data: [
                ["Zhang San", 25, "Beijing", "Tech", 15000, "2020-03-15"],
                ["Li Si", 30, "Shanghai", "Marketing", 18000, "2019-07-01"],
                ["Wang Wu", 28, "Guangzhou", "Tech", 16000, "2021-01-10"],
            ],

            // colHeaders: ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
            rowHeaderWidth: 120,
            rowHeights: [30, 50, 90],
            rowHeaders: [{ label: "序号", style: { textAlign: "center" } }, "年龄", "城市", "部门", "薪酬", "入职日期"],

            // 嵌套表头配置（支持完整 style 属性）
            nestedHeaders: [
                [
                    {
                        label: "基本信息",
                        colspan: 2,
                        style: {
                            backgroundColor: "#FFC000",
                            color: "#FFFFFF",
                            fontWeight: "bold",
                            fontSize: "14px",
                            textAlign: "left",
                        },
                    },
                    {
                        label: "工作信息",
                        colspan: 4,
                        style: {
                            backgroundColor: "#70AD47",
                            color: "#FFFFFF",
                            fontWeight: "bold",
                            fontSize: "14px",
                            textAlign: "center",
                        },
                    },
                ],
                [
                    {
                        label: "姓名",
                        style: {
                            backgroundColor: "#FFC000",
                            fontWeight: "bold",
                        },
                    },
                    "年龄",
                    {
                        label: "城市",
                        style: {
                            backgroundColor: "#FFC000",
                            fontWeight: "bold",
                        },
                    },
                    {
                        label: "部门",
                        style: {
                            fontStyle: "italic",
                            color: "#333333",
                        },
                    },
                    {
                        label: "薪酬",
                        colspan: 2,
                        style: {
                            backgroundColor: "#ED7D31",
                            color: "#FFFFFF",
                            textAlign: "center",
                        },
                    },
                ],
                ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
            ],
            textOverflowEllipsis: false,
            cellPadding: 10,
            conditionalStyles: [
                {
                    range: { topRow: 0, topCol: 0, bottomRow: 10000000, bottomCol: 25 },
                    condition: (v) => isNumber(v) && v > 25,
                    style: { backgroundColor: "#ffcccc" },
                },
            ],
            cell: [
                { row: 0, col: 0, style: { backgroundColor: "#e8f4fd", fontWeight: "bold", textAlign: "center" } },
                { row: 1, col: 3, disabled: true },
                { row: 2, col: 4, readOnly: true, style: { backgroundColor: "#fff3cd" } },
            ],
            cells: (row, col) => {
                if (row === 0) {
                    return { style: { fontWeight: "bold", backgroundColor: "#e8f4fd" } };
                }
                if (col === 0 && row > 0) {
                    return { style: { textAlign: "right", fontWeight: "bold" } };
                }
            },
            columns: [
                { type: "text", width: 120, style: { textAlign: "left" } },
                { type: "numeric", width: 80, style: { textAlign: "right" }, numericFormat: { pattern: "0" } },
                { type: "text", width: 100 },
                { type: "text", width: 100 },
                { type: "numeric", width: 100, style: { textAlign: "right" }, numericFormat: { pattern: "$0,0.00" } },
                { type: "date", width: 300 },
            ],
        },
    ],
    plugins: [
        "autoFill",
        "contextMenu",
        "columnMove",
        "copyPaste",

        "exportFile",
        "hiddenColumns",
        "hiddenRows",
        "rowMove",
        "freeze",
        "formula",
        "sort",
        "dataValidation",
    ],
    pluginOptions: {
        contextMenu: {
            enabled: true,
            customItems: [
                {
                    label: "高亮选中行",

                    // 自定义项 contexts 属性：自定义菜单项可指定在哪些上下文中显示，不指定则默认 ["cell"]
                    contexts: ["cell", "rowHeader"],
                    action: (row, col, sheet) => {
                        sheet.setRowStyle(row, { backgroundColor: "yellow" });
                        wb.render();
                    },
                },
                {
                    label: "设置单元格样式",
                    contexts: ["cell"],
                    action: (row, col, sheet) => {
                        const range = sheet.selection.getRange();
                        const styleObj = { backgroundColor: "#d4edda", fontWeight: "bold", color: "#155724" };
                        for (let r = range.topRow; r <= range.bottomRow; r++) {
                            for (let c = range.topCol; c <= range.bottomCol; c++) {
                                if (!sheet.isDisabled(r, c)) {
                                    sheet.setCellStyle(r, c, styleObj);
                                }
                            }
                        }
                        wb.render();
                    },
                },
                {
                    label: "取消单元格样式",
                    contexts: ["cell", "rowHeader", "colHeader"],
                    action: (row, col, sheet) => {
                        errorHandler.debug(ERROR_CODE.DEBUG_LOG, "Clear cell style");
                        const range = sheet.selection.getRange();
                        for (let r = range.topRow; r <= range.bottomRow; r++) {
                            sheet.clearRowStyle(r);
                            for (let c = range.topCol; c <= range.bottomCol; c++) {
                                sheet.clearCellStyle(r, c);
                            }
                        }
                        wb.render();
                    },
                },
                { type: "separator" },
                {
                    label: "导出选中区域",
                    action: (row, col, sheet) => {
                        errorHandler.debug(ERROR_CODE.DEBUG_LOG, "Export from", row, col);
                        alert("导出功能（示例）");
                    },
                },
            ],

            // disabledItems: ["mergeCells", "unmergeCells"],

            // rowMove: { enabled: false },
        },

        // freeze: { fixedRowsTop: 1, fixedColumnsStart: 1 },

        dataValidation: {
            conflictStrategy: "short-circuit",
            rules: [
                // {
                //     range: "B:B",
                //     type: "number",
                //     operator: "between",
                //     value: [0, 100],
                //     errorMessage: "必须输入正数",
                //     errorStyle: "stop",
                // },
                //
                // {
                //     range: "A:A",
                //     type: "text",
                //     operator: "greaterThan",
                //     value: 5,
                //     errorMessage: "必须输入正数",
                //     errorStyle: "stop",
                // },
                //
                // {
                //     range: "C:C",
                //     type: "time",
                //     operator: "between",
                //     value: ["09:00", "18:00"],
                //     errorMessage: "必须输入正数",
                //     errorStyle: "stop",
                // },
                // {
                //     range: "D:D",
                //     type: "unique",
                // },
                // {
                //     range: "G:G",
                //     type: "date",
                //     operator: "between",
                //     value: ["01/01/2020", "12/31/2020"],
                //     errorMessage: "必须输入正数",
                //     errorStyle: "stop",
                // },
            ],
        },
    },
    hooks: {
        
    },
    afterInit(wb) {
        const s2 = wb.sheets.get("Sheet2");
        if (s2) {
            s2.setCell(2, 0, "Switch to Sheet1 to paste");
        }
    },
});

```

#### 2️⃣ 自定义公式函数

```javascript
import { functionRegistry, FUNCTION_CATEGORY } from '@canvas-sheet/core';

// 注册税率计算函数
functionRegistry.register('TAX', (args, context) => {
    const amount = args[0];  // 金额
    const rate = args[1] || 0.13;  // 税率 (默认13%)
    return amount * rate;
}, { category: FUNCTION_CATEGORY.CUSTOM });
```

#### 3️⃣ 事件驱动编程

```javascript
const wb = new Workbook(container);
wb.addHook(HOOKS.ON_CELL_CLICK, (row, col, e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const sheet = wb.activeSheet;
    const cell = sheet.cellStore.get(row, col);
    if (cell?.value && isUrl(cell.value)) {
        const canOpen = wb.runHooks(HOOKS.BEFORE_OPEN_URL, row, col, cell.value, e);
        if (canOpen === false) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        openUrl(cell.value);
        wb.runHooks(HOOKS.AFTER_OPEN_URL, row, col, cell.value);
        e.preventDefault();
        e.stopPropagation();
    }
});

```

#### 4️⃣ 条件格式

```javascript
// 设置条件格式规则
new Workbook(container, {
    sheets:{
        conditionalStyles: [
            {
                range: { topRow: 0, topCol: 0, bottomRow: 10000000, bottomCol: 25 },
                condition: (v) => isNumber(v) && v > 25,
                style: { backgroundColor: "#ffcccc" },
            },
        ],
    }
})
```

#### 5️⃣ 数据验证

```javascript
new Workbook(container, {
    plugins: [
        "autoFill",
        "contextMenu",
        "columnMove",
        "copyPaste",
        "exportFile",
        "hiddenColumns",
        "hiddenRows",
        "rowMove",
        "freeze",
        "formula",
        "sort",
        "dataValidation",
    ],
    pluginOptions: {
        dataValidation: {
            conflictStrategy: "short-circuit",
            rules: [
                {
                    range: "B:B",
                    type: "number",
                    operator: "between",
                    value: [0, 100],
                    errorMessage: "必须输入正数",
                    errorStyle: "stop",
                },

                {
                    range: "A:A",
                    type: "text",
                    operator: "greaterThan",
                    value: 5,
                    errorMessage: "必须输入正数",
                    errorStyle: "stop",
                },

                {
                    range: "C:C",
                    type: "time",
                    operator: "between",
                    value: ["09:00", "18:00"],
                    errorMessage: "必须输入正数",
                    errorStyle: "stop",
                },
                {
                    range: "D:D",
                    type: "unique",
                },
                {
                    range: "G:G",
                    type: "date",
                    operator: "between",
                    value: ["01/01/2020", "12/31/2020"],
                    errorMessage: "必须输入正数",
                    errorStyle: "stop",
                },
            ],
        },
    },
})
```

</details>

---

## 🪝 Hooks 生命周期钩子系统

Canvas Spreadsheet 提供了完整的 **Hooks（钩子）系统**，允许开发者在关键节点注入自定义逻辑。

### 📋 Hooks 总览表

| 分类 | Hook 名称 | 常量引用 | 触发时机 | 可阻止操作 | 参数说明 |
|------|----------|---------|----------|-----------|---------|
| **📝 编辑相关** |
| 编辑开始前 | `beforeBeginEditing` | `HOOKS.BEFORE_BEGIN_EDITING` | 用户触发编辑但编辑器未打开时 | ✅ 返回 false 可阻止 | `(row, col)` |
| 编辑开始后 | `afterBeginEditing` | `HOOKS.AFTER_BEGIN_EDITING` | 编辑器已打开并准备好接收输入 | ❌ | `(row, col)` |
| 编辑结束前 | `beforeFinishEditing` | `HOOKS.BEFORE_FINISH_EDITING` | 用户提交编辑内容时 | ✅ 返回 false 可阻止 | `(row, col, newValue, oldValue)` |
| 编辑结束后 | `afterFinishEditing` | `HOOKS.AFTER_FINISH_EDITING` | 新值已写入数据模型 | ❌ | `(row, col, newValue, oldValue)` |
| 数据变更前 | `beforeChange` | `HOOKS.BEFORE_CHANGE` | 任何修改单元格值的操作之前 | ✅ 最后的机会阻止变更 | `[{row, col, oldValue, newValue}]` |
| 数据变更后 | `afterChange` | `HOOKS.AFTER_CHANGE` | 单元格值已更新到存储层 | ❌ | `changes: Array<{row, col, oldValue, newValue}>` |
| 设置单元格值前 | `beforeSetValueAt` | `HOOKS.BEFORE_SET_VALUE_AT` | 单个单元格写入前触发 | ✅ 用于数据验证拦截 | `(row, col, value)` |
| 设置单元格值后 | `afterSetValueAt` | `HOOKS.AFTER_SET_VALUE_AT` | 单个单元格写入后触发 | ❌ | `(row, col, value)` |
| **🎯 选择相关** |
| 选择开始前 | `beforeSelection` | `HOOKS.BEFORE_SELECTION` | 用户开始新的选择操作 | ✅ | `(startRow, startCol, endRow, endCol)` |
| 选择完成后 | `afterSelection` | `HOOKS.AFTER_SELECTION` | 选择区域已确定并高亮显示 | ❌ | `(startRow, startCol, endRow, endCol)` |
| 选择结束前（拖拽） | `beforeSelectionEnd` | `HOOKS.BEFORE_SELECTION_END` | 拖拽即将释放 | ✅ | `(range)` |
| 选择结束后 | `afterSelectionEnd` | `HOOKS.AFTER_SELECTION_END` | 拖拽选择操作已完成 | ❌ | `(range)` |
| **🖱️ 单元格交互** |
| 鼠标按下 | `onCellMouseDown` | `HOOKS.ON_CELL_MOUSE_DOWN` | 在单元格区域内按下鼠标按钮 | ❌ | `(row, col, event)` |
| 鼠标移入 | `onCellMouseOver` | `HOOKS.ON_CELL_MOUSE_OVER` | 鼠标指针进入单元格边界 | ❌ | `(row, col, event)` |
| 鼠标移出 | `onCellMouseOut` | `HOOKS.ON_CELL_MOUSE_OUT` | 鼠标指针离开单元格边界 | ❌ | `(row, col, event)` |
| 单元格点击 | `onCellClick` | `HOOKS.ON_CELL_CLICK` | 完整的 click 事件 | ❌ | `(row, col, event)` |
| 单元格双击 | `onCellDblClick` | `HOOKS.ON_CELL_DBL_CLICK` | 快速连续两次点击（通常用于编辑） | ❌ | `(row, col, event)` |
| **⌨️ 键盘相关** |
| 键盘按下前 | `beforeKeyDown` | `HOOKS.BEFORE_KEY_DOWN` | 按键被处理之前 | ✅ 可拦截按键 | `(event)` |
| 键盘按下后 | `afterKeyDown` | `HOOKS.AFTER_KEY_DOWN` | 按键已被处理并产生效果 | ❌ | `(event)` |
| **📜 滚动相关** |
| 水平滚动后 | `afterScrollHorizontally` | `HOOKS.AFTER_SCROLL_HORIZONTALLY` | 视口水平位置已改变 | ❌ | `(newScrollLeft)` |
| 垂直滚动后 | `afterScrollVertically` | `HOOKS.AFTER_SCROLL_VERTICALLY` | 视口垂直位置已改变 | ❌ | `(newScrollTop)` |
| **🔗 合并单元格** |
| 合并前 | `beforeMergeCells` | `HOOKS.BEFORE_MERGE_CELLS` | 即将执行合并操作 | ✅ | `(topRow, topCol, bottomRow, bottomCol)` |
| 合并后 | `afterMergeCells` | `HOOKS.AFTER_MERGE_CELLS` | 单元格已成功合并为一个区域 | ❌ | `(mergeRange)` |
| 取消合并前 | `beforeUnmergeCells` | `HOOKS.BEFORE_UNMERGE_CELLS` | 即将拆分合并单元格 | ✅ | `(topRow, topCol)` |
| 取消合并后 | `afterUnmergeCells` | `HOOKS.AFTER_UNMERGE_CELLS` | 合并单元格已恢复为独立单元格 | ❌ | `(row, col)` |
| **📋 剪贴板** |
| 复制前 | `beforeCopy` | `HOOKS.BEFORE_COPY` | 数据即将复制到剪贴板 | ✅ | `(range)` |
| 复制后 | `afterCopy` | `HOOKS.AFTER_COPY` | 数据已复制到剪贴板 | ❌ | `(data, range)` |
| 剪切前 | `beforeCut` | `HOOKS.BEFORE_CUT` | 数据即将剪切到剪贴板并从原位置移除 | ✅ | `(range)` |
| 剪切后 | `afterCut` | `HOOKS.AFTER_CUT` | 数据已从原位置移除 | ❌ | `(data, range)` |
| 粘贴前 | `beforePaste` | `HOOKS.BEFORE_PASTE` | 剪贴板数据即将粘贴到目标位置 | ✅ | `(targetPosition, data)` |
| 粘贴后 | `afterPaste` | `HOOKS.AFTER_PASTE` | 剪贴板数据已插入到目标位置 | ❌ | `(changes)` |
| **↔️ 列/行移动** |
| 列移动前 | `beforeColumnMove` | `HOOKS.BEFORE_COLUMN_MOVE` | 即将通过拖拽改变列顺序 | ✅ | `(sourceCol, targetCol)` |
| 列移动后 | `afterColumnMove` | `HOOKS.AFTER_COLUMN_MOVE` | 列顺序已调整完成 | ❌ | `(sourceCol, targetCol)` |
| 行移动前 | `beforeRowMove` | `HOOKS.BEFORE_ROW_MOVE` | 即将通过拖拽改变行顺序 | ✅ | `(sourceRow, targetRow)` |
| 行移动后 | `afterRowMove` | `HOOKS.AFTER_ROW_MOVE` | 行顺序已调整完成 | ❌ | `(sourceRow, targetRow)` |
| **👁️ 隐藏显示** |
| 列隐藏后 | `afterHideColumn` | `HOOKS.AFTER_HIDE_COLUMN` | 指定列已从视图中隐藏 | ❌ | `(colIndex)` |
| 列显示后 | `afterShowColumn` | `HOOKS.AFTER_SHOW_COLUMN` | 隐藏的列已重新可见 | ❌ | `(colIndex)` |
| 行隐藏后 | `afterHideRow` | `HOOKS.AFTER_HIDE_ROW` | 指定行已从视图中隐藏 | ❌ | `(rowIndex)` |
| 行显示后 | `afterShowRow` | `HOOKS.AFTER_SHOW_ROW` | 隐藏的行已重新可见 | ❌ | `(rowIndex)` |
| **❄️ 冻结窗格** |
| 冻结后 | `afterFreeze` | `HOOKS.AFTER_FREEZE` | 冻结窗格已生效 | ❌ | `(fixedRowsTop, fixedColumnsStart)` |
| 解冻后 | `afterUnfreeze` | `HOOKS.AFTER_UNFREEZE` | 冻结窗格已取消 | ❌ | - |
| **📑 工作表管理** |
| 工作表新增前 | `beforeSheetAdd` | `HOOKS.BEFORE_SHEET_ADD` | 即将创建新工作表 | ✅ | `(sheetName)` |
| 工作表新增后 | `afterSheetAdd` | `HOOKS.AFTER_SHEET_ADD` | 新工作表已成功创建 | ❌ | `(sheetName, sheetInstance)` |
| 工作表删除前 | `beforeSheetRemove` | `HOOKS.BEFORE_SHEET_REMOVE` | 即将删除工作表 | ✅ | `(sheetName)` |
| 工作表删除后 | `afterSheetRemove` | `HOOKS.AFTER_SHEET_REMOVE` | 工作表已从工作簿中移除 | ❌ | `(sheetName, removedSheet)` |
| 工作表重命名前 | `beforeSheetRename` | `HOOKS.BEFORE_SHEET_RENAME` | 即将重命名工作表 | ✅ | `(oldName, newName)` |
| 工作表重命名后 | `afterSheetRename` | `HOOKS.AFTER_SHEET_RENAME` | 工作表名称已更改 | ❌ | `(oldName, newName)` |
| 工作表切换前 | `beforeSheetSwitch` | `HOOKS.BEFORE_SHEET_SWITCH` | 即将切换到指定工作表 | ✅ | `(currentSheet, targetSheet)` |
| 工作表切换后 | `afterSheetSwitch` | `HOOKS.AFTER_SHEET_SWITCH` | 当前活动工作表已改变 | ❌ | `(previousSheet, currentSheet)` |
| **📊 排序** |
| 排序后 | `afterSort` | `HOOKS.AFTER_SORT` | 数据已按指定规则重新排列 | ❌ | `(colIndex, options, result)` |
| 排序恢复后 | `afterSortRestore` | `HOOKS.AFTER_SORT_RESTORE` | 已撤销排序操作，恢复原始顺序 | ❌ | `(swappedRows)` |
| **🎨 图表** |
| 图表添加后 | `afterChartAdd` | `HOOKS.AFTER_CHART_ADD` | 新图表已创建并添加到工作表 | ❌ | `(chartConfig, chartInstance)` |
| 图表删除后 | `afterChartRemove` | `HOOKS.AFTER_CHART_REMOVE` | 图表已从工作表中移除 | ❌ | `(chartId)` |
| 图表更新后 | `afterChartUpdate` | `HOOKS.AFTER_CHART_UPDATE` | 图表数据或样式已变更 | ❌ | `(chartId, newConfig)` |
| **🔗 URL 超链接** |
| URL 检测到 | `onUrlDetected` | `HOOKS.ON_URL_DETECTED` | 单元格值被识别为 URL 时 | ❌ | `(row, col, urlValue)` |
| URL 点击前 | `beforeOpenUrl` | `HOOKS.BEFORE_OPEN_URL` | 用户 Ctrl+Click 包含 URL 的单元格时 | ✅ 可阻止打开 | `(row, col, urlValue, event)` |
| URL 已打开 | `afterOpenUrl` | `HOOKS.AFTER_OPEN_URL` | 链接已通过 window.open 打开 | ❌ | `(row, col, urlValue)` |
| **🔄 生命周期** |
| 初始化完成 | `init` | `HOOKS.INIT` | Workbook/Sheet 构造完成并准备就绪 | ❌ | `(workbook/sheet)` |
| 销毁前 | `destroy` | `HOOKS.DESTROY` | 对象即将被清理和释放资源 | ❌ | `(instance)` |

### 💡 Hooks 使用示例

<details>
<summary><b>🔧 实战案例集</b></summary>

#### **1️⃣ 数据验证拦截**

```javascript
import { HOOKS } from '@canvas-sheet/core';

const wb = new Workbook(container);

// 阻止非法数据输入
wb.addHook(HOOKS.BEFORE_CHANGE, (changes) => {
    for (const change of changes) {
        const { row, col, newValue } = change;
        
        // 第 1 列只允许正数
        if (col === 1 && typeof newValue === 'number' && newValue < 0) {
            alert('第 1 列不允许负数！');
            return false;  // 阻止整个变更
        }
        
        // 第 2 列邮箱格式验证
        if (col === 2 && typeof newValue === 'string') {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newValue)) {
                alert('请输入有效的邮箱地址！');
                return false;  // 阻止变更
            }
        }
    }
    
    return true;  // 允许变更
});
```

#### **2️⃣ 操作日志记录**

```javascript
// 记录所有数据变更（不可撤销）
wb.addHook(HOOKS.AFTER_CHANGE, (changes) => {
    const timestamp = new Date().toISOString();
    
    changes.forEach(({ row, col, oldValue, newValue }) => {
        console.log(`[${timestamp}] 变更: [${row},${col}]: "${oldValue}" → "${newValue}"`);
        
        // 发送到远程日志服务器
        sendToLogServer({
            action: 'cell_change',
            position: { row, col },
            oldValue,
            newValue,
            timestamp,
            user: currentUser.id
        });
    });
});

// 记录工作表切换
wb.addHook(HOOKS.AFTER_SHEET_SWITCH, (previousSheet, currentSheet) => {
    analytics.track('sheet_switch', {
        from: previousSheet.name,
        to: currentSheet.name,
        userId: currentUser.id
    });
});
```

#### **3️⃣ 自定义快捷键行为**

```javascript
// 拦截特定按键
wb.addHook(HOOKS.BEFORE_KEY_DOWN, (event) => {
    // Ctrl+S 保存（默认无行为）
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        saveWorkbook();
        return true;  // 表示已处理
    }
    
    // Ctrl+Z 在特定条件下禁用撤销
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        if (isReadOnlyMode()) {
            event.preventDefault();
            showToast('只读模式不允许撤销');
            return true;
        }
    }
    
    return undefined;  // 继续默认处理
});
```

#### **4️⃣ 单元格交互增强**

```javascript
// 双击打开详情弹窗
wb.addHook(HOOKS.ON_CELL_DBL_CLICK, (row, col, event) => {
    if (col === 0) {  // 第一列为 ID 列
        const cellValue = wb.getCellValue(row, col);
        openDetailModal(cellValue);
        event.preventDefault();  // 阻止默认编辑行为
    }
});

// 鼠标悬停显示提示
let tooltipTimeout;
wb.addHook(HOOKS.ON_CELL_MOUSE_OVER, (row, col, event) => {
    clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
        showTooltip(event.clientX, event.clientY, {
            content: `行: ${row + 1}, 列: ${col + 1}`,
            value: wb.getCellValue(row, col)
        });
    }, 500);  // 延迟 500ms 显示
});

wb.addHook(HOOKS.ON_CELL_MOUSE_OUT, () => {
    clearTimeout(tooltipTimeout);
    hideTooltip();
});
```

#### **5️⃣ 复制粘贴数据处理**

```javascript
// 粘贴前转换数据格式
wb.addHook(HOOKS.BEFORE_PASTE, (targetPosition, clipboardData) => {
    // 将外部复制的文本自动转换为数字
    const processedData = clipboardData.map(row =>
        row.map(cell => {
            if (typeof cell === 'string' && /^[\d,.]+$/.test(cell)) {
                return parseFloat(cell.replace(/,/g, ''));
            }
            return cell;
        })
    );
    
    return processedData;  // 返回修改后的数据
});

// 复制时添加额外信息
wb.addHook(HOOKS.AFTER_COPY, (data, range) => {
    console.log(`复制了 ${data.length} 行 × ${data[0]?.length || 0} 列数据`);
    
    // 自动同步到剪贴板的元数据
    navigator.clipboard.writeText(JSON.stringify({
        source: 'canvas-spreadsheet',
        range,
        timestamp: Date.now(),
        data
    }));
});
```

#### **6️⃣ 排序和冻结监控**

```javascript
// 排序后更新图表数据源
wb.addHook(HOOKS.AFTER_SORT, (colIndex, options, result) => {
    console.log(`按第 ${colIndex + 1} 列${options.ascending ? '升序' : '降序'}排序完成`);
    
    // 刷新关联的图表
    refreshLinkedCharts();
    
    // 显示排序提示
    showToast(`排序完成：影响 ${result.swappedCount} 行`);
});

// 冻结状态变化监听
wb.addHook(HOOKS.AFTER_FREEZE, (fixedRows, fixedCols) => {
    console.log(`冻结窗格已设置：固定 ${fixedRows} 行，${fixedCols} 列`);
    
    updateFreezeIndicator(fixedRows, fixedCols);
});

wb.addHook(HOOKS.AFTER_UNFREEZE, () => {
    console.log('冻结窗格已取消');
    hideFreezeIndicator();
});
```

#### **7️⃣ URL 超链接安全控制**

```javascript
// 拦截危险 URL 打开
wb.addHook(HOOKS.BEFORE_OPEN_URL, (row, col, urlValue, event) => {
    // 白名单检查
    const allowedDomains = ['example.com', 'company-internal.com'];
    try {
        const url = new URL(urlValue);
        if (!allowedDomains.some(domain => url.hostname.endsWith(domain))) {
            event.preventDefault();
            
            // 显示确认对话框
            const confirmed = confirm(
                `您即将访问外部链接：\n\n${urlValue}\n\n是否继续？`
            );
            
            if (confirmed) {
                window.open(urlValue, '_blank', 'noopener,noreferrer');
            }
            
            return false;  // 阻止默认行为
        }
    } catch (e) {
        console.warn('无效 URL:', urlValue);
        return false;
    }
    
    return true;  // 允许打开
});

// 记录所有检测到的 URL
wb.addHook(HOOKS.ON_URL_DETECTED, (row, col, urlValue) => {
    console.log(`[${row}, ${col}] 检测到 URL: ${urlValue}`);
    
    // 标记包含链接的单元格样式
    wb.setCellStyle(row, col, {
        color: '#0066cc',
        textDecoration: 'underline'
    });
});
```

</details>

### ⚙️ Hooks 高级用法

#### **一次性钩子（addHookOnce）**

```javascript
// 只在首次初始化时执行一次
wb.addHookOnce(HOOKS.INIT, (workbook) => {
    console.log('这是首次初始化！');
    loadUserPreferences(workbook);
    setupAutoSave(workbook);
});

// 只在第一次编辑时显示引导提示
wb.addHookOnce(HOOKS.AFTER_BEGIN_EDITING, (row, col) => {
    showTutorialTooltip('您可以在此处输入数据...');
});
```

#### **条件性钩子注册/注销**

```javascript
function enableAuditLog() {
    // 注册审计日志钩子
    const logHandler = (changes) => {
        auditLogger.log('DATA_CHANGE', changes);
    };
    
    wb.addHook(HOOKS.AFTER_CHANGE, logHandler);
    
    // 存储引用以便后续移除
    wb._auditHandler = logHandler;
}

function disableAuditLog() {
    if (wb._auditHandler) {
        wb.removeHook(HOOKS.AFTER_CHANGE, wb._auditHandler);
        delete wb._auditHandler;
    }
}

// 根据用户权限动态启用/禁用
if (user.hasPermission('audit')) {
    enableAuditLog();
}
```

#### **清理钩子**

```javascript
// 清理某个钩子的所有监听器
wb.clearHook(HOOKS.ON_CELL_CLICK);


// 检查是否有特定钩子
if (wb.hasHook(HOOKS.BEFORE_CHANGE)) {
    console.log('存在 beforeChange 钩子');
}
```

### 🔐 Hooks 最佳实践

| 场景 | 推荐使用 | 不推荐使用 |
|------|---------|-----------|
| **数据验证** | `BEFORE_CHANGE`, `BEFORE_SET_VALUE_AT` | `AFTER_CHANGE`（太晚） |
| **UI 反馈** | `AFTER_*` 系列（确保操作成功） | `BEFORE_*`（可能被取消） |
| **日志记录** | `AFTER_CHANGE`, `AFTER_SORT` 等 | `BEFORE_*`（可能未实际发生） |
| **权限控制** | `BEFORE_*` 系列（可阻止） | `ON_*`（仅通知） |
| **性能敏感** | 减少回调内的计算量 | 同步执行耗时操作 |
| **错误处理** | 使用 try-catch 包裹回调逻辑 | 让错误传播导致崩溃 |

> **💡 性能提示**: Hooks 回调应尽量轻量化（< 1ms），避免阻塞主线程。对于复杂逻辑，建议使用 `requestIdleCallback` 或 `setTimeout(fn, 0)` 异步处理。

---

## 🎨 自定义与扩展

### 🔌 插件开发指南

```javascript
import { BasePlugin, HOOKS } from '@canvas-sheet/core';

export class AutoFillPlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "autoFill";
    }

    /** @type {AutoFillStrategy|null} */
    #strategy = null;

    /**
     * 初始化自动填充插件
     * 注册 AutoFillStrategy 到事件处理器
     *
     * @param {object} options - 插件配置
     * @param {boolean} [options.enabled=true] - 是否默认启用
     */
    init(options = {}) {
        super.init(options);

        this.#strategy = new AutoFillStrategy(this.eventHandler);
        this.addStrategy("autoFill", this.#strategy);

        if (options.enabled === false) {
            this.disable();
        }
    }

    /**
     * 销毁插件
     * 策略会由基类 removeOwnStrategies() 自动清理
     */
    destroy() {
        this.#strategy = null;
        super.destroy();
    }

    /**
     * 启用自动填充
     */
    enable() {
        super.enable();
        this.#strategy?.enable();
    }

    /**
     * 禁用自动填充
     */
    disable() {
        super.disable();
        this.#strategy?.disable();
    }
}

// 注册插件
import { PluginManager } from '@canvas-sheet/core';
PluginManager.register(MyCustomPlugin);
```

### 🎭 自定义渲染器

```javascript
import { BaseColumnType } from '@canvas-sheet/core';

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

    render(context) {
        const { ctx, x, y, width, height, value } = context;
        
        const colors = {
            green: '#4caf50',
            yellow: '#ff9800',
            red: '#f44336'
        };
        
        const radius = Math.min(width, height) / 3;
        const centerX = x + width / 2;
        const centerY = y + height / 2;

        ctx.fillStyle = colors[value] || '#ccc';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();

        if (context.isSelected) {
            ctx.strokeStyle = colors[value] || '#999';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
}

registerColumnTypeClass('trafficLight', TrafficLightType);
```

---

## 📋 已完成功能

### ✅ **核心引擎 (100%)**
- [x] Canvas 2D 渲染引擎
- [x] 瓦片化渲染架构 (Tile Rendering)
- [x] 智能视口裁剪 (Viewport Clipping)
- [x] 双缓冲绘图 (Double Buffering)
- [x] 硬件加速 (GPU Acceleration)

### ✅ **数据模型 (95%)**
- [x] 分块存储系统 (ChunkedCellStore)
- [x] 单元格对象池 (Cell Pool)
- [x] 行列管理器 (RowColManager)
- [x] 合并单元格 (Merge Cells)
- [x] 隐藏行/列 (Hidden Rows/Cols)
- [ ] 数据版本控制 (Data Versioning) - *进行中*

### ✅ **公式系统 (90%)**
- [x] 公式解析器 (FormulaParser)
- [x] 公式求值器 (FormulaEvaluator)
- [x] 50+ 内置函数
- [x] 循环引用检测
- [x] 惰性求值 (Lazy Evaluation)
- [x] 自定义函数注册
- [ ] 数组公式 (Array Formulas) - *计划中*

### ✅ **类型系统 (95%)**
- [x] 6 种基础类型 (text/numeric/date/boolean/select/textarea)
- [x] 5 种渲染器类型 (checkbox/progressBar/starRating/sparkline/colorPreview)
- [x] 可扩展的类型注册表
- [x] 格式化/解析/验证管道
- [ ] 地理位置类型 (GeoLocation) - *计划中*

### ✅ **插件生态 (85%)**
- [x] 冻结窗格插件 (FreezePlugin)
- [x] 排序插件 (SortPlugin) - 升序/降序/多列排序
- [x] 自动填充插件 (AutoFillPattern)
- [x] 复制粘贴插件 (CopyPastePlugin)
- [x] 数据验证插件 (DataValidationPlugin)
- [x] 右键菜单插件 (ContextMenuPlugin)
- [x] 导出文件插件 (ExportFilePlugin)
- [x] 导入文件插件 (ImportFilePlugin)
- [x] 公式插件 (FormulaPlugin)
- [x] 图表插件 (ChartPlugin) - 基础图表
- [x] 行/列移动插件 (MovePlugins)
- [x] 隐藏行/列插件 (HiddenPlugins)
- [ ] 筛选插件 (FilterPlugin) - *开发中*
- [ ] 评论/批注插件 (CommentPlugin) - *计划中*

### ✅ **UI 组件 (90%)**
- [x] 公式栏 (FormulaBar)
- [x] 工作表标签栏 (SheetTabBar)
- [x] 右键上下文菜单 (ContextMenu)
- [x] 滚动条 (Scrollbar) - 自定义样式
- [x] 单元格编辑器 (Text/Numeric/Date/Select/Textarea)
- [x] 选区高亮 (Selection Highlight)
- [ ] 迷你地图 (Minimap) - *计划中*
- [ ] 缩放控件 (Zoom Control) - *计划中*

### ✅ **事件与钩子 (100%)**
- [x] 事件总线 (EventBus)
- [x] 生命周期钩子 (Lifecycle Hooks)
- [x] 30+ 内置事件
- [x] 20+ 钩子点

### ✅ **开发者工具 (80%)**
- [x] ESLint + Prettier 代码规范
- [x] Vitest 测试框架 (单元/集成/E2E)
- [x] JSDoc 自动文档生成
- [x] Husky Git Hooks
- [x] Webpack 5 构建优化
- [x] ESM + UMD 双模块输出
- [ ] Playground 在线演示 - *计划中*

---

## 🔮 待开发功能

### 🎯 **短期目标 (v1.1.0 - Q2 2026)**

#### 🔍 **筛选功能增强**
- [ ] 列筛选器 (Column Filter)
  - [ ] 文本搜索过滤
  - [ ] 数值范围过滤
  - [ ] 日期区间过滤
  - [ ] 多选列表过滤
  - [ ] 自定义筛选条件

#### 📊 **图表系统升级**
- [ ] 更多图表类型
  - [ ] 折线图 (Line Chart)
  - [ ] 饼图 (Pie Chart)
  - [ ] 面积图 (Area Chart)
  - [ ] 雷达图 (Radar Chart)
- [ ] 图表交互
  - [ ] Tooltip 悬浮提示
  - [ ] 点击钻取 (Drill-down)
  - [ ] 动态数据绑定

#### 🎨 **样式系统增强**
- [ ] 渐变背景 (Gradient Backgrounds)
- [ ] 图片插入 (Image Insertion)
- [ ] 富文本支持 (Rich Text)
- [ ] 条件格式规则扩展
  - [ ] 数据条 (Data Bars)
  - [ ] 色阶 (Color Scales)
  - [ ] 图标集 (Icon Sets)

### 🚀 **中期目标 (v2.0.0 - Q4 2026)**

#### 👥 **实时协作**
- [ ] WebSocket 同步引擎
- [ ] 操作转换 (OT) 算法
- [ ] 冲突解决机制
- [ ] 光标同步显示
- [ ] 用户权限管理
- [ ] 版本历史回放

#### 📱 **移动端优化**
- [ ] 手势操作优化
  - [ ] 双指缩放 (Pinch-to-zoom)
  - [ ] 滑动选择 (Swipe Selection)
  - [ ] 长按菜单 (Long Press Menu)
- [ ] 响应式布局
- [ ] 离线缓存 (Offline Support)
- [ ] PWA 支持

#### 🔌 **插件市场**
- [ ] 插件在线安装
- [ ] 插件依赖管理
- [ ] 沙箱隔离执行
- [ ] 插件评分系统
- [ ] API 版本兼容性检查

### 🌟 **长期愿景 (v3.0.0+ - 2027+)**

#### 🤖 **AI 集成**
- [ ] 智能数据补全
- [ ] 自然语言查询 ("显示销售额前10的产品")
- [ ] 异常检测与告警
- [ ] 自动化报表生成
- [ ] 预测分析集成

#### 🌐 **WebAssembly 加速**
- [ ] 核心计算引擎移植到 WASM
- [ ] 公式计算性能提升 10x+
- [ ] 大规模排序/聚合加速
- [ ] 内存占用降低 50%

#### ☁️ **云端原生**
- [ ] Server-side Rendering (SSR)
- [ ] 边缘计算节点部署
- [ ] 全球 CDN 加速分发
- [ ] 多租户隔离架构

---

## 🤝 贡献指南

我们欢迎所有形式的贡献！无论是 Bug 报告、功能请求还是代码提交。

### 🐛 报告问题

1. 在 [Issues](../../issues) 中搜索现有问题
2. 如果没有找到，点击 **New Issue**
3. 使用模板填写详细信息：
   - 复现步骤
   - 期望行为 vs 实际行为
   - 截图/GIF (如果涉及 UI)
   - 环境信息 (浏览器/OS/版本)

### 💻 提交代码

#### Fork & Clone

```bash
git clone https://github.com/YOUR_USERNAME/canvas-implementation-in-excel.git
cd canvas-implementation-in-excel
git checkout -b feature/your-feature-name
```

#### 开发流程

```bash
# 安装依赖
npm install

# 创建分支 (遵循规范)
git checkout -b feat/add-pie-chart
# git checkout -b fix/crash-on-scroll
# git checkout -b docs/update-readme

# 编写代码 (遵循代码规范)
npm run dev  # 开发调试
npm run lint # 代码检查

# 运行测试 (确保通过)
npm test

# 提交变更 (使用 Conventional Commits)
git commit -m "feat(chart): add pie chart renderer"
# fix(scroll): resolve memory leak on rapid scrolling
# docs(readme): update installation guide
# test(validation): add edge case tests

# 推送并创建 PR
git push origin feat/add-pie-chart
# 然后在 GitHub 上创建 Pull Request
```

#### 代码规范

- ✅ **ESLint**: `npm run lint` 必须通过
- ✅ **Prettier**: `npm run format` 自动格式化
- ✅ **Commit Message**: 遵循 [Conventional Commits](https://www.conventionalcommits.org/)
- ✅ **Test Coverage**: 新增代码覆盖率 > 80%
- ✅ **JSDoc**: 公共 API 必须有完整注释

#### Pull Request 模板

```markdown
## 📝 变更描述
简要说明本次修改的内容和原因

## 🔗 关联 Issue
Fixes #123

## 📸 截图/GIF (如果是 UI 变更)
[在此处添加截图]

## ✅ 测试清单
- [ ] 单元测试已添加/更新
- [ ] 所有测试通过 (`npm test`)
- [ ] ESLint 检查通过 (`npm run lint`)
- [ ] 文档已更新 (如有必要)

## 💬 其他说明
[可选的其他补充信息]
```

---

## 📄 许可证

本项目采用 **Apache License 2.0** 开源协议。

```
Copyright 2026 jiangsuiting <1158973435@qq.com>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

### 📜 权利与义务

**您可以自由地：**
- ✅ 商业使用
- ✅ 修改源码
- ✅ 分发副本
- ✅ 再授权
- ✅ 私人使用

**您必须遵守：**
- ⚠️ 保留版权声明和许可证文本
- ⚠️ 修改的文件必须标注变更
- ⚠️ 如果包含 NOTICE 文件，需保留归属声明

**您不能：**
- ❌ 追究作者关于软件缺陷的责任
- ❌ 使用作者的商标或商号进行背书

---

## 🙏 致谢

感谢以下开源项目和社区：

- **Handsontable** - 为电子表格领域树立的标准
- **HyperFormula** - 优秀的公式引擎参考实现
- **Canvas API** - 让高性能 Web 图形成为可能
- **Web Components** - 组件化的未来标准
- **Vitest** - 快速可靠的测试框架
- **Webpack** - 强大的模块打包工具

特别感谢所有贡献者、Issue 报告者和用户的反馈！

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