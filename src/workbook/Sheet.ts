import { SHEET_EVENTS } from "../constants/sheetEvents";
import { EventBus } from "../core/EventBus";

import { ChunkedCellStore, SelectionManager, HistoryStack, MergeManager } from "../model/index";
import { RowColManager } from "../model/grid/RowColManager";
import { RowColSync } from "../model/grid/RowColSync";
import { CONFIG } from "../constants/config";
import { SheetStyleManager } from "./managers/SheetStyleManager";
import { ColumnTypeManager } from "./managers/ColumnTypeManager";
import { HeaderLabelManager } from "./managers/HeaderLabelManager";
import { ConditionalFormatManager } from "./managers/ConditionalFormatManager";
import { BatchOperationManager } from "./managers/BatchOperationManager";
import { ChartManager } from "../model/chart/ChartManager";

import { SheetDataCoordinator } from "./coordinators/SheetDataCoordinator";
import { SheetStyleCoordinator } from "./coordinators/SheetStyleCoordinator";
import { SheetMergeCoordinator } from "./coordinators/SheetMergeCoordinator";
import { SheetOperationCoordinator } from "./coordinators/SheetOperationCoordinator";
import { SheetMetaCoordinator } from "./coordinators/SheetMetaCoordinator";

import type { ISheet, StyleObject, CellConfigItem, CellProperties } from "./interfaces/ISheet";
import type { CellDataAccessor } from "../model/grid/CellDataAccessor";
import type { BaseColumnType } from "../types/BaseColumnType";
import type { CellRange } from "../model/types";

/**
 * 工作表实现类（Coordinator 架构重构版）
 *
 * 职责：
 * - 协调各 Coordinator 子系统（数据、样式、合并、操作、元数据）
 * - 管理共享状态（冻结行列、只读模式、缓存版本号）
 * - 提供 100% 向后兼容的 API（薄代理模式）
 * - 作为外部调用的唯一入口点（Facade 模式）
 *
 * @implements {ISheet}
 */
export class Sheet implements ISheet {
    bus!: EventBus;
    name!: string;
    visible: boolean = true;
    cellStore!: ChunkedCellStore;
    selection!: SelectionManager;
    history!: HistoryStack;
    mergeManager!: MergeManager;
    rowColManager!: RowColManager;
    batchOp!: BatchOperationManager;
    chartManager: ChartManager | null = null;
    cellConfig: CellConfigItem[] = [];
    cellsFn: ((r: number, c: number) => CellProperties | null) | null = null;
    cellPadding: number = CONFIG.CELL_PADDING;
    textOverflowEllipsis: boolean = CONFIG.TEXT_OVERFLOW_ELLIPSIS;

    styleManager!: SheetStyleManager;
    typeManager!: ColumnTypeManager;
    headerLabels!: HeaderLabelManager;
    conditionalFormat!: ConditionalFormatManager;
    rowSync!: RowColSync;
    colSync!: RowColSync;

    #bus!: EventBus;
    #cachedFrozenRowsHeight: number = -1;
    #cachedFrozenColsWidth: number = -1;
    #fixedRowsTop: number = 0;
    #fixedColumnsStart: number = 0;
    #readOnly: boolean = false;
    #styleCacheVersion: number = 0;

    #dataCoordinator?: SheetDataCoordinator;
    #styleCoordinator?: SheetStyleCoordinator;
    #mergeCoordinator?: SheetMergeCoordinator;
    #operationCoordinator?: SheetOperationCoordinator;
    #metaCoordinator?: SheetMetaCoordinator;
    #cellDataAccessor?: CellDataAccessor;

