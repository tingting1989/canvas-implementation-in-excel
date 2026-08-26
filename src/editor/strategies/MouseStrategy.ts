import { EventStrategy } from "./EventStrategy.js";
import { HOOKS } from "../../constants/hookNames.js";
import { HIT_TYPE } from "../../constants/hitType.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import { debounce } from "../../utils/helper.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";

/**
 * 鼠标交互策略 (Mouse Interaction Strategy)
 *
 * 处理Canvas表格中所有鼠标相关的用户交互操作。
 * 是最核心的交互策略之一，负责单元格选择、范围选择等功能。
 *
 * 优先级：50（STRATEGY_PRIORITY.MOUSE_DEFAULT）
 * - 在 ResizeStrategy (100) 和 AutoFillStrategy (90) 之后执行
 * - 确保尺寸调整和自动填充优先捕获鼠标事件
 *
 * 核心功能：
 * 1. **单元格选择**：单击选中单元格，支持合并单元格选区
 * 2. **范围选择**：拖拽选择多个单元格区域
 * 3. **Shift扩展选择**：按住Shift键扩展选区范围
 * 4. **表头选择**：点击行/列/角标头选中整行/整列/全表
 * 5. **双击编辑**：双击单元格进入编辑模式
 * 6. **悬停通知**：鼠标悬停时通过事件总线通知单元格进出
 *
 * 交互流程：
 * ┌──────────┐    ┌──────────────┐    ┌──────────────┐
 * │ mousedown │ →  │ hitTest定位   │ →  │ 更新选区状态  │
 * └──────────┘    └──────────────┘    └──────────────┘
 * ┌──────────┐    ┌──────────────┐    ┌──────────────┐
 * │ mousemove │ →  │ 拖拽范围选择   │ →  │ 实时渲染更新  │
 * └──────────┘    └──────────────┘    └──────────────┘
 * ┌──────────┐    ┌──────────────┐
 * │ dblclick  │ →  │ 进入编辑模式  │
 * └──────────┘    └──────────────┘
 *
 * @class MouseStrategy
 * @extends EventStrategy
 */
export class MouseStrategy extends EventStrategy {
    /** 策略优先级：鼠标默认交互 */
    priority: number = STRATEGY_PRIORITY.MOUSE_DEFAULT;

    /** 是否正在拖拽选择范围 */
    #dragging: boolean = false;
    /** 拖拽起始锚点行号 */
    #dragAnchorRow: number = -1;
    /** 拖拽起始锚点列号 */
    #dragAnchorCol: number = -1;

