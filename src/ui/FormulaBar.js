import { EVENT_NAMES } from "../constants/eventNames.js";
import { DOMComponent } from "../core/DOMComponent.js";
import "./formulaBar.css";

/**
 * 公式栏
 *
 * 位于工具栏和画布之间，模拟 Excel 的 fx 输入栏。
 * 左侧显示当前活动单元格坐标（如 A1），右侧显示单元格内容：
 * - 公式单元格：显示原始公式字符串（如 =SUM(A1:A10)）
 * - 普通单元格：显示值
 *
 * 支持直接在公式栏中输入/编辑公式，回车确认后写入单元格。
 */
export class FormulaBar extends DOMComponent {
    /** @type {HTMLInputElement} */
    #input = null;

    /** @type {import("../workbook/Workbook.js").Workbook} */
    #workbook = null;

    /** 当前编辑中单元格的行号 */
    #activeRow = -1;

    /** 当前编辑中单元格的列号 */
    #activeCol = -1;

    /** 进入编辑前的原始值 */
    #originalValue = "";

    /**
     * @param {import("../workbook/Workbook.js").Workbook} workbook
     * @param {HTMLElement} container - 公式栏要插入到的容器元素
     */
    constructor(workbook, container) {
        super();
        this.#workbook = workbook;
        this.#createDOM(container);
        this.#bindEvents();
    }

    /**
     * 创建 DOM 结构
     *
     * 布局：[ 单元格坐标 ] [ 输入框 fx ]
     * 整体高度 28px，与 Excel 公式栏风格一致
     */
    #createDOM(container) {
        const bar = this.createElement("div", { className: "cs-formula-bar" });

        const cellRef = this.createElement(
            "div",
            {
                className: "cs-formula-cell-ref",
            },
            bar,
        );

        this.#input = this.createElement(
            "input",
            {
                className: "cs-formula-input",
                type: "text",
                placeholder: "输入值或公式...",
            },
            bar,
        );

        this._cellRef = cellRef;

        if (container) {
            container.insertBefore(bar, container.firstChild);
        }
    }

    /**
     * 绑定事件
     */
    #bindEvents() {
        this.trackEvent(this.#input, EVENT_NAMES.KEYDOWN, (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                this.#commit();
            } else if (e.key === "Escape") {
                e.preventDefault();
                this.#cancel();
            } else if (e.key === "Tab") {
                e.preventDefault();
                this.#commit();
                this.#moveToNextCell();
            }
        });

        this.trackEvent(this.#input, EVENT_NAMES.FOCUS, () => {
            this.#input.select();
        });
    }

    /**
     * 刷新公式栏显示
     * 根据当前活动 Sheet 的选区，读取单元格内容并更新显示
     */
    update() {
        const sheet = this.#workbook.activeSheet;
        if (!sheet) {
            this._cellRef.textContent = "";
            this.#input.value = "";
            return;
        }

        const [row, col] = sheet.selection.getFocus();
        this.#activeRow = row;
        this.#activeCol = col;

        const ref = this.#toColLabel(col) + (row + 1);
        this._cellRef.textContent = ref;

        const cell = sheet.cellStore.get(row, col);
        if (cell && cell.formula) {
            this.#input.value = cell.formula;
        } else if (cell) {
            this.#input.value = cell.value ?? "";
        } else {
            this.#input.value = "";
        }

        this.#originalValue = this.#input.value;
    }

    /**
     * 确认输入：将公式栏内容写入当前活动单元格
     */
    #commit() {
        const sheet = this.#workbook.activeSheet;
        if (!sheet || this.#activeRow < 0 || this.#activeCol < 0) return;

        const value = this.#input.value;
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

    /**
     * 取消输入：恢复原始值
     */
    #cancel() {
        this.#input.value = this.#originalValue;
        this.#input.blur();
        this.#workbook.renderEngine?.canvas?.focus();
    }

    /**
     * 确认后移动到下一个单元格（Tab）
     */
    #moveToNextCell() {
        const sheet = this.#workbook.activeSheet;
        if (!sheet) return;

        const nextCol = this.#activeCol + 1;
        const rc = sheet.rowColManager;
        const maxCol = rc.realColCount - 1;

        if (nextCol <= maxCol) {
            sheet.selection.setActive(this.#activeRow, nextCol);
        } else if (this.#activeRow + 1 < rc.rowCount) {
            sheet.selection.setActive(this.#activeRow + 1, 0);
        }

        this.#workbook.renderEngine?.render(sheet);
        this.update();
    }

    /**
     * 列号 → 列标签（0 → "A", 25 → "Z", 26 → "AA"）
     * @param {number} col - 列号（0-based）
     * @returns {string}
     */
    #toColLabel(col) {
        let label = "";
        let n = col;
        do {
            label = String.fromCharCode(65 + (n % 26)) + label;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        return label;
    }

    /** @override */
    onDestroy() {
        this.#workbook = null;
        this.#input = null;
        super.onDestroy();
    }
}
