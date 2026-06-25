import { HIT_TYPE } from "../../constants/hitType.js";

/**
 * 排序事件策略（Sort Strategy）
 *
 * ## 职责
 * 监听列头点击事件，判断用户意图：
 * - 单击 → 选中列（交给 MouseStrategy 处理）
 * - 双击 → 触发排序（升序 ↔ 降序切换）
 *
 * ## 设计原则
 * - 优先级高于 MouseStrategy（150 vs 默认值）
 * - 仅拦截双击排序事件，单击事件透传给其他策略
 * - 遵循设计文档：双击仅在 asc 和 desc 之间切换，不自动清除排序
 *
 * ## 与设计文档的一致性
 * ✅ 移除第四次点击清除排序逻辑
 * ✅ 清除排序仅通过：右键菜单 / API / 工具栏按钮
 */
export class SortStrategy {
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
     * 所属插件实例
     * @type {import("../SortPlugin.js").SortPlugin}
     * @private
     */
    #plugin;

    constructor(plugin) {
        this.#plugin = plugin;
    }

    // ═══════════════════════════════════════════════════════════════
    // 生命周期
    // ═══════════════════════════════════════════════════════════════

    /**
     * 初始化策略
     *
     * 注册 mousedown 事件监听器到 canvas
     */
    init() {
        const canvas = this.#plugin.renderEngine?.canvas;
        if (!canvas) return;

        canvas.addEventListener("mousedown", this.#handleMouseDown.bind(this), { capture: true });
    }

    /**
     * 销毁策略
     *
     * 清理事件监听器
     */
    destroy() {
        const canvas = this.#plugin.renderEngine?.canvas;
        if (canvas) {
            canvas.removeEventListener("mousedown", this.#handleMouseDown.bind(this));
        }
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
        const viewport = this.#plugin.eventHandler?.viewport;
        if (!viewport) return true;

        const hit = viewport.hitTest(e.clientX, e.clientY);

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
        } else {
            this.#lastClickCol = currentCol;
            this.#lastClickTime = now;
            return true; // 允许 MouseStrategy 处理选中操作
        }
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
     * ⚠️ 符合设计文档要求：
     * ✅ 双击仅在 asc 和 desc 之间切换
     * ✅ 不自动清除排序
     * ✅ 清除排序通过右键菜单/API/工具栏按钮实现
     *
     * @param {number} colIndex - 点击的列索引
     * @private
     */
    #toggleSort(colIndex) {
        const currentState = this.#plugin.getSortState();
        let newOrder;

        if (currentState.col === colIndex) {
            if (currentState.order === "asc") {
                newOrder = "desc";
            } else if (currentState.order === "desc") {
                newOrder = "asc"; // 循环回升序（非清除）
            } else {
                newOrder = "asc";
            }
        } else {
            newOrder = "asc"; // 新列默认升序
        }

        this.#plugin.sortRows(colIndex, { order: newOrder });
    }
}
