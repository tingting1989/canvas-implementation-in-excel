/**
 * 搜索面板 Web Component (Search Dropdown)
 *
 * 继承 PopupPanel 基类，使用 Shadow DOM 实现样式隔离，
 * 提供类似 Excel Ctrl+F 的搜索交互界面。
 *
 * ## 核心功能
 * - **搜索输入框**: 支持实时搜索（带 300ms 防抖）
 * - **选项按钮**: 大小写敏感(Aa)、全字匹配(W)、正则表达式(.*)
 * - **导航按钮**: 上一个(▲)、下一个(▼)
 * - **结果计数**: 显示 "当前/总数" 格式
 * - **错误提示**: Toast 形式的错误/警告消息
 *
 * ## 技术架构
 * ### Shadow DOM 优势
 * - **样式隔离**: 不受外部 CSS 影响（避免样式冲突）
 * - **封装性**: 内部实现细节对外部透明
 * - **可复用**: 可在页面任意位置安全使用
 *
 * ### 事件处理机制
 * - **输入事件**: 通过 `debounce` 工具函数防抖（避免频繁触发）
 * - **键盘事件**: Enter 导航、Esc 关闭
 * - **回调通知**: 通过构造时传入的回调函数与外部通信
 *
 * ## 设计规范遵循
 * - ✅ 使用项目统一的 `PopupPanel` 基类
 * - ✅ 支持 `PopupManager` 注册/注销生命周期
 * - ✅ 使用 `errorHandler` 统一日志输出
 * - ✅ 支持暗色主题 (`:host-context(.dark)`)
 * - ✅ 无障碍支持（title 属性、语义化标签）
 *
 * ## 使用示例
 * ```javascript
 * const dropdown = new SearchDropdown();
 *
 * const popupId = dropdown.show(
 *   { x: 100, y: 50 },                    // 显示位置
 *   (query, opts) => console.log(query),  // 搜索回调
 *   (dir) => console.log(dir),            // 导航回调
 *   (reason) => console.log(reason)       // 关闭回调
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
 * @see {@link SearchUIController} - 控制器（调用方）
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

    /* ========== 标签页样式 (Excel 风格) ========== */

    /* 标签页头部容器 */
    .tab-header {
        display: flex;
        border-bottom: 1px solid #e5e7eb;
        margin-bottom: 12px;
        padding: 0 4px;
    }

    /* 单个标签页按钮 */
    .tab-btn {
        position: relative;
        padding: 8px 16px;
        margin-right: 4px;
        border: none;
        background: transparent;
        color: #666;
        font-size: 13px;
        font-weight: 400;
        cursor: pointer;
        transition: all 0.2s ease;
        border-bottom: 2px solid transparent;
    }

    .tab-btn:hover {
        color: #1890ff;
        background: rgba(24,144,255,0.04);
    }

    .tab-btn.active {
        color: #1890ff;
        font-weight: 600;
        border-bottom-color: #1890ff;
    }

    /* 标签页内容容器 */
    .tab-content {
        display: none;
    }

    .tab-content.active {
        display: block;
        animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    /* 表单行（标签 + 输入框） */
    .form-row {
        display: flex;
        align-items: center;
        margin-bottom: 10px;
        gap: 8px;
    }

    .form-label {
        min-width: 70px;
        font-size: 13px;
        color: #333;
        text-align: right;
        flex-shrink: 0;
    }

    .form-input {
        flex: 1;
        height: 30px;
        padding: 6px 10px;
        border: 1px solid #d9d9d9;
        border-radius: 4px;
        background: white;
        color: #333;
        font-size: 13px;
        outline: none;
        transition: all 0.2s ease;
        box-sizing: border-box;
    }

    .form-input:focus {
        border-color: #1890ff;
        box-shadow: 0 0 0 2px rgba(24,144,255,0.15);
    }

    .form-input::placeholder {
        color: #bfbfbf;
    }

    :host-context(.dark) .form-label {
        color: #d9d9d9;
    }

    :host-context(.dark) .form-input,
    :host([data-theme="dark"]) .form-input {
        background: #262626;
        border-color: #434343;
        color: #d9d9d9;
    }

    :host-context(.dark) .form-input:focus,
    :host([data-theme="dark"]) .form-input:focus {
        border-color: #177ddc;
        box-shadow: 0 0 0 2px rgba(23,125,220,0.25);
    }

    :host-context(.dark) .form-input::placeholder,
    :host([data-theme="dark"]) .form-input::placeholder {
        color: #595959;
    }

    /* 选项行 */
    .options-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid #f0f0f0;
    }

    .options-left {
        display: flex;
        gap: 6px;
    }

    /* 按钮组 */
    .action-buttons {
        display: flex;
        gap: 6px;
        margin-top: 16px;
    }

    .action-btn {
        height: 30px;
        padding: 0 16px;
        border: 1px solid #d9d9d9;
        border-radius: 4px;
        background: white;
        color: #333;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
    }

    .action-btn:hover:not(:disabled) {
        background: #f5f5f5;
        border-color: #bfbfbf;
        color: #1890ff;
    }

    .action-btn:active:not(:disabled) {
        transform: scale(0.98);
    }

    .action-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .action-btn.primary {
        background: #1890ff;
        border-color: #1890ff;
        color: white;
        font-weight: 500;
    }

    .action-btn.primary:hover:not(:disabled) {
        background: #40a9ff;
        border-color: #40a9ff;
    }

    .action-btn.success {
        background: #52c41a;
        border-color: #52c41a;
        color: white;
        font-weight: 500;
    }

    .action-btn.success:hover:not(:disabled) {
        background: #73d13d;
        border-color: #73d13d;
    }

    :host-context(.dark) .action-btn,
    :host([data-theme="dark"]) .action-btn {
        background: #262626;
        border-color: #434343;
        color: #d9d9d9;
    }

    :host-context(.dark) .action-btn:hover:not(:disabled),
    :host([data-theme="dark"]) .action-btn:hover:not(:disabled) {
        background: #303030;
        border-color: #595959;
        color: #177ddc;
    }

    :host-context(.dark) .action-btn.primary,
    :host([data-theme="dark"]) .action-btn.primary {
        background: #177ddc;
        border-color: #177ddc;
        color: white;
    }

    :host-context(.dark) .action-btn.primary:hover:not(:disabled),
    :host([data-theme="dark"]) .action-btn.primary:hover:not(:disabled) {
        background: #3aa1ff;
        border-color: #3aa1ff;
    }

    :host-context(.dark) .action-btn.success,
    :host([data-theme="dark"]) .action-btn.success {
        background: #389e0d;
        border-color: #389e0d;
        color: white;
    }

    :host-context(.dark) .action-btn.success:hover:not(:disabled),
    :host([data-theme="dark"]) .action-btn.success:hover:not(:disabled) {
        background: #49aa19;
        border-color: #49aa19;
    }

    :host-context(.dark) .options-row,
    :host([data-theme="dark"]) .options-row {
        border-top-color: #303030;
    }

    :host-context(.dark) .tab-header,
    :host([data-theme="dark"]) .tab-header {
        border-bottom-color: #434343;
    }

    :host-context(.dark) .tab-btn,
    :host([data-theme="dark"]) .tab-btn {
        color: #8c8c8c;
    }

    :host-context(.dark) .tab-btn:hover,
    :host([data-theme="dark")] .tab-btn:hover {
        color: #177ddc;
        background: rgba(23,125,220,0.08);
    }

    :host-context(.dark) .tab-btn.active,
    :host([data-theme="dark"]) .tab-btn.active {
        color: #177ddc;
        border-bottom-color: #177ddc;
    }
