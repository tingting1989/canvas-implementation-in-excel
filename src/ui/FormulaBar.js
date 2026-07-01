import { EVENT_NAMES } from "../constants/eventNames.js";
import { DOMComponent } from "../core/DOMComponent.js";
import "./FormulaBarElement.js";  // ✅ 导入 Web Component
import "./formulaBar.css";

/**
 * FormulaBar — 公式栏（重构版）
 * 
 * ✅ 使用 Web Components（FormulaBarElement）
 * ✅ 不向后兼容，彻底重构
 * ✅ 显式销毁元素
 */
export class FormulaBar extends DOMComponent {
    /** @type {FormulaBarElement} */
    #element = null;  // ✅ 持有 Web Component 实例

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
     * ✅ 使用 Web Component（FormulaBarElement）
     */
    #createDOM(container) {
        // ✅ 使用 Web Component
        this.#element = document.createElement('formula-bar');
        
        if (container) {
            container.insertBefore(this.#element, container.firstChild);
        }
        
        // ✅ Web Component 的销毁由 destroy() 方法控制
        // 不需要通过 DOMComponent 的 trackElement 来跟踪
    }

    /**
     * 绑定事件
     * 
     * ✅ 监听 Web Component 事件
     */
    #bindEvents() {
        this.trackEvent(this.#element, 'commit', (e) => {
            this.#commitValue(e.detail.value);
        });
        
        this.trackEvent(this.#element, 'cancel', () => {
            this.#cancelEdit();
        });
        
        this.trackEvent(this.#element, 'commit-and-move', (e) => {
            this.#commitValue(e.detail.value);
            this.#moveToCell(e.detail.direction);
        });
        
        this.trackEvent(this.#element, 'start-edit', () => {
            this.#originalValue = this.#element.getValue();
        });
    }

    /**
     * 刷新公式栏显示
     * 根据当前活动 Sheet 的选区，读取单元格内容并更新显示
     */
    update() {
        const sheet = this.#workbook.activeSheet;
        if (!sheet) {
            this.#element.setAttribute('cell-ref', '');
            this.#element.setValue('');
            return;
        }

        const [row, col] = sheet.selection.getFocus();
        this.#activeRow = row;
        this.#activeCol = col;

        const ref = this.#toColLabel(col) + (row + 1);
        
        // ✅ 使用 Web Component 属性
        this.#element.setAttribute('cell-ref', ref);

        const cell = sheet.cellStore.get(row, col);
        let value = '';
        if (cell && cell.formula) {
            value = cell.formula;
        } else if (cell) {
            value = cell.value ?? '';
        }
        
        // ✅ 使用 Web Component 方法
        this.#element.setValue(value);
        this.#originalValue = value;
    }

    /**
     * 确认输入：将公式栏内容写入当前活动单元格
     */
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

    /**
     * 取消输入：恢复原始值
     */
    #cancelEdit() {
        // ✅ 使用 Web Component 方法
        this.#element.setValue(this.#originalValue);
        this.#element.cancelEdit();
        this.#workbook.renderEngine?.canvas?.focus();
    }

    /**
     * 确认后移动到下一个单元格（Tab）
     */
    #moveToCell(direction) {
        const sheet = this.#workbook.activeSheet;
        if (!sheet) return;

        let nextRow = this.#activeRow;
        let nextCol = this.#activeCol;

        if (direction === 'next') {
            nextCol++;
        } else if (direction === 'prev') {
            nextCol--;
        }

        const rc = sheet.rowColManager;
        const maxCol = rc.realColCount - 1;
        const maxRow = rc.rowCount - 1;

        // 边界处理
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
     * 开始编辑（外部调用）
     */
    startEdit() {
        this.#element.focus();
    }

    /** @override */
    onDestroy() {
        // ✅ 显式销毁 Web Component
        if (this.#element) {
            this.#element.destroy();
            this.#element = null;
        }
        
        this.#workbook = null;
        super.onDestroy();
    }
}