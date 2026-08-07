/**
 * 文本列类型（TextColumnType）
 *
 * 最基础的列类型，提供纯文本的格式化、验证和解析能力。
 * 作为所有列类型的默认回退，当未指定列类型时使用本类。
 *
 * ## 核心行为
 *
 * - **格式化**：将任意值转为字符串，空值返回 ""
 * - **验证**：可选的 maxLength 长度限制检查
 * - **解析**：自动 trim 首尾空白字符，空字符串返回 ""
 *
 * ## 设计原则
 *
 * parse() 只负责 trim 和类型转换，不做长度截断。
 * 长度限制由 validate() 检查，或由 UI 层（编辑器的 maxlength 属性）处理。
 * 这确保了数据完整性：用户可以看到完整的输入内容并收到错误提示，
 * 而不是输入被静默截断。
 *
 * ## 自定义选项（this.options）
 *
 * | 选项       | 类型   | 默认值 | 说明                             |
 * |------------|--------|--------|----------------------------------|
 * | maxLength  | number | —      | 文本最大长度限制（字符数），null 表示不限制 |
 *
 * @module types/TextColumnType
 * @see BaseColumnType 列类型基类，定义 name、editorType、format、parse 等接口
 */

import { BaseColumnType } from "./BaseColumnType.js";

export class TextColumnType extends BaseColumnType {
    /** @type {string} 类型名称标识 */
    get name() {
        return "text";
    }

    /** @type {string} 关联的编辑器类型（文本使用文本编辑器） */
    get editorType() {
        return "text";
    }

    /**
     * 格式化文本值为显示文本
     *
     * 将任意值转为字符串。undefined 和 null 返回空字符串。
     * 其他类型（数字、布尔等）通过 String() 转换。
     *
     * @param {*} value - 原始值
     * @returns {string} 格式化后的文本，空值返回 ""
     */
    format(value) {
        if (value === undefined || value === null) return "";
        return String(value);
    }

    /**
     * 验证文本值是否有效
     *
     * 验证规则：
     * - 空值（""/undefined/null）合法
     * - 如果配置了 maxLength，检查文本长度是否超出限制
     * - 超出限制时返回错误信息字符串
     *
     * @param {*} value - 待验证的值
     * @returns {true|string} true 表示有效，字符串表示错误信息
     */
    validate(value) {
        if (value === "" || value === undefined || value === null) return true;
        const str = String(value);
        const maxLength = this.options?.maxLength;
        if (maxLength != null && str.length > maxLength) {
            return `文本长度不能超过 ${maxLength} 个字符`;
        }
        return true;
    }

    /**
     * 解析用户输入为存储值
     *
     * 解析策略：
     * - 自动 trim 首尾空白字符
     * - 空字符串返回 ""
     * - 不做长度截断（长度限制由 validate() 负责）
     *
     * 设计原则：parse() 只负责 trim 和类型转换，不做长度截断。
     * 长度限制由 validate() 检查，或由 UI 层（编辑器的 maxlength 属性）处理。
     * 这确保了数据完整性：用户可以看到完整的输入内容并收到错误提示，
     * 而不是输入被静默截断。
     *
     * @param {*} input - 用户输入值
     * @returns {string} 解析后的文本（已 trim），空输入返回 ""
     */
    parse(input) {
        const trimmed = input?.trim?.() ?? input;

        if (trimmed === "") return "";

        return trimmed;
    }
}
