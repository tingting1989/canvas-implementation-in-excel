import { EventStrategy } from "./EventStrategy.js";
import { HOOKS } from "../../constants/hookNames.js";
import { HIT_TYPE } from "../../constants/hitType";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { debounce } from "lodash-es";

/**
 * 鼠标交互策略
 * 优先级 50（默认），在 Resize（100）和 AutoFill（90）之后处理
 *
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
    priority = 50;

    /** 是否正在拖拽选区 */
    #dragging = false;
    /** 拖拽起始锚点行号 */
    #dragAnchorRow = -1;
    /** 拖拽起始锚点列号 */
    #dragAnchorCol = -1;

    /**
     * 防抖后的 ON_CELL_CLICK 触发器
     * 双击时浏览器会依次触发：mousedown → mouseup → mousedown → mouseup → dblclick
     * 使用 debounce 延迟触发 ON_CELL_CLICK，dblclick 到来时调用 cancel() 取消待执行的单击通知
     */
    #debouncedCellClick = debounce((row, col, e) => {
        this.handler.runHooks(HOOKS.ON_CELL_CLICK, row, col, e);
    }, 200);

    constructor(handler) {
        super(handler);
    }

    init() {}

    destroy() {
        this.#debouncedCellClick.cancel();
    }

    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => this.#handleMouseDown(e),
            [DELEGATE_KEYS.CANVAS_DBLCLICK]: (e) => this.#handleDoubleClick(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e) => this.#handleMouseMove(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: (e) => this.#handleMouseUp(e),
        };
    }

    #handleMouseDown(e) {
        if (!this.enabled || !this.handler.sheet) return;
        if (e.button !== 0) return;

        const hit = this.handler.renderEngine.hitTest(e.clientX, e.clientY);
        if (!hit) return;

        if (hit.type === HIT_TYPE.CORNER || hit.type === HIT_TYPE.COL_HEADER || hit.type === HIT_TYPE.ROW_HEADER) {
            this.#handleHeaderClick(hit);
            return;
        }

        const { row, col } = this.#getTopLeft(hit.row, hit.col);

        this.#debouncedCellClick(row, col, e);

        if (e.shiftKey) {
            const [anchorRow, anchorCol] = this.handler.sheet.selection.getAnchor();
            this.handler.sheet.selection.setRange(anchorRow, anchorCol, row, col);
        } else {
            const merge = this.handler.sheet.getMerge(row, col);
            if (merge) {
                this.handler.sheet.selection.setRange(merge.topRow, merge.topCol, merge.bottomRow, merge.bottomCol);
            } else {
                this.handler.sheet.selection.setActive(row, col);
            }
            this.#dragAnchorRow = row;
            this.#dragAnchorCol = col;
            this.#dragging = true;
        }

        this.handler.render();
    }

    #handleMouseMove(e) {
        if (!this.#dragging || !this.handler.sheet) return;

        const hit = this.handler.renderEngine.hitTest(e.clientX, e.clientY);
        if (!hit) return;

        const { row, col } = this.#getTopLeft(hit.row, hit.col);

        const merge = this.handler.sheet.getMerge(row, col);
        const focusRow = merge ? merge.bottomRow : row;
        const focusCol = merge ? merge.bottomCol : col;

        if (focusRow !== this.handler.sheet.selection.getFocus()[0] || focusCol !== this.handler.sheet.selection.getFocus()[1]) {
            this.handler.sheet.selection.setRange(this.#dragAnchorRow, this.#dragAnchorCol, focusRow, focusCol);
            this.handler.render();
        }
    }

    #handleMouseUp(e) {
        this.#dragging = false;
    }

    #handleHeaderClick(headerHit) {
        const sheet = this.handler.sheet;
        const rc = sheet.rowColManager;

        if (headerHit.type === HIT_TYPE.CORNER) {
            sheet.selection.selectAll(rc.rowCount - 1, rc.realColCount - 1);
        } else if (headerHit.type === HIT_TYPE.COL_HEADER) {
            sheet.selection.selectCol(headerHit.index, rc.rowCount - 1);
        } else if (headerHit.type === HIT_TYPE.ROW_HEADER) {
            sheet.selection.selectRow(headerHit.index, rc.realColCount - 1);
        }

        this.handler.render();
    }

    #handleDoubleClick(e) {
        if (!this.enabled || !this.handler.sheet) return;

        this.#debouncedCellClick.cancel();

        const hit = this.handler.renderEngine.hitTest(e.clientX, e.clientY);
        if (!hit) return;
        if (hit.type !== HIT_TYPE.CELL) return;

        const { row, col } = this.#getTopLeft(hit.row, hit.col);

        this.handler.runHooks(HOOKS.ON_CELL_DBL_CLICK, row, col, e);

        const merge = this.handler.sheet.getMerge(row, col);
        if (merge) {
            this.handler.sheet.selection.setRange(merge.topRow, merge.topCol, merge.bottomRow, merge.bottomCol);
        } else {
            this.handler.sheet.selection.setActive(row, col);
        }
        this.handler.editor.show(row, col, "end");
    }

    #getTopLeft(row, col) {
        const merge = this.handler.sheet?.getMerge(row, col);
        if (merge) {
            return { row: merge.topRow, col: merge.topCol };
        }
        return { row, col };
    }
}