    constructor(name: string) {
        this.name = name;

        this.#bus = new EventBus("Sheet", name, { strict: true });
        this.bus = this.#bus;

        this.cellStore = new ChunkedCellStore();
        this.selection = new SelectionManager();
        this.history = new HistoryStack();
        this.mergeManager = new MergeManager();
        this.rowColManager = new RowColManager();
        this.batchOp = new BatchOperationManager();

        this.styleManager = new SheetStyleManager(this);
        this.typeManager = new ColumnTypeManager(this);
        this.headerLabels = new HeaderLabelManager(this);
        this.conditionalFormat = new ConditionalFormatManager(this);
        this.rowSync = new RowColSync(this as any, CONFIG.AXIS_ROW);
        this.colSync = new RowColSync(this as any, CONFIG.AXIS_COL);

        this.chartManager = null;
    }

    /** 数据协调者（懒初始化） */
    get data(): SheetDataCoordinator {
        if (!this.#dataCoordinator) {
            this.#dataCoordinator = new SheetDataCoordinator(this);
        }
        return this.#dataCoordinator;
    }

    /** 样式协调者（懒初始化） */
    get styles(): SheetStyleCoordinator {
        if (!this.#styleCoordinator) {
            this.#styleCoordinator = new SheetStyleCoordinator(this);
        }
        return this.#styleCoordinator;
    }

    /** 合并协调者（懒初始化） */
    get merges(): SheetMergeCoordinator {
        if (!this.#mergeCoordinator) {
            this.#mergeCoordinator = new SheetMergeCoordinator(this);
        }
        return this.#mergeCoordinator;
    }

    /** 操作协调者（懒初始化） */
    get operations(): SheetOperationCoordinator {
        if (!this.#operationCoordinator) {
            this.#operationCoordinator = new SheetOperationCoordinator(this);
        }
        return this.#operationCoordinator;
    }

    /** 元数据协调者（懒初始化） */
    get meta(): SheetMetaCoordinator {
        if (!this.#metaCoordinator) {
            this.#metaCoordinator = new SheetMetaCoordinator(this);
        }
        return this.#metaCoordinator;
    }

    /**
     * 检查工作表是否可写（非只读）
     * @returns true 表示可写
     */
    _ensureWritable(): boolean {
        return !this.#readOnly;
    }

    /** 使所有缓存失效并触发 INVALIDATE_ALL 事件 */
    _invalidateAll(): void {
        this.#styleCacheVersion++;
        this.styleManager.invalidateCache();
        this.#bus.emit(SHEET_EVENTS.INVALIDATE_ALL);
    }

    /**
     * 使指定单元格缓存失效并触发 INVALIDATE_CELL 事件
     * @param r - 行号
     * @param c - 列号
     */
    _invalidateCell(r: number, c: number): void {
        this.styleManager.invalidateCache();
        this.#bus.emit(SHEET_EVENTS.INVALIDATE_CELL, { r, c });
    }

    get fixedRowsTop(): number {
        return this.#fixedRowsTop;
    }

    set fixedRowsTop(v: number) {
        if (this.#fixedRowsTop !== v) {
            this.#fixedRowsTop = v;
            this.#cachedFrozenRowsHeight = -1;
        }
    }

    get fixedColumnsStart(): number {
        return this.#fixedColumnsStart;
    }

    set fixedColumnsStart(v: number) {
        if (this.#fixedColumnsStart !== v) {
            this.#fixedColumnsStart = v;
            this.#cachedFrozenColsWidth = -1;
        }
    }

    get readOnly(): boolean {
        return this.#readOnly;
    }

    set readOnly(v: boolean) {
        this.#readOnly = !!v;
    }

    /** 冻结行总高度（px），带缓存 */
    get frozenRowsHeight(): number {
        if (this.#cachedFrozenRowsHeight < 0) {
            this.#cachedFrozenRowsHeight = this.#calculateFrozenRowsHeight();
        }
        return this.#cachedFrozenRowsHeight;
    }

    /** 冻结列总宽度（px），带缓存 */
    get frozenColsWidth(): number {
        if (this.#cachedFrozenColsWidth < 0) {
            this.#cachedFrozenColsWidth = this.#calculateFrozenColsWidth();
        }
        return this.#cachedFrozenColsWidth;
    }

    /** 使冻结区域缓存失效 */
    invalidateFreezeCache(): void {
        this.#cachedFrozenRowsHeight = -1;
        this.#cachedFrozenColsWidth = -1;
    }