</style>

<div class="search-dropdown-panel">
    <!-- 标签页头部 -->
    <div class="tab-header">
        <button class="tab-btn active" data-tab="find">查找(D)</button>
        <button class="tab-btn" data-tab="replace">替换(P)</button>
    </div>

    <!-- 查找标签页内容 -->
    <div class="tab-content active" id="tab-find">
        <div class="form-row">
            <label class="form-label">查找内容(N)</label>
            <input type="text"
                   class="form-input search-input"
                   placeholder="输入查找内容..."
                   autocomplete="off"
                   spellcheck="false" />
        </div>

        <div class="options-row">
            <div class="options-left">
                <button class="search-option-btn" data-option="caseSensitive" title="区分大小写 (Alt+C)">Aa</button>
                <button class="search-option-btn" data-option="wholeWord" title="全字匹配 (Alt+W)">W</button>
                <button class="search-option-btn" data-option="useRegex" title="使用正则 (Alt+R)">.*</button>
            </div>
            <div class="search-result-info">-</div>
        </div>

        <div class="action-buttons">
            <button class="action-btn" data-action="findAll" title="查找全部">查找全部(I)</button>
            <button class="action-btn" data-action="prev" title="上一个 (Shift+F3)">上一个(V)</button>
            <button class="action-btn primary" data-action="next" title="下一个 (F3)">下一个(F)</button>
            <button class="action-btn" data-action="close" title="关闭 (Esc)">关闭</button>
        </div>
    </div>

    <!-- 替换标签页内容 -->
    <div class="tab-content" id="tab-replace">
        <div class="form-row">
            <label class="form-label">查找内容(N)</label>
            <input type="text"
                   class="form-input search-input"
                   placeholder="输入查找内容..."
                   autocomplete="off"
                   spellcheck="false" />
        </div>

        <div class="form-row">
            <label class="form-label">替换为(E)</label>
            <input type="text"
                   class="form-input replace-input"
                   placeholder="输入替换内容..."
                   autocomplete="off"
                   spellcheck="false" />
        </div>

        <div class="options-row">
            <div class="options-left">
                <button class="search-option-btn" data-option="caseSensitive" title="区分大小写 (Alt+C)">Aa</button>
                <button class="search-option-btn" data-option="wholeWord" title="全字匹配 (Alt+W)">W</button>
                <button class="search-option-btn" data-option="useRegex" title="使用正则 (Alt+R)">.*</button>
            </div>
            <div class="search-result-info">-</div>
        </div>

        <div class="action-buttons">
            <button class="action-btn success" data-action="replaceAll" title="全部替换 (Ctrl+Enter)">全部替换(A)</button>
            <button class="action-btn" data-action="replace" title="替换当前项 (Enter)">替换(R)</button>
            <button class="action-btn" data-action="findAll" title="查找全部">查找全部(I)</button>
            <button class="action-btn" data-action="prev" title="上一个 (Shift+F3)">上一个(V)</button>
            <button class="action-btn primary" data-action="next" title="下一个 (F3)">下一个(F)</button>
            <button class="action-btn" data-action="close" title="关闭 (Esc)">关闭</button>
        </div>
    </div>
