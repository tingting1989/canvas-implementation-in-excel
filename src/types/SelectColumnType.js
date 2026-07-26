/**
 * 下拉选择列类型（SelectColumnType）
 *
 * 提供从预定义选项列表中选择值的能力，支持简单数组和对象数组两种数据源格式。
 * 适用于需要限制用户输入范围的场景，如状态选择、分类标注、优先级设置等。
 *
 * ## 数据源格式（options.source）
 *
 * | 格式       | 示例                                            | 存储值   | 显示文本   |
 * |------------|-------------------------------------------------|----------|------------|
 * | 简单数组   | ["选项A", "选项B", "选项C"]                     | 原值本身 | 原值本身   |
 * | 对象数组   | [{ value: "0", label: "好" }, ...]              | value    | label      |
 *
 * 对象数组格式实现了「存储值」与「显示文本」的分离：
 * - 存储到数据模型中的是 value（如 "0"）
 * - 单元格中显示的是 label（如 "好"）
 *
 * ## 值解析（parse）
 *
 * - 对象数组：支持按 value 或 label 匹配，匹配成功返回对应的 value
 * - 简单数组：支持严格匹配（类型和值都一致）或字符串匹配
 * - 未匹配且 allowInvalid = false：返回空字符串（拒绝无效输入）
 * - 未匹配且 allowInvalid = true：返回输入的字符串形式
 *
 * ## 值验证（validate）
 *
 * - 空值合法
 * - 非空值必须在有效值列表中（严格匹配或字符串匹配）
 * - allowInvalid = true 时，不在列表中的值也视为合法
 *
 * ## 排序（compare）
 *
 * - 有 source 时：按选项在 source 中的索引排序（非列表中的值排到最后）
 * - 无 source 时：按字符串自然排序（localeCompare + numeric）
 *
 * ## 自定义选项（this.options）
 *
 * | 选项            | 类型             | 默认值 | 说明                                           |
 * |-----------------|------------------|--------|------------------------------------------------|
 * | source          | Array            | []     | 可选值列表（必需，简单数组或对象数组）         |
 * | allowInvalid    | boolean          | false  | 是否允许不在列表中的值                         |
 * | strict          | boolean          | false  | 严格模式，仅允许选择不能手动输入               |
 *
 * @module types/SelectColumnType
 * @see BaseColumnType 列类型基类，定义 name、editorType、format、parse 等接口
 * @see SORT_ORDER 排序顺序枚举
 */

import { BaseColumnType } from "./BaseColumnType.js";
import { SORT_ORDER } from "../constants/enums/SortOrder.js";

export class SelectColumnType extends BaseColumnType {
    /** @type {string} 类型名称标识 */
    get name() {
        return "select";
    }

    /** @type {string} 关联的编辑器类型（下拉选择使用 select 编辑器） */
    get editorType() {
        return "select";
    }

    /**
     * 获取可选值列表
     *
     * 从 options.source 读取，未配置时返回空数组。
     * 支持简单数组（["A", "B"]）和对象数组（[{value, label}]）两种格式。
     *
     * @type {Array}
     */
    get source() {
        return this.options?.source || [];
    }

