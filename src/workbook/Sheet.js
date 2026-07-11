import { SHEET_EVENTS } from "../constants/sheetEvents.js";
import { EventBus } from "../core/EventBus.js";

import { ChunkedCellStore, SelectionManager, HistoryStack, MergeManager, Cell } from "@/model";
import { RowColManager } from "../model/grid/RowColManager.js";
import { RowColSync } from "../model/grid/RowColSync.js";
import { CONFIG } from "../constants/config";
import { SheetStyleManager } from "./managers/SheetStyleManager.js";
import { ColumnTypeManager } from "./managers/ColumnTypeManager.js";
import { HeaderLabelManager } from "./managers/HeaderLabelManager.js";
import { ConditionalFormatManager } from "./managers/ConditionalFormatManager.js";
import { BatchOperationManager } from "./managers/BatchOperationManager.js";
import { ChartManager } from "../model/chart/ChartManager.js";

// 导入协调者（Coordinator）
import { SheetDataCoordinator } from "./coordinators/SheetDataCoordinator.js";
import { SheetStyleCoordinator } from "./coordinators/SheetStyleCoordinator.js";
import { SheetMergeCoordinator } from "./coordinators/SheetMergeCoordinator.js";
import { SheetOperationCoordinator } from "./coordinators/SheetOperationCoordinator.js";
import { SheetMetaCoordinator } from "./coordinators/SheetMetaCoordinator.js";

// 导入接口定义
import { ISheet } from "./interfaces/ISheet.js";

/**
 * 工作表（重构后）
 *
 * 职责：
 * - 协调各 Coordinator 子系统
 * - 管理共享状态（冻结、只读等）
 * - 提供 100% 向后兼容的 API
 * - 作为外部调用的唯一入口点
 *
 * 设计理念：
 * - 本身不包含业务逻辑，仅做薄代理
 * - 所有具体实现委托给对应的 Coordinator
 * - 通过懒初始化延迟创建 Coordinator 实例
 */
/**
 * 工作表实现类
 *
 * 实现 ISheet 接口，作为外部代码的唯一入口点。
 * 通过 Coordinator 模式将职责委派给专职的协调者类。
 *
 * @implements {ISheet}
 */
export class Sheet extends ISheet {
    // ============================================================
    // 公开属性（供所有子系统和外部代码访问）
    // ============================================================

    /** 事件总线 */
    bus;

    /** 工作表名称 */
    name;

    /** 是否可见 */
    visible = true;

    /** 单元格数据存储 */
    cellStore;

    /** 选区管理器 */
    selection;

    /** 操作历史栈 */
    history;

    /** 合并单元格管理器 */
    mergeManager;

    /** 行列尺寸与坐标计算管理器 */
    rowColManager;

    /** 批量操作管理器 */
    batchOp;

    /** 图表管理器 */
    chartManager;

    /** 单元格静态配置 */
    cellConfig = [];

    /** 单元格动态配置函数 */
    cellsFn = null;

    /** 单元格内边距（px） */
    cellPadding = CONFIG.CELL_PADDING;

    /** 文本溢出省略号 */
    textOverflowEllipsis = CONFIG.TEXT_OVERFLOW_ELLIPSIS;

    // ============================================================
    // 子系统管理器（供协调者直接访问）
    // ============================================================

    /** 样式管理器 */
    styleManager;

    /** 列类型管理器 */
    typeManager;

    /** 表头标签管理器 */
    headerLabels;

    /** 条件格式管理器 */
    conditionalFormat;

    /** 行同步器 */
    rowSync;

    /** 列同步器 */
    colSync;

    // ============================================================
    // 私有状态（仅限内部使用）
    // ============================================================

    /** @private */ #bus;
    /** @private */ #cachedFrozenRowsHeight = -1;
    /** @private */ #cachedFrozenColsWidth = -1;
    /** @private */ #fixedRowsTop = 0;
    /** @private */ #fixedColumnsStart = 0;
    /** @private */ #readOnly = false;
    /** @private */ #styleCacheVersion = 0;

    // ============================================================
    // 协调者实例（懒初始化）
    // ============================================================

    /** @private */ #dataCoordinator;
    /** @private */ #styleCoordinator;
    /** @private */ #mergeCoordinator;
    /** @private */ #operationCoordinator;
    /** @private */ #metaCoordinator;
    /** @private */ #cellDataAccessor;

    // ============================================================
    // 构造函数
    // ============================================================

