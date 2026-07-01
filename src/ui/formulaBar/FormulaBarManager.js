import { DOMComponent } from "../../core/DOMComponent.js";
import "./FormulaBarElement.js";

/**
 * FormulaBarManager — 公式栏管理器
 *
 * 职责：桥接 FormulaBarElement（Web Component）与 Workbook
 * - 监听 FormulaBarElement 的自定义事件（commit / cancel / commit-and-move / start-edit）
 * - 将用户输入写入当前活动单元格
 * - 根据选区变化刷新公式栏显示
 *
 * ✅ 使用 Web Components（FormulaBarElement）
 * ✅ 显式销毁元素
 */
export class FormulaBarManager extends DOMComponent {
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
        this.#workbook = workbook;
        this.#createDOM(container);
        this.#bindEvents();
    }

    #createDOM(container) {
        this.#element = document.createElement("formula-bar");

        if (container) {
            container.insertBefore(this.#element, container.firstChild);
        }
    }

    #bindEvents() {
        this.trackEvent(this.#element, "commit", (e) => {
            this.#commitValue(e.detail.value);
        });

        this.trackEvent(this.#element, "cancel", () => {
            this.#cancelEdit();
        });

        this.trackEvent(this.#element, "commit-and-move", (e) => {
            this.#commitValue(e.detail.value);
            this.#moveToCell(e.detail.direction);
        });

        this.trackEvent(this.#element, "start-edit", () => {
            this.#originalValue = this.#element.getValue();
        });
    }

    update() {
        const sheet = this.#workbook.activeSheet;
        if (!sheet) {
            this.#element.setAttribute("cell-ref", "");
            this.#element.setValue("");
            return;
        }

        const [row, col] = sheet.selection.getFocus();
        this.#activeRow = row;
        this.#activeCol = col;

        const ref = this.#toColLabel(col) + (row + 1);

        this.#element.setAttribute("cell-ref", ref);

        const cell = sheet.cellStore.get(row, col);
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

        if (value === "") {
            sheet.setCell(this.#activeRow, this.#activeCol, "");
        } else {
            const styleId = sheet.cellStore.get(this.#activeRow, this.#activeCol)?.styleId || 0;
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

    #toColLabel(col) {
        let label = "";
        let n = col;
        do {
            label = String.fromCharCode(65 + (n % 26)) + label;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        return label;
    }

    startEdit() {
        this.#element.focus();
    }

    /** @override */
    onDestroy() {
        if (this.#element) {
            this.#element.destroy();
            this.#element = null;
        }

        this.#workbook = null;
        super.onDestroy();
    }
}
