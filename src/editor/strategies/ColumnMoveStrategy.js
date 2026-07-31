import { EventStrategy } from "./EventStrategy.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority";
import { HIT_TYPE } from "@/constants/hitType";
import { DELEGATE_KEYS } from "@/constants/eventNames.js";
import { HOOKS } from "@/constants/hookNames.js";

/**
 * 列拖拽移动策略 (Column Move Strategy)
 *
 * 处理Canvas表格中列的拖拽重新排序功能。
 * 允许用户通过拖拽列头来改变列的顺序。
 *
 * ## 优先级配置
 * 使用 STRATEGY_PRIORITY.ROW_COLUMN_MOVE
 * - 确保在适当的时机处理列移动事件
 * - 与行移动策略共享优先级常量（互斥操作）
 * - 避免与 ResizeStrategy、MouseStrategy 等产生冲突
 *
 * ## 核心功能矩阵
 * ┌────────────────────┬─────────────────────────────────────────┐
 * │ 操作               │ 行为                                    │
 * ├────────────────────┼─────────────────────────────────────────┤
 * │ 按下列头           │ 记录源列位置，准备拖拽                │
 * │ 拖拽（超过阈值）   │ 进入拖拽状态，显示插入指示器           │
 * │ 拖拽中移动         │ 实时更新目标位置，显示预览效果         │
 * │ 松开鼠标          │ 执行列移动，更新数据和UI              │
 * └────────────────────┴─────────────────────────────────────────┘
 *
 * ## 交互流程详解
 *
 * **阶段1: 初始化（mousedown）**
 * ```
 * 用户按下鼠标左键（在列头区域）
 *    ↓
 * hitTest() 检测到 COL_HEADER 类型
 *    ↓
 * 排除调整手柄区域（headerHitTest）
 *    ↓
 * 记录源列索引 (#sourceCol)
 * 记录起始坐标 (#dragStartX, #mouseDownX)
 * 设置 #moving = true, #dragStarted = false
 * ```
 *
 * **阶段2: 拖拽启动检测（mousemove）**
 * ```
 * 鼠标开始移动
 *    ↓
 * 计算移动距离: |currentX - mouseDownX|
 *    ↓
 * 距离 > DRAG_THRESHOLD (3px)?
 *   ├── 是 → 设置 #dragStarted = true
 * │        光标变为 grabbing
 * │        显示幽灵列和插入指示器
 * │        调用 setColumnMoveState() 通知渲染层
 * └── 否 → 继续等待（可能是单击选择）
 * ```
 *
 * **阶段3: 拖拽进行中（mousemove持续）**
 * ```
 * 实时更新目标位置 (#targetCol)
 *    ↓
 * 根据鼠标X坐标计算插入位置（支持列头和单元格区域）
 *    ↓
 * 更新插入指示器的视觉位置
 *    ↓
 * 调用 invalidateAll() + render() 强制重绘
 *    ↓
 * 返回 false 阻止低优先级策略处理同一事件
 * ```
 *
 * **阶段4: 完成（mouseup）**
 * ```
 * 如果 #dragStarted == true 且源列 ≠ 目标列:
 *    ↓
 * 触发 BEFORE_COLUMN_MOVE 钩子（可取消）
 *    ↓
 * 调用 sheet.moveCol(sourceCol, targetCol)
 *    ↓
 * 更新数据模型、调整选区范围
 *    ↓
 * 触发 AFTER_COLUMN_MOVE 钩子
 *    ↓
 * 清理所有临时状态和视觉效果
 * ```
 *
 * ## 技术实现特点
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
 * - 渲染委托给 selectionLayer.setColumnMoveState()
 *
 * **3. 状态管理**：
 * ```
 * idle → pressed(按下) → dragging(拖拽中) → dropped(释放) → idle
 *        ↓ (未超过阈值)
 *      selected(选中) → idle
 * ```
 *
 * **4. 数据更新流程**：
 * 1. 调用 sheet.moveCol(sourceCol, targetCol)
 * 2. 更新内部数据模型（CellStore、样式等）
 * 3. 调整选区范围以适应新的列顺序
 * 4. 触发 HOOKS.AFTER_COLUMN_MOVE 钩子通知其他组件
 * 5. 请求重绘以反映变化
 *
 * ## 与其他策略的协作关系
 *
 * | 策略 | 关系 | 协作方式 |
 * |------|------|---------|
 * | ResizeStrategy | 冲突检测 | 通过 headerHitTest() 排除调整手柄区域 |
 * | MouseStrategy | 事件让渡 | 单击列头时优先由此策略处理 |
 * | RowMoveStrategy | 互斥操作 | 共享优先级，同时只能移动行或列 |
 * | SelectionPlugin | 选区联动 | 移动后自动调整选中范围 |
 *
 * ## 性能优化措施
 * - 拖拽过程中避免 requestAnimationFrame（直接同步渲染保证响应性）
 * - 使用 invalidateAll() 标记整个视口需要重绘
 * - 延迟数据更新直到拖拽结束（批量处理）
 * - 幽灵列动画使用 CSS transform 加速（渲染层负责）
 *
 * @class ColumnMoveStrategy
 * @extends EventStrategy
 *
 * @see EventStrategy - 基类，提供事件分发框架
 * @see RowMoveStrategy - 行移动策略（类似实现，互斥关系）
 * @see ResizeStrategy - 列宽调整策略（需避免冲突）
 * @see HeaderRenderer / SelectionLayer - 负责绘制移动状态的视觉元素
 */

