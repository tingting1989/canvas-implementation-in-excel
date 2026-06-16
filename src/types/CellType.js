/**
 * 单元格类型基类
 *
 * 定义单元格级别的类型行为：格式化、验证、解析、默认样式、编辑器选项等。
 * 每个 CellType 实例由 ColumnType.createCellType() 创建，绑定到具体列类型的配置。
 */
export class CellType {
    /**
     * @param {object} options
     * @param {string} [options.name='text'] - 类型名称
     * @param {string} [options.editorType='text'] - 对应的编辑器类型
     * @param {Function} [options.format] - 格式化函数 (value, options) => string
     * @param {Function} [options.validate] - 验证函数 (value, options) => true|false|string
     * @param {Function} [options.parse] - 解析函数 (input, options) => parsedValue
     * @param {Function} [options.getDefaultStyle] - 默认样式函数 (baseStyle, options) => style
     * @param {object} [options.editorOptions] - 传递给编辑器的额外选项
     * @param {*} [options.defaultValue] - 该类型的默认值
     * @param {Function} [options.compareFn] - 排序比较函数 (a, b, order) => number
     */
    constructor({
        name,
        editorType,
        format,
        validate,
        parse,
        getDefaultStyle,
        editorOptions,
        defaultValue,
        compareFn,
    } = {}) {
        this.name = name || 'text';
        this.editorType = editorType || 'text';
        this.editorOptions = editorOptions || {};
        this.defaultValue = defaultValue !== undefined ? defaultValue : '';
        this._formatFn = format || null;
        this._validateFn = validate || null;
        this._parseFn = parse || null;
        this._getDefaultStyleFn = getDefaultStyle || null;
        this._compareFn = compareFn || null;
    }

    /**
     * 格式化显示值
     * @param {*} value - 原始值
     * @returns {string} 显示文本
     */
    format(value) {
        if (this._formatFn) return this._formatFn(value);
        if (value === undefined || value === null) return '';
        return String(value);
    }

    /**
     * 验证值是否有效
     * @param {*} value - 待验证的值
     * @returns {boolean|string} true=有效, false=无效, string=错误消息
     */
    validate(value) {
        if (this._validateFn) return this._validateFn(value);
        return true;
    }

    /**
     * 解析输入值（编辑器 blur 后调用）
     * @param {string} input - 用户输入的原始字符串
     * @returns {*} 解析后的值
     */
    parse(input) {
        if (this._parseFn) return this._parseFn(input);
        return input;
    }

    /**
     * 获取该类型的默认样式（叠加在 baseStyle 之上）
     * @param {object} baseStyle - 基础样式对象
     * @returns {object} 合并后的样式对象
     */
    getDefaultStyle(baseStyle) {
        if (this._getDefaultStyleFn) return this._getDefaultStyleFn(baseStyle);
        return baseStyle;
    }

    /**
     * 排序比较
     * @param {*} a - 值 A
     * @param {*} b - 值 B
     * @param {'asc'|'desc'} order - 排序方向
     * @returns {number} 负数=a在前, 正数=b在前
     */
    compare(a, b, order = 'asc') {
        if (this._compareFn) return this._compareFn(a, b, order);

        const sa = String(a ?? '');
        const sb = String(b ?? '');
        const result = sa.localeCompare(sb, undefined, { numeric: true });
        return order === 'desc' ? -result : result;
    }
}
