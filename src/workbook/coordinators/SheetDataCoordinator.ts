import { CellDataAccessor } from "../../model/grid/CellDataAccessor";
import { SHEET_EVENTS } from "../../constants/sheetEvents";
import { Cell } from "../../model/store/Cell";
import { SetCellCommand } from "../../model/command/SetCellCommand";
import { ToggleDisableCommand } from "../../model/command/ToggleDisableCommand";
import type { ISheet } from "../interfaces/ISheet";
import type { ChunkedCellStore } from "../../model/store/ChunkedCellStore";

/**
 * 工作表数据协调者
 *
 * 负责：
 * - 单元格值的增删改查（带事件、命令历史、公式支持）
 * - 批量数据加载
 * - 提供统一的数据访问接口（CellDataAccessor）
 *
 * 设计原则：
 * - 所有写入操作都经过此协调者，确保一致性
 * - 读取操作可通过 dataAccessor 进行批量优化
 */
export class SheetDataCoordinator {
    #sheet: ISheet;
    #accessor: CellDataAccessor | null = null;

    constructor(sheet: ISheet) {
        this.#sheet = sheet;
    }

    get cellStore(): ChunkedCellStore {
        return this.#sheet.cellStore;
    }

    get dataAccessor(): CellDataAccessor {
        if (!this.#accessor) {
            this.#accessor = new CellDataAccessor(this.#sheet);
        }
        return this.#accessor;
    }

    setCell(r: number, c: number, value: unknown, styleId: number = 0, disabled: boolean = false): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#sheet.rowColManager.ensureSize(r + 1, c + 1);

        let formula: string | null = null;
        let cellValue = value;

        const old = this.cellStore.get(r, c);

        if (typeof value === "string" && value.startsWith("=")) {
            formula = value;

            const results = this.#sheet.bus.emit(SHEET_EVENTS.FORMULA_SET, { r, c, formula: value });

            cellValue = results !== undefined ? results : value;
        } else if (old?.formula) {
            this.#sheet.bus.emit(SHEET_EVENTS.FORMULA_REMOVE, { r, c });
        }

        const cell = new Cell(cellValue, styleId, disabled, formula);
        const cmd = new SetCellCommand(this.cellStore, r, c, old, cell);
        this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history);
        this.cellStore.set(r, c, cell);
        this.#sheet._invalidateCell(r, c);

        if (!formula) {
            this.#sheet.bus.emit(SHEET_EVENTS.CELL_CHANGED, { r, c });
        }
    }

    disableCell(r: number, c: number): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#sheet.rowColManager.ensureSize(r + 1, c + 1);

        let cell = this.cellStore.get(r, c);
        const oldState = cell?.disabled || false;

        if (!cell) {
            cell = new Cell("", 0, true);
        } else {
            cell.disabled = true;
        }

        const cmd = new ToggleDisableCommand(this.cellStore, r, c, oldState);
        this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history);
        this.cellStore.set(r, c, cell);
        this.#sheet._invalidateCell(r, c);
    }

    enableCell(r: number, c: number): void {
        if (!this.#sheet._ensureWritable()) return;
        const cell = this.cellStore.get(r, c);
        if (!cell) return;

        const oldState = cell.disabled;
        cell.disabled = false;

        const cmd = new ToggleDisableCommand(this.cellStore, r, c, oldState);
        this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history);
        this.#sheet._invalidateCell(r, c);
    }

    isDisabled(r: number, c: number): boolean {
        const colConfig = this.#sheet.meta.columnsConfig.get(c);
        if (colConfig?.disabled === true || colConfig?.readOnly === true) return true;

        const cellProps = this.#sheet.meta.resolveCellProperties(r, c);
        if (cellProps?.disabled === true || cellProps?.readOnly === true) return true;

        return this.cellStore.get(r, c)?.disabled === true;
    }

    loadData(data: unknown[][]): void {
        if (!this.#sheet._ensureWritable()) return;
        if (!Array.isArray(data)) return;

        const rows = data.length;
        if (rows === 0) return;

        let maxCols = 0;
        for (let r = 0; r < rows; r++) {
            const row = data[r];
            if (Array.isArray(row) && row.length > maxCols) maxCols = row.length;
        }
        if (maxCols === 0) return;

        this.#sheet.rowColManager.ensureSize(rows, maxCols);

        for (let r = 0; r < rows; r++) {
            const row = data[r];
            if (!Array.isArray(row)) continue;

            for (let c = 0; c < maxCols; c++) {
                const val = c < row.length ? row[c] : "";

                if (typeof val === "string" && val.startsWith("=")) {
                    const results = this.#sheet.bus.emit(SHEET_EVENTS.FORMULA_SET, { r, c, formula: val });
                    const result = results !== undefined ? results : val;
                    this.cellStore.set(r, c, new Cell(result, 0, false, val));
                } else {
                    this.cellStore.set(r, c, new Cell(val, 0));
                }
            }
        }

        this.#sheet._invalidateAll();
    }
}
