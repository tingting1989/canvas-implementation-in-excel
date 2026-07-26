import { ConditionalRule } from "../../model";

/**
 * 条件格式与数据绑定管理器
 *
 * 从 Sheet 中提取的独立子模块，负责：
 * - 条件格式规则（按范围/条件匹配样式）
 * - 数据绑定映射（按值映射样式）
 *
 * 条件格式在渲染管线的 #drawCellBackground 中调用，
 * 优先级介于单元格样式和禁用单元格样式之间。
 *
 * 使用方式：
 * - 添加条件格式：通过 SheetStyleCoordinator.addConditionalRule() 间接调用
 * - 匹配条件样式：在 SheetStyleManager.resolveStyle() 中调用 match()
 * - 数据绑定样式：在 SheetStyleManager.resolveStyle() 中调用 getBinding()
 *
 * 数据流：
 * ┌──────────────────┐     ┌──────────────────────────┐
 * │ addConditionalRule│ ──→ │ #rules: ConditionalRule[] │
 * └──────────────────┘     └────────────┬─────────────┘
 *                                       │ match(r, c, cell)
 *                                       ▼
 * ┌──────────────────┐     ┌──────────────────────────┐
 * │ bindDataStyle     │ ──→ │ #bindings: Map<col, fn>  │
 * └──────────────────┘     └────────────┬─────────────┘
 *                                       │ getBinding(r, c)
 *                                       ▼
 *                            resolveStyle() 合并到最终样式
 */
export class ConditionalFormatManager {
    /** @type {import("../Sheet.js").Sheet} 所属工作表引用 */
    #sheet;

    /** @type {ConditionalRule[]} 条件格式规则列表（按添加顺序匹配，先匹配优先） */
    #rules = [];

    /** @type {Map<number, Function>} 数据绑定映射：列号 → mapperFn(cellValue) → styleId */
    #bindings = new Map();

    /**
     * 创建条件格式管理器
     *
     * @param {import("../Sheet.js").Sheet} sheet - 所属工作表
     */
    constructor(sheet) {
        this.#sheet = sheet;
    }

    // ============================================================
    // 条件格式
    // ============================================================

    /**
     * 添加条件格式规则
     *
     * 规则按添加顺序存储，match() 时按顺序遍历，先匹配到的规则优先返回。
     * 每条规则包含：作用范围（range）、条件函数（conditionFn）、命中样式（styleId）。
     *
     * @param {{topRow:number, topCol:number, bottomRow:number, bottomCol:number}} range - 规则作用的矩形范围
     * @param {function(value: *, cell?: Object): boolean} conditionFn - 条件判断函数，返回 true 表示命中
     * @param {number} styleId - 命中时应用的样式 ID（由 stylePool 预分配）
     */
    addRule(range, conditionFn, styleId) {
        this.#rules.push(new ConditionalRule(range, conditionFn, styleId));
    }

    /**
     * 匹配条件格式样式
     *
     * 遍历所有规则，返回第一个命中的样式 ID。
     * 匹配逻辑：先检查单元格是否在规则范围内，再调用条件函数判断。
     *
     * @param {number} r - 行号（0-based）
     * @param {number} c - 列号（0-based）
     * @param {Object} cell - 单元格对象（需包含 value 属性）
     * @returns {number|null} 匹配的样式 ID，未匹配返回 null
     */
    match(r, c, cell) {
        for (const rule of this.#rules) {
            if (rule.match(r, c, cell)) return rule.styleId;
        }
        return null;
    }

    // ============================================================
    // 数据绑定
    // ============================================================

    /**
     * 绑定数据样式映射
     *
     * 将指定列的单元格值映射为样式 ID。
     * mapperFn 接收单元格值，返回对应的 styleId。
     *
     * 典型用法：
     * - 正数绿色、负数红色：`bind(col, v => v >= 0 ? greenStyleId : redStyleId)`
     * - 状态映射：`bind(col, v => statusStyleMap[v] ?? defaultStyleId)`
     *
     * @param {number} col - 列号（0-based）
     * @param {function(value: *): number} mapperFn - 值→样式ID 的映射函数
     */
    bind(col, mapperFn) {
        this.#bindings.set(col, mapperFn);
    }

    /**
     * 获取数据绑定样式
     *
     * 查找指定列的映射函数，传入单元格值计算样式 ID。
     * 如果该列未绑定或单元格为空，返回 null。
     *
     * @param {number} r - 行号（0-based）
     * @param {number} c - 列号（0-based）
     * @returns {number|null} 映射到的样式 ID，未绑定或无值返回 null
     */
    getBinding(r, c) {
        const fn = this.#bindings.get(c);
        if (!fn) return null;
        const cell = this.#sheet.cellStore.get(r, c);
        return fn(cell?.value);
    }

    /**
     * 获取数据绑定 Map（供 RowColSync 行列同步时重映射键）
     *
     * 当列发生移动或删除时，RowColSync 需要更新 bindings 的键（列号）。
     * 直接返回内部 Map 引用，外部可修改。
     *
     * @returns {Map<number, Function>} 列号→映射函数的 Map
     */
    get bindings() {
        return this.#bindings;
    }

    /**
     * 是否有条件格式规则
     *
     * 供 resolveStyle() 快速路径判断：无规则时跳过 match() 遍历。
     *
     * @returns {boolean}
     */
    hasRules() {
        return this.#rules.length > 0;
    }

    /**
     * 是否有数据绑定
     *
     * 供 resolveStyle() 快速路径判断：无绑定时跳过 getBinding() 调用。
     *
     * @returns {boolean}
     */
    hasBindings() {
        return this.#bindings.size > 0;
    }
}
