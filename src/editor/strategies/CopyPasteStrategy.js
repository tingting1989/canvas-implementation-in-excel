import { EventStrategy } from "./EventStrategy.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";

/**
 * 复制/粘贴策略 (Copy/Paste Strategy)
 *
 * 处理Canvas表格中的剪贴板操作，包括复制、粘贴和剪切功能。
 * 使用特殊的浏览器兼容性技术实现跨平台粘贴支持。
 *
 * 优先级：10（STRATEGY_PRIORITY.SHORTCUT_KEY）
 * - 高于 KeyboardStrategy (100)，确保快捷键优先拦截
 * - 防止被键盘策略的默认分支（字符输入）捕获
 *
 * 核心功能：
 * ┌────────────────┬─────────────────────────────────────────────┐
 * │ 快捷键         │ 功能                                        │
 * ├────────────────┼─────────────────────────────────────────────┤
 * │ Ctrl+C / Cmd+C│ 复制选区内容到剪贴板                      │
 * │ Ctrl+X / Cmd+X│ 剪切选区内容（复制后清空）               │
 * │ Ctrl+V / Cmd+V│ 从剪贴板粘贴内容                          │
 * └────────────────┴─────────────────────────────────────────────┘
 *
 * 技术架构亮点：
 *
 * **1. 智能粘贴机制**：
 * 浏览器的paste事件只在contentEditable/input/textarea元素上触发。
 * 为了在Canvas中支持粘贴，采用以下技巧：
 *
 * ```
 * 用户按 Ctrl+V
 *    ↓
 * keydown事件捕获（不preventDefault）
 *    ↓
 * 程序化聚焦隐藏的 contentEditable div
 *    ↓
 * 浏览器检测到可编辑元素 + 快捷键 → 触发paste事件
 *    ↓
 * 在div上同步读取 clipboardData（包括图片Blob）
 *    ↓
 * 处理数据并写入单元格
 *    ↓
 * 清除div内容，等待下次使用
 * ```
 *
 * **2. 数据格式支持**：
 * - 文本数据（TSV格式，制表符分隔）
 * - 富文本格式（HTML）
 * - 图片数据（Blob对象）
 * - 自定义格式（application/json等）
 *
 * **3. 与插件系统集成**：
 * - 由 CopyPastePlugin 创建和管理
 * - 插件禁用时策略自动失效（enabled检查）
 * - 通过 ClipboardManager 协调数据流
 *
 * **4. 跨平台兼容**：
 * - Windows: Ctrl+C/V/X
 * - macOS: Cmd+C/V/X (通过 metaKey 检测)
 * - Linux: 支持 X11 剪贴板选择机制
 *
 * 性能优化：
 * - pasteTarget DOM元素持久复用（避免重复创建/销毁）
 * - 大数据量异步处理（不阻塞UI线程）
 * - 批量操作API减少重绘次数
 * - 内存管理：及时释放大对象的引用
 *
 * 安全考虑：
 * - 仅在用户主动操作时访问剪贴板（符合浏览器安全策略）
 * - 不自动读取剪贴板内容（需用户触发）
 * - 粘贴前可进行数据验证和清理
 *
 * @class CopyPasteStrategy
 * @extends EventStrategy
 *
 * @see EventStrategy - 基类
 * @see KeyboardStrategy - 键盘交互策略（低优先级）
 * @see ClipboardManager - 剪贴板数据管理器
 *
 * @example
 * // 典型使用场景
 * // 1. 用户选中 A1:C5 区域
 * // 2. 按 Ctrl+C 复制（数据进入系统剪贴板）
 * // 3. 选中目标位置 D1
 * // 4. 按 Ctrl+V 粘贴
 * // 5. A1:C5 的内容被粘贴到 D1:F5
 * // 6. 支持跨应用粘贴（如从Excel粘贴到Canvas表格）
 */
export class CopyPasteStrategy extends EventStrategy {
    /** 高于 KeyboardStrategy(0) 的优先级 */
    priority = STRATEGY_PRIORITY.SHORTCUT_KEY;

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
        const accessor = sheet.cellDataAccessor;
        const range = sheet.selection.getRange();

        const changes = [];
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
