/**
 * 列类型基类
 *
 * 定义数据类型的行为：格式化、验证、解析、默认样式、编辑器选项、排序等。
 * 子类重写 getter 和实例方法来实现不同类型的逻辑。
 * BaseColumnType 实例直接作为运行时的类型对象使用，无需额外的包装层。
 *
 * 使用方式：
 *   1. 继承 BaseColumnType，重写 name/editorType/format/validate/parse/getDefaultStyle
 *   2. 在 src/types/index.ts 的 registry 中注册
 *   3. 通过 columnsConfig.type columns 或 cellTypes 指定类型名称
 */
import { SORT_ORDER } from "../constants/enums/SortOrder.js";
import type { CellRenderContext } from "./CellRenderContext.js";

export class BaseColumnType {
    options: Record<string, any>;

    constructor(options: Record<string, any> = {}) {
        this.options = options;
    }

    get name(): string {
        return "text";
    }

    get editorType(): string {
        return "text";
    }

    format(value: any): string {
        if (value === undefined || value === null) return "";
        return String(value);
    }

    validate(value: any): boolean | string {
        return true;
    }

    parse(input: any): any {
        return input;
    }

    getDefaultStyle(baseStyle: Record<string, any>): Record<string, any> {
        return baseStyle;
    }

    getEditorOptions(): Record<string, any> {
        return {};
    }

    getDefaultValue(): any {
        return "";
    }

    compare(a: any, b: any, order: string = SORT_ORDER.ASC): number {
        const sa = String(a ?? "");
        const sb = String(b ?? "");
        const result = sa.localeCompare(sb, undefined, { numeric: true });
        return order === SORT_ORDER.DESC ? -result : result;
    }

    render(context: CellRenderContext): void {
        // 基类不执行任何操作，子类可选择性重写
    }

    get hasCustomRenderer(): boolean {
        return (this.constructor as typeof BaseColumnType).prototype.render !== BaseColumnType.prototype.render;
    }
}
