import { ContextMenuDropdown } from "./ContextMenuDropdown.js";
import type { MenuItemData } from "./ContextMenuDropdown.js";
import { PopupPanel } from "../../ui/components/PopupPanel.js";
import { PopupManager } from "../../ui/components/PopupManager.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

interface ContextMenuUIOptions {
    closeOnClickOutside?: boolean;
    closeOnEscape?: boolean;
    zIndex?: number;
    dropdownWidth?: number;
    dropdownMaxHeight?: number;
}

/**
 * 右键菜单 UI 控制器 (Context Menu UI Controller)
 *
 * 职责：管理右键菜单面板的显示/隐藏、位置计算、回调协调
 *
 * 设计原则：
 * 1. **PopupManager 规范**:
 *    - 使用 `PopupManager.getInstance().register/unregister` 注册/注销
 *    - 使用 `PopupPanel` 作为弹窗容器
 *    - 继承 ContextMenuDropdown 作为内容组件注入容器
 *    - 支持 `closeAll(exceptId)` 协调关闭机制
 *
 * 2. **单一职责**:
 *    - 仅负责 UI 层面的控制逻辑
 *    - 菜单项数据和业务逻辑由 ContextMenuStrategy 管理
 *    - 渲染细节封装在 ContextMenuDropdown Web Component 中
 *
 * 3. **防御性编程**:
 *    - 所有可能失败的操作都包裹在 try-catch 中
 *    - 通过 errorHandler 统一记录错误日志
 *
 * @module editor/strategies/ContextMenuUIManager
 */
export class ContextMenuUIManager {
    #popupPanel: PopupPanel | null = null;
    #dropdown: ContextMenuDropdown | null = null;
    #popupId: symbol | null = null;
    #isHiding: boolean = false;
    #onItemSelect: ((key: string) => void) | null = null;

    /**
     * 打开右键菜单面板
     *
     * @param position - 显示位置 { x, y }
     * @param items - 菜单项列表（null 表示分隔线）
     * @param onItemSelect - 菜单项点击回调
     * @param options - UI 行为选项（由插件透传）
     */
    open(
        position: { x: number; y: number },
        items: (MenuItemData | null)[],
        onItemSelect: (key: string) => void,
        options: ContextMenuUIOptions = {},
    ): void {
        this.close();

        try {
            this.#onItemSelect = onItemSelect;

            this.#popupPanel = new PopupPanel();
            this.#dropdown = new ContextMenuDropdown();

            this.#dropdown.initCallbacks({
                onItemSelect: (key: string) => {
                    this.#onItemSelect?.(key);
                    this.close();
                },
                onClose: () => this.close(),
            });

            this.#dropdown.renderItems(items, {
                width: options.dropdownWidth,
                maxHeight: options.dropdownMaxHeight,
            });

            this.#popupId = PopupManager.getInstance().register(this.#popupPanel);

            this.#popupPanel.show({
                position,
                placement: "bottom",
                zIndex: options.zIndex ?? 10001,
                showHeader: false,
                closeOnClickOutside: options.closeOnClickOutside ?? true,
                closeOnEscape: options.closeOnEscape ?? true,
                draggable: false,
                content: this.#dropdown,
                onClose: () => this.close(),
            });
        } catch (error) {
            errorHandler.error(ERROR_CODE.CONTEXT_MENU_UI_OPEN_ERROR, "打开右键菜单失败", { originalError: error });
        }
    }

    /**
     * 关闭当前打开的右键菜单面板
     *
     * 安全性保证：
     * - 即使注销失败也不会抛出异常
     * - 支持重复调用（幂等操作）
     * - 防止关闭时的双重调用导致的无限循环
     */
    close(): void {
        if (this.#isHiding || !this.#popupPanel) return;

        this.#isHiding = true;

        try {
            this.#popupPanel.hide();

            if (this.#popupId) {
                try {
                    PopupManager.getInstance().unregister(this.#popupId);
                } catch (error) {
                    errorHandler.warn(ERROR_CODE.CONTEXT_MENU_UI_POPUP_UNREGISTER_ERROR, "注销 PopupManager 失败", {
                        originalError: error,
                    });
                }
            }

            this.#dropdown = null;
            this.#popupPanel = null;
            this.#popupId = null;
            this.#onItemSelect = null;
        } finally {
            this.#isHiding = false;
        }
    }

    /**
     * 检查右键菜单是否处于打开状态
     */
    get isOpen(): boolean {
        return this.#popupPanel !== null;
    }
}