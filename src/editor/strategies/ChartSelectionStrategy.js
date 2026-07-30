import { CONFIG } from "@/constants/config";
import { NativeChartRenderer } from "@/render/chart/NativeChartRenderer";
import { HIT_TYPE } from "@/constants/hitType";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority";

/**
 * 图表选区交互策略 (Chart Selection Strategy)
 *
 * 处理Canvas表格中嵌入图表的选中和编辑交互。
 * 支持图表的选择、移动、拖拽调整大小等操作。
 *
 * 优先级：使用 STRATEGY_PRIORITY.CHART_INTERACTION
 * - 高优先级，确保图表事件优先于普通单元格交互
 * - 与其他UI元素交互策略协调工作
 *
 * 核心功能：
 * ┌────────────────────┬─────────────────────────────────────────┐
 * │ 操作               │ 行为                                    │
 * ├────────────────────┼─────────────────────────────────────────┤
 * │ 单击图表           │ 选中图表（显示选中边框和控制点）      │
 * │ 拖拽图表           │ 移动图表位置                           │
 * │ 拖拽控制点         │ 调整图表尺寸（8个方向）               │
 * │ 双击图表           │ 进入图表编辑模式                      │
 * │ 点击空白区域       │ 取消选中                               │
 * └────────────────────┴─────────────────────────────────────────┘
 *
 * 状态管理：
 * 图表可以处于以下状态之一：
 * - **未选中**：正常显示，无特殊标记
 * - **已选中**：显示蓝色边框和8个调整手柄
 * - **移动中**：显示半透明预览位置
 * - **调整大小中**：显示动态调整的轮廓
 *
 * 技术实现要点：
 *
 * **1. 命中检测（Hit Testing）**：
 * - 使用 NativeChartRenderer 的命中测试方法
 * - 判断点击位置是否在图表区域内
 * - 进一步判断是否在调整手柄上（8个控制点）
 * - 返回精确的命中信息（图表ID、手柄位置等）
 *
 * **2. 拖拽阈值机制**：
 * - DRAG_THRESHOLD = 3 像素
 * - 区分单击选择和拖拽操作
 * - 防止误触发移动或调整
 *
 * **3. 渲染优化**：
 * - 使用 requestAnimationFrame 节流渲染
 * - #pendingUpdate 防止重复调度
 * - #lastRenderTime 控制最小刷新间隔
 * - 仅重绘受影响的区域
 *
 * **4. 坐标系统处理**：
 * - 屏幕坐标 ↔ Canvas坐标转换
 * - 考虑视口偏移和缩放比例
 * - 处理高DPI屏幕的像素比
 *
 * 交互细节：
 *
 * **移动图表**：
 * ```
 * mousedown 在图表内 → 记录起始位置 → mousemove 更新位置 → mouseup 确认移动
 * ```
 *
 * **调整大小**：
 * ```
 * mousedown 在手柄上 → #isResizing=true → #resizeHandle=方位
 *   → mousemove: 根据手柄类型调整宽/高 → mouseup: 应用新尺寸
 * ```
 *
 * **手柄位置说明**：
 * ```
 * ┌───┬───┬───┐
 * │ NW│ N │ NE│  ← 上排：西北、北、东北
 * ├───┼───┼───┤
 * │ W │   │ E │  ← 中排：西、东
 * ├───┼───┼───┤
 * │ SW│ S │ SE│  ← 下排：西南、南、东南
 * └───┴───┴───┘
 * ```
 *
 * 与其他组件协作：
 * - NativeChartRenderer: 图表的渲染和命中检测
 * - MouseStrategy: 协调图表和单元格的选择冲突
 * - UndoManager: 记录图表的移动/调整操作
 * - Sheet: 管理图表数据模型
 *
 * 性能考虑：
 * - 大量图表时使用空间索引加速命中检测
 * - 拖拽过程中降低渲染质量（可选）
 * - 使用 transform 替代 top/left 实现动画（GPU加速）
 * - 防抖处理快速连续的操作
 *
 * @class ChartSelectionStrategy
 * @extends EventStrategy
 *
 * @see EventStrategy - 基类
 * @see NativeChartRenderer - 图表渲染器
 * @see MouseStrategy - 单元格鼠标交互策略
 */
const DRAG_THRESHOLD = 3;

