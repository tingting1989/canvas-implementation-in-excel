/**
 * @fileoverview 工作表抽象接口 (ISheet)
 *
 * 设计目的：
 * 1. 解耦 Sheet 与其使用者（RenderEngine、Plugin 等）之间的循环依赖
 * 2. 明确 Sheet 对外暴露的公共 API 契约
 * 3. 支持依赖注入和单元测试中的 Mock 实现
 * 4. 作为类型检查的契约，确保所有实现类提供一致的行为
 */

import type { CellDataAccessor } from "../../model/grid/CellDataAccessor";
import type { RowColManager } from "../../model/grid/RowColManager";
import type { SelectionManager } from "../../model/selection/SelectionManager";
import type { MergeManager } from "../../model/merge/MergeManager";
import type { HistoryStack } from "../../model/history/HistoryStack";
import type { BatchOperationManager } from "../managers/BatchOperationManager";
import type { ChartManager } from "../../model/chart/ChartManager";
import type { EventBus } from "../../core/EventBus";
import type { ChunkedCellStore } from "../../model/store/ChunkedCellStore";
import type { SheetStyleManager } from "../managers/SheetStyleManager";
import type { ColumnTypeManager } from "../managers/ColumnTypeManager";
import type { HeaderLabelManager } from "../managers/HeaderLabelManager";
import type { ConditionalFormatManager } from "../managers/ConditionalFormatManager";
import type { RowColSync } from "../../model/grid/RowColSync";
import type { SheetDataCoordinator } from "../coordinators/SheetDataCoordinator";
import type { SheetStyleCoordinator } from "../coordinators/SheetStyleCoordinator";
import type { SheetMergeCoordinator } from "../coordinators/SheetMergeCoordinator";
import type { SheetOperationCoordinator } from "../coordinators/SheetOperationCoordinator";
import type { SheetMetaCoordinator } from "../coordinators/SheetMetaCoordinator";
import type { BaseColumnType } from "../../types/BaseColumnType";

/** 样式对象 */
export interface StyleObject {
    fontWeight?: string;
    color?: string;
    backgroundColor?: string;
    textAlign?: string;
    verticalAlign?: string;
    fontSize?: number;
    fontFamily?: string;
    italic?: boolean;
    underline?: boolean;
    rotation?: number;
    [key: string]: unknown;
}

/** 合并区域范围 */
export interface MergeRange {
    topRow: number;
    topCol: number;
    bottomRow: number;
    bottomCol: number;
}

/** 列配置项 */
export interface ColumnConfig {
    type?: string;
    defaultValue?: unknown;
    options?: Record<string, unknown>;
    readOnly?: boolean;
    width?: number;
    disabled?: boolean;
    style?: StyleObject;
    validator?: (value: unknown) => boolean | string;
    [key: string]: unknown;
}

/** Cell 配置项 */
export interface CellConfigItem {
    row: number;
    col: number;
    value?: unknown;
    style?: StyleObject;
    disabled?: boolean;
    readOnly?: boolean;
    type?: string;
    [key: string]: unknown;
}

/** 单元格属性解析结果 */
export interface CellProperties {
    style?: StyleObject;
    disabled?: boolean;
    readOnly?: boolean;
    value?: unknown;
    type?: string;
    [key: string]: unknown;
}

/**
 * 工作表接口 (ISheet)
 *
 * 定义了工作表必须实现的全部公共 API，
 * 用于解耦外部代码与具体实现之间的依赖关系。
 */
export interface ISheet {
    name: string;
    visible: boolean;
    readOnly: boolean;
    bus: EventBus;
    cellStore: ChunkedCellStore;
    rowColManager: RowColManager;
    selection: SelectionManager;
    mergeManager: MergeManager;
    history: HistoryStack;
    batchOp: BatchOperationManager;
    chartManager: ChartManager | undefined;

    styleManager: SheetStyleManager;
    typeManager: ColumnTypeManager;
    headerLabels: HeaderLabelManager;
    conditionalFormat: ConditionalFormatManager;
    rowSync: RowColSync;
    colSync: RowColSync;

    data: SheetDataCoordinator;
    styles: SheetStyleCoordinator;
    merges: SheetMergeCoordinator;
    operations: SheetOperationCoordinator;
    meta: SheetMetaCoordinator;

    cellConfig: CellConfigItem[];
    cellsFn: ((r: number, c: number) => CellProperties | null) | null;
    cellPadding: number;
    textOverflowEllipsis: boolean;

