/**
 * 列类型基类
 *
 * 定义数据类型的行为：格式化、验证、解析、默认样式、编辑器选项、排序等。
 * 子类重写 getter 和实例方法来实现不同类型的逻辑。
 * BaseColumnType 实例直接作为运行时的类型对象使用，无需额外的包装层。
 *
 * 使用方式：
 *   1. 继承 BaseColumnType，重写 name/editorType/format/validate/parse/getDefaultStyle
 *   2. 在 src/types/index.js 的 registry 中注册
 *   3. 通过 columnsConfig.type columns 或 cellTypes 指定类型名称
 */
import { SORT_ORDER } from "../constants/enums/SortOrder.js";

export class BaseColumnType {
    /**
     * @param {object} [options={}] - 类型配置选项，透传给子类
     */
    constructor(options = {}) {
        this.options = options;
    }

    /** @returns {string} 类型名称 */
    get name() {
        return "text";
    }

    /** @returns {string} 对应的编辑器类型名 */
    get editorType() {
        return "text";
    }

    /**
     * 格式化显示值
     * @param {*} value - 原始值
     * @returns {string} 显示文本
     */
    format(value) {
        if (value === undefined || value === null) return "";
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
        return "";
    }

    /**
     * 排序比较函数
     * @param {*} a
     * @param {*} b
     * @param {'asc'|'desc'} order
     * @returns {number}
     */
    compare(a, b, order = SORT_ORDER.ASC) {
        const sa = String(a ?? "");
        const sb = String(b ?? "");
        const result = sa.localeCompare(sb, undefined, { numeric: true });
        return order === SORT_ORDER.DESC ? -result : result;
    }

    /**
     * 自定义渲染方法（可选）⭐ 新增
     *
     * 当此方法存在时，TileRenderer 会调用它替代默认的文本渲染。
     * 接收 CellRenderContext 对象，包含 Canvas 上下文和单元格全部信息。
     *
     * 基类提供空实现，子类可选择性重写以实现自定义绘制逻辑。
     *
     * @param {import('./CellRenderContext.js').CellRenderContext} context - 单元格渲染上下文
     * @returns {void}
     *
     * @example
     * class ProgressBarType extends BaseColumnType {
     *     render(context) {
     *         const { ctx, x, y, width, height, value } = context;
     *         const percent = Math.min(100, Math.max(0, value));
     *
     *         ctx.fillStyle = '#e0e0e0';
     *         context.drawRoundedRect(x + 2, y + 2, width - 4, height - 4, 4);
     *         ctx.fill();
     *
     *         ctx.fillStyle = '#4caf50';
     *         ctx.fillRect(x + 2, y + 2, (width - 4) * percent / 100, height - 4);
     *     }
     * }
     */
    render(context) {
        // 基类不执行任何操作，子类可选择性重写
    }

    /**
     * 是否有自定义渲染器 ⭐ 新增
     *
     * 检查原型链上是否有非基类的 render 实现。
     * TileRenderer 使用此属性快速判断是否需要调用自定义渲染。
     *
     * @returns {boolean} 如果子类实现了 render() 方法则返回 true
     */
    get hasCustomRenderer() {
        // 检查原型链上是否有非基类的 render 实现
        return this.constructor.prototype.render !== BaseColumnType.prototype.render;
    }
}