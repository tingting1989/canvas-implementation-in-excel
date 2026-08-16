import { debounce } from "../../utils/helper.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import type { SearchState } from "./SearchState.js";

const template = document.createElement("template");
template.innerHTML = `
<style>
    :root {
        --dialog-bg: #3c3f41;
        --dialog-border: #555;
        --dialog-text: #ccc;
        --dialog-label: #bbb;
        --input-bg: #4a4d4f;
        --input-border: #5a5d5f;
        --input-text: #eee;
        --btn-default-bg: #4a4d4f;
        --btn-default-text: #ddd;
        --primary-color: #4a9ef5;
        --opt-btn-text: #aaa;
        --result-text: #888;
        --bar-bg: #353739;
        --tab-inactive: #999;
        --tab-hover: #ddd;
    }

    :host([data-theme="default"]),
    :host-context(:not(.dark)) {
        --dialog-bg: #ffffff;
        --dialog-border: #d9d9d9;
        --dialog-text: #333333;
        --dialog-label: #666666;
        --input-bg: #ffffff;
        --input-border: #d9d9d9;
        --input-text: #333333;
        --btn-default-bg: #f5f5f5;
        --btn-default-text: #333333;
        --primary-color: #1a73e8;
        --opt-btn-text: #666666;
        --result-text: #999999;
        --bar-bg: #fafafa;
        --tab-inactive: #666666;
        --tab-hover: #1a73e8;
    }

    .search-dropdown-panel {
        width: 460px;
        background: var(--dialog-bg);
        color: var(--dialog-text);
        font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
        font-size: 14px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        position: relative;
    }
    
    .tab-header {
        display: flex;
        background: var(--dialog-bg);
        border-bottom: 1px solid var(--dialog-border);
    }

    .tab-btn {
        flex: 1;
        padding: 10px 0;
        text-align: center;
        cursor: pointer;
        font-size: 14px;
        color: var(--tab-inactive);
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        transition: all .2s;
        user-select: none;
    }

    .tab-btn:hover {
        color: var(--tab-hover);
    }

    .tab-btn.active {
        color: var(--primary-color);
        border-bottom-color: var(--primary-color);
    }

    .tab-body {
        padding: 16px;
    }

    .tab-panel {
        display: none;
    }

    .tab-panel.active {
        display: block;
    }

    .input-row {
        display: flex;
        align-items: center;
        margin-bottom: 12px;
    }

    .input-row label {
        width: 72px;
        font-size: 13px;
        color: var(--dialog-label);
        flex-shrink: 0;
    }

    .input-row input[type="text"] {
        flex: 1;
        height: 30px;
        padding: 0 8px;
        font-size: 13px;
        color: var(--input-text);
        background: var(--input-bg);
        border: 1px solid var(--input-border);
        border-radius: 3px;
        outline: none;
        transition: border-color .2s;
        box-sizing: border-box;
        user-select: text;
        -webkit-user-select: text;
    }

    .input-row input[type="text"]:focus {
        border-color: var(--primary-color);
    }

    .options-row {
        display: flex;
        gap: 8px;
        margin-bottom: 6px;
        padding-left: 72px;
    }
    .search-result-info{
       padding-left: 72px;
    }
    .opt-btn {
        width: 30px;
        height: 26px;
        line-height: 24px;
        text-align: center;
        font-size: 12px;
        color: var(--opt-btn-text);
        background: var(--input-bg);
        border: 1px solid var(--input-border);
        border-radius: 3px;
        cursor: pointer;
        user-select: none;
        transition: all .2s;
    }

    .opt-btn:hover {
        color: var(--input-text);
        border-color: #777;
    }

    :host([data-theme="default"]) .opt-btn:hover,
    :host-context(:not(.dark)) .opt-btn:hover {
        border-color: #999;
    }

    .opt-btn.on {
        color: #fff;
        background: var(--primary-color);
        border-color: var(--primary-color);
    }

    .result-info {
        padding-left: 72px;
        font-size: 12px;
        color: var(--result-text);
        margin-bottom: 4px;
        min-height: 18px;
    }

    .result-info.no-results {
        color: #ff4d4f;
    }

    :host([data-theme="default"]) .result-info.no-results,
    :host-context(:not(.dark)) .result-info.no-results {
        color: #f44336;
    }

    .btn-bar {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 10px 16px;
        background: var(--bar-bg);
        border-top: 1px solid var(--input-border);
    }

    .action-btn {
        min-width: 70px;
        height: 30px;
        line-height: 30px;  
        padding: 0 14px;
        font-size: 14px;
        border-radius: 3px;
        border: 1px solid var(--input-border);
        cursor: pointer;
        transition: all .2s;
        user-select: none;
        box-sizing: border-box;
    }

    .action-btn.btn-default {
        color: var(--btn-default-text);
        background: var(--btn-default-bg);
    }

    .action-btn.btn-default:hover {
        background: var(--input-bg);
    }

    .action-btn.btn-primary {
        color: #fff;
        background: var(--primary-color);
        border-color: var(--primary-color);
    }

    .action-btn.btn-primary:hover {
        opacity: 0.9;
    }

    .action-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .btn-separator {
        width: 1px;
        height: 20px;
        background: var(--input-border);
        margin: 0 8px;
    }

    .error-toast {
        position: absolute;
        top: -40px;
        left: 50%;
        transform: translateX(-50%) translateY(10px);
        padding: 8px 16px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease-out;
        z-index: 1000;
        pointer-events: none;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .error-toast[data-type="error"] {
        background: #fff2f0;
        border: 1px solid #ffccc7;
        color: #cf1322;
        box-shadow: 0 2px 8px rgba(207,19,34,0.15);
    }

    .error-toast[data-type="warning"] {
        background: #fffbe6;
        border: 1px solid #ffe58f;
        color: #d48806;
        box-shadow: 0 2px 8px rgba(212,136,6,0.15);
    }

    :host([data-theme="dark"]) .error-toast[data-type="error"],
    :host-context(.dark) .error-toast[data-type="error"] {
        background: rgba(239,68,68,0.95);
        border-color: rgba(220,38,38,0.5);
        color: #fef2f2;
    }

    :host([data-theme="dark"]) .error-toast[data-type="warning"],
    :host-context(.dark) .error-toast[data-type="warning"] {
        background: rgba(250,173,20,0.95);
        border-color: rgba(245,158,11,0.5);
        color: #fffbeb;
    }
</style>

<div class="search-dropdown-panel">
    <div class="tab-header">
        <button class="tab-btn active" data-tab="find">查找(D)</button>
        <button class="tab-btn" data-tab="replace">替换(P)</button>
    </div>

    <div class="tab-body">
        <div class="tab-panel active" id="panel-find">
            <div class="input-row">
                <label for="findInput">查找内容(N)</label>
                <input type="text"
                       id="findInput"
                       class="form-input search-input"
                       placeholder="请输入要查找的内容"
                       autocomplete="off"
                       spellcheck="false" />
            </div>

            <div class="options-row">
                <button class="opt-btn" data-option="caseSensitive" title="区分大小写">Aa</button>
                <button class="opt-btn" data-option="wholeWord" title="全词匹配">W</button>
                <button class="opt-btn" data-option="useRegex" title="正则表达式">.*</button>
            </div>

            <div class="result-info search-result-info">-</div>
        </div>

        <div class="tab-panel" id="panel-replace">
            <div class="input-row">
                <label for="replaceFindInput">查找内容(N)</label>
                <input type="text"
                       id="replaceFindInput"
                       class="form-input search-input"
                       placeholder="请输入要查找的内容"
                       autocomplete="off"
                       spellcheck="false" />
            </div>

            <div class="input-row">
                <label for="replaceWithInput">替换为(E)</label>
                <input type="text"
                       id="replaceWithInput"
                       class="form-input replace-input"
                       placeholder="请输入替换内容"
                       autocomplete="off"
                       spellcheck="false" />
            </div>

            <div class="options-row">
                <button class="opt-btn" data-option="caseSensitive" title="区分大小写">Aa</button>
                <button class="opt-btn" data-option="wholeWord" title="全词匹配">W</button>
                <button class="opt-btn" data-option="useRegex" title="正则表达式">.*</button>
            </div>

            <div class="result-info search-result-info">-</div>
        </div>
    </div>

    <div class="btn-bar" id="btnBar-find">
        <button class="action-btn btn-default" data-action="prev">上一个</button>
        <button class="action-btn btn-primary" data-action="next">下一个</button>
        <button class="action-btn btn-default" data-action="close">关闭</button>
    </div>

    <div class="btn-bar" id="btnBar-replace" style="display:none;">
        <button class="action-btn btn-primary" data-action="replaceAll" title="替换所有匹配项 (Ctrl+Enter)">全部替换</button>
        <button class="action-btn btn-default" data-action="replace" title="替换当前匹配项 (Enter)">替换</button>
        <button class="action-btn btn-default" data-action="prev" title="上一个匹配项 (Shift+F3)">上一个</button>
        <button class="action-btn btn-primary" data-action="next" title="下一个匹配项 (F3)">下一个</button>
        <button class="action-btn btn-default" data-action="close" title="关闭面板 (Esc)">关闭</button>
    </div>

    <div class="error-toast" id="errorToast">
        <span class="error-icon">⚠</span>
        <span class="error-message"></span>
    </div>
</div>`;

