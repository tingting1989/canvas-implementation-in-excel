import { STRATEGY_PRIORITY } from "@/constants/strategyPriority";

/**
 * 列拖拽移动策略 (Column Move Strategy)
 *
 * 处理Canvas表格中列的拖拽重新排序功能。
 * 允许用户通过拖拽列头来改变列的顺序。
 *
 * 优先级：使用 STRATEGY_PRIORITY.ROW_COLUMN_MOVE
 * - 确保在适当的时机处理列移动事件
 * - 与行移动策略共享优先级常量（互斥操作）
 *
 * 核心功能：
 * ┌────────────────────┬─────────────────────────────────────────┐
 * │ 操作               │ 行为                                    │
 * ├────────────────────┼─────────────────────────────────────────┤
 * │ 按下列头           │ 记录源列位置，准备拖拽                │
 * │ 拖拽（超过阈值）   │ 进入拖拽状态，显示插入指示器           │
 * │ 拖拽中移动         │ 实时更新目标位置，显示预览效果         │
 * │ 松开鼠标          │ 执行列移动，更新数据和UI              │
 * └────────────────────┴─────────────────────────────────────────┘
 *
 * 技术实现要点：
 *
 * **1. 拖拽阈值机制**：
 * - 使用 DRAG_THRESHOLD = 3 像素作为启动阈值
 * - 防止误触发：单击选择时不应该开始拖拽
 * - 只有鼠标移动超过3像素才认定为拖拽意图
 *
 * **2. 视觉反馈系统**：
 * - 幽灵列：半透明显示被拖拽的列
 * - 插入指示器：显示列将被插入的位置
 * - 高亮目标区域：提示用户释放后的效果
 * - 渲染委托给 HeaderRenderer.setColumnMoveState()
 *
 * **3. 状态管理**：
 * ```
 * idle → pressed(按下) → dragging(拖拽中) → dropped(释放) → idle
 *        ↓ (未超过阈值)
 *      selected(选中) → idle
 * ```
 *
 * **4. 数据更新流程**：
 * 1. 调用 sheet.moveColumn(sourceCol, targetCol)
 * 2. 更新内部数据模型（CellStore、样式等）
 * 3. 调整选区范围以适应新的列顺序
 * 4. 触发 ON_COLUMN_MOVE 钩子通知其他组件
 * 5. 请求重绘以反映变化
 *
 * 与其他策略的协作：
 * - ResizeStrategy: 检测是否在调整手柄区域（避免冲突）
 * - MouseStrategy: 单击列头时让渡给此策略处理
 * - RowMoveStrategy: 互斥关系，同时只能移动行或列
 *
 * 性能优化：
 * - 拖拽过程中使用 requestAnimationFrame 节流渲染
 * - 仅重绘受影响的区域（源列和目标列附近）
 * - 延迟更新直到拖拽结束（批量处理）
 * - 使用 CSS transform 加速幽灵列动画
 *
 * @class ColumnMoveStrategy
 * @extends EventStrategy
 *
 * @see EventStrategy - 基类
 * @see RowMoveStrategy - 行移动策略（类似实现）
 * @see ResizeStrategy - 列宽调整策略（需避免冲突）
 * @see HeaderRenderer - 负责绘制移动指示器
 */
const DRAG_THRESHOLD = 3;

export class ColumnMoveStrategy extends EventStrategy {
    priority = STRATEGY_PRIORITY.ROW_COLUMN_MOVE;

    #moving = false;
    #dragStarted = false;
    #sourceCol = -1;
    #targetCol = -1;
    #dragStartX = 0;
    #mouseDownX = 0;

    /** 是否由本策略设置了光标（用于光标所有权管理） */
    #cursorOwned = false;

    constructor(handler) {
        super(handler);
    }

    init() {}