    /** 获取单元格数据访问器 */
    get cellDataAccessor(): CellDataAccessor {
        return this.data.dataAccessor;
    }

    setCell(r: number, c: number, value: unknown, styleIdOrObj?: number | StyleObject, disabled?: boolean) {
        return this.data.setCell(r, c, value, styleIdOrObj, disabled);
    }

    disableCell(...args: [number, number]) {
        return this.data.disableCell(...args);
    }

    enableCell(...args: [number, number]) {
        return this.data.enableCell(...args);
    }

    isDisabled(...args: [number, number]): boolean {
        return this.data.isDisabled(...args);
    }

    loadData(...args: [unknown[][]]) {
        return this.data.loadData(...args);
    }

    /**
     * 清除所有数据
     *
     * @param options - 选项
     * @param options.skipHistory - 是否跳过历史记录（默认 false）
     * @returns 变更信息和清除数量
     */
    clearData(options: { skipHistory?: boolean } = {}): {
        changes: Array<{ row: number; col: number; oldValue: unknown; styleId: number }>;
        clearedCount: number;
    } {
        const { skipHistory = false } = options;
        const accessor = this.cellDataAccessor;

        const { changes, clearedCount } = accessor.clearAll();

        if (changes.length > 0 && !skipHistory) {
            this.beginBatch();

            for (const { row, col, oldValue, styleId } of changes) {
                this.setCell(row, col, "", styleId);
            }

            this.endBatch();
        }

        this.bus.emit(SHEET_EVENTS.DATA_CLEARED, {
            sheet: this,
            changes,
            clearedCount,
            range: null,
        });

        return { changes, clearedCount };
    }

    /**
     * 清除指定区域数据
     *
     * @param topRow - 起始行
     * @param topCol - 起始列
     * @param bottomRow - 结束行
     * @param bottomCol - 结束列
     * @param options - 选项
     * @param options.skipHistory - 是否跳过历史记录
     * @returns 变更信息和清除数量
     */
    clearRange(
        topRow: number,
        topCol: number,
        bottomRow: number,
        bottomCol: number,
        options: { skipHistory?: boolean } = {},
    ): { changes: Array<{ row: number; col: number; oldValue: unknown; styleId: number }>; clearedCount: number } {
        const { skipHistory = false } = options;
        const accessor = this.cellDataAccessor;

        const { changes, clearedCount } = accessor.clearRange(topRow, topCol, bottomRow, bottomCol);

        if (changes.length > 0 && !skipHistory) {
            this.beginBatch();

            for (const { row, col, oldValue, styleId } of changes) {
                this.setCell(row, col, "", styleId);
            }

            this.endBatch();
        }

        this.bus.emit(SHEET_EVENTS.DATA_CLEARED, {
            sheet: this,
            changes,
            clearedCount,
            range: { topRow, topCol, bottomRow, bottomCol },
        });

        return { changes, clearedCount };
    }

    get rowStyles(): Map<number, number> {
        return this.styleManager.rowStyles;
    }
    get colStyles(): Map<number, number> {
        return this.styleManager.colStyles;
    }

    setRowStyle(...args: [number, StyleObject]) {
        return this.styles.setRowStyle(...args);
    }
    setColStyle(...args: [number, StyleObject]) {
        return this.styles.setColStyle(...args);
    }
    setDefaultStyle(...args: [StyleObject]) {
        return this.styles.setDefaultStyle(...args);
    }
    getDefaultStyle(...args: []) {
        return this.styles.getDefaultStyle(...args);
    }
    setCellStyle(...args: [number, number, StyleObject]) {
        return this.styles.setCellStyle(...args);
    }
    clearCellStyle(...args: [number, number]) {
        return this.styles.clearCellStyle(...args);
    }
    clearRowStyle(...args: [number]) {
        return this.styles.clearRowStyle(...args);
    }
    clearColStyle(...args: [number]) {
        return this.styles.clearColStyle(...args);
    }
    setRangeStyle(...args: [CellRange, StyleObject]) {
        return this.styles.setRangeStyle(...args);
    }
    clearRangeStyle(...args: [CellRange]) {
        return this.styles.clearRangeStyle(...args);
    }
    batchStyleUpdate(...args: [(sheet: ISheet) => void]) {
        return this.styles.batchStyleUpdate(...args);
    }
    getCellStyle(...args: [number, number]): StyleObject {
        return this.styles.getCellStyle(...args);
    }
    resolveStyle(...args: [number, number]): StyleObject {
        return this.styles.resolveStyle(...args);
    }

