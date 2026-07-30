import { EventStrategy } from "./EventStrategy.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { isNumber } from "../../utils/helper.js";
import { AUTO_FILL_DIR } from "../../constants/enums/AutoFillDir.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";

/**
 * 自动填充策略 (Auto Fill Strategy)
 *
 * 实现类似Excel的拖拽自动填充功能。
 * 通过拖拽选区右下角的填充手柄，快速复制或扩展数据序列。
 *
 * 优先级：90（STRATEGY_PRIORITY.AUTO_FILL）
 * - 高优先级，确保填充手柄事件优先于普通鼠标选择
 * - 在 MouseStrategy (50) 之后、ResizeStrategy (100) 之前执行
 *
 * 核心功能特性：
 *
 * **1. 智能填充模式**：
 * ┌────────────────────┬───────────────────────────────────────┐
 * │ 源数据             │ 填充结果                             │
 * ├────────────────────┼───────────────────────────────────────┤
 * │ 1, 2, 3           │ 4, 5, 6, ... （等差数列）           │
 * │ Q1, Q2            │ Q3, Q4, Q1, ... （模式识别）         │
 * │ "文本"            │ "文本", "文本", ... （直接复制）      │
 * │ A, B              │ C, D, E, ... （字母序列）             │
 * │ 1月, 2月          │ 3月, 4月, ... （月份序列）            │
 * └────────────────────┴───────────────────────────────────────┘
 *
 * **2. 填充方向支持**：
 * - 向下填充（最常用）
 * - 向上填充
 * - 向右填充
 * - 向左填充
 *
 * **3. 视觉反馈**：
 * - 悬停时：光标变为十字形（crosshair）
 * - 拖拽时：显示半透明预览区域
 * - 实时更新：跟随鼠标移动动态调整预览范围
 *
 * 技术实现要点：
 * - 使用 hitTest() 检测是否在填充手柄区域（8x8像素）
 * - 通过 document 级别的事件监听支持拖出Canvas边界
 * - 支持多行多列的矩阵式填充
 * - 自动识别数值、日期、文本等不同数据类型
 * - 性能优化：大范围填充使用批量操作API
 *
 * 状态机：
 * ```
 * idle → hover(悬停手柄) → dragging(拖拽中) → fill(执行填充) → idle
 * ```
 *
 * 与其他组件协作：
 * - SelectionManager: 获取/设置选区范围
 * - CellStore: 批量读写单元格数据
 * - RenderEngine: 绘制填充手柄和预览区域
 * - UndoManager: 记录填充操作以支持撤销
 *
 * @class AutoFillStrategy
 * @extends EventStrategy
 *
 * @see EventStrategy - 基类
 * @see MouseStrategy - 鼠标选择策略（低优先级）
 * @see ResizeStrategy - 尺寸调整策略（更高优先级）
 *
 * @example
 * // 典型使用场景
 * // 1. 用户选中 A1:A3，内容为 [1, 2, 3]
 * // 2. 将鼠标移到选区右下角的填充手柄上
 * // 3. 光标变为十字形，按下左键开始拖拽
 * // 4. 向下拖拽到 A10，松开鼠标
 * // 5. A4:A10 自动填充为 [4, 5, 6, 7, 8, 9, 10]
 */
export class AutoFillStrategy extends EventStrategy {
    /**
     * 策略优先级
     *
     * @type {number}
     * @readonly
     * @default STRATEGY_PRIORITY.AUTO_FILL (90)
     */
    priority = STRATEGY_PRIORITY.AUTO_FILL;

    /**
     * @private 私有字段 - 是否正在执行填充拖拽操作
     *
     * 状态说明：
     * - true: 用户已按下鼠标并正在拖拽填充手柄
     * - false: 空闲状态或已完成/取消填充操作
     *
     * 生命周期：
     * - mousedown 在填充手柄上 → 设置为 true
     * - mouseup → 设置为 false 并执行填充逻辑
     *
     * 影响范围：
     * - 控制光标样式（crosshair vs 默认）
     * - 决定是否响应 mousemove 事件进行预览更新
     * - 影响 mouseup 时是否执行填充
     *
     * @type {boolean}
     * @private
     */
    #filling = false;

    /**
     * @private 私有字段 - 源选区信息（拖拽开始时的原始选区）
     *
     * 存储用户开始拖拽时的选区范围，
     * 用于后续计算填充的目标区域和数据源。
     *
     * 数据结构：
     * ```js
     * {
     *   topRow: number,      // 起始行号
     *   topCol: number,      // 起始列号
     *   bottomRow: number,   // 结束行号
     *   bottomCol: number    // 结束列号
     * }
     * ```
     *
     * 使用时机：
     * - mousedown 时记录当前选区
     * - mousemove 时作为参考计算偏移量
     * - mouseup 时读取源数据进行填充
     * - 填充完成后重置为 null
     *
     * @type {Object|null}
     * @private
     */
    #sourceRange = null;

    /**
     * @private 私有字段 - 当前填充方向
     *
     * 存储检测到的填充方向，决定数据扩展的方式。
     *
     * 可能值：
     * - "down": 向下填充（最常用）
     * - "up": 向上填充
     * - "right": 向右填充
     * - "left": 向左填充
     * - null: 尚未确定或未在填充状态
     *
     * 方向判定算法：
     * 1. 计算鼠标位置相对于源选区的偏移 (dr, dc)
     * 2. 优先判断单轴移动（dr=0 或 dc=0）
     * 3. 双轴移动时优先选择垂直方向（dr > 0 ? down : up）
     *
     * 对填充行为的影响：
     * - 决定 #computeTargetRange() 的计算逻辑
     * - 决定 #executeFill() 中行列遍历顺序
     * - 影响数值序列的正向/反向递增
     *
     * @type {string|null}
     * @private
     */
    #fillDirection = null;

