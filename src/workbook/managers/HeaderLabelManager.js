import { CONFIG } from "@/constants/config";
import { isFunction, isObject, isString } from "@/utils/helper";
import { indexToCol } from "@/utils/cellRef";

/**
 * 表头标签管理器
 *
 * 从 Sheet 中提取的独立子模块，负责：
 * - 行头/列头标签解析（支持 true | string[] | Function 三种配置形式）
 * - 默认列标签生成（A, B, C, ..., Z, AA, ...）
 * - 嵌套表头查询（支持 colspan 跨列和自定义样式）
 * - 表头尺寸计算（宽度/高度）
 *
 * 所有方法均通过 Sheet 上的同名公开方法暴露，外部调用者无感知。
 *
 * 列头配置形式：
 * - true：使用默认 A/B/C/... 标签
 * - string[]：自定义标签数组，超出范围回退到默认
 * - Function(col)：动态计算函数，返回字符串
 * - 对象数组：每项支持 { label, style } 形式
 *
 * 行头配置形式：
 * - true：使用默认 1/2/3/... 标签
 * - string[]：自定义标签数组
 * - Function(row)：动态计算函数
 *
 * 嵌套表头配置形式：
 * - Array<Array<string|Object>>：二维数组，每行一层
 *   - 字符串项："标签文本"
 *   - 对象项：{ label: "文本", colspan: 2, style: { backgroundColor: "#eee" } }
 */
export class HeaderLabelManager {
    /** @type {import("../Sheet.js").Sheet} 所属工作表引用 */
    #sheet;

    /**
     * 列头配置
     * - true：默认 A/B/C/... 标签
     * - string[]：自定义标签数组
     * - Function(col)：动态计算函数
     * @type {boolean|string[]|Function|null}
     */
    #colHeaders = true;

    /**
     * 行头配置
     * - true：默认 1/2/3/... 标签
     * - string[]：自定义标签数组
     * - Function(row)：动态计算函数
     * @type {boolean|string[]|Function|null}
     */
    #rowHeaders = true;

    /**
     * 嵌套表头配置
     * - null：未启用嵌套表头
     * - Array<Array<string|Object>>：二维数组，每行代表一层
     * @type {Array<Array<string|Object>>|null}
     */
    #nestedHeaders = null;

    /** @type {number} 行头列宽度（px），默认 CONFIG.HEADER_WIDTH */
    #rowHeaderWidth = CONFIG.HEADER_WIDTH;

    /** @type {number} 列头单行高度（px），默认 CONFIG.HEADER_HEIGHT */
    #headerHeight = CONFIG.HEADER_HEIGHT;

    /**
     * 创建表头标签管理器
     *
     * @param {import("../Sheet.js").Sheet} sheet - 所属工作表
     */
    constructor(sheet) {
        this.#sheet = sheet;
    }

    // ---- 属性访问（供 SettingsApplier / RowColSync 透明迁移） ----

    /**
     * 获取列头配置
     * @type {boolean|string[]|Function|null}
     */
    get colHeaders() {
        return this.#colHeaders;
    }
    set colHeaders(v) {
        this.#colHeaders = v;
    }

    /**
     * 获取行头配置
     * @type {boolean|string[]|Function|null}
     */
    get rowHeaders() {
        return this.#rowHeaders;
    }
    set rowHeaders(v) {
        this.#rowHeaders = v;
    }

    /**
     * 获取嵌套表头配置
     * @type {Array<Array<string|Object>>|null}
     */
    get nestedHeaders() {
        return this.#nestedHeaders;
    }
    set nestedHeaders(v) {
        this.#nestedHeaders = v;
    }

    /**
     * 获取行头列宽度（px）
     * @type {number}
     */
    get rowHeaderWidth() {
        return this.#rowHeaderWidth;
    }
    set rowHeaderWidth(v) {
        this.#rowHeaderWidth = v;
    }

    /**
     * 获取列头单行高度（px）
     * @type {number}
     */
    get headerHeight() {
        return this.#headerHeight;
    }
    set headerHeight(v) {
        if (v > 0) {
            this.#headerHeight = v;
        }
    }

    // ============================================================
    // 行/列头标签
    // ============================================================

    /**
     * 获取列头标签文本
     *
     * 根据 colHeaders 配置解析：
     * - true/null：返回默认 A/B/C/... 标签（由 indexToCol 生成）
     * - string[]：返回数组中对应项，超出范围回退到默认
     * - Function：调用函数获取结果
     * - 对象数组：提取 label 属性
     *
     * @param {number} col - 列号（0-based）
     * @returns {string} 列头标签文本
     */
    getColHeader(col) {
        return this.#resolve(this.#colHeaders, col, indexToCol);
    }

    /**
     * 获取列头样式
     *
     * 仅当 colHeaders 为对象数组且对应项包含 style 属性时返回样式对象，
     * 其他情况返回 null。
     *
     * @param {number} col - 列号（0-based）
     * @returns {Object|null} 样式对象，无自定义样式返回 null
     */
    getColHeaderStyle(col) {
        return this.#resolveStyle(this.#colHeaders, col);
    }

    /**
     * 获取行头标签文本
     *
     * 根据 rowHeaders 配置解析：
     * - true/null：返回默认 1/2/3/... 标签
     * - string[]：返回数组中对应项，超出范围回退到默认
     * - Function：调用函数获取结果
     *
     * @param {number} row - 行号（0-based）
     * @returns {string} 行头标签文本
     */
    getRowHeader(row) {
        return this.#resolve(this.#rowHeaders, row, (i) => String(i + 1));
    }