    _ensureWritable(): boolean;
    _invalidateAll(): void;
    _invalidateCell(r: number, c: number): void;
    _invalidateCellInternal(r: number, c: number): void;
    invalidateAll(): void;
    invalidateFreezeCache(): void;

    setCell(r: number, c: number, value: unknown, styleId?: number, disabled?: boolean): void;
    disableCell(r: number, c: number): void;
    enableCell(r: number, c: number): void;
    isDisabled(r: number, c: number): boolean;
    loadData(data: unknown[][]): void;
    cellDataAccessor: CellDataAccessor;

    setRowStyle(row: number, styleObj: StyleObject): void;
    setColStyle(col: number, styleObj: StyleObject): void;
    setDefaultStyle(styleObj: StyleObject): void;
    getDefaultStyle(): StyleObject;
    setCellStyle(r: number, c: number, styleObj: StyleObject): void;
    clearCellStyle(r: number, c: number): void;
    resolveStyle(r: number, c: number): StyleObject;
    batchStyleUpdate(fn: (sheet: ISheet) => void): void;

    setRangeStyle(range: { topRow: number; topCol: number; bottomRow: number; bottomCol: number }, styleObj: StyleObject): void;
    clearRangeStyle(range: { topRow: number; topCol: number; bottomRow: number; bottomCol: number }): void;
    clearRowStyle(row: number): void;
    clearColStyle(col: number): void;
    getCellStyle(r: number, c: number): StyleObject;

    addConditionalRule(options: Record<string, unknown>): void;
    hasConditionalRules(): boolean;
    hasDataBindings(): boolean;
    matchConditionalStyle(r: number, c: number, cell: unknown): number | null;
    bindDataStyle(col: number, mapperFn: (value: unknown) => StyleObject | null): void;
    getDataBindStyle(r: number, c: number): number | null;
    dataBindings: Map<number, (value: unknown) => number>;

    mergeCells(topRow: number, topCol: number, bottomRow: number, bottomCol: number): boolean;
    unmergeCells(row: number, col: number): boolean;
    getMerge(row: number, col: number): MergeRange | null;
    isMergeTopLeft(row: number, col: number): boolean;
    isMergedCell(row: number, col: number): boolean;

    beginBatch(): void;
    endBatch(): void;
    render(): void;
    undo(): void;
    redo(): void;
    insertRow(atRow: number): void;
    insertCol(atCol: number): void;
    deleteRow(atRow: number): void;
    deleteCol(atCol: number): void;
    moveCol(fromCol: number, toCol: number): void;
    moveRow(fromRow: number, toRow: number): void;
    setRowCount(rows: number): void;
    setColCount(cols: number): void;
    setGridSize(rows: number, cols: number): void;

    getColHeader(col: number): string;
    getRowHeader(row: number): string;
    getHeaderHeight(): number;
    getHeaderWidth(): number;
    getColumnConfig(col: number): ColumnConfig | null;
    getColumnType(col: number): string;
    formatCellValue(r: number, c: number, value: unknown): string;
    applyCellConfig(): void;
    getColumnTypeInstance(col: number): BaseColumnType;
    getCellTypeInstance(r: number, c: number): BaseColumnType;
    applyColumnsConfig(columnsConfig: Record<string, unknown>[]): void;
    validateCellValue(r: number, c: number, value: unknown): boolean | string;
    parseCellValue(r: number, c: number, input: string): unknown;
    resolveCellProperties(r: number, c: number): CellProperties | null;

    columnsConfig: Map<number, ColumnConfig & Record<string, unknown>>;
    cellTypes: Map<string, { name: string; options: Record<string, unknown> }>;
    colHeaders: unknown;
    rowHeaders: unknown;
    nestedHeaders: unknown;
    rowHeaderWidth: number;
    headerHeight: number;
    getColHeaderStyle(col: number): Record<string, unknown> | null;
    getRowHeaderStyle(row: number): Record<string, unknown> | null;
    getNestedHeaderRowCount(): number;
    getNestedColHeader(rowIndex: number, col: number): { label: string; colspan: number; style?: Record<string, unknown> } | null;

    rowStyles: Map<number, number>;
    colStyles: Map<number, number>;

    fixedRowsTop: number;
    fixedColumnsStart: number;
    frozenRowsHeight: number;
    frozenColsWidth: number;
    toRealCol(visibleCol: number): number;
    toVisibleCol(realCol: number): number;
}