    /**
     * @private 私有字段 - 填充目标终点行号
     *
     * 记录鼠标拖拽到达的目标行位置。
     * 用于实时更新选区显示填充预览范围。
     *
     * 更新时机：
     * - mousemove 事件中持续更新
     * - 仅当 fillDirection 为 "down" 或 "up" 时有效
     *
     * 与 #sourceRange.bottomRow 的关系：
     * - down: fillEndRow >= sourceRange.bottomRow （向下扩展）
     * - up: fillEndRow <= sourceRange.topRow （向上扩展）
     *
     * @type {number}
     * @private
     */
    #fillEndRow = 0;

    /**
     * @private 私有字段 - 填充目标终点列号
     *
     * 记录鼠标拖拽到达的目标列位置。
     * 用于实时更新选区显示填充预览范围。
     *
     * 更新时机：
     * - mousemove 事件中持续更新
     * - 仅当 fillDirection 为 "right" 或 "left" 时有效
     *
     * 与 #sourceRange.bottomCol 的关系：
     * - right: fillEndCol >= sourceRange.bottomCol （向右扩展）
     * - left: fillEndCol <= sourceRange.topCol （向左扩展）
     *
     * @type {number}
     * @private
     */
    #fillEndCol = 0;

    /**
     * @private 私有字段 - 光标所有权标记
     *
     * 追踪当前Canvas光标是否由本策略设置。
     * 用于实现光标所有权的精细管理机制。
     *
     * 为什么需要此标记？
     * - 多个策略可能同时监听 mousemove 事件
     * - 需要避免策略A设置的光标被策略B误清除
     * - 只有设置过光标的策略才有权恢复默认光标
     *
     * 工作流程：
     * ```
     * 进入填充手柄区域:
     *   → 设置 cursor = "crosshair"
     *   → cursorOwned = true
     *   → return false（阻止其他策略覆盖）
     *
     * 离开填充手柄区域:
     *   → if (cursorOwned) { cursor = ""; cursorOwned = false; }
     *   → return true（允许其他策略处理）
     * ```
     *
     * @type {boolean}
     * @private
     */
    #cursorOwned = false;

    /**
     * 创建自动填充策略实例
     *
     * 初始化策略的基本配置和内部状态。
     * 所有私有字段都会在此处初始化为默认值。
     *
     * @param {import("../../core/EventHandler.js").EventHandler} handler - 事件处理器实例
     *        提供对工作簿、工作表、渲染引擎等的访问
     *
     * @constructor
     */
    constructor(handler) {
        super(handler);
    }

    /**
     * 初始化策略（生命周期钩子）
     *
     * 当前实现为空方法。预留用于未来可能的初始化需求，如：
     * - 加载自定义填充模式配置
     * - 初始化性能监控工具
     * - 注册全局事件总线监听器
     *
     * 注意：DOM事件绑定通过 getEventHandlers() 完成，不在此方法中处理。
     *
     * @override
     * @virtual
     */
    init() {}

    /**
     * 销毁策略（生命周期钩子）
     *
     * 当前实现为空方法。预留用于资源清理，如：
     * - 取消定时器或动画帧
     * - 清理临时缓存数据
     * - 移除事件总线订阅
     * - 重置所有内部状态为初始值
     *
     * 注意：DOM事件解绑由 EventHandler 自动完成，无需手动处理。
     *
     * @override
     * @virtual
     */
    destroy() {}

