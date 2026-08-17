import { SearchDropdown } from "./SearchDropdown.js";
import { PopupPanel } from "../../ui/components/PopupPanel.js";
import { PopupManager } from "../../ui/components/PopupManager.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import type { SearchPlugin } from "./SearchPlugin.js";
import type { SearchState, SearchOptions } from "./SearchState.js";

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
 * @module plugins/search/SearchUIManager
 */
export class SearchUIManager {
    /** @private 私有字段 - 搜索插件实例引用 */
    #plugin: SearchPlugin | null = null;

    /** @private 私有字段 - 弹窗容器 */
    #popupPanel: any = null;

    /** @private 私有字段 - 搜索面板内容组件 */
    #dropdown: SearchDropdown | null = null;

    /** @private 私有字段 - PopupManager 分配的唯一标识符 */
    #popupId: symbol | null = null;

    /** @private 私有字段 - 防重入标志，防止关闭时的无限递归 */
    #isHiding: boolean = false;

    /**
     * 创建搜索 UI 控制器实例
     *
     * @param plugin - SearchPlugin 实例（必须已初始化完成）
     */
    constructor(plugin: SearchPlugin) {
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
     */
    show(): void {
        if (this.#dropdown) return;

        this.#popupPanel = new PopupPanel();

        this.#dropdown = new SearchDropdown();

        this.#dropdown.initCallbacks({
            onSearch: (query, options) => this.#handleSearch(query, options),
            onNavigate: (direction) => this.#handleNavigate(direction),
            onReplace: async (replaceStr) => await this.#handleReplace(replaceStr),
            onReplaceAll: async (replaceStr) => await this.#handleReplaceAll(replaceStr),
            onClose: (reason) => this.#handleClose(reason),
        });

        this.#popupPanel.appendChild(this.#dropdown);

        this.#popupId = Symbol("search-popup");
        const { draggable, mask, closeOnClickOutside, closeOnEscape } = (this.#plugin as any).options;

        this.#popupPanel.show({
            position: this.#calculatePosition(),
            title: "查找和替换",
            draggable,
            mask,
            closeOnClickOutside,
            closeOnEscape,
            content: this.#dropdown,
            onClose: (reason: string) => this.#handleClose(reason),
        });

        setTimeout(() => {
            this.#dropdown?.focusInput();
        }, 100);
    }

    /**
     * 隐藏搜索面板并释放资源
     *
     * 安全性保证：
     * - 即使注销失败也不会抛出异常
     * - 支持重复调用（幂等操作）
     * - 防止 Esc 关闭时的双重调用导致的无限循环
     */
    hide(): void {
        if (this.#isHiding || !this.#popupPanel) return;

        this.#isHiding = true;

        try {
            this.#popupPanel.hide();

            if (this.#popupId) {
                try {
                    PopupManager.getInstance().unregister(this.#popupId);
                } catch (error) {
                    errorHandler.warn(ERROR_CODE.SEARCH_UI_POPUP_UNREGISTER_ERROR, "注销 PopupManager 失败", { originalError: error });
                }
            }

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
     * @param state - 最新的搜索状态对象
     */
    updateUI(state: SearchState): void {
        this.#dropdown?.updateResultInfo(state);
    }

    /**
     * @private 私有方法 - 计算搜索面板的最佳显示位置（居中显示）
     */
    #calculatePosition(): { x: number; y: number } {
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
     * @private 私有方法 - 处理搜索请求回调
     */
    async #handleSearch(query: string, options: SearchOptions): Promise<void> {
        try {
            await (this.#plugin as any).query(query, options);
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_UI_NAVIGATION_ERROR, "搜索失败", { originalError: error });
        }
    }

    /**
     * @private 私有方法 - 处理导航请求回调
     */
    async #handleNavigate(direction: "next" | "prev"): Promise<void> {
        try {
            if (direction === "next") {
                await (this.#plugin as any).findNext();
            } else {
                await (this.#plugin as any).findPrevious();
            }
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_UI_NAVIGATION_ERROR, "导航失败", { originalError: error });
        }
    }

    /**
     * @private 私有方法 - 处理面板关闭回调
     */
    #handleClose(reason: string): void {
        if (!this.#dropdown) return;

        try {
            (this.#plugin as any).hide();
        } catch (error) {
            errorHandler.warn(ERROR_CODE.SEARCH_UI_CLOSE_ERROR, "关闭面板时出错", { originalError: error });
        }
    }

    /**
     * @private 私有方法 - 处理单个替换请求回调
     */
    async #handleReplace(replaceStr: string): Promise<boolean> {
        try {
            const success = await (this.#plugin as any).replace(replaceStr);

            if (success && this.#dropdown) {
                this.#dropdown.updateResultInfo((this.#plugin as any).getState());
            }

            return success;
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_REPLACE_ERROR, "替换失败", { originalError: error });
            return false;
        }
    }

    /**
     * @private 私有方法 - 处理全部替换请求回调
     */
    async #handleReplaceAll(replaceStr: string): Promise<number> {
        try {
            const count = await (this.#plugin as any).replaceAll(replaceStr);

            if (count > 0 && this.#dropdown) {
                this.#dropdown.updateResultInfo((this.#plugin as any).getState());
            }

            return count;
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_REPLACE_ALL_ERROR, "全部替换失败", { originalError: error });
            return 0;
        }
    }

    /**
     * 显示错误信息
     *
     * @param message - 要显示的错误消息文本
     * @param duration - Toast 显示时长（毫秒），默认 3 秒
     */
    showError(message: string, duration: number = 3000): void {
        if (!this.#dropdown) return;

        errorHandler.error(ERROR_CODE.GENERIC_ERROR, message);
        this.#dropdown.showError(message);
    }

    /**
     * 显示警告信息
     *
     * @param message - 警告消息文本
     */
    showWarning(message: string): void {
        if (!this.#dropdown) return;

        errorHandler.warn(ERROR_CODE.GENERIC_WARN, message);
        (this.#dropdown as any).showWarning?.(message);
    }

    /** 获取当前显示的 SearchDropdown 实例 */
    get dropdown(): SearchDropdown | null {
        return this.#dropdown;
    }

    /** 销毁控制器实例 */
    destroy(): void {
        this.hide();
        this.#plugin = null;
    }
}
