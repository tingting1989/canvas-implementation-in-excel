import { EventStrategy } from "./EventStrategy.js";
import { EVENT_NAMES } from "./eventNames.js";
import { CONFIG } from "../../core/constants.js";

/**
 * 右键菜单策略
 * 整合了右键菜单的 DOM 渲染和事件处理
 * 之前 ContextMenu.js 与 ContextMenuStrategy.js 强耦合，现已合并为单一类
 *
 * 职责：
 * 1. 监听 canvas 的 contextmenu 事件
 * 2. 创建和管理右键菜单 DOM
 * 3. 处理菜单项点击操作（插入/删除行列、合并/取消合并、清空内容）
 */
export class ContextMenuStrategy extends EventStrategy {
    /** contextmenu 事件处理器引用 */
    #contextmenuHandler = null;
    /** 右键菜单 DOM 元素 */
    #menuEl = null;
    /** 右键点击时的行号 */
    #row = -1;
    /** 右键点击时的列号 */
    #col = -1;

    constructor(handler) {
        super(handler);
    }

    init() {
        this.#createMenu();
        this.#bindContextMenu();
        this.#bindDismiss();
    }

    destroy() {
        this.handler.canvas.removeEventListener(EVENT_NAMES.CONTEXTMENU, this.#contextmenuHandler);
        this.#menuEl?.remove();
        this.#menuEl = null;
    }

    /**
     * 创建右键菜单 DOM
     * 包含：插入行/列、删除行/列、合并/取消合并、清空内容
     */
    #createMenu() {
        this.#menuEl = document.createElement("div");
        this.#menuEl.className = "ctx-menu";
        Object.assign(this.#menuEl.style, {
            position: "fixed",
            display: "none",
            zIndex: "10000",
            background: "#fff",
            border: "1px solid #d0d0d0",
            borderRadius: "6px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            padding: "4px 0",
            minWidth: "180px",
            fontFamily: "12px sans-serif",
            fontSize: "13px",
            userSelect: "none",
        });

