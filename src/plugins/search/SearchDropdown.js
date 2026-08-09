/**
 * 搜索面板 Web Component
 *
 * 继承 PopupPanel，使用 Shadow DOM 封装样式，
 * 遵循项目 UI 组件规范。
 */
import { PopupPanel } from "../../ui/components/PopupPanel.js";
import { debounce } from "../../utils/helper.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { errorHandler } from "../../core/ErrorHandler.js";

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host {
        --search-panel-width: 420px;
        --search-input-height: 36px;
        --search-btn-size: 32px;
        --primary-color: #1890ff;
        --border-color: #d9d9d9;
        --text-color: #333;
        --bg-color: #fff;
    }
    
    .search-dropdown-panel {
        width: var(--search-panel-width);
        background: var(--bg-color);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        box-shadow: 0 6px 16px rgba(0,0,0,0.12);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        padding: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        box-sizing: border-box;
    }
    
    :host-context(.dark) .search-dropdown-panel,
    :host([data-theme="dark"]) .search-dropdown-panel {
        background: #1f2937;
        border-color: #374151;
        color: #f9fafb;
    }
    
    .search-input-wrapper {
        flex: 1;
        position: relative;
    }
    
    .search-input {
        width: 100%;
        height: var(--search-input-height);
        padding: 0 12px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        font-size: 14px;
        outline: none;
        transition: all 0.2s;
        box-sizing: border-box;
    }
    
    :host-context(.dark) .search-input,
    :host([data-theme="dark"]) .search-input {
        background: #374151;
        border-color: #4b5563;
        color: #f9fafb;
    }
    
    .search-input:focus {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 2px rgba(24,144,255,0.2);
    }
    
    .search-options {
        display: flex;
        gap: 4px;
    }
    
    .search-option-btn {
        width: var(--search-btn-size);
        height: var(--search-btn-size);
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 4px;
        cursor: pointer;
        color: #666;
        font-size: 12px;
        font-weight: 600;
        transition: all 0.2s;
    }
    
    .search-option-btn:hover {
        background: #f5f5f5;
        border-color: var(--border-color);
    }
    
    .search-option-btn.active {
        background: #e6f7ff;
        border-color: var(--primary-color);
        color: var(--primary-color);
    }
    
    :host-context(.dark) .search-option-btn.active,
    :host([data-theme="dark"]) .search-option-btn.active {
        background: rgba(24,144,255,0.15);
    }
    
    .search-navigation {
        display: flex;
        gap: 4px;
    }
    
    .search-nav-btn {
        width: var(--search-btn-size);
        height: var(--search-btn-size);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-color);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        cursor: pointer;
        color: var(--text-color);
        font-size: 14px;
        transition: all 0.2s;
    }
    
    :host-context(.dark) .search-nav-btn,
    :host([data-theme="dark"]) .search-nav-btn {
        background: #374151;
        border-color: #4b5563;
        color: #f9fafb;
    }
    
    .search-nav-btn:hover:not(:disabled) {
        border-color: #40a9ff;
        color: var(--primary-color);
    }
    
    .search-nav-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    
    .search-result-info {
        min-width: 70px;
        text-align: center;
        font-size: 12px;
        color: #666;
        user-select: none;
    }
    
    .search-result-info.no-results {
        color: #ff4d4f;
    }
    
    :host-context(.dark) .search-result-info,
    :host([data-theme="dark"]) .search-result-info {
        color: #9ca3af;
    }
    
    :host-context(.dark) .search-result-info.no-results,
    :host([data-theme="dark"]) .search-result-info.no-results {
        color: #ef4444;
    }
    
    .search-close-btn {
        width: var(--search-btn-size);
        height: var(--search-btn-size);
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: #999;
        font-size: 18px;
        transition: all 0.2s;
    }
    
    .search-close-btn:hover {
        background: #fff1f0;
        color: #ff4d4f;
    }

    /* ✅ 新增：错误/警告提示样式 */
    .search-error-toast {
        position: absolute;
        top: -40px;
        left: 50%;
        transform: translateX(-50%) translateY(10px);
        padding: 8px 16px;
        background: #fff2f0;
        border: 1px solid #ffccc7;
        border-radius: 4px;
        color: #cf1322;
        font-size: 12px;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease-out;
        box-shadow: 0 2px 8px rgba(207,19,34,0.15);
        z-index: 1000;
        pointer-events: none;
    }
    
    .search-error-toast.visible {
        opacity: 1;
        visibility: visible;
        transform: translateX(-50%) translateY(0);
    }
    
    .search-error-toast .error-icon {
        margin-right: 6px;
    }
    
    :host-context(.dark) .search-error-toast,
    :host([data-theme="dark"]) .search-error-toast {
        background: rgba(239,68,68,0.9);
        border-color: rgba(220,38,38,0.5);
        color: #fef2f2;
    }
    
    .search-result-info.warning {
        color: #faad14 !important;
        font-weight: 500;
    }
    
    :host-context(.dark) .search-result-info.warning,
    :host([data-theme="dark"]) .search-result-info.warning {
        color: #fbbf24 !important;
    }