    /**
     * @param {string} name - 工作表名称
     */
    constructor(name) {
        super(); // 必须首先调用父类构造函数（ISheet）

        this.name = name;

        // 创建事件总线
        this.#bus = new EventBus("Sheet", name, { strict: true });
        this.bus = this.#bus; // 公开访问

        // 创建核心子系统
        this.cellStore = new ChunkedCellStore();
        this.selection = new SelectionManager();
        this.history = new HistoryStack();
        this.mergeManager = new MergeManager();
        this.rowColManager = new RowColManager();
        this.batchOp = new BatchOperationManager();

        // 创建子管理器（公开属性，供协调者直接访问）
        this.styleManager = new SheetStyleManager(this);
        this.typeManager = new ColumnTypeManager(this);
        this.headerLabels = new HeaderLabelManager(this);
        this.conditionalFormat = new ConditionalFormatManager(this);
        this.rowSync = new RowColSync(this, CONFIG.AXIS_ROW);
        this.colSync = new RowColSync(this, CONFIG.AXIS_COL);

        /** 图表管理器（延迟初始化或由外部注入） */
        this.chartManager = null;
    }

    // ============================================================
    // 协调者 Getter（懒初始化 + 缓存）
    // ============================================================

    /**
     * 数据操作协调者
     * @returns {SheetDataCoordinator}
     */
    get data() {
        if (!this.#dataCoordinator) {
            this.#dataCoordinator = new SheetDataCoordinator(this);
        }
        return this.#dataCoordinator;
    }

    /**
     * 样式管理协调者
     * @returns {SheetStyleCoordinator}
     */
    get styles() {
        if (!this.#styleCoordinator) {
            this.#styleCoordinator = new SheetStyleCoordinator(this);
        }
        return this.#styleCoordinator;
    }

    /**
     * 合并单元格协调者
     * @returns {SheetMergeCoordinator}
     */
    get merges() {
        if (!this.#mergeCoordinator) {
            this.#mergeCoordinator = new SheetMergeCoordinator(this);
        }
        return this.#mergeCoordinator;
    }

    /**
     * 操作执行协调者
     * @returns {SheetOperationCoordinator}
     */
    get operations() {
        if (!this.#operationCoordinator) {
            this.#operationCoordinator = new SheetOperationCoordinator(this);
        }
        return this.#operationCoordinator;
    }

    /**
     * 元数据协调者
     * @returns {SheetMetaCoordinator}
     */
    get meta() {
        if (!this.#metaCoordinator) {
            this.#metaCoordinator = new SheetMetaCoordinator(this);
        }
        return this.#metaCoordinator;
    }

    /**
     * 检查工作表是否可写
     * @returns {boolean}
     */
    _ensureWritable() {
        return !this.#readOnly;
    }

    /**
     * 标记整个视图需要重绘
     * @private
     */
    _invalidateAll() {
        this.#styleCacheVersion++;
        this.styleManager.invalidateCache();
        this.#bus.emit(SHEET_EVENTS.INVALIDATE_ALL);
    }

    /**
     * 标记单个单元格需要重绘
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    _invalidateCell(r, c) {
        this.styleManager.invalidateCache();
        this.#bus.emit(SHEET_EVENTS.INVALIDATE_CELL, { r, c });
    }

    // ============================================================
    // 冻结状态（getter/setter 维护缓存）
    // ============================================================

    get fixedRowsTop() {
        return this.#fixedRowsTop;
    }

    set fixedRowsTop(v) {
        if (this.#fixedRowsTop !== v) {
            this.#fixedRowsTop = v;
            this.#cachedFrozenRowsHeight = -1; // 仅在值变化时使缓存失效
        }
    }

    get fixedColumnsStart() {
        return this.#fixedColumnsStart;
    }

    set fixedColumnsStart(v) {
        if (this.#fixedColumnsStart !== v) {
            this.#fixedColumnsStart = v;
            this.#cachedFrozenColsWidth = -1; // 仅在值变化时使缓存失效
        }
    }

    get readOnly() {
        return this.#readOnly;
    }

    set readOnly(v) {
        this.#readOnly = !!v; // 强制转换为布尔值，确保类型安全
    }

    get frozenRowsHeight() {
        if (this.#cachedFrozenRowsHeight < 0) {
            this.#cachedFrozenRowsHeight = this.#calculateFrozenRowsHeight();
        }
        return this.#cachedFrozenRowsHeight;
    }

    get frozenColsWidth() {
        if (this.#cachedFrozenColsWidth < 0) {
            this.#cachedFrozenColsWidth = this.#calculateFrozenColsWidth();
        }
        return this.#cachedFrozenColsWidth;
    }

    /**
     * 使冻结区域缓存失效
     *
     * 当行高/列宽发生变化（拖拽调整、隐藏/显示行列）时必须调用，
     * 确保下次访问 frozenRowsHeight/frozenColsWidth 时重新计算。
     *
     * 此方法供以下场景调用：
     * - RenderEngine.render() 开始渲染前
     * - ImportFilePlugin 导入数据后
     * - RowColManager 调整尺寸后
     */
    invalidateFreezeCache() {
        this.#cachedFrozenRowsHeight = -1;
        this.#cachedFrozenColsWidth = -1;
    }