    /**
     * 防抖的单元格点击事件触发器
     * 避免快速连续点击时重复触发 ON_CELL_CLICK 钩子
     */
    #debouncedCellClick: ReturnType<typeof debounce> = debounce(
        ((row: number, col: number, e: MouseEvent) => {
            this.handler.runHooks(HOOKS.ON_CELL_CLICK, row, col, e);
        }) as (...args: unknown[]) => void,
        200,
    );

    /** 上次悬停的单元格坐标，用于检测悬停进出 */
    #lastHoverCell: { row: number; col: number } = { row: -1, col: -1 };

    /**
     * 创建鼠标交互策略实例
     * @param handler - 事件处理器实例，提供对工作表、选区、渲染引擎的访问
     */
    constructor(handler: any) {
        super(handler);
    }

    /** 初始化策略（本策略无需额外初始化） */
    init(): void {}

    /** 销毁策略，取消防抖定时器防止内存泄漏 */
    destroy(): void {
        this.#debouncedCellClick.cancel();
    }

    /**
     * 声明监听的DOM事件
     * @returns 事件映射：canvas的mousedown/dblclick + document的mousemove/mouseup
     */
    getEventHandlers(): Record<string, (e: Event) => boolean | void> {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e: Event) => this.#handleMouseDown(e as MouseEvent),
            [DELEGATE_KEYS.CANVAS_DBLCLICK]: (e: Event) => this.#handleDoubleClick(e as MouseEvent),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e: Event) => this.#handleMouseMove(e as MouseEvent),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: () => this.#handleMouseUp(),
        };
    }

    /**
     * 处理鼠标按下事件
     *
     * 根据点击位置执行不同操作：
     * - 角标头/行标头/列标头 → 选中全表/整行/整列
     * - 单元格 + Shift → 扩展选区
     * - 单元格（无Shift）→ 选中并进入拖拽准备状态
     *
     * @param e - 鼠标事件
     */
    #handleMouseDown(e: MouseEvent): void {
        if (!this.enabled || !this.handler.sheet) return;
        if (e.button !== 0) return;

        const canvas = this.handler.canvas as HTMLCanvasElement | null;
        if (canvas && document.activeElement !== canvas) {
            canvas.focus();
        }

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
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

        const range = this.handler.sheet.selection.getRange();
        const focus = this.handler.sheet.selection.getFocus();
        this.handler.runHooks(HOOKS.AFTER_SELECTION, range, focus);

        this.handler.render();
    }

    /**
     * 处理鼠标移动事件
     *
     * 两个职责：
     * 1. 悬停通知：检测鼠标进出单元格，通过事件总线发出 CELL_MOUSE_OVER/OUT
     * 2. 拖拽选择：如果处于拖拽状态，实时更新选区范围并渲染
     *
     * @param e - 鼠标事件
     */
    #handleMouseMove(e: MouseEvent): void {
        if (!this.handler.sheet) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);

        if (!hit) {
            if (this.#lastHoverCell.row !== -1) {
                this.handler.sheet.bus.emit(SHEET_EVENTS.CELL_MOUSE_OUT, [this.#lastHoverCell.row, this.#lastHoverCell.col, e], {
                    source: "MouseStrategy",
                });
                this.#lastHoverCell = { row: -1, col: -1 };
            }
            return;
        }

        const { row, col } = this.#getTopLeft(hit.row, hit.col);

        if (this.#lastHoverCell.row !== -1 && (this.#lastHoverCell.row !== row || this.#lastHoverCell.col !== col)) {
            this.handler.sheet.bus.emit(SHEET_EVENTS.CELL_MOUSE_OUT, [this.#lastHoverCell.row, this.#lastHoverCell.col, e], {
                source: "MouseStrategy",
            });
        }

        if (this.#lastHoverCell.row !== row || this.#lastHoverCell.col !== col) {
            this.#lastHoverCell = { row, col };
            this.handler.sheet.bus.emit(SHEET_EVENTS.CELL_MOUSE_OVER, [row, col, e], { source: "MouseStrategy" });
        }

        if (!this.#dragging) return;

        const merge = this.handler.sheet.getMerge(row, col);
        const focusRow = merge ? merge.bottomRow : row;
        const focusCol = merge ? merge.bottomCol : col;

        if (focusRow !== this.handler.sheet.selection.getFocus()[0] || focusCol !== this.handler.sheet.selection.getFocus()[1]) {
            this.handler.sheet.selection.setRange(this.#dragAnchorRow, this.#dragAnchorCol, focusRow, focusCol);
            const range = this.handler.sheet.selection.getRange();
            const selFocus = this.handler.sheet.selection.getFocus();
            this.handler.runHooks(HOOKS.AFTER_SELECTION, range, selFocus);
            this.handler.render();
        }
    }

    /** 处理鼠标松开事件，结束拖拽选择状态 */
    #handleMouseUp(): void {
        this.#dragging = false;
    }

    /**
     * 处理表头点击（角标头/行标头/列标头）
     * @param headerHit - 命中测试结果，包含 type 和 index
     */
    #handleHeaderClick(headerHit: { type: string; index: number }): void {
        const sheet = this.handler.sheet;
        const rc = sheet.rowColManager;

        if (headerHit.type === HIT_TYPE.CORNER) {
            sheet.selection.selectAll(rc.rowCount - 1, rc.realColCount - 1);
        } else if (headerHit.type === HIT_TYPE.COL_HEADER) {
            sheet.selection.selectCol(headerHit.index, rc.rowCount - 1);
        } else if (headerHit.type === HIT_TYPE.ROW_HEADER) {
            sheet.selection.selectRow(headerHit.index, rc.realColCount - 1);
        }

        const range = sheet.selection.getRange();
        const focus = sheet.selection.getFocus();
        this.handler.runHooks(HOOKS.AFTER_SELECTION, range, focus);
        this.handler.render();
    }

    /**
     * 处理双击事件
     *
     * 取消防抖点击，触发 ON_CELL_DBL_CLICK 钩子，
     * 如果单元格不是交互类型（如按钮/链接），则进入编辑模式。
     *
     * @param e - 鼠标事件
     */
    #handleDoubleClick(e: MouseEvent): void {
        if (!this.enabled || !this.handler.sheet) return;

        this.#debouncedCellClick.cancel();

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
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

        const cellType = this.handler.sheet.getCellTypeInstance(row, col);
        if (cellType?.isInteractive) {
            return;
        }

        this.handler.editor.show(row, col, "end");
    }

    /**
     * 获取合并单元格的左上角坐标
     * 如果单元格属于合并区域，返回合并区域的起始位置；否则返回原始坐标
     *
     * @param row - 行号
     * @param col - 列号
     * @returns 合并区域左上角或原始坐标
     */
    #getTopLeft(row: number, col: number): { row: number; col: number } {
        const merge = this.handler.sheet?.getMerge(row, col);
        if (merge) {
            return { row: merge.topRow, col: merge.topCol };
        }
        return { row, col };
    }
}
