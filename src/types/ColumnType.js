/**
 * 列类型基类
 *
 * 定义数据类型的行为：格式化、验证、解析、默认样式、编辑器选项、排序等。
 * 子类重写 getter 和实例方法来实现不同类型的逻辑。
 * ColumnType 实例直接作为运行时的类型对象使用，无需额外的包装层。
 *
 * 使用方式：
 *   1. 继承 ColumnType，重写 name/editorType/format/validate/parse/getDefaultStyle
 *   2. 在 src/types/index.js 的 registry 中注册
 *   3. 通过 columnsConfig.type 或 cellTypes 指定类型名称
 */
export class ColumnType {
    /**
     * @param {object} [options={}] - 类型配置选项，透传给子类
     */
    constructor(options = {}) {
        this.options = options;
    }

    /** @returns {string} 类型名称 */
    get name() {
        return 'text';
    }

    /** @returns {string} 对应的编辑器类型名 */
    get editorType() {
        return 'text';
    }

    /**
     * 格式化显示值
     * @param {*} value - 原始值
     * @returns {string} 显示文本
     */
    format(value) {
        if (value === undefined || value === null) return '';
        return String(value);
    }

    /**
     * 验证值是否有效
     * @param {*} value - 待验证的值
     * @returns {boolean|string}
     */
    validate(value) {
        return true;
    }

    /**
     * 解析用户输入
     * @param {string} input - 原始输入
     * @returns {*} 解析后的值
     */
    parse(input) {
        return input;
    }

    /**
     * 获取默认样式
     * @param {object} baseStyle - 基础样式
     * @returns {object}
     */
    getDefaultStyle(baseStyle) {
        return baseStyle;
    }

    /**
     * 获取编辑器额外选项（如 select 的 source 列表等）
     * @returns {object}
     */
    getEditorOptions() {
        return {};
    }

    /**
     * 获取该类型的默认值
     * @returns {*}
     */
    getDefaultValue() {
        return '';
    }

    /**
     * 排序比较函数
     * @param {*} a
     * @param {*} b
     * @param {'asc'|'desc'} order
     * @returns {number}
     */
    compare(a, b, order = 'asc') {
        const sa = String(a ?? '');
        const sb = String(b ?? '');
        const result = sa.localeCompare(sb, undefined, { numeric: true });
        return order === 'desc' ? -result : result;
    }
}