    // ============================================================
    // 向后兼容的 API 代理（保持所有现有调用方式不变）
    // ============================================================

    // ---- DataCoordinator 代理 ----

    /** @returns {import("../model/grid/CellDataAccessor.js").CellDataAccessor} */
    get cellDataAccessor() {
        return this.data.dataAccessor;
    }

    setCell(...args) {
        return this.data.setCell(...args);
    }
    disableCell(...args) {
        return this.data.disableCell(...args);
    }
    enableCell(...args) {
        return this.data.enableCell(...args);
    }
    isDisabled(...args) {
        return this.data.isDisabled(...args);
    }
    loadData(...args) {
        return this.data.loadData(...args);
    }

    // ---- StyleCoordinator 代理 ----

    get rowStyles() {
        return this.styleManager.rowStyles;
    }
    get colStyles() {
        return this.styleManager.colStyles;
    }
    setRowStyle(...args) {
        return this.styles.setRowStyle(...args);
    }
    setColStyle(...args) {
        return this.styles.setColStyle(...args);
    }
    setDefaultStyle(...args) {
        return this.styles.setDefaultStyle(...args);
    }
    getDefaultStyle(...args) {
        return this.styles.getDefaultStyle(...args);
    }
    setCellStyle(...args) {
        return this.styles.setCellStyle(...args);
    }
    clearCellStyle(...args) {
        return this.styles.clearCellStyle(...args);
    }
    clearRowStyle(...args) {
        return this.styles.clearRowStyle(...args);
    }
    clearColStyle(...args) {
        return this.styles.clearColStyle(...args);
    }
    setRangeStyle(...args) {
        return this.styles.setRangeStyle(...args);
    }
    clearRangeStyle(...args) {
        return this.styles.clearRangeStyle(...args);
    }
    batchStyleUpdate(...args) {
        return this.styles.batchStyleUpdate(...args);
    }
    getCellStyle(...args) {
        return this.styles.getCellStyle(...args);
    }
    resolveStyle(...args) {
        return this.styles.resolveStyle(...args);
    }

    addConditionalRule(...args) {
        return this.styles.addConditionalRule(...args);
    }
    hasConditionalRules(...args) {
        return this.styles.hasConditionalRules(...args);
    }
    hasDataBindings(...args) {
        return this.styles.hasDataBindings(...args);
    }
    matchConditionalStyle(...args) {
        return this.styles.matchConditionalStyle(...args);
    }
    bindDataStyle(...args) {
        return this.styles.bindDataStyle(...args);
    }
    getDataBindStyle(...args) {
        return this.styles.getDataBindStyle(...args);
    }
    get dataBindings() {
        return this.styles.dataBindings;
    }

    // ---- MetaCoordinator 代理 ----

    get columnsConfig() {
        return this.meta.columnsConfig;
    }
    get cellTypes() {
        return this.meta.cellTypes;
    }
    get colHeaders() {
        return this.meta.colHeaders;
    }
    set colHeaders(v) {
        this.meta.colHeaders = v;
    }
    get rowHeaders() {
        return this.meta.rowHeaders;
    }
    set rowHeaders(v) {
        this.meta.rowHeaders = v;
    }
    get nestedHeaders() {
        return this.meta.nestedHeaders;
    }
    set nestedHeaders(v) {
        this.meta.nestedHeaders = v;
    }
    get rowHeaderWidth() {
        return this.meta.rowHeaderWidth;
    }
    set rowHeaderWidth(v) {
        this.meta.rowHeaderWidth = v;
    }
    getColHeader(...args) {
        return this.meta.getColHeader(...args);
    }
    getColHeaderStyle(...args) {
        return this.meta.getColHeaderStyle(...args);
    }
    getRowHeader(...args) {
        return this.meta.getRowHeader(...args);
    }
    getRowHeaderStyle(...args) {
        return this.meta.getRowHeaderStyle(...args);
    }
    getNestedHeaderRowCount(...args) {
        return this.meta.getNestedHeaderRowCount(...args);
    }
    getNestedColHeader(...args) {
        return this.meta.getNestedColHeader(...args);
    }
    get headerHeight() {
        return this.meta.headerHeight;
    }
    set headerHeight(v) {
        this.meta.headerHeight = v;
    }
    getHeaderHeight(...args) {
        return this.meta.getHeaderHeight(...args);
    }
    getHeaderWidth(...args) {
        return this.meta.getHeaderWidth(...args);
    }