</div>
`;

export class SearchDropdown extends PopupPanel {
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
     *
     * 使用 `debounce` 工具函数包装，延迟 300ms 执行，
     * 避免用户快速输入时频繁触发搜索操作。
     *
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

    /**
     * 创建搜索面板实例
     *
     * 初始化流程：
     * 1. 调用父类构造函数（无参数）
     * 2. 创建防抖搜索函数（300ms 延迟）
     *
     * 注意：
     * - 此时 **不** 绑定事件和缓存 DOM 引用
     * - Shadow DOM 模板在 render() 方法中渲染
     * - 这些操作延迟到 `connectedCallback`（元素插入 DOM 时）执行
     *
     * @constructor
     * @override
     *
     * @example
     * const dropdown = new SearchDropdown(); // 仅创建实例，未挂载到 DOM
     */
    constructor() {
        super();
        this.#createDebouncedSearch();
    }

    /**
     * 渲染组件
     *
     * 创建 Shadow DOM 结构（仅在首次渲染时执行）
     *
     * @override
     * @returns {void}
     */
    render() {
        if (!this.shadowRoot.querySelector(".search-dropdown-panel")) {
            this.shadowRoot.appendChild(template.content.cloneNode(true));
        }
    }

    /**
     * 创建防抖搜索函数
     *
     * 封装实际搜索逻辑，添加 300ms 延迟执行。
     * 如果在延迟期间再次调用，则重置计时器（经典 debounce 行为）。
     *
     * ### 防抖行为
     * - 用户停止输入 300ms 后才触发搜索
     * - 快速连续输入时仅执行最后一次
     * - 空查询时重置结果显示为 "-"
     *
     * @private
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
     * Web Component 生命周期钩子：元素插入 DOM 时调用
     *
     * 在此阶段安全地访问 DOM 和绑定事件，
     * 因为此时 Shadow DOM 已完成渲染。
     *
     * 执行顺序：
     * 1. 调用父类 `connectedCallback`（PopupPanel 初始化）
     * 2. 缓存所有需要的 DOM 元素引用
     * 3. 绑定用户交互事件监听器
     *
     * @override
     * @returns {void}
     */
    connectedCallback() {
        super.connectedCallback();
        this.#cacheDOMReferences();
        this.#bindEvents();
    }

    /**
     * 显示搜索面板
     *
     * 这是面板的主要入口方法，负责：
     * 1. 保存外部传入的回调函数
     * 2. 调用父类 `show()` 方法处理定位、层级等通用逻辑
     * 3. 自动聚焦输入框并选中已有文本
     * 4. 返回唯一标识符用于 PopupManager 注册
     *
     * ### 配置说明
     * - `zIndex`: 使用 `undefined` 让父类使用默认值 `DEFAULT_Z_INDEX` (10000)
     * - `closeOnClickOutside`: 设为 false（点击外部不关闭，由 Esc 或按钮控制）
     * - `closeOnEscape`: 设为 true（支持 Esc 快捷键关闭）
     *
     * @public
     * @override
     * @param {{ x: number, y: number }} position - 屏幕绝对坐标（左上角位置）
     * @param {Object} callbacks - 回调函数集合
     * @param {Function} callbacks.onSearch - 搜索回调
     *   @param {string} callbacks.onSearch.query - 用户输入的查询字符串
     *   @param {Object} callbacks.onSearch.options - 当前选项配置
     *   @returns {void}
     * @param {Function} callbacks.onNavigate - 导航回调
     *   @param {"next"|"prev"} callbacks.onNavigate.direction - 导航方向
     *   @returns {void}
     * @param {Function} [callbacks.onReplace] - 替换当前项回调（可选）
     *   @param {string} callbacks.onReplace.replaceStr - 替换文本
     *   @returns {Promise<boolean>}
     * @param {Function} [callbacks.onReplaceAll] - 全部替换回调（可选）
     *   @param {string} callbacks.onReplaceAll.replaceStr - 替换文本
     *   @returns {Promise<number>} 替换数量
     * @param {Function} callbacks.onClose - 关闭回调
     *   @param {string} callbacks.onClose.reason - 关闭原因标识
     *   @returns {void}
     * @returns {Symbol} 唯一的面板标识符（用于 PopupManager 注册）
     *
     * @example
     * const popupId = dropdown.show(
     *   { x: 800, y: 100 },
     *   {
     *     onSearch: (q, opts) => plugin.query(q, opts),
     *     onNavigate: (dir) => dir === "next" ? plugin.findNext() : plugin.findPrevious(),
     *     onReplace: (str) => plugin.replace(str),
     *     onReplaceAll: (str) => plugin.replaceAll(str),
     *     onClose: (reason) => console.log("关闭原因:", reason),
     *   }
     * );
     */
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

    /**
     * 隐藏搜索面板
     *
     * 执行清理工作：
     * 1. 取消可能正在等待执行的防抖搜索（避免隐藏后仍触发）
     * 2. 调用父类 `hide()` 处理动画和 DOM 移除
     * 3. 通知外部组件（通过 onClose 回调）
     *
     * ### 关闭原因分类
     * - `"user-close"`: 默认值，用户主动关闭
     * - `"close-button"`: 点击 ✕ 按钮
     * - `"escape"`: 按 Esc 键
     * - `"programmatic"`: 代码调用 hide()
     *
     * @public
     * @override
     * @param {string} [reason="user-close"] - 关闭原因标识符
     * @returns {void}
     *
     * @example
     * dropdown.hide("escape"); // 用户按 Esc 关闭
     */
    hide(reason = "user-close") {
        this.#debouncedSearch?.cancel();
        super.hide(reason);
        this.#onCloseCallback?.(reason);
    }

    /**
     * 聚焦搜索输入框并选中文本
     *
     * 典型使用场景：
     * - 面板刚打开时自动聚焦
     * - 用户从其他区域返回时恢复焦点
     * - 外部控制器调用以提升用户体验
     *
     * 会自动聚焦到当前激活页签的搜索输入框。
     *
     * 安全性保证：
     * - 即使 inputElement 为 null 也不会报错（可选链操作符）
     *
     * @public
     * @returns {void}
     *
     * @example
     * dropdown.focusInput(); // 光标定位到输入框，已有文本被全选
     */
    focusInput() {
        const activeInput = this.#getActiveSearchInput();
        activeInput?.focus();
        activeInput?.select();
    }

    /**
     * 更新结果信息显示
     *
     * 根据最新的 SearchState 同步更新 UI：
     * - **有结果**: 显示 "当前索引 / 总数" 格式（如 "3 / 10"）
     * - **无结果**: 显示红色 "无结果" 提示
     * - **导航状态**: 根据当前位置启用/禁用导航按钮
     *
     * 会同时更新两个页签的结果信息显示。
     *
     * 索引转换说明：
     * - 内部存储从 0 开始，但用户界面显示从 1 开始
     * - 因此 `current = currentIndex + 1`
     *
     * @public
     * @param {import("./SearchState.js")} state - 最新的搜索状态对象
     * @returns {void}
     *
     * @example
     * dropdown.updateResultInfo(plugin.getState());
     // UI 显示: "3 / 10" （假设在第 3 个结果，共 10 个）
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

        // ✅ 更新两个页签的结果信息（查找 + 替换）
        const resultInfos = this.shadowRoot.querySelectorAll(".search-result-info");
        resultInfos.forEach((info) => {
            info.textContent = text;
            info.className = className;
        });

        this.#updateNavButtonStates(state);
    }

    /**
     * 缓存 DOM 元素引用
     *
     * 在 `connectedCallback` 中调用一次，
     * 将频繁使用的 DOM 查询结果保存到实例属性中，
     * 避免每次交互都重新查询 Shadow DOM。
     *
     * ### 缓存策略
     * - **单一元素**: 直接赋值（#inputElement, #resultInfo）
     * - **批量元素**: 使用 Map 存储（#optionButtons, #navButtons）
     *   - key: data 属性值（如 "caseSensitive", "next"）
     *   - value: 对应的 HTMLElement 引用
     *
     * @private
     * @returns {void}
     */
    #cacheDOMReferences() {
        // ✅ 缓存所有搜索输入框（查找页签 + 替换页签）
        const searchInputs = this.shadowRoot.querySelectorAll(".search-input");
        this.#inputElement = searchInputs[0] || null; // 第一个搜索框（查找页签）

        // ✅ 缓存替换输入框
        this.#replaceInputElement = this.shadowRoot.querySelector(".replace-input");

        // ✅ 缓存结果信息（两个页签各一个）
        const resultInfos = this.shadowRoot.querySelectorAll(".search-result-info");
        this.#resultInfo = resultInfos[0] || null;

        // ✅ 缓存标签页按钮
        this.#tabButtons = this.shadowRoot.querySelectorAll(".tab-btn");

        // ✅ 缓存标签页内容
        this.#tabContents = this.shadowRoot.querySelectorAll(".tab-content");

        this.shadowRoot.querySelectorAll("[data-option]").forEach((btn) => {
            this.#optionButtons.set(btn.dataset.option, btn);
        });

        this.shadowRoot.querySelectorAll("[data-action]").forEach((btn) => {
            const action = btn.dataset.action;

            // ✅ 如果该 action 已存在，转换为数组存储多个按钮
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
     * 绑定所有用户交互事件
     *
     * 事件类型及处理逻辑：
     *
     * | 事件源 | 事件类型 | 处理逻辑 |
     * |--------|---------|---------|
     * | 搜索输入框（两个） | `input` | 防抖搜索（300ms） + 同步值 |
     * | 搜索输入框（两个） | `keydown` (Enter) | 导航到下一个/上一个 |
     * | 选项按钮 | `click` | 切换激活态 + 重新搜索 |
     * | 上一个按钮 | `click` | 导航到上一个结果 |
     * | 下一个按钮 | `click` | 导航到下一个结果 |
     * | 关闭按钮 | `click` | 隐藏面板 |
     * | 标签页按钮 | `click` | 切换标签页 |
     * | 替换/全部替换按钮 | `click` | 执行替换操作 |
     *
     * ### 性能优化
     * - 所有回调使用箭头函数避免 `this` 绑定问题
     * - 使用可选链 (`?.`) 安全调用可能为空的回调
     * - 搜索输入框值自动同步
     *
     * @private
     * @returns {void}
     */
    #bindEvents() {
        // ✅ 绑定所有搜索输入框的事件（查找页签 + 替换页签）
        const allSearchInputs = this.shadowRoot.querySelectorAll(".search-input");

        allSearchInputs.forEach((input) => {
            input.addEventListener("input", (e) => {
                const query = e.target.value.trim();

                // ✅ 同步所有搜索输入框的值
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
                    const direction = e.shiftKey ? "prev" : "next";
                    this.#onNavigateCallback?.(direction);
                }
            });
        });

        this.#optionButtons.forEach((btn, option) => {
            btn.addEventListener("click", () => {
                btn.classList.toggle("active");

                // ✅ 使用当前激活的搜索输入框获取查询内容
                const activeInput = this.#getActiveSearchInput();
                const query = activeInput?.value.trim() || "";

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

        // ✅ 标签页切换事件绑定
        this.#tabButtons?.forEach((btn) => {
            btn.addEventListener("click", () => {
                const tabName = btn.dataset.tab;
                if (tabName) {
                    this.switchTab(tabName);
                }
            });
        });

        // ✅ 替换功能事件绑定
        this.#navButtons.get("replace")?.addEventListener("click", async () => {
            await this.#handleReplace();
        });

        this.#navButtons.get("replaceAll")?.addEventListener("click", async () => {
            await this.#handleReplaceAll();
        });

        // ✅ 查找全部按钮（两个页签都有）
        this.#navButtons.get("findAll")?.forEach?.((btn) => {
            btn?.addEventListener("click", () => {
                const query = this.#getActiveSearchInput()?.value.trim() || "";
                if (query) {
                    const options = this.#getCurrentOptions();
                    this.#onSearchCallback?.(query, options);
                }
            });
        }) ||
            this.#navButtons.get("findAll")?.addEventListener("click", () => {
                const query = this.#getActiveSearchInput()?.value.trim() || "";
                if (query) {
                    const options = this.#getCurrentOptions();
                    this.#onSearchCallback?.(query, options);
                }
            });

        // ✅ 替换输入框键盘事件（Enter 执行替换）
        this.#replaceInputElement?.addEventListener("keydown", async (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                if (e.ctrlKey || e.metaKey) {
                    await this.#handleReplaceAll();
                } else {
                    await this.#handleReplace();
                }
            }
        });
    }

    /**
     * 切换标签页
     *
     * @param {string} tabName - 目标标签页名称 ('find' | 'replace')
     * @public
     * @returns {void}
     */
    switchTab(tabName) {
        if (!this.#tabButtons || !this.#tabContents) return;

        // 更新标签页按钮状态
        this.#tabButtons.forEach((btn) => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });

        // 更新标签页内容显示
        this.#tabContents.forEach((content) => {
            if (content.id === `tab-${tabName}`) {
                content.classList.add("active");
                // 自动聚焦到对应页签的搜索框
                setTimeout(() => {
                    const input = content.querySelector(".search-input, .replace-input");
                    input?.focus();
                }, 100);
            } else {
                content.classList.remove("active");
            }
        });

        this.#activeTab = tabName;

        // 同步两个页签的搜索输入框值
        this.#syncSearchInputs();
    }

    /**
     * 同步两个页签的搜索输入框值
     *
     * 当用户在查找页签输入内容后切换到替换页签时，
     * 自动将查找内容同步到替换页签的查找框。
     *
     * @private
     * @returns {void}
     */
    #syncSearchInputs() {
        if (!this.#inputElement) return;

        const allSearchInputs = this.shadowRoot.querySelectorAll(".search-input");

        // 将第一个搜索框的值同步到其他搜索框
        const value = this.#inputElement.value;
        allSearchInputs.forEach((input, index) => {
            if (index > 0 && input !== this.#inputElement) {
                input.value = value;
            }
        });
    }

    /**
     * 获取当前激活页签的搜索输入框
     *
     * @private
     * @returns {HTMLInputElement|null}
     */
    #getActiveSearchInput() {
        if (this.#activeTab === "find") {
            return this.shadowRoot.querySelector("#tab-find .search-input");
        } else {
            return this.shadowRoot.querySelector("#tab-replace .search-input");
        }
    }

    /**
     * 切换到替换标签页
     *
     * @public
     * @returns {void}
     */
    showReplaceSection() {
        this.switchTab("replace");
    }

    /**
     * 切换到查找标签页
     *
     * @public
     * @returns {void}
     */
    hideReplaceSection() {
        this.switchTab("find");
    }

    /**
     * 处理单个替换操作
     *
     * 读取替换输入框的值，调用 onReplaceCallback，
     * 并在成功后自动导航到下一个匹配项。
     *
     * @private
     * @returns {Promise<void>}
     */
    async #handleReplace() {
        if (!this.#onReplaceCallback || !this.#replaceInputElement) return;

        const replaceStr = this.#replaceInputElement.value.trim();
        if (!replaceStr) return;

        try {
            // 禁用按钮防止重复点击
            this.#setActionButtonsDisabled(true);

            const success = await this.#onReplaceCallback(replaceStr);

            if (success) {
                // 替换成功后自动跳转到下一个
                this.#onNavigateCallback?.("next");
            }
        } catch (error) {
            console.error("[SearchDropdown] Replace error:", error);
        } finally {
            this.#setActionButtonsDisabled(false);
        }
    }

    /**
     * 处理全部替换操作
     *
     * 读取替换输入框的值，调用 onReplaceAllCallback，
     * 并显示替换结果提示。
     *
     * @private
     * @returns {Promise<void>}
     */
    async #handleReplaceAll() {
        if (!this.#onReplaceAllCallback || !this.#replaceInputElement) return;

        const replaceStr = this.#replaceInputElement.value.trim();
        if (!replaceStr) return;

        try {
            // 禁用按钮防止重复点击
            this.#setActionButtonsDisabled(true);

            const count = await this.#onReplaceAllCallback(replaceStr);

            // 显示替换结果提示
            if (count > 0) {
                this.showToast(`已替换 ${count} 个单元格`, "success");
            } else {
                this.showToast("没有可替换的内容", "warning");
            }
        } catch (error) {
            console.error("[SearchDropdown] ReplaceAll error:", error);
            this.showToast("替换失败", "error");
        } finally {
            this.#setActionButtonsDisabled(false);
        }
    }

    /**
     * 设置所有操作按钮的禁用状态（防重复点击）
     *
     * @private
     * @param {boolean} disabled - 是否禁用
     * @returns {void}
     */
    #setActionButtonsDisabled(disabled) {
        // ✅ 替换页签的所有按钮
        const actionBtns = this.shadowRoot.querySelectorAll("#tab-replace .action-btn");
        actionBtns.forEach((btn) => {
            btn.disabled = disabled;
        });
    }

    /**
     * 获取当前搜索选项配置
     *
     * 从选项按钮的激活状态读取用户选择：
     * - **caseSensitive**: Aa 按钮是否激活（区分大小写）
     * - **wholeWord**: W 按钮是否激活（全字匹配）
     * - **useRegex**: .* 按钮是否激活（正则模式）
     *
     * 返回值直接传递给 SearchPlugin.query() 作为参数。
     *
     * @private
     * @returns {{ caseSensitive: boolean, wholeWord: boolean, useRegex: boolean }} 当前选项配置
     *
     * @example
     * const opts = this.#getCurrentOptions();
     * // 返回: { caseSensitive: false, wholeWord: true, useRegex: false }
     */
    #getCurrentOptions() {
        return {
            caseSensitive: this.#optionButtons.get("caseSensitive")?.classList.contains("active"),
            wholeWord: this.#optionButtons.get("wholeWord")?.classList.contains("active"),
            useRegex: this.#optionButtons.get("useRegex")?.classList.contains("active"),
        };
    }

    /**
     * 更新导航按钮的禁用状态
     *
     * 根据当前搜索结果的位置判断是否允许继续导航：
     * - **第一个结果时**: 禁用"上一个"按钮
     * - **最后一个结果时**: 禁用"下一个"按钮
     * - **无结果时**: 两个按钮都禁用
     *
     * 视觉反馈：
     * - 禁用状态下按钮变灰且不可点击（CSS :disabled 伪类）
     *
     * @private
     * @param {import("./SearchState.js")} state - 当前搜索状态
     * @returns {void}
     */
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
     * 显示错误提示（Toast 形式，带自动消失动画）
     *
     * ### 视觉效果
     * - 在面板上方居中显示红色背景的错误提示框
     * - 带有淡入淡出 + 向上滑动的动画效果
     * - 包含 ⚠️ 图标和错误文本
     *
     * ### 实现机制
     * 1. **懒创建**: 首次调用时动态创建 Toast 元素
     * 2. **复用**: 后续调用复用已有元素（避免重复创建）
     * 3. **自动清理**: 动画结束后从 DOM 移除元素
     *
     * ### 两阶段处理
     * - **视觉反馈**: 通过 CSS transition 实现平滑动画
     * - **日志记录**: 通过 errorHandler 记录到统一日志系统
     *
     * @public
     * @param {string} message - 要显示的错误消息文本
     * @param {number} [duration=3000] - Toast 持续显示时间（毫秒），默认 3 秒
     * @returns {void}
     *
     * @example
     * dropdown.showError("正则表达式语法错误: 未闭合的括号", 5000);
     * // 显示 5 秒后自动消失，同时记录到 errorHandler
     */
    showError(message, duration = 3000) {
        let errorEl = this.shadowRoot.querySelector(".search-error-toast");

        if (!errorEl) {
            errorEl = document.createElement("div");
            errorEl.className = "search-error-toast";
            errorEl.innerHTML = `<span class="error-icon">⚠️</span><span class="error-message"></span>`;
            this.shadowRoot.appendChild(errorEl);
        }

        errorEl.querySelector(".error-message").textContent = message;
        errorEl.classList.add("visible");

        clearTimeout(this._errorTimer);
        this._errorTimer = setTimeout(() => {
            errorEl.classList.remove("visible");

            setTimeout(() => {
                errorEl.remove();
            }, 300);
        }, duration);

        errorHandler.handle(ERROR_CODE.SEARCH_DROPDOWN_SHOW_ERROR, `[SearchDropdown] ${message}`);
    }

    /**
     * 显示警告信息（轻量级提示，无独立 Toast）
     *
     * 与 `showError` 的区别：
     * - **位置不同**: 直接在结果计数区域显示（不创建新元素）
     * - **样式不同**: 黄色文字 + ⚠ 前缀（非红色背景）
     * - **级别不同**: 使用 `errorHandler.warn` 而非 `.handle`
     * - **自动恢复**: 3 秒后自动恢复原始状态（"-" 或计数）
     *
     * ### 典型使用场景
     * - 搜索范围为空或无数据
     * - 结果数量超过限制被截断
     * - 替换操作跳过部分单元格
     *
     * @public
     * @param {string} message - 警告消息文本
     * @returns {void}
     *
     * @example
     * dropdown.showWarning("已跳过 5 个只读单元格");
     * // 结果区域显示: "⚠ 已跳过 5 个只读单元格"（黄色，3秒后恢复）
     */
    showWarning(message) {
        if (this.#resultInfo) {
            this.#resultInfo.textContent = `⚠ ${message}`;
            this.#resultInfo.className = "search-result-info warning";

            setTimeout(() => {
                this.#resultInfo.textContent = "-";
                this.#resultInfo.className = "search-result-info";
            }, 3000);
        }

        errorHandler.warn(ERROR_CODE.SEARCH_DROPDOWN_WARNING, `[SearchDropdown] ${message}`);
    }
}

customElements.define("search-dropdown", SearchDropdown);
