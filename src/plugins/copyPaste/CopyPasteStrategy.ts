import { EventStrategy } from "../../editor/strategies/EventStrategy.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";
import { InputDetector } from "../../utils/inputDetection.js";

/**
 * 复制粘贴策略 (Copy/Paste Strategy)
 *
 * 处理Canvas表格中的剪贴板操作，包括复制、粘贴和剪切。
 * 使用隐藏的contentEditable div作为粘贴目标，以捕获浏览器的粘贴事件。
 *
 * 优先级：STRATEGY_PRIORITY.SHORTCUT_KEY
 *
 * 核心功能：
 * 1. **复制** (Ctrl+C)：将选区数据复制到剪贴板
 * 2. **粘贴** (Ctrl+V)：从剪贴板读取数据并写入选区
 * 3. **剪切** (Ctrl+X)：复制后清空选区内容
 * 4. **外部输入检测**：编辑器打开或外部输入框聚焦时不拦截快捷键
 * 5. **外部文本选择检测**：用户选中外部文本时不拦截Ctrl+C/X
 * 6. **隐藏粘贴目标**：创建不可见的contentEditable div接收paste事件
 *
 * 快捷键映射：
 * ┌──────────┬──────────────────────────────────┐
 * │ Ctrl+C   │ 复制选区到剪贴板                  │
 * │ Ctrl+V   │ 聚焦隐藏div接收paste事件          │
 * │ Ctrl+X   │ 复制后清空选区（剪切）             │
 * └──────────┴──────────────────────────────────┘
 *
 * 粘贴机制：
 * 浏览器安全策略限制直接读取剪贴板，因此使用隐藏的contentEditable div：
 * 1. Ctrl+V时聚焦隐藏div
 * 2. 浏览器将剪贴板内容写入div并触发paste事件
 * 3. 从paste事件中读取数据并写入工作表
 *
 * @class CopyPasteStrategy
 * @extends EventStrategy
 */
export class CopyPasteStrategy extends EventStrategy {
    /** 策略优先级：快捷键 */
    priority: number = STRATEGY_PRIORITY.SHORTCUT_KEY;

    /** 外部输入检测器 */
    #inputDetector: InputDetector = new InputDetector();
    /** 隐藏的粘贴目标元素 */
    #pasteTarget: HTMLDivElement | null = null;
    /** 绑定的paste事件处理器 */
    #boundPasteHandler: ((e: ClipboardEvent) => void) | null = null;
    /** 剪贴板管理器实例 */
    clipboardManager: any;

    constructor(handler: any, clipboardManager: any) {
        super(handler);
        this.clipboardManager = clipboardManager;
    }

    init(): void {
        this.#ensurePasteTarget();
    }

    destroy(): void {
        this.#removePasteTarget();
        this.clipboardManager = null;
    }

    getEventHandlers(): Record<string, (e: Event) => boolean | void> {
        return {
            [DELEGATE_KEYS.DOCUMENT_KEYDOWN]: (e: Event) => this.#handleKeyDown(e as KeyboardEvent),
        };
    }

    #handleKeyDown(e: KeyboardEvent): boolean | void {
        if (!this.enabled) return undefined;

        const { sheet, editor } = this.handler;
        if (!sheet || !editor) return undefined;

        const activeEditor = editor.getActiveEditor();
        if (activeEditor && activeEditor.editor && activeEditor.editor.style.display === "block") {
            return undefined;
        }

        if (this.#inputDetector.isExternalInput()) {
            return undefined;
        }

        const ctrlOrMeta = e.ctrlKey || e.metaKey;

        if (ctrlOrMeta && (e.key === "c" || e.key === "x") && this.#inputDetector.hasExternalTextSelection()) {
            return undefined;
        }

        switch (e.key) {
            case "c":
                if (ctrlOrMeta) {
                    e.preventDefault();
                    this.handler.runHooks("beforeCopy", sheet.selection.getRange());
                    this.clipboardManager.copy(sheet);
                    this.handler.runHooks("afterCopy", sheet.selection.getRange());
                    return false;
                }
                break;
            case "v":
                if (ctrlOrMeta) {
                    this.#focusPasteTarget();
                    return false;
                }
                break;
            case "x":
                if (ctrlOrMeta) {
                    e.preventDefault();
                    this.handler.runHooks("beforeCut", sheet.selection.getRange());
                    this.clipboardManager.copy(sheet);
                    this.#handleDelete();
                    this.handler.runHooks("afterCut", sheet.selection.getRange());
                    return false;
                }
                break;
            default:
                break;
        }
        return undefined;
    }

    #ensurePasteTarget(): void {
        if (this.#pasteTarget) return;

        const div = document.createElement("div");
        div.contentEditable = "true";
        div.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;width:1px;height:1px;overflow:hidden;";
        document.body.appendChild(div);
        this.#pasteTarget = div;

        this.#boundPasteHandler = (pasteEvent: ClipboardEvent): void => {
            if (!this.enabled) return;

            const { sheet, editor } = this.handler;
            if (!sheet) return;

            const activeEditor = editor?.getActiveEditor();
            if (activeEditor && activeEditor.editor && activeEditor.editor.style.display === "block") {
                return;
            }

            pasteEvent.preventDefault();
            pasteEvent.stopPropagation();

            this.handler.runHooks("beforePaste", sheet.selection.getActive());
            this.clipboardManager.pasteFromEvent(sheet, pasteEvent);
            this.handler.runHooks("afterPaste", sheet.selection.getActive());

            div.textContent = "";
        };

        div.addEventListener("paste", this.#boundPasteHandler);
    }

    #removePasteTarget(): void {
        if (this.#pasteTarget) {
            if (this.#boundPasteHandler) {
                this.#pasteTarget.removeEventListener("paste", this.#boundPasteHandler);
                this.#boundPasteHandler = null;
            }
            if (document.body.contains(this.#pasteTarget)) {
                this.#pasteTarget.remove();
            }
            this.#pasteTarget = null;
        }
    }

    #focusPasteTarget(): void {
        this.#ensurePasteTarget();
        if (this.#pasteTarget) {
            this.#pasteTarget.focus();
        }
    }

    #handleDelete(): void {
        const { sheet } = this.handler;
        const accessor = sheet.cellDataAccessor;
        const range = sheet.selection.getRange();

        const changes: Array<{ row: number; col: number; oldValue: unknown; newValue: string }> = [];
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

        if (changes.length === 0) return;

        this.handler.runHooks("beforeChange", changes);

        for (const { row, col } of changes) {
            const oldCell = accessor.get(row, col);
            sheet.setCell(row, col, "", oldCell?.styleId || 0);
        }

        this.handler.runHooks("afterChange", changes);
        this.handler.render();
    }
}
