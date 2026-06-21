import { CONFIG } from "../constants/config";

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
export class FormulaBar {
    /** @type {HTMLElement} */
    #bar = null;
    /** @type {HTMLElement} */
    #cellRef = null;
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
     */
    constructor(workbook) {
        this.#workbook = workbook;
        this.#createDOM();
        this.#bindEvents();
    }

    /**
     * 创建 DOM 结构
     *
     * 布局：[ 单元格坐标 ] [ 输入框 fx ]
     * 整体高度 28px，与 Excel 公式栏风格一致
     */
    #createDOM() {
        this.#bar = document.createElement("div");
        this.#bar.className = "cs-formula-bar";
        Object.assign(this.#bar.style, {
            display: "flex",
            alignItems: "center",
            height: "28px",
            borderBottom: "1px solid #ccc",
            background: "#fff",
            flexShrink: "0",
        });

        this.#cellRef = document.createElement("div");
        this.#cellRef.className = "cs-formula-cell-ref";
        Object.assign(this.#cellRef.style, {
            width: "72px",
            minWidth: "72px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRight: "1px solid #ccc",
            fontSize: "12px",
            fontFamily: "Consolas, monospace",
            color: "#333",
            background: "#fafafa",
            userSelect: "none",
        });

        this.#input = document.createElement("input");
        this.#input.className = "cs-formula-input";
        this.#input.type = "text";
        this.#input.placeholder = "输入值或公式...";
        Object.assign(this.#input.style, {
            flex: "1",
            height: "100%",
            border: "none",
            outline: "none",
            padding: "0 8px",
            fontSize: "13px",
            fontFamily: "Consolas, monospace",
            color: "#333",
            background: "transparent",
        });

        this.#bar.appendChild(this.#cellRef);
        this.#bar.appendChild(this.#input);

        const wrap = document.getElementById(CONFIG.CANVAS_ID)?.parentElement;
        if (wrap) {
            wrap.parentElement.insertBefore(this.#bar, wrap);
        }
    }

    /**
     * 绑定事件
     */
    #bindEvents() {
        this.#input.addEventListener("keydown", (e) => {
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

        this.#input.addEventListener("focus", () => {
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
            this.#cellRef.textContent = "";
            this.#input.value = "";
            return;
        }

        const [row, col] = sheet.selection.getFocus();
        this.#activeRow = row;
        this.#activeCol = col;

        const ref = this.#toColLabel(col) + (row + 1);
        this.#cellRef.textContent = ref;

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

    /**
     * 销毁公式栏，移除 DOM 元素
     */
    destroy() {
        this.#bar?.remove();
        this.#bar = null;
        this.#input = null;
        this.#cellRef = null;
    }
}