    getColumnConfig(...args) {
        return this.meta.getColumnConfig(...args);
    }
    getColumnType(...args) {
        return this.meta.getColumnType(...args);
    }
    _checkColumnTypeConsistency(...args) {
        return this.meta._checkColumnTypeConsistency(...args);
    }
    getColumnTypeInstance(...args) {
        return this.meta.getColumnTypeInstance(...args);
    }
    getCellTypeInstance(...args) {
        return this.meta.getCellTypeInstance(...args);
    }
    applyColumnsConfig(...args) {
        return this.meta.applyColumnsConfig(...args);
    }

    formatCellValue(...args) {
        return this.meta.formatCellValue(...args);
    }
    validateCellValue(...args) {
        return this.meta.validateCellValue(...args);
    }
    parseCellValue(...args) {
        return this.meta.parseCellValue(...args);
    }

    applyCellConfig(...args) {
        return this.meta.applyCellConfig(...args);
    }
    resolveCellProperties(...args) {
        return this.meta.resolveCellProperties(...args);
    }

    // ---- MergeCoordinator 代理 ----

    mergeCells(...args) {
        return this.merges.mergeCells(...args);
    }
    unmergeCells(...args) {
        return this.merges.unmergeCells(...args);
    }
    getMerge(...args) {
        return this.merges.getMerge(...args);
    }
    isMergeTopLeft(...args) {
        return this.merges.isMergeTopLeft(...args);
    }
    isMergedCell(...args) {
        return this.merges.isMergedCell(...args);
    }
    getAllMerges(...args) {
        return this.merges.getAllMerges(...args);
    }

    // ---- OperationCoordinator 代理 ----

    beginBatch(...args) {
        return this.operations.beginBatch(...args);
    }
    endBatch(...args) {
        return this.operations.endBatch(...args);
    }
    render(...args) {
        return this.operations.render(...args);
    }
    undo(...args) {
        return this.operations.undo(...args);
    }
    redo(...args) {
        return this.operations.redo(...args);
    }
    insertRow(...args) {
        return this.operations.insertRow(...args);
    }
    insertCol(...args) {
        return this.operations.insertCol(...args);
    }
    deleteRow(...args) {
        return this.operations.deleteRow(...args);
    }
    deleteCol(...args) {
        return this.operations.deleteCol(...args);
    }
    moveCol(...args) {
        return this.operations.moveCol(...args);
    }
    moveRow(...args) {
        return this.operations.moveRow(...args);
    }
    setRowCount(...args) {
        return this.operations.setRowCount(...args);
    }
    setColCount(...args) {
        return this.operations.setColCount(...args);
    }
    setGridSize(...args) {
        return this.operations.setGridSize(...args);
    }

    // ---- 兼容性工具方法 ----

    toRealCol(visibleCol) {
        return visibleCol;
    }
    toVisibleCol(realCol) {
        return realCol;
    }

    invalidateAll() {
        this._invalidateAll();
    }
    _invalidateCellInternal(r, c) {
        this._invalidateCell(r, c);
    }

    // ---- 内部计算方法（冻结尺寸）----

    #calculateFrozenRowsHeight() {
        if (this.#fixedRowsTop <= 0) return 0;

        const rc = this.rowColManager;
        const lastFrozenRow = this.#fixedRowsTop - 1;

        // 使用 RowColManager 的缓存坐标，O(1) 时间复杂度
        return rc.getRowY(lastFrozenRow) + rc.getRowHeight(lastFrozenRow);
    }

    #calculateFrozenColsWidth() {
        if (this.#fixedColumnsStart <= 0) return 0;

        const rc = this.rowColManager;
        const lastFrozenCol = this.#fixedColumnsStart - 1;

        // 使用 RowColManager 的缓存坐标，O(1) 时间复杂度
        return rc.getColX(lastFrozenCol) + rc.getColWidth(lastFrozenCol);
    }
}
