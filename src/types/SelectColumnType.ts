/**
 * 下拉选择列类型（SelectColumnType）
 *
 * 提供从预定义选项列表中选择值的能力，支持简单数组和对象数组两种数据源格式。
 * 适用于需要限制用户输入范围的场景，如状态选择、分类标注、优先级设置等。
 *
 * @module types/SelectColumnType
 * @see BaseColumnType 列类型基类，定义 name、editorType、format、parse 等接口
 * @see SORT_ORDER 排序顺序枚举
 */

import { BaseColumnType } from "./BaseColumnType.js";
import { SORT_ORDER } from "../constants/enums/SortOrder.js";

export class SelectColumnType extends BaseColumnType {
    get name(): string {
        return "select";
    }

    get editorType(): string {
        return "select";
    }

    get source(): any[] {
        return this.options?.source || [];
    }

    #isObjectArraySource(): boolean {
        const source = this.source;
        return Array.isArray(source) && source.length > 0 && typeof source[0] === "object" && source[0] !== null && "value" in source[0];
    }

    #getLabelByValue(value: any): string {
        if (value === undefined || value === null || value === "") return "";

        const source = this.source;

        if (!Array.isArray(source) || source.length === 0) {
            return String(value);
        }

        if (this.#isObjectArraySource()) {
            const item = source.find((item: any) => item.value === value || String(item.value) === String(value));
            return item ? (item.label ?? item.value ?? "") : String(value);
        }

        return String(value);
    }

    #getValidValues(): any[] {
        const source = this.source;
        if (!Array.isArray(source)) return [];

        if (this.#isObjectArraySource()) {
            return source.map((item: any) => item.value).filter((v: any) => v !== undefined && v !== null);
        }

        return [...source];
    }

    format(value: any): string {
        if (value === undefined || value === null) return "";

        return this.#getLabelByValue(value);
    }

    validate(value: any): boolean {
        if (value === "" || value === undefined || value === null) return true;

        const validValues = this.#getValidValues();
        if (validValues.length === 0) return true;

        const strValue = String(value);
        const found = validValues.some((v: any) => v === value || String(v) === strValue);

        if (!found && !this.options?.allowInvalid) {
            return false;
        }

        return true;
    }

    parse(input: any): any {
        if (input === "" || input === undefined || input === null) return "";

        const source = this.source;
        if (!Array.isArray(source) || source.length === 0) return String(input);

        const strInput = String(input).trim();

        if (this.#isObjectArraySource()) {
            const item = source.find(
                (item: any) => item.value === input || item.value === strInput || String(item.value) === strInput || item.label === strInput,
            );

            if (item) {
                return item.value;
            }
        } else {
            const exactMatch = source.find((item: any) => item === input || String(item) === strInput);
            if (exactMatch !== undefined) return exactMatch;
        }

        if (!this.options?.allowInvalid) {
            return "";
        }

        return strInput;
    }

    getEditorOptions(): Record<string, any> {
        return {
            source: this.options?.source || [],
            allowInvalid: this.options?.allowInvalid ?? false,
            strict: this.options?.strict ?? false,
        };
    }

    compare(a: any, b: any, order: string = "asc"): number {
        const source = this.options?.source || [];

        if (this.#isObjectArraySource()) {
            const getValueIndex = (val: any): number => {
                if (val === undefined || val === null) return Infinity;
                return source.findIndex((item: any) => item.value === val || String(item.value) === String(val));
            };

            const ia = getValueIndex(a);
            const ib = getValueIndex(b);
            const va = ia >= 0 ? ia : Infinity;
            const vb = ib >= 0 ? ib : Infinity;
            return order === SORT_ORDER.ASC ? va - vb : vb - va;
        }

        const sa = String(a ?? "");
        const sb = String(b ?? "");

        if (source.length > 0) {
            const ia = source.findIndex((item: any) => String(item) === sa);
            const ib = source.findIndex((item: any) => String(item) === sb);
            const va = ia >= 0 ? ia : Infinity;
            const vb = ib >= 0 ? ib : Infinity;
            return order === SORT_ORDER.ASC ? va - vb : vb - va;
        }

        return sa.localeCompare(sb, undefined, { numeric: true });
    }
}
