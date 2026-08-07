import {errorHandler } from "../../core/ErrorHandler.js";
import { debounce, isFunction } from "../../utils/helper.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";
import { EventStrategy } from "./EventStrategy.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import {ERROR_CODE} from "../../constants/errorCodes.js";

/**
 * 交互式单元格策略 (Interactive Cell Strategy)
 *
 * 处理Canvas表格中特殊类型单元格（如按钮、链接、复选框等）的交互行为。
 * 将原有的 InteractionPlugin 重构为 EventStrategy，集成到统一的事件委托系统中。
 *
 * 优先级：400（STRATEGY_PRIORITY.CELL_TYPE_INTERACTION）
 * - **高于** MOUSE_DEFAULT (300): 需要拦截交互式单元格的鼠标事件
 * - **低于** POPUP_UI (500): 筛选器等弹出式UI优先级更高
 * - **与图表策略无冲突**: CHART_INTERACTION (800) 处理不同区域
 *
 * 核心功能：
 * ┌────────────────────┬─────────────────────────────────────────┐
 * │ 功能               │ 说明                                    │
 * ├────────────────────┼─────────────────────────────────────────┤
 * │ 悬停检测           │ 跟踪鼠标位置，识别交互式单元格         │
 * │ 点击处理           │ 触发单元格的点击回调（防抖200ms）      │
 * │ 双击支持           │ 区分单击和双击操作                      │
 * │ 合并单元格处理     │ 正确处理合并区域的悬停和点击            │
 * │ 渲染优化           │ requestAnimationFrame + setTimeout降级   │
 * └────────────────────┴─────────────────────────────────────────┘
 *
 * 设计背景（重构原因）：
 *
 * **原有问题**：
 * - InteractionPlugin 作为 BasePlugin 直接监听DOM事件
 * - 与 ChartSelectionStrategy、MouseStrategy 等产生事件冲突
 * - 难以控制事件的执行顺序和优先级
 * - 事件处理逻辑分散，难以维护
 *
 * **重构方案**：
 * ```
 * Before: BasePlugin → 直接addEventListener()
 * After:  EventStrategy → getEventHandlers() → EventHandler统一分发
 * ```
 *
 * **重构优势**：
 * ✅ 统一的事件生命周期管理
 * ✅ 明确的优先级控制
 * ✅ 避免事件监听器冲突
 * ✅ 支持启用/禁用切换
 * ✅ 更好的测试性和可维护性
 *
 * 技术实现细节：
 *
 * **1. 悬停状态跟踪**：
 * ```js
 * #lastHoveredCell = "row,col"  // 缓存上次悬停位置
 * ```
 * - 使用字符串 "row,col" 格式缓存，避免对象创建开销
 * - 每次mousemove时比较当前位置与缓存
 * - 仅在变化时触发更新和重绘
 *
 * **2. 点击防抖机制**：
 * ```js
 * #debouncedHandleClick = debounce(callback, 200)
 * ```
 * - 200ms延迟区分单击和双击
 * - 双击触发时调用 cancel() 取消待执行的单击
 * - 类似 MouseStrategy 的实现方式
 *
 * **3. 合并单元格处理**：
 * - hitTest 返回合并区域的左上角坐标
 * - 需要将坐标映射到实际的可见单元格
 * - 确保整个合并区域响应交互
 * - 避免重复触发（同一合并区域只处理一次）
 *
 * **4. 渲染性能优化**：
 * ```
 * 主路径: requestAnimationFrame (#rafId)
 * 降级:   setTimeout (#timeoutId)  // RAF不可用时
 * 合并:   #pendingRender 防止重复调度
 * ```
 * - 优先使用RAF实现60fps流畅动画
 * - RAF不支持时自动降级到setTimeout(16ms)
 * - 使用pendingRender标记避免重复调度
 * - 批量处理多个连续的状态变化
 *
 * 支持的交互式单元格类型：
 * - **按钮（Button）**: 点击触发动作
 * - **超链接（Link）**: 点击打开URL
 * - **复选框（Checkbox）**: 切换选中状态
 * - **下拉选择（Dropdown）**: 展开选项列表
 * - **日期选择器（DatePicker）**: 显示日历控件
 * - **自定义组件**: 通过插件扩展的其他类型
 *
 * 与其他策略的协作关系：
 * ┌─────────────────────┬──────────┬───────────┬────────────────┐
 * │ 策略                 │ 优先级   │ 处理区域  │ 关系            │
 * ├─────────────────────┼──────────┼───────────┼────────────────┤
 * │ ChartSelection       │ 800      │ 图表区域  │ 无冲突        │
 * │ InteractionStrategy  │ 400      │ 交互单元格│ 可能重叠       │
 * │ MouseStrategy        │ 300      │ 所有单元格│ 低优先级       │
 * │ ContextMenuStrategy  │ 0        │ 右键菜单  │ 无冲突        │
 * └─────────────────────┴──────────┴───────────┴────────────────┘
 *
 * 当交互式单元格被点击时：
 * 1. 此策略拦截事件（优先级400 > 300）
 * 2. 执行单元格的自定义回调
 * 3. 返回 false 阻止后续 MouseStrategy 处理
 * 4. 如果不是交互式单元格，透传给后续策略
 *
 * 错误处理：
 * - 使用全局 errorHandler 记录异常
 * - 错误码: ERROR_CODE 相关常量
 * - 不中断其他策略的正常工作
 * - 提供详细的错误上下文信息
 *
 * @class InteractionStrategy
 * @extends EventStrategy
 *
 * @see EventStrategy - 基类
 * @see MouseStrategy - 低优先级的通用鼠标策略
 * @see ChartSelectionStrategy - 高优先级的图表交互策略
 * @see ValidationStrategy - 数据验证策略（可能联动）
 *
 * @example
 * // 配置交互式单元格
 * sheet.setCellType(5, 2, {
 *   type: 'button',
 *   label: '提交',
 *   onClick: (row, col, sheet) => {
 *     console.log(`按钮被点击: ${row}, ${col}`);
 *     // 执行业务逻辑
 *   },
 *   style: {
 *     backgroundColor: '#007bff',
 *     color: '#ffffff',
 *     borderRadius: '4px'
 *   }
 * });
 *
 * // 当用户点击该单元格时:
 * // 1. InteractionStrategy 捕获点击事件
 * // 2. 检测到是 button 类型
 * // 3. 调用 onClick 回调
 * // 4. 阻止默认的单元格选择行为
 */
