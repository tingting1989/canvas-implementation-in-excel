import { BaseValidator } from "./BaseValidator.js";
import { ValidationResult } from "../ValidationResult.js";
import type { ValidationRule } from "../ValidationRule.js";

/**
 * 时间范围验证器
 *
 * 用于验证时间类型的数据，支持 HH:mm 或 HH:mm:ss 格式。
 */
export class TimeValidator extends BaseValidator {
    static get TYPE(): string {
        return "time";
    }

    validate(value: any, rule: ValidationRule, context: Record<string, any> = {}): Promise<ValidationResult> {
        const { isBlank, allowed } = this.checkBlank(value, rule);
        if (isBlank) {
            return Promise.resolve(
                allowed
                    ? ValidationResult.success()
                    : ValidationResult.failure(rule.errorMessage || "不允许为空", rule.errorStyle, { ruleId: rule.id }),
            );
        }

        const timeValue = this.parseTime(value);

        if (timeValue === null) {
            return Promise.resolve(
                ValidationResult.failure(rule.errorMessage || `"${value}" 不是有效的时间格式（HH:mm 或 HH:mm:ss）`, rule.errorStyle, {
                    value,
                    ruleId: rule.id,
                }),
            );
        }

        try {
            const [minTime, maxTime] = this.parseTimeRange(rule.value);
            let isValid: boolean;

            switch (rule.operator) {
                case "before":
                    isValid = timeValue < (maxTime ?? minTime);
                    break;
                case "after":
                    isValid = timeValue > minTime;
                    break;
                case "between":
                    isValid = timeValue >= minTime && timeValue <= (maxTime ?? minTime);
                    break;
                case "notBetween":
                    isValid = timeValue < minTime || timeValue > (maxTime ?? minTime);
                    break;
                case "equalTo":
                    isValid = Math.abs(timeValue - minTime) < 1;
                    break;
                case "notEqualTo":
                    isValid = Math.abs(timeValue - minTime) >= 1;
                    break;
                default:
                    throw new Error(`不支持的运算符: ${rule.operator}`);
            }

            return Promise.resolve(
                isValid
                    ? ValidationResult.success()
                    : ValidationResult.failure(this.buildErrorMessage(timeValue, rule), rule.errorStyle, { value, ruleId: rule.id }),
            );
        } catch (error: any) {
            return Promise.resolve(ValidationResult.failure(`时间验证失败: ${error.message}`, "warning", { value, ruleId: rule.id }));
        }
    }

    parseTime(value: any): number | null {
        if (typeof value !== "string") return null;

        const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return null;

        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const seconds = match[3] ? parseInt(match[3]) : 0;

        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
            return null;
        }

        return hours * 60 + minutes + seconds / 60;
    }

    parseTimeRange(value: any): [number, number | undefined] {
        if (Array.isArray(value)) {
            return [this.parseTime(value[0]) || 0, this.parseTime(value[1]) ?? undefined];
        }

        const time = this.parseTime(value) || 0;
        return [time, undefined];
    }

    formatTime(minutes: number): string {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    }

    buildErrorMessage(timeValue: number, rule: ValidationRule): string {
        if (rule.errorMessage) return rule.errorMessage;

        const [min, max] = this.parseTimeRange(rule.value);

        switch (rule.operator) {
            case "before":
                return `时间必须在 ${this.formatTime(min)} 之前`;
            case "after":
                return `时间必须在 ${this.formatTime(max ?? min)} 之后`;
            case "between":
                return `时间必须在 ${this.formatTime(min)} 和 ${this.formatTime(max ?? min)} 之间`;
            case "notBetween":
                return `时间不能在 ${this.formatTime(min)} 和 ${this.formatTime(max ?? min)} 之间`;
            case "equalTo":
                return `时间必须等于 ${this.formatTime(min)}`;
            case "notEqualTo":
                return `时间不能等于 ${this.formatTime(min)}`;
            default:
                return "时间验证失败";
        }
    }
}
