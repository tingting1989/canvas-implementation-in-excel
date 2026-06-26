/**
 * 验证结果类
 *
 * 封装单次验证的结果信息，包括是否通过、错误消息、
 * 错误样式等。
 *
 * @example
 * const result = new ValidationResult(true);
 * const errorResult = new ValidationResult(false, '值超出范围', 'stop');
 */
export class ValidationResult {
    /** @type {boolean} 验证是否通过 */
    valid;

    /** @type {string|null} 错误消息（验证失败时） */
    message;

    /** @type {string} 错误样式：stop|warning|information */
    errorStyle;

    /** @type {string|null} 错误标题 */
    errorTitle;

    /** @type {*} 导致失败的原始值 */
    failedValue;

    /** @type {string|null} 失败的规则ID */
    ruleId;

    /** @type {Date} 验证时间 */
    timestamp;

    /** @type {Object|null} 额外的调试信息 */
    metadata;

    /**
     * 构造验证结果
     * @param {boolean} valid - 是否通过验证
     * @param {string|null} [message=null] - 错误消息
     * @param {string} [errorStyle='stop'] - 错误样式
     */
    constructor(valid, message = null, errorStyle = 'stop') {
        this.valid = valid;
        this.message = message;
        this.errorStyle = errorStyle;
        this.timestamp = new Date();
    }

    /**
     * 创建成功的验证结果
     * @returns {ValidationResult}
     */
    static success() {
        return new ValidationResult(true);
    }

    /**
     * 创建失败的验证结果
     * @param {string} message - 错误消息
     * @param {string} [errorStyle='stop'] - 错误样式
     * @param {Object} [options={}] - 额外选项
     * @returns {ValidationResult}
     */
    static failure(message, errorStyle = 'stop', options = {}) {
        const result = new ValidationResult(false, message, errorStyle);
        result.failedValue = options.value;
        result.ruleId = options.ruleId;
        result.errorTitle = options.errorTitle;
        result.metadata = options.metadata;
        return result;
    }

    /**
     * 转换为简单对象（用于序列化）
     * @returns {Object}
     */
    toJSON() {
        return {
            valid: this.valid,
            message: this.message,
            errorStyle: this.errorStyle,
            errorTitle: this.errorTitle,
            failedValue: this.failedValue,
            ruleId: this.ruleId,
            timestamp: this.timestamp.toISOString(),
            metadata: this.metadata
        };
    }
}