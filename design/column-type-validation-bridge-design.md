# ColumnType-Validation 集成设计文档（路径 B：validation 子对象）

> **版本**: v2.2
> **日期**: 2026-08-26
> **状态**: 📐 设计中
> **依赖**: `src/types`（列类型系统）、`src/plugins/data-validation`（验证插件）
> **替代**: 本文档替代 v1.0 推断桥接方案，采用 `validation` 子对象直传模式
> **v2.1 变更**: 降级条件改为桥接器驱动，修复插件未启用时验证失效的安全隐患
> **v2.2 变更**: 修复内部不一致，补充边界场景设计（附录 D）

---

## 📋 目录

1. [背景与动机](#1-背景与动机)
2. [方案选型：为什么选择路径 B](#2-方案选型为什么选择路径-b)
3. [设计目标](#3-设计目标)
4. [架构设计](#4-架构设计)
5. [ColumnConfig 接口扩展](#5-columnconfig-接口扩展)
6. [桥接器设计（ColumnTypeValidationBridge）](#6-桥接器设计columntypevalidationbridge)
7. [配置示例](#7-配置示例)
8. [映射规则](#8-映射规则)
9. [双重验证消除](#9-双重验证消除)
10. [插件未启用时的安全降级](#10-插件未启用时的安全降级)
11. [冲突解决策略](#11-冲突解决策略)
12. [同步时机与生命周期](#12-同步时机与生命周期)
13. [与现有系统的集成](#13-与现有系统的集成)
14. [编辑器即时反馈增强](#14-编辑器即时反馈增强)
15. [性能考量](#15-性能考量)
16. [测试策略](#16-测试策略)
17. [验收标准](#17-验收标准)
18. [风险与缓解](#18-风险与缓解)
19. [迁移指南](#19-迁移指南)
20. [变更历史](#变更历史)
- [附录 A: 向后兼容推断规则实现](#附录-a-向后兼容推断规则实现)
- [附录 B: 配置选项](#附录-b-配置选项)
- [附录 C: 文件变更清单](#附录-c-文件变更清单)
- [附录 D: 边界场景与补充设计](#附录-d-边界场景与补充设计)

---

## 1. 背景与动机

### 1.1 两套并行的验证体系

当前系统中存在两套独立的数据验证机制：

| 维度 | `src/types`（列类型系统） | `src/plugins/data-validation`（验证插件） |
|------|--------------------------|------------------------------------------|
| **验证时机** | 编辑器提交时（`validateCellValue`） | `BEFORE_SET_VALUE_AT` 钩子拦截 |
| **验证来源** | 列配置 `columns[].type` + `options` | 显式规则 `pluginOptions.rules` |
| **验证方式** | `BaseColumnType.validate()` | `ValidationEngine.validateCell()` |
| **约束表达** | `options.min/max/maxLength/source` | `ValidationRule.operator/value/source` |
| **错误处理** | 返回 `true/false/string` | 返回 `ValidationResult` 对象 |
| **UI 反馈** | 编辑器内联提示（红色边框） | Portal 气泡 + 条件格式 + 验证图标 |
| **作用范围** | 列级或单元格级 | 任意区域（range） |
| **持久化** | 随 `columns` 配置 | 随 `ValidationRule` 导出 |

### 1.2 核心问题

1. **双重验证**：同一约束被检查两次，浪费性能
2. **错误信息不一致**：列类型返回 `"数值不能大于 100"`，验证插件返回 `rule.errorMessage`
3. **拦截顺序不确定**：编辑器层 vs 钩子层，执行顺序不可预测
4. **配置冗余**：用户需要为同一个约束写两遍配置
5. **UI 能力不对等**：列类型验证只有红色边框，无法使用 DataValidationPlugin 的错误提示弹框、无效高亮、验证图标等

### 1.3 用户期望

```typescript
columns: [{ type: "numeric", options: { min: 0, max: 100 } }]
```

用户期望这一行配置就能获得 DataValidationPlugin 的**全部能力**：
- ✅ 值写入前拦截（`errorStyle: "stop"` 阻止写入）
- ✅ 错误提示弹框（`showErrorTooltip`）
- ✅ 无效单元格高亮（条件格式 + 红色背景）
- ✅ 下拉箭头图标（list 类型）
- ✅ 验证图标（✓ / ❌）
- ✅ 输入提示（`inputMessage`）

---

## 2. 方案选型：为什么选择路径 B

### 2.1 三种方案对比

| 维度 | 路径 A：推断桥接 | **路径 B：validation 子对象** | 路径 C：顶层平铺 |
|------|------------------|------------------------------|------------------|
| **配置方式** | `options: { min, max }` → 桥接推断 | `validation: { operator, value }` → 直传 | 顶层混入验证字段 |
| **用户控制度** | ❌ 无法自定义 errorMessage、errorStyle | ✅ 完全控制 | ✅ 完全控制 |
| **type 语义** | 无冲突（两套 type 各司其职） | ✅ 无冲突（外层列类型，内层验证类型） | ❌ 冲突（一个 type 两个含义） |
| **value 语义** | 无冲突 | ✅ 无冲突 | ❌ 冲突（默认值 vs 约束值） |
| **桥接器复杂度** | 高（映射表 + 错误消息模板 + 推断逻辑） | ✅ 低（直传 + 默认值推断） | 低 |
| **接口污染** | 无 | ✅ 仅新增 `validation` 字段 | ❌ 验证字段污染 ColumnConfig 顶层 |
| **向后兼容** | ✅ | ✅（`validation` 可选） | ❌ 字段语义变更 |
| **双重验证消除** | 需要降级处理 | ✅ `validation` 存在即降级，更精确 | 需要降级处理 |
| **range 灵活性** | 固定整列 | ✅ 可指定任意范围 | 可指定任意范围 |

### 2.2 选择路径 B 的核心理由

1. **用户获得完全控制**——`errorMessage`、`errorStyle`、`operator`、`value`、`range` 全部可自定义
2. **零语义冲突**——`type` 在外层是列类型（决定编辑器/格式化），在 `validation` 内是验证类型（决定校验方式）
3. **桥接器实现极简**——从"推断引擎"降级为"直传 + 默认值填充"
4. **双重验证自然消除**——`validation` 存在 = DataValidationPlugin 接管，列类型 `validate()` 降级
5. **向后兼容**——不写 `validation` 时行为完全不变

---

## 3. 设计目标

| # | 目标 | 优先级 |
|---|------|--------|
| G1 | **消除双重验证**：`validation` 存在时，列类型验证降级为仅提示，DataValidationPlugin 统一拦截 | P0 |
| G2 | **单一配置源**：用户在 `columns[].validation` 中配置验证规则，桥接器自动同步到 ValidationEngine | P0 |
| G3 | **完全控制**：用户可自定义 `errorMessage`、`errorStyle`、`operator`、`value`、`range` 等所有验证参数 | P0 |
| G4 | **手动规则优先**：`pluginOptions.rules` 中的手动规则优先级高于 `validation` 自动规则 | P1 |
| G5 | **实时同步**：列配置变化时自动更新验证规则 | P1 |
| G6 | **向后兼容**：不写 `validation` 时行为完全不变 | P1 |
| G7 | **零侵入**：不修改 `BaseColumnType` 和 `ValidationEngine` 的核心逻辑 | P2 |

---

## 4. 架构设计

### 4.1 系统上下文

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Workbook                                   │
│                                                                      │
│  ┌──────────────────────┐     ┌──────────────────────────────────┐  │
│  │  ColumnTypeManager    │     │  ColumnTypeValidationBridge     │  │
│  │                      │     │                                  │  │
│  │ • applyColumnsConfig │────→│  • syncFromColumnConfig()        │  │
│  │   ()                 │     │  • syncColumn(col)               │  │
│  │                      │     │  • #createRuleFromValidation()    │  │
│  │ • validateCellValue  │     │  • #createRuleFromColumnType()   │  │
│  │   () ← 桥接器驱动降级 │     │  • #inferDefaults()              │  │
│  │                      │     │                                  │  │
│  │ • #bridgeTakenCols   │←────│  markBridgeTaken/unmarkBridgeTaken│  │
│  │   (桥接器接管标记)    │     │  clearBridgeTaken               │  │
│  └──────────────────────┘     └───────────┬──────────────────────┘  │
│           │                                │ 自动生成/同步            │
│           │ 列类型验证                      ↓                         │
│           │                 ┌──────────────────────────────────┐    │
│           │                 │    DataValidationPlugin          │    │
│           │                 │                                  │    │
│           │                 │  • interceptBeforeSetValue()     │    │
│           │                 │  • ValidationUIController        │    │
│           │                 │  • engine.addRule()              │    │
│           │                 └──────────────────────────────────┘    │
│           │                                                          │
│           ↓                                                          │
│    ⚠️ bridgeTaken 时：列类型 validate() 仅提示，不阻止              │
│    ✅ 未 bridgeTaken 时：列类型 validate() 正常阻止（兜底）          │
│    ✅ DataValidationPlugin 统一拦截 + UI 反馈                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 核心设计决策

#### D1: 配置载体 — `columns[].validation` 子对象

**选择**：在 `ColumnConfig` 中新增 `validation` 可选字段，用户直接在此配置验证规则参数。

**理由**：
- 零语义冲突：`type`（外层列类型）与 `validation.type`（验证类型）各司其职
- 字段隔离：验证专属字段不污染 `ColumnConfig` 顶层
- 完全控制：用户可自定义所有验证参数

#### D2: 桥接方向 — 列配置 → 验证规则（单向）

**选择**：`validation` 子对象自动生成 `ValidationRule`，非反向。

**理由**：
- 列配置是用户**意图声明**，验证规则是**执行机制**
- 意图 → 执行 是自然方向

#### D3: 默认值推断 — `validation` 中可省略部分字段

**选择**：`validation.type`、`validation.range` 等字段可省略，桥接器从列类型推断默认值。

**理由**：
- 减少配置冗余：`{ type: "numeric", validation: { operator: "between", value: [0, 100] } }` 足够
- 桥接器自动填充 `type: "number"`、`range: "A:A"`

#### D4: 验证统一入口 — DataValidationPlugin

**选择**：`validation` 存在时，所有验证统一由 `DataValidationPlugin` 执行。

**理由**：
- 避免双重验证
- 验证插件提供更丰富的 UI 能力（错误提示、高亮、图标）

#### D5: 降级策略 — 桥接器驱动降级（v2.1 修正）

**选择**：仅当 `validation` 存在 **且桥接器已接管该列**（`bridgeTakenCols.has(c)`）时，列类型 `validate()` 才降级为仅提示。

**理由**：
- 比"validation 存在即降级"更安全——插件未启用时不降级，列类型验证兜底
- 桥接器接管 = DataValidationPlugin 已激活 + 该列有自动/手动规则 → 降级安全
- 不写 `validation` 时行为完全不变，零风险
- 详见 [第10章](#10-插件未启用时的安全降级)

#### D6: 自动规则标记

**选择**：自动生成的 `ValidationRule` 带有 `metadata` 标记。

```typescript
rule.metadata = {
    source: 'column-validation',     // 来源标识
    columnType: 'numeric',           // 原始列类型名
    column: 0,                       // 列号
    generatedAt: Date.now()          // 生成时间
};
```

---

## 5. ColumnConfig 接口扩展

### 5.1 新增 `ColumnValidationConfig` 接口

```typescript
/**
 * 列级验证规则配置
 *
 * 嵌入 ColumnConfig.validation 中，由 ColumnTypeValidationBridge
 * 自动同步到 DataValidationPlugin 的 ValidationEngine。
 *
 * 所有字段均为可选——省略时由桥接器从列类型推断默认值。
 */
export interface ColumnValidationConfig {
    /** 验证规则作用范围，默认整列（如 "A:A"） */
    range?: string;

    /**
     * 验证类型，默认从列类型推断：
     * - numeric → "number"
     * - select  → "list"
     * - date    → "date" / "time" / "datetime"（根据 dateFormat.pattern）
     * - text/textarea → "text"
     */
    type?: string;

    /** 比较运算符（如 "between"、"greaterThanOrEqual"） */
    operator?: string;

    /** 约束值（单值或 [min, max] 数组） */
    value?: unknown;

    /** 下拉选项数据源（list 类型使用） */
    source?: string[] | string;

    /** 自定义公式（formula 类型使用） */
    formula?: string;

    /** 正则表达式模式（regex 类型使用） */
    pattern?: string;

    /** 是否允许空值，默认 true */
    allowBlank?: boolean;

    /** 是否显示下拉箭头（list 类型），默认 true */
    showDropdown?: boolean;

    /** 是否显示错误提示，默认 true */
    showErrorMessage?: boolean;

    /** 自定义错误消息 */
    errorMessage?: string | null;

    /** 错误提示标题，默认 "输入错误" */
    errorTitle?: string;

    /**
     * 错误样式：
     * - "stop"：阻止写入并显示错误
     * - "warning"：允许写入但显示警告
     * - "information"：仅显示信息提示
     * 默认 "stop"
     */
    errorStyle?: string;

    /** 输入提示消息（选中单元格时显示） */
    inputMessage?: string | null;

    /** 输入提示标题，默认 "提示" */
    inputTitle?: string;

    /**
     * 规则优先级：
     * - 省略时默认 1000（低于手动规则的 0）
     * - 数值越小优先级越高
     */
    priority?: number;
}
```

### 5.2 `ColumnConfig` 接口扩展

```typescript
export interface ColumnConfig {
    type?: string;
    defaultValue?: unknown;
    options?: Record<string, unknown>;
    readOnly?: boolean;
    width?: number;
    disabled?: boolean;
    style?: StyleObject;
    validator?: (value: unknown) => boolean | string;
    autoFitRow?: boolean;

    /**
     * 列级验证规则配置（v2.0 新增）
     *
     * 存在时：
     * - 桥接器自动生成 ValidationRule 并添加到 ValidationEngine
     * - 列类型 validate() 降级为仅提示（不阻止提交）
     * - DataValidationPlugin 统一处理验证拦截和 UI 反馈
     *
     * 不存在时：
     * - 行为与 v1.0 完全一致（向后兼容）
     */
    validation?: ColumnValidationConfig;

    [key: string]: unknown;
}
```

---

## 6. 桥接器设计（ColumnTypeValidationBridge）

### 6.1 类定义

```typescript
import { ValidationRule } from "./ValidationRule.js";
import { ValidationEngine } from "./ValidationEngine.js";
import { indexToCol } from "../../utils/cellRef.js";
import type { ColumnTypeManager } from "../../workbook/managers/ColumnTypeManager.js";

const AUTO_RULE_PRIORITY = 1000;
const BRIDGE_SOURCE = "column-validation";

export class ColumnTypeValidationBridge {
    #active: boolean = false;
    #columnTypeManager: ColumnTypeManager;
    #validationEngine: ValidationEngine;

    /** 自动规则 ID → 列号 */
    #autoRuleToColumn: Map<string, number> = new Map();

    /** 列号 → 自动规则 ID */
    #columnToAutoRule: Map<number, string> = new Map();

    /** 列号 → 上次同步的 validation 快照（增量同步用） */
    #lastSyncedValidation: Map<number, Record<string, any>> = new Map();

    /** 自动规则默认 errorStyle */
    #defaultErrorStyle: string = "stop";

    /** 手动规则优先 */
    #respectManualRules: boolean = true;

    constructor(
        columnTypeManager: ColumnTypeManager,
        validationEngine: ValidationEngine,
        options: {
            defaultErrorStyle?: string;
            respectManualRules?: boolean;
        } = {}
    ) {
        this.#columnTypeManager = columnTypeManager;
        this.#validationEngine = validationEngine;
        if (options.defaultErrorStyle) this.#defaultErrorStyle = options.defaultErrorStyle;
        if (options.respectManualRules !== undefined) this.#respectManualRules = options.respectManualRules;
    }

    get active(): boolean {
        return this.#active;
    }
}
```

### 6.2 核心方法

#### `syncFromColumnConfig()` — 全量同步

```typescript
/**
 * 从列配置全量同步验证规则
 *
 * 遍历所有列配置：
 * - 有 validation 的列 → 从 validation 子对象创建规则
 * - 无 validation 但有可桥接约束的列 → 从 type+options 推断规则（向后兼容）
 * - 无约束的列 → 跳过
 *
 * 调用时机：
 * - applyColumnsConfig() 后
 * - Sheet 切换后
 * - 桥接器初始化时
 */
syncFromColumnConfig(): void {
    if (!this.#active) return;

    const columnsConfig = this.#columnTypeManager.columnsConfig;

    // 1. 为有配置的列同步规则
    for (const [col] of columnsConfig) {
        this.syncColumn(col);
    }

    // 2. 清理已删除列的规则
    for (const [col] of this.#columnToAutoRule) {
        if (!columnsConfig.has(col)) {
            this.#removeAutoRuleForColumn(col);
        }
    }
}
```

#### `syncColumn(col)` — 增量同步

```typescript
/**
 * 同步单列配置变更
 *
 * 优先级：
 * 1. validation 子对象存在 → 直传模式（路径 B）
 * 2. validation 不存在 + 有可桥接约束 → 推断模式（向后兼容）
 * 3. 无约束 → 移除已有自动规则
 */
syncColumn(col: number): void {
    if (!this.#active) return;

    const config = this.#columnTypeManager.getColumnConfig(col);
    const currentSnapshot = config ? this.#extractValidationSnapshot(config) : null;
    const lastSnapshot = this.#lastSyncedValidation.get(col) || null;

    // 增量同步：配置未变时跳过
    if (this.#snapshotEqual(currentSnapshot, lastSnapshot)) return;

    // 移除旧的自动规则 + 取消接管标记
    this.#removeAutoRuleForColumn(col);

    if (config) {
        let rule: ValidationRule | null = null;

        if (config.validation) {
            // 路径 B：从 validation 子对象创建规则
            rule = this.#createRuleFromValidation(col, config);
        } else if (this.#hasBridgeableConstraint(config)) {
            // 向后兼容：从 type + options 推断规则
            rule = this.#createRuleFromColumnType(col, config);
        }

        if (rule) {
            // 手动规则优先检查
            if (this.#respectManualRules && this.#hasManualRuleForColumn(col, rule.type)) {
                // 手动规则优先，但仍标记接管（手动规则会拦截）
                this.#columnTypeManager.markBridgeTaken(col);
                this.#lastSyncedValidation.set(col, currentSnapshot!);
                return;
            }

            const ruleId = this.#validationEngine.addRule(rule);
            this.#autoRuleToColumn.set(ruleId, col);
            this.#columnToAutoRule.set(col, ruleId);

            // 标记桥接器已接管该列
            this.#columnTypeManager.markBridgeTaken(col);
        } else {
            // 无规则生成 → 不接管
            this.#columnTypeManager.unmarkBridgeTaken(col);
        }
    } else {
        // 列配置已删除 → 不接管
        this.#columnTypeManager.unmarkBridgeTaken(col);
    }

    this.#lastSyncedValidation.set(col, currentSnapshot || {});
}
```

#### `#createRuleFromValidation()` — 直传模式（核心）

```typescript
/**
 * 从 validation 子对象创建 ValidationRule
 *
 * 用户在 validation 中配置的字段直接传入 ValidationRule 构造函数，
 * 省略的字段由桥接器从列类型推断默认值。
 */
#createRuleFromValidation(col: number, config: Record<string, any>): ValidationRule | null {
    const v = config.validation;
    const columnType = config.type as string;

    // 推断默认值
    const inferredType = v.type || this.#inferValidationType(columnType, config);
    const inferredRange = v.range || this.#colToRange(col);
    const inferredPriority = v.priority ?? AUTO_RULE_PRIORITY;
    const inferredErrorStyle = v.errorStyle || this.#defaultErrorStyle;

    if (!inferredType) return null;

    // 合并用户配置 + 推断默认值
    const ruleConfig: Record<string, any> = {
        range: inferredRange,
        type: inferredType,
        priority: inferredPriority,
        errorStyle: inferredErrorStyle,
        allowBlank: v.allowBlank ?? true,
        showDropdown: v.showDropdown ?? true,
        showErrorMessage: v.showErrorMessage ?? true,
        errorTitle: v.errorTitle || "输入错误",
        inputTitle: v.inputTitle || "提示",
        metadata: {
            source: BRIDGE_SOURCE,
            columnType: columnType,
            column: col,
            generatedAt: Date.now(),
        },
    };

    // 直传用户配置的字段（覆盖默认值）
    if (v.operator !== undefined) ruleConfig.operator = v.operator;
    if (v.value !== undefined) ruleConfig.value = v.value;
    if (v.source !== undefined) ruleConfig.source = v.source;
    if (v.formula !== undefined) ruleConfig.formula = v.formula;
    if (v.pattern !== undefined) ruleConfig.pattern = v.pattern;
    if (v.errorMessage !== undefined) ruleConfig.errorMessage = v.errorMessage;
    if (v.inputMessage !== undefined) ruleConfig.inputMessage = v.inputMessage;

    return new ValidationRule(ruleConfig);
}
```

#### `#inferValidationType()` — 默认值推断

```typescript
/**
 * 从列类型推断验证类型
 *
 * 映射关系：
 * - numeric → number
 * - select  → list
 * - date    → date / time / datetime（根据 dateFormat.pattern）
 * - text    → text
 * - textarea → text
 * - 其他    → null（不推断）
 */
#inferValidationType(columnType: string, config: Record<string, any>): string | null {
    switch (columnType) {
        case "numeric": return "number";
        case "select": return "list";
        case "date": {
            const pattern = config.options?.dateFormat?.pattern || "YYYY-MM-DD";
            if (/^[Hhms: ]+$/.test(pattern)) return "time";
            if (/[Hhms]/.test(pattern)) return "datetime";
            return "date";
        }
        case "text":
        case "textarea": return "text";
        default: return null;
    }
}
```

#### `#createRuleFromColumnType()` — 向后兼容推断模式

```typescript
/**
 * 从列类型 + options 推断 ValidationRule（向后兼容）
 *
 * 当 validation 子对象不存在，但 options 中有可桥接约束时使用。
 * 映射规则与 v1.0 设计一致。
 */
#createRuleFromColumnType(col: number, config: Record<string, any>): ValidationRule | null {
    const typeName = config.type as string;
    const options = config.options || {};
    const range = this.#colToRange(col);

    switch (typeName) {
        case "numeric": return this.#inferNumericRule(col, range, options);
        case "select": return this.#inferSelectRule(col, range, options);
        case "date": return this.#inferDateRule(col, range, options);
        case "text":
        case "textarea": return this.#inferTextRule(col, range, options);
        default: return null;
    }
}
```

（`#inferNumericRule`、`#inferSelectRule`、`#inferDateRule`、`#inferTextRule` 的实现与 v1.0 设计相同，此处省略，详见附录 A。）

### 6.3 辅助方法

```typescript
/** 检查列配置是否有 validation 子对象或可桥接约束 */
#hasBridgeableConfig(config: Record<string, any>): boolean {
    if (config.validation) return true;
    return this.#hasBridgeableConstraint(config);
}

/** 检查列配置 options 中是否有可桥接约束（向后兼容） */
#hasBridgeableConstraint(config: Record<string, any>): boolean {
    const typeName = config.type as string;
    const options = config.options || {};
    switch (typeName) {
        case "numeric": return options.min !== undefined || options.max !== undefined;
        case "select": return Array.isArray(options.source) && options.source.length > 0;
        case "date": return options.min !== undefined || options.max !== undefined;
        case "text":
        case "textarea": return options.maxLength !== undefined;
        default: return false;
    }
}

/** 检查指定列是否已存在手动同类验证规则 */
#hasManualRuleForColumn(col: number, validationType: string): boolean {
    const rules = this.#validationEngine.getRulesForCell(0, col);
    return rules.some(
        (rule: any) => rule.type === validationType && rule.metadata?.source !== BRIDGE_SOURCE
    );
}

/** 移除指定列的自动规则 + 取消接管标记 */
#removeAutoRuleForColumn(col: number): void {
    const existingRuleId = this.#columnToAutoRule.get(col);
    if (existingRuleId) {
        this.#validationEngine.removeRule(existingRuleId);
        this.#autoRuleToColumn.delete(existingRuleId);
        this.#columnToAutoRule.delete(col);
    }
    // 取消接管标记
    this.#columnTypeManager.unmarkBridgeTaken(col);
}

/** 列号 → 整列范围字符串 */
#colToRange(col: number): string {
    const colLetter = indexToCol(col);
    return `${colLetter}:${colLetter}`;
}

/** 提取 validation 快照（用于增量同步对比） */
#extractValidationSnapshot(config: Record<string, any>): Record<string, any> {
    if (config.validation) {
        return { validation: { ...config.validation } };
    }
    const options = config.options || {};
    const typeName = config.type as string;
    switch (typeName) {
        case "numeric": return { type: typeName, min: options.min, max: options.max };
        case "select": return { type: typeName, source: options.source ? [...options.source] : null };
        case "date": return { type: typeName, min: options.min, max: options.max, pattern: options.dateFormat?.pattern };
        case "text":
        case "textarea": return { type: typeName, maxLength: options.maxLength };
        default: return { type: typeName };
    }
}

/** 快照深度比较 */
#snapshotEqual(a: Record<string, any> | null, b: Record<string, any> | null): boolean {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
        const va = a[key];
        const vb = b[key];
        if (va && typeof va === "object" && vb && typeof vb === "object") {
            if (!this.#snapshotEqual(va, vb)) return false;
        } else if (Array.isArray(va) && Array.isArray(vb)) {
            if (va.length !== vb.length || !va.every((v: any, i: number) => v === vb[i])) return false;
        } else if (va !== vb) {
            return false;
        }
    }
    return true;
}
```

### 6.4 生命周期方法

```typescript
/** 激活桥接器并全量同步 */
activate(): void {
    this.#active = true;
    this.syncFromColumnConfig();
}

/** 停用桥接器（清除所有自动规则 + 接管标记） */
deactivate(): void {
    this.clearAutoGeneratedRules();
    this.#columnTypeManager.clearBridgeTaken();
    this.#active = false;
}

/** 清除所有自动生成的验证规则 */
clearAutoGeneratedRules(): void {
    for (const ruleId of this.#autoRuleToColumn.keys()) {
        this.#validationEngine.removeRule(ruleId);
    }
    this.#autoRuleToColumn.clear();
    this.#columnToAutoRule.clear();
    this.#lastSyncedValidation.clear();
}

/** 手动规则移除后的回补 */
onManualRuleRemoved(col: number, validationType: string): void {
    if (!this.#active) return;
    const config = this.#columnTypeManager.getColumnConfig(col);
    if (!config) return;

    if (config.validation) {
        const inferredType = config.validation.type || this.#inferValidationType(config.type, config);
        if (inferredType !== validationType) return;
    } else if (!this.#hasBridgeableConstraint(config)) {
        return;
    }

    if (this.#hasManualRuleForColumn(col, validationType)) return;

    const rule = config.validation
        ? this.#createRuleFromValidation(col, config)
        : this.#createRuleFromColumnType(col, config);

    if (rule) {
        const ruleId = this.#validationEngine.addRule(rule);
        this.#autoRuleToColumn.set(ruleId, col);
        this.#columnToAutoRule.set(col, ruleId);
    }
}

/** 销毁桥接器 */
destroy(): void {
    this.deactivate();
    (this.#columnTypeManager as any) = null;
    (this.#validationEngine as any) = null;
}
```

### 6.5 查询方法

```typescript
/** 获取桥接状态信息 */
getBridgeStatus(): {
    active: boolean;
    autoRuleCount: number;
    bridgedColumnCount: number;
    details: Array<{ col: number; ruleId: string | null; columnType: string; hasValidation: boolean }>;
} {
    const details: Array<{ col: number; ruleId: string | null; columnType: string; hasValidation: boolean }> = [];
    for (const [col] of this.#columnTypeManager.columnsConfig) {
        const config = this.#columnTypeManager.getColumnConfig(col);
        details.push({
            col,
            ruleId: this.#columnToAutoRule.get(col) || null,
            columnType: this.#columnTypeManager.getColumnType(col),
            hasValidation: !!config?.validation,
        });
    }
    return {
        active: this.#active,
        autoRuleCount: this.#autoRuleToColumn.size,
        bridgedColumnCount: this.#columnToAutoRule.size,
        details,
    };
}

hasAutoRuleForColumn(col: number): boolean {
    return this.#columnToAutoRule.has(col);
}

getAutoRuleIdForColumn(col: number): string | null {
    return this.#columnToAutoRule.get(col) || null;
}
```

---

## 7. 配置示例

### 7.1 最简配置（仅指定约束）

```typescript
columns: [
    {
        type: "numeric",
        validation: {
            operator: "between",
            value: [0, 100],
        }
        // type 自动推断为 "number"
        // range 自动推断为 "A:A"
        // errorStyle 默认 "stop"
        // errorMessage 由 NumberValidator.buildErrorMessage() 生成
    },
    {
        type: "select",
        options: { source: ["男", "女"] },
        validation: {
            source: ["男", "女"],
        }
        // type 自动推断为 "list"
    },
]
```

### 7.2 完整配置（自定义所有参数）

```typescript
columns: [
    {
        type: "numeric",
        width: 80,
        validation: {
            range: "A2:A20",                    // 跳过表头行
            type: "number",
            operator: "between",
            value: [3, 100],
            errorMessage: "⛔ 编号必须是 1-100 之间的整数",
            errorStyle: "stop",
            inputMessage: "请输入 1-100 之间的整数",
            inputTitle: "编号规则",
        }
    },
    {
        type: "text",
        validation: {
            range: "B2:B20",
            type: "text",
            operator: "lengthBetween",
            value: [3, 10],
            errorMessage: "⛔ 姓名长度必须在 3-10 个字符之间",
            errorStyle: "stop",
        }
    },
    {
        type: "select",
        options: { source: ["技术部", "市场部", "财务部", "人事部", "运营部"] },
        validation: {
            range: "C2:C20",
            type: "list",
            source: ["技术部", "市场部", "财务部", "人事部", "运营部"],
            errorMessage: "⚠️ 请从下拉列表中选择部门",
            errorStyle: "warning",
            inputMessage: "选择部门：技术/市场/财务/人事/运营",
        }
    },
    {
        type: "date",
        validation: {
            range: "F2:F20",
            type: "datetime",
            operator: "between",
            value: ["2020-01-01 00:00:00", "2026-12-31 23:59:59"],
            errorMessage: "⚠️ 请输入 2020-2026 年内的日期时间",
            errorStyle: "warning",
        }
    },
]
```

### 7.3 混合配置（validation + pluginOptions.rules 共存）

```typescript
{
    columns: [
        // 列级验证（validation 子对象）
        { type: "numeric", validation: { operator: "between", value: [0, 100], errorStyle: "stop" } },
        { type: "select", options: { source: ["男", "女"] }, validation: { source: ["男", "女"] } },

        // 无验证的列
        { type: "text" },
    ],
    pluginOptions: {
        dataValidation: {
            conflictStrategy: "short-circuit",
            // 跨列/特殊验证（unique、formula、regex 等无对应列类型）
            rules: [
                { range: "H2:H20", type: "unique", errorMessage: "🚫 唯一编号不能重复！", errorStyle: "stop" },
                { range: "I2:I20", type: "formula", formula: "=I{row}>0", errorMessage: "⛔ 数值必须大于0", errorStyle: "stop" },
                { range: "E2:E20", type: "regex", pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", errorMessage: "⚠️ 请输入有效的邮箱地址", errorStyle: "warning" },
            ]
        }
    }
}
```

### 7.4 向后兼容（不写 validation，使用 options 约束）

```typescript
columns: [
    // 旧行为：options 中的 min/max 仍由列类型 validate() 处理
    // 新行为：桥接器自动推断生成验证规则（如果桥接器激活）
    { type: "numeric", options: { min: 0, max: 100 } },
    { type: "select", options: { source: ["男", "女"] } },
]
```

---

## 8. 映射规则

### 8.1 路径 B：validation 子对象 → ValidationRule（直传）

| `validation` 字段 | ValidationRule 字段 | 默认值推断 |
|-------------------|---------------------|-----------|
| `range` | `range` | `indexToCol(col) + ":" + indexToCol(col)` |
| `type` | `type` | 从列类型推断（numeric→number, select→list, date→date/time/datetime, text→text） |
| `operator` | `operator` | 无默认值，用户必须指定 |
| `value` | `value` | 无默认值，用户必须指定 |
| `source` | `source` | 无默认值（list 类型必须指定） |
| `formula` | `formula` | 无默认值（formula 类型必须指定） |
| `pattern` | `pattern` | 无默认值（regex 类型必须指定） |
| `allowBlank` | `allowBlank` | `true` |
| `showDropdown` | `showDropdown` | `true` |
| `showErrorMessage` | `showErrorMessage` | `true` |
| `errorMessage` | `errorMessage` | `null`（由 Validator.buildErrorMessage() 生成） |
| `errorTitle` | `errorTitle` | `"输入错误"` |
| `errorStyle` | `errorStyle` | `"stop"` |
| `inputMessage` | `inputMessage` | `null` |
| `inputTitle` | `inputTitle` | `"提示"` |
| `priority` | `priority` | `1000` |

### 8.2 向后兼容：列类型 + options → ValidationRule（推断）

| 列类型 | 列配置 options | → ValidationRule | 不映射的 options |
|--------|---------------|------------------|-----------------|
| `numeric` | `{ min, max }` | `{ type: 'number', operator: 'between', value: [min, max] }` | `numericFormat`, `allowInvalid` |
| `numeric` | `{ min }` | `{ type: 'number', operator: 'greaterThanOrEqual', value: min }` | |
| `numeric` | `{ max }` | `{ type: 'number', operator: 'lessThanOrEqual', value: max }` | |
| `select` | `{ source: [...] }` | `{ type: 'list', source: [...] }` | `allowInvalid`, `strict` |
| `select` | `{ source: [{value, label}] }` | `{ type: 'list', source: [value1, value2, ...] }` | |
| `date` | `{ min, max }` | `{ type: 'date', operator: 'between', value: [min, max] }` | `dateFormat` |
| `date` (纯时间) | `{ min, max }` | `{ type: 'time', operator: 'between', value: [min, max] }` | |
| `text` / `textarea` | `{ maxLength }` | `{ type: 'text', operator: 'lessThanOrEqual', value: maxLength }` | |

### 8.3 不映射的列类型

| 列类型 | 原因 |
|--------|------|
| `hyperlink` | 无 URL 格式验证器 |
| `checkbox` | 布尔值无需范围验证 |
| `progressBar` / `starRating` / `sparkline` / `colorPreview` | 渲染器类型，非数据约束 |

### 8.4 `validation.type` 与列 `type` 的关系

| 场景 | 列 `type` | `validation.type` | 合法性 | 说明 |
|------|-----------|-------------------|--------|------|
| 数值列 + 数值验证 | `"numeric"` | `"number"` | ✅ | 语义一致 |
| 数值列 + 正则验证 | `"numeric"` | `"regex"` | ✅ | 如验证手机号格式 |
| 数值列 + 唯一性验证 | `"numeric"` | `"unique"` | ✅ | 如验证编号唯一 |
| 数值列 + 列表验证 | `"numeric"` | `"list"` | ⚠️ | 语义矛盾但技术可行 |
| 文本列 + 公式验证 | `"text"` | `"formula"` | ✅ | 常见 |
| 文本列 + 正则验证 | `"text"` | `"regex"` | ✅ | 常见 |

**结论**：`validation.type` 不必与列 `type` 严格对应，因为验证类型描述"怎么验证"，列类型描述"什么数据"。

---

## 9. 双重验证消除

### 9.1 当前数据流（双重验证）

```
用户输入 150
  │
  ├─① 编辑器层: NumericEditor.validateBeforeCommit()
  │     → sheet.validateCellValue() → ColumnTypeManager → NumericColumnType.validate()
  │     → "数值不能大于 100" → 编辑器阻止提交
  │
  ├─② 策略层: EventHandler → ValidationStrategy.interceptBeforeSetValue()
  │     → DataValidationPlugin.interceptBeforeSetValue()
  │     → ValidationEngine.validateCellSync()
  │     → 无规则（因为没配 rules）→ 通过 ✅
  │
  └─③ 写入成功（但实际应该是无效值）
```

### 9.2 桥接后数据流（单一验证入口）

```
用户输入 150
  │
  ├─① 编辑器层: NumericEditor.validateBeforeCommit()
  │     → sheet.validateCellValue() → ColumnTypeManager
  │     → validation 存在 → 列类型 validate() 降级为仅提示 → 返回 "invalid"（非 false）
  │     → 编辑器允许提交
  │
  ├─② 策略层: EventHandler → ValidationStrategy.interceptBeforeSetValue()
  │     → DataValidationPlugin.interceptBeforeSetValue()
  │     → ValidationEngine.validateCellSync()
  │     → 找到自动规则（number between [0,100]）→ 失败 ❌
  │     → errorStyle: "stop" → 返回 false → 阻止写入
  │     → showErrorTooltip("⛔ 编号必须是 1-100 之间的整数")
  │     → applyErrorStyle() → 无效单元格高亮
  │
  └─③ 写入被阻止 ✅
```

### 9.3 ColumnTypeManager.validateCellValue() 降级逻辑

```typescript
validateCellValue(r: number, c: number, value: unknown): boolean | string {
    const cellType = this.getCellTypeInstance(r, c);
    const config = this.#columnsConfig.get(c);
    const result = validateCellValueInternal(cellType, value, config);

    // 仅当桥接器已接管时才降级
    // 桥接器接管 = DataValidationPlugin 已激活 + 该列有 validation 配置
    // 插件未启用时 bridgeTakenCols 为空 → 不降级 → 列类型 validate() 兜底
    if (config?.validation && this.#bridgeTakenCols.has(c) && result !== true) {
        return typeof result === "string" ? result : "invalid";
    }

    return result;
}
```

**关键**：降级条件 = `validation` 存在 ∧ `bridgeTakenCols.has(c)`。桥接器未激活时（插件未启用），`bridgeTakenCols` 为空集，列类型 `validate()` 正常执行，**验证不会失效**。

---

## 10. 插件未启用时的安全降级

### 10.1 问题场景

当用户配置了 `columns[].validation` 但 **未启用 DataValidationPlugin** 时，存在严重安全隐患：

```
用户配置: { type: "numeric", validation: { operator: "between", value: [0, 100] } }
DataValidationPlugin: ❌ 未加载/未激活

数据流:
  用户输入 150
    │
    ├─① 编辑器层: NumericEditor.validateBeforeCommit()
    │     → ColumnTypeManager.validateCellValue()
    │     → config.validation 存在 → 降级为仅提示 → 返回 "invalid"（非 false）
    │     → 编辑器允许提交 ✅（降级了！）
    │
    ├─② 策略层: DataValidationPlugin.interceptBeforeSetValue()
    │     → 插件不存在 → 无拦截
    │
    └─③ 无效值 150 直接写入 ← 🚨 验证完全失效！
```

**根因**：降级条件 `config?.validation` 仅看配置是否存在，不关心 DataValidationPlugin 是否激活。

### 10.2 解决方案：桥接器驱动的降级标记

**核心思想**：降级不由 `validation` 配置的存在性决定，而由**桥接器是否已接管该列**决定。

ColumnTypeManager 新增 `#bridgeTakenCols: Set<number>`，由桥接器通过显式 API 控制标记：

```
降级条件 = config?.validation 存在  ∧  桥接器已接管该列（col ∈ #bridgeTakenCols）
```

### 10.3 ColumnTypeManager 修改

```typescript
export class ColumnTypeManager {
    #sheet: Sheet;
    #columnsConfig: Map<number, ColumnConfig & Record<string, unknown>> = new Map();
    #cellTypes: Map<string, { name: string; options: Record<string, unknown> }> = new Map();

    /**
     * 桥接器已接管的列集合
     *
     * 仅当列号在此集合中时，validateCellValue() 才降级为仅提示。
     * 由 ColumnTypeValidationBridge 通过 markBridgeTaken/unmarkBridgeTaken 管理。
     */
    #bridgeTakenCols: Set<number> = new Set();

    /**
     * 标记桥接器已接管指定列的验证
     *
     * 调用后，该列的 validateCellValue() 将降级为仅提示（不阻止提交），
     * 验证拦截由 DataValidationPlugin 统一处理。
     *
     * @param col - 列号
     */
    markBridgeTaken(col: number): void {
        this.#bridgeTakenCols.add(col);
    }

    /**
     * 取消桥接器对指定列的接管
     *
     * 调用后，该列的 validateCellValue() 恢复正常行为（阻止无效值提交）。
     *
     * @param col - 列号
     */
    unmarkBridgeTaken(col: number): void {
        this.#bridgeTakenCols.delete(col);
    }

    /**
     * 清除所有桥接器接管标记
     *
     * 用于桥接器停用/销毁时批量恢复列类型验证。
     */
    clearBridgeTaken(): void {
        this.#bridgeTakenCols.clear();
    }

    /**
     * 查询指定列是否被桥接器接管
     */
    isBridgeTaken(col: number): boolean {
        return this.#bridgeTakenCols.has(col);
    }

    /**
     * 验证单元格值
     *
     * 降级逻辑：
     * - validation 存在 + 桥接器已接管 → 仅提示（DataValidationPlugin 负责拦截）
     * - validation 存在 + 桥接器未接管 → 正常阻止（列类型验证兜底）
     * - validation 不存在 → 正常行为
     */
    validateCellValue(r: number, c: number, value: unknown): boolean | string {
        const cellType = this.getCellTypeInstance(r, c);
        const config = this.#columnsConfig.get(c);
        const result = validateCellValueInternal(cellType, value, config);

        // 仅当桥接器已接管时才降级
        if (config?.validation && this.#bridgeTakenCols.has(c) && result !== true) {
            return typeof result === "string" ? result : "invalid";
        }

        return result;
    }
}
```

### 10.4 ColumnTypeValidationBridge 修改

桥接器在添加/移除自动规则时，同步管理接管标记：

```typescript
export class ColumnTypeValidationBridge {
    #active: boolean = false;
    #columnTypeManager: ColumnTypeManager;
    #validationEngine: ValidationEngine;
    #autoRuleToColumn: Map<string, number> = new Map();
    #columnToAutoRule: Map<number, string> = new Map();
    #lastSyncedValidation: Map<number, Record<string, any>> = new Map();
    #defaultErrorStyle: string = "stop";
    #respectManualRules: boolean = true;

    // ...

    /**
     * syncColumn() 修改：添加/移除规则时同步接管标记
     */
    syncColumn(col: number): void {
        if (!this.#active) return;

        const config = this.#columnTypeManager.getColumnConfig(col);
        const currentSnapshot = config ? this.#extractValidationSnapshot(config) : null;
        const lastSnapshot = this.#lastSyncedValidation.get(col) || null;

        if (this.#snapshotEqual(currentSnapshot, lastSnapshot)) return;

        // 移除旧的自动规则 + 取消接管标记
        this.#removeAutoRuleForColumn(col);

        if (config) {
            let rule: ValidationRule | null = null;

            if (config.validation) {
                rule = this.#createRuleFromValidation(col, config);
            } else if (this.#hasBridgeableConstraint(config)) {
                rule = this.#createRuleFromColumnType(col, config);
            }

            if (rule) {
                if (this.#respectManualRules && this.#hasManualRuleForColumn(col, rule.type)) {
                    // 手动规则优先，但仍标记接管（手动规则会拦截）
                    this.#columnTypeManager.markBridgeTaken(col);
                    this.#lastSyncedValidation.set(col, currentSnapshot!);
                    return;
                }

                const ruleId = this.#validationEngine.addRule(rule);
                this.#autoRuleToColumn.set(ruleId, col);
                this.#columnToAutoRule.set(col, ruleId);

                // ✅ 标记桥接器已接管该列
                this.#columnTypeManager.markBridgeTaken(col);
            } else {
                // 无规则生成 → 不接管
                this.#columnTypeManager.unmarkBridgeTaken(col);
            }
        } else {
            // 列配置已删除 → 不接管
            this.#columnTypeManager.unmarkBridgeTaken(col);
        }

        this.#lastSyncedValidation.set(col, currentSnapshot || {});
    }

    /**
     * 移除自动规则时同步取消接管标记
     */
    #removeAutoRuleForColumn(col: number): void {
        const existingRuleId = this.#columnToAutoRule.get(col);
        if (existingRuleId) {
            this.#validationEngine.removeRule(existingRuleId);
            this.#autoRuleToColumn.delete(existingRuleId);
            this.#columnToAutoRule.delete(col);
        }
        // 取消接管标记
        this.#columnTypeManager.unmarkBridgeTaken(col);
    }

    /**
     * 停用桥接器：清除所有规则 + 所有接管标记
     */
    deactivate(): void {
        this.clearAutoGeneratedRules();
        this.#columnTypeManager.clearBridgeTaken();
        this.#active = false;
    }

    /**
     * 销毁桥接器
     */
    destroy(): void {
        this.deactivate();
        (this.#columnTypeManager as any) = null;
        (this.#validationEngine as any) = null;
    }
}
```

### 10.5 各场景数据流

#### 场景 A：正常（validation + DataValidationPlugin 激活）

```
用户输入 150
  │
  ├─① 编辑器: validateCellValue()
  │     → config.validation ✓ + bridgeTaken ✓ → 降级仅提示 → 返回 "invalid"
  │     → 编辑器允许提交
  │
  ├─② 策略层: DataValidationPlugin.interceptBeforeSetValue()
  │     → ValidationEngine.validateCellSync() → number between [0,100] → 失败 ❌
  │     → errorStyle: "stop" → 阻止写入 + showErrorTooltip
  │
  └─③ 写入被阻止 ✅
```

#### 场景 B：插件未启用（validation 存在 + DataValidationPlugin 未加载）

```
用户输入 150
  │
  ├─① 编辑器: validateCellValue()
  │     → config.validation ✓ + bridgeTaken ✗ → 不降级 → 正常验证
  │     → NumericColumnType.validate() → "数值不能大于 100" → 返回错误字符串
  │     → 编辑器阻止提交 ❌
  │
  └─② 值未写入 ✅（列类型验证兜底）
```

#### 场景 C：插件运行时卸载

```
DataValidationPlugin.destroy() 调用
  → bridge.deactivate()
  → bridge.clearAutoGeneratedRules()
  → columnTypeManager.clearBridgeTaken()    ← 所有列恢复列类型验证
  → 后续验证由列类型 validate() 兜底 ✅
```

#### 场景 D：插件延迟加载

```
t0: 用户配置 { type: "numeric", validation: { operator: "between", value: [0, 100] } }
    → DataValidationPlugin 未加载
    → bridgeTaken = ∅
    → 列类型 validate() 正常阻止 ✅

t1: DataValidationPlugin 加载并 init()
    → bridge.activate()
    → syncFromColumnConfig() → 生成自动规则 + markBridgeTaken(0)
    → 后续验证由 DataValidationPlugin 接管 ✅
```

### 10.6 开发者警告

当 `validation` 存在但 DataValidationPlugin 未启用时，在开发模式下输出控制台警告：

```typescript
// ColumnTypeManager.applyColumnsConfig() 末尾
applyColumnsConfig(columnsConfig: ...): void {
    // ... 现有逻辑 ...

    // 开发模式警告：validation 配置但插件未启用
    if (process.env.NODE_ENV !== 'production') {
        const hasValidation = this.#columnsConfig.values().some(c => c.validation);
        if (hasValidation && !this.#bridgeTakenCols.size) {
            console.warn(
                '[ColumnTypeManager] 检测到 columns[].validation 配置，' +
                '但 DataValidationPlugin 未启用。验证将由列类型 validate() 兜底，' +
                '无法使用错误提示弹框、无效高亮、验证图标等高级功能。' +
                '建议启用 DataValidationPlugin 以获得完整验证体验。'
            );
        }
    }
}
```

### 10.7 功能差异对比

| 功能 | validation + 插件激活 | validation + 插件未启用 | 无 validation |
|------|:--------------------:|:---------------------:|:------------:|
| 值写入前拦截 | ✅ DataValidationPlugin | ✅ 列类型 validate() | ✅ 列类型 validate() |
| 阻止无效值写入 | ✅ errorStyle: "stop" | ✅ 编辑器阻止 | ✅ 编辑器阻止 |
| 错误提示弹框 | ✅ Portal 气泡 | ❌ 仅编辑器红色边框 | ❌ 仅编辑器红色边框 |
| 无效单元格高亮 | ✅ 条件格式 | ❌ | ❌ |
| 验证图标 (✓/❌) | ✅ | ❌ | ❌ |
| 下拉箭头图标 | ✅ | ❌ | ❌ |
| 输入提示 | ✅ inputMessage | ❌ | ❌ |
| errorStyle: "warning" | ✅ 允许写入+警告 | ❌ 退化为阻止 | ❌ |
| errorStyle: "information" | ✅ 仅提示 | ❌ 退化为阻止 | ❌ |
| 自定义 errorMessage | ✅ | ❌ 使用列类型默认消息 | ❌ |
| 跨列验证 (unique/formula) | ✅ pluginOptions.rules | ❌ | ❌ |

**结论**：插件未启用时，**基本验证能力不丢失**（列类型兜底），但高级 UI 能力不可用。这是合理的降级——用户只需启用 DataValidationPlugin 即可解锁全部能力。

---

## 11. 冲突解决策略

### 11.1 手动规则 vs 自动规则

**原则：手动规则始终优先**

| 场景 | 处理方式 |
|------|---------|
| 列有 `validation` + `pluginOptions.rules` 同类规则 | `validation` 不生成自动规则，手动规则生效 |
| 列有 `validation` + `pluginOptions.rules` 不同类规则 | 两者共存（如 number + unique） |
| 手动规则被移除 | 桥接器检测后回补 `validation` 自动规则 |

### 11.2 优先级设计

```
手动规则（pluginOptions.rules）  priority = 0（默认）
自动规则（validation 桥接生成）  priority = 1000

短路策略下：手动规则先执行，失败即停，自动规则不执行
```

### 11.3 去重判定逻辑

```typescript
#hasManualRuleForColumn(col: number, validationType: string): boolean {
    const rules = this.#validationEngine.getRulesForCell(0, col);
    return rules.some(
        (rule: any) => rule.type === validationType && rule.metadata?.source !== BRIDGE_SOURCE
    );
}
```

---

## 12. 同步时机与生命周期

### 12.1 同步触发点

| 触发点 | 同步方式 | 调用方法 |
|--------|---------|---------|
| `applyColumnsConfig()` 后 | 全量同步 | `syncFromColumnConfig()` |
| Sheet 切换后 | 全量同步 | `syncFromColumnConfig()` |
| 桥接器初始化 | 全量同步 | `syncFromColumnConfig()` |
| 桥接器停用 | 清除 | `clearAutoGeneratedRules()` |
| 手动规则移除 | 回补 | `onManualRuleRemoved()` |

### 12.2 全量同步流程

```
syncFromColumnConfig()
        │
        ↓
  ┌─ 遍历所有列配置 ──────────────────────────────────────────┐
  │                                                          │
  │  对每列 col:                                              │
  │    1. 读取 columnsConfig.get(col)                         │
  │    2. 提取 validation 快照，与上次对比                      │
  │       ├─ 未变 → 跳过（增量优化）                           │
  │       └─ 已变 → 继续                                      │
  │    3. 移除该列旧的自动规则                                  │
  │    4. 判断配置模式：                                        │
  │       ├─ 有 validation → #createRuleFromValidation()       │
  │       ├─ 有可桥接约束 → #createRuleFromColumnType()        │
  │       └─ 无约束 → 跳过                                     │
  │    5. 检查手动规则冲突                                      │
  │       ├─ 有同类手动规则 → 跳过                              │
  │       └─ 无冲突 → 继续                                     │
  │    6. 添加到 ValidationEngine                              │
  │    7. 更新映射表和快照                                      │
  └──────────────────────────────────────────────────────────┘
        │
        ↓
  清理已删除列的规则
```

---

## 13. 与现有系统的集成

### 13.1 DataValidationPlugin 修改

**文件**: `src/plugins/dataValidation/DataValidationPlugin.ts`

```typescript
// 新增导入
import { ColumnTypeValidationBridge } from "./ColumnTypeValidationBridge.js";

// 新增私有字段
#bridge: ColumnTypeValidationBridge | null = null;
#bridgeConfigChangeUnsubscribe: (() => void) | null = null;

// init() 末尾添加（this.#active = true 之前）
if (options.bridgeColumnType !== false) {
    const columnTypeManager = (this as any).sheet?.typeManager;
    if (columnTypeManager && this.#engine) {
        this.#bridge = new ColumnTypeValidationBridge(
            columnTypeManager,
            this.#engine,
            {
                defaultErrorStyle: options.bridgeOptions?.defaultErrorStyle || "stop",
                respectManualRules: options.bridgeOptions?.respectManualRules !== false,
            }
        );
        this.#bridge.activate();

        // 监听列配置变更事件
        const sheet = (this as any).sheet;
        if (sheet?.bus) {
            this.#bridgeConfigChangeUnsubscribe = sheet.bus.on(
                SHEET_EVENTS.COLUMN_CONFIG_CHANGED,
                () => { this.#bridge?.syncFromColumnConfig(); }
            );
        }
    }
}

// 新增 getter
get bridge(): ColumnTypeValidationBridge | null {
    return this.#bridge;
}

// destroy() 中添加
if (this.#bridgeConfigChangeUnsubscribe) {
    this.#bridgeConfigChangeUnsubscribe();
    this.#bridgeConfigChangeUnsubscribe = null;
}
if (this.#bridge) {
    this.#bridge.destroy();
    this.#bridge = null;
}

// #onSheetSwitched() 中重建桥接器
if (this.#bridge) {
    this.#bridge.destroy();
    this.#bridge = null;
}
const columnTypeManager = newSheet.typeManager;
if (columnTypeManager && this.#engine) {
    this.#bridge = new ColumnTypeValidationBridge(
        columnTypeManager,
        this.#engine,
        { defaultErrorStyle: this.#defaultErrorStyle }
    );
    this.#bridge.activate();
}

// removeValidation() 中添加回补逻辑
if (success && rule.metadata?.source !== BRIDGE_SOURCE) {
    const col = /* 从 rule.range 解析列号 */;
    if (col !== -1 && this.#bridge) {
        this.#bridge.onManualRuleRemoved(col, rule.type);
    }
}
```

### 13.2 ColumnTypeManager 修改

**文件**: `src/workbook/managers/ColumnTypeManager.ts`

```typescript
// 新增私有字段
#bridgeTakenCols: Set<number> = new Set();

// 新增公共方法
markBridgeTaken(col: number): void { this.#bridgeTakenCols.add(col); }
unmarkBridgeTaken(col: number): void { this.#bridgeTakenCols.delete(col); }
clearBridgeTaken(): void { this.#bridgeTakenCols.clear(); }
isBridgeTaken(col: number): boolean { return this.#bridgeTakenCols.has(col); }

// applyColumnsConfig() 末尾添加事件发射
import { SHEET_EVENTS } from "../../constants/sheetEvents.js";

applyColumnsConfig(columnsConfig: (Record<string, unknown> | ((col: number) => Record<string, unknown>))[]): void {
    // ... 现有逻辑 ...

    // 新增：通知桥接器同步
    this.#sheet.bus?.emit(SHEET_EVENTS.COLUMN_CONFIG_CHANGED, {
        columnsConfig: this.#columnsConfig,
    });
}

// validateCellValue() 降级处理（桥接器驱动）
validateCellValue(r: number, c: number, value: unknown): boolean | string {
    const cellType = this.getCellTypeInstance(r, c);
    const config = this.#columnsConfig.get(c);
    const result = validateCellValueInternal(cellType, value, config);

    // 仅当桥接器已接管时才降级（插件未启用时不降级，列类型验证兜底）
    if (config?.validation && this.#bridgeTakenCols.has(c) && result !== true) {
        return typeof result === "string" ? result : "invalid";
    }

    return result;
}
```

### 13.3 SheetEvents 扩展

**文件**: `src/constants/sheetEvents.ts`

```typescript
// SheetEvents 接口新增
readonly COLUMN_CONFIG_CHANGED: "sheet:column-config-changed";

// SHEET_EVENTS 对象新增
COLUMN_CONFIG_CHANGED: "sheet:column-config-changed",

// EVENT_FLOW_REGISTRY 新增
[SHEET_EVENTS.COLUMN_CONFIG_CHANGED]: {
    emitters: ["ColumnTypeManager"],
    listeners: ["DataValidationPlugin"]
},
```

### 13.4 导出

**文件**: `src/plugins/dataValidation/index.ts`

```typescript
export { ColumnTypeValidationBridge } from "./ColumnTypeValidationBridge.js";
```

---

## 14. 编辑器即时反馈增强

### 14.1 问题

降级后，编辑器的 `validateBeforeCommit()` 不再阻止提交，用户必须等值提交后才能看到错误提示。

### 14.2 解决方案

在编辑器的 `validateBeforeCommit()` 中，同时调用 DataValidationPlugin 的同步验证：

```typescript
// NumericEditor.validateBeforeCommit()
validateBeforeCommit(newValue: unknown): boolean {
    // 1. 列类型即时提示（不阻止，仅显示红色边框等）
    const typeResult = this.sheet!.validateCellValue(this.activeRow, this.activeCol, newValue);

    // 2. DataValidation 同步验证（决定是否阻止）
    const dvPlugin = (this.sheet as any)?.getPlugin?.("dataValidation");
    if (dvPlugin?.active && dvPlugin.engine) {
        const dvResult = dvPlugin.engine.validateCellSync(this.activeRow, this.activeCol, newValue);
        if (dvResult && !dvResult.valid && dvResult.errorStyle === "stop") {
            // 显示错误提示（不等待写入）
            dvPlugin.uiController?.showErrorTooltip(
                this.activeRow, this.activeCol,
                dvResult.message || "输入值无效",
                dvResult.errorStyle || "stop"
            );
            return false;
        }
    }

    return typeResult !== false;
}
```

**可行性**：`ValidationEngine.validateCellSync()` 是同步方法，可在编辑器中调用，无性能问题。

### 14.3 需修改的编辑器

| 编辑器 | 文件 | 修改方式 |
|--------|------|---------|
| NumericEditor | `src/editor/editors/NumericEditor.ts` | 增强 `validateBeforeCommit()` |
| SelectEditor | `src/editor/editors/SelectEditor.ts` | 增强 `validateBeforeCommit()` |
| DateEditor | `src/editor/editors/DateEditor.ts` | 增强 `validateBeforeCommit()` |
| CellEditor（基类） | `src/editor/editors/CellEditor.ts` | 可选：在基类中提供通用增强方法 |

---

## 15. 性能考量

### 15.1 同步开销

| 操作 | 复杂度 | 说明 |
|------|--------|------|
| `syncFromColumnConfig()` | O(C) | C = 列数，通常 < 100 |
| `syncColumn(col)` | O(R) | R = 该列的规则数，通常 1-2 |
| `#createRuleFromValidation()` | O(1) | 纯对象构造，无 IO |
| `#createRuleFromColumnType()` | O(1) | 纯映射，无 IO |
| `#hasManualRuleForColumn()` | O(R) | R = 该列的规则数 |

### 15.2 增量同步优化

通过 `#lastSyncedValidation` 快照对比，避免配置未变时的重复生成。

### 15.3 内存开销

- `#autoRuleToColumn`：每列一条映射，< 100 条
- `#columnToAutoRule`：每列一条映射，< 100 条
- `#lastSyncedValidation`：每列一份快照，< 100 份

总计：可忽略不计

---

## 16. 测试策略

### 16.1 单元测试 — 路径 B（validation 子对象）

| # | 测试用例 | 描述 |
|---|---------|------|
| 1 | `test_validation_numeric_between` | `validation: { operator: "between", value: [0, 100] }` → number between 规则 |
| 2 | `test_validation_numeric_gte` | `validation: { operator: "greaterThanOrEqual", value: 0 }` → number gte 规则 |
| 3 | `test_validation_numeric_custom_message` | 自定义 errorMessage 正确传递 |
| 4 | `test_validation_numeric_custom_errorStyle` | 自定义 errorStyle: "warning" 正确传递 |
| 5 | `test_validation_numeric_custom_range` | 自定义 range: "A2:A20" 正确传递 |
| 6 | `test_validation_list_source` | `validation: { source: [...] }` → list 规则 |
| 7 | `test_validation_date_between` | `validation: { type: "date", operator: "between", value: [...] }` → date 规则 |
| 8 | `test_validation_datetime_between` | `validation: { type: "datetime", operator: "between", value: [...] }` → datetime 规则 |
| 9 | `test_validation_text_length` | `validation: { type: "text", operator: "lengthBetween", value: [3, 10] }` → text 规则 |
| 10 | `test_validation_regex_pattern` | `validation: { type: "regex", pattern: "..." }` → regex 规则 |
| 11 | `test_validation_formula` | `validation: { type: "formula", formula: "=A1>0" }` → formula 规则 |
| 12 | `test_validation_unique` | `validation: { type: "unique" }` → unique 规则 |
| 13 | `test_validation_type_infer_numeric` | 省略 type 时，numeric 列自动推断为 "number" |
| 14 | `test_validation_type_infer_select` | 省略 type 时，select 列自动推断为 "list" |
| 15 | `test_validation_type_infer_date` | 省略 type 时，date 列自动推断为 "date" |
| 16 | `test_validation_range_infer` | 省略 range 时，自动推断为整列 "A:A" |
| 17 | `test_validation_priority_default` | 省略 priority 时，默认 1000 |
| 18 | `test_validation_errorStyle_default` | 省略 errorStyle 时，默认 "stop" |

### 16.2 单元测试 — 向后兼容（options 推断）

| # | 测试用例 | 描述 |
|---|---------|------|
| 19 | `test_compat_numeric_min_max` | `options: { min: 0, max: 100 }` → number between 规则 |
| 20 | `test_compat_select_source` | `options: { source: [...] }` → list 规则 |
| 21 | `test_compat_date_min_max` | `options: { min, max }` → date 规则 |
| 22 | `test_compat_text_maxLength` | `options: { maxLength: 50 }` → text 规则 |

### 16.3 单元测试 — 冲突与生命周期

| # | 测试用例 | 描述 |
|---|---------|------|
| 23 | `test_manual_rule_priority` | 手动规则存在时不生成自动规则 |
| 24 | `test_manual_rule_removed_fallback` | 手动规则移除后自动补充规则 |
| 25 | `test_config_change_resync` | 列配置变更后规则自动更新 |
| 26 | `test_bridge_deactivate` | 停用桥接器后自动规则全部移除 |
| 27 | `test_bridge_destroy` | 销毁桥接器后无内存泄漏 |
| 28 | `test_incremental_sync_skip_unchanged` | 配置未变时不重复生成 |
| 29 | `test_metadata_source_tag` | 自动规则带有 metadata.source = "column-validation" |
| 30 | `test_no_bridgeable_config` | 无 validation 且无可桥接约束时不生成规则 |

### 16.4 集成测试

| # | 测试用例 | 描述 |
|---|---------|------|
| 31 | `test_applyColumnsConfig_triggers_sync` | applyColumnsConfig 后桥接器自动同步 |
| 32 | `test_sheet_switch_resync` | Sheet 切换后桥接器重新同步 |
| 33 | `test_double_validation_eliminated` | validation 存在时不再双重验证 |
| 34 | `test_validation_plugin_uses_auto_rule` | 验证插件正确使用自动生成的规则 |
| 35 | `test_editor_instant_feedback` | 编辑器中调用 validateCellSync 获取即时反馈 |
| 36 | `test_ui_tooltip_shown` | 验证失败时 showErrorTooltip 被调用 |
| 37 | `test_ui_error_style_applied` | 验证失败时条件格式高亮被应用 |
| 38 | `test_backward_compat_no_validation` | 不写 validation 时行为与 v1.0 一致 |

### 16.5 单元测试 — 插件未启用安全降级

| # | 测试用例 | 描述 |
|---|---------|------|
| 39 | `test_no_plugin_column_type_fallback` | 插件未启用时，列类型 validate() 正常阻止无效值 |
| 40 | `test_no_plugin_no_bridge_taken` | 插件未启用时，bridgeTakenCols 为空 |
| 41 | `test_plugin_activate_marks_bridge_taken` | 插件激活后，有 validation 的列被 markBridgeTaken |
| 42 | `test_plugin_deactivate_clears_bridge_taken` | 插件停用后，clearBridgeTaken 被调用 |
| 43 | `test_plugin_lazy_load_transition` | 插件延迟加载：t0 列类型兜底 → t1 插件激活后桥接接管 |
| 44 | `test_dev_warning_without_plugin` | 开发模式下，validation 存在但插件未启用时输出 console.warn |

---

## 17. 验收标准

| # | 验收项 | 状态 |
|---|--------|------|
| 1 | `validation` 子对象正确生成 ValidationRule | ⬜ |
| 2 | 省略 `validation.type` 时自动推断正确 | ⬜ |
| 3 | 省略 `validation.range` 时自动推断为整列 | ⬜ |
| 4 | 自定义 `errorMessage` 正确传递 | ⬜ |
| 5 | 自定义 `errorStyle` 正确传递 | ⬜ |
| 6 | 自定义 `range` 正确传递 | ⬜ |
| 7 | 向后兼容：`options` 约束仍能推断生成规则 | ⬜ |
| 8 | `validation` 存在 + 桥接器接管时列类型 `validate()` 降级为仅提示 | ⬜ |
| 9 | DataValidationPlugin 统一拦截和 UI 反馈 | ⬜ |
| 10 | 手动规则存在时不生成同类自动规则 | ⬜ |
| 11 | 手动规则移除后自动补充规则 | ⬜ |
| 12 | 列配置变更后规则自动更新 | ⬜ |
| 13 | 桥接器停用后自动规则全部移除 | ⬜ |
| 14 | 自动规则带有 `metadata.source` 标记 | ⬜ |
| 15 | 自动规则 `priority=1000` | ⬜ |
| 16 | 增量同步：配置未变时不重复生成 | ⬜ |
| 17 | 编辑器即时反馈：`validateBeforeCommit` 调用 `validateCellSync` | ⬜ |
| 18 | 不写 `validation` 时行为与 v1.0 完全一致 | ⬜ |
| 19 | **插件未启用时列类型 validate() 正常阻止无效值（兜底）** | ⬜ |
| 20 | **桥接器激活时 markBridgeTaken，停用时 clearBridgeTaken** | ⬜ |
| 21 | **插件延迟加载：t0 列类型兜底 → t1 桥接接管** | ⬜ |
| 22 | **开发模式下 validation 存在但插件未启用时输出 console.warn** | ⬜ |

---

## 18. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 列配置频繁变更导致规则频繁重建 | 性能 | 低 | 增量同步 + 快照对比 + 防抖 |
| `validation.type` 与列 `type` 语义矛盾 | 用户困惑 | 中 | 文档明确说明 + JSDoc 注释 + 运行时 warn |
| 手动规则与自动规则类型相同但约束不同 | 语义混淆 | 中 | 手动优先 + 文档说明 + `getBridgeStatus()` 可查询 |
| 桥接器初始化时序问题（验证插件未就绪） | 功能异常 | 低 | 桥接器在验证插件 init 完成后激活 |
| `range: "A2:A"` 半开放范围不支持 | 功能限制 | 低 | MVP 仅支持完整范围和整列，后续扩展 |
| 编辑器 `validateBeforeCommit` 中调用 `validateCellSync` 性能 | 性能 | 低 | 同步方法，无 IO，微秒级 |
| 列配置使用函数式配置 `config = fn(col)` | 解析失败 | 低 | 桥接器在 `applyColumnsConfig` 解析后读取已解析的 `columnsConfig` |
| `ColumnConfig` 接口变更导致类型不兼容 | 编译错误 | 低 | `validation` 为可选字段，且已有 `[key: string]: unknown` 索引签名 |
| **`validation` 配置但 DataValidationPlugin 未启用** | **验证降级为列类型兜底，高级 UI 不可用** | **中** | **列类型 validate() 自动兜底 + 开发模式 console.warn + 文档说明** |
| **插件运行时卸载后接管标记未清除** | **列类型验证仍被降级** | **低** | **bridge.deactivate() 调用 clearBridgeTaken()** |

---

## 19. 迁移指南

### 19.1 从 v1.0（纯 options 约束）迁移到 v2.0（validation 子对象）

**无需迁移**：v2.0 完全向后兼容。不写 `validation` 时行为与 v1.0 一致。

**推荐逐步迁移**：

```typescript
// Step 1: 现有配置不变（向后兼容）
columns: [{ type: "numeric", options: { min: 0, max: 100 } }]

// Step 2: 添加 validation 子对象，获得完全控制
columns: [{
    type: "numeric",
    options: { numericFormat: { pattern: "0,0.00" } },  // 仅保留非验证相关 options
    validation: {
        operator: "between",
        value: [0, 100],
        errorMessage: "⛔ 数值必须在 0-100 之间",
        errorStyle: "stop",
    }
}]

// Step 3: 可选 - 移除 options 中的验证相关字段
columns: [{
    type: "numeric",
    options: { numericFormat: { pattern: "0,0.00" } },  // min/max 已移到 validation
    validation: { operator: "between", value: [0, 100], errorMessage: "⛔ 数值必须在 0-100 之间" }
}]
```

### 19.2 从 `pluginOptions.rules` 迁移到 `columns[].validation`

**原则**：列级验证迁移到 `validation`，跨列/特殊验证保留在 `rules`。

| 验证类型 | 迁移目标 |
|---------|---------|
| number / text / list / date / time / datetime | → `columns[].validation` |
| regex（列级） | → `columns[].validation` |
| unique | 保留在 `pluginOptions.rules`（跨行语义） |
| formula | 保留在 `pluginOptions.rules`（复杂逻辑） |
| regex（跨列） | 保留在 `pluginOptions.rules` |

---

## 附录 A: 向后兼容推断规则实现

```typescript
#inferNumericRule(col: number, range: string, options: Record<string, any>): ValidationRule | null {
    const hasMin = options.min !== undefined && options.min !== null;
    const hasMax = options.max !== undefined && options.max !== null;
    if (!hasMin && !hasMax) return null;

    let operator: string, value: any, errorMessage: string;
    if (hasMin && hasMax) {
        operator = "between"; value = [options.min, options.max];
        errorMessage = `数值必须在 ${options.min} 到 ${options.max} 之间`;
    } else if (hasMin) {
        operator = "greaterThanOrEqual"; value = options.min;
        errorMessage = `数值不能小于 ${options.min}`;
    } else {
        operator = "lessThanOrEqual"; value = options.max;
        errorMessage = `数值不能大于 ${options.max}`;
    }

    return new ValidationRule({
        range, type: "number", operator, value, errorMessage,
        errorStyle: this.#defaultErrorStyle, priority: AUTO_RULE_PRIORITY,
        metadata: { source: BRIDGE_SOURCE, columnType: "numeric", column: col, generatedAt: Date.now() },
    });
}

#inferSelectRule(col: number, range: string, options: Record<string, any>): ValidationRule | null {
    const source = options.source;
    if (!Array.isArray(source) || source.length === 0) return null;

    let validValues: any[];
    if (typeof source[0] === "object" && source[0] !== null && "value" in source[0]) {
        validValues = source.map((item: any) => item.value).filter((v: any) => v !== undefined && v !== null);
    } else {
        validValues = [...source];
    }
    if (validValues.length === 0) return null;

    return new ValidationRule({
        range, type: "list", source: validValues, showDropdown: true,
        errorMessage: "请从下拉列表中选择有效选项",
        errorStyle: this.#defaultErrorStyle, priority: AUTO_RULE_PRIORITY,
        metadata: { source: BRIDGE_SOURCE, columnType: "select", column: col, generatedAt: Date.now() },
    });
}

#inferDateRule(col: number, range: string, options: Record<string, any>): ValidationRule | null {
    const hasMin = options.min !== undefined && options.min !== null;
    const hasMax = options.max !== undefined && options.max !== null;
    if (!hasMin && !hasMax) return null;

    const pattern = options.dateFormat?.pattern || "YYYY-MM-DD";
    const isTimeOnly = /^[Hhms: ]+$/.test(pattern);
    const validationType = isTimeOnly ? "time" : "date";
    const label = isTimeOnly ? "时间" : "日期";

    let operator: string, value: any, errorMessage: string;
    if (hasMin && hasMax) {
        operator = "between"; value = [options.min, options.max];
        errorMessage = `${label}必须在 ${options.min} 到 ${options.max} 之间`;
    } else if (hasMin) {
        operator = "greaterThanOrEqual"; value = options.min;
        errorMessage = `${label}不能早于 ${options.min}`;
    } else {
        operator = "lessThanOrEqual"; value = options.max;
        errorMessage = `${label}不能晚于 ${options.max}`;
    }

    return new ValidationRule({
        range, type: validationType, operator, value, errorMessage,
        errorStyle: this.#defaultErrorStyle, priority: AUTO_RULE_PRIORITY,
        metadata: { source: BRIDGE_SOURCE, columnType: "date", column: col, generatedAt: Date.now() },
    });
}

#inferTextRule(col: number, range: string, options: Record<string, any>): ValidationRule | null {
    const maxLength = options.maxLength;
    if (maxLength === undefined || maxLength === null) return null;

    return new ValidationRule({
        range, type: "text", operator: "lessThanOrEqual", value: maxLength,
        errorMessage: `文本长度不能超过 ${maxLength} 个字符`,
        errorStyle: this.#defaultErrorStyle, priority: AUTO_RULE_PRIORITY,
        metadata: { source: BRIDGE_SOURCE, columnType: "text", column: col, generatedAt: Date.now() },
    });
}
```

---

## 附录 B: 配置选项

```typescript
// DataValidationPlugin 初始化选项
const pluginOptions = {
    dataValidation: {
        // 桥接器配置
        bridgeColumnType: true,          // 是否启用列类型桥接（默认 true）

        // 桥接器高级选项
        bridgeOptions: {
            defaultErrorStyle: "stop",   // 自动规则默认错误样式
            respectManualRules: true,    // 手动规则优先（默认 true）
        },

        // 手动规则（不受桥接影响，用于 unique/formula/regex 等特殊类型）
        rules: [
            { range: "H2:H20", type: "unique", errorMessage: "🚫 不能重复", errorStyle: "stop" },
            { range: "I2:I20", type: "formula", formula: "=I{row}>0", errorMessage: "⛔ 必须大于0", errorStyle: "stop" },
        ]
    }
};
```

---

## 附录 C: 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| **新增** | `src/plugins/dataValidation/ColumnTypeValidationBridge.ts` | 桥接器核心类 |
| **修改** | `src/plugins/dataValidation/DataValidationPlugin.ts` | 集成桥接器，新增 `#bridge` 字段和事件监听，导出时排除自动规则 |
| **修改** | `src/plugins/dataValidation/ValidationRule.ts` | 新增 `ValidationRuleMetadata` 接口和 `metadata` 可选字段 |
| **修改** | `src/plugins/dataValidation/index.ts` | 导出 `ColumnTypeValidationBridge` |
| **修改** | `src/constants/sheetEvents.ts` | 新增 `COLUMN_CONFIG_CHANGED` 事件 |
| **修改** | `src/workbook/managers/ColumnTypeManager.ts` | `applyColumnsConfig()` 发出事件，`validateCellValue()` 桥接器驱动降级，新增 `#bridgeTakenCols` + `markBridgeTaken/unmarkBridgeTaken/clearBridgeTaken/isBridgeTaken` |
| **修改** | `src/workbook/interfaces/ISheet.ts` | 新增 `ColumnValidationConfig` 接口，`ColumnConfig` 新增 `validation` 字段 |
| **修改** | `src/editor/editors/NumericEditor.ts` | 增强 `validateBeforeCommit()` |
| **修改** | `src/editor/editors/SelectEditor.ts` | 增强 `validateBeforeCommit()` |
| **修改** | `src/editor/editors/DateEditor.ts` | 增强 `validateBeforeCommit()` |
| **新增** | `tests/plugins/dataValidation/ColumnTypeValidationBridge.test.ts` | 单元测试 |

总计 **2 个新文件** + **9 个修改文件**，对 `ValidationEngine`、`BaseColumnType`、各 Validator **零侵入**。

---

## 附录 D: 边界场景与补充设计

### D1: `validation` + `options` 约束共存

当列配置同时包含 `validation` 子对象和 `options` 中的验证相关约束时：

```typescript
{
    type: "numeric",
    options: { min: 0, max: 100, numericFormat: { pattern: "0,0.00" } },
    validation: { operator: "between", value: [0, 50] }
}
```

**规则**：`validation` 子对象 **完全覆盖** `options` 中的验证约束，桥接器仅使用 `validation`。

| 字段来源 | 是否生效 | 说明 |
|---------|:-------:|------|
| `options.min/max` | ❌ | 被 `validation` 覆盖，不生成推断规则 |
| `validation.operator/value` | ✅ | 路径 B 直传，生成 `number between [0, 50]` |
| `options.numericFormat` | ✅ | 非验证约束，仍由列类型使用（格式化显示） |

**实现**：`syncColumn()` 中 `config.validation` 分支优先，不进入 `#hasBridgeableConstraint()` 分支。

**开发模式警告**：

```typescript
if (process.env.NODE_ENV !== 'production') {
    if (config.validation && this.#hasBridgeableConstraint(config)) {
        console.warn(
            `[ColumnTypeValidationBridge] 列 ${col} 同时配置了 validation 和 options 中的验证约束，` +
            `options 中的验证约束将被忽略。建议移除 options 中的 min/max 等字段。`
        );
    }
}
```

### D2: `ColumnConfig.validator` 函数与 `validation` 共存

`ColumnConfig` 已有 `validator?: (value: unknown) => boolean | string` 字段，与 `validation` 的交互：

| 场景 | `validator` | `validation` | 执行顺序 |
|------|:-:|:-:|---------|
| A | ✓ | ✓ | ① `validator()` → ② DataValidationPlugin 拦截 |
| B | ✓ | ✗ | ① `validator()` → ② 列类型 `validate()` |
| C | ✗ | ✓ | ① DataValidationPlugin 拦截 |
| D | ✗ | ✗ | ① 列类型 `validate()` |

**规则**：`validator` 函数始终 **先于** 验证插件/列类型验证执行（编辑器层最早拦截）。

**降级影响**：当 `validation` 存在且桥接器接管时，列类型 `validate()` 降级为仅提示，但 `validator` 函数不受影响——它不是列类型验证的一部分，而是用户自定义的前置拦截。

### D3: `ValidationRule.metadata` 字段承载

当前 `ValidationRule` 类通过 `Object.assign(this, options)` 构造，`metadata` 不在类型定义中但会被赋值到实例上。

**方案**：扩展 `ValidationRule` 接口声明（零侵入核心逻辑）：

```typescript
// src/plugins/dataValidation/ValidationRule.ts
export interface ValidationRuleMetadata {
    source?: string;
    columnType?: string;
    column?: number;
    generatedAt?: number;
}

export class ValidationRule {
    // ... 现有字段 ...

    /**
     * 规则元数据（v2.1 新增）
     *
     * 桥接器自动生成的规则带有 metadata.source = "column-validation"，
     * 手动规则无此字段（或 source 为其他值）。
     */
    metadata?: ValidationRuleMetadata;

    constructor(options: Record<string, any>) {
        Object.assign(this, options);  // metadata 通过此行赋值
    }
}
```

**影响**：仅新增接口和可选字段，不改变现有行为。`metadata` 不参与验证逻辑，仅用于标识和查询。

### D4: 列移动/插入/删除时的映射更新

当工作表发生列结构变更时，`#columnToAutoRule`、`#autoRuleToColumn`、`#bridgeTakenCols` 和 `#lastSyncedValidation` 中的列号映射需要同步更新。

| 操作 | 影响范围 | 处理策略 |
|------|---------|---------|
| **列插入** (在 col 位置插入) | col 及右侧所有列 | 右移映射：`col → col+1`，触发 `COLUMN_CONFIG_CHANGED` → 全量同步 |
| **列删除** (删除 col) | col 及右侧所有列 | 先移除 col 的规则+接管标记，左移映射：`col+1 → col`，触发全量同步 |
| **列移动** (from → to) | from 和 to 之间的列 | 先移除 from 的规则，重建 to 的规则，中间列映射平移 |

**实现**：监听 `COLUMN_INSERT`、`COLUMN_DELETE`、`COLUMN_MOVE` 事件：

```typescript
// ColumnTypeValidationBridge 构造函数中
this.#bindColumnStructureListeners(sheet);

#bindColumnStructureListeners(sheet: Sheet): void {
    const bus = sheet.bus;
    if (!bus) return;

    bus.on(SHEET_EVENTS.COLUMN_INSERTED, (e: { col: number }) => {
        this.#shiftColumnMappings(e.col, +1);
    });

    bus.on(SHEET_EVENTS.COLUMN_DELETED, (e: { col: number }) => {
        this.#removeAutoRuleForColumn(e.col);
        this.#shiftColumnMappings(e.col, -1);
    });

    bus.on(SHEET_EVENTS.COLUMN_MOVED, (e: { from: number; to: number }) => {
        this.#removeAutoRuleForColumn(e.from);
        this.syncColumn(e.to);
    });
}

/**
 * 平移列号映射（插入/删除后）
 *
 * @param pivot - 变更位置
 * @param delta - +1（插入）或 -1（删除）
 */
#shiftColumnMappings(pivot: number, delta: number): void {
    // #columnToAutoRule
    const entries = [...this.#columnToAutoRule.entries()];
    this.#columnToAutoRule.clear();
    for (const [col, ruleId] of entries) {
        this.#columnToAutoRule.set(col >= pivot ? col + delta : col, ruleId);
    }

    // #autoRuleToColumn（反向映射同步更新）
    for (const [ruleId, col] of this.#autoRuleToColumn.entries()) {
        if (col >= pivot) this.#autoRuleToColumn.set(ruleId, col + delta);
    }

    // #bridgeTakenCols
    const takenCols = [...this.#columnTypeManager.bridgeTakenCols];  // 需暴露迭代器
    // ... 类似平移逻辑

    // #lastSyncedValidation
    const snapshots = [...this.#lastSyncedValidation.entries()];
    this.#lastSyncedValidation.clear();
    for (const [col, snapshot] of snapshots) {
        this.#lastSyncedValidation.set(col >= pivot ? col + delta : col, snapshot);
    }
}
```

**注意**：`COLUMN_CONFIG_CHANGED` 事件在 `applyColumnsConfig()` 后触发，此时列号已更新，全量同步会自然重建正确映射。列结构变更监听是**增量优化**，避免全量同步的开销。

### D5: 序列化与持久化

`validation` 子对象随 `ColumnConfig` 序列化，无需额外处理：

```typescript
// 导出时
const exportedColumns = columns.map(col => ({
    type: col.type,
    options: col.options,
    validation: col.validation,  // ← 自然包含
    width: col.width,
    // ...
}));

// 导入时
// ColumnConfig.validation 由 ColumnTypeManager.applyColumnsConfig() 解析
// 桥接器监听 COLUMN_CONFIG_CHANGED 自动同步
```

**ValidationRule 的导出**：桥接器自动生成的规则 **不导出**（`metadata.source === "column-validation"`），因为它们可从 `validation` 配置重建。手动规则（`pluginOptions.rules`）照常导出。

```typescript
// DataValidationPlugin 导出逻辑
exportData(): any {
    return {
        rules: this.#engine.getAllRules()
            .filter(rule => rule.metadata?.source !== BRIDGE_SOURCE)  // 排除自动规则
            .map(rule => rule.toJSON()),
    };
}
```

---

## 变更历史

| 版本 | 日期         | 变更内容 |
|------|------------|---------|
| v1.0 | 2026-07-26 | 初始设计：推断桥接模式（从 type+options 推断 ValidationRule） |
| v2.0 | 2026-08-25 | **重大重构**：采用路径 B（`validation` 子对象直传模式），保留向后兼容推断模式 |
| v2.1 | 2026-08-26 | **安全修复**：降级条件改为桥接器驱动（`bridgeTakenCols`），插件未启用时列类型 validate() 兜底，新增第10章 |
| v2.2 | 2026-08-26 | **补充设计**：修复 §4.2 D5/§6.2-6.4 与 v2.1 不一致；新增附录 D（validation+options 共存、validator 函数交互、metadata 承载、列结构变更映射、序列化持久化） |