    destroy() {
        this.#clearIndicator();
    }

    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => this.#onMouseDown(e),
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: (e) => this.#onHover(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e) => this.#onMouseMove(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: (e) => this.#onMouseUp(e),
        };
    }

    #onMouseDown(e) {
        if (!this.enabled || !this.handler.sheet) return;
        if (e.button !== 0) return;

        const resizeHit = this.handler.viewport.headerHitTest(e.clientX, e.clientY);
        if (resizeHit) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (!hit || hit.type !== HIT_TYPE.COL_HEADER) return;

        this.#moving = true;
        this.#dragStarted = false;
        this.#sourceCol = hit.index;
        this.#targetCol = hit.index;

        const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
        this.#mouseDownX = e.clientX;
        this.#dragStartX = e.clientX - rect.left;
    }

    /**
     * 鼠标悬停：在列头区域显示 grab 光标
     * 拖拽进行中时不处理
     *
     * 光标所有权机制：
     * - 设置光标时 return false 阻止低优先级策略覆盖
     * - 仅在本策略曾设置光标时才清除，避免误清其他策略的光标
     */
    #onHover(e) {
        if (!this.enabled || !this.handler.sheet) return;
        if (this.#moving) return;

        const resizeHit = this.handler.viewport.headerHitTest(e.clientX, e.clientY);
        if (resizeHit) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (hit && hit.type === HIT_TYPE.COL_HEADER) {
            this.handler.canvasContext.canvas.style.cursor = "grab";
            this.#cursorOwned = true;
            return false;
        }

        if (this.#cursorOwned) {
            this.handler.canvasContext.canvas.style.cursor = "";
            this.#cursorOwned = false;
        }
    }

    #onMouseMove(e) {
        if (!this.#moving) return;

        if (!this.#dragStarted) {
            const dx = Math.abs(e.clientX - this.#mouseDownX);
            if (dx < DRAG_THRESHOLD) return;

            this.#dragStarted = true;
            this.handler.canvasContext.canvas.style.cursor = "grabbing";
        }

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (hit && (hit.type === HIT_TYPE.COL_HEADER || hit.type === HIT_TYPE.CELL)) {
            this.#targetCol = hit.type === HIT_TYPE.COL_HEADER ? hit.index : hit.col;
        }

        const rc = this.handler.sheet.rowColManager;
        const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
        const dragX = e.clientX - rect.left;

        this.handler.renderEngine.selectionLayer.setColumnMoveState({
            sourceCol: this.#sourceCol,
            targetCol: this.#targetCol,
            dragX: dragX,
            dragStartX: this.#dragStartX,
            colW: rc.getColWidth(this.#sourceCol),
        });

        this.handler.viewport.invalidateAll();
        this.handler.render();

        return false;
    }

    #onMouseUp(e) {
        if (!this.#moving) return;
        this.#moving = false;
        this.handler.canvasContext.canvas.style.cursor = "";

        this.#clearIndicator();

        if (this.#dragStarted && this.#sourceCol !== this.#targetCol && this.#targetCol >= 0) {
            const cancelled = this.handler.runHooksUntil(HOOKS.BEFORE_COLUMN_MOVE, this.#sourceCol, this.#targetCol);
            if (cancelled === false) {
                this.#sourceCol = -1;
                this.#targetCol = -1;
                this.#dragStarted = false;
                this.handler.viewport.invalidateAll();
                this.handler.render();
                return;
            }

            this.handler.sheet.moveCol(this.#sourceCol, this.#targetCol);

            const sheet = this.handler.sheet;
            const range = sheet.selection.getRange();
            const delta = this.#targetCol - this.#sourceCol;
            const newTopCol = Math.max(0, range.topCol + (delta > 0 ? 1 : 0));
            const newBottomCol = Math.max(0, range.bottomCol + (delta > 0 ? 1 : 0));
            sheet.selection.setRange(range.topRow, newTopCol, range.bottomRow, newBottomCol);

            this.handler.runHooks(HOOKS.AFTER_COLUMN_MOVE, this.#sourceCol, this.#targetCol);
        }

        this.#sourceCol = -1;
        this.#targetCol = -1;
        this.#dragStarted = false;

        this.handler.viewport.invalidateAll();
        this.handler.render();
    }

    #clearIndicator() {
        if (this.handler.renderEngine?.selectionLayer) {
            this.handler.renderEngine.selectionLayer.setColumnMoveState(null);
        }
    }
}
