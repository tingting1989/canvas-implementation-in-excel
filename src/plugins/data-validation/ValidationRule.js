/**
 * 验证规则实体类
 *
 * 用于定义单元格的数据验证规则，包括数值范围、文本长度、
 * 下拉列表、自定义公式等多种验证类型。
 *
 * @example
 * const rule = new ValidationRule({
 *     range: 'A1:A100',
 *     type: 'number',
 *     operator: 'between',
 *     value: [0, 100],
 *     errorMessage: '请输入 0-100 之间的数值'
 * });
 */
export class ValidationRule {
    /** @type {string} 唯一标识符 */
    id;

    /** @type {string} 目标区域（如 "A1:A100"） */
    range;

    /** @type {string} 验证类型：number|text|list|custom|date|time|regex|unique */
    type;

    /** @type {string|null} 运算符：between|notBetween|equalTo|notEqualTo|greaterThan|lessThan|greaterThanOrEqual|lessThanOrEqual|lengthBetween等 */
    operator;

    /** @type {*|*[]} 验证值（根据 type 和 operator 不同而不同） */
    value;

    /** @type {string[]|string|null} 下拉来源（静态数组或动态区域引用） */
    source;

    /** @type {string|null} 自定义公式（仅 type=custom 时使用） */
    formula;

    /** @type {string|null} 正则模式（仅 type=regex 时使用） */
    pattern;

    /** @type {boolean} 是否允许空值（默认 true） */
    allowBlank = true;

    /** @type {boolean} 是否显示下拉箭头（默认 true，仅 type=list 时有效） */
    showDropdown = true;

    /** @type {boolean} 是否显示错误提示（默认 true） */
    showErrorMessage = true;

    /** @type {string|null} 自定义错误消息 */
    errorMessage;

    /** @type {string} 错误标题（默认 "输入错误"） */
    errorTitle = "输入错误";

    /** @type {string} 错误处理方式：stop|warning|information（默认 "stop"） */
    errorStyle = "stop";

    /** @type {string|null} 输入提示消息（当用户选中单元格时显示） */
    inputMessage;

    /** @type {string} 输入提示标题（默认 "提示"） */
    inputTitle = "提示";

    /** @type {number} 规则优先级（数字越小优先级越高，用于多规则冲突解决，默认 0） */
    priority = 0;

    /** @type {Date} 创建时间 */
    createdAt;

    /** @type {Date} 更新时间 */
    updatedAt;

    /** @type {string[]} 允许的验证类型 */
    static VALID_TYPES = ["number", "text", "list", "custom", "date", "time", "regex", "unique"];

    /**
     * 构造验证规则
     * @param {Object} options - 规则配置选项
     */
    constructor(options = {}) {
        Object.assign(this, options);

        if (!this.id) {
            this.id = `vr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        const now = new Date();
        this.createdAt = this.createdAt || now;
        this.updatedAt = now;

        this.#validate();
    }

    /**
     * 验证规则配置的有效性
     * @private
     */
    #validate() {
        if (this.range !== undefined && (!this.range || typeof this.range !== "string" || this.range.trim() === "")) {
            throw new Error("规则无效: range 必须为非空字符串");
        }

        if (this.type && !ValidationRule.VALID_TYPES.includes(this.type)) {
            throw new Error(`规则无效: 不支持的验证类型 ${this.type}, 必须是 ${ValidationRule.VALID_TYPES.join(",")} 之一`);
        }
    }

    /**
     * 序列化为 JSON（用于持久化/导出）
     * @returns {Object}
     */
    toJSON() {
        return {
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
    }

    /**
     * 从 JSON 反序列化
     * @param {Object} json - JSON 对象
     * @returns {ValidationRule}
     */
    static fromJSON(json) {
        const rule = new ValidationRule({
            ...json,
            createdAt: new Date(json.createdAt),
            updatedAt: new Date(json.updatedAt),
        });
        return rule;
    }

    /**
     * 检查规则是否有效
     * @returns {{ valid: boolean, errors: string[] }}
     */
    validate() {
        const errors = [];

        if (!this.range) {
            errors.push("缺少必需属性: range");
        }

        if (!this.type) {
            errors.push("缺少必需属性: type");
        }

        const validTypes = ["number", "text", "list", "custom", "date", "time", "regex", "unique"];
        if (this.type && !validTypes.includes(this.type)) {
            errors.push(`无效的验证类型: ${this.type}，必须是 ${validTypes.join(",")} 之一`);
        }

        if (this.type === "number" && !this.operator) {
            errors.push("数值验证需要指定 operator");
        }

        if (this.type === "list" && !this.source) {
            errors.push("列表验证需要指定 source");
        }

        if (this.type === "custom" && !this.formula) {
            errors.push("自定义公式验证需要指定 formula");
        }

        if (this.type === "regex" && !this.pattern) {
            errors.push("正则表达式验证需要指定 pattern");
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }
}