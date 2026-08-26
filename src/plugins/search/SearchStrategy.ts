import { EventStrategy } from "../../editor/strategies/EventStrategy.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { InputDetector } from "../../utils/inputDetection.js";
import type { SearchPlugin } from "./SearchPlugin.js";

/**
 * 搜索策略 (Search Strategy)
 *
 * 负责处理与搜索功能相关的键盘事件和交互逻辑。
 *
 * 核心职责：
 * - **Ctrl+F / Cmd+F**: 打开搜索面板
 * - **F3**: 跳转到下一个搜索结果
 * - **Shift+F3**: 跳转到上一个搜索结果
 * - **Enter/Shift+Enter**: 在搜索框中导航结果
 * - **Esc**: 关闭搜索面板
 *
 * @extends EventStrategy
 * @module plugins/search/SearchStrategy
 */
export class SearchStrategy extends EventStrategy {
    /** 策略优先级 */
    priority: number = STRATEGY_PRIORITY.POPUP_UI;

    /** @private 私有字段 - 搜索插件实例引用 */
    #plugin: SearchPlugin | null = null;

    /** @private 私有字段 - 搜索面板是否处于激活状态 */
    #isSearchActive: boolean = false;

    /** @private 私有字段 - 外部输入检测器 */
    #inputDetector: InputDetector = new InputDetector();

    /**
     * 创建搜索策略实例
     *
     * @param handler - 事件处理器
     * @param plugin - 搜索插件实例
     */
    constructor(handler: any, plugin: SearchPlugin) {
        super(handler);
        this.#plugin = plugin;

        if (plugin) {
            this.#bindPluginEvents();
        }
    }

    init(): void {
        this.#inputDetector.setOwnCanvas(this.handler.canvas as HTMLCanvasElement | null);
    }

    updateWorkbookId(id: string | null): void {
        this.#inputDetector.setWorkbookId(id);
    }

    /**
     * @private 私有方法 - 绑定插件生命周期事件
     *
     * 通过猴子补丁（Monkey Patch）监听 SearchPlugin 的
     * show/hide 方法调用，以同步更新 #isSearchActive 状态。
     */
    #bindPluginEvents(): void {
        const originalShow = (this.#plugin as any).show.bind(this.#plugin);
        (this.#plugin as any).show = () => {
            this.#isSearchActive = true;
            originalShow();
        };

        const originalHide = (this.#plugin as any).hide.bind(this.#plugin);
        (this.#plugin as any).hide = () => {
            this.#isSearchActive = false;
            originalHide();
        };
    }

    /**
     * 获取事件处理器映射
     *
     * @returns 事件名称到处理函数的映射
     */
    getEventHandlers(): Record<string, (e: Event) => boolean | void> {
        return {
            [DELEGATE_KEYS.DOCUMENT_KEYDOWN]: (e: Event) => {
                this.#handleKeyDown(e as KeyboardEvent);
            },
        };
    }

    /**
     * @private 私有方法 - 处理键盘按下事件
     *
     * @param e - 键盘事件
     * @returns 是否允许事件继续传播
     */
    async #handleKeyDown(e: KeyboardEvent): Promise<boolean> {
        if (!this.enabled || !(this.#plugin as any)?.enabled) return true;

        if (this.#hasExternalInput()) {
            return true;
        }

        const key = e.key.toLowerCase();
        const ctrlOrCmd = e.ctrlKey || e.metaKey;
        const shiftKey = e.shiftKey;

        try {
            if (ctrlOrCmd && key === "f") {
                e.preventDefault();
                e.stopPropagation();

                if (this.#isSearchActive) {
                    (this.#plugin as any).hide();
                } else {
                    this.#showSearchPanel(false);
                }

                return false;
            }

            if (ctrlOrCmd && key === "h") {
                e.preventDefault();
                e.stopPropagation();

                if (this.#isSearchActive) {
                    (this.#plugin as any).hide();
                } else {
                    this.#showSearchPanel(true);
                }

                return false;
            }

            if (key === "f3" && !ctrlOrCmd && !shiftKey) {
                e.preventDefault();

                if (this.#isSearchActive) {
                    await (this.#plugin as any).findNext();
                } else {
                    this.#reopenLastSearch();
                }

                return false;
            }

            if (key === "f3" && shiftKey && !ctrlOrCmd) {
                e.preventDefault();

                if (this.#isSearchActive) {
                    await (this.#plugin as any).findPrevious();
                } else {
                    this.#reopenLastSearch(true);
                }

                return false;
            }

            if (key === "escape" && !ctrlOrCmd && !shiftKey) {
                if (this.#isSearchActive) {
                    e.preventDefault();
                    (this.#plugin as any).hide();
                    return false;
                }

                return true;
            }
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_KEYBOARD_EVENT_ERROR, "键盘事件处理失败", { originalError: error });
        }

        return true;
    }

    /**
     * @private 私有方法 - 显示搜索面板
     *
     * @param showReplace - 是否切换到替换标签页
     */
    #showSearchPanel(showReplace: boolean = false): void {
        if (!(this.handler as any)?.viewport || !(this.handler as any)?.canvasContext) {
            errorHandler.warn(ERROR_CODE.SEARCH_MISSING_CONTEXT, "缺少必要的上下文信息");
            return;
        }

        const canvasRect = (this.handler as any).canvasContext.canvas.getBoundingClientRect();

        const position = {
            x: canvasRect.left + canvasRect.width / 2,
            y: canvasRect.top + 10,
        };

        (this.#plugin as any).show(position);

        if (showReplace) {
            setTimeout(() => {
                (this.#plugin as any).uiController?.dropdown?.switchTab("replace");
            }, 150);
        }
    }

    /**
     * @private 私有方法 - 重新打开上次的搜索
     *
     * @param reverse - 是否反向导航到上一个
     */
    async #reopenLastSearch(reverse: boolean = false): Promise<void> {
        const lastQuery = (this.#plugin as any).getLastQuery?.();

        if (!lastQuery) {
            this.#showSearchPanel();
            return;
        }

        this.#showSearchPanel();

        setTimeout(async () => {
            if (reverse) {
                await (this.#plugin as any).findPrevious();
            } else {
                await (this.#plugin as any).findNext();
            }
        }, 100);
    }

    /**
     * @private 私有方法 - 检测是否存在外部输入源
     *
     * @returns 是否存在外部输入
     */
    #hasExternalInput(): boolean {
        if (this.#inputDetector.isExternalInput()) {
            return true;
        }

        const activeElement = document.activeElement;

        if (activeElement) {
            const isSearchInput =
                (activeElement as any).closest?.("search-dropdown") !== null || (activeElement as any).dataset?.searchInput === "true";

            if (isSearchInput) {
                return false;
            }
        }

        const modals = document.querySelectorAll(".modal-overlay, .dialog-backdrop, [role='dialog']");

        for (const modal of modals) {
            if (modal.classList.contains("search-panel") || modal.tagName === "SEARCH-DROPDOWN") {
                continue;
            }

            const style = window.getComputedStyle(modal);
            if (style.display !== "none" && style.visibility !== "hidden") {
                return true;
            }
        }

        if ((this.handler as any)?.sheet?.editor?.isActive?.()) {
            return true;
        }

        return false;
    }

    /**
     * 销毁策略实例
     */
    destroy(): void {
        super.destroy();
        this.#plugin = null;
        this.#isSearchActive = false;
    }
}
