import { EventStrategy } from "./EventStrategy.js";
import { HOOKS } from "../../constants/hookNames.js";
import { HIT_TYPE } from "../../constants/hitType";
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
 * ┌────────────────────┬─────────────────────────────────────────┐
 * │ 操作               │ 行为                                    │
 * ├────────────────────┼─────────────────────────────────────────┤
 * │ 单元格单击         │ 选中单元格，触发 ON_CELL_CLICK hook     │
 * │ 单元格双击         │ 进入编辑模式                            │
 * │ 拖拽选择           │ 创建/更新矩形范围选区                   │
 * │ Shift+单击        │ 扩展选区到点击位置                      │
 * │ 行头单击           │ 选中整行                                │
 * │ 列头单击           │ 选中整列                                │
 * │ 左上角按钮单击     │ 全选所有单元格                          │
 * └────────────────────┴─────────────────────────────────────────┘
 *
 * 技术实现要点：
 * - 使用 hitTest() 判断鼠标点击的位置类型
 * - 通过 debounce 区分单击和双击（200ms延迟）
 * - 拖拽时监听 document 的 mousemove/mouseup（支持移出Canvas）
 * - 支持合并单元格的选区处理
 * - 自动滚动：拖拽到边缘时自动滚动表格
 *
 * 事件流程示例（单击单元格）：
 * ```
 * mousedown → hitTest → 更新activeCell → mouseup → debounce(200ms) → ON_CELL_CLICK hook
 * ```
 *
 * 事件流程示例（双击编辑）：
 * ```
 * mousedown → mouseup → mousedown(第2次) → mouseup(第2次) → dblclick → cancel(debounce) → enterEditMode()
 * ```
 *
 * @class MouseStrategy
 * @extends EventStrategy
 *
 * @see EventStrategy - 基类
 * @see ResizeStrategy - 高优先级的尺寸调整策略
 * @see AutoFillStrategy - 高优先级的自动填充策略
 */

// 考虑是否需要将 InteractionPlugin 的功能合并到 MouseStrategy 中
export class MouseStrategy extends EventStrategy {
    priority = STRATEGY_PRIORITY.MOUSE_DEFAULT;

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

    /** 上一次鼠标悬停的单元格位置 */
    #lastHoverCell = { row: -1, col: -1 };

    #handleMouseMove(e) {
        // ✅ 修复：移除 #dragging 限制，所有鼠标移动都应触发事件
        if (!this.handler.sheet) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);

        // 鼠标离开单元格区域
        if (!hit) {
            if (this.#lastHoverCell.row !== -1) {
                // ✅ 通过 EventBus 发射鼠标移出事件（指定 source 为 MouseStrategy）
                this.handler.sheet.bus.emit(SHEET_EVENTS.CELL_MOUSE_OUT, [this.#lastHoverCell.row, this.#lastHoverCell.col, e], {
                    source: "MouseStrategy",
                });
                this.#lastHoverCell = { row: -1, col: -1 };
            }
            return;
        }

        const { row, col } = this.#getTopLeft(hit.row, hit.col);

        // 检测鼠标移出单元格
        if (this.#lastHoverCell.row !== -1 && (this.#lastHoverCell.row !== row || this.#lastHoverCell.col !== col)) {
            // ✅ 通过 EventBus 发射鼠标移出事件（指定 source 为 MouseStrategy）
            this.handler.sheet.bus.emit(SHEET_EVENTS.CELL_MOUSE_OUT, [this.#lastHoverCell.row, this.#lastHoverCell.col, e], {
                source: "MouseStrategy",
            });
        }

        // 更新最后悬停位置并触发鼠标悬停事件
        if (this.#lastHoverCell.row !== row || this.#lastHoverCell.col !== col) {
            this.#lastHoverCell = { row, col };

            // ✅ 通过 EventBus 发射鼠标悬停事件（指定 source 为 MouseStrategy）
            this.handler.sheet.bus.emit(SHEET_EVENTS.CELL_MOUSE_OVER, [row, col, e], { source: "MouseStrategy" });
        }

        // 拖拽选择逻辑（仅在拖拽时执行）
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

        const range = sheet.selection.getRange();
        const focus = sheet.selection.getFocus();
        this.handler.runHooks(HOOKS.AFTER_SELECTION, range, focus);

        this.handler.render();
    }

    #handleDoubleClick(e) {
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

        // 检查单元格类型是否为交互式类型（如星级评分）
        // 交互式类型通过自身处理用户输入，不需要弹出传统编辑器
        const cellType = this.handler.sheet.getCellTypeInstance(row, col);
        if (cellType?.isInteractive) {
            // 交互式类型：不显示编辑器，让类型自己处理双击事件
            return;
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
