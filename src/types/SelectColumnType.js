import { BaseColumnType } from "./BaseColumnType.js";
import { SORT_ORDER } from "../constants/enums/SortOrder.js";

/**
 * 下拉选择列类型
 *
 * 支持：
 * - 从预定义列表中选择值
 * - 支持两种 source 格式：
 *   1. 简单数组：['选项A', '选项B', '选项C']
 *   2. 对象数组：[{value: '0', label: '好'}, {value: '1', label: '中'}]
 * - 可配置是否允许输入自定义值
 * - 验证值是否在允许的列表中
 *
 * 配置选项：
 *   source: string[] | Object[] — 可选值列表（必需）
 *     - 简单格式：['A', 'B', 'C']
 *     - 对象格式：[{value: 'val1', label: '显示文本'}, ...]
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

    /**
     * 判断 source 是否为对象数组格式
     * @returns {boolean}
     */
    #isObjectArraySource() {
        const source = this.source;
        return Array.isArray(source) && source.length > 0 && typeof source[0] === "object" && source[0] !== null && "value" in source[0];
    }

    /**
     * 根据 value 获取显示的 label
     * @param {*} value - 存储的值
     * @returns {string} 显示的文本
     */
    #getLabelByValue(value) {
        if (value === undefined || value === null || value === "") return "";

        const source = this.source;

        if (!Array.isArray(source) || source.length === 0) {
            return String(value);
        }

        if (this.#isObjectArraySource()) {
            const item = source.find((item) => item.value === value || String(item.value) === String(value));
            return item ? (item.label ?? item.value ?? "") : String(value);
        }

        return String(value);
    }

    /**
     * 获取所有有效的 values（用于验证）
     * @returns {*[]}
     */
    #getValidValues() {
        const source = this.source;
        if (!Array.isArray(source)) return [];

        if (this.#isObjectArraySource()) {
            return source.map((item) => item.value).filter((v) => v !== undefined && v !== null);
        }

        return [...source];
    }

    format(value) {
        if (value === undefined || value === null) return "";

        return this.#getLabelByValue(value);
    }

    validate(value) {
        if (value === "" || value === undefined || value === null) return true;

        const validValues = this.#getValidValues();
        if (validValues.length === 0) return true;

        const strValue = String(value);
        const found = validValues.some((v) => v === value || String(v) === strValue);

        if (!found && !this.options?.allowInvalid) {
            return false;
        }

        return true;
    }

    parse(input) {
        if (input === "" || input === undefined || input === null) return "";

        const source = this.source;
        if (!Array.isArray(source) || source.length === 0) return String(input);

        const strInput = String(input).trim();

        if (this.#isObjectArraySource()) {
            const item = source.find(
                (item) => item.value === input || item.value === strInput || String(item.value) === strInput || item.label === strInput,
            );

            if (item) {
                return item.value;
            }
        } else {
            const exactMatch = source.find((item) => item === input || String(item) === strInput);
            if (exactMatch !== undefined) return exactMatch;
        }

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

        if (this.#isObjectArraySource()) {
            const getValueIndex = (val) => {
                if (val === undefined || val === null) return Infinity;
                return source.findIndex((item) => item.value === val || String(item.value) === String(val));
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
            const ia = source.findIndex((item) => String(item) === sa);
            const ib = source.findIndex((item) => String(item) === sb);
            const va = ia >= 0 ? ia : Infinity;
            const vb = ib >= 0 ? ib : Infinity;
            return order === SORT_ORDER.ASC ? va - vb : vb - va;
        }

        return sa.localeCompare(sb, undefined, { numeric: true });
    }
}
