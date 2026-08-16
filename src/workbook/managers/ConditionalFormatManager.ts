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
 */
export class ConditionalFormatManager {
    #sheet: Sheet;
    #rules: ConditionalRule[] = [];
    #bindings: Map<number, (value: unknown) => number> = new Map();

    constructor(sheet: Sheet) {
        this.#sheet = sheet;
    }

    addRule(range: CellRange, conditionFn: (value: unknown, cell?: unknown) => boolean, styleId: number): ConditionalRule {
        const rule = new ConditionalRule(range, conditionFn, styleId);
        this.#rules.push(rule);
        return rule;
    }

    removeRule(rule: ConditionalRule): boolean {
        const index = this.#rules.indexOf(rule);
        if (index === -1) return false;
        this.#rules.splice(index, 1);
        return true;
    }

    match(r: number, c: number, cell: Cell | null | undefined): number | null {
        for (const rule of this.#rules) {
            if (rule.match(r, c, cell)) return rule.styleId;
        }
        return null;
    }

    bind(col: number, mapperFn: (value: unknown) => number): void {
        this.#bindings.set(col, mapperFn);
    }

    getBinding(r: number, c: number): number | null {
        const fn = this.#bindings.get(c);
        if (!fn) return null;
        const cell = this.#sheet.cellStore.get(r, c);
        return fn(cell?.value);
    }

    get bindings(): Map<number, (value: unknown) => number> {
        return this.#bindings;
    }

    hasRules(): boolean {
        return this.#rules.length > 0;
    }

    hasBindings(): boolean {
        return this.#bindings.size > 0;
    }
}
