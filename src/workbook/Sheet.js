import { stylePool, DEFAULT_STYLE_ID } from "../model/styles";
import { errorHandler, ERROR_CODE } from "../core/ErrorHandler.js";
import { SHEET_EVENTS } from "../constants/sheetEvents.js";
import { EventBus } from "../core/EventBus.js";

import {
    ChunkedCellStore,
    SelectionManager,
    SetCellCommand,
    ToggleDisableCommand,
    HistoryStack,
    MergeManager,
    MergeCommand,
    UnmergeCommand,
    Cell,
} from "@/model";
import { RowColManager } from "../model/grid/RowColManager.js";
import { RowColSync } from "../model/grid/RowColSync.js";
import { CellDataAccessor } from "../model/grid/CellDataAccessor.js";
import { CONFIG } from "../constants/config";
import { SheetStyleManager } from "./SheetStyleManager.js";
import { ColumnTypeManager } from "./managers/ColumnTypeManager.js";
import { HeaderLabelManager } from "./managers/HeaderLabelManager.js";
import { ConditionalFormatManager } from "./managers/ConditionalFormatManager.js";
import { BatchOperationManager } from "./managers/BatchOperationManager.js";
import { ChartManager } from "../model/chart/ChartManager.js";
import { extractColumnTypeOptions } from "../types/index.js";

/** @enum {string} 子系统行列操作方法名（供 #dispatchToSubSystems 使用） */
const SUB = {
    INSERT_ROW: "insertRow",
    INSERT_COL: "insertCol",
    DELETE_ROW: "deleteRow",
    DELETE_COL: "deleteCol",
    MOVE_ROW: "moveRow",
    MOVE_COL: "moveCol",
};

/**
 * 工作表
 *
 * 管理单个工作表的所有数据和状态，包括：
 * - 单元格数据（ChunkedCellStore）
 * - 行列尺寸（RowColManager）
 * - 选区（SelectionManager）
 * - 合并单元格（MergeManager）
 * - 操作历史（HistoryStack）
 * - 条件格式、行/列样式、数据绑定
 *
 * 坐标体系：
 * - 行号（row）：单元格在数据模型中的实际行号，从 0 开始
 * - 列号（col）：单元格在数据模型中的实际列号，从 0 开始
 *
 * 数据变更通过 bus 事件通知外部（如 Workbook→RenderEngine）重绘
 */
export class Sheet {
    /** 事件总线（Sheet 持有，Workbook 及各子系统订阅），构造时初始化 */
    #bus;

    /** 批量操作管理器 */
    #batchOp = new BatchOperationManager();

    /** 样式缓存版本号，供 #invalidateAll 递增 */
    #styleCacheVersion = 0;

    /** 行同步器 */
    #rowSync = null;

    /** 列同步器 */
    #colSync = null;

    /** 样式管理器 */
    #styleManager = null;

    /** 列类型管理器 */
    #typeManager = null;

    /** 表头标签管理器 */
    #headerLabels = null;

    /** 条件格式管理器 */
    #conditionalFormat = null;

    /** 冻结行像素高度缓存（-1 表示需重新计算） */
    #cachedFrozenRowsHeight = -1;

    /** 冻结列像素宽度缓存（-1 表示需重新计算） */
    #cachedFrozenColsWidth = -1;

    /** 冻结行数（顶部固定行数，不随垂直滚动移动），通过 getter/setter 访问以维护缓存 */
    #fixedRowsTop = 0;

    /** 冻结列数（左侧固定列数，不随水平滚动移动），通过 getter/setter 访问以维护缓存 */
    #fixedColumnsStart = 0;

    /** 只读模式：禁止所有数据修改 */
    #readOnly = false;

    /** 单元格数据访问代理（懒初始化） */
    #cellDataAccessor = null;

