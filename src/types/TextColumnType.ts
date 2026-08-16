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
 * @module types/TextColumnType
 * @see BaseColumnType 列类型基类，定义 name、editorType、format、parse 等接口
 */

import { BaseColumnType } from "./BaseColumnType.js";

export class TextColumnType extends BaseColumnType {
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
        if (value === "" || value === undefined || value === null) return true;
        const str = String(value);
        const maxLength = this.options?.maxLength;
        if (maxLength != null && str.length > maxLength) {
            return `文本长度不能超过 ${maxLength} 个字符`;
        }
        return true;
    }

    parse(input: any): string {
        const trimmed = input?.trim?.() ?? input;

        if (trimmed === "") return "";

        return trimmed;
    }
}
