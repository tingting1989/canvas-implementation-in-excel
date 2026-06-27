import { BaseColumnType } from "./BaseColumnType.js";

/**
 * 下拉选择列类型
 *
 * 支持：
 * - 从预定义列表中选择值
 * - 可配置是否允许输入自定义值
 * - 验证值是否在允许的列表中
 *
 * 配置选项：
 *   source: string[] — 可选值列表（必需）
 *   allowInvalid: boolean — 是否允许不在列表中的值（默认 false）
 *   strict: boolean — 严格模式，仅允许选择不能手动输入（默认 false）
 */
export class SelectColumnType extends BaseColumnType {
    get name() {
        return "select";
    }

    get editorType() {
        return "select";
    }

    get source() {
        return this.options?.source || [];
    }

    format(value) {
        if (value === undefined || value === null) return "";
        return String(value);
    }

    validate(value) {
        if (value === "" || value === undefined || value === null) return true;

        const source = this.options?.source;
        if (!Array.isArray(source) || source.length === 0) return true;

        const strValue = String(value);
        const found = source.some((item) => String(item) === strValue);

        if (!found && !this.options?.allowInvalid) {
            return false;
        }

        return true;
    }

    parse(input) {
        if (input === "" || input === undefined || input === null) return "";

        const source = this.options?.source;
        if (!Array.isArray(source) || source.length === 0) return String(input);

        const strInput = String(input).trim();

        // 尝试精确匹配
        const exactMatch = source.find((item) => String(item) === strInput);
        if (exactMatch !== undefined) return exactMatch;

        // 如果不允许无效值，返回空字符串
        if (!this.options?.allowInvalid) {
            return "";
        }

        return strInput;
    }

    getEditorOptions() {
        return {
            source: this.options?.source || [],
            allowInvalid: this.options?.allowInvalid ?? false,
            strict: this.options?.strict ?? false,
        };
    }

    compare(a, b, order = "asc") {
        const source = this.options?.source || [];
        const sa = String(a ?? "");
        const sb = String(b ?? "");

        // 如果提供了 source，按 source 中的顺序排序
        if (source.length > 0) {
            const ia = source.findIndex((item) => String(item) === sa);
            const ib = source.findIndex((item) => String(item) === sb);
            const va = ia >= 0 ? ia : Infinity;
            const vb = ib >= 0 ? ib : Infinity;
            return order === "asc" ? va - vb : vb - va;
        }

        return sa.localeCompare(sb, undefined, { numeric: true });
    }
}