export class InteractionStrategy extends EventStrategy {
    /**
     * 策略优先级
     * @type {number}
     */
    priority = STRATEGY_PRIORITY.CELL_TYPE_INTERACTION;

    /** 上次悬停的单元格位置 "row,col" */
    #lastHoveredCell = null;

    /** 防抖后的点击处理器（防止双击时触发单击） */
    #debouncedHandleClick = debounce((hitInfo, event) => {
        this.#doHandleClick(hitInfo, event);
    }, 200);

    /** 是否正在双击中 */
    #inDoubleClick = false;

    /** 是否有待执行的渲染任务（用于合并重复请求） */
    #pendingRender = null;

    /** requestAnimationFrame ID */
    #rafId = null;

    /** setTimeout ID（降级方案） */
    #throttleTimer = null;

    /** 上一次渲染的时间戳（用于节流） */
    #lastRenderTime = 0;

    /** 重绘节流时间（毫秒） */
    #throttleMs = 100;

    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: (event) => this.#handleMouseMove(event),
            [DELEGATE_KEYS.CANVAS_CLICK]: (event) => this.#handleClick(event),
            [DELEGATE_KEYS.CANVAS_DBLCLICK]: (event) => this.#handleDoubleClick(event),
            [DELEGATE_KEYS.CANVAS_MOUSELEAVE]: () => this.#handleMouseLeave(),
        };
    }

    // ─── 公共事件处理方法 ──────────────────────────────

    /**
     * 处理鼠标移动事件
     *
     * 检测鼠标是否进入/离开交互式单元格，并触发相应的悬停状态切换。
     * 使用智能节流控制渲染频率。
     *
     * @param {MouseEvent} event - 鼠标事件对象
     * @returns {boolean} false=已处理并阻止后续策略，true=交给其他策略处理
     */
    #handleMouseMove(event) {
        try {
            const hitInfo = this.#getHitInfo(event);
            if (!hitInfo) return true;

            const { hit, cellType, cellKey } = hitInfo;

            if (!cellType) {
                this.#clearAllHoverStates();
                return true;
            }

            this.#manageHoverTransition(cellKey);

            const context = this.#buildContext(hit);

            return this.#dispatchHoverEvent(cellType, context, event, cellKey);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#handleMouseMove 错误: ${error.message}`, { error });
            return true;
        }
    }

    /**
     * 处理鼠标点击事件
     *
     * 将点击事件分发给对应的单元格类型渲染器处理，
     * 并自动保存结果到单元格数据中。
     *
     * 使用防抖机制防止双击时触发单击操作。
     *
     * @param {MouseEvent} event - 鼠标事件对象
     * @returns {boolean} false=已处理并阻止后续策略，true=交给其他策略处理
     */
    #handleClick(event) {
        try {
            const hitInfo = this.#getHitInfo(event);
            if (!hitInfo || !hitInfo.cellType) return true;

            // 对于非交互式单元格类型（如超链接），不拦截点击事件
            // 让 MouseStrategy 处理选择逻辑，同时使用防抖延迟执行点击动作
            if (!hitInfo.cellType.isInteractive) {
                // 使用防抖处理，防止双击时触发单击
                this.#debouncedHandleClick(hitInfo, event);
                return true; // 不阻止后续策略，让 MouseStrategy 继续处理
            }

            // 对于交互式单元格类型（如星级评分），直接处理并阻止后续策略
            const { hit, cellType } = hitInfo;
            const context = this.#buildFullContext(hit);
            return this.#dispatchClickEvent(cellType, context, event);
        } catch (error) {
            errorHandler.handle(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#handleClick 错误: ${error.message}`, { error });
            return true;
        }
    }

    /**
     * 实际执行点击处理（由防抖调用）
     */
    #doHandleClick(hitInfo, event) {
        if (this.#inDoubleClick) return;

        const { hit, cellType } = hitInfo;
        const context = this.#buildFullContext(hit);
        this.#dispatchClickEvent(cellType, context, event);
    }

    /**
     * 处理双击事件
     *
     * 取消待执行的单击操作，让双击事件正常处理。
     */
    #handleDoubleClick(event) {
        this.#inDoubleClick = true;
        this.#debouncedHandleClick.cancel();

        // 延迟重置双击状态
        setTimeout(() => {
            this.#inDoubleClick = false;
        }, 300);

        // 检查是否为交互式单元格类型
        try {
            const hitInfo = this.#getHitInfo(event);
            if (hitInfo?.cellType?.isInteractive) {
                // 交互式类型：自己处理双击
                const { hit, cellType } = hitInfo;
                const context = this.#buildFullContext(hit);
                return this.#dispatchClickEvent(cellType, context, event);
            }
        } catch (error) {
            errorHandler.handle(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#handleDoubleClick 错误: ${error.message}`, { error });
        }

        return true; // 交给其他策略处理（如 MouseStrategy 弹出编辑器）
    }

    /**
     * 处理鼠标离开 Canvas 事件
     *
     * 清理所有悬停状态，确保没有残留的高亮效果。
     */
    #handleMouseLeave() {
        try {
            if (!this.enabled || !this.handler.sheet) return;
            this.#clearAllHoverStates();
        } catch (error) {
            errorHandler.handle(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#handleMouseLeave 错误: ${error.message}`, { error });
        }
    }

    // ─── 命中检测与上下文构建 ──────────────────────────

    /**
     * 执行命中检测并获取完整的命中信息
     *
     * 统一的入口点，用于获取：
     * - 命中的单元格位置（考虑合并区域）
     * - 单元格类型实例
     * - 单元格键标识
     *
     * @param {MouseEvent} event - 鼠标事件对象
     * @returns {{hit: object, cellType: object|null, cellKey: string}|null} 命中信息或null
     */
    #getHitInfo(event) {
        if (!this.enabled || !this.handler.sheet) return null;

        const { viewport } = this.handler;
        const hit = viewport.hitTest(event.clientX, event.clientY);

        if (!hit || hit.type !== "cell") {
            this.#clearAllHoverStates();
            return null;
        }

        const cellKey = `${hit.row},${hit.col}`;
        const cellType = this.#getCellType(hit.row, hit.col);

        return { hit, cellType, cellKey };
    }

    /**
     * 构建基础交互上下文（用于悬停等轻量操作）
     *
     * ✅ 关键：正确处理合并单元格，使用合并区域的左上角作为实际行列号。
     *
     * @param {object} hit - 命中信息对象 {row, col}
     * @returns {object} 包含几何信息和位置的上下文对象
     */
    #buildContext(hit) {
        const { viewport, sheet } = this.handler;
        const merge = sheet.getMerge(hit.row, hit.col);
        const cellRect = viewport.getCellRect(hit.row, hit.col, merge);

        const actualRow = merge?.topRow ?? hit.row;
        const actualCol = merge?.topCol ?? hit.col;

        return {
            x: cellRect.x,
            y: cellRect.y,
            width: cellRect.w,
            height: cellRect.h,
            sheet,
            row: actualRow,
            col: actualCol,
        };
    }

    /**
     * 构建完整交互上下文（用于点击等需要数据的操作）
     *
     * 在基础上下文上增加单元格数据信息。
     *
     * @param {object} hit - 命中信息对象 {row, col}
     * @returns {object} 完整的上下文对象（包含value、displayValue等）
     */
    #buildFullContext(hit) {
        const baseContext = this.#buildContext(hit);
        const { sheet, row, col } = baseContext;

        const cell = sheet.cellDataAccessor?.get(row, col);

        return {
            ...baseContext,
            value: cell?.value,
            displayValue: cell?.displayValue || cell?.value,
        };
    }

    // ─── 事件分发与状态管理 ──────────────────────────

    /**
     * 分发悬停事件给单元格类型处理器
     *
     * @param {object} cellType - 单元格类型实例
     * @param {object} context - 交互上下文
     * @param {MouseEvent} event - 鼠标事件
     * @param {string} cellKey - 单元格标识
     * @returns {boolean} false=已处理，true=未处理或出错
     */
    #dispatchHoverEvent(cellType, context, event, cellKey) {
        if (!isFunction(cellType.handleHover)) return true;

        const needsRedraw = cellType.handleHover(context, event);

        if (needsRedraw || !this.#lastHoveredCell) {
            this.#lastHoveredCell = cellKey;

            if (needsRedraw) {
                this.#scheduleRender();
            }
        }

        return false; // 已处理，阻止后续策略
    }

    /**
     * 分发点击事件给单元格类型处理器
     *
     * 自动将处理结果保存回单元格数据，并触发重绘。
     *
     * 返回值语义：
     * - undefined: 未实现处理（交给其他策略）
     * - null: 已处理但无返回值（如超链接打开链接）
     * - 其他值: 已处理且有返回值（需要更新单元格）
     *
     * @param {object} cellType - 单元格类型实例
     * @param {object} context - 交互上下文
     * @param {MouseEvent} event - 鼠标事件
     * @returns {boolean} false=已处理，true=未处理
     */
    #dispatchClickEvent(cellType, context, event) {
        if (!isFunction(cellType.handleClick)) return true;

        const result = cellType.handleClick(context, event);

        // undefined = 未处理（交给其他策略）
        if (result === undefined) return true;

        // null = 已处理但无返回值（如超链接打开链接）
        // 其他值 = 已处理且有返回值（需要更新单元格）
        if (result !== null) {
            const { sheet, row, col } = context;
            if (sheet?.setCell) {
                sheet.setCell(row, col, result);
            }
            this.#scheduleRender();
        }

        return false; // 已处理，阻止后续策略
    }

    /**
     * 管理悬停状态的切换过渡
     *
     * 当鼠标从一个单元格移动到另一个单元格时，
     * 先清理旧状态再准备新状态。
     *
     * @param {string} newCellKey - 新的单元格位置 "row,col"
     */
    #manageHoverTransition(newCellKey) {
        if (this.#lastHoveredCell && this.#lastHoveredCell !== newCellKey) {
            this.#clearPreviousHoverState(this.#lastHoveredCell);
        }
    }

    /**
     * 清理所有悬停状态（彻底清理）
     */
    #clearAllHoverStates() {
        if (this.#lastHoveredCell) {
            this.#clearPreviousHoverState(this.#lastHoveredCell);
        }
        this.#lastHoveredCell = null;
    }

    /**
     * 清理指定单元格的悬停状态
     *
     * 采用双重清理策略确保彻底性：
     * 1. 通过静态方法清理（不依赖实例状态）
     * 2. 通过实例方法清理（清除实例内部缓存）
     *
     * @param {string} cellKey - 单元格位置 "row,col"
     */
    #clearPreviousHoverState(cellKey) {
        if (!cellKey) return;

        try {
            const [row, col] = cellKey.split(",").map(Number);
            const cellType = this.#getCellType(row, col);

            if (cellType?.constructor?.clearHoverState) {
                cellType.constructor.clearHoverState(cellKey);
            }

            if (cellType?.handleMouseLeave) {
                const needsRedraw = cellType.handleMouseLeave();
                if (needsRedraw) {
                    this.#scheduleRender();
                }
            }
        } catch (error) {
            errorHandler.warn(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#clearPreviousHoverState 警告: ${error.message}`);
        }
    }

    // ─── 工具方法 ──────────────────────────────────────

    /**
     * 获取指定位置的单元格类型实例
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {object|null} 单元格类型实例或 null
     */
    #getCellType(row, col) {
        try {
            return this.handler.sheet.getCellTypeInstance(row, col);
        } catch (error) {
            return null;
        }
    }

    // ─── 渲染控制（智能节流）───────────────────────────

    /**
     * 调度重绘操作（智能节流控制）
     *
     * 性能优化策略：
     * - 使用 requestAnimationFrame 对齐浏览器刷新周期（~16.67ms for 60Hz）
     * - 合并同一帧内的多次请求，避免重复渲染
     * - 支持自定义最小间隔时间
     * - 自动降级到 setTimeout（兼容性保障）
     */
    #scheduleRender() {
        if (this.#pendingRender) return; // 合并重复请求

        const throttleMs = this.#throttleMs || 0;

        if (throttleMs <= 0) {
            this.#doRender();
            return;
        }

        const now = performance.now();
        const elapsed = now - this.#lastRenderTime;

        if (elapsed >= throttleMs) {
            this.#doRender();
        } else {
            const delay = throttleMs - elapsed;
            this.#pendingRender = true;

            if (typeof requestAnimationFrame !== "undefined" && throttleMs <= 20) {
                this.#rafId = requestAnimationFrame(() => {
                    this.#rafId = null;
                    this.#pendingRender = null;
                    this.#doRender();
                });
            } else {
                this.#throttleTimer = setTimeout(() => {
                    this.#throttleTimer = null;
                    this.#pendingRender = null;
                    this.#doRender();
                }, delay);
            }
        }
    }

    /**
     * 执行实际的渲染操作
     */
    #doRender() {
        try {
            this.#lastRenderTime = performance.now();
            this.handler.render();
        } catch (error) {
            errorHandler.handle(ERROR_CODE.GENERIC_ERROR, `InteractionStrategy#doRender 错误: ${error.message}`, { error });
        }
    }
}
