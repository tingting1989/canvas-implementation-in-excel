import { ConditionalRule } from "../../model";
import type { Sheet } from "../Sheet";
import type { CellRange } from "../../model/types";
import type { Cell } from "../../model/store/Cell";

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
 *
 * @class ConditionalFormatManager
 */
export class ConditionalFormatManager {
    /** 工作表引用（用于数据绑定中读取单元格值） */
    #sheet: Sheet;
    /** 条件格式规则列表 */
    #rules: ConditionalRule[] = [];
    /** 数据绑定映射表（列号 → 值到样式ID的映射函数） */
    #bindings: Map<number, (value: unknown) => number> = new Map();

    /**
     * @param sheet - 工作表实例
     */
    constructor(sheet: Sheet) {
        this.#sheet = sheet;
    }

    /**
     * 添加条件格式规则
     *
     * @param range - 规则生效的单元格范围
     * @param conditionFn - 条件判断函数，返回 true 时应用样式
     * @param styleId - 满足条件时应用的样式 ID
     * @returns 创建的规则实例（可用于后续删除）
     */
    addRule(range: CellRange, conditionFn: (value: unknown, cell?: unknown) => boolean, styleId: number): ConditionalRule {
        const rule = new ConditionalRule(range, conditionFn, styleId);
        this.#rules.push(rule);
        return rule;
    }

    /**
     * 移除条件格式规则
     *
     * @param rule - 要移除的规则实例
     * @returns 是否移除成功
     */
    removeRule(rule: ConditionalRule): boolean {
        const index = this.#rules.indexOf(rule);
        if (index === -1) return false;
        this.#rules.splice(index, 1);
        return true;
    }

    /**
     * 匹配条件格式样式
     *
     * 遍历所有规则，返回第一个匹配的样式 ID。
     * 规则按添加顺序匹配，先添加的优先。
     *
     * @param r - 行号
     * @param c - 列号
     * @param cell - 单元格数据（用于条件判断）
     * @returns 匹配的样式 ID，未匹配返回 null
     */
    match(r: number, c: number, cell: Cell | null | undefined): number | null {
        for (const rule of this.#rules) {
            if (rule.match(r, c, cell)) return rule.styleId;
        }
        return null;
    }

    /**
     * 绑定数据样式映射
     *
     * 为指定列注册映射函数，将单元格值转换为样式 ID。
     *
     * @param col - 列号
     * @param mapperFn - 值到样式 ID 的映射函数
     */
    bind(col: number, mapperFn: (value: unknown) => number): void {
        this.#bindings.set(col, mapperFn);
    }

    /**
     * 获取数据绑定样式 ID
     *
     * 读取指定列的映射函数，将单元格值转换为样式 ID。
     *
     * @param r - 行号
     * @param c - 列号
     * @returns 样式 ID，未绑定返回 null
     */
    getBinding(r: number, c: number): number | null {
        const fn = this.#bindings.get(c);
        if (!fn) return null;
        const cell = this.#sheet.cellStore.get(r, c);
        return fn(cell?.value);
    }

    /**
     * 获取数据绑定映射表
     * @returns 列号到映射函数的 Map
     */
    get bindings(): Map<number, (value: unknown) => number> {
        return this.#bindings;
    }

    /**
     * 是否存在条件格式规则
     * @returns 是否存在规则
     */
    hasRules(): boolean {
        return this.#rules.length > 0;
    }

    /**
     * 是否存在数据绑定
     * @returns 是否存在绑定
     */
    hasBindings(): boolean {
        return this.#bindings.size > 0;
    }
}