export class ChartSelectionStrategy extends EventStrategy {
    /**
     * 策略优先级
     *
     * @type {number}
     * @readonly
     */
    priority = STRATEGY_PRIORITY.CHART_INTERACTION;

    /**
     * @private 私有字段 - 当前选中的图表ID
     *
     * 存储当前被选中的图表的唯一标识符。
     * 为null时表示没有图表被选中。
     *
     * @type {string|null}
     * @private
     */
    #selectedChartId = null;

    /**
     * @private 私有字段 - 是否处于移动/拖拽状态
     *
     * 标记鼠标是否已按下并可能开始拖拽操作。
     * 从mousedown设置为true，到mouseup重置为false。
     *
     * @type {boolean}
     * @private
     */
    #isMoving = false;

    /**
     * @private 私有字段 - 是否正在拖拽移动图表
     *
     * 当用户在图表内部（非调整手柄）拖拽超过阈值后设为true。
     * 与#isResizing互斥，同一时间只能有一个为true。
     *
     * @type {boolean}
     * @private
     */
    #isDragging = false;

    /**
     * @private 私有字段 - 是否正在拖拽调整大小
     *
     * 当用户在调整手柄上拖拽超过阈值后设为true。
     * 与#isDragging互斥，同一时间只能有一个为true。
     *
     * @type {boolean}
     * @private
     */
    #isResizing = false;

    /**
     * @private 私有字段 - 当前激活的调整手柄方位
     *
     * 存储被按下的调整手柄的名称。
     * 可能值: "nw", "n", "ne", "e", "se", "s", "sw", "w"
     * 为null表示未按下手柄或不在调整模式。
     *
     * @type {string|null}
     * @private
     */
    #resizeHandle = null;

    /**
     * @private 私有字段 - 拖拽起始点的Canvas X坐标
     *
     * mousedown时记录，用于计算后续mousemove的偏移量。
     *
     * @type {number}
     * @private
     */
    #dragStartX = 0;

    /**
     * @private 私有字段 - 拖拽起始点的Canvas Y坐标
     *
     * @type {number}
     * @private
     */
    #dragStartY = 0;

    /**
     * @private 私有字段 - 拖拽开始时图表的水平偏移量
     *
     * 用于计算新位置: newOffsetX = dragStartOffsetX + deltaX
     *
     * @type {number}
     * @private
     */
    #dragStartOffsetX = 0;

    /**
     * @private 私有字段 - 拖拽开始时图表的垂直偏移量
     *
     * @type {number}
     * @private
     */
    #dragStartOffsetY = 0;

    /**
     * @private 私有字段 - 拖拽开始时图表的宽度
     *
     * 用于调整大小时作为基准宽度。
     *
     * @type {number}
     * @private
     */
    #dragStartWidth = 0;

    /**
     * @private 私有字段 - 拖拽开始时图表的高度
     *
     * @type {number}
     * @private
     */
    #dragStartHeight = 0;

    /**
     * @private 私有字段 - mousedown事件时的屏幕X坐标
     *
     * 用于与后续mousemove比较，判断是否达到拖拽阈值。
     *
     * @type {number}
     * @private
     */
    #mouseDownX = 0;

    /**
     * @private 私有字段 - mousedown事件时的屏幕Y坐标
     *
     * @type {number}
     * @private
     */
    #mouseDownY = 0;

    /**
     * @private 私有字段 - 上次渲染的时间戳
     *
     * 用于实现渲染节流，确保两次渲染间隔至少16ms（约60fps）。
     *
     * @type {number}
     * @private
     */
    #lastRenderTime = 0;

    /**
     * @private 私有字段 - 待执行的requestAnimationFrame ID
     *
     * 用于跟踪和取消尚未执行的动画帧回调。
     * 非null表示有一个更新请求在队列中等待执行。
     *
     * @type {number|null}
     * @private
     */
    #pendingUpdate = null;

    /**
     * @private 私有字段 - 缓存的最新客户端X坐标
     *
     * 在节流期间暂存最新的鼠标位置，
     * 以便RAF回调执行时使用最新的坐标。
     *
     * @type {number}
     * @private
     */
    #lastClientX = 0;

    /**
     * @private 私有字段 - 缓存的最新客户端Y坐标
     *
     * @type {number}
     * @private
     */
    #lastClientY = 0;