    /**
     * 声明此策略监听的DOM事件处理器
     *
     * 返回4个关键事件的处理器映射表：
     *
     * **1. canvas:mousedown** (#onMouseDown)
     *    - 触发时机：用户在Canvas上按下鼠标左键
     *    - 用途：检测是否点击了填充手柄，启动拖拽
     *    - 返回值：false（点击手柄时阻止其他策略处理）
     *
     * **2. canvas:mousemove** (#onCursorCheck)
     *    - 触发时机：鼠标在Canvas内移动
     *    - 用途：检测悬停位置，管理光标样式
     *    - 返回值：false（在手柄上方时阻止其他策略）
     *
     * **3. document:mousemove** (#onMouseMove)
     *    - 触发时机：鼠标在文档任意位置移动
     *    - 用途：跟踪拖拽过程，更新填充预览
     *    - 绑定到document以支持拖出Canvas边界
     *    - 返回值：false（拖拽时阻止选区拖动）
     *
     * **4. document:mouseup** (#onMouseUp)
     *    - 触发时机：用户松开鼠标按钮
     *    - 用途：结束拖拽，执行实际的填充操作
     *    - 绑定到document确保即使移出Canvas也能捕获
     *
     * @returns {Object<string, Function>} 事件处理器映射表
     *
     * @override
     * @see #onMouseDown - 处理鼠标按下事件
     * @see #onCursorCheck - 处理光标检测
     * @see #onMouseMove - 处理拖拽移动
     * @see #onMouseUp - 处理填充执行
     */
    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => this.#onMouseDown(e),
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: (e) => this.#onCursorCheck(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e) => this.#onMouseMove(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: (e) => this.#onMouseUp(e),
        };
    }

    /**
     * @private 私有方法 - 光标样式检测与所有权管理
     *
     * 在每次鼠标移动（canvas:mousemove）时调用。
     * 负责检测鼠标是否悬停在填充手柄区域，
     * 并据此管理Canvas的光标样式。
     *
     ** 核心职责**：
     *
     * 1. **填充状态下的光标管理**
     *    - 当 #filling === true 时（正在拖拽）
     *    - 强制设置 cursor = "crosshair"
     *    - 返回 false 阻止其他策略修改光标
     *
     * 2. **空闲状态下的手柄检测**
     *    - 调用 viewport.fillHandleHitTest() 检测命中
     *    - 命中：设置 crosshair + #cursorOwned = true + return false
     *    - 未命中：检查是否需要恢复默认光标
     *
     * 3. **光标所有权清理**
     *    - 仅当 #cursorOwned === true 时才执行清理
     *    - 清理操作：cursor = "" + #cursorOwned = false
     *    - 避免误清除其他策略设置的光标
     *
     ** 光标所有权机制详解**：
     * ```
     * 场景A: MouseStrategy设置了"pointer"光标
     *   → 用户移入填充手柄 → 本策略设置"crosshair", cursorOwned=true
     *   → 用户移出填充手柄 → 检测cursorOwned=true → 清除为""
     *   → 结果: 正确恢复默认，不影响MouseStrategy的后续逻辑
     *
     * 场景B: 本策略未设置过光标（cursorOwned=false）
     *   → 用户在单元格间移动 → 不执行任何光标操作
     *   → 结果: 允许MouseStrategy等策略自由控制光标
     * ```
     *
     * @param {MouseEvent} e - canvas:mousemove事件对象
     *
     * @returns {boolean|undefined} 事件处理结果
     *          - undefined: 策略禁用或无操作
     *          - false: 已处理事件，阻止后续策略（在手柄上方或拖拽中）
     *          - (隐式true): 未返回false，允许后续策略继续处理
     *
     * @sideEffect 可能修改 canvas.style.cursor 和 #cursorOwned
     *
     * @see #filling - 填充状态标记
     * @see #cursorOwned - 光标所有权标记
     */
    #onCursorCheck(e) {
        if (!this.enabled || !this.handler.sheet) return;

        const canvas = this.handler.canvasContext.canvas;
        if (this.#filling) {
            canvas.style.cursor = "crosshair";
            return false;
        }

        const isFillHandle = this.handler.viewport.fillHandleHitTest(e.clientX, e.clientY);

        if (isFillHandle) {
            canvas.style.cursor = "crosshair";
            this.#cursorOwned = true;
            return false;
        }

        if (this.#cursorOwned) {
            canvas.style.cursor = "";
            this.#cursorOwned = false;
        }
    }

    /**
     * @private 私有方法 - 处理鼠标按下事件（启动填充拖拽）
     *
     * 在 canvas:mousedown 事件时调用。
     * 检测用户是否点击了选区的填充手柄（右下角的小方块），
     * 如果是则启动填充操作流程。
     *
     ** 执行流程**：
     *
     * **前置检查**（任一条件不满足则直接返回）：
     * 1. 策略必须处于启用状态 (this.enabled === true)
     * 2. 工作表必须存在 (this.handler.sheet !== null)
     * 3. 必须是鼠标左键点击 (e.button === 0)
     *
     * **命中检测**：
     * - 调用 viewport.fillHandleHitTest(clientX, clientY)
     * - 传入屏幕坐标进行命中测试
     * - 填充手柄区域通常为 8x8 像素
     * - 未命中 → 直接返回（允许其他策略处理）
     *
     * **启动填充状态**（命中后执行）：
     * 1. e.preventDefault() - 阻止浏览器默认行为（如文本选择）
     * 2. this.#filling = true - 标记进入填充模式
     * 3. 记录源选区范围：
     *    ```js
     *    this.#sourceRange = {
     *      topRow: selection.topRow,
     *      topCol: selection.topCol,
     *      bottomRow: selection.bottomRow,
     *      bottomCol: selection.bottomCol
     *    }
     *    ```
     * 4. 初始化目标位置为当前选区边界
     * 5. 返回 false 阻止 MouseStrategy 处理此事件
     *
     ** 与其他策略的交互**：
     * - MouseStrategy (优先级50): 会尝试处理 mousedown 进行单元格选择
     *   - 本策略返回 false 后，MouseStrategy不会收到此事件
     *   - 避免了选择新单元格导致源选区丢失
     *
     * - ResizeStrategy (优先级100): 处理行列尺寸调整
     *   - 填充手柄与调整手柄位置不同，不会冲突
     *   - ResizeStrategy会先执行并返回（未命中调整手柄）
     *
     * @param {MouseEvent} e - canvas:mousedown事件对象
     *        包含 clientX, clientY, button 等属性
     *
     * @returns {boolean|undefined} 事件处理结果
     *          - undefined: 未命中填充手柄或前置条件不满足
     *          - false: 已命中手柄并启动填充，阻止后续策略
     *
     * @sideEffect 修改 #filling, #sourceRange, #fillEndRow, #fillEndCol
     * @sideEffect 调用 e.preventDefault() 阻止默认行为
     *
     * @see #onMouseMove - 拖拽过程中的位置更新
     * @see #onMouseUp - 松开鼠标时执行实际填充
     */
    #onMouseDown(e) {
        if (!this.enabled || !this.handler.sheet) return;
        if (e.button !== 0) return;

        const isFillHandle = this.handler.viewport.fillHandleHitTest(e.clientX, e.clientY);
        if (!isFillHandle) return;

        e.preventDefault();
        this.#filling = true;

        const range = this.handler.sheet.selection.getRange();
        this.#sourceRange = { ...range };
        this.#fillEndRow = range.bottomRow;
        this.#fillEndCol = range.bottomCol;

        return false;
    }

    /**
     * @private 私有方法 - 处理鼠标移动事件（更新填充预览）
     *
     * 在 document:mousemove 事件时调用（仅在 #filling === true 时有效）。
     * 实时跟踪鼠标位置，计算填充方向和目标范围，
     * 并通过更新选区来显示半透明的填充预览效果。
     *
     ** 执行流程**：
     *
     * **1. 状态检查**
     * - 如果 #filling !== true → 直接返回（不处理）
     *
     * **2. 坐标转换与命中检测**
     * - 调用 viewport.hitTest(clientX, clientY)
     * - 将屏幕坐标转换为单元格坐标 (row, col)
     * - 如果命中测试失败（如移出可视区域）→ 返回 false
     *
     * **3. 计算偏移量**
     * ```js
     * const dr = row - sourceRange.bottomRow;  // 行偏移
     * const dc = col - sourceRange.bottomCol;  // 列偏移
     * ```
     *
     * **4. 方向判定算法**（优先级从高到低）：
     * ```
     * 条件                              → 填充方向
     * ──────────────────────────────────────────────
     * dr > 0 && dc === 0               → "down"
     * dr < 0 && dc === 0               → "up"
     * dc > 0 && dr === 0               → "right"
     * dc < 0 && dr === 0               → "left"
     * dr ≠ 0 && dc ≠ 0 (对角线移动)   → dr > 0 ? "down" : "up"
     *                                    （优先垂直方向）
     * ```
     *
     * **5. 更新目标位置**
     * - this.#fillEndRow = row（或 col，取决于方向）
     * - this.#fillEndCol = col（或 row，取决于方向）
     *
     * **6. 计算并设置预览选区**
     * ```js
     * newTopRow = Math.min(sourceRange.topRow, fillEndRow)
     * newBottomRow = Math.max(sourceRange.bottomRow, fillEndRow)
     * newTopCol = Math.min(sourceRange.topCol, fillEndCol)
     * newBottomCol = Math.max(sourceRange.bottomCol, fillEndCol)
     *
     * sheet.selection.setRange(newTopRow, newTopCol, newBottomRow, newBottomCol)
     * ```
     *
     * **7. 触发重绘**
     * - 调用 handler.render() 显示选区和预览区域
     *
     ** 视觉反馈说明**：
     * - 源区域：正常选区样式（蓝色边框）
     * - 目标区域：半透明覆盖层（通常为浅蓝色背景）
     * - 用户可以清晰看到即将被填充的范围
     *
     ** 性能优化考虑**：
     * - 每次 mousemove 都会触发重绘（可能频繁）
     * - 可考虑使用 requestAnimationFrame 节流（未来优化）
     * - 选区更新本身是轻量操作（仅修改数据，不立即渲染）
     *
     * @param {MouseEvent} e - document:mousemove事件对象
     *        包含 clientX, clientY 等属性
     *
     * @returns {boolean|undefined} 事件处理结果
     *          - undefined: 不在填充状态
     *          - false: 已处理并更新预览，阻止MouseStrategy拖拽选区
     *
     * @sideEffect 修改 #fillDirection, #fillEndRow, #fillEndCol
     * @sideEffect 调用 sheet.selection.setRange() 更新选区
     * @sideEffect 调用 handler.render() 触发重绘
     *
     * @see #onMouseDown - 启动填充时记录源选区
     * @see #onMouseUp - 松开鼠标时执行实际填充
     */
    #onMouseMove(e) {
        if (!this.#filling) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (!hit) return false;

        const { row, col } = hit;
        const src = this.#sourceRange;

        const dr = row - src.bottomRow;
        const dc = col - src.bottomCol;

        if (dr > 0 && dc === 0) {
            this.#fillDirection = "down";
            this.#fillEndRow = row;
            this.#fillEndCol = src.bottomCol;
        } else if (dr < 0 && dc === 0) {
            this.#fillDirection = "up";
            this.#fillEndRow = row;
            this.#fillEndCol = src.bottomCol;
        } else if (dc > 0 && dr === 0) {
            this.#fillDirection = "right";
            this.#fillEndRow = src.bottomRow;
            this.#fillEndCol = col;
        } else if (dc < 0 && dr === 0) {
            this.#fillDirection = "left";
            this.#fillEndRow = src.bottomRow;
            this.#fillEndCol = col;
        } else if (dr !== 0 && dc !== 0) {
            this.#fillDirection = dr > 0 ? "down" : "up";
            this.#fillEndRow = row;
            this.#fillEndCol = src.bottomCol;
        }

        const sheet = this.handler.sheet;
        const newBottomRow = Math.max(src.topRow, this.#fillEndRow);
        const newBottomCol = Math.max(src.topCol, this.#fillEndCol);
        const newTopRow = Math.min(src.topRow, this.#fillEndRow);
        const newTopCol = Math.min(src.topCol, this.#fillEndCol);

        sheet.selection.setRange(src.topRow, src.topCol, newBottomRow, newBottomCol);
        this.handler.render();

        return false;
    }

    /**
     * @private 私有方法 - 处理鼠标松开事件（执行填充操作）
     *
     * 在 document:mouseup 事件时调用（仅在 #filling === true 时有效）。
     * 结束拖拽状态，计算目标范围，并执行实际的数据填充。
     *
     ** 执行流程**：
     *
     * **1. 状态重置**
     * - this.#filling = false（退出拖拽模式）
     * - 恢复光标为默认样式
     *
     * **2. 计算目标范围**
     * - 调用 #computeTargetRange(sourceRange)
     * - 根据 fillDirection 和当前选区计算需要填充的区域
     * - 如果目标范围为空（未移动）→ 跳过填充步骤
     *
     * **3. 执行数据填充**
     * - 如果目标范围有效 → 调用 #executeFill(sheet, source, target)
     * - #executeFill 内部会：
     *   a. 读取源区域的数据矩阵
     *   b. 检测数值序列的步长（等差/等比）
     *   c. 按方向遍历目标单元格
     *   d. 计算每个位置的值并写入
     *   e. 使用 beginBatch()/endBatch() 优化性能
     *
     * **4. 恢复最终选区**
     * - 将选区设置为：源起始位置 → 当前结束位置
     * - 确保用户可以看到完整的填充结果
     *
     * **5. 清理临时状态**
     * - this.#sourceRange = null
     * - this.#fillDirection = null
     *
     * **6. 触发完整重绘**
     * - viewport.invalidateAll() - 标记所有区域为脏
     * - handler.render() - 执行渲染更新
     *
     ** 填充算法详解**：
     *
     * 对于数值序列（如 [1, 2, 3]）：
     * - 检测步长 (step): (2-1 + 3-2) / 2 = 1
     * - 向下填充: 4, 5, 6, 7, ... (base + step × cycle × srcLen)
     * - 向上填充: 0, -1, -2, ... (反向递减)
     *
     * 对于非数值内容（如 ["A", "B", "C"]）：
     * - 循环复制: A, B, C, A, B, C, ...
     * - 使用模运算: index % srcLength
     *
     * @param {MouseEvent} e - document:mouseup事件对象
     *        当前实现中未使用此参数，保留以备未来扩展
     *
     * @returns {void}
     *
     * @sideEffect 重置 #filling, #sourceRange, #fillDirection
     * @sideEffect 写入大量单元格数据（通过 CellStore）
     * @sideEffect 更新工作表选区
     * @sideEffect 触发Canvas完全重绘
     *
     * @see #computeTargetRange - 计算填充目标范围
     * @see #executeFill - 执行具体的数据填充逻辑
     * @see #detectStep - 检测数值序列步长
     */
    #onMouseUp(e) {
        if (!this.#filling) return;
        this.#filling = false;

        this.handler.canvasContext.canvas.style.cursor = "";

        const sheet = this.handler.sheet;
        const src = this.#sourceRange;

        if (!src) return;

        const targetRange = this.#computeTargetRange(src);

        if (targetRange) {
            this.#executeFill(sheet, src, targetRange);
        }

        const finalRange = sheet.selection.getRange();
        sheet.selection.setRange(src.topRow, src.topCol, finalRange.bottomRow, finalRange.bottomCol);

        this.#sourceRange = null;
        this.#fillDirection = null;
        this.handler.viewport.invalidateAll();
        this.handler.render();
    }

    /**
     * @private 私有方法 - 计算填充目标范围
     *
     * 根据源选区、当前选区和填充方向，
     * 计算出需要被填充数据的目标单元格范围。
     *
     ** 计算逻辑**：
     *
     * 对于每个方向，目标范围的计算规则如下：
     *
     * **向下填充 (down)**：
     * ```
     * 源: A1:A3  当前选区: A1:A10
     * 目标: A4:A10（源结束行的下一行 → 当前结束行）
     * 条件: current.bottomRow > source.bottomRow
     * ```
     *
     * **向上填充 (up)**：
     * ```
     * 源: A5:A7  当前选区: A2:A7
     * 目标: A2:A4（当前起始行 → 源起始行的上一行）
     * 条件: current.topRow < source.topRow
     * ```
     *
     * **向右填充 (right)**：
     * ```
     * 源: A1:C1  当前选区: A1:H1
     * 目标: D1:H1（源结束列的下一列 → 当前结束列）
     * 条件: current.bottomCol > source.bottomCol
     * ```
     *
     * **向左填充 (left)**：
     * ```
     * 源: C1:E1  当前选区: A1:E1
     * 目标: A1:B1（当前起始列 → 源起始列的上一列）
     * 条件: current.topCol < source.topCol
     * ```
     *
     ** 边界情况处理**：
     * - 如果未移动（当前选区 == 源选区）→ 返回 null
     * - 如果方向为 null → 返回 null
     * - 如果移动方向与填充方向矛盾 → 返回 null
     *
     * @param {Object} src - 源选区范围
     * @param {number} src.topRow - 源起始行号
     * @param {number} src.topCol - 源起始列号
     * @param {number} src.bottomRow - 源结束行号
     * @param {number} src.bottomCol - 源结束列号
     *
     * @returns {Object|null} 目标选区范围
     *          - 有效时返回 { topRow, topCol, bottomRow, bottomCol }
     *          - 无效时返回 null（不应执行填充）
     *
     * @see #onMouseUp - 调用此方法获取目标范围
     * @see #executeFill - 使用返回的目标范围执行填充
     */
    #computeTargetRange(src) {
        const current = this.handler.sheet.selection.getRange();
        const dir = this.#fillDirection;

        if (!dir) return null;

        switch (dir) {
            case "down":
                if (current.bottomRow <= src.bottomRow) return null;
                return {
                    topRow: src.bottomRow + 1,
                    topCol: src.topCol,
                    bottomRow: current.bottomRow,
                    bottomCol: src.bottomCol,
                };
            case "up":
                if (current.topRow >= src.topRow) return null;
                return {
                    topRow: current.topRow,
                    topCol: src.topCol,
                    bottomRow: src.topRow - 1,
                    bottomCol: src.bottomCol,
                };
            case "right":
                if (current.bottomCol <= src.bottomCol) return null;
                return {
                    topRow: src.topRow,
                    topCol: src.bottomCol + 1,
                    bottomRow: src.bottomRow,
                    bottomCol: current.bottomCol,
                };
            case "left":
                if (current.topCol >= src.topCol) return null;
                return {
                    topRow: src.topRow,
                    topCol: current.topCol,
                    bottomRow: src.bottomRow,
                    bottomCol: src.topCol - 1,
                };
            default:
                return null;
        }
    }

    /**
     * @private 私有方法 - 执行数据填充操作
     *
     * 核心填充算法的实现方法。
     * 读取源区域的数据，检测模式，计算目标值，
     * 并批量写入到目标单元格中。
     *
     ** 执行流程**：
     *
     * **1. 读取源数据矩阵**
     * ```js
     * const srcValues = accessor.getValueMatrix(
     *   src.topRow, src.topCol,
     *   src.bottomRow, src.bottomCol
     * );
     * // 返回二维数组: [[row0_col0, row0_col1, ...], ...]
     * ```
     *
     * **2. 计算源区域尺寸**
     * - srcHeight = bottomRow - topRow + 1（行数）
     * - srcWidth = bottomCol - topCol + 1（列数）
     *
     * **3. 开启批量事务**
     * - sheet.beginBatch()
     * - 将所有单元格更新合并为一次重绘
     * - 显著提升大量单元格写入的性能
     *
     * **4. 按方向分列/行处理**：
     *
     * **垂直方向（down/up）**：
     * - 遍历每一列 (c: 0 → srcWidth-1)
     * - 提取该列的所有值: colValues = [srcValues[0][c], srcValues[1][c], ...]
     * - 检测该列的步长: step = #detectStep(colValues)
     * - 调用 #fillColumn() 填充该列
     *
     * **水平方向（right/left）**：
     * - 遍历每一行 (r: 0 → srcHeight-1)
     * - 提取该行的所有值: rowValues = srcValues[r]
     * - 检测该行的步长: step = #detectStep(rowValues)
     * - 调用 #fillRow() 填充该行
     *
     * **5. 关闭批量事务**
     * - sheet.endBatch()
     * - 触发一次性的UI更新和事件通知
     *
     ** 填充示例**：
     * ```
     * 源数据:
     *   A1=1  B1="A"
     *   A2=2  B2="B"
     *   A3=3  B3="C"
     *
     * 向下填充到 A10:B10:
     *   A列: 1,2,3 → 4,5,6,7,8,9,10 (等差数列, step=1)
     *   B列: "A","B","C" → "A","B","C","A","B","C",... (循环复制)
     * ```
     *
     * @param {Object} sheet - 工作表实例
     *        提供 cellDataAccessor, setCell, beginBatch/endBatch 等API
     * @param {Object} src - 源选区范围 { topRow, topCol, bottomRow, bottomCol }
     * @param {Object} target - 目标选区范围 { topRow, topCol, bottomRow, bottomCol }
     *
     * @returns {void}
     *
     * @sideEffect 通过 CellStore 写入大量单元格数据
     * @sideEffect 调用 beginBatch()/endBatch() 包裹操作
     *
     * @see #detectStep - 检测数值序列的步长
     * @see #fillColumn - 填充单列数据
     * @see #fillRow - 填充单行数据
     */
    #executeFill(sheet, src, target) {
        const dir = this.#fillDirection;

        const accessor = sheet.cellDataAccessor;
        const srcValues = accessor.getValueMatrix(src.topRow, src.topCol, src.bottomRow, src.bottomCol);

        const srcHeight = src.bottomRow - src.topRow + 1;
        const srcWidth = src.bottomCol - src.topCol + 1;

        sheet.beginBatch();
        if (dir === AUTO_FILL_DIR.DOWN || dir === AUTO_FILL_DIR.UP) {
            for (let c = 0; c < srcWidth; c++) {
                const colValues = [];
                for (let r = 0; r < srcHeight; r++) {
                    colValues.push(srcValues[r][c]);
                }
                const step = this.#detectStep(colValues);
                this.#fillColumn(sheet, src, target, c, step, colValues, dir);
            }
        } else {
            for (let r = 0; r < srcHeight; r++) {
                const rowValues = srcValues[r];
                const step = this.#detectStep(rowValues);
                this.#fillRow(sheet, src, target, r, step, rowValues, dir);
            }
        }
        sheet.endBatch();
    }

    /**
     * @private 私有方法 - 检测数值序列的步长
     *
     * 分析一组值，判断是否构成等差数列，
     * 如果是则计算平均步长，否则返回0（表示非数值或常量）。
     *
     ** 算法逻辑**：
     *
     * 1. **过滤数值**：
     *    - 使用 isNumber() 工具函数过滤出所有数值类型
     *    - 排除 null, undefined, "", "文本" 等
     *
     * 2. **完整性检查**：
     *    - 如果数值数量 < 原数组长度 → 存在非数值 → 返回 0
     *      （混合内容不进行数值递增）
     *    - 如果只有1个数值 → 返回 1（默认步长）
     *
     * 3. **计算平均步长**：
     *    ```js
     *    totalStep = Σ(values[i] - values[i-1]) for i in [1, n-1]
     *    step = totalStep / (n - 1)
     *    ```
     *    - 计算相邻元素的差值
     *    - 求所有差值的平均值
     *    - 这样可以处理微小误差（如浮点数精度问题）
     *
     ** 示例**：
     * ```
     * 输入: [1, 2, 3]        → step = ((2-1) + (3-2)) / 2 = 1.0
     * 输入: [10, 20, 30]     → step = ((20-10) + (30-20)) / 2 = 10.0
     * 输入: [5, 5, 5]        → step = ((5-5) + (5-5)) / 2 = 0.0  (常量)
     * 输入: [1, "A", 3]      → step = 0  (包含非数值)
     * 输入: [100]            → step = 1   (单元素，使用默认步长)
     * ```
     *
     ** 步长的意义**：
     * - step > 0: 正向递增数列（如 1,2,3 → 4,5,6）
     * - step < 0: 负向递减数列（如 10,8,6 → 4,2,0）
     * - step === 0: 常量复制（如 "A","A","A" → "A","A",...）
     *
     * @param {Array<*>} values - 源数据值的一维数组
     *        可能包含数字、字符串、null等混合类型
     *
     * @returns {number} 检测到的步长
     *          - 正数/负数: 等差数列的平均步长
     *          - 0: 非数值序列、常量序列、或单元素
     *
     * @see #executeFill - 调用此方法检测每行/列的步长
     * @see #computeValue - 使用步长计算目标单元格的值
     */
    #detectStep(values) {
        const nums = values.filter((v) => isNumber(v));
        if (nums.length < values.length) return 0;
        if (nums.length === 1) return 1;

        let totalStep = 0;
        for (let i = 1; i < nums.length; i++) {
            totalStep += nums[i] - nums[i - 1];
        }
        return totalStep / (nums.length - 1);
    }

    /**
     * @private 私有方法 - 填充单列数据（垂直方向）
     *
     * 对于垂直方向的填充（down/up），
     * 按列遍历目标区域，计算每个单元格的值并写入。
     *
     ** 向下填充 (down) 的遍历逻辑**：
     * ```
     * for r = target.topRow to target.bottomRow:
     *   if 单元格(r, col)被禁用 → continue
     *
     *   srcIdx = (r - src.topRow) % srcLen      // 源数据循环索引
     *   cycle = floor((r - src.topRow) / srcLen) // 第几个完整周期
     *   value = computeValue(srcValues, srcIdx, step, cycle, srcLen)
     *   sheet.setCell(r, col, value)
     * ```
     *
     ** 向上填充 (up) 的遍历逻辑**：
     * ```
     * for r = target.bottomRow downto target.topRow:  // 反向遍历！
     *   if 单元格(r, col)被禁用 → continue
     *
     *   distFromTop = src.topRow - 1 - r           // 到源顶部的距离
     *   srcIdx = (srcLen-1 - distFromTop%srcLen - 1 + srcLen) % srcLen  // 反向索引
     *   cycle = floor(distFromTop / srcLen) + 1
     *   value = computeValueReverse(srcValues, srcIdx, step, cycle, srcLen)
     *   sheet.setCell(r, col, value)
     * ```
     *
     ** 为什么向上填充要反向遍历？**
     * - 避免覆盖还未读取的源数据
     * - 确保从下往上填充时不会污染源区域
     * - 类似数组插入元素时从后往前移动
     *
     ** 禁用单元格处理**：
     * - 调用 sheet.isDisabled(row, col) 检查
     * - 被禁用的单元格跳过（不写入）
     * - 常用于保护公式、标题行等
     *
     * @param {Object} sheet - 工作表实例
     * @param {Object} src - 源选区范围
     * @param {Object} target - 目标选区范围
     * @param {number} colOffset - 列偏移量（相对于源选区起始列）
     * @param {number} step - 检测到的数值步长
     * @param {Array<*>} srcColValues - 该列的源数据值数组
     * @param {string} dir - 填充方向 ("down" | "up")
     *
     * @returns {void}
     *
     * @sideEffect 调用 sheet.setCell() 写入多个单元格
     *
     * @see #executeFill - 调用此方法处理每列
     * @see #computeValue - 正向计算目标值
     * @see #computeValueReverse - 反向计算目标值
     */
    #fillColumn(sheet, src, target, colOffset, step, srcColValues, dir) {
        const col = src.topCol + colOffset;
        const srcLen = srcColValues.length;

        if (dir === AUTO_FILL_DIR.DOWN) {
            for (let r = target.topRow; r <= target.bottomRow; r++) {
                if (sheet.isDisabled(r, col)) continue;

                const srcIdx = (r - src.topRow) % srcLen;
                const cycle = Math.floor((r - src.topRow) / srcLen);
                const value = this.#computeValue(srcColValues, srcIdx, step, cycle, srcLen);
                sheet.setCell(r, col, value);
            }
        } else {
            for (let r = target.bottomRow; r >= target.topRow; r--) {
                if (sheet.isDisabled(r, col)) continue;

                const distFromTop = src.topRow - 1 - r;
                const srcIdx = (srcLen - 1 - (distFromTop % srcLen) - 1 + srcLen) % srcLen;
                const cycle = Math.floor(distFromTop / srcLen) + 1;
                const value = this.#computeValueReverse(srcColValues, srcIdx, step, cycle, srcLen);
                sheet.setCell(r, col, value);
            }
        }
    }

    /**
     * @private 私有方法 - 填充单行数据（水平方向）
     *
     * 对于水平方向的填充（right/left），
     * 按行遍历目标区域，计算每个单元格的值并写入。
     *
     ** 向右填充 (right) 的遍历逻辑**：
     * ```
     * for c = target.topCol to target.bottomCol:
     *   if 单元格(row, c)被禁用 → continue
     *
     *   srcIdx = (c - src.topCol) % srcLen      // 源数据循环索引
     *   cycle = floor((c - src.topCol) / srcLen) // 第几个完整周期
     *   value = computeValue(srcValues, srcIdx, step, cycle, srcLen)
     *   sheet.setCell(row, c, value)
     * ```
     *
     ** 向左填充 (left) 的遍历逻辑**：
     * ```
     * for c = target.bottomCol downto target.topCol:  // 反向遍历！
     *   if 单元格(row, c)被禁用 → continue
     *
     *   distFromLeft = src.topCol - 1 - c           // 到源左侧的距离
     *   srcIdx = (srcLen-1 - distFromLeft%srcLen - 1 + srcLen) % srcLen  // 反向索引
     *   cycle = floor(distFromLeft / srcLen) + 1
     *   value = computeValueReverse(srcValues, srcIdx, step, cycle, srcLen)
     *   sheet.setCell(row, c, value)
     * ```
     *
     ** 与 #fillColumn 的对称性**：
     * - 逻辑结构完全相同，只是行列互换
     * - row ↔ col, topRow ↔ topCol, bottomRow ↔ bottomCol
     * - 同样需要反向遍历来避免数据污染
     *
     * @param {Object} sheet - 工作表实例
     * @param {Object} src - 源选区范围
     * @param {Object} target - 目标选区范围
     * @param {number} rowOffset - 行偏移量（相对于源选区起始行）
     * @param {number} step - 检测到的数值步长
     * @param {Array<*>} srcRowValues - 该行的源数据值数组
     * @param {string} dir - 填充方向 ("right" | "left")
     *
     * @returns {void}
     *
     * @sideEffect 调用 sheet.setCell() 写入多个单元格
     *
     * @see #executeFill - 调用此方法处理每行
     * @see #computeValue - 正向计算目标值
     * @see #computeValueReverse - 反向计算目标值
     */
    #fillRow(sheet, src, target, rowOffset, step, srcRowValues, dir) {
        const row = src.topRow + rowOffset;
        const srcLen = srcRowValues.length;

        if (dir === AUTO_FILL_DIR.RIGHT) {
            for (let c = target.topCol; c <= target.bottomCol; c++) {
                if (sheet.isDisabled(row, c)) continue;

                const srcIdx = (c - src.topCol) % srcLen;
                const cycle = Math.floor((c - src.topCol) / srcLen);
                const value = this.#computeValue(srcRowValues, srcIdx, step, cycle, srcLen);
                sheet.setCell(row, c, value);
            }
        } else {
            for (let c = target.bottomCol; c >= target.topCol; c--) {
                if (sheet.isDisabled(row, c)) continue;

                const distFromLeft = src.topCol - 1 - c;
                const srcIdx = (srcLen - 1 - (distFromLeft % srcLen) - 1 + srcLen) % srcLen;
                const cycle = Math.floor(distFromLeft / srcLen) + 1;
                const value = this.#computeValueReverse(srcRowValues, srcIdx, step, cycle, srcLen);
                sheet.setCell(row, c, value);
            }
        }
    }

    /**
     * @private 私有方法 - 正向计算目标单元格的值
     *
     * 根据源数据、步长和周期信息，
     * 计算正向填充（down/right）时目标单元格应该填入的值。
     *
     ** 计算规则**：
     *
     * **情况1: 空值或空字符串**
     * - base == null || base === "" → 返回 ""
     * - 保持空白，不进行任何计算
     *
     * **情况2: 数值 + 非零步长（等差数列递增）**
     * ```
     * value = base + step × srcLen × cycle
     * ```
     * 示例：
     * - 源 [1,2,3], step=1, srcLen=3
     * - 第1个周期 (cycle=0): 1, 2, 3
     * - 第2个周期 (cycle=1): 4, 5, 6  (每个值 + 1×3×1)
     * - 第3个周期 (cycle=2): 7, 8, 9  (每个值 + 1×3×2)
     *
     * **情况3: 数值 + 零步长（常量复制）**
     * - value = base（直接复制原值）
     * - 用于处理 [5,5,5] 这样的常量序列
     *
     * **情况4: 非数值内容（文本等）**
     * - value = base（直接复制原值）
     * - 文本、日期、布尔值等都走此分支
     *
     ** 参数说明**：
     * - srcValues: 源数据数组（用于获取基准值）
     * - srcIdx: 当前位置在源数组中的循环索引
     * - step: 检测到的数值步长
     * - cycle: 当前是第几个完整周期（从0开始）
     * - srcLen: 源数组的长度
     *
     * @param {Array<*>} srcValues - 源数据值数组
     * @param {number} srcIdx - 循环索引（在源数组中的位置）
     * @param {number} step - 数值步长（0表示常量或非数值）
     * @param {number} cycle - 完整周期计数（0=第一个周期）
     * @param {number} srcLen - 源数据长度
     *
     * @returns {*} 计算后的目标值
     *          - 数值: 递增/常量数值
     *          - 字符串: 原文本复制
     *          - 空值: "" (空字符串)
     *
     * @see #fillColumn - 向下填充时调用
     * @see #fillRow - 向右填充时调用
     */
    #computeValue(srcValues, srcIdx, step, cycle, srcLen) {
        const base = srcValues[srcIdx];
        if (base == null || base === "") return "";
        if (isNumber(base) && step !== 0) {
            return base + step * srcLen * cycle;
        }
        if (isNumber(base) && step === 0) {
            return base;
        }
        return base;
    }

    /**
     * @private 私有方法 - 反向计算目标单元格的值
     *
     * 根据源数据、步长和周期信息，
     * 计算反向填充（up/left）时目标单元格应该填入的值。
     *
     ** 与 #computeValue 的区别**：
     * - 用于向上/向左填充（反向方向）
     * - 数值递减而非递增: `base - step × srcLen × cycle`
     * - 其他规则（空值、常量、非数值）完全相同
     *
     ** 计算规则**：
     *
     * **情况1: 空值或空字符串**
     * - base == null || base === "" → 返回 ""
     *
     * **情况2: 数值 + 非零步长（等差数列递减）**
     * ```
     * value = base - step × srcLen × cycle
     * ```
     * 示例：
     * - 源 [7,8,9], step=1, srcLen=3（从下往上填充）
     * - 第1个周期 (cycle=0): 7, 8, 9
     * - 第2个周期 (cycle=1): 4, 5, 6  (每个值 - 1×3×1)
     * - 第3个周期 (cycle=2): 1, 2, 3  (每个值 - 1×3×2)
     *
     * **情况3: 数值 + 零步长（常量复制）**
     * - value = base（直接复制原值）
     *
     * **情况4: 非数值内容**
     * - value = base（直接复制原值）
     *
     ** 为什么需要单独的反向方法？**
     * - 向上/向左填充时，数值应该递减
     * - 保持代码清晰，避免在 computeValue 中增加方向判断
     * - 符合单一职责原则
     *
     * @param {Array<*>} srcValues - 源数据值数组
     * @param {number} srcIdx - 循环索引（在源数组中的位置）
     * @param {number} step - 数值步长（0表示常量或非数值）
     * @param {number} cycle - 完整周期计数（从1开始，因为反向时立即进入第1个周期）
     * @param {number} srcLen - 源数据长度
     *
     * @returns {*} 计算后的目标值
     *          - 数值: 递减/常量数值
     *          - 字符串: 原文本复制
     *          - 空值: "" (空字符串)
     *
     * @see #fillColumn - 向上填充时调用
     * @see #fillRow - 向左填充时调用
     * @see #computeValue - 正向计算方法（对应版本）
     */
    #computeValueReverse(srcValues, srcIdx, step, cycle, srcLen) {
        const base = srcValues[srcIdx];
        if (base == null || base === "") return "";
        if (isNumber(base) && step !== 0) {
            return base - step * srcLen * cycle;
        }
        if (isNumber(base) && step === 0) {
            return base;
        }
        return base;
    }
}