</style>

<div class="search-dropdown-panel">
    <div class="search-input-wrapper">
        <input type="text" 
               class="search-input" 
               placeholder="搜索..." 
               autocomplete="off" 
               spellcheck="false" />
    </div>
    
    <div class="search-options">
        <button class="search-option-btn" data-option="caseSensitive" title="区分大小写 (Alt+C)">Aa</button>
        <button class="search-option-btn" data-option="wholeWord" title="全字匹配 (Alt+W)">W</button>
        <button class="search-option-btn" data-option="useRegex" title="使用正则 (Alt+R)">.*</button>
    </div>
    
    <div class="search-navigation">
        <button class="search-nav-btn" data-action="prev" title="上一个 (Shift+F3)">▲</button>
        <button class="search-nav-btn" data-action="next" title="下一个 (F3)">▼</button>
    </div>
    
    <div class="search-result-info">-</div>
    
    <button class="search-close-btn" data-action="close" title="关闭 (Esc)">✕</button>
</div>
`;

export class SearchDropdown extends PopupPanel {
    #inputElement = null;
    #resultInfo = null;
    #optionButtons = new Map();
    #navButtons = new Map();
    #onSearchCallback = null;
    #onNavigateCallback = null;
    #onCloseCallback = null;
    /** @type {Function} 防抖后的搜索函数 */
    #debouncedSearch = null;

    constructor() {
        super(template);
        this.#createDebouncedSearch();
    }

    /**
     * 创建防抖搜索函数
     * @private
     */
    #createDebouncedSearch() {
        this.#debouncedSearch = debounce((query) => {
            if (query) {
                const options = this.#getCurrentOptions();
                this.#onSearchCallback?.(query, options);
            } else {
                this.#resultInfo.textContent = "-";
                this.#resultInfo.className = "search-result-info";
            }
        }, 300);
    }

    connectedCallback() {
        super.connectedCallback();
        this.#cacheDOMReferences();
        this.#bindEvents();
    }

    /**
     * 显示搜索面板
     *
     * @param {{ x: number, y: number }} position - 屏幕坐标
     * @param {Function} onSearch - 搜索回调 (query, options) => void
     * @param {Function} onNavigate - 导航回调 (direction: "next"|"prev") => void
     * @param {Function} onClose - 关闭回调 (reason: string) => void
     * @returns {Symbol} popupId
     */
    show(position, onSearch, onNavigate, onClose) {
        this.#onSearchCallback = onSearch;
        this.#onNavigateCallback = onNavigate;
        this.#onCloseCallback = onClose;

        super.show({
            position,
            zIndex: undefined, // 使用父类默认值 DEFAULT_Z_INDEX (10000)
            closeOnClickOutside: false,
            closeOnEscape: true,
        });

        this.#inputElement?.focus();
        this.#inputElement?.select();

        return Symbol("search-dropdown");
    }

    /**
     * 隐藏搜索面板
     *
     * @param {string} [reason="user-close"] - 关闭原因
     */
    hide(reason = "user-close") {
        this.#debouncedSearch?.cancel();
        super.hide(reason);
        this.#onCloseCallback?.(reason);
    }

    focusInput() {
        this.#inputElement?.focus();
        this.#inputElement?.select();
    }

    updateResultInfo(state) {
        if (!this.#resultInfo) return;

        const total = state.getResults().length;
        const current = state.getCurrentIndex() + 1;

        if (total === 0) {
            this.#resultInfo.textContent = "无结果";
            this.#resultInfo.className = "search-result-info no-results";
        } else {
            this.#resultInfo.textContent = `${current} / ${total}`;
            this.#resultInfo.className = "search-result-info";
        }

        this.#updateNavButtonStates(state);
    }

    #cacheDOMReferences() {
        this.#inputElement = this.shadowRoot.querySelector(".search-input");
        this.#resultInfo = this.shadowRoot.querySelector(".search-result-info");

        this.shadowRoot.querySelectorAll("[data-option]").forEach((btn) => {
            this.#optionButtons.set(btn.dataset.option, btn);
        });

        this.shadowRoot.querySelectorAll("[data-action]").forEach((btn) => {
            this.#navButtons.set(btn.dataset.action, btn);
        });
    }

    #bindEvents() {
        if (!this.#inputElement) return;

        this.#inputElement.addEventListener("input", (e) => {
            const query = e.target.value.trim();
            this.#debouncedSearch(query);
        });

        this.#inputElement.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                const direction = e.shiftKey ? "prev" : "next";
                this.#onNavigateCallback?.(direction);
            }
        });

        this.#optionButtons.forEach((btn, option) => {
            btn.addEventListener("click", () => {
                btn.classList.toggle("active");

                const query = this.#inputElement.value.trim();
                if (query) {
                    const options = this.#getCurrentOptions();
                    this.#onSearchCallback?.(query, options);
                }
            });
        });

        this.#navButtons.get("prev")?.addEventListener("click", () => {
            this.#onNavigateCallback?.("prev");
        });

        this.#navButtons.get("next")?.addEventListener("click", () => {
            this.#onNavigateCallback?.("next");
        });

        this.#navButtons.get("close")?.addEventListener("click", () => {
            this.hide("close-button");
        });
    }

    #getCurrentOptions() {
        return {
            caseSensitive: this.#optionButtons.get("caseSensitive")?.classList.contains("active"),
            wholeWord: this.#optionButtons.get("wholeWord")?.classList.contains("active"),
            useRegex: this.#optionButtons.get("useRegex")?.classList.contains("active"),
        };
    }

    #updateNavButtonStates(state) {
        const hasResults = state.getResults().length > 0;
        const isFirst = state.getCurrentIndex() === 0;
        const isLast = state.getCurrentIndex() === state.getResults().length - 1;

        if (this.#navButtons.has("prev")) {
            this.#navButtons.get("prev").disabled = !hasResults || isFirst;
        }

        if (this.#navButtons.has("next")) {
            this.#navButtons.get("next").disabled = !hasResults || isLast;
        }
    }

    /**
     * 显示错误提示（带自动消失动画）
     *
     * @param {string} message - 错误消息
     * @param {number} duration - 显示时长（毫秒），默认 3000ms
     */
    showError(message, duration = 3000) {
        // ✅ 创建或复用错误提示元素
        let errorEl = this.shadowRoot.querySelector(".search-error-toast");

        if (!errorEl) {
            errorEl = document.createElement("div");
            errorEl.className = "search-error-toast";
            errorEl.innerHTML = `<span class="error-icon">⚠️</span><span class="error-message"></span>`;
            this.shadowRoot.appendChild(errorEl);
        }

        // ✅ 设置错误消息
        errorEl.querySelector(".error-message").textContent = message;
        errorEl.classList.add("visible");

        // ✅ 自动隐藏（带动画）
        clearTimeout(this._errorTimer);
        this._errorTimer = setTimeout(() => {
            errorEl.classList.remove("visible");

            // 动画结束后移除 DOM
            setTimeout(() => {
                errorEl.remove();
            }, 300); // 与 CSS transition 时长匹配
        }, duration);

        errorHandler.handle(ERROR_CODE.SEARCH_DROPDOWN_SHOW_ERROR, `[SearchDropdown] ${message}`);
    }

    /**
     * 显示警告信息（轻量级，无图标）
     *
     * @param {string} message - 警告消息
     */
    showWarning(message) {
        if (this.#resultInfo) {
            this.#resultInfo.textContent = `⚠ ${message}`;
            this.#resultInfo.className = "search-result-info warning";

            // 3 秒后恢复
            setTimeout(() => {
                this.#resultInfo.textContent = "-";
                this.#resultInfo.className = "search-result-info";
            }, 3000);
        }

        errorHandler.warn(ERROR_CODE.SEARCH_DROPDOWN_WARNING, `[SearchDropdown] ${message}`);
    }
}
