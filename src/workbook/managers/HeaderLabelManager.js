import { CONFIG } from "../../constants/config";
import { isFunction, isObject, isString } from "../../core/utils.js";

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

    // ============================================================
    // 行/列头标签
    // ============================================================

    /** 获取列头标签 */
    getColHeader(col) {
        return this.#resolve(this.#colHeaders, col, this.#defaultColLabel);
    }

    /** 获取行头标签 */
    getRowHeader(row) {
        return this.#resolve(this.#rowHeaders, row, (i) => String(i + 1));
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
        if (Array.isArray(config)) return index < config.length ? config[index] : defaultFn(index);
        if (isFunction(config)) return config(index);
        return defaultFn(index);
    }

    /**
     * 默认列标签：0→A, 1→B, ..., 25→Z, 26→AA, ...
     * @param {number} col - 列号
     * @returns {string}
     */
    #defaultColLabel(col) {
        let label = "";
        let n = col + 1;
        while (n > 0) {
            n = n - 1;
            label = String.fromCharCode(65 + (n % 26)) + label;
            n = Math.floor(n / 26);
        }
        return label || "A";
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
     *   - { label: string, colspan: 1 }：普通单列表头
     *
     * @param {number} rowIndex - 嵌套层索引（0=顶层）
     * @param {number} col - 数据列号
     * @returns {{label: string, colspan: number}|null}
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

            if (col >= consumed && col < consumed + colspan) {
                return { label, colspan };
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
     * 嵌套表头时 = HEADER_HEIGHT × 嵌套层数，否则 = HEADER_HEIGHT
     * @returns {number}
     */
    getHeaderHeight() {
        const rows = this.getNestedHeaderRowCount() || CONFIG.NESTED_HEADER_ROWS;
        return rows * CONFIG.HEADER_HEIGHT;
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
