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
 * const uiController = new SearchUIController(searchPlugin);
 * uiController.show();           // 显示搜索面板
 * uiController.updateUI(state);  // 更新状态显示
 * uiController.hide();           // 隐藏并清理资源
 * ```
 *
 * @class SearchUIController
 * @see {@link SearchPlugin} - 业务逻辑层
 * @see {@link SearchDropdown} - UI 渲染组件
 * @see {@link PopupManager} - 弹窗管理器
 */
import { SearchDropdown } from "./SearchDropdown.js";
import { PopupManager } from "../../ui/components/PopupManager.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

export class SearchUIController {
    /** @type {import("./SearchPlugin.js")} 搜索插件实例引用 */
    #plugin = null;

    /** @type {SearchDropdown|null} 当前显示的搜索下拉面板 */
    #dropdown = null;

    /** @type {Symbol|null} PopupManager 分配的唯一标识符 */
    #popupId = null;

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
     * const uiController = new SearchUIController(plugin);
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
     * 5. 绑定三个核心回调：搜索、导航、关闭
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
     * 隐藏搜索面板并释放资源
     *
     * 执行流程：
     * 1. 调用 dropdown.hide() 触发动画隐藏
     * 2. 从 PopupManager 注销此弹窗标识
     * 3. 清空内部引用（#dropdown 和 #popupId）
     *
     * 安全性保证：
     * - 即使注销失败也不会抛出异常（通过 errorHandler 记录警告）
     * - 支持重复调用（幂等操作）
     *
     * @public
     * @returns {void}
     *
     * @example
     * uiController.hide(); // 关闭搜索面板
     */
    hide() {
        if (this.#dropdown) {
            this.#dropdown.hide();

            if (this.#popupId) {
                try {
                    PopupManager.getInstance().unregister(this.#popupId);
                } catch (error) {
                    errorHandler.warn(ERROR_CODE.SEARCH_UI_POPUP_UNREGISTER_ERROR, "注销 PopupManager 失败", { originalError: error });
                }
            }

            this.#dropdown = null;
            this.#popupId = null;
        }
    }

    /**
     * 将焦点聚焦到搜索输入框
     *
     * 通常用于以下场景：
     * - 用户按 Ctrl+F 后需要立即输入
     * - 从其他组件切换回来时恢复焦点
     * - 快捷键触发的重新打开
     *
     * @public
     * @returns {void}
     *
     * @example
     * uiController.show();
     * uiController.focusInput(); // 光标定位到输入框
     */
    focusInput() {
        this.#dropdown?.focusInput();
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
     * 检查搜索面板是否正在显示
     *
     * 用于判断是否需要避免重复打开，
     * 或根据面板状态调整其他组件行为。
     *
     * @public
     * @returns {boolean} true 表示面板可见
     *
     * @example
     * if (uiController.isOpen()) {
     *   console.log("搜索面板已打开");
     * }
     */
    isOpen() {
        return this.#dropdown !== null;
    }

    /**
     * 计算搜索面板的最佳显示位置
     *
     * 优先级策略：
     * 1. 基于工作表 DOM 元素的位置计算（精确对齐）
     * 2. 工作表不可用时回退到视口右上角
     * 3. 确保不超出屏幕边界（通过 Math.min/max 约束）
     *
     * 坐标系说明：
     * - 使用屏幕绝对坐标（相对于 viewport）
     * - x: 距离左边缘像素值
     * - y: 距离顶部像素值
     *
     * @private
     * @returns {{ x: number, y: number }} 推荐的面板左上角坐标
     *
     * @example
     * const pos = this.#calculatePosition();
     * // 返回: { x: 1200, y: 80 } （假设工作表在右侧）
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
            errorHandler.warn(ERROR_CODE.SEARCH_UI_POSITION_ERROR, "获取工作表位置失败，使用默认位置", { originalError: error });
            return { x: window.innerWidth - 450, y: 60 };
        }
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
            errorHandler.handle(ERROR_CODE.SEARCH_UI_NAVIGATION_ERROR, "搜索失败", { originalError: error });
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
            errorHandler.handle(ERROR_CODE.SEARCH_UI_NAVIGATION_ERROR, "导航失败", { originalError: error });
        }
    }

    /**
     * 处理面板关闭回调
     *
     * 由 SearchDropdown 的关闭按钮或 Esc 键触发。
     * 通知 SearchPlugin 执行完整的关闭流程（包括清除高亮等）。
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
        try {
            this.#plugin.hide();
        } catch (error) {
            errorHandler.warn(ERROR_CODE.SEARCH_UI_CLOSE_ERROR, "关闭面板时出错", { originalError: error });
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

        errorHandler.handle(ERROR_CODE.GENERIC_ERROR, message);

        if (typeof this.#dropdown.showError === "function") {
            this.#dropdown.showError(message, duration);
        } else {
            const event = new CustomEvent("search:error", {
                detail: { message, duration },
                bubbles: true,
            });
            this.#dropdown.dispatchEvent(event);
        }

        if (process.env.NODE_ENV === "development") {
            console.trace("[Search] 错误调用栈");
        }
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