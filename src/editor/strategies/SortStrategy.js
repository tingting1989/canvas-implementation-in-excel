import { EventStrategy } from "./EventStrategy.js";
import { HIT_TYPE } from "../../constants/hitType.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { SORT_ORDER } from "../../constants/enums/SortOrder.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";

/**
 * 数据排序策略 (Sort Strategy)
 *
 * 处理Canvas表格中的列排序交互操作。
 * 通过双击列头触发排序功能，在升序和降序之间切换。
 *
 * 优先级：150（STRATEGY_PRIORITY.DATA_SORT）
 * - 高于 MouseStrategy，确保双击事件被优先处理
 * - 仅拦截双击排序事件，单击事件透传给其他策略
 *
 * 核心功能：
 * ┌────────────────────┬─────────────────────────────────────────┐
 * │ 操作               │ 行为                                    │
 * ├────────────────────┼─────────────────────────────────────────┤
 * │ 单击列头           │ 选中整列（透传给MouseStrategy）        │
 * │ 双击列头           │ 触发排序（升序↔降序切换）             │
 * │ 连续双击同列       │ 在asc/desc间循环                       │
 * │ 双击不同列         │ 切换排序列为新列（默认升序）          │
 * └────────────────────┴─────────────────────────────────────────┘
 *
 * 设计原则：
 * **1. 最小化干预**：
 * - 只拦截必要的事件（双击列头）
 * - 其他所有事件透传给后续策略
 * - 不影响正常的单元格选择和编辑
 *
 * **2. 状态管理**：
 * - 记录上次点击的列和时间戳
 * - 区分单击和双击（避免误触发）
 * - 维护当前排序状态（列、方向）
 *
 * **3. 与设计文档一致**：
 * - ✅ 不自动清除排序（需手动操作）
 * - ✅ 清除方式：右键菜单 / API / 工具栏
 * - ✅ 使用标准事件委托模式
 *
 * 排序算法支持：
 * - 数值排序（数字、日期）
 * - 字符串排序（字典序、本地化）
 * - 自定义比较函数
 * - 多列排序（扩展功能）
 * - 稳定性保证（相等元素保持原顺序）
 *
 * 性能考虑：
 * - 大数据量时使用Web Worker异步排序
 * - 排序过程中显示加载指示器
 * - 支持取消正在进行的排序操作
 * - 排序结果记录到UndoManager以支持撤销
 *
 * @class SortStrategy
 * @extends EventStrategy
 *
 * @see EventStrategy - 基类
 * @see MouseStrategy - 鼠标交互策略（低优先级）
 * @see ContextMenuStrategy - 提供清除排序的菜单项
 *
 * @example
 * // 典型使用流程
 * // 1. 用户双击"价格"列的列头
 * // 2. SortStrategy 捕获 dblclick 事件
 * // 3. 判断命中类型为 COL_HEADER
 * // 4. 触发按"价格"列升序排序
 * // 5. 再次双击同一列头 → 切换为降序
 * // 6. 表格数据重新排列，选区保持不变
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
    priority = STRATEGY_PRIORITY.DATA_SORT;

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
        if (!this.#plugin.isColumnSortable(colIndex)) {
            return;
        }

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
