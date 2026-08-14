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
 * 优先级：STRATEGY_PRIORITY.DATA_SORT
 *
 * 核心功能：
 * 1. **双击检测**：在短时间内对同一列头的两次点击视为双击
 * 2. **排序切换**：升序 → 降序 → 升序 循环切换
 * 3. **列可排序性检查**：通过插件判断列是否允许排序
 * 4. **排序状态管理**：维护当前排序列和排序方向
 *
 * 交互流程：
 * ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
 * │ 单击列头      │ →  │ 记录点击信息  │ →  │ 等待第二次点击│
 * └──────────────┘    └──────────────┘    └──────────────┘
 * ┌──────────────┐    ┌──────────────┐
 * │ 双击列头(300ms)│ →  │ 切换排序方向  │
 * └──────────────┘    └──────────────┘
 *
 * @class SortStrategy
 * @extends EventStrategy
 */
export class SortStrategy extends EventStrategy {
    /** 策略名称标识 */
    name: string = "sort";
    /** 策略优先级：数据排序 */
    priority: number = STRATEGY_PRIORITY.DATA_SORT;

    /** 上次点击的列索引，用于双击检测 */
    #lastClickCol: number = -1;
    /** 上次点击的时间戳 */
    #lastClickTime: number = 0;
    /** 双击判定的时间阈值（毫秒） */
    #clickThreshold: number = 300;
    /** 排序插件实例 */
    #plugin: any;

    constructor(handler: any, plugin: any) {
        super(handler);
        this.#plugin = plugin;
    }

    getEventHandlers(): Record<string, (e: Event) => boolean | void> {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e: Event) => this.#handleMouseDown(e as MouseEvent),
        };
    }

    #handleMouseDown(e: MouseEvent): boolean | void {
        if (!this.enabled) return true;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);

        if (!hit || hit.type !== HIT_TYPE.COL_HEADER) {
            return true;
        }

        const now = Date.now();
        const currentCol = hit.index;

        const isDoubleClick = currentCol === this.#lastClickCol && now - this.#lastClickTime < this.#clickThreshold;

        if (isDoubleClick) {
            e.preventDefault();
            e.stopPropagation();

            this.#toggleSort(currentCol);

            this.#lastClickTime = 0;
            return false;
        }
        this.#lastClickCol = currentCol;
        this.#lastClickTime = now;
        return true;
    }

    #toggleSort(colIndex: number): void {
        if (!this.#plugin.isColumnSortable(colIndex)) {
            return;
        }

        const currentState = this.#plugin.getSortState();
        let newOrder: string;

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
