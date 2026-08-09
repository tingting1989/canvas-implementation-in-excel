import { EventStrategy } from "../../editor/strategies/EventStrategy.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

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
 * 设计原则：
 * 1. **策略优先级 POPUP_UI (500)**:
 *    - 高于鼠标默认行为 (300)，确保面板交互优先
 *    - 低于拖拽操作 (600+)，不干扰核心功能
 *
 * 2. **外部输入检测**:
 *    - 仅在无其他外部输入时响应快捷键
 *    - 避免与编辑器、输入框等冲突
 *
 * 3. **事件委托**:
 *    - 通过 EventHandler 统一分发，避免重复绑定
 *    - 返回 false 可阻止事件继续传播
 *
 * @extends EventStrategy
 */
export class SearchStrategy extends EventStrategy {
    priority = STRATEGY_PRIORITY.POPUP_UI;

    #plugin = null;
    #isSearchActive = false;

    /**
     * @param {Object} handler - 事件处理器
     * @param {SearchPlugin} plugin - 搜索插件实例
     */
    constructor(handler, plugin) {
        super(handler);
        this.#plugin = plugin;

        // ✅ 监听搜索面板的显示/隐藏状态
        if (plugin) {
            this.#bindPluginEvents();
        }
    }

    /**
     * 绑定插件生命周期事件
     *
     * @private
     */
    #bindPluginEvents() {
        // 监听搜索面板打开
        const originalShow = this.#plugin.show.bind(this.#plugin);
        this.#plugin.show = () => {
            this.#isSearchActive = true;
            originalShow();
        };

        // 监听搜索面板关闭
        const originalHide = this.#plugin.hide.bind(this.#plugin);
        this.#plugin.hide = () => {
            this.#isSearchActive = false;
            originalHide();
        };
    }

    /**
     * 获取事件处理器映射
     *
     * @returns {Object} 事件名称到处理函数的映射
     */
    getEventHandlers() {
        return {
            [DELEGATE_KEYS.DOCUMENT_KEYDOWN]: (e) => this.#handleKeyDown(e),
        };
    }

    /**
     * 处理键盘按下事件
     *
     * 快捷键映射：
     * - Ctrl+F / Cmd+F: 打开/关闭搜索面板
     * - F3: 下一个结果
     * - Shift+F3: 上一个结果
     * - Esc: 关闭面板（仅在搜索激活时）
     *
     * @param {KeyboardEvent} e - 键盘事件
     * @returns {boolean} 是否允许事件继续传播
     * @private
     */
    async #handleKeyDown(e) {
        if (!this.enabled || !this.#plugin?.enabled) return true;

        // ✅ 外部输入检测：避免与编辑器、输入框等冲突
        if (this.#hasExternalInput()) {
            return true; // 允许事件继续传播给其他策略
        }

        const key = e.key.toLowerCase();
        const ctrlOrCmd = e.ctrlKey || e.metaKey;
        const shiftKey = e.shiftKey;

        try {
            // ========== Ctrl+F / Cmd+F: 打开或关闭搜索面板 ==========
            if (ctrlOrCmd && key === "f") {
                e.preventDefault();
                e.stopPropagation();

                if (this.#isSearchActive) {
                    // 如果已打开，则关闭
                    this.#plugin.hide();
                } else {
                    // 否则打开搜索面板
                    this.#showSearchPanel();
                }

                return false; // 阻止默认行为和其他策略处理
            }

            // ========== F3: 导航到下一个结果 ==========
            if (key === "f3" && !ctrlOrCmd && !shiftKey) {
                e.preventDefault();

                if (this.#isSearchActive) {
                    await this.#plugin.findNext();
                } else {
                    // 如果没有打开搜索面板，尝试重新执行上次搜索
                    this.#reopenLastSearch();
                }

                return false;
            }

            // ========== Shift+F3: 导航到上一个结果 ==========
            if (key === "f3" && shiftKey && !ctrlOrCmd) {
                e.preventDefault();

                if (this.#isSearchActive) {
                    await this.#plugin.findPrevious();
                } else {
                    // 反向重新打开上次搜索
                    this.#reopenLastSearch(true);
                }

                return false;
            }

            // ========== Esc: 关闭搜索面板 ==========
            if (key === "escape" && !ctrlOrCmd && !shiftKey) {
                if (this.#isSearchActive) {
                    e.preventDefault();
                    this.#plugin.hide();
                    return false;
                }

                // 如果搜索未激活，允许 Esc 传递给其他策略（如关闭编辑器等）
                return true;
            }

            // ========== Enter: 在搜索框中导航（由 SearchDropdown 内部处理） ==========
            // 此处不需要额外处理，因为 SearchDropdown 已绑定 input 的 keydown
        } catch (error) {
            errorHandler.handle(ERROR_CODE.SEARCH_KEYBOARD_EVENT_ERROR, "键盘事件处理失败", { originalError: error });
        }

        // 默认允许事件继续传播
        return true;
    }

    /**
     * 显示搜索面板
     *
     * 计算合适的屏幕位置（通常在视口顶部居中）
     *
     * @private
     */
    #showSearchPanel() {
        if (!this.handler?.viewport || !this.handler?.canvasContext) {
            errorHandler.warn(ERROR_CODE.SEARCH_MISSING_CONTEXT, "缺少必要的上下文信息");
            return;
        }

        // ✅ 获取 Canvas 元素的位置作为参考点
        const canvasRect = this.handler.canvasContext.canvas.getBoundingClientRect();

        // ✅ 在 Canvas 上方居中显示
        const position = {
            x: canvasRect.left + canvasRect.width / 2,
            y: canvasRect.top + 10, // 距离顶部 10px
        };

        this.#plugin.show(position);
    }

    /**
     * 重新打开上次的搜索（当用户按 F3 但面板已关闭时）
     *
     * @param {boolean} [reverse=false] - 是否反向导航到上一个
     * @private
     */
    async #reopenLastSearch(reverse = false) {
        const lastQuery = this.#plugin.getLastQuery?.();

        if (!lastQuery) {
            // 无历史记录，直接打开空面板
            this.#showSearchPanel();
            return;
        }

        // 重新执行上次搜索并定位
        this.#showSearchPanel();

        // 等待面板渲染完成后导航
        setTimeout(async () => {
            if (reverse) {
                await this.#plugin.findPrevious();
            } else {
                await this.#plugin.findNext();
            }
        }, 100);
    }

    /**
     * 检测是否存在外部输入源
     *
     * 当以下情况存在时，不拦截键盘事件：
     * - 用户正在编辑单元格（编辑器打开）
     * - 焦点在 input/textarea/select 等表单元素上
     * - 其他模态对话框打开
     *
     * @returns {boolean} 是否存在外部输入
     * @private
     */
    #hasExternalInput() {
        const activeElement = document.activeElement;

        // ✅ 检查是否在表单元素中（排除搜索面板自己的输入框）
        if (activeElement) {
            const tagName = activeElement.tagName?.toLowerCase();
            const isFormElement = ["input", "textarea", "select"].includes(tagName);

            // 允许搜索面板自己的输入框接收按键（通过 data 属性标记）
            const isSearchInput = activeElement.closest?.("search-dropdown") !== null || activeElement.dataset?.searchInput === "true";

            if (isFormElement && !isSearchInput) {
                return true;
            }
        }

        // ✅ 检查是否有其他模态弹窗打开（通过 z-index 或 class 判断）
        const modals = document.querySelectorAll(".modal-overlay, .dialog-backdrop, [role='dialog']");

        for (const modal of modals) {
            // 排除搜索面板本身
            if (modal.classList.contains("search-panel") || modal.tagName === "SEARCH-DROPDOWN") {
                continue;
            }

            // 检查模态框是否可见
            const style = window.getComputedStyle(modal);
            if (style.display !== "none" && style.visibility !== "hidden") {
                return true;
            }
        }

        // ✅ 可选：检查编辑器是否处于活跃状态
        if (this.handler?.sheet?.editor?.isActive?.()) {
            return true;
        }

        return false;
    }

    /**
     * 销毁策略实例
     *
     * 清理所有引用和监听器
     */
    destroy() {
        super.destroy();
        this.#plugin = null;
        this.#isSearchActive = false;
    }
}
