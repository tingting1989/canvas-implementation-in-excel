/**
 * 数据验证规则类型枚举
 * @description 定义单元格数据验证的规则类型，用于限制和校验用户输入的数据格式和范围
 * @constant
 */
export type ValidationRuleTypeValue = "number" | "text" | "list" | "formula" | "date" | "time" | "datetime" | "regex" | "unique";

export interface ValidationRuleType {
    /** 数字验证，限制输入必须为数字，可设定取值范围（大于、小于、介于等） */
    readonly NUMBER: "number";
    /** 文本验证，限制输入必须为文本，可设定长度限制或内容匹配规则 */
    readonly TEXT: "text";
    /** 列表验证，提供下拉列表供用户选择，确保输入值为预定义选项之一 */
    readonly LIST: "list";
    /** 公式验证，使用 Excel 公式进行复杂的验证逻辑判断（如 =AND(A1>0, A1<100)） */
    readonly FORMULA: "formula";
    /** 日期验证，限制输入必须为有效日期格式，可设定日期范围 */
    readonly DATE: "date";
    /** 时间验证，限制输入必须为有效时间格式，可设定时间范围 */
    readonly TIME: "time";
    /** 日期时间验证，限制输入必须为有效日期时间格式，可设定日期时间范围 */
    readonly DATETIME: "datetime";
    /** 正则表达式验证，使用正则表达式模式匹配输入内容的格式 */
    readonly REGEX: "regex";
    /** 唯一性验证，确保输入值在指定范围内不重复，适用于主键或唯一标识字段 */
    readonly UNIQUE: "unique";
}

export const VALIDATION_RULE_TYPE: ValidationRuleType = Object.freeze({
    NUMBER: "number",
    TEXT: "text",
    LIST: "list",
    FORMULA: "formula",
    DATE: "date",
    TIME: "time",
    DATETIME: "datetime",
    REGEX: "regex",
    UNIQUE: "unique",
});
