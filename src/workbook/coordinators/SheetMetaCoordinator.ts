import { stylePool } from "../../model/styles";
import { Cell } from "../../model/store/Cell";
import { errorHandler } from "../../core/ErrorHandler";
import { extractColumnTypeOptions } from "../../types/index";
import type { ISheet } from "../interfaces/ISheet";
import { ERROR_CODE } from "../../constants/errorCodes";
import type { StyleObject, CellProperties } from "../interfaces/ISheet";

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
    #sheet: ISheet;

    constructor(sheet: ISheet) {
        this.#sheet = sheet;
    }

    get #headerLabels() {
        return this.#sheet.headerLabels;
    }

    get #typeManager() {
        return this.#sheet.typeManager;
    }

    get colHeaders() {
        return this.#headerLabels.colHeaders;
    }

    set colHeaders(v: unknown) {
        this.#headerLabels.colHeaders = v as boolean | string[] | ((index: number) => string) | Record<string, unknown>[] | null;
    }

    getColHeader(col: number): string {
        return this.#headerLabels.getColHeader(col);
    }

    getColHeaderStyle(col: number): Record<string, unknown> | null {
        return this.#headerLabels.getColHeaderStyle(col);
    }

    get rowHeaders() {
        return this.#headerLabels.rowHeaders;
    }

    set rowHeaders(v: unknown) {
        this.#headerLabels.rowHeaders = v as boolean | string[] | ((index: number) => string) | Record<string, unknown>[] | null;
    }

    getRowHeader(row: number): string {
        return this.#headerLabels.getRowHeader(row);
    }

    getRowHeaderStyle(row: number): Record<string, unknown> | null {
        return this.#headerLabels.getRowHeaderStyle(row);
    }

    get nestedHeaders() {
        return this.#headerLabels.nestedHeaders;
    }

    set nestedHeaders(v: unknown) {
        this.#headerLabels.nestedHeaders = v as (string | { label?: string; colspan?: number; style?: Record<string, unknown> })[][] | null;
    }

    getNestedHeaderRowCount(): number {
        return this.#headerLabels.getNestedHeaderRowCount();
    }

    getNestedColHeader(rowIndex: number, col: number): { label: string; colspan: number; style?: Record<string, unknown> } | null {
        return this.#headerLabels.getNestedColHeader(rowIndex, col);
    }

    get rowHeaderWidth() {
        return this.#headerLabels.rowHeaderWidth;
    }

    set rowHeaderWidth(v: number) {
        this.#headerLabels.rowHeaderWidth = v;
    }

    getHeaderHeight(): number {
        return this.#headerLabels.getHeaderHeight();
    }

    get headerHeight() {
        return this.#headerLabels.headerHeight;
    }

    set headerHeight(v: number) {
        this.#headerLabels.headerHeight = v;
    }

    getHeaderWidth(): number {
        return this.#headerLabels.getHeaderWidth();
    }

    get columnsConfig() {
        return this.#typeManager.columnsConfig;
    }

    get cellTypes() {
        return this.#typeManager.cellTypes;
    }

    getColumnConfig(col: number) {
        return this.#typeManager.getColumnConfig(col);
    }

    getColumnType(col: number): string {
        return this.#typeManager.getColumnType(col);
    }

    _checkColumnTypeConsistency(topCol: number, bottomCol: number): boolean {
        return this.#typeManager.checkColumnTypeConsistency(topCol, bottomCol);
    }

    getColumnTypeInstance(col: number) {
        return this.#typeManager.getColumnTypeInstance(col);
    }

    getCellTypeInstance(r: number, c: number) {
        return this.#typeManager.getCellTypeInstance(r, c);
    }

    applyColumnsConfig(columnsConfig: Record<string, unknown>[]): void {
        this.#typeManager.applyColumnsConfig(columnsConfig);
        this.#sheet.invalidateAll();
    }

    formatCellValue(r: number, c: number, value: unknown): string {
        return this.#typeManager.formatCellValue(r, c, value);
    }

    validateCellValue(r: number, c: number, value: unknown): boolean | string {
        return this.#typeManager.validateCellValue(r, c, value);
    }

    parseCellValue(r: number, c: number, input: string): unknown {
        return this.#typeManager.parseCellValue(r, c, input);
    }

    applyCellConfig(): void {
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

        this.#sheet.invalidateAll();
    }

    resolveCellProperties(r: number, c: number): CellProperties | null {
        if (typeof this.#sheet.cellsFn !== "function") return null;

        try {
            return this.#sheet.cellsFn(r, c);
        } catch (error) {
            errorHandler.error(ERROR_CODE.CELL_INVALID_DATA, `cellsFn execution failed at (${r},${c})`, { originalError: error });
            return null;
        }
    }
}
