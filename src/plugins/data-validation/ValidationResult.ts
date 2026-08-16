/**
 * 验证结果类
 *
 * 封装单次验证的结果信息，包括是否通过、错误消息、
 * 错误样式等。
 */
export class ValidationResult {
    valid: boolean;
    message: string | null;
    errorStyle: string;
    errorTitle: string | null;
    failedValue: any;
    ruleId: string | null;
    timestamp: Date;
    metadata: Record<string, any> | null;
    cancelled?: boolean;
    deferred?: boolean;
    needsAsyncValidation?: boolean;
    complexity?: number | null;
    estimatedTime?: number | null;
    reasons?: string[];
    row?: number;
    col?: number;
    value?: any;
    source?: string;

    constructor(valid: boolean, message: string | null = null, errorStyle: string = "stop") {
        this.valid = valid;
        this.message = message;
        this.errorStyle = errorStyle;
        this.timestamp = new Date();
    }

    static success(extra?: Record<string, any>): ValidationResult {
        const result = new ValidationResult(true);
        if (extra) Object.assign(result, extra);
        return result;
    }

    static cancelled(): ValidationResult {
        const result = new ValidationResult(true);
        result.cancelled = true;
        result.message = "验证被用户拦截";
        return result;
    }

    static failure(message: string, errorStyle: string = "stop", options: Record<string, any> = {}): ValidationResult {
        const result = new ValidationResult(false, message, errorStyle);
        result.failedValue = options.value;
        result.ruleId = options.ruleId;
        result.errorTitle = options.errorTitle;
        result.metadata = options.metadata;
        return result;
    }

    static deferred(message: string = "需要异步验证", metadata: Record<string, any> = {}): ValidationResult {
        const result = new ValidationResult(true, message, "warning");
        result.deferred = true;
        result.needsAsyncValidation = metadata.needsAsyncValidation || false;
        result.complexity = metadata.complexity || null;
        result.estimatedTime = metadata.estimatedTime || null;
        result.reasons = metadata.reasons || [];
        result.metadata = metadata;
        return result;
    }

    toJSON(): Record<string, any> {
        return {
            valid: this.valid,
            cancelled: this.cancelled || false,
            deferred: this.deferred || false,
            needsAsyncValidation: this.needsAsyncValidation || false,
            message: this.message,
            errorStyle: this.errorStyle,
            errorTitle: this.errorTitle,
            failedValue: this.failedValue,
            ruleId: this.ruleId,
            timestamp: this.timestamp.toISOString(),
            complexity: this.complexity || null,
            estimatedTime: this.estimatedTime || null,
            reasons: this.reasons || [],
            metadata: this.metadata,
        };
    }
}
