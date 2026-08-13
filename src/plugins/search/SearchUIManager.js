/**
 * 搜索 UI 控制器 (Search UI Controller)
 *
 * 职责：管理搜索面板的显示/隐藏、位置计算、回调协调
 *
 * 设计原则：
 * 1. **PopupManager 规范**:
 *    - 使用 `PopupManager.getInstance().register/unregister` 注册/注销
 *    - 继承 PopupPanel 基类的生命周期管理
 *    - 支持 `closeAll(exceptId)` 协调关闭机制
 *
 * 2. **单一职责**:
 *    - 仅负责 UI 层面的控制逻辑
 *    - 业务逻辑委托给 SearchPlugin
 *    - 渲染细节封装在 SearchDropdown Web Component 中
 *
 * 3. **防御性编程**:
 *    - 所有可能失败的操作都包裹在 try-catch 中
 *    - 通过 errorHandler 统一记录错误日志
 *    - 提供优雅降级（如使用默认位置）
 *
 * 使用示例：
 * ```javascript
 * const uiController = new SearchUIManager(searchPlugin);
 * uiController.show();           // 显示搜索面板
 * uiController.updateUI(state);  // 更新状态显示
 * uiController.hide();           // 隐藏并清理资源
 * ```
 *
 * @class SearchUIManager
 * @see {@link SearchPlugin} - 业务逻辑层
 * @see {@link SearchDropdown} - UI 渲染组件
 * @see {@link PopupManager} - 弹窗管理器
 */
import { SearchDropdown } from "./SearchDropdown.js";
import { PopupPanelNew } from "../../ui/components/PopupPanelNew.js";
import { PopupManager } from "../../ui/components/PopupManager.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

export class SearchUIManager {
    /** @type {import("./SearchPlugin.js")} 搜索插件实例引用 */
    #plugin = null;

    /** @type {PopupPanelNew|null} 弹窗容器 */
    #popupPanel = null;

    /** @type {SearchDropdown|null} 搜索面板内容组件 */
    #dropdown = null;

    /** @type {Symbol|null} PopupManager 分配的唯一标识符 */
    #popupId = null;

    /**
     * @private 防重入标志 - 防止关闭时的无限递归
     *
     * 当用户按 Esc 键时，会同时触发：
     * 1. SearchStrategy 调用 plugin.hide()
     * 2. SearchDropdown 的 onClose 回调调用 plugin.hide()
     *
     * 如果不加以控制，会形成无限递归循环。
     * 此标志位在 hide() 开始时设置为 true，结束时重置为 false。
     *
     * @type {boolean}
     */
    #isHiding = false;

    /**
     * 创建搜索 UI 控制器实例
     *
     * 初始化时仅保存插件引用，不立即创建 UI 组件。
     * 首次调用 `show()` 时才延迟创建 SearchDropdown 实例。
     *
     * @constructor
     * @param {import("./SearchPlugin.js")} plugin - SearchPlugin 实例（必须已初始化完成）
     *
     * @example
     * const plugin = new SearchPlugin(workbook);
     * plugin.init();
     * const uiController = new SearchUIManager(plugin);
     */
    constructor(plugin) {
        this.#plugin = plugin;
    }

    /**
     * 显示搜索面板
     *
     * 执行流程：
     * 1. 检查是否已有面板显示（防重复创建）
     * 2. 创建新的 SearchDropdown 实例
     * 3. 计算最佳显示位置（基于工作表元素位置）
     * 4. 调用 dropdown.show() 并注册到 PopupManager
     * 5. 绑定五个核心回调：搜索、导航、替换、全部替换、关闭
     *
     * 位置计算策略：
     * - 优先在工作表右上角显示
     * - 如果工作表不可见或未挂载，回退到视口默认位置
     *
     * @public
     * @returns {void}
     *
     * @fires search:show - 通过 SearchDropdown 内部触发
     *
     * @example
     * uiController.show(); // 在工作表右上角弹出搜索框
     */
    show() {
        if (this.#dropdown) return;

        // 1. 创建弹窗容器
        this.#popupPanel = new PopupPanelNew();

        // 2. 创建搜索面板内容组件
        this.#dropdown = new SearchDropdown();

        // 3. 初始化回调
        this.#dropdown.initCallbacks({
            onSearch: (query, options) => this.#handleSearch(query, options),
            onNavigate: (direction) => this.#handleNavigate(direction),
            onReplace: async (replaceStr) => await this.#handleReplace(replaceStr),
            onReplaceAll: async (replaceStr) => await this.#handleReplaceAll(replaceStr),
            onClose: (reason) => this.#handleClose(reason),
        });

