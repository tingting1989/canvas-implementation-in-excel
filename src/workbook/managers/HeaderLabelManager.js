import { CONFIG } from "@/constants/config";
import { isFunction, isObject, isString } from "@/utils/utils";
import { indexToCol } from "@/utils/cellRef";

/**
 * 表头标签管理器
 *
 * 从 Sheet 中提取的独立子模块，负责：
 * - 行头/列头标签解析（支持 true | string[] | Function 三种配置形式）
 * - 默认列标签生成（A, B, C, ..., Z, AA, ...）
 * - 嵌套表头查询
 * - 表头尺寸计算（宽度/高度）
 *
 * 所有方法均通过 Sheet 上的同名公开方法暴露，外部调用者无感知。
 */
export class HeaderLabelManager {
    /** @type {import("../Sheet.js").Sheet} */
    #sheet;

    /** 列头配置：true→A/B/C... | string[] | Function(col) */
    #colHeaders = true;

    /** 行头配置：true→1/2/3... | string[] | Function(row) */
    #rowHeaders = true;

    /** 嵌套表头配置 */
    #nestedHeaders = null;

    /** 行头列宽度（px） */
    #rowHeaderWidth = CONFIG.HEADER_WIDTH;

    /** 列头行高度（px），默认 CONFIG.HEADER_HEIGHT (28px) */
    #headerHeight = CONFIG.HEADER_HEIGHT;

    /**
     * @param {import("../Sheet.js").Sheet} sheet - 所属工作表
     */
    constructor(sheet) {
        this.#sheet = sheet;
    }

    // ---- 属性访问（供 SettingsApplier / RowColSync 透明迁移） ----

    get colHeaders() {
        return this.#colHeaders;
    }
    set colHeaders(v) {
        this.#colHeaders = v;
    }
    get rowHeaders() {
        return this.#rowHeaders;
    }
    set rowHeaders(v) {
        this.#rowHeaders = v;
    }
    get nestedHeaders() {
        return this.#nestedHeaders;
    }
    set nestedHeaders(v) {
        this.#nestedHeaders = v;
    }
    get rowHeaderWidth() {
        return this.#rowHeaderWidth;
    }
    set rowHeaderWidth(v) {
        this.#rowHeaderWidth = v;
    }

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

    /** 获取列头标签 */
    getColHeader(col) {
        return this.#resolve(this.#colHeaders, col, indexToCol);
    }

    /** 获取列头样式 */
    getColHeaderStyle(col) {
        return this.#resolveStyle(this.#colHeaders, col);
    }

    /** 获取行头标签 */
    getRowHeader(row) {
        return this.#resolve(this.#rowHeaders, row, (i) => String(i + 1));
    }

    /** 获取行头样式 */
    getRowHeaderStyle(row) {
        return this.#resolveStyle(this.#rowHeaders, row);
    }

    /**
     * 解析行/列头的样式配置
     * @param {true|string[]|Function|null} config
     * @param {number} index
     * @returns {object|null}
     */
    #resolveStyle(config, index) {
        if (config === true || config == null) return null;
        if (Array.isArray(config)) {
            if (index >= config.length) return null;
            const item = config[index];
            if (isObject(item) && item.style) return item.style;
            return null;
        }
        return null;
    }

    /**
     * 统一的行/列头解析
     * @param {true|string[]|Function|null} config
     * @param {number} index
     * @param {(index: number) => string} defaultFn
     * @returns {string}
     */
    #resolve(config, index, defaultFn) {
        if (config === true || config == null) return defaultFn(index);
        if (Array.isArray(config)) {
            if (index >= config.length) return defaultFn(index);
            const item = config[index];
            // 支持对象形式 {label: "...", style: {...}}
            if (isObject(item) && item.label !== undefined) return item.label;
            // 支持字符串形式
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
     * @returns {number} 0 表示未启用嵌套表头
     */
    getNestedHeaderRowCount() {
        const nh = this.#nestedHeaders;
        return Array.isArray(nh) ? nh.length : 0;
    }

    /**
     * 获取嵌套表头中指定层、指定列的表头信息
     *
     * 返回值可能是：
     *   - null：该层该列被上方 colspan 跨越（应绘制空单元格）
     *   - { label: string, colspan: number }：带跨列的表头
     *   - { label: string, colspan: number, style?: object }：带自定义样式的表头
     *
     * 支持的 style 属性：
     *   - backgroundColor: string (背景色)
     *   - color: string (文字颜色)
     *   - fontWeight: string (字体粗细)
     *   - fontSize: string (字体大小)
     *   - fontStyle: string (字体样式)
     *   - textAlign: string (文本对齐)
     *
     * @param {number} rowIndex - 嵌套层索引（0=顶层）
     * @param {number} col - 数据列号
     * @returns {{label: string, colspan: number, style?: object}|null}
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
     * 嵌套表头时 = headerHeight × 嵌套层数，否则 = headerHeight
     * 支持通过配置自定义高度
     * @returns {number}
     */
    getHeaderHeight() {
        const rows = this.getNestedHeaderRowCount() || CONFIG.NESTED_HEADER_ROWS;
        return rows * this.#headerHeight;
    }

    /**
     * 获取行头列宽度（像素）
     * 由 rowHeaderWidth 配置决定，默认 CONFIG.HEADER_WIDTH (46px)
     * @returns {number}
     */
    getHeaderWidth() {
        return this.#rowHeaderWidth ?? CONFIG.HEADER_WIDTH;
    }
}