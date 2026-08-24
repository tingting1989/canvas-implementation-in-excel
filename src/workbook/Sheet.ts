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
import { ChartManager } from "../plugins/chart/ChartManager";

import { SheetDataCoordinator } from "./coordinators/SheetDataCoordinator";
import { SheetStyleCoordinator } from "./coordinators/SheetStyleCoordinator";
import { SheetMergeCoordinator } from "./coordinators/SheetMergeCoordinator";
import { SheetOperationCoordinator } from "./coordinators/SheetOperationCoordinator";
import { SheetMetaCoordinator } from "./coordinators/SheetMetaCoordinator";

import type { ISheet, StyleObject, CellConfigItem, CellProperties } from "./interfaces/ISheet";
import type { CellDataAccessor } from "../model/grid/CellDataAccessor";
import type { BaseColumnType } from "../types/BaseColumnType";
import { TextareaColumnType } from "../types/TextareaColumnType";
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
    /** 事件总线实例（公开访问） */
    bus!: EventBus;

    /** 工作表名称 */
    name!: string;

    /** 是否可见（用于隐藏/显示工作表功能） */
    visible: boolean = true;

    /**
     * 分块单元格存储器
     * 使用 ChunkedStore 实现稀疏数据存储，优化内存使用
     */
    cellStore!: ChunkedCellStore;

    /** 选区管理器，跟踪当前选中的单元格和范围 */
    selection!: SelectionManager;

    /** 历史栈，支持撤销/重做操作 */
    history!: HistoryStack;

    /** 合并单元格管理器 */
    mergeManager!: MergeManager;

    /** 行列尺寸管理器，管理行高、列宽及坐标计算 */
    rowColManager!: RowColManager;

    /** 批量操作管理器，将多次操作合并为一次历史记录 */
    batchOp!: BatchOperationManager;

    /** 图表管理器（可选，按需创建） */
    chartManager: ChartManager | null = null;

    /** 单元格配置项数组 */
    cellConfig: CellConfigItem[] = [];

    /** 自定义单元格数据函数，覆盖默认的单元格读取逻辑 */
    cellsFn: ((r: number, c: number) => CellProperties | null) | null = null;

    /** 单元格内边距（px） */
    cellPadding: number = CONFIG.CELL_PADDING;

    /** 是否启用文本溢出省略号 */
    textOverflowEllipsis: boolean = CONFIG.TEXT_OVERFLOW_ELLIPSIS;

    /** 是否启用行自适应高度（全局开关） */
    autoRowHeight: boolean = false;

    /** 行自适应高度最小值（px） */
    autoRowHeightMin: number = CONFIG.AUTO_ROW_HEIGHT_MIN;

    /** 行自适应高度最大值（px） */
    autoRowHeightMax: number = CONFIG.AUTO_ROW_HEIGHT_MAX;

    /** 样式管理器，管理样式注册、缓存和查找 */
    styleManager!: SheetStyleManager;

    /** 列类型管理器，管理列的数据类型和校验规则 */
    typeManager!: ColumnTypeManager;

    /** 表头标签管理器，管理行/列/嵌套表头的显示文本 */
    headerLabels!: HeaderLabelManager;

    /** 条件格式管理器，管理条件格式规则和数据绑定样式 */
    conditionalFormat!: ConditionalFormatManager;

    /** 行同步器，处理行插入/删除时的联动更新 */
    rowSync!: RowColSync;

    /** 列同步器，处理列插入/删除时的联动更新 */
    colSync!: RowColSync;

    /** 内部事件总线实例 */
    #bus!: EventBus;

    /** 冻结行总高度缓存（-1 表示未计算） */
    #cachedFrozenRowsHeight: number = -1;

    /** 冻结列总宽度缓存（-1 表示未计算） */
    #cachedFrozenColsWidth: number = -1;

    /** 冻结行数（顶部固定行数） */
    #fixedRowsTop: number = 0;

    /** 冻结列数（左侧固定列数） */
    #fixedColumnsStart: number = 0;

    /** 只读模式标志 */
    #readOnly: boolean = false;

    /** 样式缓存版本号，每次失效时递增 */
    #styleCacheVersion: number = 0;

    /** 数据协调者（懒初始化） */
    #dataCoordinator?: SheetDataCoordinator;

    /** 样式协调者（懒初始化） */
    #styleCoordinator?: SheetStyleCoordinator;

    /** 合并协调者（懒初始化） */
    #mergeCoordinator?: SheetMergeCoordinator;

    /** 操作协调者（懒初始化） */
    #operationCoordinator?: SheetOperationCoordinator;

    /** 元数据协调者（懒初始化） */
    #metaCoordinator?: SheetMetaCoordinator;

    /** 单元格数据访问器（懒初始化，由 DataCoordinator 提供） */
    #cellDataAccessor?: CellDataAccessor;

    /**
     * 创建工作表实例
     *
     * 初始化所有管理器和协调者所需的共享基础设施：
     * - EventBus（事件总线）
     * - ChunkedCellStore（分块存储）
     * - SelectionManager（选区管理）
     * - HistoryStack（历史栈）
     * - MergeManager（合并管理）
     * - RowColManager（行列尺寸）
     * - BatchOperationManager（批量操作）
     * - 各子管理器（样式、类型、表头、条件格式、行列同步）
     *
     * @param name - 工作表名称
     */
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

    /** 获取冻结行数（顶部固定行数） */
    get fixedRowsTop(): number {
        return this.#fixedRowsTop;
    }

    /** 设置冻结行数，变更时自动清除冻结高度缓存 */
    set fixedRowsTop(v: number) {
        if (this.#fixedRowsTop !== v) {
            this.#fixedRowsTop = v;
            this.#cachedFrozenRowsHeight = -1;
        }
    }

    /** 获取冻结列数（左侧固定列数） */
    get fixedColumnsStart(): number {
        return this.#fixedColumnsStart;
    }

    /** 设置冻结列数，变更时自动清除冻结宽度缓存 */
    set fixedColumnsStart(v: number) {
        if (this.#fixedColumnsStart !== v) {
            this.#fixedColumnsStart = v;
            this.#cachedFrozenColsWidth = -1;
        }
    }

    /** 获取只读模式状态 */
    get readOnly(): boolean {
        return this.#readOnly;
    }

    /** 设置只读模式 */
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

    /**
     * 设置单元格值和样式
     *
     * 支持两种样式参数形式：
     * - `styleIdOrObj` 为 number → 视为已注册的样式 ID
     * - `styleIdOrObj` 为 StyleObject → 自动注册并获取 ID
     *
     * @param r - 行号
     * @param c - 列号
     * @param value - 单元格值
     * @param styleIdOrObj - 样式 ID 或样式对象
     * @param disabled - 是否禁用编辑
     */
    setCell(r: number, c: number, value: unknown, styleIdOrObj?: number | StyleObject, disabled?: boolean) {
        return this.data.setCell(r, c, value, styleIdOrObj, disabled);
    }

    /** 禁用指定单元格编辑 @param args - [行号, 列号] */
    disableCell(...args: [number, number]) {
        return this.data.disableCell(...args);
    }

    /** 启用指定单元格编辑 @param args - [行号, 列号] */
    enableCell(...args: [number, number]) {
        return this.data.enableCell(...args);
    }

    /** 检查单元格是否被禁用 @param args - [行号, 列号] @returns 是否禁用 */
    isDisabled(...args: [number, number]): boolean {
        return this.data.isDisabled(...args);
    }

    /** 批量加载数据 @param args - [二维数据数组] */
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

    /** 行样式 ID 映射表 */
    get rowStyles(): Map<number, number> {
        return this.styleManager.rowStyles;
    }
    /** 列样式 ID 映射表 */
    get colStyles(): Map<number, number> {
        return this.styleManager.colStyles;
    }

    /** 设置行样式 @param args - [行号, 样式对象] */
    setRowStyle(...args: [number, StyleObject]) {
        return this.styles.setRowStyle(...args);
    }
    /** 设置列样式 @param args - [列号, 样式对象] */
    setColStyle(...args: [number, StyleObject]) {
        return this.styles.setColStyle(...args);
    }
    /** 设置默认样式 @param args - [样式对象] */
    setDefaultStyle(...args: [StyleObject]) {
        return this.styles.setDefaultStyle(...args);
    }
    /** 获取默认样式 */
    getDefaultStyle(...args: []) {
        return this.styles.getDefaultStyle(...args);
    }
    /** 设置单元格样式 @param args - [行号, 列号, 样式对象] */
    setCellStyle(...args: [number, number, StyleObject]) {
        return this.styles.setCellStyle(...args);
    }
    /** 清除单元格样式 @param args - [行号, 列号] */
    clearCellStyle(...args: [number, number]) {
        return this.styles.clearCellStyle(...args);
    }
    /** 清除行样式 @param args - [行号] */
    clearRowStyle(...args: [number]) {
        return this.styles.clearRowStyle(...args);
    }
    /** 清除列样式 @param args - [列号] */
    clearColStyle(...args: [number]) {
        return this.styles.clearColStyle(...args);
    }
    /** 设置区域样式 @param args - [单元格范围, 样式对象] */
    setRangeStyle(...args: [CellRange, StyleObject]) {
        return this.styles.setRangeStyle(...args);
    }
    /** 清除区域样式 @param args - [单元格范围] */
    clearRangeStyle(...args: [CellRange]) {
        return this.styles.clearRangeStyle(...args);
    }
    /** 批量样式更新 @param args - [操作回调] */
    batchStyleUpdate(...args: [(sheet: ISheet) => void]) {
        return this.styles.batchStyleUpdate(...args);
    }
    /** 获取单元格解析后的样式对象 @param args - [行号, 列号] @returns 样式对象 */
    getCellStyle(...args: [number, number]): StyleObject {
        return this.styles.getCellStyle(...args);
    }
    /** 解析单元格最终样式（含条件格式、行/列样式、默认样式） @param args - [行号, 列号] @returns 样式对象 */
    resolveStyle(...args: [number, number]): StyleObject {
        return this.styles.resolveStyle(...args);
    }

    /** 添加条件格式规则 @param options - 规则配置（范围、条件函数、样式） */
    addConditionalRule(options: { range: CellRange; condition: (value: unknown, cell?: unknown) => boolean; style?: StyleObject }) {
        return this.styles.addConditionalRule(options);
    }
    /** 是否存在条件格式规则 @returns 是否存在 */
    hasConditionalRules(...args: []): boolean {
        return this.styles.hasConditionalRules(...args);
    }
    /** 是否存在数据绑定样式 @returns 是否存在 */
    hasDataBindings(...args: []): boolean {
        return this.styles.hasDataBindings(...args);
    }
    /** 匹配条件格式样式 @param args - [行号, 列号, 单元格值] @returns 样式 ID 或 null */
    matchConditionalStyle(...args: [number, number, unknown]): number | null {
        return this.styles.matchConditionalStyle(...args);
    }
    /** 绑定数据样式转换函数 @param args - [列号, 转换函数] */
    bindDataStyle(...args: [number, (value: unknown) => StyleObject | null]) {
        return this.styles.bindDataStyle(...args);
    }
    /** 获取数据绑定样式 ID @param args - [行号, 列号] @returns 样式 ID 或 null */
    getDataBindStyle(...args: [number, number]): number | null {
        return this.styles.getDataBindStyle(...args);
    }
    /** 数据绑定映射表 */
    get dataBindings(): Map<number, (value: unknown) => number> {
        return this.styles.dataBindings;
    }

    /** 列配置数组 */
    get columnsConfig() {
        return this.meta.columnsConfig;
    }
    /** 列类型映射表 */
    get cellTypes() {
        return this.meta.cellTypes;
    }
    /** 列表头标签 */
    get colHeaders() {
        return this.meta.colHeaders;
    }
    set colHeaders(v: unknown) {
        this.meta.colHeaders = v;
    }
    /** 行表头标签 */
    get rowHeaders() {
        return this.meta.rowHeaders;
    }
    set rowHeaders(v: unknown) {
        this.meta.rowHeaders = v;
    }
    /** 嵌套表头配置 */
    get nestedHeaders() {
        return this.meta.nestedHeaders;
    }
    set nestedHeaders(v: unknown) {
        this.meta.nestedHeaders = v;
    }
    /** 行表头宽度（px） */
    get rowHeaderWidth() {
        return this.meta.rowHeaderWidth;
    }
    set rowHeaderWidth(v: number) {
        this.meta.rowHeaderWidth = v;
    }
    /** 获取指定列的表头文本 @param args - [列号] @returns 表头文本 */
    getColHeader(...args: [number]): string {
        return this.meta.getColHeader(...args);
    }
    /** 获取指定列的表头样式 @param args - [列号] */
    getColHeaderStyle(...args: [number]) {
        return this.meta.getColHeaderStyle(...args);
    }
    /** 获取指定行的表头文本 @param args - [行号] @returns 表头文本 */
    getRowHeader(...args: [number]): string {
        return this.meta.getRowHeader(...args);
    }
    /** 获取指定行的表头样式 @param args - [行号] */
    getRowHeaderStyle(...args: [number]) {
        return this.meta.getRowHeaderStyle(...args);
    }
    /** 获取嵌套表头行数 @returns 行数 */
    getNestedHeaderRowCount(...args: []): number {
        return this.meta.getNestedHeaderRowCount(...args);
    }
    /** 获取嵌套表头单元格内容 @param args - [行号, 列号] */
    getNestedColHeader(...args: [number, number]) {
        return this.meta.getNestedColHeader(...args);
    }
    /** 表头高度（px） */
    get headerHeight() {
        return this.meta.headerHeight;
    }
    set headerHeight(v: number) {
        this.meta.headerHeight = v;
    }
    /** 计算表头高度 @returns 高度值（px） */
    getHeaderHeight(...args: []): number {
        return this.meta.getHeaderHeight(...args);
    }
    /** 计算表头宽度 @returns 宽度值（px） */
    getHeaderWidth(...args: []): number {
        return this.meta.getHeaderWidth(...args);
    }

    /** 获取指定列的配置 @param args - [列号] */
    getColumnConfig(...args: [number]) {
        return this.meta.getColumnConfig(...args);
    }
    /** 获取指定列的数据类型 @param args - [列号] @returns 类型名称 */
    getColumnType(...args: [number]): string {
        return this.meta.getColumnType(...args);
    }
    /** 检查列类型一致性 @param args - [行号, 列号] @returns 是否一致 */
    _checkColumnTypeConsistency(...args: [number, number]): boolean {
        return this.meta._checkColumnTypeConsistency(...args);
    }
    /** 获取列类型实例 @param args - [列号] @returns 列类型实例 */
    getColumnTypeInstance(...args: [number]): BaseColumnType {
        return this.meta.getColumnTypeInstance(...args);
    }
    /** 获取单元格类型实例（根据列类型推断） @param args - [行号, 列号] @returns 列类型实例 */
    getCellTypeInstance(...args: [number, number]): BaseColumnType {
        return this.meta.getCellTypeInstance(...args);
    }
    /** 应用列配置数组 @param args - [配置数组] */
    applyColumnsConfig(...args: [Record<string, unknown>[]]) {
        return this.meta.applyColumnsConfig(...args);
    }
    /** 格式化单元格值为显示文本 @param args - [行号, 列号, 值] @returns 格式化后的字符串 */
    formatCellValue(...args: [number, number, unknown]): string {
        return this.meta.formatCellValue(...args);
    }
    /** 校验单元格值 @param args - [行号, 列号, 值] @returns true 表示合法，字符串表示错误信息 */
    validateCellValue(...args: [number, number, unknown]): boolean | string {
        return this.meta.validateCellValue(...args);
    }
    /** 解析单元格输入文本为值 @param args - [行号, 列号, 输入文本] @returns 解析后的值 */
    parseCellValue(...args: [number, number, string]): unknown {
        return this.meta.parseCellValue(...args);
    }
    /** 应用单元格配置 */
    applyCellConfig(...args: []) {
        return this.meta.applyCellConfig(...args);
    }
    /** 解析单元格属性 @param args - [行号, 列号] @returns 单元格属性或 null */
    resolveCellProperties(...args: [number, number]): CellProperties | null {
        return this.meta.resolveCellProperties(...args);
    }

    /** 合并指定区域的单元格 @param args - [起始行, 起始列, 结束行, 结束列] @returns 是否成功 */
    mergeCells(...args: [number, number, number, number]): boolean {
        return this.merges.mergeCells(...args);
    }
    /** 取消指定单元格的合并 @param args - [行号, 列号] @returns 是否成功 */
    unmergeCells(...args: [number, number]): boolean {
        return this.merges.unmergeCells(...args);
    }
    /** 获取指定单元格的合并信息 @param args - [行号, 列号] */
    getMerge(...args: [number, number]) {
        return this.merges.getMerge(...args);
    }
    /** 检查是否为合并区域的左上角 @param args - [行号, 列号] @returns 是否为左上角 */
    isMergeTopLeft(...args: [number, number]): boolean {
        return this.merges.isMergeTopLeft(...args);
    }
    /** 检查是否属于合并单元格 @param args - [行号, 列号] @returns 是否属于合并区域 */
    isMergedCell(...args: [number, number]): boolean {
        return this.merges.isMergedCell(...args);
    }
    /** 获取所有合并区域信息 */
    getAllMerges(...args: []) {
        return this.merges.getAllMerges(...args);
    }

    /** 开始批量操作（暂停历史记录） */
    beginBatch(...args: []) {
        return this.operations.beginBatch(...args);
    }
    /** 结束批量操作（恢复历史记录） */
    endBatch(...args: []) {
        return this.operations.endBatch(...args);
    }
    /** 请求重绘 */
    render(...args: []) {
        return this.operations.render(...args);
    }
    /** 撤销上一步操作 */
    undo(...args: []) {
        return this.operations.undo(...args);
    }
    /** 重做上一步撤销的操作 */
    redo(...args: []) {
        return this.operations.redo(...args);
    }
    /** 在指定位置插入行 @param args - [行号] */
    insertRow(...args: [number]) {
        return this.operations.insertRow(...args);
    }
    /** 在指定位置插入列 @param args - [列号] */
    insertCol(...args: [number]) {
        return this.operations.insertCol(...args);
    }
    /** 删除指定行 @param args - [行号] */
    deleteRow(...args: [number]) {
        return this.operations.deleteRow(...args);
    }
    /** 删除指定列 @param args - [列号] */
    deleteCol(...args: [number]) {
        return this.operations.deleteCol(...args);
    }
    /** 移动列 @param args - [源列号, 目标列号] */
    moveCol(...args: [number, number]) {
        return this.operations.moveCol(...args);
    }
    /** 移动行 @param args - [源行号, 目标行号] */
    moveRow(...args: [number, number]) {
        return this.operations.moveRow(...args);
    }
    /** 设置行数 @param args - [行数] */
    setRowCount(...args: [number]) {
        return this.operations.setRowCount(...args);
    }
    /** 设置列数 @param args - [列数] */
    setColCount(...args: [number]) {
        return this.operations.setColCount(...args);
    }
    /** 设置网格尺寸 @param args - [行数, 列数] */
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

    /** 使所有缓存失效并触发 INVALIDATE_ALL 事件（公开方法） */
    invalidateAll(): void {
        this._invalidateAll();
    }

    /**
     * 使指定单元格缓存失效（内部方法，供 Coordinator 调用）
     * @param r - 行号
     * @param c - 列号
     */
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

    /**
     * 计算指定行的自适应高度
     *
     * 遍历该行所有有数据的列，根据文本内容、列宽、字体信息计算
     * 每个单元格所需高度，取最大值作为该行的自适应高度。
     * 结果被限制在 [autoRowHeightMin, autoRowHeightMax] 范围内。
     *
     * @param row - 行号
     * @returns 自适应行高（px）
     */
    calculateAutoRowHeight(row: number): number {
        const rc = this.rowColManager;
        const colCount = rc.colCount;
        let maxHeight = this.autoRowHeightMin;

        for (let col = 0; col < colCount; col++) {
            const cell = this.cellStore.get(row, col);
            if (!cell || cell.value === undefined || cell.value === null || cell.value === "") continue;

            const colWidth = rc.getColWidth(col);
            const padding = this.cellPadding;
            const maxTextWidth = colWidth - padding * 2;
            if (maxTextWidth <= 0) continue;

            const style = this.resolveStyle(row, col);
            const fontSize = style.fontSize || CONFIG.DEFAULT_FONT_SIZE;
            const fontFamily = style.fontFamily || CONFIG.DEFAULT_FONT_FAMILY;
            const fontWeight = style.fontWeight || "normal";
            const fontStyle = style.fontStyle === "italic" ? "italic" : "";
            const fontString = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`.trim().replace(/\s+/g, " ");

            const cellType = this.getCellTypeInstance(row, col);
            const typeName = cellType?.name || "text";
            const lineHeight = fontSize * (CONFIG.TEXTAREA_LINE_HEIGHT_RATIO as number);

            let lineCount = 1;
            const text = String(cell.value);

            const canvas = this.#measureCanvas || (this.#measureCanvas = document.createElement("canvas"));
            const ctx = canvas.getContext("2d")!;
            ctx.font = fontString;

            if (typeName === "textarea" || text.includes("\n")) {
                lineCount = this.#wrapTextMeasure(ctx, text, maxTextWidth);
            } else {
                const textWidth = ctx.measureText(text).width;
                if (textWidth <= maxTextWidth) {
                    lineCount = 1;
                } else {
                    lineCount = this.#wrapTextMeasure(ctx, text, maxTextWidth);
                }
            }

            const neededHeight = lineCount * lineHeight + padding * 2;
            if (neededHeight > maxHeight) {
                maxHeight = neededHeight;
            }
        }

        return Math.min(Math.max(maxHeight, this.autoRowHeightMin), this.autoRowHeightMax);
    }

    /**
     * 对指定行范围执行行自适应高度
     *
     * 遍历 [startRow, endRow] 范围内的每一行，计算自适应高度并应用。
     *
     * @param startRow - 起始行号
     * @param endRow - 结束行号（含）
     */
    autoFitRowHeight(startRow: number, endRow: number): void {
        const rc = this.rowColManager;
        for (let row = startRow; row <= endRow; row++) {
            const height = this.calculateAutoRowHeight(row);
            rc.setRowHeight(row, height);
        }
    }

    /** 测量用离屏 Canvas（懒创建，复用） */
    #measureCanvas: HTMLCanvasElement | null = null;

    /**
     * 文本换行测量：返回给定最大宽度下的行数
     *
     * @param ctx - Canvas 2D 上下文（已设置 font）
     * @param text - 文本内容
     * @param maxWidth - 最大文本宽度（px）
     * @returns 换行后的行数
     */
    #wrapTextMeasure(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): number {
        const cacheKey = `${text}|${maxWidth}|${ctx.font}`;

        const lines = TextareaColumnType.getCachedLines(cacheKey);
        if (lines !== undefined) return lines.length;

        const paragraphs = text.split("\n");
        let totalLines = 0;

        for (const paragraph of paragraphs) {
            if (paragraph === "") {
                totalLines += 1;
                continue;
            }
            let currentLine = "";
            let lineCount = 0;

            for (const char of paragraph) {
                const testLine = currentLine + char;
                if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
                    lineCount++;
                    currentLine = char;
                } else {
                    currentLine = testLine;
                }
            }

            if (currentLine) lineCount++;
            totalLines += Math.max(lineCount, 1);
        }

        return totalLines;
    }
}
