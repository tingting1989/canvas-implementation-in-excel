import { CONFIG } from "../../core/constants.js";
import { EventStrategy } from "./EventStrategy.js";
import { EVENT_NAMES } from "./eventNames.js";
import { HOOKS } from "../hookNames.js";

/**
 * 鼠标交互策略
 * 处理以下鼠标操作：
 * - 单击选中单元格
 * - 拖拽范围选区（按住左键拖动）
 * - Shift+单击扩展选区
 * - 单击行头选整行
 * - 单击列头选整列
 * - 单击左上角全选
 * - 双击进入编辑模式
 */
export class MouseStrategy extends EventStrategy {
    /** mousedown 事件处理器引用 */
    #mousedownHandler = null;
    /** mousemove 事件处理器引用（绑在 document 上，拖拽时鼠标可能移出 canvas） */
    #mousemoveHandler = null;
    /** mouseup 事件处理器引用 */
    #mouseupHandler = null;
    /** dblclick 事件处理器引用 */
    #doubleClickHandler = null;
    /** 是否正在拖拽选区 */
    #dragging = false;
    /** 拖拽起始锚点行号 */
    #dragAnchorRow = -1;
    /** 拖拽起始锚点列号 */
    #dragAnchorCol = -1;

    constructor(handler) {
        super(handler);
    }

    init() {
        this.#bindMouse();
        this.#bindDoubleClick();
    }

    destroy() {
        this.handler.canvas.removeEventListener(EVENT_NAMES.MOUSEDOWN, this.#mousedownHandler);
        this.handler.canvas.removeEventListener(EVENT_NAMES.DBLCLICK, this.#doubleClickHandler);
        document.removeEventListener(EVENT_NAMES.MOUSEMOVE, this.#mousemoveHandler);
        document.removeEventListener(EVENT_NAMES.MOUSEUP, this.#mouseupHandler);
    }

    /** 绑定鼠标按下/移动/松开事件 */
    #bindMouse() {
        this.#mousedownHandler = (e) => this.#handleMouseDown(e);
        this.#mousemoveHandler = (e) => this.#handleMouseMove(e);
        this.#mouseupHandler = (e) => this.#handleMouseUp(e);
        this.handler.canvas.addEventListener(EVENT_NAMES.MOUSEDOWN, this.#mousedownHandler);
        document.addEventListener(EVENT_NAMES.MOUSEMOVE, this.#mousemoveHandler);
        document.addEventListener(EVENT_NAMES.MOUSEUP, this.#mouseupHandler);
    }

    /** 绑定双击事件 */
    #bindDoubleClick() {
        this.#doubleClickHandler = (e) => this.#handleDoubleClick(e);
        this.handler.canvas.addEventListener(EVENT_NAMES.DBLCLICK, this.#doubleClickHandler);
    }

    /**
     * 鼠标按下处理
     * 1. 检查是否点击了行头/列头/左上角 → 行列头选择
     * 2. 检查是否点击了数据区域 → 单元格选中或范围选区
     * 3. Shift+单击 → 扩展选区
     */
    #handleMouseDown(e) {
        if (!this.enabled || !this.handler.sheet) return;
        if (e.button !== 0) return;

        /* 优先检测行头/列头点击 */
        const headerHit = this.handler.renderEngine.headerClickTest(e.clientX, e.clientY);
        if (headerHit) {
            this.#handleHeaderClick(headerHit);
            return;
        }

        /* 数据区域命中测试 */
        const hit = this.handler.renderEngine.hitTest(e.clientX, e.clientY);
        if (!hit) return;

        const { row, col } = this.#getTopLeft(hit.row, hit.col);

        this.handler.runHooks(HOOKS.ON_CELL_CLICK, row, col, e);

        if (e.shiftKey) {
            /* Shift+单击：从当前锚点扩展到点击位置 */
            const [anchorRow, anchorCol] = this.handler.sheet.selection.getAnchor();
            this.handler.sheet.selection.setRange(anchorRow, anchorCol, row, col);
        } else {
            /* 普通单击：设置新的活动单元格，进入拖拽准备状态 */
            this.handler.sheet.selection.setActive(row, col);
            this.#dragAnchorRow = row;
            this.#dragAnchorCol = col;
            this.#dragging = true;
        }

        this.handler.render();
    }

    /**
     * 鼠标移动处理
     * 拖拽状态下实时更新选区范围
     */
    #handleMouseMove(e) {
        if (!this.#dragging || !this.handler.sheet) return;

        const hit = this.handler.renderEngine.hitTest(e.clientX, e.clientY);
        if (!hit) return;

        const { row, col } = this.#getTopLeft(hit.row, hit.col);

        /* 仅在焦点位置变化时更新，避免不必要的渲染 */
        if (row !== this.handler.sheet.selection.getFocus()[0] ||
            col !== this.handler.sheet.selection.getFocus()[1]) {
            this.handler.sheet.selection.setRange(this.#dragAnchorRow, this.#dragAnchorCol, row, col);
            this.handler.render();
        }
    }

    /**
     * 鼠标松开处理
     * 结束拖拽状态
     */
    #handleMouseUp(e) {
        this.#dragging = false;
    }

    /**
     * 行头/列头/左上角点击处理
     * - corner：全选
     * - col-header：选中整列
     * - row-header：选中整行
     */
    #handleHeaderClick(headerHit) {
        const sheet = this.handler.sheet;
        const rc = sheet.rowColManager;

        if (headerHit.type === "corner") {
            sheet.selection.selectAll(rc.rowCount - 1, rc.colCount - 1);
        } else if (headerHit.type === "col-header") {
            sheet.selection.selectCol(headerHit.index, rc.rowCount - 1);
        } else if (headerHit.type === "row-header") {
            sheet.selection.selectRow(headerHit.index, rc.colCount - 1);
        }

        this.handler.render();
    }

    /**
     * 双击处理
     * 双击单元格进入编辑模式
     */
    #handleDoubleClick(e) {
        if (!this.enabled || !this.handler.sheet) return;

        const hit = this.handler.renderEngine.hitTest(e.clientX, e.clientY);
        if (!hit) return;

        const { row, col } = this.#getTopLeft(hit.row, hit.col);

        this.handler.runHooks(HOOKS.ON_CELL_DBL_CLICK, row, col, e);

        this.handler.sheet.selection.setActive(row, col);
        this.handler.editor.show(row, col);
    }

    /**
     * 获取合并单元格的左上角位置
     * 如果点击的单元格属于某个合并区域，返回合并区域的左上角
     *
     * @param {number} row - 原始行号
     * @param {number} col - 原始列号
     * @returns {{ row: number, col: number }}
     */
    #getTopLeft(row, col) {
        const merge = this.handler.sheet?.getMerge(row, col);
        if (merge) {
            return { row: merge.topRow, col: merge.topCol };
        }
        return { row, col };
    }
}