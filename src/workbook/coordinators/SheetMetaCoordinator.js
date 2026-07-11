import { stylePool } from "../../model/styles";
import { Cell } from "@/model";
import { errorHandler, ERROR_CODE } from "../../core/ErrorHandler.js";
import { extractColumnTypeOptions } from "../../types/index.js";
import { ISheet } from "../interfaces/ISheet.js";

/**
 * 工作表元数据协调者
 *
 * 负责：
 * - 表头标签（行/列头文本、样式、嵌套表头）
 * - 列类型配置（数字、文本、日期等）
 * - 类型系统（格式化、验证、解析）
 * - 单元格静态/动态配置（cell/cells）
 * - 通过 ISheet 接口解耦对具体实现的依赖
 */
export class SheetMetaCoordinator {
    /** @type {ISheet} */
    #sheet;

    /**
     * @param {ISheet} sheet - 所属工作表实例（通过接口访问）
     */
    constructor(sheet) {
        this.#sheet = sheet;
    }

    // ─── 内部属性访问 ─────────────────────────────────

    get #headerLabels() {
        return this.#sheet.headerLabels;
    }

    get #typeManager() {
        return this.#sheet.typeManager;
    }

    // ════════════════════════════════════════════════════
    // 表头标签（委托 HeaderLabelManager）
    // ════════════════════════════════════════════════════

    // ---- 列头 ----

    get colHeaders() {
        return this.#headerLabels.colHeaders;
    }

    set colHeaders(v) {
        this.#headerLabels.colHeaders = v;
    }

    /**
     * 获取指定列的头部标签文本
     * @param {number} col - 列号
     * @returns {string}
     */
    getColHeader(col) {
        return this.#headerLabels.getColHeader(col);
    }

    /**
     * 获取指定列的头部样式
     * @param {number} col - 列号
     * @returns {Object}
     */
    getColHeaderStyle(col) {
        return this.#headerLabels.getColHeaderStyle(col);
    }

    // ---- 行头 ----

    get rowHeaders() {
        return this.#headerLabels.rowHeaders;
    }

    set rowHeaders(v) {
        this.#headerLabels.rowHeaders = v;
    }

    /**
     * 获取指定行的头部标签文本
     * @param {number} row - 行号
     * @returns {string}
     */
    getRowHeader(row) {
        return this.#headerLabels.getRowHeader(row);
    }

    /**
     * 获取指定行的头部样式
     * @param {number} row - 行号
     * @returns {Object}
     */
    getRowHeaderStyle(row) {
        return this.#headerLabels.getRowHeaderStyle(row);
    }

    // ---- 嵌套表头 ----

    get nestedHeaders() {
        return this.#headerLabels.nestedHeaders;
    }

    set nestedHeaders(v) {
        this.#headerLabels.nestedHeaders = v;
    }

    /**
     * 获取嵌套表头的总层数
     * @returns {number} 0 表示未启用嵌套表头
     */
    getNestedHeaderRowCount() {
        return this.#headerLabels.getNestedHeaderRowCount();
    }

    /**
     * 获取嵌套表头中指定层的表头信息
     * @param {number} rowIndex - 嵌套层索引（0=顶层）
     * @param {number} col - 数据列号
     * @returns {{label: string, colspan: number}|null}
     */
    getNestedColHeader(rowIndex, col) {
        return this.#headerLabels.getNestedColHeader(rowIndex, col);
    }

    // ---- 表头尺寸 ----

    get rowHeaderWidth() {
        return this.#headerLabels.rowHeaderWidth;
    }

    set rowHeaderWidth(v) {
        this.#headerLabels.rowHeaderWidth = v;
    }

    /**
     * 获取表头总高度（像素）
     * @returns {number}
     */
    getHeaderHeight() {
        return this.#headerLabels.getHeaderHeight();
    }

    get headerHeight() {
        return this.#headerLabels.headerHeight;
    }

    set headerHeight(v) {
        this.#headerLabels.headerHeight = v;
    }

    /**
     * 获取行头列宽度（像素）
     * @returns {number}
     */
    getHeaderWidth() {
        return this.#headerLabels.getHeaderWidth();
    }

    // ════════════════════════════════════════════════════
    // 列类型配置（委托 ColumnTypeManager）
    // ════════════════════════════════════════════════════

    get columnsConfig() {
        return this.#typeManager.columnsConfig;
    }

    get cellTypes() {
        return this.#typeManager.cellTypes;
    }

    /**
     * 获取指定列的完整配置
     * @param {number} col - 列号
     * @returns {Object}
     */
    getColumnConfig(col) {
        return this.#typeManager.getColumnConfig(col);
    }

    /**
     * 获取指定列的类型名称
     * @param {number} col - 列号
     * @returns {string}
     */
    getColumnType(col) {
        return this.#typeManager.getColumnType(col);
    }

    /**
     * 检查列类型一致性（内部使用）
     * @param {number} topCol - 起始列
     * @param {number} bottomCol - 结束列
     * @returns {boolean}
     */
    _checkColumnTypeConsistency(topCol, bottomCol) {
        return this.#typeManager.checkColumnTypeConsistency(topCol, bottomCol);
    }

    /**
     * 获取列类型的实例（包含编辑器和渲染器）
     * @param {number} col - 列号
     * @returns {Object}
     */
    getColumnTypeInstance(col) {
        return this.#typeManager.getColumnTypeInstance(col);
    }

    /**
     * 获取指定单元格的类型实例
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {Object}
     */
    getCellTypeInstance(r, c) {
        return this.#typeManager.getCellTypeInstance(r, c);
    }

    /**
     * 应用列配置数组
     * @param {Array<Object>} columnsConfig - 列配置数组
     */
    applyColumnsConfig(columnsConfig) {
        this.#typeManager.applyColumnsConfig(columnsConfig);
        this.#sheet._invalidateAll();
    }

    // ════════════════════════════════════════════════════
    // 类型系统（格式化 / 验证 / 解析）
    // ════════════════════════════════════════════════════

    /**
     * 格式化单元格值用于显示
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {*} value - 原始值
     * @returns {string} 格式化后的字符串
     */
    formatCellValue(r, c, value) {
        return this.#typeManager.formatCellValue(r, c, value);
    }

    /**
     * 验证单元格值是否符合类型约束
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {*} value - 待验证的值
     * @returns {boolean} 是否有效
     */
    validateCellValue(r, c, value) {
        return this.#typeManager.validateCellValue(r, c, value);
    }

    /**
     * 解析用户输入为标准值
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {string} input - 用户输入的字符串
     * @returns {*} 解析后的值
     */
    parseCellValue(r, c, input) {
        return this.#typeManager.parseCellValue(r, c, input);
    }

    // ════════════════════════════════════════════════════
    // cell / cells 配置
    // ════════════════════════════════════════════════════

    /**
     * 应用静态 cell 配置数组
     *
     * 遍历 cellConfig 数组，逐项应用：
     * - value: 单元格值
     * - style: 自定义样式
     * - disabled/readOnly: 禁用状态
     * - type: 列类型覆盖
     *
     * 参考 Handsontable 的 cell 选项
     */
    applyCellConfig() {
        for (const item of this.#sheet.cellConfig) {
            if (item.row == null || item.col == null) continue;

            const { row: r, col: c, value, style, disabled, readOnly, type, ...typeOptions } = item;

            this.#sheet.rowColManager.ensureSize(r + 1, c + 1);

            if (type) {
                this.#typeManager.cellTypes.set(`${r},${c}`, {
                    name: type,
                    options: extractColumnTypeOptions(typeOptions),
                });
            }

            const cell = this.#sheet.cellStore.get(r, c);
            const existingStyleId = cell?.styleId || 0;
            const existingStyle = existingStyleId ? stylePool.getStyle(existingStyleId) : {};
            const mergedStyle = style ? { ...existingStyle, ...style } : existingStyle;
            const newStyleId = stylePool.getStyleId(mergedStyle);

            const isDisabled = disabled ?? readOnly ?? cell?.disabled ?? false;
            const cellValue = value !== undefined ? value : (cell?.value ?? "");

            this.#sheet.cellStore.set(r, c, new Cell(cellValue, newStyleId, isDisabled, cell?.formula));

            if (disabled === true || readOnly === true) {
                const updatedCell = this.#sheet.cellStore.get(r, c);
                if (updatedCell && !updatedCell.disabled) {
                    this.#sheet.cellStore.set(r, c, new Cell(updatedCell.value, updatedCell.styleId, true, updatedCell.formula));
                }
            }
        }

        this.#sheet._invalidateAll();
    }

    /**
     * 解析单元格属性（动态计算式）
     *
     * 由 cellsFn 函数驱动，每次调用时实时计算
     *
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {{style?: Object, disabled?: boolean, readOnly?: boolean, value?: *}|null}
     */
    resolveCellProperties(r, c) {
        if (typeof this.#sheet.cellsFn !== "function") return null;

        try {
            return this.#sheet.cellsFn(r, c);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.CELL_INVALID_DATA, `cellsFn execution failed at (${r},${c})`, { originalError: error });
            return null;
        }
    }
}