        const items = [
            { label: "插入行（上方）", action: () => this.#insertRowAbove() },
            { label: "插入行（下方）", action: () => this.#insertRowBelow() },
            { label: "插入列（左侧）", action: () => this.#insertColLeft() },
            { label: "插入列（右侧）", action: () => this.#insertColRight() },
            { type: "separator" },
            { label: "删除行", action: () => this.#deleteRow() },
            { label: "删除列", action: () => this.#deleteCol() },
            { type: "separator" },
            { label: "合并单元格", action: () => this.#mergeCells() },
            { label: "取消合并", action: () => this.#unmergeCells() },
            { type: "separator" },
            { label: "清空内容", action: () => this.#clearContent() },
        ];

        for (const item of items) {
            if (item.type === "separator") {
                const sep = document.createElement("div");
                Object.assign(sep.style, {
                    height: "1px",
                    background: "#e0e0e0",
                    margin: "4px 8px",
                });
                this.#menuEl.appendChild(sep);
            } else {
                const el = document.createElement("div");
                el.textContent = item.label;
                Object.assign(el.style, {
                    padding: "6px 16px",
                    cursor: "pointer",
                    color: "#333",
                });
                el.addEventListener("mouseenter", () => el.style.background = "#f0f4ff");
                el.addEventListener("mouseleave", () => el.style.background = "transparent");
                el.addEventListener("click", () => {
                    item.action();
                    this.#hideMenu();
                });
                this.#menuEl.appendChild(el);
            }
        }

        document.body.appendChild(this.#menuEl);
    }

    /** 绑定 contextmenu 事件 */
    #bindContextMenu() {
        this.#contextmenuHandler = (e) => this.#handleContextMenu(e);
        this.handler.canvas.addEventListener(EVENT_NAMES.CONTEXTMENU, this.#contextmenuHandler);
    }

    /** 绑定点击菜单外部自动关闭 */
    #bindDismiss() {
        document.addEventListener("mousedown", (e) => {
            if (this.#menuEl && !this.#menuEl.contains(e.target)) {
                this.#hideMenu();
            }
        });
    }

    /**
     * 右键菜单事件处理
     * 1. 阻止浏览器默认右键菜单
     * 2. 如果右键的单元格不在当前选区内，先选中它
     * 3. 显示自定义右键菜单
     */
    #handleContextMenu(e) {
        if (!this.enabled || !this.handler.sheet) return;
        e.preventDefault();

        const hit = this.handler.renderEngine.hitTest(e.clientX, e.clientY);
        if (hit) {
            const merge = this.handler.sheet.getMerge(hit.row, hit.col);
            const row = merge ? merge.topRow : hit.row;
            const col = merge ? merge.topCol : hit.col;

            if (!this.handler.sheet.selection.contains(row, col)) {
                this.handler.sheet.selection.setActive(row, col);
                this.handler.render();
            }

            this.#showMenu(e.clientX, e.clientY, row, col);
        } else {
            const headerHit = this.handler.renderEngine.headerClickTest(e.clientX, e.clientY);
            if (headerHit) {
                const [ar, ac] = this.handler.sheet.selection.getActive();
                this.#showMenu(e.clientX, e.clientY, ar, ac);
            }
        }
    }

    /**
     * 显示右键菜单
     * 自动调整位置防止超出视口
     *
     * @param {number} clientX - 鼠标 X 坐标
     * @param {number} clientY - 鼠标 Y 坐标
     * @param {number} row - 右键点击的行号
     * @param {number} col - 右键点击的列号
     */
    #showMenu(clientX, clientY, row, col) {
        this.#row = row;
        this.#col = col;

        this.#menuEl.style.display = "block";
        const menuW = this.#menuEl.offsetWidth;
        const menuH = this.#menuEl.offsetHeight;
        const winW = window.innerWidth;
        const winH = window.innerHeight;

        let x = clientX;
        let y = clientY;
        if (x + menuW > winW) x = winW - menuW;
        if (y + menuH > winH) y = winH - menuH;

        this.#menuEl.style.left = x + "px";
        this.#menuEl.style.top = y + "px";
    }

    /** 隐藏右键菜单 */
    #hideMenu() {
        if (this.#menuEl) {
            this.#menuEl.style.display = "none";
        }
    }

    /** 在当前行上方插入一行 */
    #insertRowAbove() {
        this.handler.sheet.insertRow(this.#row);
        this.handler.render();
    }

    /** 在当前行下方插入一行 */
    #insertRowBelow() {
        this.handler.sheet.insertRow(this.#row + 1);
        this.handler.render();
    }

    /** 在当前列左侧插入一列 */
    #insertColLeft() {
        this.handler.sheet.insertCol(this.#col);
        this.handler.render();
    }

    /** 在当前列右侧插入一列 */
    #insertColRight() {
        this.handler.sheet.insertCol(this.#col + 1);
        this.handler.render();
    }

    /** 删除选区内的所有行（从下往上删，避免行号偏移） */
    #deleteRow() {
        const range = this.handler.sheet.selection.getRange();
        for (let i = range.bottomRow; i >= range.topRow; i--) {
            this.handler.sheet.deleteRow(i);
        }
        this.handler.render();
    }

    /** 删除选区内的所有列（从右往左删，避免列号偏移） */
    #deleteCol() {
        const range = this.handler.sheet.selection.getRange();
        for (let i = range.bottomCol; i >= range.topCol; i--) {
            this.handler.sheet.deleteCol(i);
        }
        this.handler.render();
    }

    /** 合并选区内的单元格 */
    #mergeCells() {
        const range = this.handler.sheet.selection.getRange();
        this.handler.sheet.mergeCells(range.topRow, range.topCol, range.bottomRow, range.bottomCol);
        this.handler.render();
    }

    /** 取消合并当前单元格 */
    #unmergeCells() {
        const [r, c] = this.handler.sheet.selection.getActive();
        this.handler.sheet.unmergeCells(r, c);
        this.handler.render();
    }

    /** 清空选区内所有单元格的内容 */
    #clearContent() {
        const range = this.handler.sheet.selection.getRange();
        for (let r = range.topRow; r <= range.bottomRow; r++) {
            for (let c = range.topCol; c <= range.bottomCol; c++) {
                if (!this.handler.sheet.isDisabled(r, c)) {
                    this.handler.sheet.setCell(r, c, "", 0);
                }
            }
        }
        this.handler.render();
    }
}