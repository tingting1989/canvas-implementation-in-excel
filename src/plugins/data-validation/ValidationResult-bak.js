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
    constructor(valid, message = null, errorStyle = "stop") {
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
     * 创建被取消的验证结果（用户通过 before 钩子拦截）
     * @returns {ValidationResult}
     */
    static cancelled() {
        const result = new ValidationResult(true);
        result.cancelled = true;
        result.message = "验证被用户拦截";
        return result;
    }

    /**
     * 创建失败的验证结果
     * @param {string} message - 错误消息
     * @param {string} [errorStyle='stop'] - 错误样式
     * @param {Object} [options={}] - 额外选项
     * @returns {ValidationResult}
     */
    static failure(message, errorStyle = "stop", options = {}) {
        const result = new ValidationResult(false, message, errorStyle);
        result.failedValue = options.value;
        result.ruleId = options.ruleId;
        result.errorTitle = options.errorTitle;
        result.metadata = options.metadata;
        return result;
    }

    /**
     * 创建延迟验证结果（v3.0 新增）
     *
     * 用于同步快速通道无法立即完成验证的场景：
     * - 公式复杂度过高，需要异步管道处理
     * - FormulaEngine 不可用时的降级方案
     *
     * 特点：
     * - valid = true（允许输入继续）
     * - deferred = true（标记需要异步复核）
     * - 包含元数据供后续异步验证使用
     *
     * @param {string} [message='需要异步验证'] - 提示消息
     * @param {Object} [metadata={}] - 延迟验证的元数据
     * @returns {ValidationResult}
     */
    static deferred(message = "需要异步验证", metadata = {}) {
        const result = new ValidationResult(true, message, "warning");
        result.deferred = true; // 标记为延迟验证
        result.needsAsyncValidation = metadata.needsAsyncValidation || false;
        result.complexity = metadata.complexity || null;
        result.estimatedTime = metadata.estimatedTime || null;
        result.reasons = metadata.reasons || [];
        result.metadata = metadata;
        return result;
    }

    /**
     * 转换为简单对象（用于序列化）v3.0 增强
     * @returns {Object}
     */
    toJSON() {
        return {
            valid: this.valid,
            cancelled: this.cancelled || false,
            deferred: this.deferred || false, // v3.0 新增
            needsAsyncValidation: this.needsAsyncValidation || false, // v3.0 新增
            message: this.message,
            errorStyle: this.errorStyle,
            errorTitle: this.errorTitle,
            failedValue: this.failedValue,
            ruleId: this.ruleId,
            timestamp: this.timestamp.toISOString(),
            complexity: this.complexity || null, // v3.0 新增
            estimatedTime: this.estimatedTime || null, // v3.0 新增
            reasons: this.reasons || [], // v3.0 新增
            metadata: this.metadata,
        };
    }
}
