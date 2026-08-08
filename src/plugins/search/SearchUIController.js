/**
 * 搜索 UI 控制器
 *
 * 严格遵循项目 PopupManager 规范：
 * - 使用 PopupManager.getInstance().register/unregister
 * - 继承 PopupPanel 基类
 * - 支持 closeAll(exceptId) 协调关闭
 */
import { SearchDropdown } from "./SearchDropdown.js";
import { PopupManager } from "../../ui/components/PopupManager.js";

export class SearchUIController {
    /** @type {import("./SearchPlugin.js")} */
    #plugin = null;

    /** @type {SearchDropdown|null} */
    #dropdown = null;

    /** @type {Symbol|null} */
    #popupId = null;

    /**
     * @param {import("./SearchPlugin.js")} plugin - SearchPlugin 实例
     */
    constructor(plugin) {
        this.#plugin = plugin;
    }

    /**
     * 显示搜索面板
     */
    show() {
        if (this.#dropdown) return;

        this.#dropdown = new SearchDropdown();

        const position = this.#calculatePosition();

        this.#popupId = this.#dropdown.show(
            position,
            (query, options) => this.#handleSearch(query, options),
            (direction) => this.#handleNavigate(direction),
            (reason) => this.#handleClose(reason),
        );
    }

    /**
     * 隐藏搜索面板
     */
    hide() {
        if (this.#dropdown) {
            this.#dropdown.hide();

            if (this.#popupId) {
                try {
                    PopupManager.getInstance().unregister(this.#popupId);
                } catch (error) {
                    console.warn("[Search] 注销 PopupManager 失败:", error);
                }
            }

            this.#dropdown = null;
            this.#popupId = null;
        }
    }

    focusInput() {
        this.#dropdown?.focusInput();
    }

    updateUI(state) {
        this.#dropdown?.updateResultInfo(state);
    }

    isOpen() {
        return this.#dropdown !== null;
    }

    /**
     * 计算面板显示位置
     *
     * @private
     * @returns {{ x: number, y: number }}
     */
    #calculatePosition() {
        const workbookEl = this.#plugin.workbook?.element;
        if (!workbookEl) {
            return { x: window.innerWidth - 450, y: 60 };
        }

        try {
            const rect = workbookEl.getBoundingClientRect();
            return {
                x: Math.min(rect.right - 20, window.innerWidth - 450),
                y: Math.max(rect.top + 10, 60),
            };
        } catch (error) {
            console.warn("[Search] 获取工作表位置失败，使用默认位置");
            return { x: window.innerWidth - 450, y: 60 };
        }
    }

    async #handleSearch(query, options) {
        try {
            await this.#plugin.query(query, options);
        } catch (error) {
            console.error("[Search] 搜索失败:", error);
        }
    }

    async #handleNavigate(direction) {
        try {
            if (direction === "next") {
                await this.#plugin.findNext();
            } else {
                await this.#plugin.findPrevious();
            }
        } catch (error) {
            console.error("[Search] 导航失败:", error);
        }
    }

    #handleClose(reason) {
        try {
            this.#plugin.hide();
        } catch (error) {
            console.warn("[Search] 关闭面板时出错:", error);
        }
    }

    /**
     * 显示错误信息（带自动消失的提示）
     *
     * @param {string} message - 错误消息
     * @param {number} duration - 显示时长（毫秒），默认 3000ms
     */
    showError(message, duration = 3000) {
        if (!this.#dropdown) return;

        console.error(`[Search] ${message}`);

        // 使用 Web Component 的 API 或自定义事件
        if (typeof this.#dropdown.showError === "function") {
            this.#dropdown.showError(message, duration);
        } else {
            // Fallback: 通过自定义事件通知
            const event = new CustomEvent("search:error", {
                detail: { message, duration },
                bubbles: true,
            });
            this.#dropdown.dispatchEvent(event);
        }

        // ✅ 可选：在控制台显示更详细的错误堆栈
        if (process.env.NODE_ENV === "development") {
            console.trace("[Search] 错误调用栈");
        }
    }

    /**
     * 显示警告信息（比错误轻量级）
     *
     * @param {string} message - 警告消息
     */
    showWarning(message) {
        if (!this.#dropdown) return;

        console.warn(`[Search] ${message}`);

        if (typeof this.#dropdown.showWarning === "function") {
            this.#dropdown.showWarning(message);
        } else {
            const event = new CustomEvent("search:warning", {
                detail: { message },
                bubbles: true,
            });
            this.#dropdown.dispatchEvent(event);
        }
    }

    destroy() {
        this.hide();
        this.#plugin = null;
    }
}
