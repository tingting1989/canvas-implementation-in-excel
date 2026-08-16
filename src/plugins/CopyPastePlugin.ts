import { BasePlugin } from "./BasePlugin.js";
import { CopyPasteStrategy } from "../editor/strategies/CopyPasteStrategy.js";
import { ClipboardManager } from "../editor/ClipboardManager.js";
import { HOOKS } from "../constants/hookNames.js";

interface CopyPastePermissions {
    allowCopy?: boolean;
    allowPaste?: boolean;
    allowCut?: boolean;
}

interface CellChange {
    row: number;
    col: number;
    oldValue: any;
    newValue: any;
}

export class CopyPastePlugin extends BasePlugin {
    static get PLUGIN_NAME(): string {
        return "copyPaste";
    }

    #strategy: CopyPasteStrategy | null = null;
    #clipboard: ClipboardManager | null = null;
    #allowCopy: boolean = true;
    #allowPaste: boolean = true;
    #allowCut: boolean = true;

    init(options: Record<string, any> = {}): void {
        super.init(options);

        this.#allowCopy = options.allowCopy !== false;
        this.#allowPaste = options.allowPaste !== false;
        this.#allowCut = options.allowCut !== false;

        this.#clipboard = new ClipboardManager();
        this.workbook.clipboard = this.#clipboard;

        this.#strategy = new CopyPasteStrategy(this.eventHandler, this.#clipboard);
        this.addStrategy("copyPaste", this.#strategy);

        if (options.enabled === false) {
            this.disable();
        }
    }

    destroy(): void {
        this.#clipboard?.destroy();
        this.#strategy = null;
        this.#clipboard = null;
        this.workbook.clipboard = null;
        super.destroy();
    }

    enable(): void {
        super.enable();
        this.#strategy?.enable();
    }

    disable(): void {
        super.disable();
        this.#strategy?.disable();
    }

    copy(): void {
        const sheet = this.sheet;
        if (!sheet || !this.#clipboard || !this.#allowCopy) return;

        this.eventHandler?.runHooks(HOOKS.BEFORE_COPY, sheet.selection.getRange());
        this.#clipboard.copy(sheet);
        this.eventHandler?.runHooks(HOOKS.AFTER_COPY, sheet.selection.getRange());
    }

    paste(): void {
        const sheet = this.sheet;
        if (!sheet || !this.#clipboard || !this.#allowPaste) return;

        this.eventHandler?.runHooks(HOOKS.BEFORE_PASTE, sheet.selection.getActive());
        this.#clipboard.paste(sheet);
        this.eventHandler?.runHooks(HOOKS.AFTER_PASTE, sheet.selection.getActive());
        this.render();
    }

    cut(): void {
        const sheet = this.sheet;
        if (!sheet || !this.#clipboard || !this.#allowCut) return;

        const range = sheet.selection.getRange();
        this.eventHandler?.runHooks(HOOKS.BEFORE_CUT, range);

        this.#clipboard.copy(sheet);

        const accessor = sheet.cellDataAccessor;
        const changes: CellChange[] = [];
        for (let r = range.topRow; r <= range.bottomRow; r++) {
            for (let c = range.topCol; c <= range.bottomCol; c++) {
                if (!sheet.isDisabled(r, c)) {
                    const oldCell = accessor.get(r, c);
                    if (oldCell && oldCell.value !== "") {
                        changes.push({ row: r, col: c, oldValue: oldCell.value, newValue: "" });
                    }
                }
            }
        }
        if (changes.length > 0) {
            this.eventHandler?.runHooks(HOOKS.BEFORE_CHANGE, changes);
            sheet.beginBatch();
            for (const { row, col } of changes) {
                const oldCell = accessor.get(row, col);
                sheet.setCell(row, col, "", oldCell?.styleId || 0);
            }
            sheet.endBatch();
            this.eventHandler?.runHooks(HOOKS.AFTER_CHANGE, changes);
        }

        this.eventHandler?.runHooks(HOOKS.AFTER_CUT, range);
        this.render();
    }

    insertImage(options?: Record<string, any>): void {
        const sheet = this.sheet;
        if (!sheet || !this.#clipboard) return;
        this.#clipboard.insertImageFromFile(sheet, options);
    }

    clearClipboard(): void {
        this.#clipboard?.clear();
    }

    getClipboardManager(): ClipboardManager | null {
        return this.#clipboard;
    }

    setPermissions({ allowCopy, allowPaste, allowCut }: CopyPastePermissions = {}): void {
        if (allowCopy !== undefined) this.#allowCopy = allowCopy;
        if (allowPaste !== undefined) this.#allowPaste = allowPaste;
        if (allowCut !== undefined) this.#allowCut = allowCut;
    }
}