    addConditionalRule(options: { range: CellRange; condition: (value: unknown, cell?: unknown) => boolean; style?: StyleObject }) {
        return this.styles.addConditionalRule(options);
    }
    hasConditionalRules(...args: []): boolean {
        return this.styles.hasConditionalRules(...args);
    }
    hasDataBindings(...args: []): boolean {
        return this.styles.hasDataBindings(...args);
    }
    matchConditionalStyle(...args: [number, number, unknown]): number | null {
        return this.styles.matchConditionalStyle(...args);
    }
    bindDataStyle(...args: [number, (value: unknown) => StyleObject | null]) {
        return this.styles.bindDataStyle(...args);
    }
    getDataBindStyle(...args: [number, number]): number | null {
        return this.styles.getDataBindStyle(...args);
    }
    get dataBindings(): Map<number, (value: unknown) => number> {
        return this.styles.dataBindings;
    }

    get columnsConfig() {
        return this.meta.columnsConfig;
    }
    get cellTypes() {
        return this.meta.cellTypes;
    }
    get colHeaders() {
        return this.meta.colHeaders;
    }
    set colHeaders(v: unknown) {
        this.meta.colHeaders = v;
    }
    get rowHeaders() {
        return this.meta.rowHeaders;
    }
    set rowHeaders(v: unknown) {
        this.meta.rowHeaders = v;
    }
    get nestedHeaders() {
        return this.meta.nestedHeaders;
    }
    set nestedHeaders(v: unknown) {
        this.meta.nestedHeaders = v;
    }
    get rowHeaderWidth() {
        return this.meta.rowHeaderWidth;
    }
    set rowHeaderWidth(v: number) {
        this.meta.rowHeaderWidth = v;
    }
    getColHeader(...args: [number]): string {
        return this.meta.getColHeader(...args);
    }
    getColHeaderStyle(...args: [number]) {
        return this.meta.getColHeaderStyle(...args);
    }
    getRowHeader(...args: [number]): string {
        return this.meta.getRowHeader(...args);
    }
    getRowHeaderStyle(...args: [number]) {
        return this.meta.getRowHeaderStyle(...args);
    }
    getNestedHeaderRowCount(...args: []): number {
        return this.meta.getNestedHeaderRowCount(...args);
    }
    getNestedColHeader(...args: [number, number]) {
        return this.meta.getNestedColHeader(...args);
    }
    get headerHeight() {
        return this.meta.headerHeight;
    }
    set headerHeight(v: number) {
        this.meta.headerHeight = v;
    }
    getHeaderHeight(...args: []): number {
        return this.meta.getHeaderHeight(...args);
    }
    getHeaderWidth(...args: []): number {
        return this.meta.getHeaderWidth(...args);
    }