/** @constant @private 拖拽启动阈值（像素） */
const DRAG_THRESHOLD = 3;

export class ColumnMoveStrategy extends EventStrategy {
    /** 策略优先级 - 与行移动共享 ROW_COLUMN_MOVE 优先级 */
    priority = STRATEGY_PRIORITY.ROW_COLUMN_MOVE;

    /**
     * @private 私有字段 - 是否处于 mousedown 状态（尚未超过拖拽阈值）
     * @type {boolean}
     */
    #moving = false;

    /**
     * @private 私有字段 - 是否已进入真正的拖拽状态（移动距离超过阈值）
     * @type {boolean}
     */
    #dragStarted = false;

    /**
     * @private 私有字段 - 拖拽源列索引（-1 表示未设置）
     * @type {number}
     */
    #sourceCol = -1;

    /**
     * @private 私有字段 - 拖拽目标列索引（鼠标当前位置对应的列，-1 表示未设置）
     * @type {number}
     */
    #targetCol = -1;

    /**
     * @private 私有字段 - 拖拽起始时鼠标在 canvas 内的 X 坐标
     * @type {number}
     */
    #dragStartX = 0;

    /**
     * @private 私有字段 - mousedown 时鼠标在屏幕上的 X 坐标（用于计算阈值）
     * @type {number}
     */
    #mouseDownX = 0;

    /**
     * @private 私有字段 - 是否由本策略设置了光标（用于光标所有权管理）
     *
     * 光标所有权机制说明：
     * - 当本策略设置光标时，标记此字段为 true
     * - 清除光标前检查此字段，仅在自己设置的情况下才清除
     * - 避免误清除其他策略（如 ResizeStrategy）设置的光标
     * @type {boolean}
     */
    #cursorOwned = false;

    /**
     * 构造函数 - 初始化列移动策略
     *
     * @param {object} handler - 事件处理器（EventHandler 实例）
     *                           提供对 sheet、viewport、renderEngine 等的访问
     */
    constructor(handler) {
        super(handler);
    }

    /**
     * 公共方法 - 初始化策略（空实现）
     *
     * 基类要求实现此方法，但本策略无需额外的初始化逻辑。
     * 所有状态通过私有字段初始化，事件处理器通过 getEventHandlers() 注册。
     */
    init() {}

    /**
     * 公共方法 - 销毁策略
     *
     * 清理所有临时状态和视觉效果：
     * - 调用 #clearIndicator() 移除渲染层的移动指示器
     * - 重置所有拖拽相关状态字段
     */
    destroy() {
        this.#clearIndicator();
    }

