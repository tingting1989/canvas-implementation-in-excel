import { EventStrategy } from "./EventStrategy.js";
import { HIT_TYPE } from "../../constants/hitType.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { SORT_ORDER } from "../../constants/enums/SortOrder.js";

/**
 * 排序事件策略（Sort Strategy）- 标准化实现
 *
 * ## 职责
 * 监听列头点击事件，判断用户意图：
 * - 单击 → 选中列（交给 MouseStrategy 处理）
 * - 双击 → 触发排序（升序 ↔ 降序切换）
 *
 * ## 设计原则
 * - 继承 EventStrategy 基类，符合项目统一架构
 * - 使用事件委托模式（getEventHandlers 声明式绑定）
 * - 优先级高于 MouseStrategy（150 vs 默认值）
 * - 仅拦截双击排序事件，单击事件透传给其他策略
 * - 遵循设计文档：双击仅在 asc 和 desc 之间切换，不自动清除排序
 *
 * ## 与设计文档的一致性
 * ✅ 移除第四次点击清除排序逻辑
 * ✅ 清除排序仅通过：右键菜单 / API / 工具栏按钮
 * ✅ 使用 EventHandler 委托模式统一管理生命周期
 */
export class SortStrategy extends EventStrategy {
    /**
     * 策略名称
     * @type {string}
     */
    name = "sort";

    /**
     * 策略优先级（高于 MouseStrategy）
     * @type {number}
     */
    priority = 150;

    /**
     * 上一次点击的列索引
     * @type {number}
     * @private
     */
    #lastClickCol = -1;

    /**
     * 上一次点击的时间戳
     * @type {number}
     * @private
     */
    #lastClickTime = 0;

    /**
     * 双击判定阈值（毫秒）
     * @type {number}
     * @private
     */
    #clickThreshold = 300;

    /**
     * 所属插件实例（用于调用排序API）
     * @type {import("../plugins/SortPlugin.js").SortPlugin}
     * @private
     */
    #plugin;

    /**
     * @param {import("../../core/EventHandler.js").EventHandler} handler - 事件处理器实例
     * @param {import("../plugins/SortPlugin.js").SortPlugin} plugin - 排序插件实例
     */
    constructor(handler, plugin) {
        super(handler);
        this.#plugin = plugin;
    }

    // ═══════════════════════════════════════════════════════════════
    // 事件声明（委托模式）
    // ═══════════════════════════════════════════════════════════════

    /**
     * 声明此策略需要监听的事件处理器
     *
     * 使用 EventHandler 统一绑定的委托模式：
     * - 键格式: "target:eventType"（如 "canvas:mousedown"）
     * - 返回 false 可阻止后续低优先级策略接收同一事件
     *
     * @returns {Object<string, Function>} 事件处理器映射
     */
    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => this.#handleMouseDown(e),
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // 事件处理
    // ═══════════════════════════════════════════════════════════════

    /**
     * 处理鼠标按下事件
     *
     * 判断逻辑：
     * 1. 使用 ViewportService.hitTest 检测是否点击在列头区域
     * 2. 判断是单击还是双击（基于时间间隔）
     * 3. 双击 → 执行排序并阻止事件冒泡
     * 4. 单击 → 记录状态，允许其他策略处理
     *
     * @param {MouseEvent} e - 鼠标事件
     * @returns {boolean} 是否阻止后续策略处理
     */
    #handleMouseDown(e) {
        if (!this.enabled) return true;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);

        if (!hit || hit.type !== HIT_TYPE.COL_HEADER) {
            return true; // 非列头区域，让其他策略处理
        }

        const now = Date.now();
        const currentCol = hit.index;

        const isDoubleClick = currentCol === this.#lastClickCol && now - this.#lastClickTime < this.#clickThreshold;

        if (isDoubleClick) {
            e.preventDefault();
            e.stopPropagation();

            this.#toggleSort(currentCol);

            this.#lastClickTime = 0; // 重置，防止三击触发
            return false; // 阻止 MouseStrategy 处理
        }
        this.#lastClickCol = currentCol;
        this.#lastClickTime = now;
        return true; // 允许 MouseStrategy 处理选中操作
    }

    // ═══════════════════════════════════════════════════════════════
    // 排序逻辑
    // ═══════════════════════════════════════════════════════════════

    /**
     * 切换排序状态
     *
     * 根据当前状态和新点击的列，决定排序行为：
     * - 同一列且当前为升序 → 切换为降序
     * - 同一列且当前为降序 → 切换为升序（循环）
     * - 不同列 → 默认升序
     *
     * 符合设计文档要求：
     * 双击仅在 asc 和 desc 之间切换
     * 不自动清除排序
     * 清除排序通过右键菜单/API/工具栏按钮实现
     *
     * @param {number} colIndex - 点击的列索引
     * @private
     */
    #toggleSort(colIndex) {
        const currentState = this.#plugin.getSortState();
        let newOrder;

        if (currentState.col === colIndex) {
            if (currentState.order === SORT_ORDER.ASC) {
                newOrder = SORT_ORDER.DESC;
            } else if (currentState.order === SORT_ORDER.DESC) {
                newOrder = SORT_ORDER.ASC;
            } else {
                newOrder = SORT_ORDER.ASC;
            }
        } else {
            newOrder = SORT_ORDER.ASC;
        }

        this.#plugin.sortRows(colIndex, { order: newOrder });
    }
}
