import { SHEET_EVENTS } from "../../constants/sheetEvents";
import { errorHandler } from "../../core/ErrorHandler";
import { ERROR_CODE } from "../../constants/errorCodes";

interface SheetLike {
    bus?: {
        on(event: string, handler: (...args: unknown[]) => void): void;
        off(event: string, handler: (...args: unknown[]) => void): void;
    };
}

export class ChartCacheManager {
    #globalVersion: number = 0;
    #chartVersions: Map<string, number> = new Map();
    #pendingInvalidation: boolean = false;
    #sheet: SheetLike | null = null;
    #onCellChangedHandler: (() => void) | null = null;
    #onInvalidateAllHandler: (() => void) | null = null;

    constructor(sheet: SheetLike) {
        this.#sheet = sheet;
        this.#setupListeners();
    }

    #setupListeners(): void {
        const sheet = this.#sheet;

        if (!sheet?.bus) {
            errorHandler.warn(ERROR_CODE.CHART_CACHE_MANAGER_SHEET_UNAVAILABLE, "Sheet 或 EventBus 不可用，跳过事件监听");
            return;
        }

        try {
            this.#onCellChangedHandler = () => {
                this.#pendingInvalidation = true;
            };
            sheet.bus.on(SHEET_EVENTS.CELL_CHANGED, this.#onCellChangedHandler);

            this.#onInvalidateAllHandler = () => {
                this.#globalVersion++;
                this.#pendingInvalidation = false;
            };
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_ALL, this.#onInvalidateAllHandler);
        } catch (e: unknown) {
            errorHandler.warn(ERROR_CODE.CHART_CACHE_MANAGER_LISTENER_SETUP_FAILED, "设置事件监听器失败", { message: (e as Error).message });
        }
    }

    isDirty(chartId: string): boolean {
        const lastVersion = this.#chartVersions.get(chartId) ?? -1;
        return lastVersion < this.#globalVersion;
    }

    get sheet(): SheetLike | null {
        return this.#sheet;
    }

    markClean(chartId: string): void {
        this.#chartVersions.set(chartId, this.#globalVersion);
    }

    invalidateAll(): void {
        this.#globalVersion++;
        this.#pendingInvalidation = false;
    }

    get globalVersion(): number {
        return this.#globalVersion;
    }

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
