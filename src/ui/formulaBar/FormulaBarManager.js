import { Disposable } from "../../core/Disposable.js";
import { FORMULA_BAR_EVENTS } from "./formulaBarEvents.js";
import { indexToCol } from "../../utils/cellRef.js";
import "./FormulaBarElement.js";

/**
 * FormulaBarManager — 公式栏管理器
 *
 * 职责：桥接 FormulaBarElement（Web Component）与 Workbook
 * - 监听 FormulaBarElement 的自定义事件（commit / cancel / commit-and-move / start-edit）
 * - 将用户输入写入当前活动单元格
 * - 根据选区变化刷新公式栏显示
 *
 * 继承 Disposable（而非 DOMComponent）：
 * - 只需要 trackEvent() 自动解绑事件，不需要 createElement() / injectStyle()
 * - DOM 元素由 FormulaBarElement（Web Component）自行管理
 */
export class FormulaBarManager extends Disposable {
    /** @type {FormulaBarElement} */
    #element = null;

    /** @type {import("../../workbook/Workbook.js").Workbook} */
    #workbook = null;

    /** 当前编辑中单元格的行号 */
    #activeRow = -1;

    /** 当前编辑中单元格的列号 */
    #activeCol = -1;

    /** 进入编辑前的原始值 */
    #originalValue = "";

    /**
     * @param {import("../../workbook/Workbook.js").Workbook} workbook
     * @param {HTMLElement} container - 公式栏要插入到的容器元素
     */
    constructor(workbook, container) {
        super();
        if (!workbook) throw new TypeError("FormulaBarManager: workbook is required");
        this.#workbook = workbook;
        this.#createDOM(container);
        this.#bindEvents();
    }

    #createDOM(container) {
        this.#element = document.createElement("formula-bar");

        if (container instanceof HTMLElement) {
            container.insertBefore(this.#element, container.firstChild);
        }
    }

    #bindEvents() {
        this.trackEvent(this.#element, FORMULA_BAR_EVENTS.COMMIT, (e) => {
            this.#commitValue(e.detail.value);
        });

        this.trackEvent(this.#element, FORMULA_BAR_EVENTS.CANCEL, () => {
            this.#cancelEdit();
        });

        this.trackEvent(this.#element, FORMULA_BAR_EVENTS.COMMIT_AND_MOVE, (e) => {
            this.#commitValue(e.detail.value);
            this.#moveToCell(e.detail.direction);
        });

        this.trackEvent(this.#element, FORMULA_BAR_EVENTS.START_EDIT, () => {
            this.#originalValue = this.#element.getValue();
        });
    }

    update() {
        if (this.isDisposed || !this.#element) return;

        const sheet = this.#workbook.activeSheet;
        if (!sheet) {
            this.#element.setAttribute("cell-ref", "");
            this.#element.setValue("");
            return;
        }

        const range = sheet.selection.getRange();

        // 选区返回页面相对行号；cellStore 索引需要实际行号
        const row = range.topRow;
        const col = range.topCol;
        const realRow = sheet.toRealRow(row);
        this.#activeRow = row;
        this.#activeCol = col;

        const ref = indexToCol(col) + (realRow + 1);

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

    #commitValue(value) {
        const sheet = this.#workbook.activeSheet;
        if (!sheet || this.#activeRow < 0 || this.#activeCol < 0) return;

        if (value === this.#originalValue) return;

        const accessor = sheet.cellDataAccessor;

        if (value === "") {
            sheet.setCell(this.#activeRow, this.#activeCol, "");
        } else {
            const styleId = accessor.get(this.#activeRow, this.#activeCol)?.styleId || 0;
            sheet.setCell(this.#activeRow, this.#activeCol, value, styleId);
        }

        this.#workbook.renderEngine?.render(sheet);
        this.#originalValue = value;
    }

    #cancelEdit() {
        this.#element.setValue(this.#originalValue);
        this.#element.cancelEdit();
        this.#workbook.renderEngine?.canvas?.focus();
    }

    #moveToCell(direction) {
        const sheet = this.#workbook.activeSheet;
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
            this.#workbook.renderEngine?.render(sheet);
            this.update();
        }
    }

    startEdit() {
        if (this.isDisposed || !this.#element) return;
        this.#element.focus();
    }

    /** @override */
    onDestroy() {
        if (this.#element) {
            this.#element.destroy();
            this.#element = null;
        }

        this.#workbook = null;
    }
}