    /**
     * 公共方法 - 获取事件处理器映射表
     *
     * 注册四个鼠标事件处理器到 EventHandler：
     * - CANVAS_MOUSEDOWN: 在 canvas 内的按下事件（启动拖拽准备）
     * - CANVAS_MOUSEMOVE: 在 canvas 内的移动事件（悬停光标管理）
     * - DOCUMENT_MOUSEMOVE: document 级别的移动事件（拖拽进行中）
     * - DOCUMENT_MOUSEUP: document 级别的松开事件（完成拖拽）
     *
     * 使用 document 级别监听确保鼠标移出 canvas 后仍能捕获事件。
     *
     * @returns {Object<string, Function>} 事件类型到处理函数的映射
     */
    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => this.#onMouseDown(e),
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: (e) => this.#onHover(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e) => this.#onMouseMove(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: (e) => this.#onMouseUp(e),
        };
    }

    /**
     * @private 私有方法 - 鼠标按下处理：仅在列头区域且非调整列宽时启动拖拽准备
     *
     * 执行步骤：
     * 1. 前置检查：策略必须启用、存在 sheet、仅响应左键
     * 2. 冲突检测：通过 headerHitTest() 排除调整手柄区域
     * 3. 区域检测：通过 hitTest() 确认在 COL_HEADER 类型区域
     * 4. 状态初始化：
     *    - 设置 #moving = true 标记进入按下状态
     *    - 设置 #dragStarted = false（尚未超过阈值）
     *    - 记录源列索引 (#sourceCol) 和目标列 (#targetCol)
     *    - 记录起始坐标用于后续阈值检测
     *
     * @param {MouseEvent} e - 鼠标事件对象
     * @returns {void}
     *
     * @see #onMouseMove - 检测超过阈值后进入拖拽状态
     * @see #onMouseUp - 松开鼠标时完成或取消操作
     */
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
     * @private 私有方法 - 鼠标悬停处理：在列头区域显示抓取光标
     *
     * 光标管理逻辑：
     * - 当鼠标进入列头区域（COL_HEADER）时显示 "grab" 光标
     * - 当鼠标离开列头区域时清除光标（仅清除自己设置的）
     * - 拖拽进行中（#moving == true）时跳过处理
     *
     * 光标所有权机制：
     * 1. 设置光标时标记 #cursorOwned = true
     * 2. 返回 false 阻止低优先级策略覆盖此光标
     * 3. 清除光标前检查 #cursorOwned，避免误清其他策略的光标
     *    （例如 ResizeStrategy 在调整手柄区域设置的光标）
     *
     * 前置条件检查：
     * - 策略必须启用
     * - sheet 必须存在
     * - 不能处于拖拽状态（#moving）
     * - 不能在调整手柄区域（headerHitTest）
     *
     * @param {MouseEvent} e - canvas 内的鼠标移动事件
     * @returns {boolean|void} false 表示阻止后续策略处理，void 表示不干预
     */
    #onHover(e) {
        if (!this.enabled || !this.handler.sheet) return undefined;
        if (this.#moving) return undefined;

        const resizeHit = this.handler.viewport.headerHitTest(e.clientX, e.clientY);
        if (resizeHit) return undefined;

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
        return undefined;
    }

    /**
     * @private 私有方法 - 鼠标移动处理（document 级别监听）：核心拖拽逻辑
     *
     * 此方法在 document 级别监听，确保鼠标移出 canvas 后仍能持续跟踪。
     *
     ** 阶段A: 拖拽启动检测（首次超过阈值）**
     * - 计算水平移动距离: |e.clientX - #mouseDownX|
     * - 如果距离 >= DRAG_THRESHOLD (3px):
     *   - 设置 #dragStarted = true 标记进入拖拽状态
     *   - 更改光标为 "grabbing" 表示正在抓取
     *
     ** 阶段B: 拖拽进行中（#dragStarted == true）**
     * 1. 通过 hitTest() 获取当前位置对应的列索引
     *    - 支持列头区域（COL_HEADER）和单元格区域（CELL）
     *    - 根据区域类型提取不同的索引字段（index vs col）
     * 2. 构建拖拽状态对象传递给渲染层：
     *    ```
     *    {
     *        sourceCol: 源列索引,
     *        targetCol: 目标列索引,
     *        dragX: 当前鼠标在 canvas 内的 X 坐标,
     *        dragStartX: 拖拽起始 X 坐标,
     *        colW: 源列的宽度（用于绘制幽灵列）
     *    }
     *    ```
     * 3. 调用 selectionLayer.setColumnMoveState() 通知渲染层更新视觉反馈
     * 4. 强制重绘整个视口（invalidateAll + render）
     * 5. 返回 false 阻止低优先级策略处理此事件
     *
     * 性能考虑：
     * - 每次 mousemove 都会触发重绘，但现代浏览器可保持 60fps
     * - 渲染层会根据状态对象决定是否需要实际绘制（null 时跳过）
     * - 未来优化：可添加 requestAnimationFrame 节流（需测试响应性）
     *
     * @param {MouseEvent} e - document 级别的鼠标移动事件
     * @returns {boolean|void} false 表示阻止后续策略，void 表示未进入拖拽
     *
     * @see #onMouseDown - 启动拖拽准备，初始化坐标
     * @see #onMouseUp - 完成拖拽，执行数据更新
     */
    #onMouseMove(e) {
        if (!this.#moving) return undefined;

        if (!this.#dragStarted) {
            const dx = Math.abs(e.clientX - this.#mouseDownX);
            if (dx < DRAG_THRESHOLD) return undefined;

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

    /**
     * @private 私有方法 - 鼠标松开处理：完成或取消拖拽操作
     *
     ** 执行流程：**
     *
     * 1. **前置检查**：
     *    - 如果 #moving == false，说明未处于拖拽状态，直接返回
     *
     * 2. **状态重置**（无论是否执行移动）：
     *    - 设置 #moving = false 退出按下状态
     *    - 清除 canvas 光标样式
     *    - 调用 #clearIndicator() 移除渲染层的视觉反馈
     *
     * 3. **条件执行列移动**（需同时满足）：
     *    - #dragStarted == true（已超过阈值，确认为拖拽而非单击）
     *    - #sourceCol !== #targetCol（源和目标不同，有实际意义）
     *    - #targetCol >= 0（目标位置有效）
     *
     * 4. **钩子拦截机制**：
     *    ```
     *    调用 runHooksUntil(HOOKS.BEFORE_COLUMN_MOVE, sourceCol, targetCol)
     *        ↓
     *    如果任何钩子返回 false → 取消操作，跳过数据更新
     *        ↓
     *    否则 → 继续执行移动逻辑
     *    ```
     *
     * 5. **数据更新流程**：
     *    a. 调用 sheet.moveCol(sourceCol, targetCol) 执行实际的数据移动
     *       - 更新 CellStore 中的单元格引用
     *       - 更新样式、合并单元格等关联数据
     *       - 内部会触发数据变更事件
     *    b. 调整选区范围以适应新的列顺序：
     *       - 计算偏移量 delta = targetCol - sourceCol
     *       - 根据 delta 的正负决定选区调整方向
     *       - 确保新的选区索引不小于 0
     *    c. 触发 HOOKS.AFTER_COLUMN_MOVE 钩子通知其他组件
     *       - 可用于同步 UI、记录日志、触发保存等
     *
     * 6. **最终清理**：
     *    - 重置所有状态字段为初始值（-1 或 false）
     *    - 强制重绘视口以反映最终状态
     *
     ** 边界情况处理：**
     * - 单击列头后松开（#dragStarted == false）：不执行任何操作
     * - 拖拽到原位置（source == target）：不执行移动，避免无意义的操作
     * - 目标位置无效（target < 0）：通常不会发生，但做防御性检查
     * - 钩子取消：立即清理并重绘，保持 UI 一致性
     *
     * @param {MouseEvent} _e - document 级别的鼠标松开事件（未使用，保留以符合事件签名）
     * @returns {void}
     *
     * @see #onMouseDown - 启动拖拽准备
     * @see #onMouseMove - 拖拽进行中的位置更新
     * @see #clearIndicator - 清理视觉反馈
     */
    #onMouseUp(_e) {
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

    /**
     * @private 私有方法 - 清除渲染层中的列移动指示器
     *
     * 通过调用 selectionLayer.setColumnMoveState(null) 通知渲染层：
     * - 移除幽灵列（半透明的被拖拽列）
     * - 移除插入指示器（显示目标位置的线条）
     * - 清除所有与列移动相关的临时视觉元素
     *
     ** 调用时机：**
     * - destroy() 时：策略销毁时清理残留状态
     * - onMouseUp() 时：拖拽完成后清理（无论成功或取消）
     *
     ** 防御性编程：**
     * - 使用可选链操作符 (?.) 检查 renderEngine 和 selectionLayer 是否存在
     * - 避免在渲染层未初始化或已销毁时报错
     *
     * @returns {void}
     */
    #clearIndicator() {
        if (this.handler.renderEngine?.selectionLayer) {
            this.handler.renderEngine.selectionLayer.setColumnMoveState(null);
        }
    }
}