/** 搜索选项配置 */
interface DropdownSearchOptions {
    caseSensitive: boolean;
    wholeWord: boolean;
    useRegex: boolean;
}

/** 回调函数集合 */
interface DropdownCallbacks {
    onSearch?: ((query: string, options: DropdownSearchOptions) => void) | null;
    onNavigate?: ((direction: "next" | "prev") => void) | null;
    onClose?: ((reason: string) => void) | null;
    onReplace?: ((replaceStr: string) => Promise<boolean>) | null;
    onReplaceAll?: ((replaceStr: string) => Promise<number>) | null;
}

/**
 * 搜索下拉面板 Web Component
 *
 * 提供搜索/替换功能的 UI 交互界面，使用 Shadow DOM 封装样式。
 * 支持"查找"和"替换"两个标签页，包含输入框、选项按钮和操作按钮。
 *
 * @extends HTMLElement
 * @module plugins/search/SearchDropdown
 */
export class SearchDropdown extends HTMLElement {
    /** @private 私有字段 - 搜索输入框 DOM 引用 */
    #inputElement: HTMLInputElement | null = null;

    /** @private 私有字段 - 结果计数显示区域 */
    #resultInfo: HTMLElement | null = null;

    /** @private 私有字段 - 选项按钮映射 */
    #optionButtons: Map<string, HTMLButtonElement> = new Map();

