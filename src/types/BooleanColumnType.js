import { BaseColumnType } from "./BaseColumnType.js";
import { isBoolean, isNumber, isString } from "../utils/utils.js";
import { SORT_ORDER } from "../constants/enums/SortOrder.js";

/**
 * 布尔列类型
 *
 * 支持：
 * - 显示为勾选/叉号/是/否等自定义标签
 * - 输入时识别 true/false/yes/no/1/0 等
 * - 居中对齐默认样式
 *
 * 配置选项：
 *   labels: { true: '✓', false: '✗' } — 自定义显示标签
 */
export class BooleanColumnType extends BaseColumnType {
    get name() {
        return "boolean";
    }

    get editorType() {
        return "text";
    }

    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: "center" };
    }

    format(value) {
        const boolVal = this.#toBoolean(value);
        if (boolVal === null) return String(value ?? "");

        const labels = this.options?.labels;
        if (labels) {
            return boolVal ? (labels.true ?? "TRUE") : (labels.false ?? "FALSE");
        }
        return boolVal ? "TRUE" : "FALSE";
    }

    validate(value) {
        if (value === "" || value === undefined || value === null) return true;
        const boolVal = this.#toBoolean(value);
        if (boolVal === null) return false;
        return true;
    }

    parse(input) {
        if (input === "" || input === undefined || input === null) return "";

        const boolVal = this.#toBoolean(input);
        if (boolVal !== null) return boolVal;

        // 无法解析，返回原值
        return input;
    }

    compare(a, b, order = "asc") {
        const ba = this.#toBoolean(a);
        const bb = this.#toBoolean(b);
        const va = ba === true ? 1 : ba === false ? 0 : -1;
        const vb = bb === true ? 1 : bb === false ? 0 : -1;
        return order === SORT_ORDER.ASC ? va - vb : vb - va;
    }

    /**
     * 将任意值转为布尔值
     * @param {*} value
     * @returns {boolean|null} null 表示无法识别
     */
    #toBoolean(value) {
        if (isBoolean(value)) return value;
        if (value instanceof Boolean) return value.valueOf(); // 处理 Boolean 对象
        if (isNumber(value)) {
            if (value === 1) return true;
            if (value === 0) return false;
            return null;
        }
        if (isString(value)) {
            const lower = value.trim().toLowerCase();
            if (["true", "yes", "y", "1", "t", "是", "真"].includes(lower)) return true;
            if (["false", "no", "n", "0", "f", "否", "假"].includes(lower)) return false;
        }
        return null;
    }
}