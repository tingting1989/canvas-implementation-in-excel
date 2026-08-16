import { Disposable } from "../../core/Disposable.js";
import { FORMULA_BAR_EVENTS } from "./formulaBarEvents.js";
import { indexToCol } from "../../utils/cellRef.js";
import "./FormulaBarElement.js";
import type { FormulaBarElement } from "./FormulaBarElement.js";

interface WorkbookLike {
    activeSheet: any;
    renderEngine?: { render?(sheet: any): void; canvas?: HTMLCanvasElement };
}

export class FormulaBarManager extends Disposable {
    #element: FormulaBarElement | null = null;
    #workbook: WorkbookLike | null = null;
    #activeRow: number = -1;
    #activeCol: number = -1;
    #originalValue: string = "";

    constructor(workbook: WorkbookLike, container: HTMLElement) {
        super();
        if (!workbook) throw new TypeError("FormulaBarManager: workbook is required");
        this.#workbook = workbook;
        this.#createDOM(container);
        this.#bindEvents();
    }

    #createDOM(container: HTMLElement): void {
        this.#element = document.createElement("formula-bar");

        if (container instanceof HTMLElement) {
            container.insertBefore(this.#element, container.firstChild);
        }
    }

    #bindEvents(): void {
        this.trackEvent(this.#element!, FORMULA_BAR_EVENTS.COMMIT, (e: CustomEvent) => {
            this.#commitValue(e.detail.value);
        });

        this.trackEvent(this.#element!, FORMULA_BAR_EVENTS.CANCEL, () => {
            this.#cancelEdit();
        });

        this.trackEvent(this.#element!, FORMULA_BAR_EVENTS.COMMIT_AND_MOVE, (e: CustomEvent) => {
            this.#commitValue(e.detail.value);
            this.#moveToCell(e.detail.direction);
        });

        this.trackEvent(this.#element!, FORMULA_BAR_EVENTS.START_EDIT, () => {
            this.#originalValue = this.#element!.getValue();
        });
    }

    update(): void {
        if (this.isDisposed || !this.#element) return;

        const sheet = this.#workbook!.activeSheet;
        if (!sheet) {
            this.#element.setAttribute("cell-ref", "");
            this.#element.setValue("");
            return;
        }

        const range = sheet.selection.getRange();

        const row = range.topRow;
        const col = range.topCol;
        this.#activeRow = row;
        this.#activeCol = col;

        const ref = indexToCol(col) + (row + 1);

        this.#element.setAttribute("cell-ref", ref);

        const accessor = sheet.cellDataAccessor;
        const cell = accessor.get(this.#activeRow, col);
        let value = "";
        if (cell && cell.formula) {
            value = cell.formula;
        } else if (cell) {
            value = cell.value ?? "";
        }

        this.#element.setValue(value);
        this.#originalValue = value;
    }

    #commitValue(value: string): void {
        const sheet = this.#workbook!.activeSheet;
        if (!sheet || this.#activeRow < 0 || this.#activeCol < 0) return;

        if (value === this.#originalValue) return;

        const accessor = sheet.cellDataAccessor;

        if (value === "") {
            sheet.setCell(this.#activeRow, this.#activeCol, "");
        } else {
            const styleId = accessor.get(this.#activeRow, this.#activeCol)?.styleId || 0;
            sheet.setCell(this.#activeRow, this.#activeCol, value, styleId);
        }

        this.#workbook!.renderEngine?.render?.(sheet);
        this.#originalValue = value;
    }

    #cancelEdit(): void {
        this.#element!.setValue(this.#originalValue);
        this.#element!.cancelEdit();
        this.#workbook!.renderEngine?.canvas?.focus();
    }

    #moveToCell(direction: string): void {
        const sheet = this.#workbook!.activeSheet;
        if (!sheet) return;

        let nextRow = this.#activeRow;
        let nextCol = this.#activeCol;

        if (direction === "next") {
            nextCol++;
        } else if (direction === "prev") {
            nextCol--;
        }

        const rc = sheet.rowColManager;
        const maxCol = rc.realColCount - 1;
        const maxRow = rc.rowCount - 1;

        if (nextCol > maxCol) {
            nextCol = 0;
            nextRow++;
        } else if (nextCol < 0) {
            nextCol = maxCol;
            nextRow--;
        }

        if (nextRow >= 0 && nextRow <= maxRow && nextCol >= 0 && nextCol <= maxCol) {
            sheet.selection.setActive(nextRow, nextCol);
            this.#workbook!.renderEngine?.render?.(sheet);
            this.update();
        }
    }

    startEdit(): void {
        if (this.isDisposed || !this.#element) return;
        this.#element.focus();
    }

    onDestroy(): void {
        if (this.#element) {
            this.#element.destroy();
            this.#element = null;
        }

        this.#workbook = null;
    }
}