    /**
     * 检查当前工作表是否可写，只读模式下返回 false
     * 所有数据修改方法应在入口处调用此方法进行拦截
     * @returns {boolean}
     */
    #ensureWritable() {
        return !this.#readOnly;
    }

    /**
     * @param {string} name - 工作表名称
     */
    constructor(name) {
        this.name = name;

        this.#bus = new EventBus("Sheet", name, { strict: true });

        /** 是否可见 */
        this.visible = true;

        /** 单元格数据存储（分块存储，按行分 chunk） */
        this.cellStore = new ChunkedCellStore();

        /** 选区管理器 */
        this.selection = new SelectionManager();

        /** 操作历史栈（支持 undo/redo） */
        this.history = new HistoryStack();

        /** 合并单元格管理器 */
        this.mergeManager = new MergeManager();

        /** 行列尺寸与坐标计算管理器 */
        this.rowColManager = new RowColManager();

        /**
         * cell 配置数组，每个元素指定 {row, col, style?, disabled?, readOnly?, value?}
         * 静态声明式配置，初始化时一次性应用（参考 Handsontable cell 选项）
         */
        this.cellConfig = [];

        /**
         * cells 函数 (row, col) => {style?, disabled?, readOnly?, value?}
         * 动态计算式配置，每次 resolveCellProperties 时调用（参考 Handsontable cells 选项）
         */
        this.cellsFn = null;

        /** 单元格文字内边距（px），左右两侧各保留此宽度 */
        this.cellPadding = CONFIG.CELL_PADDING;

        /** 单元格文字溢出时是否显示省略号（...） */
        this.textOverflowEllipsis = CONFIG.TEXT_OVERFLOW_ELLIPSIS;

        // 子管理器必须在代理 getter 访问之前创建
        this.#styleManager = new SheetStyleManager(this);
        this.#typeManager = new ColumnTypeManager(this);
        this.#headerLabels = new HeaderLabelManager(this);
        this.#conditionalFormat = new ConditionalFormatManager(this);
        this.#rowSync = new RowColSync(this, CONFIG.AXIS_ROW);
        this.#colSync = new RowColSync(this, CONFIG.AXIS_COL);
    }

    /**
     * 获取事件总线
     * @returns {EventBus}
     */
    get bus() {
        return this.#bus;
    }

    // ============================================================
    // 数据访问代理 getter / setter
    //
    // 这些属性已搬入子管理器内部存储（解耦），通过代理保持
    // 外部代码（SettingsApplier、RowColSync、渲染器）的兼容性。
    // ============================================================

    // ---- SheetStyleManager 代理 ----
    get rowStyles() {
        return this.#styleManager.rowStyles;
    }

    get colStyles() {
        return this.#styleManager.colStyles;
    }

    // ---- ColumnTypeManager 代理 ----
    get columnsConfig() {
        return this.#typeManager.columnsConfig;
    }

    get cellTypes() {
        return this.#typeManager.cellTypes;
    }

    // ---- HeaderLabelManager 代理 ----
    get colHeaders() {
        return this.#headerLabels.colHeaders;
    }

    set colHeaders(v) {
        this.#headerLabels.colHeaders = v;
    }

    get rowHeaders() {
        return this.#headerLabels.rowHeaders;
    }

    set rowHeaders(v) {
        this.#headerLabels.rowHeaders = v;
    }

    get nestedHeaders() {
        return this.#headerLabels.nestedHeaders;
    }

    set nestedHeaders(v) {
        this.#headerLabels.nestedHeaders = v;
    }

    get rowHeaderWidth() {
        return this.#headerLabels.rowHeaderWidth;
    }

    set rowHeaderWidth(v) {
        this.#headerLabels.rowHeaderWidth = v;
    }

    // ─── 冻结状态（getter/setter 维护缓存）───────────────────

    /** @returns {number} 冻结行数 */
    get fixedRowsTop() {
        return this.#fixedRowsTop;
    }

    /** @param {number} v 冻结行数，变化时自动失效高度缓存 */
    set fixedRowsTop(v) {
        if (this.#fixedRowsTop !== v) {
            this.#fixedRowsTop = v;
            this.#cachedFrozenRowsHeight = -1;
        }
    }

    /** @returns {number} 冻结列数 */
    get fixedColumnsStart() {
        return this.#fixedColumnsStart;
    }

    /** @param {number} v 冻结列数，变化时自动失效宽度缓存 */
    set fixedColumnsStart(v) {
        if (this.#fixedColumnsStart !== v) {
            this.#fixedColumnsStart = v;
            this.#cachedFrozenColsWidth = -1;
        }
    }

    /** @returns {boolean} 是否只读模式 */
    get readOnly() {
        return this.#readOnly;
    }

    /** @param {boolean} v 只读模式，阻止所有数据修改 */
    set readOnly(v) {
        this.#readOnly = !!v;
    }

    /** @returns {number} 冻结行像素高度（带缓存，行列尺寸变化时需调用 invalidateFreezeCache） */
    get frozenRowsHeight() {
        if (this.#fixedRowsTop <= 0) return 0;
        if (this.#cachedFrozenRowsHeight >= 0) return this.#cachedFrozenRowsHeight;
        const rc = this.rowColManager;

        // 使用实际行号计算，因为冻结行始终是数据的真实行 0..fixedRowsTop-1
        const lastFrozenRow = this.#fixedRowsTop - 1;
        this.#cachedFrozenRowsHeight = rc.getRowY(lastFrozenRow) + rc.getRowHeight(lastFrozenRow);
        return this.#cachedFrozenRowsHeight;
    }

    /** @returns {number} 冻结列像素宽度（带缓存，行列尺寸变化时需调用 invalidateFreezeCache） */
    get frozenColsWidth() {
        if (this.#fixedColumnsStart <= 0) return 0;
        if (this.#cachedFrozenColsWidth >= 0) return this.#cachedFrozenColsWidth;
        const rc = this.rowColManager;
        this.#cachedFrozenColsWidth = rc.getColX(this.#fixedColumnsStart - 1) + rc.getColWidth(this.#fixedColumnsStart - 1);
        return this.#cachedFrozenColsWidth;
    }

    /**
     * 失效冻结区域缓存
     * 当行高/列宽发生变化（拖拽调整、隐藏/显示行列）时必须调用，
     * 确保下次访问 frozenRowsHeight/frozenColsWidth 时重新计算。
     */
    invalidateFreezeCache() {
        this.#cachedFrozenRowsHeight = -1;
        this.#cachedFrozenColsWidth = -1;
    }

    // ============================================================
    // 单元格数据访问代理
    // ============================================================

    /**
     * 获取单元格数据访问代理（CellDataAccessor）
     * 统一管理单元格数据读写，提供与 CellStore 一致的 API。
     *
     * @returns {import("../model/grid/CellDataAccessor.js").CellDataAccessor}
     */
    get cellDataAccessor() {
        if (!this.#cellDataAccessor) {
            this.#cellDataAccessor = new CellDataAccessor(this);
        }
        return this.#cellDataAccessor;
    }

    /** 可视列号 → 实际列号（当前宽度=0 隐藏列方案下无需转换） */
    toRealCol(visibleCol) {
        return visibleCol;
    }

    /** 实际列号 → 可视列号 */
    toVisibleCol(realCol) {
        return realCol;
    }

    // ============================================================
    // 内部：数据变更通知
    // ============================================================

    /** 标记整个视图需要重绘（内部使用） */
    #invalidateAll() {
        this.#styleCacheVersion++;
        this.#styleManager.invalidateCache();
        this.#bus.emit(SHEET_EVENTS.INVALIDATE_ALL);
    }

    #invalidateCell(r, c) {
        this.#styleManager.invalidateCache();
        this.#bus.emit(SHEET_EVENTS.INVALIDATE_CELL, { r, c });
    }

    /**
     * 供 FormulaEngine 内部调用，触发单个单元格重绘
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    _invalidateCellInternal(r, c) {
        this.#invalidateCell(r, c);
    }

    /**
     * 公开方法：供外部代码（如 ClipboardManager）触发全量重绘
     * 内部使用 #invalidateAll 的数据变更路径无需额外调用此方法
     */
    invalidateAll() {
        this.#invalidateAll();
    }

    // ============================================================
    // 单元格值操作
    // ============================================================

    /**
     * 设置单元格值
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {*} value - 单元格值
     * @param {number} [styleId=0] - 样式 ID
     * @param {boolean} [disabled=false] - 是否禁用
     */
    setCell(r, c, value, styleId = 0, disabled = false) {
        if (!this.#ensureWritable()) return;
        this.rowColManager.ensureSize(r + 1, c + 1);

        let formula = null;
        let cellValue = value;

        const old = this.cellStore.get(r, c);

        if (typeof value === "string" && value.startsWith("=")) {
            formula = value;
            const results = this.#bus.emit(SHEET_EVENTS.FORMULA_SET, { r, c, formula: value });
            cellValue = results !== undefined ? results : value;
        } else if (old?.formula) {
            this.#bus.emit(SHEET_EVENTS.FORMULA_REMOVE, { r, c });
        }

        const cell = new Cell(cellValue, styleId, disabled, formula);
        const cmd = new SetCellCommand(this.cellStore, r, c, old, cell);
        this.#batchOp.pushCommand(cmd, this.history);
        this.cellStore.set(r, c, cell);
        this.#invalidateCell(r, c);

        if (!formula) {
            this.#bus.emit(SHEET_EVENTS.CELL_CHANGED, { r, c });
        }
    }

    /**
     * 禁用单元格（只读）
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    disableCell(r, c) {
        if (!this.#ensureWritable()) return;
        this.rowColManager.ensureSize(r + 1, c + 1);
        let cell = this.cellStore.get(r, c);
        const oldState = cell?.disabled || false;
        if (!cell) {
            cell = new Cell("", 0, true);
        } else {
            cell.disabled = true;
        }
        const cmd = new ToggleDisableCommand(this.cellStore, r, c, oldState);
        this.#batchOp.pushCommand(cmd, this.history);
        this.cellStore.set(r, c, cell);
        this.#invalidateCell(r, c);
    }

    /**
     * 启用单元格（取消只读）
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    enableCell(r, c) {
        if (!this.#ensureWritable()) return;
        const cell = this.cellStore.get(r, c);
        if (!cell) return;
        const oldState = cell.disabled;
        cell.disabled = false;
        const cmd = new ToggleDisableCommand(this.cellStore, r, c, oldState);
        this.#batchOp.pushCommand(cmd, this.history);
        this.#invalidateCell(r, c);
    }

    /**
     * 判断单元格是否被禁用
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {boolean}
     */
    isDisabled(r, c) {
        const colConfig = this.columnsConfig.get(c);
        if (colConfig?.disabled === true || colConfig?.readOnly === true) return true;
        const cellProps = this.resolveCellProperties(r, c);
        if (cellProps?.disabled === true || cellProps?.readOnly === true) return true;
        return this.cellStore.get(r, c)?.disabled === true;
    }

    // ============================================================
    // 样式操作（委托 SheetStyleManager）
    // ============================================================

    setRowStyle(row, styleObj) {
        if (!this.#ensureWritable()) return;
        if (!styleObj || typeof styleObj !== "object") {
            throw new TypeError("setRowStyle expects a style object, received: " + typeof styleObj);
        }
        this.#styleManager.resetRecorder();
        const styleId = stylePool.getStyleId(styleObj);
        this.#styleManager.setRowStyle(row, styleId);
        const cmd = this.#styleManager.buildStyleCommand();
        if (cmd) this.#batchOp.pushCommand(cmd, this.history);
        this.#invalidateAll();
    }

    setColStyle(col, styleObj) {
        if (!this.#ensureWritable()) return;
        if (!styleObj || typeof styleObj !== "object") {
            throw new TypeError("setColStyle expects a style object, received: " + typeof styleObj);
        }
        this.#styleManager.resetRecorder();
        const styleId = stylePool.getStyleId(styleObj);
        this.#styleManager.setColStyle(col, styleId);
        const cmd = this.#styleManager.buildStyleCommand();
        if (cmd) this.#batchOp.pushCommand(cmd, this.history);
        this.#invalidateAll();
    }

    /** 设置工作表默认样式 */
    setDefaultStyle(styleObj) {
        this.#styleManager.setDefaultStyle(styleObj);
        this.#invalidateAll();
    }

    /** @returns {object} 默认样式对象 */
    getDefaultStyle() {
        return this.#styleManager.getDefaultStyle();
    }

    setCellStyle(r, c, styleObj) {
        if (!this.#ensureWritable()) return;
        this.#styleManager.resetRecorder();
        this.#styleManager.setCellStyle(r, c, styleObj);
        const cmd = this.#styleManager.buildStyleCommand();
        if (cmd) this.#batchOp.pushCommand(cmd, this.history);
        this.#invalidateAll();
    }

    clearCellStyle(r, c) {
        if (!this.#ensureWritable()) return;
        this.#styleManager.clearCellStyle(r, c);
        this.#invalidateAll();
    }

    clearRowStyle(row) {
        if (!this.#ensureWritable()) return;
        this.#styleManager.clearRowStyle(row);
        this.#invalidateAll();
    }

    clearColStyle(col) {
        if (!this.#ensureWritable()) return;
        this.#styleManager.clearColStyle(col);
        this.#invalidateAll();
    }

    setRangeStyle(range, styleObj) {
        if (!this.#ensureWritable()) return;
        this.#styleManager.resetRecorder();
        this.#styleManager.setRangeStyle(range, styleObj);
        const cmd = this.#styleManager.buildStyleCommand();
        if (cmd) this.#batchOp.pushCommand(cmd, this.history);
        this.#invalidateAll();
    }

    clearRangeStyle(range) {
        if (!this.#ensureWritable()) return;
        this.#styleManager.clearRangeStyle(range);
        this.#invalidateAll();
    }

    batchStyleUpdate(fn) {
        this.#batchOp.beginBatch();
        try {
            fn(this);
        } finally {
            this.#batchOp.endBatch(this.history);
            this.#invalidateAll();
        }
    }

    getCellStyle(r, c) {
        return this.resolveStyle(r, c);
    }

    // ============================================================
    // 条件格式 & 数据绑定（委托 ConditionalFormatManager）
    // ============================================================

    /** 添加条件格式规则 */
    addConditionalRule(range, conditionFn, styleId) {
        this.#conditionalFormat.addRule(range, conditionFn, styleId);
    }

    /** 是否有条件格式规则（供 resolveStyle 快速路径判断） */
    hasConditionalRules() {
        return this.#conditionalFormat.hasRules();
    }

    /** 是否有数据绑定（供 resolveStyle 快速路径判断） */
    hasDataBindings() {
        return this.#conditionalFormat.hasBindings();
    }

    /** 匹配条件格式样式 */
    matchConditionalStyle(r, c, cell) {
        return this.#conditionalFormat.match(r, c, cell);
    }

    /** 绑定数据样式映射 */
    bindDataStyle(col, mapperFn) {
        this.#conditionalFormat.bind(col, mapperFn);
    }

    /** 获取数据绑定样式 */
    getDataBindStyle(r, c) {
        return this.#conditionalFormat.getBinding(r, c);
    }

    /**
     * 数据绑定 Map（供 RowColSync 行列同步时重映射键）
     * @returns {Map<number, Function>}
     */
    get dataBindings() {
        return this.#conditionalFormat.bindings;
    }

    // ============================================================
    // 行列头标签（委托 HeaderLabelManager）
    // ============================================================

    /** 获取列头标签 */
    getColHeader(col) {
        return this.#headerLabels.getColHeader(col);
    }

    /** 获取列头样式 */
    getColHeaderStyle(col) {
        return this.#headerLabels.getColHeaderStyle(col);
    }

    /** 获取行头标签 */
    getRowHeader(row) {
        return this.#headerLabels.getRowHeader(row);
    }

    /** 获取行头样式 */
    getRowHeaderStyle(row) {
        return this.#headerLabels.getRowHeaderStyle(row);
    }

    // ============================================================
    // 嵌套表头 & 表头尺寸（委托 HeaderLabelManager）
    // ============================================================

    /**
     * 获取嵌套表头的总层数
     * @returns {number} 0 表示未启用嵌套表头
     */
    getNestedHeaderRowCount() {
        return this.#headerLabels.getNestedHeaderRowCount();
    }

    /**
     * 获取嵌套表头中指定层、指定列的表头信息
     * @param {number} rowIndex - 嵌套层索引（0=顶层）
     * @param {number} col - 数据列号
     * @returns {{label: string, colspan: number}|null}
     */
    getNestedColHeader(rowIndex, col) {
        return this.#headerLabels.getNestedColHeader(rowIndex, col);
    }

    /**
     * 获取表头总高度（像素）
     * @returns {number}
     */
    getHeaderHeight() {
        return this.#headerLabels.getHeaderHeight();
    }

    /** 获取/设置列头行高度（px） */
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

    // ============================================================
    // 数据加载
    // ============================================================

    /**
     * 加载二维数组数据，完全替换目标区域的所有单元格
     * 行为：直接覆盖目标区域（包括空值），利用 set() 的天然覆盖特性
     * @param {Array<Array<*>>} data - 二维数组数据
     */
    loadData(data) {
        if (!this.#ensureWritable()) return;
        if (!Array.isArray(data)) return;
        const rows = data.length;
        if (rows === 0) return;

        let maxCols = 0;
        for (let r = 0; r < rows; r++) {
            const row = data[r];
            if (Array.isArray(row) && row.length > maxCols) maxCols = row.length;
        }
        if (maxCols === 0) return;

        this.rowColManager.ensureSize(rows, maxCols);

        for (let r = 0; r < rows; r++) {
            const row = data[r];
            if (!Array.isArray(row)) continue;
            for (let c = 0; c < maxCols; c++) {
                const val = c < row.length ? row[c] : "";
                if (typeof val === "string" && val.startsWith("=")) {
                    const results = this.#bus.emit(SHEET_EVENTS.FORMULA_SET, { r, c, formula: val });
                    const result = results !== undefined ? results : val;
                    this.cellStore.set(r, c, new Cell(result, 0, false, val));
                } else {
                    this.cellStore.set(r, c, new Cell(val, 0));
                }
            }
        }

        this.#invalidateAll();
    }

    // ============================================================
    // 样式解析（核心：带帧级缓存）
    // ============================================================

    /** 解析单元格最终样式（委托 SheetStyleManager） */
    resolveStyle(r, c) {
        return this.#styleManager.resolveStyle(r, c);
    }

    // ============================================================
    // cell / cells 配置
    // ============================================================

    /**
     * 应用 cell 配置（静态声明式）
     * 遍历 cellConfig 数组，逐项应用属性到对应单元格
     */
    applyCellConfig() {
        for (const item of this.cellConfig) {
            if (item.row == null || item.col == null) continue;
            const { row: r, col: c, value, style, disabled, readOnly, type, ...typeOptions } = item;
            this.rowColManager.ensureSize(r + 1, c + 1);

            if (type) {
                this.#typeManager.cellTypes.set(`${r},${c}`, { name: type, options: extractColumnTypeOptions(typeOptions) });
            }

            const cell = this.cellStore.get(r, c);
            const existingStyleId = cell?.styleId || 0;
            const existingStyle = existingStyleId ? stylePool.getStyle(existingStyleId) : {};
            const mergedStyle = style ? { ...existingStyle, ...style } : existingStyle;
            const newStyleId = stylePool.getStyleId(mergedStyle);

            const isDisabled = disabled ?? readOnly ?? cell?.disabled ?? false;
            const cellValue = value !== undefined ? value : (cell?.value ?? "");

            this.cellStore.set(r, c, new Cell(cellValue, newStyleId, isDisabled, cell?.formula));

            if (disabled === true || readOnly === true) {
                const updatedCell = this.cellStore.get(r, c);
                if (updatedCell && !updatedCell.disabled) {
                    this.cellStore.set(r, c, new Cell(updatedCell.value, updatedCell.styleId, true, updatedCell.formula));
                }
            }
        }
        this.#invalidateAll();
    }

    /**
     * 解析单元格属性（动态计算式，由 cellsFn 驱动）
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {{style?: object, disabled?: boolean, readOnly?: boolean, value?: *}|null}
     */
    resolveCellProperties(r, c) {
        if (typeof this.cellsFn !== "function") return null;
        try {
            return this.cellsFn(r, c);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.CELL_INVALID_DATA, `cellsFn execution failed at (${r},${c})`, { originalError: error });
            return null;
        }
    }

    // ============================================================
    // 合并单元格
    // ============================================================

    /**
     * 合并单元格
     * @param {number} topRow
     * @param {number} topCol
     * @param {number} bottomRow
     * @param {number} bottomCol
     * @returns {boolean}
     */
    mergeCells(topRow, topCol, bottomRow, bottomCol) {
        if (!this.#ensureWritable()) return false;

        // 禁止跨不同列类型合并
        if (!this.#checkColumnTypeConsistency(topCol, bottomCol)) {
            return false;
        }

        const cmd = new MergeCommand(this.mergeManager, topRow, topCol, bottomRow, bottomCol);
        cmd.redo();
        if (cmd.succeeded) {
            this.history.push(cmd);
            this.#invalidateAll();
        }
        return cmd.succeeded;
    }

    /**
     * 取消合并单元格
     * @param {number} row
     * @param {number} col
     * @returns {boolean}
     */
    unmergeCells(row, col) {
        if (!this.#ensureWritable()) return false;
        const cmd = new UnmergeCommand(this.mergeManager, row, col);
        cmd.redo();
        if (cmd.oldMerge) {
            this.history.push(cmd);
            this.#invalidateAll();
            return true;
        }
        return false;
    }

    /** 获取合并单元格信息 */
    getMerge(row, col) {
        return this.mergeManager.getMerge(row, col);
    }

    /** 判断是否为合并区域的左上角单元格 */
    isMergeTopLeft(row, col) {
        return this.mergeManager.isTopLeft(row, col);
    }

    /** 判断是否属于某个合并区域（非左上角） */
    isMergedCell(row, col) {
        return this.mergeManager.isMerged(row, col);
    }

    /** 获取所有合并单元格信息 */
    getAllMerges() {
        return this.mergeManager.getAllMerges();
    }

    // ============================================================
    // 批量操作
    // ============================================================

    /**
     * 开始批量操作（委托 BatchOperationManager）
     *
     * 确保粘贴、剪切、自动填充等多单元格操作可以一键撤销。
     */
    beginBatch() {
        this.#batchOp.beginBatch();
    }

    endBatch() {
        this.#batchOp.endBatch(this.history);
    }

    // ============================================================
    // 渲染 & 撤销/重做
    // ============================================================

    /** 触发渲染（通过 bus 事件委托 Workbook 执行实际渲染） */
    render() {
        this.#bus.emit(SHEET_EVENTS.RENDER_REQUEST);
    }

    /** 撤销上一步操作 */
    undo() {
        if (!this.#ensureWritable()) return;
        this.history.undo();
        this.#bus.emit(SHEET_EVENTS.UNDO);
        this.#invalidateAll();
    }

    /** 重做上一步撤销的操作 */
    redo() {
        if (!this.#ensureWritable()) return;
        this.history.redo();
        this.#bus.emit(SHEET_EVENTS.REDO);
        this.#invalidateAll();
    }

    // ============================================================
    // 行列操作：插入 / 删除 / 移动
    // ============================================================

    /** 在指定位置插入行 */
    insertRow(atRow) {
        if (!this.#ensureWritable()) return;
        if (!this.#isValidIndex(atRow, CONFIG.MAX_ROWS)) return;
        this.#dispatchToSubSystems(SUB.INSERT_ROW, atRow);
        this.#rowSync.insert(atRow);
    }

    /** 在指定位置插入列 */
    insertCol(atCol) {
        if (!this.#ensureWritable()) return;
        if (!this.#isValidIndex(atCol, CONFIG.MAX_COLS)) return;
        this.#dispatchToSubSystems(SUB.INSERT_COL, atCol);
        this.#colSync.insert(atCol);
    }

    /** 删除指定行 */
    deleteRow(atRow) {
        if (!this.#ensureWritable()) return;
        if (!this.#isValidIndex(atRow, CONFIG.MAX_ROWS)) return;
        this.#dispatchToSubSystems(SUB.DELETE_ROW, atRow);
        this.#rowSync.delete(atRow);
    }

    /** 删除指定列 */
    deleteCol(atCol) {
        if (!this.#ensureWritable()) return;
        if (!this.#isValidIndex(atCol, CONFIG.MAX_COLS)) return;
        this.#dispatchToSubSystems(SUB.DELETE_COL, atCol);
        this.#colSync.delete(atCol);
    }

    /** 移动列：将 fromCol 的数据移到 toCol 位置，中间列自动平移 */
    moveCol(fromCol, toCol) {
        if (!this.#ensureWritable()) return;
        if (fromCol === toCol || fromCol < 0 || toCol < 0) return;
        if (fromCol >= CONFIG.MAX_COLS || toCol >= CONFIG.MAX_COLS) return;
        this.#dispatchToSubSystems(SUB.MOVE_COL, fromCol, toCol);
        this.#colSync.move(fromCol, toCol);
        this.#invalidateAll();
    }

    /** 移动行：将 fromRow 的数据移到 toRow 位置，中间行自动平移 */
    moveRow(fromRow, toRow) {
        if (!this.#ensureWritable()) return;
        if (fromRow === toRow || fromRow < 0 || toRow < 0) return;
        if (fromRow >= CONFIG.MAX_ROWS || toRow >= CONFIG.MAX_ROWS) return;
        this.#dispatchToSubSystems(SUB.MOVE_ROW, fromRow, toRow);
        this.#rowSync.move(fromRow, toRow);
        this.#invalidateAll();
    }

    #dispatchToSubSystems(method, ...args) {
        this.rowColManager[method](...args);
        this.cellStore[method](...args);
        this.mergeManager[method](...args);
        if (this.chartManager && typeof this.chartManager[method] === "function") {
            this.chartManager[method](...args);
        }
        this.#invalidateAll();
    }

    #isValidIndex(index, max) {
        return index >= 0 && index < max;
    }

    // ============================================================
    // 列类型配置（委托 ColumnTypeManager）
    // ============================================================

    getColumnConfig(col) {
        return this.#typeManager.getColumnConfig(col);
    }

    getColumnType(col) {
        return this.#typeManager.getColumnType(col);
    }

    #checkColumnTypeConsistency(topCol, bottomCol) {
        return this.#typeManager.checkColumnTypeConsistency(topCol, bottomCol);
    }

    getColumnTypeInstance(col) {
        return this.#typeManager.getColumnTypeInstance(col);
    }

    getCellTypeInstance(r, c) {
        return this.#typeManager.getCellTypeInstance(r, c);
    }

    applyColumnsConfig(columnsConfig) {
        this.#typeManager.applyColumnsConfig(columnsConfig);
        this.#invalidateAll();
    }

    // ============================================================
    // 动态行列数调整
    // ============================================================

    /**
     * 动态设置行数
     * @param {number} rows - 新的行数（必须 >= 1）
     */
    setRowCount(rows) {
        if (!Number.isInteger(rows) || rows < 1) {
            errorHandler.warn(ERROR_CODE.GENERIC_WARN, `[Sheet] setRowCount: invalid rows=${rows}, must be integer >= 1`);
            return;
        }
        const currentCols = this.rowColManager.colCount;
        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[Sheet] setRowCount: ${this.rowColManager.rowCount} → ${rows}`);
        this.rowColManager.resetSize(rows, currentCols);
        this.#invalidateAll();
        this.render();
        this.#bus.emit(SHEET_EVENTS.AFTER_CHANGE, { changes: [] });
    }

    /**
     * 动态设置列数
     * @param {number} cols - 新的列数（必须 >= 1）
     */
    setColCount(cols) {
        if (!Number.isInteger(cols) || cols < 1) {
            errorHandler.warn(ERROR_CODE.GENERIC_WARN, `[Sheet] setColCount: invalid cols=${cols}, must be integer >= 1`);
            return;
        }
        const currentRows = this.rowColManager.rowCount;
        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[Sheet] setColCount: ${this.rowColManager.colCount} → ${cols}`);
        this.rowColManager.resetSize(currentRows, cols);
        this.#invalidateAll();
        this.render();
        this.#bus.emit(SHEET_EVENTS.AFTER_CHANGE, { changes: [] });
    }

    /**
     * 同时动态设置行数和列数
     * @param {number} rows - 新的行数（必须 >= 1）
     * @param {number} cols - 新的列数（必须 >= 1）
     */
    setGridSize(rows, cols) {
        if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(cols) || cols < 1) {
            errorHandler.warn(ERROR_CODE.GENERIC_WARN, `[Sheet] setGridSize: invalid size ${rows}x${cols}, must be integers >= 1`);
            return;
        }
        errorHandler.debug(
            ERROR_CODE.DEBUG_LOG,
            `[Sheet] setGridSize: ${this.rowColManager.rowCount}x${this.rowColManager.colCount} → ${rows}x${cols}`,
        );
        this.rowColManager.resetSize(rows, cols);
        this.#invalidateAll();
        this.render();
        this.#bus.emit(SHEET_EVENTS.AFTER_CHANGE, { changes: [] });
    }

    // ============================================================
    // 类型系统委托：格式化 / 验证 / 解析（委托 ColumnTypeManager）
    // ============================================================

    formatCellValue(r, c, value) {
        return this.#typeManager.formatCellValue(r, c, value);
    }

    validateCellValue(r, c, value) {
        return this.#typeManager.validateCellValue(r, c, value);
    }

    parseCellValue(r, c, input) {
        return this.#typeManager.parseCellValue(r, c, input);
    }
}