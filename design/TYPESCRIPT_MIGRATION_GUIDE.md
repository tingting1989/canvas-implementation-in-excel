# TypeScript 全面迁移方案

> **版本**: v1.0  
> **更新日期**: 2026-08-07  
> **适用项目**: @canvas-sheet/core (canvas-implementation-in-excel)  
> **当前状态**: JavaScript (255 个 .js 文件)

---

## 目录

1. [项目现状分析](#1-项目现状分析)
2. [迁移策略概述](#2-迁移策略概述)
3. [详细执行计划](#3-详细执行计划)
4. [代码转换规范](#4-代码转换规范)
5. [风险控制与回退策略](#5-风险控制与回退策略)
6. [验证清单](#6-验证清单)
7. [时间估算](#7-时间估算)
8. [附录：常用转换示例](#8-附录常用转换示例)

---

## 1. 项目现状分析

### 1.1 基础数据

| 维度 | 数据 |
|------|------|
| **JS 文件总数** | 255 个 |
| **核心模块数** | 15 个（workbook, formula, render, plugins 等） |
| **代码复杂度** | 高（Canvas 渲染引擎、公式解析器、插件系统） |
| **当前构建工具链** | Webpack + Babel + tsc（仅生成声明） |
| **已有类型标注方式** | JSDoc 注释（`@private`, `@type`） |

### 1.2 当前技术栈

```
源码: JavaScript (ES2020+)
构建: Webpack 5
转译: Babel (@babel/preset-env)
类型生成: TypeScript (--emitDeclarationOnly)
模块格式: ESM (ESNext)
路径别名: @/* → ./src/*
```

### 1.3 已有 TypeScript 配置

当前 `tsconfig.json` 使用 `allowJs: true` + `checkJs: false`，仅用于生成 `.d.ts` 声明文件，不做严格检查。

### 1.4 主要挑战

1. **代码量大**: 255 个 JS 文件需逐一转换
2. **复杂度高**: Canvas 渲染、公式引擎、插件系统等核心逻辑复杂
3. **依赖关系紧密**: 模块间耦合度较高，需要按正确顺序迁移
4. **运行时类型安全**: 部分逻辑依赖动态类型（如公式解析器 AST）
5. **Web Components 集成**: 自定义元素需要特殊处理

---

## 2. 迁移策略概述

### 2.1 核心原则

- ✅ **渐进式迁移**: 分阶段进行，每阶段可独立编译和测试
- ✅ **自底向上**: 从无依赖的基础层开始，逐层推进
- ✅ **保持兼容**: 公共 API 签名不变，构建产物格式不变
- ✅ **持续可构建**: 每次提交后项目必须能正常构建
- ✅ **类型优先**: 先定义接口和类型，再实现具体逻辑

### 2.2 迁移模式选择

采用 **JS/TS 共存模式**：

```
Phase 0-5: allowJs: true  // JS 和 TS 可以共存
Phase 6:   allowJs: false // 纯 TS 项目
```

优势：
- 不需要一次性重写所有文件
- 可以逐步验证每个模块的类型安全性
- 降低引入回归 bug 的风险
- 团队成员可以并行工作在不同模块

### 2.3 依赖层次图（迁移顺序）

```
┌─────────────────────────────────────────────┐
│  Phase 6: 入口与应用层                       │
│  main.js → main.ts                          │
│  api/index.js → api/index.ts                │
├─────────────────────────────────────────────┤
│  Phase 5: 业务逻辑层                         │
│  workbook/, plugins/, editor/               │
│  (最复杂的业务逻辑)                          │
├─────────────────────────────────────────────┤
│  Phase 4: 中间件层                           │
│  model/, state/, ui/                        │
│  (数据模型和状态管理)                        │
├─────────────────────────────────────────────┤
│  Phase 3: 引擎层                             │
│  formula/, render/                          │
│  (公式计算和渲染管线)                        │
├─────────────────────────────────────────────┤
│  Phase 2: 核心基础设施层                     │
│  core/, types/, theme/                      │
│  (基础类和抽象定义)                          │
├─────────────────────────────────────────────┤
│  Phase 1: 基础工具层                         │
│  utils/, constants/                         │
│  (纯函数、常量、枚举)                        │
└─────────────────────────────────────────────┘
         ↑
    Phase 0: 环境准备
```

---

## 3. 详细执行计划

### Phase 0: 环境准备（预计 1-2 天）

#### 目标
配置开发环境，使 TypeScript 和 JavaScript 可以共存编译。

#### 任务清单

##### 3.1 更新 `tsconfig.json`

```jsonc
{
    "compilerOptions": {
        "target": "ES2020",
        "module": "ESNext",
        "moduleResolution": "bundler",
        
        // ===== 迁移期间关键配置 =====
        "allowJs": true,              // 允许 JS 和 TS 共存
        "checkJs": false,             // 先不检查 JS 文件
        "strict": false,               // 先用宽松模式（Phase 6 改为 true）
        
        // 类型输出
        "declaration": true,
        "declarationDir": "./dist/types",
        "emitDeclarationOnly": true,   // Phase 5+ 改为 false
        
        // 路径别名
        "paths": {
            "@/*": ["./src/*"],
            "@store/*": ["./src/store/*"],
            "@render/*": ["./src/render/*"],
            "@plugin/*": ["./src/plugins/*"]
        },
        
        // 新增配置
        "noEmitOnError": false,       // 迁移期间允许有错误也输出
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "resolveJsonModule": true,
        "lib": ["ES2020", "DOM", "DOM.Iterable"],
        
        // 输出配置
        "outDir": "./dist",
        "rootDir": "./src",
        "sourceMap": true
    },
    "include": [
        "src/**/*.ts",
        "src/**/*.js",       // 允许共存
        "src/**/*.d.ts"
    ],
    "exclude": ["node_modules", "dist"]
}
```

##### 3.2 更新 Webpack 配置

Webpack 已支持 TypeScript（[webpack.config.js:44-50](webpack.config.js#L44-L50)），确认以下配置：

```javascript
// webpack.config.js
module.exports = {
    resolve: {
        extensions: [".js", ".ts", ".tsx"],  // ✅ 已支持
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: "babel-loader",
            },
            {
                test: /\.tsx?$/,           // ✅ 已配置
                exclude: /node_modules/,
                use: [{
                    loader: "babel-loader",
                    options: { 
                        presets: ["@babel/preset-typescript"] 
                    },
                }],
            },
        ],
    },
};
```

##### 3.3 安装必要依赖

```bash
npm install -D @babel/preset-typescript typescript @types/node
```

##### 3.4 创建全局类型声明文件

**文件**: `src/types/global.d.ts`

```typescript
/**
 * 全局类型扩展声明
 * 用于补充第三方库缺失的类型或自定义全局类型
 */

// Window 扩展
interface Window {
    __CANVAS_SHEET_CONFIG__?: {
        debug?: boolean;
        locale?: string;
        theme?: string;
    };
}

// CSS 模块声明
declare module "*.css" {
    const content: string;
    export default content;
}

// SVG 模块声明（如果使用）
declare module "*.svg" {
    const content: string;
    export default content;
}
```

##### 3.5 创建核心类型定义文件

**文件**: `src/types/index.ts`（从 `types/index.js` 转换而来）

```typescript
/**
 * 核心类型定义
 * 定义项目中使用的基础类型、接口和类型别名
 */

// 单元格坐标
export interface CellCoordinate {
    row: number;
    col: number;
}

// 单元格范围
export interface CellRange {
    start: CellCoordinate;
    end: CellCoordinate;
}

// 单元格值类型
export type CellValue = string | number | boolean | null | undefined;

// 样式对象（简化版）
export interface CellStyle {
    font?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
    backgroundColor?: string;
    textAlign?: "left" | "center" | "right";
    verticalAlign?: "top" | "middle" | "bottom";
}

// 事件类型
export type EventType = string;

// 回调函数类型
export type EventCallback<T = any> = (data: T) => void;
```

##### 3.6 更新 npm scripts

在 `package.json` 中添加新的脚本命令：

```json
{
    "scripts": {
        "types": "tsc --emitDeclarationOnly && node scripts/fix-dts-paths.js",
        "build:lib": "webpack --config webpack.lib.config.js && tsc --emitDeclarationOnly && node scripts/fix-dts-paths.js",
        "typecheck": "tsc --noEmit",
        "typecheck:strict": "tsc --noEmit --strict"
    }
}
```

#### 验证标准

- [ ] `npm run dev` 正常启动
- [ ] `npm run build` 成功构建
- [ ] `npm run build:lib` 生成正确的产物
- [ ] `npm run typecheck` 无新增错误（允许已有错误）
- [ ] 测试项目 `test-ts-support` 的 `test-import-only.ts` 通过

---

### Phase 1: 基础工具层（预计 3-5 天）

#### 目标
将工具函数和常量转换为 TypeScript，建立类型基础。

#### 目标目录

```
src/
├── utils/
│   ├── helper.ts          # 通用辅助函数
│   ├── canvasUtils.ts     # Canvas 工具函数
│   ├── cellRef.ts         # 单元格引用工具
│   ├── excelUnits.ts      # Excel 单位转换
│   ├── DateTimeParser.ts  # 日期时间解析
│   ├── UrlDetector.ts     # URL 检测器
│   └── index.ts
└── constants/
    ├── config.ts          # 全局配置
    ├── errorCodes.ts      # 错误码
    ├── eventNames.ts      # 事件名称
    ├── hookNames.ts       # 钩子名称
    ├── enums/             # 所有枚举常量
    │   ├── AutoFillDir.ts
    │   ├── BorderStyle.ts
    │   ├── ChartType.ts
    │   └── ... (13个枚举文件)
    └── ...
```

#### 转换重点

##### 3.1.1 工具函数类型化

**示例: [helper.js](src/utils/helper.js) → helper.ts**

```javascript
// Before (JavaScript)
export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
export const isNumber = (val) => typeof val === "number" && !isNaN(val);
export const isString = (val) => typeof val === "string";
export const isFunction = (val) => typeof val === "function";
export const isObject = (val) => val !== null && typeof val === "object";
```

```typescript
// After (TypeScript)
export const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max));

export const isNumber = (val: unknown): val is number =>
    typeof val === "number" && !isNaN(val);

export const isString = (val: unknown): val is string =>
    typeof val === "string";

export const isFunction = (val: unknown): val is Function =>
    typeof val === "function";

export const isObject = (val: unknown): val is Record<string, any> =>
    val !== null && typeof val === "object";
```

**关键点**:
- 使用 `unknown` 替代 `any` 作为参数类型
- 使用 **类型守卫** (`val is T`) 提供更精确的推断
- 所有函数都有明确的返回类型

##### 3.1.2 枚举常量类型化

**示例: [BorderStyle.js](src/constants/enums/BorderStyle.js) → BorderStyle.ts**

```javascript
// Before (JavaScript)
export const BORDER_STYLE = Object.freeze({
    NONE: "none",
    THIN: "thin",
    MEDIUM: "medium",
    THICK: "thick",
});
```

```typescript
// After (TypeScript)
export const BORDER_STYLE = Object.freeze({
    NONE: "none" as const,
    THIN: "thin" as const,
    MEDIUM: "medium" as const,
    THICK: "thick" as const,
}) as Readonly<Record<string, BorderStyleValue>>;

export type BorderStyleValue = typeof BORDER_STYLE[keyof typeof BORDER_STYLE];
// 类型推导为: "none" | "thin" | "medium" | "thick"
```

**关键点**:
- 使用 `as const` 冻结字面量类型
- 导出联合类型供其他模块使用
- 保持向后兼容（仍可通过 `BORDER_STYLE.THIN` 访问）

##### 3.1.3 错误码类型化

**示例: [errorCodes.js](src/constants/errorCodes.js)**

```typescript
export const ERROR_CODE = Object.freeze({
    GENERIC_ERROR: "GENERIC_ERROR",
    GENERIC_WARN: "GENERIC_WARN",
    DEBUG_LOG: "DEBUG_LOG",
    // ...
} as const);

export type ErrorCode = typeof ERROR_CODE[keyof typeof ERROR_CODE];

export const ERROR_LEVEL = Object.freeze({
    ERROR: "error",
    WARN: "warn",
    INFO: "info",
    DEBUG: "debug",
} as const);

export type ErrorLevel = typeof ERROR_LEVEL[keyof typeof ERROR_LEVEL];
```

#### 验证清单

- [ ] 所有 utils 函数有完整的参数和返回值类型
- [ ] 所有常量导出对应的 TypeScript 类型
- [ ] `npm run typecheck` 在这些文件中无新增错误
- [ ] 单元测试（如果有）全部通过
- [ ] IDE 显示正确的类型提示

---

### Phase 2: 核心基础设施层（预计 5-7 天）

#### 目标
转换核心基类和基础设施，建立面向对象的类型体系。

#### 目标目录

```
src/
├── core/
│   ├── EventBus.ts          # 事件总线（泛型）
│   ├── EventHandler.ts      # 事件处理器
│   ├── Hooks.ts             # 钩子系统
│   ├── WebComponent.ts      # Web Component 基类
│   ├── DOMComponent.ts      # DOM 组件基类
│   ├── Disposable.ts        # 可释放资源接口
│   ├── ErrorHandler.ts      # 错误处理器
│   └── index.ts
├── types/
│   ├── BaseColumnType.ts    # 列类型抽象基类
│   ├── CellRenderContext.ts # 单元格渲染上下文
│   ├── TextColumnType.ts    # 文本列类型
│   ├── NumericColumnType.ts # 数值列类型
│   ├── DateColumnType.ts    # 日期列类型
│   ├── SelectColumnType.ts  # 选择列类型
│   ├── HyperlinkColumnType.ts
│   ├── TextareaColumnType.ts
│   ├── renderers/           # 渲染器类型
│   │   ├── CheckboxColumnType.ts
│   │   ├── ColorPreviewType.ts
│   │   ├── ProgressBarType.ts
│   │   ├── SparklineType.ts
│   │   ├── StarRatingType.ts
│   │   └── index.ts
│   └── index.ts
└── theme/
    ├── ThemeManager.ts      # 主题管理器
    ├── ThemeStyleProvider.ts # 主题样式提供者
    ├── config.ts            # 主题配置
    └── index.ts
```

#### 转换重点

##### 3.2.1 事件系统泛型化

**文件: [EventBus.ts](src/core/EventBus.ts)**

```typescript
/**
 * 事件映射类型
 * 用于约束事件的名称和数据类型
 */
interface EventMap {
    [event: string]: any;
}

/**
 * 泛型事件总线
 */
class EventBus<TEvents extends EventMap = Record<string, any>> {
    private listeners = new Map<keyof TEvents, Set<EventCallback>>();

    /**
     * 监听事件
     * @param event 事件名称
     * @param callback 回调函数，自动推断数据类型
     */
    on<K extends keyof TEvents>(
        event: K, 
        callback: EventCallback<TEvents[K]>
    ): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
        
        return () => this.off(event, callback); // 返回取消订阅函数
    }

    /**
     * 触发事件
     * @param event 事件名称
     * @param data 事件数据（类型受 EventMap 约束）
     */
    emit<K extends keyof TEvents>(event: K, data?: TEvents[K]): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(cb => cb(data));
        }
    }

    off<K extends keyof TEvents>(
        event: K, 
        callback: EventCallback<TEvents[K]>
    ): void {
        this.listeners.get(event)?.delete(callback);
    }
}
```

##### 3.2.2 Web Components 基类

**文件: [WebComponent.ts](src/core/WebComponent.ts)**

```typescript
/**
 * 自定义元素基类
 * 提供 Web Component 生命周期管理和基础功能
 */
abstract class WebComponent extends HTMLElement {
    protected shadowRoot!: ShadowRoot;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback(): void {
        this.render();
    }

    disconnectedCallback(): void {
        this.cleanup();
    }

    /**
     * 子类必须实现的渲染方法
     */
    protected abstract render(): void;

    /**
     * 清理资源（可选重写）
     */
    protected cleanup(): void {
        // 默认空实现
    }
}
```

##### 3.2.3 列类型抽象基类

**文件: [BaseColumnType.ts](src/types/BaseColumnType.ts)**

```typescript
import { CellRenderContext } from './CellRenderContext';

/**
 * 列类型配置选项
 */
interface ColumnTypeOptions {
    editable?: boolean;
    sortable?: boolean;
    filterable?: boolean;
    width?: number;
    minWidth?: number;
    maxWidth?: number;
}

/**
 * 列类型抽象基类
 * 所有自定义列类型必须继承此类
 */
abstract class BaseColumnType {
    protected options: Required<ColumnTypeOptions>;

    constructor(options: ColumnTypeOptions = {}) {
        this.options = {
            editable: true,
            sortable: true,
            filterable: true,
            width: 100,
            minWidth: 20,
            maxWidth: 10000,
            ...options,
        };
    }

    abstract getTypeName(): string;

    abstract render(context: CellRenderContext): void;

    abstract getValueForDisplay(rawValue: unknown): string;

    abstract parseInputValue(inputValue: string): unknown;

    validate(value: unknown): boolean {
        return true; // 默认通过验证
    }
}
```

#### 验证清单

- [ ] 所有抽象类的方法签名完整
- [ ] 泛型约束正确（如 EventBus 的 EventMap）
- [ ] 继承关系类型安全（子类覆盖父类方法时参数兼容）
- [ ] 接口与实现类的契约完整

---

### Phase 3: 引擎层（预计 7-10 天）

#### 目标
转换公式引擎和渲染引擎，这是性能敏感的核心部分。

#### 目标目录

```
src/
├── formula/
│   ├── FormulaEngine.ts      # 公式引擎主类
│   ├── FormulaEvaluator.ts   # 公式求值器
│   ├── FormulaParser.ts      # 公式解析器
│   ├── functions/
│   │   ├── index.ts
│   │   ├── math.ts           # 数学函数
│   │   ├── statistical.ts    # 统计函数
│   │   ├── text.ts           # 文本函数
│   │   ├── logical.ts        # 逻辑函数
│   │   ├── lookup.ts         # 查找引用函数
│   │   ├── conditional.ts    # 条件函数
│   │   └── utils/
│   │       ├── helpers.ts
│   │       ├── matching.ts
│   │       ├── validation.ts
│   │       └── index.ts
│   └── types.ts              # 公式相关类型定义
└── render/
    ├── RenderEngine.ts       # 渲染引擎主类
    ├── CanvasContext.ts      # Canvas 上下文封装
    ├── ViewportTransform.ts  # 视口变换
    ├── TileRenderer.ts       # 瓦片渲染器
    ├── TileCache.ts          # 瓦片缓存
    ├── BaseLayer.ts          # 图层基类
    ├── LayerCompositor.ts    # 图层合成器
    ├── HeaderRenderer.ts     # 表头渲染器
    ├── OverlayRenderer.ts    # 覆盖层渲染器
    ├── layers/
    │   ├── TileLayer.ts
    │   ├── HeaderLayer.ts
    │   ├── FrozenLayer.ts
    │   ├── SelectionLayer.ts
    │   ├── InteractionLayer.ts
    │   └── ChartLayer.ts
    ├── header/
    │   ├── HeaderPainter.ts
    │   ├── HeaderLayoutBuilder.ts
    │   └── models/
    ├── chart/
    │   ├── BaseChartStrategy.ts
    │   ├── ChartRendererFactory.ts
    │   ├── strategies/
    │   └── ...
    └── index.ts
```

#### 转换重点

##### 3.3.1 公式 AST 类型定义

**新建文件: [formula/types.ts](src/formula/types.ts)**

```typescript
/**
 * 公式 AST 节点类型
 */

// 字面量节点
interface LiteralNode {
    type: "literal";
    value: string | number | boolean;
}

// 单元格引用节点
interface ReferenceNode {
    type: "reference";
    sheetName?: string;
    cellRef: string; // 如 "A1", "B2:C5"
}

// 函数调用节点
interface FunctionCallNode {
    type: "function";
    name: string;
    args: ASTNode[];
}

// 二元运算符节点
interface BinaryOpNode {
    type: "binary";
    operator: "+" | "-" | "*" | "/" | "^" | "&" | "=" | "<>" | "<" | ">" | "<=" | ">=";
    left: ASTNode;
    right: ASTNode;
}

// 一元运算符节点
interface UnaryOpNode {
    type: "unary";
    operator: "+" | "-";
    operand: ASTNode;
}

// 联合所有 AST 节点类型
type ASTNode = 
    | LiteralNode 
    | ReferenceNode 
    | FunctionCallNode 
    | BinaryOpNode 
    | UnaryOpNode;

/**
 * 公式执行上下文
 */
interface FormulaContext {
    sheet: import('../workbook/Sheet').Sheet;
    currentCell: { row: number; col: number };
    dependencies: Set<string>; // 依赖的单元格引用
}

/**
 * 公式函数签名
 */
type FormulaFunction = (args: unknown[], context: FormulaContext) => unknown;
```

##### 3.3.2 渲染图层接口

**新建文件: [render/types.ts](src/render/types.ts)**

```typescript
import { ViewportTransform } from './ViewportTransform';

/**
 * 渲染图层接口
 */
interface RenderLayer {
    /** 图层唯一标识 */
    readonly name: string;
    
    /** Z 轴排序索引 */
    readonly zIndex: number;
    
    /** 是否可见 */
    visible: boolean;
    
    /**
     * 绘制图层内容
     * @param ctx Canvas 2D 上下文
     * @param viewport 视口变换信息
     */
    draw(ctx: CanvasRenderingContext2D, viewport: ViewportTransform): void;
    
    /**
     * 处理鼠标事件
     * @param event 鼠标事件
     * @returns 是否消费了该事件
     */
    handleEvent?(event: MouseEvent): boolean;
    
    /**
     * 销毁图层，释放资源
     */
    destroy?(): void;
}

/**
 * 渲染配置
 */
interface RenderConfig {
    devicePixelRatio: number;
    antialias: boolean;
    backgroundColor: string;
}
```

##### 3.3.3 性能敏感代码处理

对于性能关键的代码（如渲染循环），需要注意：

```typescript
class TileRenderer {
    // ✅ 好：避免在热循环中进行类型检查
    renderTile(ctx: CanvasRenderingContext2D, tile: Tile): void {
        const cells = tile.cells;
        const len = cells.length;
        
        for (let i = 0; i < len; i++) {
            const cell = cells[i];
            // 直接访问已知类型的属性
            ctx.fillStyle = cell.style.backgroundColor || '#fff';
            ctx.fillText(cell.displayValue, cell.x, cell.y);
        }
    }
    
    // ❌ 避免：在循环中使用类型断言或 any
    renderTileBad(ctx: CanvasRenderingContext2D, tile: Tile): void {
        tile.cells.forEach((cell: any) => { // 不要用 any！
            ctx.fillText(cell.value as string, cell.x, cell.y);
        });
    }
}
```

#### 验证清单

- [ ] AST 类型能正确表示所有 Excel 公式结构
- [ ] 渲染管线的类型不会导致性能下降（避免装箱/拆箱）
- [ ] 公式函数注册表类型安全
- [ ] Canvas API 调用的类型守卫正确

---

### Phase 4: 中间件层（预计 7-10 天）

#### 目标
转换数据模型、状态管理和 UI 组件。

#### 目标目录

```
src/
├── model/
│   ├── index.ts
│   ├── store/
│   │   ├── Cell.ts             # 单元格数据
│   │   ├── Chunk.ts            # 数据分块
│   │   └── ChunkedCellStore.ts # 分块存储（泛型）
│   ├── grid/
│   │   ├── RowColManager.ts    # 行列管理
│   │   ├── CellDataAccessor.ts # 单元格数据访问器
│   │   └── RowColSync.ts       # 行列同步
│   ├── merge/
│   │   └── MergeManager.ts     # 合并单元格管理
│   ├── selection/
│   │   └── SelectionManager.ts # 选区管理
│   ├── history/
│   │   └── HistoryStack.ts     # 操作历史栈（泛型）
│   ├── command/
│   │   ├── Command.ts          # 命令接口
│   │   ├── SetCellCommand.ts
│   │   ├── MergeCommand.ts
│   │   ├── UnmergeCommand.ts
│   │   ├── BatchCommand.ts
│   │   ├── StyleChangeRecorder.ts
│   │   └── ToggleDisableCommand.ts
│   ├── rules/
│   │   └── ConditionalRule.ts  # 条件格式规则
│   └── chart/
│       ├── ChartModel.ts       # 图表数据模型
│       └── ChartManager.ts     # 图表管理器
├── state/
│   ├── ReactiveStore.ts        # 响应式状态存储（泛型）
│   └── Scheduler.ts            # 调度器
└── ui/
    ├── ScrollManager.ts        # 滚动管理器
    ├── components/
    │   ├── PopupPanel.ts       # 弹出面板
    │   └── PopupManager.ts     # 弹出面板管理器
    ├── formulaBar/
    │   ├── FormulaBarElement.ts
    │   ├── FormulaBarManager.ts
    │   └── formulaBarEvents.ts
    └── sheetTab/
        ├── SheetTabBarElement.ts
        ├── SheetTabManager.ts
        └── sheetTabEvents.ts
```

#### 转换重点

##### 3.4.1 分块存储泛型化

**文件: [ChunkedCellStore.ts](src/model/store/ChunkedCellStore.ts)**

```typescript
import { CellData } from './Cell';

/**
 * 分块键
 */
interface ChunkKey {
    rowStart: number;
    colStart: number;
}

/**
 * 分块大小配置
 */
const CHUNK_SIZE = 100; // 每块 100x100 单元格

/**
 * 泛型分片存储
 * 支持高效的大规模单元格数据存取
 */
class ChunkedCellStore<T = CellData> {
    private chunks = new Map<string, Map<string, T>>();
    
    private getChunkKey(row: number, col: number): ChunkKey {
        return {
            rowStart: Math.floor(row / CHUNK_SIZE) * CHUNK_SIZE,
            colStart: Math.floor(col / CHUNK_SIZE) * CHUNK_SIZE,
        };
    }
    
    private getChunkId(key: ChunkKey): string {
        return `${key.rowStart}_${key.colStart}`;
    }
    
    getCell(row: number, col: number): T | undefined {
        const key = this.getChunkKey(row, col);
        const id = this.getChunkId(key);
        const cellId = `${row}_${col}`;
        return this.chunks.get(id)?.get(cellId);
    }
    
    setCell(row: number, col: number, data: T): void {
        const key = this.getChunkKey(row, col);
        const id = this.getChunkId(key);
        
        if (!this.chunks.has(id)) {
            this.chunks.set(id, new Map());
        }
        
        this.chunks.get(id)!.set(`${row}_${col}`, data);
    }
    
    /**
     * 获取指定范围内的所有单元格
     */
    getRange(startRow: number, startCol: number, endRow: number, endCol: number): T[] {
        const cells: T[] = [];
        
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const cell = this.getCell(row, col);
                if (cell) cells.push(cell);
            }
        }
        
        return cells;
    }
}
```

##### 3.4.2 响应式状态管理

**文件: [ReactiveStore.ts](src/state/ReactiveStore.ts)**

```typescript
/**
 * 状态变更监听器
 */
type StateSubscriber<T> = (newState: T, oldState: T) => void;

/**
 * 中间件函数
 * 用于拦截和处理状态变更
 */
type StoreMiddleware<T> = (
    state: T,
    nextState: T,
    setState: (state: T) => void
) => T | void;

/**
 * 响应式状态存储
 * 实现类似 Redux/Vuex 的轻量级状态管理
 */
class ReactiveStore<T extends Record<string, any>> {
    private state: T;
    private subscribers = new Set<StateSubscriber<T>>();
    private middlewares: StoreMiddleware<T>[] = [];
    
    constructor(initialState: T) {
        this.state = initialState;
    }
    
    getState(): Readonly<T> {
        return this.state;
    }
    
    setState(partial: Partial<T>): void {
        const oldState = { ...this.state };
        let nextState = { ...this.state, ...partial };
        
        // 应用中间件
        for (const middleware of this.middlewares) {
            const result = middleware(this.state, nextState, (s) => { nextState = s; });
            if (result !== undefined) {
                nextState = result;
            }
        }
        
        this.state = nextState;
        
        // 通知订阅者
        this.subscribers.forEach(subscriber => {
            subscriber(this.state, oldState);
        });
    }
    
    subscribe(subscriber: StateSubscriber<T>): () => void {
        this.subscribers.add(subscriber);
        
        // 返回取消订阅函数
        return () => {
            this.subscribers.delete(subscriber);
        };
    }
    
    use(middleware: StoreMiddleware<T>): void {
        this.middlewares.push(middleware);
    }
}
```

##### 3.4.3 命令模式接口

**文件: [Command.ts](src/model/command/Command.ts)**

```typescript
/**
 * 命令接口
 * 实现撤销/重做功能的基础
 */
interface Command {
    /** 执行命令 */
    execute(): void;
    
    /** 撤销命令 */
    undo(): void;
    
    /** 命令描述（用于显示在历史记录） */
    readonly description: string;
}

/**
 * 复合命令（批量操作）
 */
class BatchCommand implements Command {
    private commands: Command[] = [];
    readonly description: string;
    
    constructor(description: string = "Batch Operation") {
        this.description = description;
    }
    
    add(command: Command): void {
        this.commands.push(command);
    }
    
    execute(): void {
        this.commands.forEach(cmd => cmd.execute());
    }
    
    undo(): void {
        // 反向撤销
        for (let i = this.commands.length - 1; i >= 0; i--) {
            this.commands[i].undo();
        }
    }
}
```

#### 验证清单

- [ ] 泛型约束合理（不过度泛化也不过度具体）
- [ ] 状态管理的不可变性保证
- [ ] 命令模式的撤销/重做类型安全
- [ ] 合并单元格的数据结构正确

---

### Phase 5: 业务逻辑层（预计 10-14 天）

#### 目标
转换最复杂的业务逻辑：Workbook、Sheet、Plugin 系统、编辑器等。

#### 目标目录

```
src/
├── workbook/
│   ├── Workbook.ts           # 工作簿主类
│   ├── Sheet.ts              # 工作表主类（最复杂）
│   ├── interfaces/
│   │   ├── ISheet.ts         # 工作表接口
│   │   └── index.ts
│   ├── coordinators/
│   │   ├── SheetDataCoordinator.ts
│   │   ├── SheetStyleCoordinator.ts
│   │   ├── SheetMergeCoordinator.ts
│   │   ├── SheetMetaCoordinator.ts
│   │   └── SheetOperationCoordinator.ts
│   └── managers/
│       ├── BatchOperationManager.ts
│       ├── ColumnTypeManager.ts
│       ├── ConditionalFormatManager.ts
│       ├── HeaderLabelManager.ts
│       ├── SettingsApplier.ts
│       └── SheetStyleManager.ts
├── plugins/
│   ├── PluginManager.ts      # 插件管理器
│   ├── BasePlugin.ts         # 插件基类
│   ├── AutoFillPlugin.ts
│   ├── CopyPastePlugin.ts
│   ├── ContextMenuPlugin.ts
│   ├── FreezePlugin.ts
│   ├── ImportFilePlugin.ts
│   ├── ExportFilePlugin.ts
│   ├── FormulaPlugin.ts
│   ├── ChartPlugin.ts
│   ├── FilterPlugin.ts
│   ├── SortPlugin.ts
│   ├── ColumnMovePlugin.ts
│   ├── RowMovePlugin.ts
│   ├── HiddenColumnsPlugin.ts
│   ├── HiddenRowsPlugin.ts
│   ├── BaseHidePlugin.ts
│   ├── BaseMovePlugin.ts
│   ├── data-validation/      # 数据验证插件组
│   ├── filter/               # 过滤器插件组
│   ├── sort/                 # 排序插件组
│   ├── registry.ts
│   └── index.ts
└── editor/
    ├── EditorManager.ts      # 编辑器管理器
    ├── ClipboardManager.ts   # 剪贴板管理器
    ├── editors/
    │   ├── CellEditor.ts     # 编辑器基类
    │   ├── TextEditor.ts
    │   ├── TextareaEditor.ts
    │   ├── NumericEditor.ts
    │   ├── DateEditor.ts
    │   ├── SelectEditor.ts
    │   └── index.ts
    └── strategies/
        ├── EventStrategy.ts
        ├── MouseStrategy.ts
        ├── KeyboardStrategy.ts
        ├── AutoFillStrategy.ts
        ├── CopyPasteStrategy.ts
        ├── ResizeStrategy.ts
        ├── ContextMenuStrategy.ts
        ├── ColumnMoveStrategy.ts
        ├── RowMoveStrategy.ts
        ├── SortStrategy.ts
        ├── ValidationStrategy.ts
        ├── ChartSelectionStrategy.ts
        ├── InteractionStrategy.ts
        └── index.ts
```

#### 转换重点

##### 3.5.1 Workbook 主类

**文件: [Workbook.ts](src/workbook/Workbook.ts)**

```typescript
import { Sheet } from './Sheet';
import { PluginManager } from '../plugins/PluginManager';
import { BasePlugin } from '../plugins/BasePlugin';
import { EVENT_NAMES } from '../constants/eventNames';

/**
 * 插件构造函数类型
 */
type PluginConstructor = new (...args: any[]) => BasePlugin;

/**
 * Workbook 配置选项
 */
interface WorkbookOptions {
    container: HTMLElement | string;
    locale?: string;
    theme?: string;
    readOnly?: boolean;
}

/**
 * 工作簿主类
 * 管理多个工作表、插件和全局配置
 */
class Workbook {
    private container: HTMLElement;
    private sheets: Map<string, Sheet> = new Map();
    private activeSheet: Sheet | null = null;
    public pluginManager: PluginManager;
    
    constructor(options: WorkbookOptions) {
        this.container = typeof options.container === 'string'
            ? document.querySelector(options.container)!
            : options.container;
            
        this.pluginManager = new PluginManager(this);
    }
    
    createSheet(name: string, options?: CreateSheetOptions): Sheet {
        const sheet = new Sheet(this, name, options);
        this.sheets.set(name, sheet);
        
        if (!this.activeSheet) {
            this.activeSheet = sheet;
        }
        
        return sheet;
    }
    
    getSheet(name: string): Sheet | undefined {
        return this.sheets.get(name);
    }
    
    getActiveSheet(): Sheet | null {
        return this.activeSheet;
    }
    
    setActiveSheet(sheet: Sheet): void {
        if (!this.sheets.has(sheet.name)) {
            throw new Error(`Sheet "${sheet.name}" not found in workbook`);
        }
        this.activeSheet = sheet;
    }
    
    registerPlugin<T extends BasePlugin>(
        name: string, 
        pluginConstructor: PluginConstructor & { pluginName: string }
    ): void {
        this.pluginManager.register(name, pluginConstructor);
    }
    
    loadPlugin(name: string): BasePlugin {
        return this.pluginManager.loadPlugin(name);
    }
}
```

##### 3.5.2 Sheet 类（最复杂）

**文件: [Sheet.ts](src/workbook/Sheet.ts)** - 重点展示私有字段和方法签名的转换

```typescript
import { ISheet } from './interfaces/ISheet';
import { Workbook } from './Workbook';
import { ChunkedCellStore } from '../model/store/ChunkedCellStore';
import { SelectionManager } from '../model/selection/SelectionManager';
import { MergeManager } from '../model/merge/MergeManager';
import { HistoryStack } from '../model/history/HistoryStack';
import { ReactiveStore } from '../state/ReactiveStore';

/**
 * 工作表状态接口
 */
interface SheetState {
    name: string;
    rowCount: number;
    colCount: number;
    frozenRows: number;
    frozenCols: number;
    visible: boolean;
}

/**
 * 工作表主类
 * 这是整个项目中最复杂的类，需要特别注意：
 * 1. 大量私有字段需要改为 TS 语法
 * 2. 协调者模式的类型化
 * 3. 方法签名的精确描述
 */
class Sheet extends ISheet {
    // ===== 公共属性（继承自 ISheet）=====
    override readonly bus: EventBus;
    override readonly name: string;
    override visible: boolean = true;
    
    // ===== 私有字段（原 JSDoc @private）=====
    private workbook: Workbook;
    private cellStore: ChunkedCellStore<CellData>;
    private selection: SelectionManager;
    private mergeManager: MergeManager;
    private history: HistoryStack<Command>;
    private state: ReactiveStore<SheetState>;
    
    // 协调者
    private dataCoordinator: SheetDataCoordinator;
    private styleCoordinator: SheetStyleCoordinator;
    private mergeCoordinator: SheetMergeCoordinator;
    private metaCoordinator: SheetMetaCoordinator;
    private operationCoordinator: SheetOperationCoordinator;
    
    // 缓存
    private frozenRowsHeight: number = -1;
    private frozenColsWidth: number = -1;
    private styleVersion: number = 0;
    
    // 配置
    private _frozenRows: number = 0;
    private _frozenCols: number = 0;
    private _readOnly: boolean = false;
    
    constructor(workbook: Workbook, name: string, options?: SheetOptions) {
        super();
        this.workbook = workbook;
        this.name = name;
        this.bus = new EventBus();
        
        this.cellStore = new ChunkedCellStore();
        this.selection = new SelectionManager(this);
        this.mergeManager = new MergeManager(this);
        this.history = new HistoryStack(100); // 最多 100 步历史
        
        this.state = new ReactiveStore({
            name,
            rowCount: options?.rowCount ?? 1000,
            colCount: options?.colCount ?? 26,
            frozenRows: 0,
            frozenCols: 0,
            visible: true,
        });
        
        // 初始化协调者
        this.dataCoordinator = new SheetDataCoordinator(this);
        this.styleCoordinator = new SheetStyleCoordinator(this);
        this.mergeCoordinator = new SheetMergeCoordinator(this);
        this.metaCoordinator = new SheetMetaCoordinator(this);
        this.operationCoordinator = new SheetOperationCoordinator(this);
    }
    
    // ===== 单元格操作 =====
    
    getCellValue(row: number, col: number): CellValue {
        return this.dataCoordinator.getCellValue(row, col);
    }
    
    setCellValue(row: number, col: number, value: CellValue): void {
        this.operationCoordinator.setCellValue(row, col, value);
    }
    
    getCellRange(range: CellRange): CellData[] {
        return this.cellStore.getRange(
            range.start.row, range.start.col,
            range.end.row, range.end.col
        );
    }
    
    // ===== 样式操作 =====
    
    getCellStyle(row: number, col: number): CellStyle | undefined {
        return this.styleCoordinator.getStyle(row, col);
    }
    
    setCellStyle(row: number, col: number, style: Partial<CellStyle>): void {
        this.styleCoordinator.setStyle(row, col, style);
    }
    
    batchStyleUpdate(updates: Array<{ row: number; col: number; style: Partial<CellStyle> }>): void {
        this.styleCoordinator.batchUpdate(updates);
    }
    
    // ===== 选区操作 =====
    
    getSelection(): CellRange | null {
        return this.selection.getCurrentRange();
    }
    
    setSelection(range: CellRange): void {
        this.selection.selectRange(range);
    }
    
    clearSelection(): void {
        this.selection.clear();
    }
    
    // ===== 合并单元格操作 =====
    
    mergeCells(range: CellRange): void {
        this.mergeCoordinator.merge(range);
    }
    
    unmergeCells(range: CellRange): void {
        this.mergeCoordinator.unmerge(range);
    }
    
    getMergedCell(row: number, col: number): CellRange | null {
        return this.mergeManager.getMergedRange(row, col);
    }
    
    // ===== 撤销/重做 =====
    
    undo(): void {
        this.history.undo();
    }
    
    redo(): void {
        this.history.redo();
    }
    
    canUndo(): boolean {
        return this.history.canUndo();
    }
    
    canRedo(): boolean {
        return this.history.canRedo();
    }
    
    // ===== 冻结行列 =====
    
    freeze(rows: number, cols: number): void {
        this._frozenRows = rows;
        this._frozenCols = cols;
        this.frozenRowsHeight = -1; // 使缓存失效
        this.frozenColsWidth = -1;
        
        this.state.setState({ frozenRows: rows, frozenCols: cols });
    }
    
    getFrozenRowsHeight(): number {
        if (this.frozenRowsHeight === -1) {
            this.frozenRowsHeight = this.calculateFrozenRowsHeight();
        }
        return this.frozenRowsHeight;
    }
    
    private calculateFrozenRowsHeight(): number {
        // 计算冻结行高度的实现...
        let height = 0;
        for (let i = 0; i < this._frozenRows; i++) {
            height += this.getRowHeight(i);
        }
        return height;
    }
    
    // ===== 行列尺寸 =====
    
    getRowHeight(row: number): number {
        return this.metaCoordinator.getRowHeight(row);
    }
    
    setRowHeight(row: number, height: number): void {
        this.metaCoordinator.setRowHeight(row, height);
    }
    
    getColWidth(col: number): number {
        return this.metaCoordinator.getColWidth(col);
    }
    
    setColWidth(col: number, width: number): void {
        this.metaCoordinator.setColWidth(col, width);
    }
    
    // ===== 生命周期 =====
    
    destroy(): void {
        this.bus.emit(SheetEvents.DESTROY);
        this.selection.destroy();
        this.cellStore.clear();
        this.state.subscribe(() => {})(); // 取消所有订阅
    }
}
```

##### 3.5.3 插件系统

**文件: [PluginManager.ts](src/plugins/PluginManager.ts)**

```typescript
import { BasePlugin } from './BasePlugin';
import { Workbook } from '../workbook/Workbook';

/**
 * 插件元数据
 */
interface PluginMetadata {
    name: string;
    instance: BasePlugin;
    loaded: boolean;
    enabled: boolean;
}

/**
 * 插件构造函数约束
 * 要求必须有静态属性 pluginName
 */
interface PluginConstructor<T extends BasePlugin = BasePlugin> {
    new (...args: any[]): T;
    pluginName: string;
}

/**
 * 插件管理器
 * 负责插件的注册、加载、卸载和生命周期管理
 */
class PluginManager {
    private workbook: Workbook;
    private plugins = new Map<string, PluginMetadata>();
    private constructors = new Map<string, PluginConstructor>();
    
    constructor(workbook: Workbook) {
        this.workbook = workbook;
    }
    
    register<T extends BasePlugin>(
        name: string, 
        ctor: PluginConstructor<T>
    ): void {
        if (this.constructors.has(name)) {
            console.warn(`Plugin "${name}" is already registered`);
            return;
        }
        
        if (ctor.pluginName !== name) {
            console.warn(
                `Plugin name mismatch: registered as "${name}" but pluginName is "${ctor.pluginName}"`
            );
        }
        
        this.constructors.set(name, ctor);
    }
    
    load(name: string): BasePlugin {
        const ctor = this.constructors.get(name);
        if (!ctor) {
            throw new Error(`Plugin "${name}" not registered`);
        }
        
        if (this.plugins.has(name)) {
            const existing = this.plugins.get(name)!;
            if (existing.loaded) {
                console.warn(`Plugin "${name}" is already loaded`);
                return existing.instance;
            }
        }
        
        const instance = new ctor(this.workbook);
        const metadata: PluginMetadata = {
            name,
            instance,
            loaded: true,
            enabled: true,
        };
        
        this.plugins.set(name, metadata);
        instance.onInit?.();
        
        return instance;
    }
    
    unload(name: string): void {
        const metadata = this.plugins.get(name);
        if (!metadata || !metadata.loaded) {
            return;
        }
        
        metadata.instance.onDestroy?.();
        metadata.loaded = false;
        this.plugins.delete(name);
    }
    
    enable(name: string): void {
        const metadata = this.plugins.get(name);
        if (metadata) {
            metadata.enabled = true;
            metadata.instance.onEnable?.();
        }
    }
    
    disable(name: string): void {
        const metadata = this.plugins.get(name);
        if (metadata) {
            metadata.enabled = false;
            metadata.instance.onDisable?.();
        }
    }
    
    getPlugin<T extends BasePlugin>(name: string): T | undefined {
        return this.plugins.get(name)?.instance as T;
    }
    
    getLoadedPlugins(): string[] {
        return Array.from(this.plugins.entries())
            .filter(([_, meta]) => meta.loaded)
            .map(([name]) => name);
    }
    
    destroyAll(): void {
        this.plugins.forEach((meta) => {
            if (meta.loaded) {
                meta.instance.onDestroy?.();
            }
        });
        this.plugins.clear();
        this.constructors.clear();
    }
}
```

#### 验证清单

- [ ] Workbook/Sheet 的公共 API 类型完整
- [ ] 私有字段全部使用 TS 语法（不再需要 JSDoc @private）
- [ ] 协调者模式的依赖注入类型正确
- [ ] 插件系统的泛型约束合理
- [ ] 编辑器策略模式的接口契约清晰

---

### Phase 6: 入口与应用层（预计 2-3 天）

#### 目标
完成最后入口文件的转换，启用严格模式。

#### 目标文件

```
src/
├── main.ts                  # 应用入口
└── api/
    └── index.ts             # 公共 API 导出入口
```

#### 转换重点

##### 3.6.1 应用入口

**文件: [main.ts](src/main.ts)**

```typescript
import { Workbook } from './workbook/Workbook';
import { registerColumnTypeClass } from './types';
import { TextColumnType } from './types/TextColumnType';
import { NumericColumnType } from './types/NumericColumnType';
import { DateColumnType } from './types/DateColumnType';
import { SelectColumnType } from './types/SelectColumnType';
import { functionRegistry } from './formula/functions';
import { CONFIG } from './constants/config';

function initializeApp(): void {
    // 注册内置列类型
    registerColumnTypeClass("text", TextColumnType);
    registerColumnTypeClass("numeric", NumericColumnType);
    registerColumnTypeClass("date", DateColumnType);
    registerColumnTypeClass("select", SelectColumnType);
    
    // 注册内置公式函数
    functionRegistry.registerBuiltInFunctions();
    
    console.log("[@canvas-sheet/core] Application initialized");
    console.log(`  Version: ${CONFIG.version}`);
    console.log(`  Environment: ${CONFIG.environment}`);
}

initializeApp();

export { Workbook } from './workbook/Workbook';
export { FormulaEngine } from './formula/FormulaEngine';
export { BasePlugin, PluginManager } from './plugins';
export * from './api/index'; // 统一导出公共 API
```

##### 3.6.2 公共 API 入口

**文件: [api/index.ts](src/api/index.ts)**

```typescript
/**
 * @canvas-sheet/core 公共 API
 * 
 * 此文件是 npm 包的主入口，导出所有面向用户的类型和类。
 * 内部实现细节不应从此文件导出。
 */

// 核心类
export { Workbook } from '../workbook/Workbook';
export { Sheet } from '../workbook/Sheet';

// 插件系统
export { BasePlugin } from '../plugins/BasePlugin';
export { PluginManager } from '../plugins/PluginManager';
export { AutoFillPlugin } from '../plugins/AutoFillPlugin';
export { CopyPastePlugin } from '../plugins/CopyPastePlugin';
export { FreezePlugin } from '../plugins/FreezePlugin';
export { ImportFilePlugin } from '../plugins/ImportFilePlugin';
export { ExportFilePlugin } from '../plugins/ExportFilePlugin';
export { SortPlugin } from '../plugins/SortPlugin';
export { FilterPlugin } from '../plugins/FilterPlugin';
export { ChartPlugin } from '../plugins/ChartPlugin';

// 列类型
export { BaseColumnType } from '../types/BaseColumnType';
export { registerColumnTypeClass, getColumnTypeClass } from '../types';

// 公式引擎
export { FormulaEngine } from '../formula/FormulaEngine';
export { FormulaEvaluator } from '../formula/FormulaEvaluator';
export { functionRegistry, FUNCTION_CATEGORY } from '../formula/functions';

// 主题
export { themeStyleProvider } from '../theme/ThemeStyleProvider';

// 基础组件
export { WebComponent, DOMComponent } from '../core';
export { Disposable } from '../core/Disposable';
export { EventBus } from '../core/EventBus';

// 状态管理
export { ReactiveStore } from '../state/ReactiveStore';

// 常量和枚举
export { EVENT_NAMES } from '../constants/eventNames';
export { HOOKS } from '../constants/hookNames';
export { SHEET_EVENTS } from '../constants/sheetEvents';
export { CONFIG } from '../constants/config';
export { HIT_TYPE } from '../constants/hitType';
export { LAYER_Z_INDEX } from '../constants/layerZIndex';

// 枚举值
export { AUTO_FILL_DIR } from '../constants/enums/AutoFillDir';
export { BORDER_STYLE } from '../constants/enums/BorderStyle';
export { CHART_TYPE } from '../constants/enums/ChartType';
export { CONTENT_TYPE } from '../constants/enums/ContentType';
export { ERROR_STYLE } from '../constants/enums/ErrorStyle';
export { FONT_STYLE } from '../constants/enums/FontStyle';
export { SCROLL_AXIS } from '../constants/enums/ScrollAxis';
export { SORT_ARROW_DIR } from '../constants/enums/SortArrowDir';
export { SORT_ORDER } from '../constants/enums/SortOrder';
export { STYLE_SCOPE } from '../constants/enums/StyleScope';
export { TEXT_ALIGN } from '../constants/enums/TextAlign';
export { VALIDATION_RULE_TYPE } from '../constants/enums/ValidationRuleType';
export { VERTICAL_ALIGN } from '../constants/enums/VerticalAlign';

// 类型导出（供高级用户使用）
export type { CellCoordinate, CellRange, CellValue, CellStyle } from '../types/index';
export type { EventCallback } from '../core/EventBus';
```

##### 3.6.3 启用严格模式

最终更新 `tsconfig.json`：

```jsonc
{
    "compilerOptions": {
        // ===== 最终配置 =====
        "target": "ES2020",
        "module": "ESNext",
        "moduleResolution": "bundler",
        
        "allowJs": false,           // ❌ 不再允许 JS
        "checkJs": false,
        "strict": true,             // ✅ 启用严格模式
        
        "noImplicitAny": true,      // 禁止隐式 any
        "strictNullChecks": true,   // 严格的空值检查
        "strictFunctionTypes": true,// 严格的函数类型
        "strictBindCallApply": true,// 严格的 bind/call/apply
        "strictPropertyInitialization": true, // 严格的属性初始化
        "noImplicitThis": true,     // 禁止隐式的 this
        "alwaysStrict": true,       // 总是严格模式
        
        "declaration": true,
        "declarationDir": "./dist/types",
        "emitDeclarationOnly": true,
        
        "noEmitOnError": true,      // 有错误时不输出
        
        // ... 其他配置不变
    }
}
```

#### 最终验证清单

- [ ] `npm run typecheck:strict` 零错误
- [ ] `npm run build` 成功
- [ ] `npm run build:lib` 产出正确的 ESM/UMD/DTS
- [ ] 测试项目 `test-ts-support` 全部测试通过
- [ ] IDE 无红色波浪线警告
- [ ] 文档已更新（API 变更说明）

---

## 4. 代码转换规范

### 4.1 命名约定

| 元素 | JS 规范 | TS 规范 | 示例 |
|------|---------|---------|------|
| 文件名 | `camelCase.js` | `PascalCase.ts` (类) / `camelCase.ts` (函数) | `Workbook.ts` / `helper.ts` |
| 类名 | PascalCase | PascalCase (不变) | `class Sheet {}` |
| 接口名 | 无 | PascalCase 或 I 前缀 | `interface ISheet {}` 或 `interface Sheet {}` |
| 类型别名 | 无 | PascalCase | `type CellValue = ...` |
| 枚举 | 对象字面量 | `as const` + 类型导出 | 见 3.1.2 |
| 泛型参数 | 无 | 单个大写字母 T/U/V 或描述性名称 | `T`, `TItem`, `TProps` |
| 私有字段 | `@private` 注释 | `private` 关键字或 `#` | `private field` 或 `#field` |

### 4.2 常见转换模式

#### 4.2.1 函数转换

```javascript
// Before
function formatNumber(num, decimals = 2) {
    return num.toFixed(decimals);
}
```

```typescript
// After
function formatNumber(num: number, decimals: number = 2): string {
    return num.toFixed(decimals);
}
```

#### 4.2.2 对象转换

```javascript
// Before
const config = {
    maxRows: 10000,
    defaultFontSize: 12,
};
```

```typescript
// After
interface Config {
    maxRows: number;
    defaultFontSize: number;
}

const config: Config = {
    maxRows: 10000,
    defaultFontSize: 12,
};
```

#### 4.2.3 类转换

```javascript
// Before
class Sheet {
    constructor(name) {
        this.name = name;
    }
    
    getName() {
        return this.name;
    }
}
```

```typescript
// After
class Sheet {
    private name: string;
    
    constructor(name: string) {
        this.name = name;
    }
    
    getName(): string {
        return this.name;
    }
}
```

#### 4.2.4 回调函数转换

```javascript
// Before
function subscribe(callback) {
    callbacks.push(callback);
}
```

```typescript
// After
type Subscriber = (data: Data) => void;

function subscribe(callback: Subscriber): UnsubscribeFn {
    callbacks.push(callback);
    return () => unsubscribe(callback);
}
```

#### 4.2.5 动态属性转换

```javascript
// Before
const obj = {};
obj[key] = value;
```

```typescript
// After
interface ObjMap {
    [key: string]: ValueType;
}

const obj: ObjMap = {};
obj[key] = value; // 如果 key 是变量，可能需要类型断言
```

### 4.3 应该避免的模式

```typescript
// ❌ 避免过度使用 any
function processData(data: any): any { ... }

// ✅ 使用 unknown 或具体类型
function processData<T>(data: T): ProcessedResult<T> { ... }

// ❌ 避免双重断言
const el = element as unknown as HTMLElement;

// ✅ 使用类型守卫
function isHTMLElement(el: Element): el is HTMLElement {
    return el instanceof HTMLElement;
}

// ❌ 避免可选属性滥用
interface Bad {
    a?: string;
    b?: number;
    c?: boolean;
}

// ✅ 区分必须和可选
interface Good {
    required: string;
    optional?: number;
}
```

### 4.4 性能注意事项

1. **避免不必要的类型检查**: 在热循环中不要使用 `instanceof` 或类型守卫
2. **使用 const 断言**: 对于不会改变的对象使用 `as const`
3. **合理使用泛型**: 不过度泛化，也不过度具体
4. **枚举 vs 字面量 union**: 优先使用字面量联合类型（tree-shaking 友好）

---

## 5. 风险控制与回退策略

### 5.1 Git 分支策略

```bash
# 主分支
main (稳定版本)

# 功能分支（每个 Phase 一个）
feature/ts-migration-phase-0
feature/ts-migration-phase-1
feature/ts-migration-phase-2
...

# 定期合并
git checkout feature/ts-migration-phase-1
git merge main  # 同步上游变更
```

### 5.2 版本标记

每个 Phase 完成后打 Tag：

```bash
git tag -a v1.0.16-ts-phase-1 -m "TS migration phase 1 complete: utils and constants"
git tag -a v1.0.17-ts-phase-2 -m "TS migration phase 2 complete: core infrastructure"
# ...
```

### 5.3 回退机制

如遇严重问题无法解决：

```bash
# 回退到上一个稳定版本
git checkout v1.0.15  # 迁移前的最后一个稳定版

# 或者回退到某个 Phase
git checkout v1.0.16-ts-phase-2
```

### 5.4 兼容性保障措施

1. **构建产物不变**: Webpack 输出仍为 ES2020，不影响消费者
2. **API 签名兼容**: 公共方法的参数顺序和类型保持向后兼容
3. **渐进式发布**: 可在 package.json 中同时提供 JS 和 TS 入口
4. **文档同步**: 每个 Phase 更新 CHANGELOG.md

### 5.5 常见风险及应对

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| 循环依赖导致类型错误 | 高 | 中 | 使用 `import type` 延迟加载；重构依赖关系 |
| 第三方库缺少类型 | 中 | 低 | 创建 `*.d.ts` 声明文件或使用 `@types/*` |
| 性能回归 | 高 | 低 | Benchmark 对比；避免在热循环中使用复杂泛型 |
| 团队学习曲线 | 中 | 中 | 提供培训文档；Code Review 强制执行规范 |
| 工期延误 | 中 | 中 | 每个 Phase 设立里程碑；及时调整范围 |

---

## 6. 验证清单

### 6.1 每个 Phase 必须通过的检查

```bash
# 1. TypeScript 编译检查
npm run typecheck

# 2. 构建验证
npm run build

# 3. 库构建验证
npm run build:lib

# 4. 类型声明验证
node scripts/verify-dts-paths.js

# 5. 外部集成测试
cd test-ts-support && npm run test-types

# 6. IDE 诊断检查
# 在 VS Code 中打开项目，查看问题面板
```

### 6.2 自动化测试（建议添加）

```bash
# 运行单元测试
npm test

# 运行 E2E 测试
npm run test:e2e

# 类型覆盖率检查（可选工具）
npx type-coverage
```

### 6.3 手动测试要点

- [ ] 开发服务器启动正常（`npm run dev`）
- [ ] 生产构建产物可用（`npm run build` 后打开 dist/index.html）
- [ ] 核心功能正常：单元格编辑、公式计算、选区操作
- [ ] 插件系统正常：加载/卸载插件
- [ ] 渲染正常：滚动、缩放、冻结窗格
- [ ] 性能无明显下降（对比迁移前后 benchmark）

---

## 7. 时间估算

### 7.1 各阶段工期汇总

| Phase | 内容 | 文件数 | 预计工期 | 累计时间 | 人力需求 |
|-------|------|--------|----------|----------|----------|
| **Phase 0** | 环境准备 | 配置文件 | 1-2 天 | 1-2 天 | 1 人 |
| **Phase 1** | utils/, constants/ | ~30 个 | 3-5 天 | 4-7 天 | 1 人 |
| **Phase 2** | core/, types/, theme/ | ~25 个 | 5-7 天 | 9-14 天 | 1-2 人 |
| **Phase 3** | formula/, render/ | ~40 个 | 7-10 天 | 16-24 天 | 1-2 人 |
| **Phase 4** | model/, state/, ui/ | ~45 个 | 7-10 天 | 23-34 天 | 1-2 人 |
| **Phase 5** | workbook/, plugins/, editor/ | ~100 个 | 10-14 天 | 33-48 天 | 2 人 |
| **Phase 6** | main.ts, api/ | ~15 个 | 2-3 天 | **35-51 天** | 1 人 |

### 7.2 总工期

- **单人全职**: 约 **1.5 - 2 个月**（35-51 个工作日）
- **双人并行**: 约 **1 - 1.5 个月**（Phase 3-5 可并行）
- **最小可行方案**（只转核心模块）: 约 **3-4 周**

### 7.3 并行工作建议

如果团队有 2 人以上，可以这样分配：

```
开发者 A: Phase 1 → Phase 2 → Phase 4 (工具→基础→中间件)
开发者 B: Phase 3 → Phase 5 (引擎→业务逻辑)
合并后: Phase 6 (入口与应用层)
```

---

## 8. 附录：常用转换示例

### 8.1 JSDoc 到 TypeScript 类型

```javascript
// Before (JSDoc)
/**
 * @param {string} name - 用户名
 * @param {number} age - 年龄
 * @returns {boolean} 是否成年
 */
function isAdult(name, age) {
    return age >= 18;
}
```

```typescript
// After (TypeScript)
function isAdult(name: string, age: number): boolean {
    return age >= 18;
}
```

### 8.2 事件发射器

```javascript
// Before
class Emitter {
    on(event, handler) { ... }
    emit(event, data) { ... }
}
```

```typescript
// After
interface Events {
    click: { x: number; y: number };
    change: { value: string };
}

class Emitter<T extends Record<string, any>> {
    on<K extends keyof T>(event: K, handler: (data: T[K]) => void): void { ... }
    emit<K extends keyof T>(event: K, data: T[K]): void { ... }
}
```

### 8.3 Promise 包装

```javascript
// Before
async function fetchData(url) {
    const res = await fetch(url);
    return res.json();
}
```

```typescript
// After
interface User {
    id: number;
    name: string;
    email: string;
}

async function fetchData<T = any>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json() as Promise<T>;
}

// 使用
const user = await fetchData<User>('/api/user/1');
// user.id, user.name, user.email 都有类型提示 ✅
```

### 8.4 工厂模式

```javascript
// Before
function createRenderer(type) {
    switch (type) {
        case 'canvas': return new CanvasRenderer();
        case 'svg': return new SvgRenderer();
        case 'webgl': return new WebGLRenderer();
        default: throw new Error('Unknown renderer');
    }
}
```

```typescript
// After
type RendererType = 'canvas' | 'svg' | 'webgl';

interface Renderer {
    render(): void;
    destroy(): void;
}

class CanvasRenderer implements Renderer { /* ... */ }
class SvgRenderer implements Renderer { /* ... */ }
class WebGLRenderer implements Renderer { /* ... */ }

const rendererFactories: Record<RendererType, () => Renderer> = {
    canvas: () => new CanvasRenderer(),
    svg: () => new SvgRenderer(),
    webgl: () => new WebGLRenderer(),
};

function createRenderer(type: RendererType): Renderer {
    const factory = rendererFactories[type];
    if (!factory) {
        throw new Error(`Unknown renderer type: ${type}`);
    }
    return factory();
}
```

### 8.5 装饰器（可选进阶用法）

```typescript
// 日志装饰器
function Log(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = function (...args: any[]) {
        console.log(`Calling ${propertyKey} with`, args);
        const result = originalMethod.apply(this, args);
        console.log(`${propertyKey} returned`, result);
        return result;
    };
    
    return descriptor;
}

// 使用
class Calculator {
    @Log
    add(a: number, b: number): number {
        return a + b;
    }
}

const calc = new Calculator();
calc.add(2, 3);
// Console output:
// Calling add with [2, 3]
// add returned 5
```

---

## 总结与后续步骤

### 立即行动项

1. ✅ **今天**: 创建此文档并评审迁移方案
2. ⏳ **本周**: 完成 Phase 0（环境准备）
3. 📋 **下周开始**: Phase 1（utils + constants）

### 成功指标

- [x] 项目可以完全用 TypeScript 编写（`allowJs: false`）
- [x] `tsc --noEmit --strict` 零错误
- [x] 生成的 `.d.ts` 文件质量高（消费者端零错误）
- [x] 无性能回归
- [x] 团队成员掌握 TypeScript 最佳实践

### 参考资料

- [TypeScript 官方手册](https://www.typescriptlang.org/docs/handbook/)
- [TypeScript 深入理解](https://basarat.gitbook.io/typescript/)
- [React + TypeScript 速查表](https://github.com/typescript-cheatsheets/react)（参考模式）
- [有效 TypeScript](https://github.com/davidkpiper/effective-typescript)

---

> **文档维护**: 本文档应随着迁移进度持续更新。每个 Phase 完成后请更新对应章节的状态和时间记录。
> 
> **最后更新**: 2026-08-07 by AI Assistant