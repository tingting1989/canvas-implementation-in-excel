/**
 * 搜索面板 Web Component (Search Dropdown)
 *
 * 继承 PopupPanel 基类，使用 Shadow DOM 实现样式隔离，
 * 提供类似 Excel Ctrl+F 的搜索交互界面。
 *
 * ## 核心功能
 * - **搜索输入框**: 支持实时搜索（带 300ms 防抖）
 * - **选项按钮**: 大小写敏感(Aa)、全字匹配(W)、正则表达式(.*)
 * - **导航按钮**: 上一个、下一个
 * - **结果计数**: 显示 "当前/总数" 格式
 * - **错误提示**: Toast 形式的错误/警告消息
 * - **标签页切换**: 查找和替换两个模式
 *
 * ## 技术架构
 * ### Shadow DOM 优势
 * - **样式隔离**: 不受外部 CSS 影响（避免样式冲突）
 * - **封装性**: 内部实现细节对外部透明
 * - **可复用**: 可在页面任意位置安全使用
 *
 * ### 主题支持
 * - ✅ 支持 defaultThemeConfig (亮色主题)
 * - ✅ 支持 darkThemeConfig (暗色主题)
 * - ✅ 通过 CSS 变量实现动态主题切换
 * - ✅ UI 设计与 find-replace.html 保持一致
 *
 * ## 使用示例
 * ```javascript
 * // 方式1：通过 document.createElement 创建（推荐）
 * const dropdown = document.createElement("search-dropdown");
 *
 * // 方式2：使用工厂方法创建
 * const dropdown = SearchDropdown.create();
 *
 * const popupId = dropdown.show(
 *   { x: 100, y: 50 },                    // 显示位置
 *   {
 *     onSearch: (query, opts) => console.log(query),
 *     onNavigate: (dir) => console.log(dir),
 *     onClose: (reason) => console.log(reason),
 *   }
 * );
 *
 * // 更新结果状态
 * dropdown.updateResultInfo(state);
 *
 * // 显示错误提示
 * dropdown.showError("正则语法错误");
 *
 * // 关闭面板
 * dropdown.hide();
 * ```
 *
 * @class SearchDropdown
 * @extends {PopupPanel}
 * @see {@link SearchUIManager} - 控制器（调用方）
 * @see {@link PopupPanel} - 父类
 * @see {@link PopupManager} - 弹窗管理器
 */
