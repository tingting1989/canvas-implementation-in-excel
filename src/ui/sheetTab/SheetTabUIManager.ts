import { SheetTabDropdown } from "./SheetTabDropdown.js";
import type { SheetTabMenuItemData } from "./SheetTabDropdown.js";
import { PopupPanel } from "../components/PopupPanel.js";
import { PopupManager } from "../components/PopupManager.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

interface SheetTabUIOptions {
    closeOnClickOutside?: boolean;
    closeOnEscape?: boolean;
    zIndex?: number;
    dropdownWidth?: number;
    dropdownMaxHeight?: number;
}

export class SheetTabUIManager {
    #popupPanel: PopupPanel | null = null;
    #dropdown: SheetTabDropdown | null = null;
    #popupId: symbol | null = null;
    #isHiding: boolean = false;
    #onItemSelect: ((key: string) => void) | null = null;

    open(
        position: { x: number; y: number },
        items: (SheetTabMenuItemData | null)[],
        onItemSelect: (key: string) => void,
        options: SheetTabUIOptions = {},
    ): void {
        this.close();

        try {
            this.#onItemSelect = onItemSelect;

            this.#popupPanel = new PopupPanel();
            this.#dropdown = new SheetTabDropdown();

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
                zIndex: options.zIndex ?? 10002,
                showHeader: false,
                closeOnClickOutside: options.closeOnClickOutside ?? true,
                closeOnEscape: options.closeOnEscape ?? true,
                draggable: false,
                content: this.#dropdown,
                onClose: () => this.close(),
            });
        } catch (error) {
            errorHandler.error(ERROR_CODE.CONTEXT_MENU_UI_OPEN_ERROR, "打开工作表标签菜单失败", { originalError: error });
        }
    }

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

    get isOpen(): boolean {
        return this.#popupPanel !== null;
    }
}
