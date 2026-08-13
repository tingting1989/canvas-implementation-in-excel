import { debounce } from "../../utils/helper.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { errorHandler } from "../../core/ErrorHandler.js";

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
        user-select: text;           /* 允许文本选择（支持 Ctrl+A/X/C/V） */
        -webkit-user-select: text;  /* Safari/Chrome 兼容 */
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

    /* Error 样式（红色） */
    .error-toast[data-type="error"] {
        background: #fff2f0;
        border: 1px solid #ffccc7;
        color: #cf1322;
        box-shadow: 0 2px 8px rgba(207,19,34,0.15);
    }

    /* Warning 样式（橙色） */
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

/**
 * 搜索下拉面板 Web Component
 *
 * 提供搜索/替换功能的 UI 交互界面，使用 Shadow DOM 封装样式。
 * 支持"查找"和"替换"两个标签页，包含输入框、选项按钮和操作按钮。
 *
 * ## 功能特性
 * - **双标签页**: 查找(D) 和 替换(P) 两种模式切换
 * - **搜索选项**: 大小写敏感(Aa)、全词匹配(W)、正则表达式(.*)
 * - **结果导航**: 上一个/下一个按钮，支持 Enter/Shift+Enter 快捷键
 * - **替换操作**: 单个替换和全部替换，支持 Ctrl+Enter 快捷全部替换
 * - **错误提示**: Toast 样式的错误/警告信息显示
 * - **主题适配**: 自动适配深色/浅色主题
 *
 * ## 生命周期
 * 1. `constructor()`: 创建 Shadow DOM，克隆模板，初始化防抖搜索
 * 2. `connectedCallback()`: 缓存 DOM 引用，绑定事件
 * 3. `disconnectedCallback()`: 取消防抖搜索
 *
 * @class SearchDropdown
 * @extends HTMLElement
 * @see {@link SearchUIManager} - 控制此组件的显示/隐藏和回调绑定
 */
export class SearchDropdown extends HTMLElement {
    /**
     * @private 私有字段 - 搜索输入框 DOM 引用
     * @type {HTMLInputElement|null}
     */
    #inputElement = null;

    /**
     * @private 私有字段 - 结果计数显示区域
     * @type {HTMLElement|null}
     */
    #resultInfo = null;

    /**
     * @private 私有字段 - 选项按钮映射（key: option name）
     * @type {Map<string, HTMLButtonElement>}
     */
    #optionButtons = new Map();

    /**
     * @private 私有字段 - 导航按钮映射（key: action name）
     * @type {Map<string, HTMLButtonElement>}
     */
    #navButtons = new Map();

    /**
     * @private 私有字段 - 搜索回调函数
     * @type {Function|null}
     */
    #onSearchCallback = null;

    /**
     * @private 私有字段 - 导航回调函数
     * @type {Function|null}
     */
    #onNavigateCallback = null;

    /**
     * @private 私有字段 - 关闭回调函数
     * @type {Function|null}
     */
    #onCloseCallback = null;

    /**
     * @private 私有字段 - 替换当前项回调
     * @type {Function|null}
     */
    #onReplaceCallback = null;

    /**
     * @private 私有字段 - 全部替换回调
     * @type {Function|null}
     */
    #onReplaceAllCallback = null;

    /**
     * @private 私有字段 - 防抖后的搜索函数引用
     * @type {Function}
     */
    #debouncedSearch = null;

    /**
     * @private 私有字段 - 替换输入框 DOM 引用（替换页签）
     * @type {HTMLInputElement|null}
     */
    #replaceInputElement = null;

    /**
     * @private 私有字段 - 标签页按钮集合
     * @type {NodeListOf<HTMLButtonElement>|null}
     */
    #tabButtons = null;

    /**
     * @private 私有字段 - 标签页内容集合
     * @type {NodeListOf<HTMLElement>|null}
     */
    #tabContents = null;

