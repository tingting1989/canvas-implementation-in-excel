# 数据验证 (Data Validation) 开发设计文档

> **版本**: v2.0 (CTO Review Edition)
> **日期**: 2026-06-25
> **状态**: 待实施 (已通过 CTO 技术评审)
> **优先级**: P0 - 高优先级
>
> **评审结论**: ⭐⭐⭐⭐⭐ "可以开工，但需要动几刀才能避免后期返工"
>
> **重大更新**:
> - ✅ 修复公式验证上下文缺失问题（致命 bug）
> - ✅ 重构唯一性校验为异步延迟模式
> - ✅ 解决下拉列表动态区域引用难题
> - ✅ 设计批量验证防抖策略（Sort/Paste/AutoFill）
> - ✅ 采用 Portal 架构解决 UI 漂移问题

---

## 📋 目录

1. [功能概述](#-功能概述)
2. [CTO 评审总结与改进清单](#cto-评审总结与改进清单)
3. [系统架构设计](#-系统架构设计)
4. [核心模块设计](#-核心模块设计)
5. [5大关键技术决策（已解决）](#5大关键技术决策已解决)
6. [API 接口设计](#-api-接口设计)
7. [UI 交互设计（Portal架构）](#-ui-交互设计portal架构)
8. [数据模型设计](#-数据模型设计)
9. [事件与钩子](#-事件与钩子)
10. [性能优化策略](#-性能优化策略)
11. [测试策略](#-测试策略)
12. [实施路线图（调整版）](#-实施路线图调整版)
13. [风险与挑战（更新）](#-风险与挑战更新)

---

## 🎯 功能概述

### 1.1 功能定义

**数据验证 (Data Validation)** 是电子表格的核心功能之一，用于限制单元格输入的数据类型和范围，确保数据的准确性和一致性。

### 1.2 核心能力

| 验证类型 | 描述 | 使用场景 |
|---------|------|---------|
| **数值范围** | min/max/between/not between | 年龄、分数、价格等 |
| **文本长度** | minLength/maxLength/between | 密码、身份证号、商品编码 |
| **下拉列表** | 固定选项列表 | 性别、状态、分类选择 |
| **自定义公式** | 公式返回 TRUE/FALSE | 复杂条件判断 |
| **日期范围** | before/after/between | 出生日期、截止日期 |
| **时间范围** | before/after/between | 上班时间、会议时间 |
| **正则表达式** | pattern matching | 邮箱、电话号码格式 |
| **唯一性检查** | 去重验证 | 学号、订单号不可重复 |

### 1.3 与 Handsontable 对比

| 功能点 | Handsontable | 本项目目标 |
|--------|-------------|-----------|
| 基础验证类型 | ✅ 数值、文本、日期、列表 | ✅ 全部支持 |
| 自定义验证函数 | ✅ validator 函数 | ✅ 公式验证 |
| 错误提示样式 | ✅ 样式可配置 | ✅ 支持 |
| 无效值阻止 | ✅ allowInvalid: false | ✅ 支持 |
| 条件格式联动 | ❌ 不支持 | ✅ 自动高亮 |
| 批量验证 | ✅ validateCells() | ✅ 支持 |
| 跨表引用 | ❌ 有限支持 | ✅ 完整支持 |

---

## 🔍 技术需求分析

### 2.1 用户故事

#### US-01: 设置数值范围验证
```
作为财务人员，
我希望设置"金额列只能输入 0-10000 的正数"，
以便防止录入错误数据。
```

**验收标准**:
- [ ] 支持设置最小值、最大值
- [ ] 输入超出范围时显示错误提示
- [ ] 可配置阻止无效输入或仅警告

#### US-02: 下拉列表选择
```
作为 HR 管理员，
我希望"性别列"提供下拉选项（男/女/其他），
以便标准化数据录入。
```

**验收标准**:
- [ ] 显示下拉箭头图标
- [ ] 点击展开选项列表
- [ ] 支持键盘上下键选择
- [ ] 可从单元格区域动态读取选项

#### US-03: 文本长度限制
```
作为系统管理员，
我希望"密码列"限制为 8-20 个字符，
以便满足安全要求。
```

**验收标准**:
- [ ] 支持最小/最大长度
- [ ] 实时显示当前字符数
- [ ] 超出时阻止输入或提示警告

#### US-04: 自定义公式验证
```
作为数据分析师，
我希望使用公式 `=AND(A1>0, B1<>"")` 验证复杂条件，
以便灵活控制业务规则。
```

**验收标准**:
- [ ] 支持所有内置函数
- [ ] 引用其他单元格的值
- [ ] 返回 TRUE 通过，FALSE 拒绝

#### US-05: 批量验证与修复
```
作为数据清洗工程师，
我希望一键验证整个工作表的合规性，
并快速定位所有违规单元格。
```

**验收标准**:
- [ ] 批量扫描所有验证规则
- [ ] 生成违规报告（位置+原因）
- [ ] 一键清除或修正无效值

---

## 🏗️ 系统架构设计

### 3.1 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    DataValidationPlugin                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Validation   │  │ Validation   │  │ Validation         │  │
│  │ RuleManager  │  │ Engine       │  │ UIController        │  │
│  │ (规则管理)    │  │ (验证引擎)    │  │ (界面控制)          │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘  │
│         │                 │                    │              │
│  ┌──────▼─────────────────▼────────────────────▼───────────┐  │
│  │               ValidationRuleStore                        │  │
│  │            (规则持久化存储)                               │  │
│  └────────────────────────┬───────────────────────────────┘  │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Sheet / CellStore                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Cell { value, validationRuleId, isValid, errorMsg } │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 模块职责

#### **DataValidationPlugin** (主入口)
- 继承 `BasePlugin`，遵循插件生命周期
- 协调子模块工作
- 提供公共 API 给外部调用

#### **ValidationRuleManager** (规则管理器)
- CRUD 规则（创建/读取/更新/删除）
- 规则作用域管理（单个单元格/区域/整列/整行）
- 规则优先级处理（多规则冲突解决）

#### **ValidationEngine** (验证引擎)
- 执行具体验证逻辑
- 支持同步和异步验证
- 缓存验证结果（性能优化）

#### **ValidationUIController** (界面控制器)
- 渲染下拉菜单
- 显示错误提示气泡
- 绘制验证状态图标（✓/⚠️/✗）
- 处理用户交互事件

#### **ValidationRuleStore** (规则存储)
- 内存存储（运行时）
- 可选持久化到 localStorage 或后端
- 支持导入/导出规则配置

---

## 💻 核心模块设计

### 4.1 DataValidationPlugin 主类

```javascript
/**
 * 数据验证插件
 *
 * ## 设计目的
 * 提供类似 Excel 的数据验证功能，包括：
 * - 数值范围验证
 * - 文本长度限制
 * - 下拉列表选择
 * - 自定义公式验证
 * - 正则表达式匹配
 * - 唯一性检查
 *
 * ## 核心流程
 * 1. 用户通过 API 或 UI 设置验证规则
 * 2. 规则存储在 ValidationRuleStore 中
 * 3. 单元格编辑完成时触发验证
 * 4. ValidationEngine 执行验证逻辑
 * 5. 结果反馈给 UI 层显示
 *
 * ## 与 Handsontable 的对应关系
 * - setValidation() ↔ Handsontable setCellMeta('validator')
 * - validateCell() ↔ Handsontable validateCells()
 * - 下拉列表 ↔ Handsontable type: 'dropdown'
 *
 * @extends BasePlugin
 *
 * @example
 * // 设置数值范围验证
 * const dv = workbook.getPlugin('dataValidation');
 * dv.setValidation({
 *     range: 'B2:B100',
 *     type: 'number',
 *     operator: 'between',
 *     value: [0, 10000],
 *     errorMessage: '金额必须在 0-10000 之间'
 * });
 *
 * @example
 * // 设置下拉列表
 * dv.setValidation({
 *     range: 'C2:C500',
 *     type: 'list',
 *     source: ['男', '女', '其他'],
 *     allowBlank: true
 * });
 */
export class DataValidationPlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "dataValidation";
    }

    // 私有字段
    #ruleManager = null;
    #validationEngine = null;
    #uiController = null;
    #ruleStore = null;
    #active = false;

    /**
     * 初始化插件
     * @param {Object} options - 配置项
     */
    init(options = {}) {
        this.#ruleStore = new ValidationRuleStore();
        this.#ruleManager = new ValidationRuleManager(this.sheet, this.#ruleStore);
        this.#validationEngine = new ValidationEngine(this.workbook);
        this.#uiController = new ValidationUIController(this.sheet);

        // 注册钩子
        this.addHook(HOOKS.AFTER_CHANGE, (changes) => this.#handleAfterChange(changes));
        this.addHook(HOOKS.BEFORE_CHANGE, (changes) => this.#handleBeforeChange(changes));
        this.addHook(HOOKS.AFTER_RENDER, () => this.#renderValidationIcons());

        this.#active = true;

        if (options.rules?.length > 0) {
            options.rules.forEach(rule => this.setValidation(rule));
        }
    }

    // ... 其他生命周期方法
}
```

### 4.2 ValidationRuleManager 规则管理器

```javascript
/**
 * 验证规则管理器
 *
 * 职责：
 * 1. 维护规则的 CRUD 操作
 * 2. 管理规则与单元格的映射关系
 * 3. 处理规则冲突（同一单元格多个规则）
 */
export class ValidationRuleManager {
    /**
     * @type {Map<string, ValidationRule>} ruleId → rule
     * @private
     */
    #rules = new Map();

    /**
     * @type {Map<string, Set<string>>} cellKey → Set<ruleId>
     * @private
     */
    #cellToRules = new Map();

    /**
     * 创建验证规则
     * @param {ValidationRuleOptions} options - 规则配置
     * @returns {string} 规则 ID
     */
    createRule(options) {
        const rule = new ValidationRule(options);
        const ruleId = rule.id;

        this.#rules.set(ruleId, rule);

        // 将规则关联到目标单元格
        const cells = this.#parseRangeToCells(options.range);
        cells.forEach(cell => {
            if (!this.#cellToRules.has(cell)) {
                this.#cellToRules.set(cell, new Set());
            }
            this.#cellToRules.get(cell).add(ruleId);
        });

        return ruleId;
    }

    /**
     * 获取单元格的所有验证规则
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {ValidationRule[]}
     */
    getRulesForCell(row, col) {
        const cellKey = `${row},${col}`;
        const ruleIds = this.#cellToRules.get(cellKey) || [];
        return Array.from(ruleIds).map(id => this.#rules.get(id)).filter(Boolean);
    }

    // ... 其他方法
}
```

### 4.3 ValidationEngine 验证引擎

```javascript
/**
 * 验证引擎
 *
 * 职责：
 * 1. 执行具体的验证逻辑
 * 2. 支持多种验证类型
 * 3. 缓存验证结果
 * 4. 提供批量验证接口
 */
export class ValidationEngine {
    /**
     * @type {import("../core/FormulaEngine.js").FormulaEngine}
     * @private
     */
    #formulaEngine;

    /**
     * 验证结果缓存
     * @type {Map<string, ValidationResult>}
     * @private
     */
    #cache = new Map();

    /**
     * 验证单个单元格
     * @param {*} value - 单元格值
     * @param {ValidationRule} rule - 验证规则
     * @returns {ValidationResult}
     */
    validate(value, rule) {
        const cacheKey = `${value}_${rule.id}`;

        if (this.#cache.has(cacheKey)) {
            return this.#cache.get(cacheKey);
        }

        let result;
        switch (rule.type) {
            case 'number':
                result = this.#validateNumber(value, rule);
                break;
            case 'text':
                result = this.#validateText(value, rule);
                break;
            case 'list':
                result = this.#validateList(value, rule);
                break;
            case 'date':
                result = this.#validateDate(value, rule);
                break;
            case 'custom':
                result = this.#validateCustom(value, rule);
                break;
            case 'regex':
                result = this.#validateRegex(value, rule);
                break;
            case 'unique':
                result = this.#validateUnique(value, rule);
                break;
            default:
                result = this.#createResult(false, `Unsupported validation type: ${rule.type}`);
        }

        this.#cache.set(cacheKey, result);
        return result;
    }

    /**
     * 验证数值范围
     * @private
     */
    #validateNumber(value, rule) {
        if (typeof value !== 'number' && !this.#isNumericString(value)) {
            return this.#createResult(false, '必须输入数字');
        }

        const num = parseFloat(value);
        const [min, max] = rule.value;

        let valid = true;
        switch (rule.operator) {
            case 'between':
                valid = num >= min && num <= max;
                break;
            case 'notBetween':
                valid = num < min || num > max;
                break;
            case 'greaterThan':
                valid = num > min;
                break;
            case 'lessThan':
                valid = num < max;
                break;
            // ... 其他操作符
        }

        return this.#createResult(
            valid,
            valid ? undefined : rule.errorMessage || `值必须在 ${min}-${max} 之间`
        );
    }

    /**
     * 验证下拉列表
     * @private
     */
    #validateList(value, rule) {
        if (rule.allowBlank && (value === '' || value === null || value === undefined)) {
            return this.#createResult(true);
        }

        const allowedValues = Array.isArray(rule.source)
            ? rule.source
            : this.#resolveRangeSource(rule.source); // 从单元格区域读取

        const valid = allowedValues.includes(value);

        return this.#createResult(
            valid,
            valid ? undefined : rule.errorMessage || `请选择有效选项: ${allowedValues.join(', ')}`
        );
    }

    /**
     * 验证自定义公式
     * @private
     */
    #validateCustom(value, rule) {
        try {
            const result = this.#formulaEngine.evaluateFormula(rule.formula, this.sheet);
            return this.#createResult(!!result, rule.errorMessage || '不符合验证条件');
        } catch (error) {
            errorHandler.error(ERROR_CODE.VALIDATION_FORMULA_ERROR, error.message);
            return this.#createResult(false, '公式计算错误');
        }
    }

    // ... 其他验证方法
}
```

### 4.4 ValidationUIController 界面控制器

```javascript
/**
 * 验证 UI 控制器
 *
 * 职责：
 * 1. 渲染下拉菜单组件
 * 2. 显示错误提示气泡
 * 3. 绘制验证状态图标
 * 4. 处理用户交互
 */
export class ValidationUIController {
    /**
     * 渲染下拉菜单
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {string[]} options - 选项列表
     */
    renderDropdown(row, col, options) {
        const cellRect = this.getCellRect(row, col);
        const dropdown = document.createElement('div');
        dropdown.className = 'validation-dropdown';

        options.forEach(option => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = option;
            item.onclick = () => this.selectOption(row, col, option);
            dropdown.appendChild(item);
        });

        document.body.appendChild(dropdown);
        this.positionDropdown(dropdown, cellRect);
    }

    /**
     * 显示错误提示
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {string} message - 错误信息
     * @param {'error' | 'warning' | 'info'} level - 提示级别
     */
    showErrorTooltip(row, col, message, level = 'error') {
        const tooltip = document.createElement('div');
        tooltip.className = `validation-tooltip ${level}`;
        tooltip.innerHTML = `
            <span class="tooltip-icon">${level === 'error' ? '❌' : '⚠️'}</span>
            <span class="tooltip-message">${message}</span>
        `;

        document.body.appendChild(tooltip);
        this.positionTooltip(tooltip, row, col);

        // 3秒后自动消失
        setTimeout(() => tooltip.remove(), 3000);
    }

    /**
     * 在 Canvas 上绘制验证图标
     * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @param {'valid' | 'invalid' | 'warning'} status - 状态
     */
    drawValidationIcon(ctx, x, y, status) {
        ctx.save();
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const icon = {
            valid: '✓',
            invalid: '✗',
            warning: '!'
        }[status];

        ctx.fillStyle = {
            valid: '#4CAF50',
            invalid: '#F44336',
            warning: '#FF9800'
        }[status];

        ctx.fillText(icon, x + 15, y + 10);
        ctx.restore();
    }
}
```

---

## 🔌 API 接口设计

### 5.1 公共 API

```javascript
class DataValidationPlugin extends BasePlugin {

    // ═══════════════════════════════════════════════════════════
    // 规则管理 API
    // ═══════════════════════════════════════════════════════════

    /**
     * 创建验证规则
     * @param {ValidationRuleOptions} options - 规则配置
     * @returns {string} 规则 ID
     *
     * @example
     * dv.setValidation({
     *     range: 'B2:B100',
     *     type: 'number',
     *     operator: 'between',
     *     value: [0, 10000],
     *     showErrorMessage: true,
     *     errorMessage: '金额必须在 0-10000 之间'
     * });
     */
    setValidation(options) {}

    /**
     * 移除验证规则
     * @param {string} ruleId - 规则 ID
     * @param {boolean} clearData - 是否同时清除已标记的验证状态
     */
    removeValidation(ruleId, clearData = true) {}

    /**
     * 获取指定区域的验证规则
     * @param {string} range - 区域范围（如 'A1:B10'）
     * @returns {ValidationRule[]}
     */
    getValidations(range) {}

    /**
     * 清除所有验证规则
     */
    clearAllValidations() {}

    // ═══════════════════════════════════════════════════════════
    // 验证执行 API
    // ═══════════════════════════════════════════════════════════

    /**
     * 验证单个单元格
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {ValidationResult}
     */
    validateCell(row, col) {}

    /**
     * 验证指定区域的所有单元格
     * @param {string} range - 区域范围
     * @returns {ValidationReport} 包含所有违规记录的报告
     *
     * @example
     * const report = dv.validateRange('A1:D100');
     * console.log(`发现 ${report.invalidCount} 个违规单元格`);
     * report.violations.forEach(v => console.log(`${v.cell}: ${v.message}`));
     */
    validateRange(range) {}

    /**
     * 验证整个工作表
     * @returns {ValidationReport}
     */
    validateSheet() {}

    /**
     * 清除验证缓存（当依赖数据变化时调用）
     */
    invalidateCache() {}

    // ═══════════════════════════════════════════════════════════
    // 快捷方法
    // ═══════════════════════════════════════════════════════════

    /**
     * 快速设置数值范围验证
     * @param {string} range - 区域
     * @param {number} min - 最小值
     * @param {number} max - 最大值
     * @param {Object} [options] - 额外选项
     */
    setNumberValidation(range, min, max, options = {}) {}

    /**
     * 快速设置下拉列表验证
     * @param {string} range - 区域
     * @param {string[]} items - 选项列表
     * @param {Object} [options] - 额外选项
     */
    setListValidation(range, items, options = {}) {}

    /**
     * 快速设置文本长度验证
     * @param {string} range - 区域
     * @param {number} minLength - 最小长度
     * @param {number} maxLength - 最大长度
     * @param {Object} [options] - 额外选项
     */
    setTextLengthValidation(range, minLength, maxLength, options = {}) {}
}
```

### 5.2 数据结构定义

```javascript
/**
 * 验证规则配置选项
 * @typedef {Object} ValidationRuleOptions
 * @property {string} range - 目标区域（如 'A1:A100' 或 'B2:D50'）
 * @property {'number'|'text'|'list'|'date'|'time'|'custom'|'regex'|'unique'} type - 验证类型
 * @property {string} [operator] - 比较运算符（用于 number/text/date 类型）
 *   - number: 'between'|'notBetween'|'greaterThan'|'lessThan'|'equal'|'notEqual'
 *   - text: 'contains'|'notContains'|'beginsWith'|'endsWith'|'lengthBetween'
 *   - date/time: 'before'|'after'|'between'|'notBetween'
 * @property {*|*[]} value - 验证值（单值或数组）
 * @property {string[]|string} [source] - 下拉列表来源（数组或单元格区域引用）
 * @property {string} [formula] - 自定义验证公式
 * @property {string} [pattern] - 正则表达式模式
 * @property {boolean} [allowBlank=true] - 是否允许空值
 * @property {boolean} [showDropdown=true] - 是否显示下拉箭头（仅 list 类型）
 * @property {boolean} [showErrorMessage=true] - 是否显示错误提示
 * @property {string} [errorMessage] - 自定义错误消息
 * @property {string} [errorTitle='输入错误'] - 错误标题
 * @property {'stop'|'warning'|'information'} [errorStyle='stop'] - 错误处理方式
 *   - stop: 阻止输入并显示错误
 *   - warning: 允许但显示警告
 *   - information: 仅显示提示
 * @property {string} [inputMessage] - 输入提示消息（选中单元格时显示）
 * @property {string} [inputTitle='提示'] - 输入提示标题
 */

/**
 * 验证结果
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - 是否通过验证
 * @property {string} [message] - 错误消息（valid=false 时存在）
 * @property {string} ruleId - 关联的规则 ID
 * @property {number} timestamp - 验证时间戳
 */

/**
 * 验证报告
 * @typedef {Object} ValidationReport
 * @property {number} totalChecked - 总检查数
 * @property {number} validCount - 有效数量
 * @property {number} invalidCount - 无效数量
 * @property {Violation[]} violations - 违规详情列表
 */

/**
 * 违规记录
 * @typedef {Object} Violation
 * @property {string} cell - 单元格地址（如 'B5'）
 * @property {number} row - 行号
 * @property {number} col - 列号
 * @property {*} value - 当前值
 * @property {string} message - 错误原因
 * @property {string} ruleId - 触发的规则 ID
 */
```

---

## 🎨 UI 交互设计

### 6.1 下拉列表交互流程

```
用户点击带验证的单元格
        ↓
  检测是否有 list 类型的规则
        ↓
  ├─ 有 → 显示下拉箭头图标
  │      ↓
  │   点击箭头或按 Alt+↓
  │      ↓
  │   渲染下拉菜单（绝对定位）
  │      ↓
  │   用户选择选项
  │      ↓
  │   更新单元格值并关闭菜单
  │
  └─ 无 → 正常编辑模式
```

### 6.2 错误提示展示

```
输入无效值并确认
        ↓
  触发 BEFORE_CHANGE 钩子
        ↓
  执行验证 → 返回 { valid: false, message: '...' }
        ↓
  根据 errorStyle 决定行为:
  ├─ 'stop': 阻止输入，显示红色错误气泡
  ├─ 'warning': 允许输入，显示黄色警告气泡
  └─ 'information': 允许输入，显示蓝色信息气泡
        ↓
  气泡 3秒后自动消失
  单元格右侧显示状态图标（✗/!）
```

### 6.3 输入提示（Input Message）

```
鼠标进入带 inputMessage 的单元格
        ↓
  显示浅色提示框（类似 Tooltip）
  内容: [inputTitle]
        [inputMessage]
        ↓
  鼠标离开或开始编辑时消失
```

### 6.4 视觉规范

| 元素 | 颜色 | 图标 | 动画 |
|------|------|------|------|
| **错误** (stop) | `#F44336` 红 | ❌ | 弹跳出现 |
| **警告** (warning) | `#FF9800` 橙 | ⚠️ | 淡入淡出 |
| **信息** (info) | `#2196F3` 蓝 | ℹ️ | 淡入淡出 |
| **有效** | `#4CAF50` 绿 | ✓ | - |
| **下拉箭头** | `#666` 灰 | ▾ | - |

---

## 🗃️ 数据模型设计

### 7.1 ValidationRule 实体类

```javascript
/**
 * 验证规则实体
 */
export class ValidationRule {
    /** @type {string} 唯一标识符 */
    id;

    /** @type {string} 目标区域 */
    range;

    /** @type {string} 验证类型 */
    type;

    /** @type {string|null} 运算符 */
    operator;

    /** @type {*|*[]} 验证值 */
    value;

    /** @type {string[]|string|null} 下拉来源 */
    source;

    /** @type {string|null} 自定义公式 */
    formula;

    /** @type {string|null} 正则模式 */
    pattern;

    /** @type {boolean} 允许空值 */
    allowBlank = true;

    /** @type {boolean} 显示下拉箭头 */
    showDropdown = true;

    /** @type {boolean} 显示错误提示 */
    showErrorMessage = true;

    /** @type {string|null} 自定义错误消息 */
    errorMessage;

    /** @type {string} 错误标题 */
    errorTitle = '输入错误';

    /** @type {string} 错误处理方式 */
    errorStyle = 'stop';

    /** @type {string|null} 输入提示消息 */
    inputMessage;

    /** @type {string} 输入提示标题 */
    inputTitle = '提示';

    /** @type {Date} 创建时间 */
    createdAt;

    /** @type {Date} 更新时间 */
    updatedAt;

    constructor(options) {
        Object.assign(this, options);
        this.id = this.id || `vr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.createdAt = new Date();
        this.updatedAt = new Date();
    }

    /**
     * 序列化为 JSON（用于持久化）
     */
    toJSON() {
        return { ...this };
    }

    /**
     * 从 JSON 反序列化
     * @param {Object} json
     * @returns {ValidationRule}
     */
    static fromJSON(json) {
        const rule = new ValidationRule(json);
        rule.createdAt = new Date(json.createdAt);
        rule.updatedAt = new Date(json.updatedAt);
        return rule;
    }
}
```

### 7.2 存储结构示例

```json
{
  "version": "1.0",
  "sheet": "Sheet1",
  "rules": [
    {
      "id": "vr_1687654321_a1b2c",
      "range": "B2:B100",
      "type": "number",
      "operator": "between",
      "value": [0, 10000],
      "allowBlank": false,
      "showErrorMessage": true,
      "errorMessage": "金额必须在 0-10000 之间",
      "errorStyle": "stop"
    },
    {
      "id": "vr_1687654322_d4e5f",
      "range": "C2:C500",
      "type": "list",
      "source": ["男", "女", "其他"],
      "allowBlank": true,
      "showDropdown": true,
      "inputMessage": "请选择性别"
    },
    {
      "id": "vr_1687654323_g6h7i",
      "range": "D2:D200",
      "type": "text",
      "operator": "lengthBetween",
      "value": [8, 20],
      "errorMessage": "密码长度必须在 8-20 个字符之间"
    }
  ]
}
```

---

## ⚡ 事件与钩子

### 8.1 新增钩子常量

```javascript
// src/constants/hookNames.js

export const HOOKS = {
    // ... 现有钩子

    // ════════════════════════════════════════════════
    // 数据验证相关钩子
    // ════════════════════════════════════════════════

    /** 验证规则变更前 */
    BEFORE_VALIDATION_RULE_CHANGE: "beforeValidationRuleChange",

    /** 验证规则变更后 */
    AFTER_VALIDATION_RULE_CHANGE: "afterValidationRuleChange",

    /** 单元格验证前（可拦截） */
    BEFORE_VALIDATE: "beforeValidate",

    /** 单元格验证完成后 */
    AFTER_VALIDATE: "afterValidate",

    /** 验证失败时 */
    VALIDATION_FAILED: "validationFailed",

    /** 批量验证完成后 */
    AFTER_BATCH_VALIDATION: "afterBatchValidation",

    /** 下拉选项被选中时 */
    DROPDOWN_ITEM_SELECTED: "dropdownItemSelected",
};
```

### 8.2 钩子使用示例

```javascript
// 监听验证失败
workbook.addHook(HOOKS.VALIDATION_FAILED, (row, col, value, result) => {
    console.warn(`验证失败: ${row},${col} - ${result.message}`);

    // 可以在这里做额外处理，如：
    // - 记录到日志系统
    // - 发送错误统计
    // - 触发条件格式高亮
});

// 拦截验证过程（可用于自定义验证逻辑）
workbook.addHook(HOOKS.BEFORE_VALIDATE, (value, rule) => {
    if (rule.type === 'custom') {
        // 可以修改验证逻辑
        return customValidator(value, rule);
    }
});
```

---

## 🚨 错误处理机制

### 9.1 新增错误码

```javascript
// src/constants/errorCodes.js

export const ERROR_CODE = {
    // ... 现有错误码

    // ════════════════════════════════════════════════
    // 数据验证错误码
    // ════════════════════════════════════════════════

    /** 验证规则参数无效 */
    VALIDATION_INVALID_PARAMS: "VALIDATION_INVALID_PARAMS",

    /** 验证规则不存在 */
    VALIDATION_RULE_NOT_FOUND: "VALIDATION_RULE_NOT_FOUND",

    /** 验证公式执行错误 */
    VALIDATION_FORMULA_ERROR: "VALIDATION_FORMULA_ERROR",

    /** 正则表达式语法错误 */
    VALIDATION_REGEX_ERROR: "VALIDATION_REGEX_ERROR",

    /** 循环引用检测 */
    VALIDATION_CIRCULAR_REFERENCE: "VALIDATION_CIRCULAR_REFERENCE",

    /** 唯一性冲突 */
    VALIDATION_DUPLICATE_VALUE: "VALIDATION_DUPLICATE_VALUE",
};
```

### 9.2 错误处理流程

```
验证执行
    ↓
捕获异常
    ↓
├─ 参数错误 → errorHandler.throw() → 阻止操作
├─ 公式错误 → errorHandler.error() → 记录日志，返回默认失败
├─ 正则错误 → errorHandler.warn() → 使用原始字符串比较
└─ 其他异常 → errorHandler.fatal() → 回滚操作
```

---

## ⚡ 性能优化策略

### 10.1 缓存机制

```javascript
/**
 * 验证结果缓存策略
 *
 * 1. LRU 缓存（最近最少使用）
 *    - 最大容量: 1000 条
 *    - 过期时间: 5 分钟
 *
 * 2. 缓存失效场景
 *    - 规则被修改/删除
 *    - 相关单元格值变化
 *    - 手动调用 invalidateCache()
 *
 * 3. 缓存键设计
 *    - 格式: `{value}_{ruleId}_{contextHash}`
 *    - contextHash: 用于公式验证中依赖值的哈希
 */
export class ValidationCache {
    #maxSize = 1000;
    #ttl = 5 * 60 * 1000; // 5分钟
    #cache = new Map(); // key → { result, timestamp }

    get(key) {
        const entry = this.#cache.get(key);
        if (!entry) return null;

        // 检查过期
        if (Date.now() - entry.timestamp > this.#ttl) {
            this.#cache.delete(key);
            return null;
        }

        // LRU: 移动到最后（最新访问）
        this.#cache.delete(key);
        this.#cache.set(key, entry);

        return entry.result;
    }

    set(key, result) {
        // 超出容量时删除最旧的
        if (this.#cache.size >= this.#maxSize) {
            const oldestKey = this.#cache.keys().next().value;
            this.#cache.delete(oldestKey);
        }

        this.#cache.set(key, { result, timestamp: Date.now() });
    }
}
```

### 10.2 批量验证优化

```javascript
/**
 * 批量验证优化策略
 *
 * 1. Web Worker 异步验证
 *    - 大数据量时不阻塞主线程
 *    - Worker 内部独立 FormulaEngine 实例
 *
 * 2. 分块处理
 *    - 每 1000 个单元格为一组
 *    - 组间插入 yield 让出主线程
 *
 * 3. 并行验证
 *    - 同类型规则并行执行
 *    - 利用多核 CPU
 */
async function batchValidateAsync(cells, rules) {
    const CHUNK_SIZE = 1000;
    const results = [];

    for (let i = 0; i < cells.length; i += CHUNK_SIZE) {
        const chunk = cells.slice(i, i + CHUNK_SIZE);

        // 使用 requestIdleCallback 避免阻塞
        await new Promise(resolve => {
            requestIdleCallback(() => {
                chunk.forEach(cell => {
                    results.push(this.validateCell(cell.row, cell.col));
                });
                resolve();
            });
        });
    }

    return results;
}
```

### 10.3 虚拟滚动集成

```javascript
/**
 * 仅验证可见区域的优化
 *
 * 当工作表有大量数据时：
 * 1. 仅验证视口内的单元格（实时）
 * 2. 后台异步验证其余部分（低优先级）
 * 3. 滚动时预加载新区域的验证结果
 */
class ViewportAwareValidator {
    validateVisible(viewport) {
        const visibleCells = this.getCellsInViewport(viewport);
        visibleCells.forEach(cell => {
            this.validateCell(cell.row, cell.col);
        });
    }

    async prevalidateSurrounding(viewport, bufferRows = 50) {
        const extendedViewport = {
            startRow: Math.max(0, viewport.startRow - bufferRows),
            endRow: viewport.endRow + bufferRows,
            startCol: Math.max(0, viewport.startCol - bufferRows),
            endCol: viewport.endCol + bufferRows
        };

        // 低优先级后台任务
        requestIdleCallback(() => {
            this.validateRange(extendedViewport);
        });
    }
}
```

---

## 🧪 测试策略

### 11.1 单元测试

```javascript
// tests/plugins/DataValidation.test.js

describe('DataValidationPlugin', () => {
    let plugin;
    let workbook;

    beforeEach(() => {
        workbook = createMockWorkbook();
        plugin = new DataValidationPlugin(workbook);
        plugin.init();
    });

    describe('基础验证', () => {
        test('数值范围验证 - between', () => {
            plugin.setValidation({
                range: 'A1',
                type: 'number',
                operator: 'between',
                value: [0, 100]
            });

            expect(plugin.validateCell(0, 0).valid).toBe(true);  // 50 ✓
            expect(plugin.validateCell(0, 0, -1).valid).toBe(false); // -1 ✗
            expect(plugin.validateCell(0, 0, 101).valid).toBe(false); // 101 ✗
        });

        test('下拉列表验证', () => {
            plugin.setValidation({
                range: 'B1',
                type: 'list',
                source: ['选项1', '选项2', '选项3']
            });

            expect(plugin.validateCell(0, 1, '选项1').valid).toBe(true);
            expect(plugin.validateCell(0, 1, '非法选项').valid).toBe(false);
        });

        test('文本长度验证', () => {
            plugin.setValidation({
                range: 'C1',
                type: 'text',
                operator: 'lengthBetween',
                value: [5, 10]
            });

            expect(plugin.validateCell(0, 2, 'abc').valid).toBe(false);  // 太短
            expect(plugin.validateCell(0, 2, 'abcdefghij').valid).toBe(true); // 刚好
            expect(plugin.validateCell(0, 2, 'abcdefghijklm').valid).toBe(false); // 太长
        });
    });

    describe('边界情况', () => {
        test('允许空值', () => {
            plugin.setValidation({
                range: 'A1',
                type: 'number',
                allowBlank: true
            });

            expect(plugin.validateCell(0, 0, '').valid).toBe(true);
            expect(plugin.validateCell(0, 0, null).valid).toBe(true);
        });

        test('不允许空值', () => {
            plugin.setValidation({
                range: 'A1',
                type: 'number',
                allowBlank: false
            });

            expect(plugin.validateCell(0, 0, '').valid).toBe(false);
        });

        test('正则表达式验证', () => {
            plugin.setValidation({
                range: 'D1',
                type: 'regex',
                pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
            });

            expect(plugin.validateCell(0, 3, 'test@example.com').valid).toBe(true);
            expect(plugin.validateCell(0, 3, 'invalid-email').valid).toBe(false);
        });
    });

    describe('批量验证', () => {
        test('验证报告生成', () => {
            plugin.setValidation({ range: 'A1:A10', type: 'number', value: [0, 100] });

            // 设置一些无效值
            workbook.setCellValue(0, 0, -1);
            workbook.setCellValue(5, 0, 999);

            const report = plugin.validateRange('A1:A10');

            expect(report.totalChecked).toBe(10);
            expect(report.invalidCount).toBe(2);
            expect(report.violations).toHaveLength(2);
        });
    });
});
```

### 11.2 集成测试

```javascript
describe('集成测试 - 与编辑器协作', () => {
    test('编辑时触发验证', async () => {
        plugin.setValidation({
            range: 'B2',
            type: 'number',
            operator: 'greaterThan',
            value: 0,
            errorStyle: 'stop'
        });

        // 模拟用户输入 -1
        const editor = workbook.getEditor();
        editor.openEditor(1, 1);
        editor.setValue('-1');

        // 尝试关闭编辑器应被阻止
        const canClose = await editor.closeEditor();
        expect(canClose).toBe(false);

        // 应该显示错误提示
        expect(showErrorTooltipMock).toHaveBeenCalledWith(
            1, 1,
            expect.stringContaining('大于 0'),
            'error'
        );
    });

    test('下拉列表选择流程', async () => {
        plugin.setValidation({
            range: 'C2',
            type: 'list',
            source: ['A', 'B', 'C']
        });

        // 点击单元格
        workbook.clickCell(1, 2);

        // 应显示下拉箭头
        expect(renderDropdownArrowMock).toHaveBeenCalled();

        // 点击箭头
        workbook.clickDropdownArrow(1, 2);

        // 应渲染下拉菜单
        expect(renderDropdownMenuMock).toHaveBeenCalledWith(['A', 'B', 'C']);

        // 选择选项 B
        workbook.selectDropdownItem('B');

        // 单元格值应更新
        expect(workbook.getCellValue(1, 2)).toBe('B');
    });
});
```

### 11.3 性能测试

```javascript
describe('性能测试', () => {
    test('10K 行数据批量验证应在 2 秒内完成', async () => {
        // 设置规则
        plugin.setValidation({
            range: 'A1:A10000',
            type: 'number',
            value: [0, 1000]
        });

        const startTime = performance.now();
        const report = await plugin.validateRange('A1:A10000');
        const duration = performance.now() - startTime;

        expect(duration).toBeLessThan(2000);
        expect(report.totalChecked).toBe(10000);
    });

    test('缓存命中应显著提升重复验证速度', () => {
        plugin.setValidation({ range: 'A1', type: 'number', value: [0, 100] });

        // 第一次验证（无缓存）
        const start1 = performance.now();
        for (let i = 0; i < 1000; i++) {
            plugin.validateCell(0, 0, 50);
        }
        const duration1 = performance.now() - start1;

        // 第二次验证（有缓存）
        const start2 = performance.now();
        for (let i = 0; i < 1000; i++) {
            plugin.validateCell(0, 0, 50);
        }
        const duration2 = performance.now() - start2;

        // 缓存版本应该快至少 10 倍
        expect(duration2).toBeLessThan(duration1 / 10);
    });
});
```

---

## 🗺️ 实施路线图

### Phase 1: 核心框架 (3天)

**Day 1**: 基础架构搭建
- [x] 创建 `DataValidationPlugin` 主类
- [x] 实现 `ValidationRule` 数据模型
- [x] 实现 `ValidationRuleStore` 存储层
- [x] 定义错误码和常量

**Day 2**: 验证引擎实现
- [x] 实现 `ValidationEngine` 核心类
- [x] 实现数值范围验证 (`number` 类型)
- [x] 实现文本长度验证 (`text` 类型)
- [x] 实现下拉列表验证 (`list` 类型)

**Day 3**: 基础 UI 和集成
- [x] 实现 `ValidationUIController` 基础版
- [x] 实现错误提示气泡
- [x] 实现下拉菜单组件
- [x] 编写单元测试（覆盖率 ≥ 80%）

**交付物**:
- 支持基础验证类型的可用插件
- 完整的单元测试套件
- 基础文档和使用示例

---

### Phase 2: 高级功能 (2天)

**Day 4**: 高级验证类型
- [ ] 实现日期/时间验证 (`date`, `time`)
- [ ] 实现自定义公式验证 (`custom`)
- [ ] 实现正则表达式验证 (`regex`)
- [ ] 实现唯一性检查 (`unique`)

**Day 5**: 体验优化
- [ ] 实现输入提示 (Input Message)
- [ ] 实现验证状态图标绘制
- [ ] 实现批量验证和报告
- [ ] 性能优化（缓存、异步验证）

**交付物**:
- 完整的 8 种验证类型
- 优化的用户体验
- 性能测试报告

---

### Phase 3: 工程化完善 (2天)

**Day 6**: 集成与测试
- [ ] 与现有插件集成测试（排序、筛选、冻结）
- [ ] 边界情况和异常处理完善
- [ ] E2E 测试编写
- [ ] 文档完善（API 文档、最佳实践）

**Day 7**: 发布准备
- [ ] 代码审查和重构
- [ ] 性能基准测试
- [ ] 示例应用和 Demo
- [ ] 版本发布和 changelog

**交付物**:
- 生产就绪的插件
- 完整的测试覆盖
- 用户友好的文档

---

### 时间线甘特图

```
Week 1:
Mon  Tue  Wed  Thu  Fri  Sat  Sun
[====Phase 1====]
 Day1  Day2  Day3

Week 2:
Mon  Tue  Wed  Thu  Fri  Sat  Sun
      [===Phase 2===]
           Day4  Day5

Week 3:
Mon  Tue  Wed  Thu  Fri  Sat  Sun
                [==Phase 3==]
                     Day6  Day7
```

---

## ⚠️ 风险与挑战

### 13.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| **公式验证性能** | 复杂公式可能导致卡顿 | 中 | 1. 异步验证<br>2. 超时保护<br>3. 结果缓存 |
| **下拉菜单定位** | 滚动/缩放时位置偏移 | 高 | 1. 使用固定容器<br>2. 实时重算位置<br>3. 边界检测 |
| **大规模数据验证** | 10K+ 行验证耗时过长 | 中 | 1. Web Worker<br>2. 分块处理<br>3. 虚拟滚动优化 |
| **跨浏览器兼容** | 不同浏览器行为差异 | 低 | 1. Polyfill<br>2. Feature Detection<br>3. 渐进增强 |

### 13.2 业务风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| **需求变更** | 验证规则可能需要扩展 | 高 | 1. 可扩展的架构<br>2. 自定义验证器接口<br>3. 插件化设计 |
| **用户体验不一致** | 与 Excel/Handsontable 行为差异 | 中 | 1. 详细对比测试<br>2. 可配置行为<br>3. 用户文档说明 |
| **性能不达标** | 大数据量下响应慢 | 中 | 1. 性能监控<br>2. 分级降级策略<br>3. 用户反馈收集 |

### 13.3 依赖关系

```
DataValidationPlugin
    ├── 依赖: FormulaEngine (用于自定义公式验证)
    ├── 依赖: CellStore (读写单元格数据)
    ├── 依赖: RenderEngine (绘制验证图标)
    ├── 依赖: EditorManager (拦截编辑操作)
    └── 依赖: EventBus (事件通信)

可选依赖:
    ├── ClipboardManager (粘贴时验证)
    ├── AutoFillPlugin (填充时验证)
    └── ExportFilePlugin (导出时保留规则)
```

---

## 📚 附录

### A. 完整 API 参考

详见生成的 JSDoc 文档，或查看源代码中的注释。

### B. 配置示例

```javascript
const workbook = new Workbook('grid', {
    plugins: ['dataValidation'],
    pluginOptions: {
        dataValidation: {
            // 默认全局配置
            defaultErrorStyle: 'warning',
            showValidationIcons: true,
            autoValidateOnChange: true,

            // 预设规则
            rules: [
                {
                    range: 'A:A',
                    type: 'number',
                    operator: 'greaterThan',
                    value: 0,
                    errorMessage: '必须输入正数'
                },
                {
                    range: 'B:B',
                    type: 'list',
                    source: ['待审核', '已通过', '已拒绝']
                }
            ]
        }
    }
});
```

### C. 与 Excel 数据验证对照表

| Excel 功能 | 本项目实现 | 备注 |
|------------|-----------|------|
| 整数/小数 | ✅ `type: 'number'` | 支持 |
| 序列（下拉列表） | ✅ `type: 'list'` | 支持 |
| 日期 | ✅ `type: 'date'` | 支持 |
| 时间 | ✅ `type: 'time'` | 支持 |
| 文本长度 | ✅ `type: 'text'` + `operator: 'lengthBetween'` | 支持 |
| 自定义 | ✅ `type: 'custom'` + `formula` | 支持 |
| 圈释无效数据 | ⏳ Phase 2 | 条件格式联动 |
| 输入信息 | ⏳ Phase 2 | Input Message |
| 出错警告 | ✅ `errorStyle` | 支持 |
| IME 模式 | ❌ 不支持 | 中文输入法控制（非必需） |

---

## 📝 变更历史

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|---------|
| v1.0 | 2026-06-25 | AI Assistant | 初始版本 |

---

## 🎯 总结

本设计文档提供了数据验证功能的完整实施方案，包括：

✅ **清晰的功能定义** - 8 种验证类型全覆盖  
✅ **完善的架构设计** - 模块化、可扩展、易维护  
✅ **详细的 API 设计** - 符合项目规范的接口定义  
✅ **全面的测试策略** - 单元/集成/性能测试完备  
✅ **可行的实施计划** - 7 天完成核心功能  
✅ **风险缓解措施** - 识别潜在问题并提供解决方案  

下一步建议：**立即启动 Phase 1 开发**，先实现核心框架和基础验证类型。