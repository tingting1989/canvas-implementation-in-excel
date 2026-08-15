/**
 * @fileoverview 图表缓存版本管理器
 * @description 基于版本号机制追踪图表缓存的有效性，
 *              监听工作表事件（单元格变更、全局失效）自动标记缓存为脏，
 *              避免在数据未变化时重复渲染图表。
 * @module render/chart/ChartCacheManager
 */

import { SHEET_EVENTS } from "../../constants/sheetEvents";
import { errorHandler } from "../../core/ErrorHandler";
import { ERROR_CODE } from "../../constants/errorCodes";

/**
 * 类工作表接口
 *
 * 描述 ChartCacheManager 所需的最小工作表契约，
 * 仅要求提供 bus（EventBus）用于事件订阅。
 */
interface SheetLike {
    bus?: {
        on(event: string, handler: (...args: unknown[]) => void): void;
        off(event: string, handler: (...args: unknown[]) => void): void;
    };
}

/**
 * 图表缓存版本管理器
 *
 * 通过全局版本号（globalVersion）和图表版本号（chartVersions）追踪缓存有效性：
 * - 当单元格数据变更时，标记 pendingInvalidation，下次渲染时按需失效
 * - 当收到全局失效事件时，递增 globalVersion，所有图表缓存标记为脏
 * - 渲染完成后调用 markClean(chartId) 将图表版本号同步到全局版本号
 *
 * @class ChartCacheManager
 */
export class ChartCacheManager {
    /**
     * @private 私有字段 - 全局版本号
     *
     * 每次收到 INVALIDATE_ALL 事件时递增，
     * 所有 chartVersions < globalVersion 的图表缓存视为脏数据。
     */
    #globalVersion: number = 0;

    /**
     * @private 私有字段 - 图表版本号映射
     *
     * chartId → 上次渲染时的 globalVersion 快照。
     * 若 chartVersions[chartId] < globalVersion，则该图表缓存已失效。
     */
    #chartVersions: Map<string, number> = new Map();

    /**
     * @private 私有字段 - 是否有待失效标记
     *
     * 收到 CELL_CHANGED 事件时置为 true，
     * 收到 INVALIDATE_ALL 事件时重置为 false。
     */
    #pendingInvalidation: boolean = false;

    /**
     * @private 私有字段 - 关联的工作表引用
     */
    #sheet: SheetLike | null = null;

    /**
     * @private 私有字段 - CELL_CHANGED 事件处理器引用
     *
     * 保存引用以便 destroy 时正确移除监听器。
     */
    #onCellChangedHandler: (() => void) | null = null;

    /**
     * @private 私有字段 - INVALIDATE_ALL 事件处理器引用
     *
     * 保存引用以便 destroy 时正确移除监听器。
     */
    #onInvalidateAllHandler: (() => void) | null = null;

    /**
     * 构造缓存版本管理器
     *
     * 绑定工作表事件监听器，监听单元格变更和全局失效事件。
     *
     * @param sheet - 关联的工作表对象，需提供 bus（EventBus）
     */
    constructor(sheet: SheetLike) {
        this.#sheet = sheet;
        this.#setupListeners();
    }

    /**
     * @private 私有方法 - 设置事件监听器
     *
     * 订阅 CELL_CHANGED 和 INVALIDATE_ALL 两个工作表事件。
     * 若 Sheet 或 EventBus 不可用，记录警告日志并跳过。
     */
    #setupListeners(): void {
        const sheet = this.#sheet;

        if (!sheet?.bus) {
            errorHandler.warn(ERROR_CODE.CHART_CACHE_MANAGER_SHEET_UNAVAILABLE, "Sheet 或 EventBus 不可用，跳过事件监听");
            return;
        }

        try {
            // 单元格变更：标记待失效，下次渲染时按需处理
            this.#onCellChangedHandler = () => {
                this.#pendingInvalidation = true;
            };
            sheet.bus.on(SHEET_EVENTS.CELL_CHANGED, this.#onCellChangedHandler);

            // 全局失效：递增版本号，所有图表缓存标记为脏
            this.#onInvalidateAllHandler = () => {
                this.#globalVersion++;
                this.#pendingInvalidation = false;
            };
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_ALL, this.#onInvalidateAllHandler);
        } catch (e: unknown) {
            errorHandler.warn(ERROR_CODE.CHART_CACHE_MANAGER_LISTENER_SETUP_FAILED, "设置事件监听器失败", { message: (e as Error).message });
        }
    }

    /**
     * 判断指定图表的缓存是否为脏（需要重新渲染）
     *
     * 比较图表版本号与全局版本号，若图表版本号落后则缓存已失效。
     *
     * @param chartId - 图表实例唯一标识
     * @returns 缓存是否为脏数据
     */
    isDirty(chartId: string): boolean {
        const lastVersion = this.#chartVersions.get(chartId) ?? -1;
        return lastVersion < this.#globalVersion;
    }

    /**
     * 获取关联的工作表引用
     */
    get sheet(): SheetLike | null {
        return this.#sheet;
    }

    /**
     * 标记指定图表的缓存为干净（已渲染）
     *
     * 将图表版本号同步到当前全局版本号，表示缓存已与最新数据一致。
     *
     * @param chartId - 图表实例唯一标识
     */
    markClean(chartId: string): void {
        this.#chartVersions.set(chartId, this.#globalVersion);
    }

    /**
     * 使所有图表缓存失效
     *
     * 递增全局版本号，所有图表的 isDirty() 将返回 true。
     * 同时重置 pendingInvalidation 标记。
     */
    invalidateAll(): void {
        this.#globalVersion++;
        this.#pendingInvalidation = false;
    }

    /**
     * 获取当前全局版本号
     */
    get globalVersion(): number {
        return this.#globalVersion;
    }

    /**
     * 销毁管理器
     *
     * 清空版本号映射，移除所有事件监听器，释放对工作表的引用。
     */
    destroy(): void {
        this.#chartVersions.clear();

        if (this.#sheet?.bus) {
            try {
                if (this.#onCellChangedHandler) {
                    this.#sheet.bus.off(SHEET_EVENTS.CELL_CHANGED, this.#onCellChangedHandler);
                    this.#onCellChangedHandler = null;
                }

                if (this.#onInvalidateAllHandler) {
                    this.#sheet.bus.off(SHEET_EVENTS.INVALIDATE_ALL, this.#onInvalidateAllHandler);
                    this.#onInvalidateAllHandler = null;
                }
            } catch (e: unknown) {
                errorHandler.warn(ERROR_CODE.CHART_CACHE_MANAGER_LISTENER_REMOVE_FAILED, "移除事件监听器失败", { message: (e as Error).message });
            }
        }
    }
}
