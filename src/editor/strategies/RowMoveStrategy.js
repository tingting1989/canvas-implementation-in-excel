/**
 * 行拖拽移动策略 (Row Move Strategy)
 *
 * 处理Canvas表格中行的拖拽重新排序功能。
 * 允许用户通过拖拽行头来改变行的顺序。
 *
 * 优先级：使用 STRATEGY_PRIORITY.ROW_COLUMN_MOVE
 * - 与 ColumnMoveStrategy 共享优先级常量
 * - 确保在适当的时机处理行移动事件
 *
 * 核心功能：
 * ┌────────────────────┬─────────────────────────────────────────┐
 * │ 操作               │ 行为                                    │
 * ├────────────────────┼─────────────────────────────────────────┤
 * │ 按下行头           │ 记录源行位置，准备拖拽                │
 * │ 拖拽（超过阈值）   │ 进入拖拽状态，显示插入指示器           │
 * │ 拖拽中移动         │ 实时更新目标位置，显示预览效果         │
 * │ 松开鼠标          │ 执行行移动，更新数据和UI              │
 * └────────────────────┴─────────────────────────────────────────┘
 *
 * 交互流程详解：
 *
 * **阶段1: 初始化（mousedown）**
 * ```
 * 用户按下鼠标左键（在行头区域）
 *    ↓
 * hitTest() 检测到 ROW_HEADER 类型
 *    ↓
 * 记录源行索引 (#sourceRow)
 * 记录起始坐标 (#dragStartY, #mouseDownY)
 * 设置 #moving = true, #dragStarted = false
 * ```
 *
 * **阶段2: 拖拽启动检测（mousemove）**
 * ```
 * 鼠标开始移动
 *    ↓
 * 计算移动距离: |currentY - mouseDownY|
 *    ↓
 * 距离 > DRAG_THRESHOLD (3px)?
 *   ├── 是 → 设置 #dragStarted = true
 * │        显示幽灵行和插入指示器
 * │        调用 HeaderRenderer.setRowMoveState()
 * └── 否 → 继续等待（可能是单击选择）
 * ```
 *
 * **阶段3: 拖拽进行中（mousemove持续）**
 * ```
 * 实时更新目标位置 (#targetRow)
 *    ↓
 * 根据鼠标Y坐标计算插入位置
 *    ↓
 * 更新插入指示器的视觉位置
 *    ↓
 * 使用 requestAnimationFrame 节流渲染
 * ```
 *
 * **阶段4: 完成（mouseup）**
 * ```
 * 如果 #dragStarted == true:
 *    ↓
 * 调用 sheet.moveRow(sourceRow, targetRow)
 *    ↓
 * 更新数据模型、调整选区
 *    ↓
 * 触发 ON_ROW_MOVE 钩子
 *    ↓
 * 清理所有临时状态和视觉效果
 * ```
 *
 * 技术实现特点：
 * - **渲染委托**：本策略只负责逻辑，渲染交给 HeaderRenderer
 * - **光标管理**：通过 #cursorOwned 标记避免光标冲突
 * - **防误触**：3像素拖拽阈值区分单击和拖拽
 * - **性能优化**：requestAnimationFrame 节流 + 区域重绘
 *
 * 与其他组件的关系：
 * - HeaderRenderer: 绘制幽灵行、插入指示器
 * - CellStore: 更新行顺序相关的数据引用
 * - SelectionManager: 调整选中范围
 * - UndoManager: 记录操作以支持撤销
 *
 * @class RowMoveStrategy
 * @extends EventStrategy
 *
 * @see EventStrategy - 基类
 * @see ColumnMoveStrategy - 列移动策略（类似实现）
 * @see HeaderRenderer - 负责绘制移动状态的视觉元素
 */
const DRAG_THRESHOLD = 3;

export class RowMoveStrategy extends EventStrategy {
    /** 优先级低于列移动（80），避免同时拖列和行时冲突 */
    priority = STRATEGY_PRIORITY.ROW_COLUMN_MOVE;

    /** 是否处于 mousedown 状态（尚未超过拖拽阈值） */
    #moving = false;

    /** 是否已进入真正的拖拽状态（移动距离超过阈值） */
    #dragStarted = false;

    /** 拖拽源行索引 */
    #sourceRow = -1;

    /** 拖拽目标行索引（鼠标当前位置对应的行） */
    #targetRow = -1;

    /** 拖拽起始时鼠标在 canvas 内的 Y 坐标 */
    #dragStartY = 0;

    /** mousedown 时鼠标在屏幕上的 Y 坐标（用于计算阈值） */
    #mouseDownY = 0;

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