import { PopupPanel } from "../../ui/components/PopupPanel.js";
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
        border: 1px solid var(--dialog-border);
        border-radius: 4px;
        box-shadow: 0 8px 30px rgba(0,0,0,.5);
        color: var(--dialog-text);
        font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
        font-size: 13px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
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
        padding: 18px 20px 14px;
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
        padding: 10px 20px;
        background: var(--bar-bg);
        border-top: 1px solid var(--input-border);
    }

    .action-btn {
        min-width: 80px;
        height: 30px;
        padding: 0 14px;
        font-size: 13px;
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

    .error-toast.visible {
        opacity: 1;
        visibility: visible;
        transform: translateX(-50%) translateY(0);
    }

    :host([data-theme="dark"]) .error-toast,
    :host-context(.dark) .error-toast {
        background: rgba(239,68,68,0.95);
        border-color: rgba(220,38,38,0.5);
        color: #fef2f2;
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
        <button class="action-btn btn-default" data-action="findAll">查找全部</button>
        <button class="action-btn btn-default" data-action="prev">上一个</button>
        <button class="action-btn btn-primary" data-action="next">下一个</button>
        <button class="action-btn btn-default" data-action="close">关闭</button>
    </div>

    <div class="btn-bar" id="btnBar-replace" style="display:none;">
        <button class="action-btn btn-primary" data-action="replaceAll" title="替换所有匹配项 (Ctrl+Enter)">全部替换</button>
        <button class="action-btn btn-default" data-action="replace" title="替换当前匹配项 (Enter)">替换</button>
        <div class="btn-separator"></div>
        <button class="action-btn btn-default" data-action="findAll" title="查找所有匹配项">查找全部</button>
        <button class="action-btn btn-default" data-action="prev" title="上一个匹配项 (Shift+F3)">上一个</button>
        <button class="action-btn btn-primary" data-action="next" title="下一个匹配项 (F3)">下一个</button>
        <div class="btn-separator"></div>
        <button class="action-btn btn-default" data-action="close" title="关闭面板 (Esc)">关闭</button>
    </div>

    <div class="error-toast" id="errorToast">
        <span class="error-icon">⚠</span>
        <span class="error-message"></span>
    </div>
</div>`;

export class SearchDropdown extends PopupPanel {
    /** @type {boolean} 是否可见（覆盖父类） */
    #visible = false;

    /** @type {Symbol|null} 弹窗标识符 */
    /** @type {HTMLInputElement|null} 搜索输入框 DOM 引用 */
    #inputElement = null;

    /** @type {HTMLElement|null} 结果计数显示区域 */
    #resultInfo = null;

    /** @type {Map<string, HTMLButtonElement>} 选项按钮映射（key: option name） */
    #optionButtons = new Map();

    /** @type {Map<string, HTMLButtonElement>} 导航按钮映射（key: action name） */
    #navButtons = new Map();

    /** @type {Function|null} 搜索回调函数 (query, options) => void */
    #onSearchCallback = null;

    /** @type {Function|null} 导航回调函数 (direction: "next"|"prev") => void */
    #onNavigateCallback = null;

    /** @type {Function|null} 关闭回调函数 (reason: string) => void */
    #onCloseCallback = null;

    /** @type {Function|null} 替换当前项回调 (replaceStr: string) => Promise<boolean> */
    #onReplaceCallback = null;

    /** @type {Function|null} 全部替换回调 (replaceStr: string) => Promise<number> */
    #onReplaceAllCallback = null;

    /**
     * 防抖后的搜索函数引用
     * @type {Function}
     */
    #debouncedSearch = null;

    /** @type {HTMLInputElement|null} 替换输入框 DOM 引用（替换页签） */
    #replaceInputElement = null;

    /** @type {NodeListOf<HTMLButtonElement>|null} 标签页按钮集合 */
    #tabButtons = null;

    /** @type {NodeListOf<HTMLElement>|null} 标签页内容集合 */
    #tabContents = null;

    /** @type {string} 当前激活的标签页 ('find' | 'replace') */
    #activeTab = "find";

    constructor() {
        super();
        this.#createDebouncedSearch();
    }

    render() {
        if (!this.shadowRoot.querySelector(".search-dropdown-panel")) {
            this.shadowRoot.appendChild(template.content.cloneNode(true));
        }
    }

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
        this.render();
        this.#cacheDOMReferences();
        this.#bindEvents();
    }

    show(position, callbacks) {
        this.#onSearchCallback = callbacks?.onSearch || null;
        this.#onNavigateCallback = callbacks?.onNavigate || null;
        this.#onCloseCallback = callbacks?.onClose || null;
        this.#onReplaceCallback = callbacks?.onReplace || null;
        this.#onReplaceAllCallback = callbacks?.onReplaceAll || null;

        super.show({
            position,
            zIndex: undefined,
            closeOnClickOutside: false,
            closeOnEscape: true,
        });

        this.#inputElement?.focus();
        this.#inputElement?.select();

        return Symbol("search-dropdown");
    }

    hide(reason = "user-close") {
        this.#debouncedSearch?.cancel?.();
        super.hide(reason);
        this.#onCloseCallback?.(reason);
    }

    focusInput() {
        const activeInput = this.#getActiveSearchInput();
        activeInput?.focus();
        activeInput?.select();
    }

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

    showError(message) {
        const toast = this.shadowRoot.getElementById?.("errorToast") || this.shadowRoot.querySelector("#errorToast");
        if (!toast) return;

        const errorMsg = toast.querySelector(".error-message");
        if (errorMsg) errorMsg.textContent = message;

        toast.classList.add("visible");

        setTimeout(() => {
            toast.classList.remove("visible");
        }, 3000);
    }

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

    #cacheDOMReferences() {
        console.log("[SearchDropdown] #cacheDOMReferences called");

        const searchInputs = this.shadowRoot.querySelectorAll(".search-input");
        this.#inputElement = searchInputs[0] || null;
        console.log(`[SearchDropdown] Found ${searchInputs.length} search inputs, cached first one`);

        // 延迟缓存替换输入框（可能在替换面板渲染后才可用）
        const replaceInput = this.shadowRoot.querySelector(".replace-input");
        if (replaceInput) {
            this.#replaceInputElement = replaceInput;
            console.log("[SearchDropdown] Replace input element found and cached");
        } else {
            console.warn("[SearchDropdown] .replace-input not found during cacheDOMReferences, will query on demand");
            this.#replaceInputElement = null;
        }

        const resultInfos = this.shadowRoot.querySelectorAll(".search-result-info");
        this.#resultInfo = resultInfos[0] || null;

        this.#tabButtons = this.shadowRoot.querySelectorAll(".tab-btn");
        this.#tabContents = this.shadowRoot.querySelectorAll(".tab-panel");

        console.log("[SearchDropdown] Caching navigation buttons...");
        this.#navButtons.clear(); // 清空旧缓存

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

        console.log("[SearchDropdown] Navigation buttons cached:");
        this.#navButtons.forEach((value, key) => {
            const count = Array.isArray(value) ? value.length : 1;
            console.log(`  - ${key}: ${count} button(s)`);
        });

        // 特别检查"全部替换"按钮
        const replaceAllBtn = this.#navButtons.get("replaceAll");
        if (!replaceAllBtn) {
            console.error("[SearchDropdown] ⚠️  WARNING: 'replaceAll' button NOT found in DOM!");
        } else {
            console.log("[SearchDropdown] ✅ 'replaceAll' button found:", replaceAllBtn);
        }
    }

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
                if (e.key === "Enter") {
                    e.preventDefault();

                    // Ctrl+Enter 或 Cmd+Enter → 执行全部替换
                    if (e.ctrlKey || e.metaKey) {
                        console.log("[SearchDropdown] Ctrl+Enter detected in search input, triggering replace all");
                        this.#handleReplaceAllWithAutoSwitch();
                        return;
                    }

                    // 普通 Enter → 导航到下一个/上一个
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
                    this.hide("close-button");
                }),
            );
        } else if (closeBtns) {
            closeBtns.addEventListener("click", () => {
                this.hide("close-button");
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
        console.log("[SearchDropdown] Binding 'replaceAll' event, buttons:", replaceAllBtns);

        if (Array.isArray(replaceAllBtns)) {
            console.log(`[SearchDropdown] Binding click event to ${replaceAllBtns.length} 'replaceAll' buttons`);
            replaceAllBtns.forEach((btn) =>
                btn?.addEventListener("click", async () => {
                    console.log("[SearchDropdown] 'replaceAll' button clicked (array)");
                    await this.#handleReplaceAll();
                }),
            );
        } else if (replaceAllBtns) {
            console.log("[SearchDropdown] Binding click event to single 'replaceAll' button");
            replaceAllBtns.addEventListener("click", async () => {
                console.log("[SearchDropdown] 'replaceAll' button clicked (single)");
                await this.#handleReplaceAll();
            });
        } else {
            console.error("[SearchDropdown] ❌ ERROR: No 'replaceAll' buttons found to bind events!");
        }

        const findAllBtns = this.#navButtons.get("findAll");
        if (Array.isArray(findAllBtns)) {
            findAllBtns.forEach((btn) => {
                btn?.addEventListener("click", () => {
                    const query = this.#getActiveSearchInput()?.value.trim() || "";
                    if (query) {
                        const options = this.#getCurrentOptions();
                        this.#onSearchCallback?.(query, options);
                    }
                });
            });
        } else {
            findAllBtns?.addEventListener("click", () => {
                const query = this.#getActiveSearchInput()?.value.trim() || "";
                if (query) {
                    const options = this.#getCurrentOptions();
                    this.#onSearchCallback?.(query, options);
                }
            });
        }

        const replaceInputForEvents = this.#getReplaceInput();
        if (replaceInputForEvents) {
            replaceInputForEvents.addEventListener("keydown", async (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.ctrlKey || e.metaKey) {
                        await this.#handleReplaceAll();
                    } else {
                        await this.#handleReplace();
                    }
                }
            });
        } else {
            console.warn("[SearchDropdown] Could not bind keydown event to replace input (element not found)");
        }
    }

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

    #getActiveSearchInput() {
        if (this.#activeTab === "find") {
            return this.shadowRoot.querySelector("#panel-find .search-input");
        } else {
            return this.shadowRoot.querySelector("#panel-replace .search-input");
        }
    }

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

    #getCurrentOptions() {
        return {
            caseSensitive: this.#optionButtons.get("caseSensitive")?.classList.contains("on") || false,
            wholeWord: this.#optionButtons.get("wholeWord")?.classList.contains("on") || false,
            useRegex: this.#optionButtons.get("useRegex")?.classList.contains("on") || false,
        };
    }

    async #handleReplace() {
        if (!this.#onReplaceCallback) {
            console.warn("[SearchDropdown] onReplaceCallback is not set");
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
            errorHandler.error(ERROR_CODE.SEARCH_REPLACE_FAILED, `替换操作失败: ${error.message}`, { error });
            this.showError(`替换失败: ${error.message}`);
        } finally {
            this.#setActionButtonsDisabled(false);
        }
    }

    /**
     * 自动切换到替换标签并执行全部替换
     *
     * 当用户在查找输入框中按 Ctrl+Enter 时调用此方法。
     * 会先切换到替换标签（如果需要），然后执行全部替换操作。
     *
     * @private
     * @async
     */
    async #handleReplaceAllWithAutoSwitch() {
        console.log("[SearchDropdown] #handleReplaceAllWithAutoSwitch called");

        // 如果当前在查找标签，切换到替换标签
        if (this.#activeTab !== "replace") {
            console.log("[SearchDropdown] Auto-switching to replace tab");
            this.switchTab("replace");

            // 等待 DOM 更新完成后再执行替换
            await new Promise((resolve) => setTimeout(resolve, 150));
        }

        // 执行全部替换
        await this.#handleReplaceAll();
    }

    async #handleReplaceAll() {
        console.log("[SearchDropdown] #handleReplaceAll called");

        if (!this.#onReplaceAllCallback) {
            console.error("[SearchDropdown] onReplaceAllCallback is not set!");
            this.showError("替换功能未初始化");
            return;
        }

        const replaceInputElement = this.#getReplaceInput();
        console.log("[SearchDropdown] Replace input element:", replaceInputElement, "value:", replaceInputElement?.value);

        if (!replaceInputElement) {
            console.error("[SearchDropdown] Replace input element not found!");
            this.showError("未找到替换输入框");
            return;
        }

        const replaceStr = replaceInputElement.value.trim();

        // 允许空字符串替换（用于删除匹配内容）
        console.log(`[SearchDropdown] Executing replace all with value: "${replaceStr}"`);

        try {
            this.#setActionButtonsDisabled(true);

            const count = await this.#onReplaceAllCallback(replaceStr);
            console.log(`[SearchDropdown] Replace all completed, replaced ${count} items`);

            if (count > 0) {
                const query = this.#getActiveSearchInput()?.value.trim() || "";
                if (query) {
                    const options = this.#getCurrentOptions();
                    this.#onSearchCallback?.(query, options);
                }
            }
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_REPLACE_ALL_FAILED, `全部替换操作失败: ${error.message}`, { error });
            this.showError(`全部替换失败: ${error.message}`);
        } finally {
            this.#setActionButtonsDisabled(false);
        }
    }

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