    /**
     * 判断 source 是否为对象数组格式
     *
     * 判断条件：source 是非空数组，且第一个元素是包含 value 属性的对象。
     * 一旦判定为对象数组格式，整个 source 都按对象数组处理。
     *
     * @returns {boolean} 是否为对象数组格式
     */
    #isObjectArraySource() {
        const source = this.source;
        return Array.isArray(source) && source.length > 0 && typeof source[0] === "object" && source[0] !== null && "value" in source[0];
    }

    /**
     * 根据存储值获取显示文本（label）
     *
     * 查找逻辑：
     * - 对象数组：在 source 中查找 value 匹配的项，返回其 label（label 不存在时回退到 value）
     * - 简单数组：直接将值转为字符串
     * - 空源或未匹配：将值转为字符串
     *
     * 匹配方式：严格相等（===）优先，回退到字符串比较（String() 转换后比较），
     * 确保数字 "1" 和 1 能正确匹配。
     *
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
            // 对象数组：查找 value 匹配的项，返回 label
            const item = source.find((item) => item.value === value || String(item.value) === String(value));
            return item ? (item.label ?? item.value ?? "") : String(value);
        }

        // 简单数组：直接返回字符串形式
        return String(value);
    }

    /**
     * 获取所有有效的存储值列表（用于验证）
     *
     * - 对象数组：提取所有项的 value 属性（过滤 undefined/null）
     * - 简单数组：返回 source 的浅拷贝
     *
     * @returns {Array} 有效值列表
     */
    #getValidValues() {
        const source = this.source;
        if (!Array.isArray(source)) return [];

        if (this.#isObjectArraySource()) {
            return source.map((item) => item.value).filter((v) => v !== undefined && v !== null);
        }

        return [...source];
    }

    /**
     * 格式化选择值为显示文本
     *
     * 将存储值转换为用户可见的显示文本：
     * - 对象数组：value → label
     * - 简单数组：值本身即为显示文本
     * - 空值：返回 ""
     *
     * @param {*} value - 存储的值
     * @returns {string} 显示文本
     */
    format(value) {
        if (value === undefined || value === null) return "";

        return this.#getLabelByValue(value);
    }

    /**
     * 验证选择值是否有效
     *
     * 验证规则：
     * - 空值（""/undefined/null）合法
     * - source 为空时，任何值都合法
     * - 非空值必须在有效值列表中（严格匹配或字符串匹配）
     * - allowInvalid = true 时，不在列表中的值也合法
     *
     * @param {*} value - 待验证的值
     * @returns {true|false} true 表示有效，false 表示无效
     */
    validate(value) {
        if (value === "" || value === undefined || value === null) return true;

        const validValues = this.#getValidValues();
        // source 为空时无法验证，一律通过
        if (validValues.length === 0) return true;

        // 严格匹配或字符串匹配
        const strValue = String(value);
        const found = validValues.some((v) => v === value || String(v) === strValue);

        if (!found && !this.options?.allowInvalid) {
            return false;
        }

        return true;
    }

    /**
     * 解析用户输入为存储值
     *
     * 解析策略：
     * - 对象数组：按 value 或 label 匹配，匹配成功返回对应的 value
     * - 简单数组：严格匹配或字符串匹配，匹配成功返回原值
     * - 未匹配且 allowInvalid = false：返回空字符串（拒绝无效输入）
     * - 未匹配且 allowInvalid = true：返回输入的字符串形式
     * - 空输入：返回 ""
     *
     * @param {*} input - 用户输入值
     * @returns {*} 解析后的存储值（可能是原始类型或字符串）
     */
    parse(input) {
        if (input === "" || input === undefined || input === null) return "";

        const source = this.source;
        // source 为空时，直接返回字符串形式
        if (!Array.isArray(source) || source.length === 0) return String(input);

        const strInput = String(input).trim();

        if (this.#isObjectArraySource()) {
            // 对象数组：支持按 value 或 label 匹配
            const item = source.find(
                (item) => item.value === input || item.value === strInput || String(item.value) === strInput || item.label === strInput,
            );

            if (item) {
                return item.value;
            }
        } else {
            // 简单数组：严格匹配或字符串匹配
            const exactMatch = source.find((item) => item === input || String(item) === strInput);
            if (exactMatch !== undefined) return exactMatch;
        }

        // 未匹配：根据 allowInvalid 决定是否接受
        if (!this.options?.allowInvalid) {
            return "";
        }

        return strInput;
    }

    /**
     * 获取传递给编辑器的配置选项
     *
     * 将 this.options 中的编辑器相关配置提取出来，
     * 供 SelectEditor 使用。
     *
     * @returns {object} 编辑器配置
     * @returns {Array} returns.source - 可选值列表
     * @returns {boolean} returns.allowInvalid - 是否允许无效值
     * @returns {boolean} returns.strict - 是否为严格模式（仅选择，不可手动输入）
     */
    getEditorOptions() {
        return {
            source: this.options?.source || [],
            allowInvalid: this.options?.allowInvalid ?? false,
            strict: this.options?.strict ?? false,
        };
    }

    /**
     * 比较两个选择值的大小（用于排序）
     *
     * 排序策略：
     * - **对象数组**：按 value 在 source 中的索引排序，未找到的值排到最后（Infinity）
     * - **简单数组且有 source**：按值在 source 中的索引排序，未找到的值排到最后
     * - **无 source**：按字符串自然排序（localeCompare + numeric 模式）
     *
     * @param {*} a - 第一个值
     * @param {*} b - 第二个值
     * @param {string} [order="asc"] - 排序顺序（"asc" 升序 / "desc" 降序）
     * @returns {number} 比较结果（负数 / 0 / 正数）
     */
    compare(a, b, order = "asc") {
        const source = this.options?.source || [];

        if (this.#isObjectArraySource()) {
            // 对象数组：按 value 在 source 中的索引排序
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
            // 简单数组：按值在 source 中的索引排序
            const ia = source.findIndex((item) => String(item) === sa);
            const ib = source.findIndex((item) => String(item) === sb);
            const va = ia >= 0 ? ia : Infinity;
            const vb = ib >= 0 ? ib : Infinity;
            return order === SORT_ORDER.ASC ? va - vb : vb - va;
        }

        // 无 source：字符串自然排序
        return sa.localeCompare(sb, undefined, { numeric: true });
    }
}
