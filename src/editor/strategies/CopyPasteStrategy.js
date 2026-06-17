import { EventStrategy } from "./EventStrategy.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";

/**
 * 复制/粘贴键盘策略
 *
 * 处理 Ctrl+C（复制）、Ctrl+V（粘贴）、Ctrl+X（剪切）快捷键。
 * 优先级 10，高于 KeyboardStrategy（priority=0），确保 Ctrl+C/V/X
 * 不被 KeyboardStrategy 的 default 分支（直接输入）捕获。
 *
 * 由 CopyPastePlugin 创建和注册，插件禁用时此策略会被 EventHandler
 * 的 enabled 检查自动跳过。
 */
export class CopyPasteStrategy extends EventStrategy {
    /** 高于 KeyboardStrategy(0) 的优先级 */
    priority = 10;

    /**
     * @param {import("../EventHandler.js").EventHandler} handler
     * @param {import("./ClipboardManager.js").ClipboardManager} clipboardManager
     */
    constructor(handler, clipboardManager) {
        super(handler);
        this.clipboardManager = clipboardManager;
    }

    init() {}

    destroy() {
        this.clipboardManager = null;
    }

    getEventHandlers() {
        return {
            [DELEGATE_KEYS.DOCUMENT_KEYDOWN]: (e) => this.#handleKeyDown(e),
        };
    }

    /**
     * 处理 Ctrl+C / Ctrl+V / Ctrl+X 快捷键
     * 返回 false 表示事件已消费，不继续传递给 KeyboardStrategy
     */
    #handleKeyDown(e) {
        if (!this.enabled) return;

        const { sheet, editor } = this.handler;
        if (!sheet || !editor) return;

        // 编辑状态下不拦截（编辑框内应有自己的复制粘贴行为）
        const activeEditor = editor.getActiveEditor();
        if (activeEditor && activeEditor.editor && activeEditor.editor.style.display === "block") {
            return;
        }

        const ctrlOrMeta = e.ctrlKey || e.metaKey;

        switch (e.key) {
            case "c":
                if (ctrlOrMeta) {
                    e.preventDefault();
                    this.handler.runHooks("beforeCopy", sheet.selection.getRange());
                    this.clipboardManager.copy(sheet);
                    this.handler.runHooks("afterCopy", sheet.selection.getRange());
                    return false; // 阻止 KeyboardStrategy 处理
                }
                break;
            case "v":
                if (ctrlOrMeta) {
                    e.preventDefault();
                    this.handler.runHooks("beforePaste", sheet.selection.getActive());
                    this.clipboardManager.paste(sheet);
                    // paste 是异步的，afterPaste 在 ClipboardManager 内部无法触发时
                    // 通过此处延迟触发不够精确，采用同步触发（粘贴完成后由 ClipboardManager 触发渲染）
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
        }
    }

    /**
     * 批量删除选区内容（与 KeyboardStrategy.#handleDelete 逻辑一致）
     * 剪切 = 复制 + 删除
     */
    #handleDelete() {
        const { sheet } = this.handler;
        const range = sheet.selection.getRange();

        const changes = [];
        for (let r = range.topRow; r <= range.bottomRow; r++) {
            for (let c = range.topCol; c <= range.bottomCol; c++) {
                if (!sheet.isDisabled(r, c)) {
                    const oldCell = sheet.cellStore.get(r, c);
                    if (oldCell && oldCell.value !== "") {
                        changes.push({ row: r, col: c, oldValue: oldCell.value, newValue: "" });
                    }
                }
            }
        }

        if (changes.length === 0) return;

        this.handler.runHooks("beforeChange", changes);

        for (const { row, col } of changes) {
            const oldCell = sheet.cellStore.get(row, col);
            sheet.setCell(row, col, "", oldCell?.styleId || 0);
        }

        this.handler.runHooks("afterChange", changes);
        this.handler.render();
    }
}