    /**
     * @private 私有字段 - 当前激活的标签页
     * @type {string}
     */
    #activeTab = "find";

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot.appendChild(template.content.cloneNode(true));
        this.#createDebouncedSearch();
    }

    /**
     * Web Component 生命周期 - 元素挂载到 DOM 时调用
     *
     * 缓存 Shadow DOM 内部元素的引用并绑定事件监听器。
     *
     * @returns {void}
     */
    connectedCallback() {
        this.#cacheDOMReferences();
        this.#bindEvents();
    }

    /**
     * Web Component 生命周期 - 元素从 DOM 移除时调用
     *
     * 取消防抖搜索函数，避免内存泄漏。
     *
     * @returns {void}
     */
    disconnectedCallback() {
        this.#debouncedSearch?.cancel?.();
    }

    /**
     * @private 私有方法 - 创建防抖搜索函数
     *
     * 使用 300ms 防抖包装搜索回调，避免用户快速输入时频繁触发搜索。
     * 空查询时重置结果信息显示为默认状态。
     *
     * @returns {void}
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

    /**
     * 初始化回调函数集合
     *
     * 由 SearchUIManager 在创建面板后调用，
     * 绑定搜索、导航、替换、关闭等核心回调。
     *
     * @param {Object} callbacks - 回调函数集合
     * @param {Function} [callbacks.onSearch] - 搜索回调 (query, options) => void
     * @param {Function} [callbacks.onNavigate] - 导航回调 (direction: "next"|"prev") => void
     * @param {Function} [callbacks.onClose] - 关闭回调 (reason: string) => void
     * @param {Function} [callbacks.onReplace] - 替换回调 (replaceStr: string) => Promise<boolean>
     * @param {Function} [callbacks.onReplaceAll] - 全部替换回调 (replaceStr: string) => Promise<number>
     * @returns {void}
     */
    initCallbacks(callbacks) {
        this.#onSearchCallback = callbacks?.onSearch || null;
        this.#onNavigateCallback = callbacks?.onNavigate || null;
        this.#onCloseCallback = callbacks?.onClose || null;
        this.#onReplaceCallback = callbacks?.onReplace || null;
        this.#onReplaceAllCallback = callbacks?.onReplaceAll || null;
    }

    /**
     * 聚焦当前激活标签页的搜索输入框
     *
     * 同时选中输入框中的文本，方便用户直接输入新内容。
     *
     * @returns {void}
     */
    focusInput() {
        const activeInput = this.#getActiveSearchInput();
        activeInput?.focus();
        activeInput?.select();
    }

    /**
     * 更新搜索结果显示信息
     *
     * 根据当前搜索状态更新结果计数（如 "3 / 10"），
     * 无结果时显示红色"无结果"提示，并同步更新导航按钮状态。
     *
     * @param {import("./SearchState.js")} state - 搜索状态管理器实例
     * @returns {void}
     */
    updateResultInfo(state) {
        if (!state) return;

        const total = state.getResults().length;
        const current = state.getCurrentIndex() + 1;

        let text, className;

        if (total === 0) {
            text = "无结果";
            className = "search-result-info no-results";
        } else {
            text = `${current} / ${total}`;
            className = "search-result-info";
        }

        const resultInfos = this.shadowRoot.querySelectorAll(".search-result-info");
        resultInfos.forEach((info) => {
            info.textContent = text;
            info.className = className;
        });

        this.#updateNavButtonStates(state);
    }

    /**
     * 显示错误信息 Toast 提示
     *
     * 以红色样式显示错误信息，3 秒后自动消失。
     * 用于正则表达式语法错误、替换失败等场景。
     *
     * @param {string} message - 错误消息文本
     * @returns {void}
     */
    showError(message) {
        const toast = this.shadowRoot.getElementById?.("errorToast") || this.shadowRoot.querySelector("#errorToast");
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
     * 以橙色样式显示警告信息，3 秒后自动消失。
     * 用于搜索范围为空、结果被截断等场景。
     *
     * @param {string} message - 警告消息文本
     * @returns {void}
     */
    showWarning(message) {
        const toast = this.shadowRoot.getElementById?.("errorToast") || this.shadowRoot.querySelector("#errorToast");
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
     * 切换激活的标签页，更新按钮高亮状态和面板可见性，
     * 自动聚焦新标签页的输入框，并同步搜索输入框内容。
     *
     * @param {"find"|"replace"} tabName - 目标标签页名称
     * @returns {void}
     */
    switchTab(tabName) {
        if (!this.#tabButtons || !this.#tabContents) return;

        this.#tabButtons.forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.tab === tabName);
        });

        this.#tabContents.forEach((content) => {
            const isActive = content.id === `panel-${tabName}`;
            content.classList.toggle("active", isActive);

            if (isActive) {
                setTimeout(() => {
                    const input = content.querySelector(".search-input, .replace-input");
                    input?.focus();
                }, 100);
            }
        });

        const findBar = this.shadowRoot.querySelector("#btnBar-find");
        const replaceBar = this.shadowRoot.querySelector("#btnBar-replace");

        if (findBar && replaceBar) {
            findBar.style.display = tabName === "find" ? "flex" : "none";
            replaceBar.style.display = tabName === "replace" ? "flex" : "none";
        }

        this.#activeTab = tabName;
        this.#syncSearchInputs();
    }

    /**
     * @private 私有方法 - 缓存 Shadow DOM 内部元素的引用
     *
     * 在 connectedCallback 中调用，将常用的 DOM 元素引用
     * 缓存到私有字段中，避免后续频繁查询 DOM。
     * 包括：输入框、结果信息区、标签页按钮、选项按钮、操作按钮。
     *
     * @returns {void}
     */
    #cacheDOMReferences() {
        const searchInputs = this.shadowRoot.querySelectorAll(".search-input");
        this.#inputElement = searchInputs[0] || null;

        const replaceInput = this.shadowRoot.querySelector(".replace-input");
        if (replaceInput) {
            this.#replaceInputElement = replaceInput;
        } else {
            this.#replaceInputElement = null;
        }

        const resultInfos = this.shadowRoot.querySelectorAll(".search-result-info");
        this.#resultInfo = resultInfos[0] || null;

        this.#tabButtons = this.shadowRoot.querySelectorAll(".tab-btn");
        this.#tabContents = this.shadowRoot.querySelectorAll(".tab-panel");

        this.#navButtons.clear();

        this.shadowRoot.querySelectorAll("[data-option]").forEach((btn) => {
            this.#optionButtons.set(btn.dataset.option, btn);
        });

        this.shadowRoot.querySelectorAll("[data-action]").forEach((btn) => {
            const action = btn.dataset.action;
            if (this.#navButtons.has(action)) {
                const existing = this.#navButtons.get(action);
                if (Array.isArray(existing)) {
                    existing.push(btn);
                } else {
                    this.#navButtons.set(action, [existing, btn]);
                }
            } else {
                this.#navButtons.set(action, btn);
            }
        });
    }

    /**
     * @private 私有方法 - 绑定所有 DOM 事件监听器
     *
     * 在 connectedCallback 中调用，为以下元素注册事件：
     * - 搜索输入框: input 事件（防抖搜索）、keydown 事件（Enter 导航/Ctrl+Enter 全部替换）
     * - 选项按钮: click 事件（切换大小写/全词/正则选项）
     * - 导航按钮: click 事件（上一个/下一个/关闭）
     * - 标签页按钮: click 事件（切换查找/替换标签页）
     * - 替换按钮: click 事件（单个替换/全部替换）
     * - 替换输入框: keydown 事件（Enter 替换/Ctrl+Enter 全部替换）
     *
     * @returns {void}
     */
    #bindEvents() {
        const allSearchInputs = this.shadowRoot.querySelectorAll(".search-input");

        allSearchInputs.forEach((input) => {
            input.addEventListener("input", (e) => {
                const query = e.target.value.trim();

                allSearchInputs.forEach((otherInput) => {
                    if (otherInput !== e.target) {
                        otherInput.value = e.target.value;
                    }
                });

                this.#debouncedSearch(query);
            });

            input.addEventListener("keydown", (e) => {
                // 只拦截 Enter 键，其他快捷键（Ctrl+X/Z/V/A/C）保持浏览器默认行为
                if (e.key === "Enter") {
                    e.preventDefault();

                    if (e.ctrlKey || e.metaKey) {
                        this.#handleReplaceAllWithAutoSwitch();
                        return;
                    }

                    const direction = e.shiftKey ? "prev" : "next";
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
                    this.switchTab(tabName);
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
                // 只拦截 Enter 键，其他快捷键（Ctrl+X/Z/V/A/C）保持浏览器默认行为
                if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.ctrlKey || e.metaKey) {
                        await this.#handleReplaceAll();
                    } else {
                        await this.#handleReplace();
                    }
                }
                // 其他所有按键不阻止
            });
        }
    }

    /**
     * @private 私有方法 - 同步所有搜索输入框的值
     *
     * 查找和替换标签页各有一个搜索输入框，
     * 此方法确保两个输入框的内容保持一致。
     *
     * @returns {void}
     */
    #syncSearchInputs() {
        if (!this.#inputElement) return;

        const allSearchInputs = this.shadowRoot.querySelectorAll(".search-input");
        const value = this.#inputElement.value;

        allSearchInputs.forEach((input, index) => {
            if (index > 0 && input !== this.#inputElement) {
                input.value = value;
            }
        });
    }

    /**
     * @private 私有方法 - 获取当前激活标签页的搜索输入框
     *
     * 根据当前标签页（find/replace）返回对应的搜索输入框元素。
     *
     * @returns {HTMLInputElement|null} 当前激活的搜索输入框
     */
    #getActiveSearchInput() {
        if (this.#activeTab === "find") {
            return this.shadowRoot.querySelector("#panel-find .search-input");
        } else {
            return this.shadowRoot.querySelector("#panel-replace .search-input");
        }
    }

    /**
     * @private 私有方法 - 获取替换输入框元素
     *
     * 优先使用缓存的引用，未缓存时从 Shadow DOM 查询并缓存。
     *
     * @returns {HTMLInputElement|null} 替换输入框元素
     */
    #getReplaceInput() {
        if (this.#replaceInputElement) {
            return this.#replaceInputElement;
        }

        const replaceInput = this.shadowRoot.querySelector(".replace-input");
        if (replaceInput) {
            this.#replaceInputElement = replaceInput;
        }

        return replaceInput;
    }

    /**
     * @private 私有方法 - 获取当前搜索选项配置
     *
     * 读取选项按钮的激活状态，构建搜索选项对象。
     * 选项包括：大小写敏感(caseSensitive)、全词匹配(wholeWord)、正则表达式(useRegex)。
     *
     * @returns {{caseSensitive: boolean, wholeWord: boolean, useRegex: boolean}} 当前搜索选项
     */
    #getCurrentOptions() {
        return {
            caseSensitive: this.#optionButtons.get("caseSensitive")?.classList.contains("on") || false,
            wholeWord: this.#optionButtons.get("wholeWord")?.classList.contains("on") || false,
            useRegex: this.#optionButtons.get("useRegex")?.classList.contains("on") || false,
        };
    }

    /**
     * @private 私有方法 - 处理单个替换操作
     *
     * 执行流程：
     * 1. 验证替换回调和输入框是否存在
     * 2. 获取替换文本并校验非空
     * 3. 禁用操作按钮防止重复点击
     * 4. 调用替换回调执行实际替换
     * 5. 替换成功后自动导航到下一个结果
     *
     * @returns {Promise<void>}
     */
    async #handleReplace() {
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
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_REPLACE_ERROR, `替换操作失败: ${error.message}`, { error });
            this.showError(`替换失败: ${error.message}`);
        } finally {
            this.#setActionButtonsDisabled(false);
        }
    }

    /**
     * @private 私有方法 - 自动切换到替换标签页后执行全部替换
     *
     * 如果当前在查找标签页，先切换到替换标签页，
     * 等待 150ms 渲染完成后再执行全部替换操作。
     * 用于支持 Ctrl+Enter 快捷键在查找页签触发全部替换。
     *
     * @returns {Promise<void>}
     */
    async #handleReplaceAllWithAutoSwitch() {
        if (this.#activeTab !== "replace") {
            this.switchTab("replace");
            await new Promise((resolve) => setTimeout(resolve, 150));
        }
        await this.#handleReplaceAll();
    }

    /**
     * @private 私有方法 - 处理全部替换操作
     *
     * 执行流程：
     * 1. 验证全部替换回调是否存在
     * 2. 获取替换文本
     * 3. 禁用操作按钮防止重复点击
     * 4. 调用全部替换回调执行批量替换
     * 5. 替换成功后重新执行搜索以更新结果
     *
     * @returns {Promise<void>}
     */
    async #handleReplaceAll() {
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
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_REPLACE_ALL_ERROR, `全部替换操作失败: ${error.message}`, { error });
        } finally {
            this.#setActionButtonsDisabled(false);
        }
    }

    /**
     * @private 私有方法 - 设置所有操作按钮的禁用状态
     *
     * 在替换操作进行中禁用按钮防止重复点击，
     * 操作完成后恢复按钮可用状态。
     * 支持单个按钮和按钮数组两种格式。
     *
     * @param {boolean} disabled - 是否禁用所有操作按钮
     * @returns {void}
     */
    #setActionButtonsDisabled(disabled) {
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
     *
     * 根据搜索结果数量控制上一个/下一个按钮的可用性：
     * - 结果数 <= 1 时禁用导航按钮（无意义导航）
     * - 结果数 > 1 时启用导航按钮
     *
     * @param {import("./SearchState.js")} state - 搜索状态管理器实例
     * @returns {void}
     */
    #updateNavButtonStates(state) {
        const total = state.getResults().length;
        const current = state.getCurrentIndex();

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
