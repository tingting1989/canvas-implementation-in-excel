import { VALIDATION_RULE_TYPE } from "../../constants/enums/ValidationRuleType.js";
import { isString } from "../../utils";

/**
 * 验证规则元数据
 *
 * 桥接器自动生成的规则带有 metadata.source = "column-validation"，
 * 手动规则无此字段（或 source 为其他值）。
 */
export interface ValidationRuleMetadata {
    source?: string;
    columnType?: string;
    column?: number;
    generatedAt?: number;
}

/**
 * 验证规则实体类
 *
 * 用于定义单元格的数据验证规则，包括数值范围、文本长度、
 * 下拉列表、自定义公式等多种验证类型。
 */
export class ValidationRule {
    id: string = "";
    range: string = "";
    type: string = "";
    operator: string | null = null;
    value: any;
    source: string[] | string | null = null;
    formula: string | null = null;
    pattern: string | null = null;
    allowBlank: boolean = true;
    showDropdown: boolean = true;
    showErrorMessage: boolean = true;
    errorMessage: string | null = null;
    errorTitle: string = "输入错误";
    errorStyle: string = "stop";
    inputMessage: string | null = null;
    inputTitle: string = "提示";
    priority: number = 0;
    createdAt!: Date;
    updatedAt!: Date;
    metadata?: ValidationRuleMetadata;

    static #validTypes: Set<string> = new Set(["number", "text", "list", "formula", "date", "time", "datetime", "regex", "unique"]);

    static get VALID_TYPES(): string[] {
        return [...ValidationRule.#validTypes];
    }

    static registerValidType(type: string): void {
        if (!type || !isString(type) || type.trim() === "") {
            throw new Error("验证类型必须为非空字符串");
        }
        ValidationRule.#validTypes.add(type.trim());
    }

    static isValidType(type: string): boolean {
        return ValidationRule.#validTypes.has(type);
    }

    constructor(options: Record<string, any> = {}) {
        Object.assign(this, options);

        if (!this.id) {
            this.id = `vr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        const now = new Date();
        this.createdAt = this.createdAt || now;
        this.updatedAt = now;

        this.#validate();
    }

    #validate(): void {
        if (this.range !== undefined && (!this.range || !isString(this.range) || this.range.trim() === "")) {
            throw new Error("规则无效: range 必须为非空字符串");
        }

        if (this.type && !ValidationRule.isValidType(this.type)) {
            throw new Error(`规则无效: 不支持的验证类型 ${this.type}, 当前支持: ${ValidationRule.VALID_TYPES.join(", ")}`);
        }
    }

    toJSON(): Record<string, any> {
        const result: Record<string, any> = {
            id: this.id,
            range: this.range,
            type: this.type,
            operator: this.operator,
            value: this.value,
            source: this.source,
            formula: this.formula,
            pattern: this.pattern,
            allowBlank: this.allowBlank,
            showDropdown: this.showDropdown,
            showErrorMessage: this.showErrorMessage,
            errorMessage: this.errorMessage,
            errorTitle: this.errorTitle,
            errorStyle: this.errorStyle,
            inputMessage: this.inputMessage,
            inputTitle: this.inputTitle,
            priority: this.priority,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
        };
        if (this.metadata) {
            result.metadata = this.metadata;
        }
        return result;
    }

    static fromJSON(json: Record<string, any>): ValidationRule {
        return new ValidationRule({
            ...json,
            createdAt: new Date(json.createdAt),
            updatedAt: new Date(json.updatedAt),
        });
    }

    validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!this.range) {
            errors.push("缺少必需属性: range");
        }

        if (!this.type) {
            errors.push("缺少必需属性: type");
        }

        if (this.type && !ValidationRule.isValidType(this.type)) {
            errors.push(`无效的验证类型: ${this.type}，当前支持: ${ValidationRule.VALID_TYPES.join(", ")}`);
        }

        if (this.type === VALIDATION_RULE_TYPE.NUMBER && !this.operator) {
            errors.push("数值验证需要指定 operator");
        }

        if (this.type === VALIDATION_RULE_TYPE.LIST && !this.source) {
            errors.push("列表验证需要指定 source");
        }

        if (this.type === VALIDATION_RULE_TYPE.FORMULA && !this.formula) {
            errors.push("公式验证需要指定 formula");
        }

        if (this.type === VALIDATION_RULE_TYPE.REGEX && !this.pattern) {
            errors.push("正则表达式验证需要指定 pattern");
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }
}