    /**
     * 获取行头样式
     *
     * 仅当 rowHeaders 为对象数组且对应项包含 style 属性时返回样式对象，
     * 其他情况返回 null。
     *
     * @param {number} row - 行号（0-based）
     * @returns {Object|null} 样式对象，无自定义样式返回 null
     */
    getRowHeaderStyle(row) {
        return this.#resolveStyle(this.#rowHeaders, row);
    }

    /**
     * 解析行/列头的样式配置
     *
     * 从配置中提取指定索引的样式对象。
     * 仅支持对象数组形式（{ label, style }），其他配置形式返回 null。
     *
     * @param {boolean|string[]|Function|null} config - 行/列头配置
     * @param {number} index - 行号或列号（0-based）
     * @returns {Object|null} 样式对象，无样式返回 null
     */
    #resolveStyle(config, index) {
        if (config === true || config === null || config === undefined) return null;
        if (Array.isArray(config)) {
            if (index >= config.length) return null;
            const item = config[index];
            if (isObject(item) && item.style) return item.style;
            return null;
        }
        return null;
    }

    /**
     * 统一的行/列头标签解析
     *
     * 根据配置类型分发解析逻辑：
     * - true/null：调用默认生成函数（列头→indexToCol，行头→i+1）
     * - Array：按索引取值，支持字符串和 { label, style } 对象两种形式
     * - Function：直接调用函数传入索引
     * - 其他：回退到默认生成函数
     *
     * @param {boolean|string[]|Function|null} config - 行/列头配置
     * @param {number} index - 行号或列号（0-based）
     * @param {(index: number) => string} defaultFn - 默认标签生成函数
     * @returns {string} 解析后的标签文本
     */
    #resolve(config, index, defaultFn) {
        if (config === true || config === null || config === undefined) return defaultFn(index);
        if (Array.isArray(config)) {
            if (index >= config.length) return defaultFn(index);
            const item = config[index];

            if (isObject(item) && item.label !== undefined) return item.label;

            if (isString(item)) return item;
            return defaultFn(index);
        }
        if (isFunction(config)) return config(index);
        return defaultFn(index);
    }

    // ============================================================
    // 嵌套表头
    // ============================================================

    /**
     * 获取嵌套表头的总层数
     *
     * 嵌套表头通过 nestedHeaders 二维数组配置，每行代表一层。
     * 未配置时返回 0，表示不启用嵌套表头。
     *
     * @returns {number} 嵌套层数，0 表示未启用
     */
    getNestedHeaderRowCount() {
        const nh = this.#nestedHeaders;
        return Array.isArray(nh) ? nh.length : 0;
    }

    /**
     * 获取嵌套表头中指定层、指定列的表头信息
     *
     * 遍历指定层的所有表头项，累加 colspan 计算每项覆盖的列范围，
     * 找到包含目标列号的表头项后返回其信息。
     *
     * 返回值类型：
     * - null：该层该列被上方 colspan 跨越（应绘制空单元格）
     * - { label, colspan }：带跨列的表头
     * - { label, colspan, style }：带自定义样式的表头
     *
     * 支持的 style 属性：
     * - backgroundColor: string（背景色）
     * - color: string（文字颜色）
     * - fontWeight: string（字体粗细）
     * - fontSize: string（字体大小）
     * - fontStyle: string（字体样式）
     * - textAlign: string（文本对齐）
     *
     * @param {number} rowIndex - 嵌套层索引（0=顶层）
     * @param {number} col - 数据列号（0-based）
     * @returns {{label: string, colspan: number, style?: Object}|null} 表头信息，被跨越返回 null
     */
    getNestedColHeader(rowIndex, col) {
        const nh = this.#nestedHeaders;
        if (!nh || rowIndex >= nh.length) return null;
        const row = nh[rowIndex];
        if (!Array.isArray(row)) return null;

        let consumed = 0;
        for (let i = 0; i < row.length; i++) {
            const item = row[i];
            const label = isString(item) ? item : (item?.label ?? "");
            const colspan = item && isObject(item) && item.colspan ? item.colspan : 1;
            const style = item && isObject(item) && item.style ? item.style : null;

            if (col >= consumed && col < consumed + colspan) {
                return { label, colspan, style };
            }
            consumed += colspan;
        }

        return null;
    }

    // ============================================================
    // 表头尺寸
    // ============================================================

    /**
     * 获取表头总高度（像素）
     *
     * 计算方式：嵌套层数 × 单行高度
     * - 有嵌套表头时：getNestedHeaderRowCount() × headerHeight
     * - 无嵌套表头时：CONFIG.NESTED_HEADER_ROWS × headerHeight（默认 1 层）
     *
     * @returns {number} 表头总高度（px）
     */
    getHeaderHeight() {
        const rows = this.getNestedHeaderRowCount() || CONFIG.NESTED_HEADER_ROWS;
        return rows * this.#headerHeight;
    }

    /**
     * 获取行头列宽度（像素）
     *
     * 由 rowHeaderWidth 配置决定，默认 CONFIG.HEADER_WIDTH（46px）。
     * 若 rowHeaderWidth 未设置（null/undefined），回退到 CONFIG.HEADER_WIDTH。
     *
     * @returns {number} 行头列宽度（px）
     */
    getHeaderWidth() {
        return this.#rowHeaderWidth ?? CONFIG.HEADER_WIDTH;
    }
}