    /** @private 私有字段 - 导航按钮映射 */
    #navButtons: Map<string, HTMLButtonElement | HTMLButtonElement[]> = new Map();

    /** @private 私有字段 - 搜索回调函数 */
    #onSearchCallback: ((query: string, options: DropdownSearchOptions) => void) | null = null;

    /** @private 私有字段 - 导航回调函数 */
    #onNavigateCallback: ((direction: "next" | "prev") => void) | null = null;

    /** @private 私有字段 - 关闭回调函数 */
    #onCloseCallback: ((reason: string) => void) | null = null;

    /** @private 私有字段 - 替换当前项回调 */
    #onReplaceCallback: ((replaceStr: string) => Promise<boolean>) | null = null;

    /** @private 私有字段 - 全部替换回调 */
    #onReplaceAllCallback: ((replaceStr: string) => Promise<number>) | null = null;

    /** @private 私有字段 - 防抖后的搜索函数引用 */
    #debouncedSearch: any = null;

    /** @private 私有字段 - 替换输入框 DOM 引用 */
    #replaceInputElement: HTMLInputElement | null = null;

    /** @private 私有字段 - 标签页按钮集合 */
    #tabButtons: NodeListOf<HTMLButtonElement> | null = null;

    /** @private 私有字段 - 标签页内容集合 */
    #tabContents: NodeListOf<HTMLElement> | null = null;

