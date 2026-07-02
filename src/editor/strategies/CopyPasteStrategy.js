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
 *
 * Ctrl+V 处理策略：
 * - 浏览器只在 contentEditable / input / textarea 上触发 paste 事件
 * - 按 Ctrl+V 时：不 preventDefault，而是聚焦隐藏的 contentEditable div
 * - 浏览器检测到可编辑元素 + Ctrl+V → 自然触发 paste 事件
 * - paste 事件在 div 上处理（同步读取 clipboardData，含图片 Blob）
 * - 处理完成后清除 div 内容，焦点由用户下一次操作自然转移
 */
export class CopyPasteStrategy extends EventStrategy {
    /** 高于 KeyboardStrategy(0) 的优先级 */
    priority = 10;

    /**
     * 隐藏的 contentEditable div，用于接收浏览器 paste 事件
     * 持久存在于 DOM 中，避免每次粘贴都创建/销毁
     * @type {HTMLDivElement|null}
     */
    #pasteTarget = null;

    /** bound paste handler 引用，用于解绑 */
    #boundPasteHandler = null;

    /**
     * @param {import("../../core/EventHandler.js").EventHandler} handler
     * @param {import("./ClipboardManager.js").ClipboardManager} clipboardManager
     */
    constructor(handler, clipboardManager) {
        super(handler);
        this.clipboardManager = clipboardManager;
    }

    init() {
        this.#ensurePasteTarget();
    }

    destroy() {
        this.#removePasteTarget();
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
        }
    }

    // ============================================================
    // 隐藏 contentEditable div 管理
    // ============================================================

    /**
     * 确保隐藏 div 存在并绑定 paste 处理器
     */
    #ensurePasteTarget() {
        if (this.#pasteTarget) return;

        const div = document.createElement("div");
        div.contentEditable = "true";

        // 不设置 aria-hidden，否则聚焦时会触发无障碍警告
        // 视觉上已通过 CSS 完全隐藏（fixed + 负坐标 + opacity:0）
        div.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;width:1px;height:1px;overflow:hidden;";
        document.body.appendChild(div);
        this.#pasteTarget = div;

        this.#boundPasteHandler = (pasteEvent) => {
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

            // 清除 div 中可能残留的内容
            div.textContent = "";
        };

        div.addEventListener("paste", this.#boundPasteHandler);
    }

    /**
     * 移除隐藏 div 并解绑
     */
    #removePasteTarget() {
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

    /**
     * 聚焦隐藏 div，触发浏览器的 paste 事件流
     */
    #focusPasteTarget() {
        this.#ensurePasteTarget();
        if (this.#pasteTarget) {
            this.#pasteTarget.focus();
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
                    const realR = sheet.toRealRow(r);
                    const oldCell = sheet.cellStore.get(realR, c);
                    if (oldCell && oldCell.value !== "") {
                        changes.push({ row: r, col: c, oldValue: oldCell.value, newValue: "" });
                    }
                }
            }
        }

        if (changes.length === 0) return;

        this.handler.runHooks("beforeChange", changes);

        for (const { row, col } of changes) {
            const realR = sheet.toRealRow(row);
            const oldCell = sheet.cellStore.get(realR, col);
            sheet.setCell(row, col, "", oldCell?.styleId || 0);
        }

        this.handler.runHooks("afterChange", changes);
        this.handler.render();
    }
}