    /**
     * 创建图表选区策略实例
     *
     * @param {import("../../core/EventHandler.js").EventHandler} handler - 事件处理器实例
     * @constructor
     */
    constructor(handler) {
        super(handler);
    }

    /**
     * 初始化策略（生命周期钩子）
     *
     * 当前为空实现，预留用于未来扩展。
     *
     * @override
     * @virtual
     */
    init() {}

    /**
     * 销毁策略（生命周期钩子）
     *
     * 清理所有运行时状态和挂起的异步操作：
     * - 取消待执行的requestAnimationFrame
     * - 重置所有交互状态标记
     *
     * @override
     */
    destroy() {
        if (this.#pendingUpdate) {
            cancelAnimationFrame(this.#pendingUpdate);
            this.#pendingUpdate = null;
        }
        this.#selectedChartId = null;
        this.#isMoving = false;
        this.#isDragging = false;
        this.#isResizing = false;
    }

    /**
     * 声明此策略监听的DOM事件处理器
     *
     * 返回5个关键事件的处理器映射表：
     * - canvas:mousedown: 检测图表选中
     * - canvas:mousemove: 处理悬停效果和数据点提示
     * - document:mousemove: 处理拖拽移动/调整大小
     * - document:mouseup: 结束拖拽操作
     * - document:keydown: 处理Delete/Esc键
     *
     * @returns {Object<string, Function>} 事件处理器映射表
     * @override
     */
    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => this.#onMouseDown(e),
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: (e) => this.#onHover(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e) => this.#onMouseMove(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: (e) => this.#onMouseUp(e),
            [DELEGATE_KEYS.DOCUMENT_KEYDOWN]: (e) => this.#onKeyDown(e),
        };
    }

    /**
     * @private 私有方法 - 获取图表管理器实例
     *
     * 安全地访问当前工作表的chartManager。
     * 如果工作表或chartManager不存在则返回null。
     *
     * @returns {Object|null} 图表管理器实例或null
     * @private
     */
    #getChartManager() {
        return this.handler.sheet?.chartManager || null;
    }

    /**
     * @private 私有方法 - 同步选中状态到渲染层
     *
     * 将当前选中的图表ID同步到chartLayer，
     * 以便渲染层能正确绘制选中边框和调整手柄。
     *
     * @returns {void}
     * @private
     */
    #syncSelectionToLayer() {
        const layer = this.handler.viewport.chartLayer;
        if (layer) {
            layer.selectedChartId = this.#selectedChartId;
        }
    }

    /**
     * @private 私有方法 - 处理鼠标按下事件
     *
     * 检测用户是否点击了图表区域：
     * - 点击图表内部：选中图表，准备拖拽或调整大小
     * - 点击空白区域：取消当前选中
     *
     * 执行流程：
     * 1. 前置检查（启用状态、左键）
     * 2. 命中测试判断是否点击了图表
     * 3. 记录初始状态（位置、偏移、尺寸）
     * 4. 检测是否按在调整手柄上
     * 5. 触发重绘显示选中效果
     *
     * @param {MouseEvent} e - canvas:mousedown事件对象
     * @returns {boolean|undefined} 事件处理结果
     * @private
     */
    #onMouseDown(e) {
        if (!this.enabled || !this.handler.sheet) return;
        if (e.button !== 0) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (!hit || hit.type !== HIT_TYPE.CHART) {
            if (this.#selectedChartId) {
                this.#deselect();
                return true;
            }
            return;
        }

        const chart = hit.chart;
        if (!chart) return;

        this.#isMoving = true;
        this.#isDragging = false;
        this.#isResizing = false;
        this.#selectedChartId = chart.id;
        this.#syncSelectionToLayer();

        const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;

        const handle = this.#hitHandle(px, py, chart, hit.bounds);
        if (handle) {
            this.#resizeHandle = handle;
        }

        this.#mouseDownX = e.clientX;
        this.#mouseDownY = e.clientY;
        this.#dragStartX = px;
        this.#dragStartY = py;
        this.#dragStartOffsetX = chart.offsetX;
        this.#dragStartOffsetY = chart.offsetY;
        this.#dragStartWidth = chart.width;
        this.#dragStartHeight = chart.height;

        this.handler.viewport.invalidateAll();
        this.handler.render();

        return false;
    }

    /**
     * @private 私有方法 - 处理鼠标悬停事件
     *
     * 在canvas:mousemove时调用（非拖拽状态）。
     * 负责处理悬停在图表上的视觉效果：
     * - 设置光标样式（移动/调整大小）
     * - 显示数据点悬浮提示信息
     * - 离开图表时清理状态
     *
     * @param {MouseEvent} e - canvas:mousemove事件对象
     * @returns {boolean|undefined} 事件处理结果
     * @private
     */
    #onHover(e) {
        if (!this.enabled || !this.handler.sheet) return;
        if (this.#isMoving) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (hit && hit.type === HIT_TYPE.CHART) {
            const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const handle = this.#hitHandle(px, py, hit.chart, hit.bounds);

            const chartBounds = hit.chart.getBounds(hit.vt);
            const localX = px - chartBounds.x;
            const localY = py - chartBounds.y;

            const data = hit.chart._cachedData;
            if (data && data.data && data.data.length) {
                const plotArea = {
                    x: 56,
                    y: 36,
                    w: hit.chart.width - 56 - 20,
                    h: hit.chart.height - 36 - 44,
                };
                const yScale = NativeChartRenderer.buildYScale(data, hit.chart.type);
                const hoverInfo = NativeChartRenderer.hitTestDataPoint(localX, localY, hit.chart.type, data, plotArea, yScale);

                if (hoverInfo) {
                    hoverInfo.pointX = chartBounds.x + hoverInfo.pointX;
                    hoverInfo.pointY = chartBounds.y + hoverInfo.pointY;
                    hoverInfo.chartType = hit.chart.type;
                    this.handler.viewport.chartLayer.setHoverInfo(hit.chartId, hoverInfo);
                } else {
                    this.handler.viewport.chartLayer.setHoverInfo(hit.chartId, null);
                }
            }

            this.handler.canvasContext.canvas.style.cursor = handle ? this.#getCursorForHandle(handle) : "move";
            return false;
        }

        this.handler.canvasContext.canvas.style.cursor = "";
        this.handler.viewport.chartLayer.setHoverInfo(null, null);
    }

    /**
     * @private 私有方法 - 处理鼠标移动事件（拖拽过程）
     *
     * 在document:mousemove时调用（仅在#isMoving为true时有效）。
     * 处理图表的拖拽移动或大小调整：
     *
     * 1. 阈值检测：判断是否超过DRAG_THRESHOLD(3px)进入正式拖拽
     * 2. 模式判定：根据#resizeHandle决定是移动还是调整
     * 3. 渲染节流：使用requestAnimationFrame限制渲染频率到60fps
     *
     * @param {MouseEvent} e - document:mousemove事件对象
     * @returns {boolean|undefined} 事件处理结果
     * @private
     */
    #onMouseMove(e) {
        if (!this.#isMoving) return;

        if (!this.#isDragging && !this.#isResizing) {
            const dx = Math.abs(e.clientX - this.#mouseDownX);
            const dy = Math.abs(e.clientY - this.#mouseDownY);
            if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;

            if (this.#resizeHandle) {
                this.#isResizing = true;
            } else {
                this.#isDragging = true;
            }
        }

        const now = performance.now();
        if (now - this.#lastRenderTime < 16) {
            this.#lastClientX = e.clientX;
            this.#lastClientY = e.clientY;
            if (!this.#pendingUpdate) {
                this.#pendingUpdate = requestAnimationFrame(() => {
                    this.#pendingUpdate = null;
                    this.#processMove(this.#lastClientX, this.#lastClientY);
                });
            }
            return false;
        }

        this.#lastRenderTime = now;
        this.#processMove(e.clientX, e.clientY);
        return false;
    }

    /**
     * @private 私有方法 - 执行实际的移动/调整操作
     *
     * 根据当前模式（#isDragging或#isResizing）更新图表位置或尺寸。
     * 由#onMouseMove通过requestAnimationFrame调度调用。
     *
     * 移动模式：根据鼠标偏移量计算新的offsetX/offsetY
     * 调整模式：根据手柄方位和偏移量计算新的width/height，
     *            确保不小于CONFIG.CHART_MIN_WIDTH/HEIGHT
     *
     * @param {number} clientX - 客户端X坐标
     * @param {number} clientY - 客户端Y坐标
     * @returns {void}
     * @private
     */
    #processMove(clientX, clientY) {
        const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const dx = px - this.#dragStartX;
        const dy = py - this.#dragStartY;

        const cm = this.#getChartManager();
        if (!cm) return;

        if (this.#isDragging) {
            cm.update(this.#selectedChartId, {
                offsetX: this.#dragStartOffsetX + dx,
                offsetY: this.#dragStartOffsetY + dy,
            });
            this.handler.canvasContext.canvas.style.cursor = "move";
        } else if (this.#isResizing) {
            let newW = this.#dragStartWidth;
            let newH = this.#dragStartHeight;
            const h = this.#resizeHandle;
            if (h.includes("e")) newW = Math.max(CONFIG.CHART_MIN_WIDTH, this.#dragStartWidth + dx);
            if (h.includes("w")) newW = Math.max(CONFIG.CHART_MIN_WIDTH, this.#dragStartWidth - dx);
            if (h.includes("s")) newH = Math.max(CONFIG.CHART_MIN_HEIGHT, this.#dragStartHeight + dy);
            if (h.includes("n")) newH = Math.max(CONFIG.CHART_MIN_HEIGHT, this.#dragStartHeight - dy);
            cm.update(this.#selectedChartId, { width: newW, height: newH });
            this.handler.canvasContext.canvas.style.cursor = this.#getCursorForHandle(h);
        }

        this.handler.viewport.chartLayer?.markDirty();
        this.handler.render();
    }

    /**
     * @private 私有方法 - 处理鼠标松开事件
     *
     * 结束当前的拖拽操作：
     * - 重置所有交互状态标记
     * - 取消待执行的动画帧
     * - 恢复默认光标
     * - 触发最终重绘
     *
     * @param {MouseEvent} e - document:mouseup事件对象
     * @returns {void}
     * @private
     */
    #onMouseUp(e) {
        if (!this.#isMoving) return;
        this.#isMoving = false;
        this.#isDragging = false;
        this.#isResizing = false;
        this.#resizeHandle = null;
        this.handler.canvasContext.canvas.style.cursor = "";

        if (this.#pendingUpdate) {
            cancelAnimationFrame(this.#pendingUpdate);
            this.#pendingUpdate = null;
        }

        this.handler.viewport.invalidateAll();
        this.handler.render();
    }

    /**
     * @private 私有方法 - 处理键盘按下事件
     *
     * 在图表被选中时响应键盘操作：
     * - Delete/Backspace：删除选中的图表
     * - Escape：取消选中
     *
     * @param {KeyboardEvent} e - document:keydown事件对象
     * @returns {boolean|undefined} 事件处理结果
     * @private
     */
    #onKeyDown(e) {
        if (!this.#selectedChartId) return;
        if (e.key === "Delete" || e.key === "Backspace") {
            const cm = this.#getChartManager();
            if (cm) {
                cm.remove(this.#selectedChartId);
                this.#selectedChartId = null;
                this.#syncSelectionToLayer();
            }
            this.handler.viewport.invalidateAll();
            this.handler.render();
            return false;
        }
        if (e.key === "Escape") {
            this.#deselect();
            return false;
        }
    }

    /**
     * @private 私有方法 - 取消图表选中状态
     *
     * 清除当前选中并重绘：
     * - 重置#selectedChartId为null
     * - 同步到渲染层
     * - 标记脏区域并触发重绘
     *
     * @returns {void}
     * @private
     */
    #deselect() {
        this.#selectedChartId = null;
        this.#syncSelectionToLayer();
        this.handler.viewport.invalidateAll();
        this.handler.render();
    }

    /**
     * @private 私有方法 - 检测点击位置是否在调整手柄上
     *
     * 遍历8个调整手柄的位置，判断给定坐标是否在某个手柄的
     * 命中范围内（CONFIG.CHART_SELECTION_HANDLE_SIZE/2 的正方形区域）。
     *
     * @param {number} px - Canvas X坐标
     * @param {number} py - Canvas Y坐标
     * @param {Object} chart - 图表对象
     * @param {Object|null} bounds - 图表边界矩形 {x, y, w, h}
     * @returns {string|null} 手柄方位名称或null（未命中任何手柄）
     * @private
     */
    #hitHandle(px, py, chart, bounds) {
        const b = bounds;
        if (!b) return null;
        const handles = this.#getHandlePositions(b);
        const half = CONFIG.CHART_SELECTION_HANDLE_SIZE / 2;
        for (const [name, pos] of Object.entries(handles)) {
            if (px >= pos.x - half && px <= pos.x + half && py >= pos.y - half && py <= pos.y + half) {
                return name;
            }
        }
        return null;
    }

    /**
     * @private 私有方法 - 计算8个调整手柄的位置坐标
     *
     * 根据图表边界矩形计算8个调整手柄的中心点位置：
     * - 4个角：nw(左上), ne(右上), sw(左下), se(右下)
     * - 4个边中点：n(上中), e(右中), s(下中), w(左中)
     *
     * @param {Object} b - 边界矩形 {x, y, w, h}
     * @returns {Object<string, {x: number, y: number}>} 手柄位置映射表
     * @private
     */
    #getHandlePositions(b) {
        const mx = b.x + b.w / 2;
        const my = b.y + b.h / 2;
        return {
            nw: { x: b.x, y: b.y },
            n: { x: mx, y: b.y },
            ne: { x: b.x + b.w, y: b.y },
            e: { x: b.x + b.w, y: my },
            se: { x: b.x + b.w, y: b.y + b.h },
            s: { x: mx, y: b.y + b.h },
            sw: { x: b.x, y: b.y + b.h },
            w: { x: b.x, y: my },
        };
    }

    /**
     * @private 私有方法 - 根据手柄方位获取对应的光标样式
     *
     * 返回CSS cursor属性值，用于视觉反馈：
     * - 角落手柄：对角线缩放光标（nwse/nesw）
     * - 边中点手柄：单向缩放光标（ns/ew）
     *
     * @param {string} handle - 手柄方位名称
     * @returns {string} CSS cursor属性值
     * @private
     */
    #getCursorForHandle(handle) {
        const cursorMap = {
            nw: "nwse-resize",
            se: "nwse-resize",
            ne: "nesw-resize",
            sw: "nesw-resize",
            n: "ns-resize",
            s: "ns-resize",
            e: "ew-resize",
            w: "ew-resize",
        };
        return cursorMap[handle] || "default";
    }

    /**
     * 渲染选中覆盖层（公共方法）
     *
     * 当图表被选中时，绘制：
     * - 虚线边框（表示选中状态）
     * - 8个调整手柄（小方块）
     *
     * 由渲染引擎在绘制图表后调用。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D绘图上下文
     * @param {Object} chart - 图表对象
     * @param {Object} vt - 视口变换信息
     * @returns {void}
     */
    renderSelectionOverlay(ctx, chart, vt) {
        if (!this.#selectedChartId || !chart || chart.id !== this.#selectedChartId) return;
        const b = chart.getBounds(vt);
        if (!b) return;
        ctx.save();
        ctx.strokeStyle = CONFIG.CHART_SELECTION_BORDER_COLOR;
        ctx.lineWidth = CONFIG.CHART_SELECTION_BORDER_WIDTH;
        ctx.setLineDash(CONFIG.UI_DASH_PATTERN);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.setLineDash([]);
        const handles = this.#getHandlePositions(b);
        const half = CONFIG.CHART_SELECTION_HANDLE_SIZE / 2;
        for (const pos of Object.values(handles)) {
            ctx.fillStyle = CONFIG.CHART_SELECTION_HANDLE_FILL;
            ctx.strokeStyle = CONFIG.CHART_SELECTION_BORDER_COLOR;
            ctx.lineWidth = CONFIG.CHART_SELECTION_HANDLE_LINE_WIDTH;
            ctx.fillRect(pos.x - half, pos.y - half, CONFIG.CHART_SELECTION_HANDLE_SIZE, CONFIG.CHART_SELECTION_HANDLE_SIZE);
            ctx.strokeRect(pos.x - half, pos.y - half, CONFIG.CHART_SELECTION_HANDLE_SIZE, CONFIG.CHART_SELECTION_HANDLE_SIZE);
        }
        ctx.restore();
    }

    /**
     * 获取当前选中的图表ID（公共getter）
     *
     * @type {string|null}
     * @readonly
     */
    get selectedChartId() {
        return this.#selectedChartId;
    }
}