    /**
     * 鼠标按下：仅在行头区域且非调整行高时启动拖拽准备
     */
    #onMouseDown(e) {
        if (!this.enabled || !this.handler.sheet) return;
        if (e.button !== 0) return;

        const resizeHit = this.handler.viewport.headerHitTest(e.clientX, e.clientY);
        if (resizeHit) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (!hit || hit.type !== HIT_TYPE.ROW_HEADER) return;

        this.#moving = true;
        this.#dragStarted = false;
        this.#sourceRow = hit.index;
        this.#targetRow = hit.index;

        const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
        this.#mouseDownY = e.clientY;
        this.#dragStartY = e.clientY - rect.top;
    }

    /**
     * 鼠标悬停：在行头区域显示 grab 光标
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
        if (hit && hit.type === HIT_TYPE.ROW_HEADER) {
            this.handler.canvasContext.canvas.style.cursor = "grab";
            this.#cursorOwned = true;
            return false;
        }

        if (this.#cursorOwned) {
            this.handler.canvasContext.canvas.style.cursor = "";
            this.#cursorOwned = false;
        }
    }

    /**
     * 鼠标移动（document 级别监听）：
     * - 首次超过阈值时进入拖拽状态
     * - 持续更新目标行和幽灵行位置
     * - 返回 false 阻止低优先级策略处理同一事件
     */
    #onMouseMove(e) {
        if (!this.#moving) return;

        // 拖拽阈值检测
        if (!this.#dragStarted) {
            const dy = Math.abs(e.clientY - this.#mouseDownY);
            if (dy < DRAG_THRESHOLD) return;

            this.#dragStarted = true;
            this.handler.canvasContext.canvas.style.cursor = "grabbing";
        }

        // 更新目标行：行头或单元格区域均可
        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (hit && (hit.type === HIT_TYPE.ROW_HEADER || hit.type === HIT_TYPE.CELL)) {
            this.#targetRow = hit.type === HIT_TYPE.ROW_HEADER ? hit.index : hit.row;
        }

        // 传递拖拽状态给 HeaderRenderer 渲染幽灵行和插入指示器
        const rc = this.handler.sheet.rowColManager;
        const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
        const dragY = e.clientY - rect.top;

        this.handler.renderEngine.selectionLayer.setRowMoveState({
            sourceRow: this.#sourceRow,
            targetRow: this.#targetRow,
            dragY: dragY,
            dragStartY: this.#dragStartY,
            rowH: rc.getRowHeight(this.#sourceRow),
        });

        this.handler.viewport.invalidateAll();
        this.handler.render();

        return false;
    }

    /**
     * 鼠标松开：
     * 1. 触发 beforeRowMove 钩子（可取消）
     * 2. 执行 Sheet.moveRow 数据移动
     * 3. 调整选区到新位置
     * 4. 触发 afterRowMove 钩子
     */
    #onMouseUp(e) {
        if (!this.#moving) return;
        this.#moving = false;
        this.handler.canvasContext.canvas.style.cursor = "";

        this.#clearIndicator();

        if (this.#dragStarted && this.#sourceRow !== this.#targetRow && this.#targetRow >= 0) {
            const cancelled = this.handler.runHooksUntil(HOOKS.BEFORE_ROW_MOVE, this.#sourceRow, this.#targetRow);
            if (cancelled === false) {
                this.#sourceRow = -1;
                this.#targetRow = -1;
                this.#dragStarted = false;
                this.handler.viewport.invalidateAll();
                this.handler.render();
                return;
            }

            this.handler.sheet.moveRow(this.#sourceRow, this.#targetRow);

            const sheet = this.handler.sheet;
            const range = sheet.selection.getRange();
            const delta = this.#targetRow - this.#sourceRow;
            const newTopRow = Math.max(0, range.topRow + (delta > 0 ? 1 : 0));
            const newBottomRow = Math.max(0, range.bottomRow + (delta > 0 ? 1 : 0));
            sheet.selection.setRange(newTopRow, range.topCol, newBottomRow, range.bottomCol);

            this.handler.runHooks(HOOKS.AFTER_ROW_MOVE, this.#sourceRow, this.#targetRow);
        }

        this.#sourceRow = -1;
        this.#targetRow = -1;
        this.#dragStarted = false;

        this.handler.viewport.invalidateAll();
        this.handler.render();
    }

    /** 清除 HeaderRenderer 中的行移动指示器 */
    #clearIndicator() {
        if (this.handler.renderEngine?.selectionLayer) {
            this.handler.renderEngine.selectionLayer.setRowMoveState(null);
        }
    }
}
