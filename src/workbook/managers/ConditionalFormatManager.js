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
 */
export class ConditionalFormatManager {
    /** @type {import("../Sheet.js").Sheet} */
    #sheet;

    /** @type {ConditionalRule[]} 条件格式规则列表 */
    #rules = [];

    /** @type {Map<number, Function>} 数据绑定映射 col → mapperFn(cellValue) → styleId */
    #bindings = new Map();

    /**
     * @param {import("../Sheet.js").Sheet} sheet - 所属工作表
     */
    constructor(sheet) {
        this.#sheet = sheet;
    }

    // ============================================================
    // 条件格式
    // ============================================================

    /** 添加条件格式规则 */
    addRule(range, conditionFn, styleId) {
        this.#rules.push(new ConditionalRule(range, conditionFn, styleId));
    }

    /**
     * 匹配条件格式样式
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {Cell} cell - 单元格对象
     * @returns {number|null} 匹配的样式 ID，或 null
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

    /** 绑定数据样式映射 */
    bind(col, mapperFn) {
        this.#bindings.set(col, mapperFn);
    }

    /**
     * 获取数据绑定样式
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {number|null} 样式 ID，或 null
     */
    getBinding(r, c) {
        const fn = this.#bindings.get(c);
        if (!fn) return null;
        const cell = this.#sheet.cellStore.get(r, c);
        return fn(cell?.value);
    }

    /**
     * 获取数据绑定 Map（供 RowColSync 行列同步时重映射键）
     * @returns {Map<number, Function>}
     */
    get bindings() {
        return this.#bindings;
    }

    /** 是否有条件格式规则（供 resolveStyle 快速路径判断） */
    hasRules() {
        return this.#rules.length > 0;
    }

    /** 是否有数据绑定（供 resolveStyle 快速路径判断） */
    hasBindings() {
        return this.#bindings.size > 0;
    }
}