    getColumnConfig(...args: [number]) {
        return this.meta.getColumnConfig(...args);
    }
    getColumnType(...args: [number]): string {
        return this.meta.getColumnType(...args);
    }
    _checkColumnTypeConsistency(...args: [number, number]): boolean {
        return this.meta._checkColumnTypeConsistency(...args);
    }
    getColumnTypeInstance(...args: [number]): BaseColumnType {
        return this.meta.getColumnTypeInstance(...args);
    }
    getCellTypeInstance(...args: [number, number]): BaseColumnType {
        return this.meta.getCellTypeInstance(...args);
    }
    applyColumnsConfig(...args: [Record<string, unknown>[]]) {
        return this.meta.applyColumnsConfig(...args);
    }
    formatCellValue(...args: [number, number, unknown]): string {
        return this.meta.formatCellValue(...args);
    }
    validateCellValue(...args: [number, number, unknown]): boolean | string {
        return this.meta.validateCellValue(...args);
    }
    parseCellValue(...args: [number, number, string]): unknown {
        return this.meta.parseCellValue(...args);
    }
    applyCellConfig(...args: []) {
        return this.meta.applyCellConfig(...args);
    }
    resolveCellProperties(...args: [number, number]): CellProperties | null {
        return this.meta.resolveCellProperties(...args);
    }

    mergeCells(...args: [number, number, number, number]): boolean {
        return this.merges.mergeCells(...args);
    }
    unmergeCells(...args: [number, number]): boolean {
        return this.merges.unmergeCells(...args);
    }
    getMerge(...args: [number, number]) {
        return this.merges.getMerge(...args);
    }
    isMergeTopLeft(...args: [number, number]): boolean {
        return this.merges.isMergeTopLeft(...args);
    }
    isMergedCell(...args: [number, number]): boolean {
        return this.merges.isMergedCell(...args);
    }
    getAllMerges(...args: []) {
        return this.merges.getAllMerges(...args);
    }

    beginBatch(...args: []) {
        return this.operations.beginBatch(...args);
    }
    endBatch(...args: []) {
        return this.operations.endBatch(...args);
    }
    render(...args: []) {
        return this.operations.render(...args);
    }
    undo(...args: []) {
        return this.operations.undo(...args);
    }
    redo(...args: []) {
        return this.operations.redo(...args);
    }
    insertRow(...args: [number]) {
        return this.operations.insertRow(...args);
    }
    insertCol(...args: [number]) {
        return this.operations.insertCol(...args);
    }
    deleteRow(...args: [number]) {
        return this.operations.deleteRow(...args);
    }
    deleteCol(...args: [number]) {
        return this.operations.deleteCol(...args);
    }
    moveCol(...args: [number, number]) {
        return this.operations.moveCol(...args);
    }
    moveRow(...args: [number, number]) {
        return this.operations.moveRow(...args);
    }
    setRowCount(...args: [number]) {
        return this.operations.setRowCount(...args);
    }
    setColCount(...args: [number]) {
        return this.operations.setColCount(...args);
    }
    setGridSize(...args: [number, number]) {
        return this.operations.setGridSize(...args);
    }

    /**
     * 可见列号 → 实际列号（当前为恒等映射，列移动功能预留）
     * @param visibleCol - 可见列号
     * @returns 实际列号
     */
    toRealCol(visibleCol: number): number {
        return visibleCol;
    }

    /**
     * 实际列号 → 可见列号（当前为恒等映射，列移动功能预留）
     * @param realCol - 实际列号
     * @returns 可见列号
     */
    toVisibleCol(realCol: number): number {
        return realCol;
    }

    invalidateAll(): void {
        this._invalidateAll();
    }

    _invalidateCellInternal(r: number, c: number): void {
        this._invalidateCell(r, c);
    }

    /**
     * 计算冻结行总高度
     * @returns 冻结行高度（px）
     */
    #calculateFrozenRowsHeight(): number {
        if (this.#fixedRowsTop <= 0) return 0;

        const rc = this.rowColManager;
        const lastFrozenRow = this.#fixedRowsTop - 1;

        return rc.getRowY(lastFrozenRow) + rc.getRowHeight(lastFrozenRow);
    }

    /**
     * 计算冻结列总宽度
     * @returns 冻结列宽度（px）
     */
    #calculateFrozenColsWidth(): number {
        if (this.#fixedColumnsStart <= 0) return 0;

        const rc = this.rowColManager;
        const lastFrozenCol = this.#fixedColumnsStart - 1;

        return rc.getColX(lastFrozenCol) + rc.getColWidth(lastFrozenCol);
    }
}