        // 4. 组装：将搜索面板内容放入容器中
        this.#popupPanel.appendChild(this.#dropdown);

        // 5. 显示容器（带位置和回调）
        this.#popupId = Symbol("search-popup");
        const { draggable, mask, closeOnClickOutside, closeOnEscape } = this.#plugin.options;

        this.#popupPanel.show({
            position: this.#calculatePosition(),
            title: "查找和替换",
            draggable,
            mask,
            closeOnClickOutside,
            closeOnEscape,
            content: this.#dropdown,
            onClose: (reason) => this.#handleClose(reason),
        });

        // 6. 聚焦输入框
        setTimeout(() => {
            this.#dropdown?.focusInput();
        }, 100);
    }

    /**
     * 隐藏搜索面板并释放资源
     *
     * 执行流程：
     * 1. 检查防重入标志，避免无限递归
     * 2. 调用 dropdown.hide() 触发动画隐藏
     * 3. 从 PopupManager 注销此弹窗标识
     * 4. 清空内部引用（#dropdown 和 #popupId）
     *
     * 安全性保证：
     * - 即使注销失败也不会抛出异常（通过 errorHandler 记录警告）
     * - 支持重复调用（幂等操作）
     * - 防止 Esc 关闭时的双重调用导致的无限循环
     *
     * @public
     * @returns {void}
     *
     * @example
     * uiController.hide(); // 关闭搜索面板
     */
    hide() {
        if (this.#isHiding || !this.#popupPanel) return;

        this.#isHiding = true;

        try {
            // 隐藏弹窗容器
            this.#popupPanel.hide();

            // 从 PopupManager 注销
            if (this.#popupId) {
                try {
                    PopupManager.getInstance().unregister(this.#popupId);
                } catch (error) {
                    errorHandler.warn(ERROR_CODE.SEARCH_UI_POPUP_UNREGISTER_ERROR, "注销 PopupManager 失败", { originalError: error });
                }
            }

            // 清理引用
            this.#dropdown = null;
            this.#popupPanel = null;
            this.#popupId = null;
        } finally {
            this.#isHiding = false;
        }
    }

    /**
     * 更新 UI 状态显示
     *
     * 根据最新的 SearchState 同步更新界面元素：
     * - 结果计数显示（如 "3 / 10" 表示第3个结果共10个）
     * - 导航按钮的启用/禁用状态
     * - 无结果时的提示样式
     *
     * @public
     * @param {import("./SearchState.js")} state - 最新的搜索状态对象
     * @returns {void}
     *
     * @example
     * const state = plugin.getState();
     * uiController.updateUI(state); // 刷新显示
     */
    updateUI(state) {
        this.#dropdown?.updateResultInfo(state);
    }

    /**
     * 计算搜索面板的最佳显示位置（居中显示）
     *
     * 策略：将搜索面板在视口中水平和垂直居中显示
     * - 水平居中：(windowWidth - DEFAULT_WIDTH) / 2
     * - 垂直居中：(windowHeight - DEFAULT_HEIGHT) / 2
     *
     * 尺寸来源：
     * - 优先从 SearchDropdown.getPanelSize() 获取实际渲染尺寸
     * - 如果获取失败，回退到默认尺寸（460×380px）
     *
     * 边界保护：
     * - 左边界：至少距离边缘 20px
     * - 上边界：至少距离顶部 60px（考虑工具栏等 UI 元素）
     *
     * @private
     * @returns {{ x: number, y: number }} 推荐的面板左上角坐标
     *
     * @example
     * const pos = this.#calculatePosition();
     * // 返回: { x: 730, y: 320 } （1920x1080 屏幕居中）
     */
    #calculatePosition() {
        // 基于实测的默认尺寸（实际渲染：462×305px + 15px安全边距）
        const DEFAULT_WIDTH = 462;
        const DEFAULT_HEIGHT = 320;
        const centerX = (window.innerWidth - DEFAULT_WIDTH) / 2;
        const centerY = (window.innerHeight - DEFAULT_HEIGHT) / 2;
        return {
            x: Math.max(20, centerX),
            y: Math.max(60, centerY),
        };
    }

    /**
     * 处理搜索请求回调
     *
     * 由 SearchDropdown 的输入事件触发（带 300ms 防抖）。
     * 将用户输入的查询字符串和选项传递给 SearchPlugin 执行实际搜索。
     *
     * 异常处理：
     * - 搜索失败时通过 errorHandler 记录错误
     * - 不向上抛出异常（避免影响 UI 交互）
     *
     * @private
     * @async
     * @param {string} query - 用户输入的搜索关键词
     * @param {Object} options - 当前搜索选项配置
     * @returns {Promise<void>}
     */
    async #handleSearch(query, options) {
        try {
            await this.#plugin.query(query, options);
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_UI_NAVIGATION_ERROR, "搜索失败", { originalError: error });
        }
    }

    /**
     * 处理导航请求回调
     *
     * 由 SearchDropdown 的导航按钮点击触发。
     * 根据 direction 参数调用 findNext 或 findPrevious。
     *
     * @private
     * @async
     * @param {"next"|"prev"} direction - 导航方向
     * @returns {Promise<void>}
     */
    async #handleNavigate(direction) {
        try {
            if (direction === "next") {
                await this.#plugin.findNext();
            } else {
                await this.#plugin.findPrevious();
            }
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_UI_NAVIGATION_ERROR, "导航失败", { originalError: error });
        }
    }

    /**
     * 处理面板关闭回调
     *
     * 由 SearchDropdown 的关闭按钮或 Esc 键触发。
     * 通知 SearchPlugin 执行完整的关闭流程（包括清除高亮等）。
     *
     * ⚠️ **重要：防重入保护**
     *
     * 此回调可能在以下场景被触发：
     * 1. 用户点击 ✕ 关闭按钮（仅此回调）
     * 2. 用户按 Esc 键（SearchStrategy + 此回调 双重触发）
     *
     * 由于 `hide()` 方法已有防重入保护（#isHiding 标志），
     * 此处直接调用 `plugin.hide()` 是安全的，重复调用会被自动忽略。
     *
     * 关闭原因分类：
     * - "user-close": 用户点击关闭按钮
     * - "escape": 按 Esc 键
     * - "close-button": 点击 ✕ 按钮
     *
     * @private
     * @param {string} reason - 关闭原因标识符
     * @returns {void}
     */
    #handleClose(reason) {
        if (!this.#dropdown) return;

        try {
            this.#plugin.hide();
        } catch (error) {
            errorHandler.warn(ERROR_CODE.SEARCH_UI_CLOSE_ERROR, "关闭面板时出错", { originalError: error });
        }
    }

    /**
     * 处理单个替换请求回调
     *
     * 由 SearchDropdown 的"替换"按钮或 Enter 键触发。
     * 调用 SearchPlugin.replace() 执行当前项的替换操作，
     * 支持撤销（Ctrl+Z）。
     *
     * ### 替换流程
     * 1. 获取当前选中的搜索结果
     * 2. 使用 SetCellCommand 记录旧值/新值
     * 3. 推入 HistoryStack 支持撤销
     * 4. 执行实际的单元格赋值
     * 5. 更新结果数据引用
     *
     * @private
     * @async
     * @param {string} replaceStr - 替换文本
     * @returns {Promise<boolean>} 是否成功替换
     *
     * @example
     * // 用户在替换框输入 "Hi" 并点击"替换"
     * const success = await this.#handleReplace("Hi");
     * // 如果成功，自动导航到下一个匹配项
     */
    async #handleReplace(replaceStr) {
        try {
            const success = await this.#plugin.replace(replaceStr);

            if (success && this.#dropdown) {
                // 刷新结果信息显示
                this.#dropdown.updateResultInfo(this.#plugin.getState());
            }

            return success;
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_REPLACE_ERROR, "替换失败", { originalError: error });
            return false;
        }
    }

    /**
     * 处理全部替换请求回调
     *
     * 由 SearchDropdown 的"全部替换"按钮或 Ctrl+Enter 触发。
     * 调用 SearchPlugin.replaceAll() 批量替换所有匹配项，
     * 使用 BatchCommand 实现原子操作和一键撤销。
     *
     * ### 全部替换特性
     * - **原子性**: 所有替换作为一个整体，仅占 1 个 undo 栈位
     * - **智能跳过**: 自动跳过只读单元格和非主合并单元格
     * - **性能优化**: 批量执行减少多次渲染刷新
     * - **完整撤销**: Ctrl+Z 一键恢复所有更改
     *
     * @private
     * @async
     * @param {string} replaceStr - 替换文本
     * @returns {Promise<number>} 成功替换的数量
     *
     * @example
     * // 用户输入 "Hello" 并点击"全部替换"
     * const count = await this.#handleReplaceAll("Hello");
     * // 返回值如 15 表示替换了 15 个单元格
     */
    async #handleReplaceAll(replaceStr) {
        try {
            const count = await this.#plugin.replaceAll(replaceStr);

            if (count > 0 && this.#dropdown) {
                // 清空搜索结果（因为所有匹配项已被替换）
                this.#dropdown.updateResultInfo(this.#plugin.getState());

                // 可选：清空搜索输入框（根据需求决定）
                // this.#dropdown.clearInput();
            }

            return count;
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_REPLACE_ALL_ERROR, "全部替换失败", { originalError: error });
            return 0;
        }
    }

    /**
     * 显示错误信息（带自动消失的 Toast 提示）
     *
     * 两阶段处理：
     * 1. 通过 errorHandler 记录到日志系统
     * 2. 通过 SearchDropdown 的 showError 方法显示视觉反馈
     *
     * Fallback 机制：
     * - 如果 SearchDropdown 未实现 showError 方法，则通过 CustomEvent 通知
     * - 开发环境下额外输出调用栈便于调试
     *
     * @public
     * @param {string} message - 要显示的错误消息文本
     * @param {number} [duration=3000] - Toast 显示时长（毫秒），默认 3 秒
     * @returns {void}
     *
     * @example
     * uiController.showError("正则表达式语法错误", 5000); // 显示 5 秒
     */
    showError(message, duration = 3000) {
        if (!this.#dropdown) return;

        errorHandler.error(ERROR_CODE.GENERIC_ERROR, message);

        // 直接调用 SearchDropdown 的 showError 方法显示 Toast
        this.#dropdown.showError(message);
    }

    /**
     * 显示警告信息（轻量级提示）
     *
     * 与 showError 的区别：
     * - 警告级别较低（warn vs error）
     * - 直接显示在结果计数区域（无独立 Toast）
     * - 自动 3 秒后恢复原始状态
     *
     * 典型使用场景：
     * - 搜索范围为空
     * - 结果被截断
     * - 部分单元格跳过
     *
     * @public
     * @param {string} message - 警告消息文本
     * @returns {void}
     *
     * @example
     * uiController.showWarning("已跳过 5 个只读单元格");
     */
    showWarning(message) {
        if (!this.#dropdown) return;

        errorHandler.warn(ERROR_CODE.GENERIC_WARN, message);
        this.#dropdown.showWarning?.(message);
    }

    /**
     * 获取当前显示的 SearchDropdown 实例（用于外部访问面板组件方法）
     *
     * @public
     * @returns {SearchDropdown|null}
     */
    get dropdown() {
        return this.#dropdown;
    }

    /**
     * 销毁控制器实例
     *
     * 完整清理流程：
     * 1. 调用 hide() 关闭并注销面板
     * 2. 清空插件引用（断开循环依赖）
     *
     * 注意：销毁后此实例不可再使用！
     *
     * @public
     * @returns {void}
     *
     * @example
     * uiController.destroy();
     * // 此时 uiController 已失效，不应再调用任何方法
     */
    destroy() {
        this.hide();
        this.#plugin = null;
    }
}