    /** @private 私有字段 - 当前激活的标签页 */
    #activeTab: string = "find";

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot!.appendChild(template.content.cloneNode(true));
        this.#createDebouncedSearch();
    }

    /** Web Component 生命周期 - 元素挂载到 DOM 时调用 */
    connectedCallback(): void {
        this.#cacheDOMReferences();
        this.#bindEvents();
    }

    /** Web Component 生命周期 - 元素从 DOM 移除时调用 */
    disconnectedCallback(): void {
        this.#debouncedSearch?.cancel?.();
    }

    /**
     * @private 私有方法 - 创建防抖搜索函数
     */
    #createDebouncedSearch(): void {
        this.#debouncedSearch = debounce((query: string) => {
            if (query) {
                const options = this.#getCurrentOptions();
                this.#onSearchCallback?.(query, options);
            } else {
                if (this.#resultInfo) {
                    this.#resultInfo.textContent = "-";
                    this.#resultInfo.className = "search-result-info";
                }
            }
        }, 300);
    }

    /**
     * 初始化回调函数集合
     *
     * @param callbacks - 回调函数集合
     */
    initCallbacks(callbacks: DropdownCallbacks): void {
        this.#onSearchCallback = callbacks?.onSearch || null;
        this.#onNavigateCallback = callbacks?.onNavigate || null;
        this.#onCloseCallback = callbacks?.onClose || null;
        this.#onReplaceCallback = callbacks?.onReplace || null;
        this.#onReplaceAllCallback = callbacks?.onReplaceAll || null;
    }

    /** 聚焦当前激活标签页的搜索输入框 */
    focusInput(): void {
        const activeInput = this.#getActiveSearchInput();
        activeInput?.focus();
        activeInput?.select();
    }

    /**
     * 更新搜索结果显示信息
     *
     * @param state - 搜索状态管理器实例
     */
    updateResultInfo(state: SearchState): void {
        if (!state) return;

        const total = state.getResults().length;
        const current = state.getCurrentIndex() + 1;

        let text: string, className: string;

        if (total === 0) {
            text = "无结果";
            className = "search-result-info no-results";
        } else {
            text = `${current} / ${total}`;
            className = "search-result-info";
        }

        const resultInfos = this.shadowRoot!.querySelectorAll(".search-result-info");
        resultInfos.forEach((info) => {
            info.textContent = text;
            info.className = className;
        });

        this.#updateNavButtonStates(state);
    }

    /**
     * 显示错误信息 Toast 提示
     *
     * @param message - 错误消息文本
     */
    showError(message: string): void {
        const toast = this.shadowRoot!.getElementById?.("errorToast") || this.shadowRoot!.querySelector("#errorToast");
        if (!toast) return;

        toast.setAttribute("data-type", "error");

        const errorIcon = toast.querySelector(".error-icon");
        if (errorIcon) errorIcon.textContent = "⚠";

        const errorMsg = toast.querySelector(".error-message");
        if (errorMsg) errorMsg.textContent = message;

        toast.classList.add("visible");

        setTimeout(() => {
            toast.classList.remove("visible");
        }, 3000);
    }

    /**
     * 显示警告信息 Toast 提示
     *
     * @param message - 警告消息文本
     */
    showWarning(message: string): void {
        const toast = this.shadowRoot!.getElementById?.("errorToast") || this.shadowRoot!.querySelector("#errorToast");
        if (!toast) return;

        toast.setAttribute("data-type", "warning");

        const errorIcon = toast.querySelector(".error-icon");
        if (errorIcon) errorIcon.textContent = "⚡";

        const errorMsg = toast.querySelector(".error-message");
        if (errorMsg) errorMsg.textContent = message;

        toast.classList.add("visible");

        setTimeout(() => {
            toast.classList.remove("visible");
        }, 3000);
    }

    /**
     * 切换标签页（查找 / 替换）
     *
     * @param tabName - 目标标签页名称
     */
    switchTab(tabName: "find" | "replace"): void {
        if (!this.#tabButtons || !this.#tabContents) return;

        this.#tabButtons.forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.tab === tabName);
        });

        this.#tabContents.forEach((content) => {
            const isActive = content.id === `panel-${tabName}`;
            content.classList.toggle("active", isActive);

            if (isActive) {
                setTimeout(() => {
                    const input = content.querySelector<HTMLInputElement>(".search-input, .replace-input");
                    input?.focus();
                }, 100);
            }
        });

        const findBar = this.shadowRoot!.querySelector("#btnBar-find");
        const replaceBar = this.shadowRoot!.querySelector("#btnBar-replace");

        if (findBar && replaceBar) {
            (findBar as HTMLElement).style.display = tabName === "find" ? "flex" : "none";
            (replaceBar as HTMLElement).style.display = tabName === "replace" ? "flex" : "none";
        }

        this.#activeTab = tabName;
        this.#syncSearchInputs();
    }

    /**
     * @private 私有方法 - 缓存 Shadow DOM 内部元素的引用
     */
    #cacheDOMReferences(): void {
        const searchInputs = this.shadowRoot!.querySelectorAll<HTMLInputElement>(".search-input");
        this.#inputElement = searchInputs[0] || null;

        const replaceInput = this.shadowRoot!.querySelector<HTMLInputElement>(".replace-input");
        if (replaceInput) {
            this.#replaceInputElement = replaceInput;
        } else {
            this.#replaceInputElement = null;
        }

        const resultInfos = this.shadowRoot!.querySelectorAll<HTMLElement>(".search-result-info");
        this.#resultInfo = resultInfos[0] || null;

        this.#tabButtons = this.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tab-btn");
        this.#tabContents = this.shadowRoot!.querySelectorAll<HTMLElement>(".tab-panel");

        this.#navButtons.clear();

        this.shadowRoot!.querySelectorAll("[data-option]").forEach((btn) => {
            this.#optionButtons.set((btn as HTMLButtonElement).dataset.option!, btn as HTMLButtonElement);
        });

        this.shadowRoot!.querySelectorAll("[data-action]").forEach((btn) => {
            const action = (btn as HTMLButtonElement).dataset.action!;
            if (this.#navButtons.has(action)) {
                const existing = this.#navButtons.get(action)!;
                if (Array.isArray(existing)) {
                    existing.push(btn as HTMLButtonElement);
                } else {
                    this.#navButtons.set(action, [existing as HTMLButtonElement, btn as HTMLButtonElement]);
                }
            } else {
                this.#navButtons.set(action, btn as HTMLButtonElement);
            }
        });
    }

    /**
     * @private 私有方法 - 绑定所有 DOM 事件监听器
     */
    #bindEvents(): void {
        const allSearchInputs = this.shadowRoot!.querySelectorAll(".search-input");

        allSearchInputs.forEach((input) => {
            input.addEventListener("input", (e) => {
                const query = (e.target as HTMLInputElement).value.trim();

                allSearchInputs.forEach((otherInput) => {
                    if (otherInput !== e.target) {
                        (otherInput as HTMLInputElement).value = (e.target as HTMLInputElement).value;
                    }
                });

                this.#debouncedSearch(query);
            });

            input.addEventListener("keydown", (e) => {
                if ((e as KeyboardEvent).key === "Enter") {
                    e.preventDefault();

                    if ((e as KeyboardEvent).ctrlKey || (e as KeyboardEvent).metaKey) {
                        this.#handleReplaceAllWithAutoSwitch();
                        return;
                    }

                    const direction = (e as KeyboardEvent).shiftKey ? "prev" : "next";
                    this.#onNavigateCallback?.(direction);
                }
            });
        });

        this.#optionButtons.forEach((btn, option) => {
            btn.addEventListener("click", () => {
                btn.classList.toggle("on");

                const activeInput = this.#getActiveSearchInput();
                const query = activeInput?.value.trim() || "";

                if (query) {
                    const options = this.#getCurrentOptions();
                    this.#onSearchCallback?.(query, options);
                }
            });
        });

        const prevBtns = this.#navButtons.get("prev");
        if (Array.isArray(prevBtns)) {
            prevBtns.forEach((btn) =>
                btn?.addEventListener("click", () => {
                    this.#onNavigateCallback?.("prev");
                }),
            );
        } else if (prevBtns) {
            prevBtns.addEventListener("click", () => {
                this.#onNavigateCallback?.("prev");
            });
        }

        const nextBtns = this.#navButtons.get("next");
        if (Array.isArray(nextBtns)) {
            nextBtns.forEach((btn) =>
                btn?.addEventListener("click", () => {
                    this.#onNavigateCallback?.("next");
                }),
            );
        } else if (nextBtns) {
            nextBtns.addEventListener("click", () => {
                this.#onNavigateCallback?.("next");
            });
        }

        const closeBtns = this.#navButtons.get("close");
        if (Array.isArray(closeBtns)) {
            closeBtns.forEach((btn) =>
                btn?.addEventListener("click", () => {
                    this.#onCloseCallback?.("close-button");
                }),
            );
        } else if (closeBtns) {
            closeBtns.addEventListener("click", () => {
                this.#onCloseCallback?.("close-button");
            });
        }

        this.#tabButtons?.forEach((btn) => {
            btn.addEventListener("click", () => {
                const tabName = btn.dataset.tab;
                if (tabName) {
                    this.switchTab(tabName as "find" | "replace");
                }
            });
        });

        const replaceBtns = this.#navButtons.get("replace");
        if (Array.isArray(replaceBtns)) {
            replaceBtns.forEach((btn) =>
                btn?.addEventListener("click", async () => {
                    await this.#handleReplace();
                }),
            );
        } else if (replaceBtns) {
            replaceBtns.addEventListener("click", async () => {
                await this.#handleReplace();
            });
        }
        const replaceAllBtns = this.#navButtons.get("replaceAll");
        if (Array.isArray(replaceAllBtns)) {
            replaceAllBtns.forEach((btn) =>
                btn?.addEventListener("click", async () => {
                    await this.#handleReplaceAll();
                }),
            );
        } else if (replaceAllBtns) {
            replaceAllBtns.addEventListener("click", async () => {
                await this.#handleReplaceAll();
            });
        }

        const replaceInputForEvents = this.#getReplaceInput();
        if (replaceInputForEvents) {
            replaceInputForEvents.addEventListener("keydown", async (e) => {
                if ((e as KeyboardEvent).key === "Enter") {
                    e.preventDefault();
                    if ((e as KeyboardEvent).ctrlKey || (e as KeyboardEvent).metaKey) {
                        await this.#handleReplaceAll();
                    } else {
                        await this.#handleReplace();
                    }
                }
            });
        }
    }

    /**
     * @private 私有方法 - 同步所有搜索输入框的值
     */
    #syncSearchInputs(): void {
        if (!this.#inputElement) return;

        const allSearchInputs = this.shadowRoot!.querySelectorAll(".search-input");
        const value = this.#inputElement.value;

        allSearchInputs.forEach((input, index) => {
            if (index > 0 && input !== this.#inputElement) {
                (input as HTMLInputElement).value = value;
            }
        });
    }

    /**
     * @private 私有方法 - 获取当前激活标签页的搜索输入框
     */
    #getActiveSearchInput(): HTMLInputElement | null {
        if (this.#activeTab === "find") {
            return this.shadowRoot!.querySelector("#panel-find .search-input");
        } else {
            return this.shadowRoot!.querySelector("#panel-replace .search-input");
        }
    }

    /**
     * @private 私有方法 - 获取替换输入框元素
     */
    #getReplaceInput(): HTMLInputElement | null {
        if (this.#replaceInputElement) {
            return this.#replaceInputElement;
        }

        const replaceInput = this.shadowRoot!.querySelector(".replace-input");
        if (replaceInput) {
            this.#replaceInputElement = replaceInput as HTMLInputElement;
        }

        return this.#replaceInputElement;
    }

    /**
     * @private 私有方法 - 获取当前搜索选项配置
     */
    #getCurrentOptions(): DropdownSearchOptions {
        return {
            caseSensitive: this.#optionButtons.get("caseSensitive")?.classList.contains("on") || false,
            wholeWord: this.#optionButtons.get("wholeWord")?.classList.contains("on") || false,
            useRegex: this.#optionButtons.get("useRegex")?.classList.contains("on") || false,
        };
    }

    /**
     * @private 私有方法 - 处理单个替换操作
     */
    async #handleReplace(): Promise<void> {
        if (!this.#onReplaceCallback) {
            return;
        }

        const replaceInputElement = this.#getReplaceInput();
        if (!replaceInputElement) {
            this.showError("未找到替换输入框");
            return;
        }

        const replaceStr = replaceInputElement.value.trim();
        if (!replaceStr) {
            this.showError("请输入替换内容");
            return;
        }

        try {
            this.#setActionButtonsDisabled(true);

            const success = await this.#onReplaceCallback(replaceStr);

            if (success) {
                this.#onNavigateCallback?.("next");
            }
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.SEARCH_REPLACE_ERROR, `替换操作失败: ${error.message}`, { error });
            this.showError(`替换失败: ${error.message}`);
        } finally {
            this.#setActionButtonsDisabled(false);
        }
    }

    /**
     * @private 私有方法 - 自动切换到替换标签页后执行全部替换
     */
    async #handleReplaceAllWithAutoSwitch(): Promise<void> {
        if (this.#activeTab !== "replace") {
            this.switchTab("replace");
            await new Promise((resolve) => setTimeout(resolve, 150));
        }
        await this.#handleReplaceAll();
    }

    /**
     * @private 私有方法 - 处理全部替换操作
     */
    async #handleReplaceAll(): Promise<void> {
        if (!this.#onReplaceAllCallback) {
            this.showError("替换功能未初始化");
            return;
        }
        const replaceInputElement = this.#getReplaceInput();
        if (!replaceInputElement) {
            this.showError("未找到替换输入框");
            return;
        }
        const replaceStr = replaceInputElement.value.trim();

        try {
            this.#setActionButtonsDisabled(true);

            const count = await this.#onReplaceAllCallback(replaceStr);

            if (count > 0) {
                const query = this.#getActiveSearchInput()?.value.trim() || "";
                if (query) {
                    const options = this.#getCurrentOptions();
                    this.#onSearchCallback?.(query, options);
                }
            }
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.SEARCH_REPLACE_ALL_ERROR, `全部替换操作失败: ${error.message}`, { error });
        } finally {
            this.#setActionButtonsDisabled(false);
        }
    }

    /**
     * @private 私有方法 - 设置所有操作按钮的禁用状态
     */
    #setActionButtonsDisabled(disabled: boolean): void {
        this.#navButtons.forEach((btnOrArray) => {
            if (Array.isArray(btnOrArray)) {
                btnOrArray.forEach((btn) => {
                    if (btn) btn.disabled = disabled;
                });
            } else {
                btnOrArray.disabled = disabled;
            }
        });
    }

    /**
     * @private 私有方法 - 更新导航按钮的启用/禁用状态
     */
    #updateNavButtonStates(state: SearchState): void {
        const total = state.getResults().length;

        const prevBtn = this.#navButtons.get("prev");
        const nextBtn = this.#navButtons.get("next");

        if (prevBtn) {
            if (Array.isArray(prevBtn)) {
                prevBtn.forEach((btn) => {
                    if (btn) btn.disabled = total <= 1;
                });
            } else {
                prevBtn.disabled = total <= 1;
            }
        }

        if (nextBtn) {
            if (Array.isArray(nextBtn)) {
                nextBtn.forEach((btn) => {
                    if (btn) btn.disabled = total <= 1;
                });
            } else {
                nextBtn.disabled = total <= 1;
            }
        }
    }
}

customElements.define("search-dropdown", SearchDropdown);
