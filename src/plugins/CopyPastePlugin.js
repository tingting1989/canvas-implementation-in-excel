import { BasePlugin } from "./BasePlugin.js";
import { CopyPasteStrategy } from "../editor/strategies/CopyPasteStrategy.js";
import { ClipboardManager } from "../editor/ClipboardManager.js";
import { HOOKS } from "../constants/hookNames.js";

/**
 * 复制/粘贴插件
 *
 * 将复制、粘贴、剪切、图片插入功能封装为插件，支持：
 * - 动态加载/卸载
 * - 通过 disablePlugin("copyPaste") 在只读模式下禁用粘贴（保留复制）
 * - 通过 options.allowCopy / options.allowPaste / options.allowCut 精确控制各操作
 * - 在 copy/paste/cut 前后触发 BEFORE_COPY / AFTER_COPY 等钩子
 *
 * 快捷键：
 * - Ctrl+C：复制
 * - Ctrl+V：粘贴（通过浏览器原生 paste 事件，支持文本和图片）
 * - Ctrl+X：剪切（复制 + 删除）
 *
 * 粘贴机制（v2）：
 * - 使用浏览器原生 paste 事件（document:paste），无需 navigator.clipboard 权限弹窗
 * - 同步读取 e.clipboardData.items，支持 text/plain、image/png、image/jpeg 等
 * - 图片粘贴：提取 Blob → Object URL → ClipboardManager.#cellContent Map → TileRenderer 渲染
 * - 图片与 Cell 模型完全解耦，Cell 不感知内容类型
 * - 文本粘贴：保持原有 TSV 解析 + 类型系统转换
 *
 * 图片插入 API：
 * - workbook.copyPaste.insertImage({ row?, col? }) — 打开文件选择器插入图片
 * - 右键菜单"插入图片"依赖此插件
 *
 * 使用方式：
 * ```js
 * // 默认加载（允许所有操作）
 * workbook.loadPluginClass(CopyPastePlugin);
 *
 * // 只读模式：禁用粘贴和剪切，仅保留复制
 * workbook.loadPluginClass(CopyPastePlugin, { allowPaste: false, allowCut: false });
 *
 * // 完全禁用
 * workbook.disablePlugin("copyPaste");
 *
 * // 动态切换只读模式
 * workbook.enablePlugin("copyPaste");   // 恢复
 * ```
 */
export class CopyPastePlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "copyPaste";
    }

    /** @type {CopyPasteStrategy|null} */
    #strategy = null;

    /** @type {ClipboardManager|null} */
    #clipboard = null;

    /** 是否允许复制 */
    #allowCopy = true;

    /** 是否允许粘贴 */
    #allowPaste = true;

    /** 是否允许剪切 */
    #allowCut = true;

    /**
     * 初始化复制/粘贴插件
     * 创建 ClipboardManager 和 CopyPasteStrategy，注册到事件处理器。
     *
     * @param {object} options - 插件配置
     * @param {boolean} [options.enabled=true] - 是否默认启用
     * @param {boolean} [options.allowCopy=true] - 是否允许复制
     * @param {boolean} [options.allowPaste=true] - 是否允许粘贴
     * @param {boolean} [options.allowCut=true] - 是否允许剪切
     */
    init(options = {}) {
        super.init(options);

        this.#allowCopy = options.allowCopy !== false;
        this.#allowPaste = options.allowPaste !== false;
        this.#allowCut = options.allowCut !== false;

        // 创建 ClipboardManager 实例（替代 Workbook 中直接 new 的方式）
        this.#clipboard = new ClipboardManager();

        // 将 clipboard 引用挂到 workbook 上（保持向后兼容）
        this.workbook.clipboard = this.#clipboard;

        // 注册键盘策略，处理 Ctrl+C/V/X
        this.#strategy = new CopyPasteStrategy(this.eventHandler, this.#clipboard);
        this.addStrategy("copyPaste", this.#strategy);

        // 同步策略的初始启用状态
        if (options.enabled === false) {
            this.disable();
        }
    }

    /**
     * 销毁插件
     * 策略会由基类 removeOwnStrategies() 自动清理
     */
    destroy() {
        this.#clipboard?.destroy();
        this.#strategy = null;
        this.#clipboard = null;
        this.workbook.clipboard = null;
        super.destroy();
    }

    /**
     * 启用插件
     */
    enable() {
        super.enable();
        this.#strategy?.enable();
    }

    /**
     * 禁用插件
     * 禁用后 Ctrl+C/V/X 快捷键不再响应，paste 事件被跳过
     */
    disable() {
        super.disable();
        this.#strategy?.disable();
    }

    // ============================================================
    // 公共 API（供外部调用或 Workbook 委托）
    // ============================================================

    /**
     * 执行复制操作
     * 触发 beforeCopy → 执行复制 → afterCopy 钩子链
     */
    copy() {
        const sheet = this.sheet;
        if (!sheet || !this.#clipboard || !this.#allowCopy) return;

        this.eventHandler?.runHooks(HOOKS.BEFORE_COPY, sheet.selection.getRange());
        this.#clipboard.copy(sheet);
        this.eventHandler?.runHooks(HOOKS.AFTER_COPY, sheet.selection.getRange());
    }

    /**
     * 执行粘贴操作
     * 触发 beforePaste → 执行粘贴 → afterPaste 钩子链
     *
     * 注意：Ctrl+V 由 CopyPasteStrategy 通过隐藏 contenteditable div 处理（支持图片）；
     * 工具栏按钮调用此方法时走 navigator.clipboard.readText 路径（仅文本）。
     */
    paste() {
        const sheet = this.sheet;
        if (!sheet || !this.#clipboard || !this.#allowPaste) return;

        this.eventHandler?.runHooks(HOOKS.BEFORE_PASTE, sheet.selection.getActive());
        this.#clipboard.paste(sheet);
        this.eventHandler?.runHooks(HOOKS.AFTER_PASTE, sheet.selection.getActive());
        this.render();
    }

    /**
     * 执行剪切操作（复制 + 删除）
     * 触发 beforeCut → 复制 + 删除 → afterCut 钩子链
     */
    cut() {
        const sheet = this.sheet;
        if (!sheet || !this.#clipboard || !this.#allowCut) return;

        const range = sheet.selection.getRange();
        this.eventHandler?.runHooks(HOOKS.BEFORE_CUT, range);

        this.#clipboard.copy(sheet);

        // 删除选区内容（批量操作，一次撤销）
        const accessor = sheet.cellDataAccessor;
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

    /**
     * 通过文件选择器插入图片到当前活动单元格
     * @param {object} [options] - 同 ClipboardManager.insertImageFromFile 的 options
     */
    insertImage(options) {
        const sheet = this.sheet;
        if (!sheet || !this.#clipboard) return;
        this.#clipboard.insertImageFromFile(sheet, options);
    }

    /**
     * 清空内部剪贴板
     */
    clearClipboard() {
        this.#clipboard?.clear();
    }

    /**
     * 获取 ClipboardManager 实例
     * @returns {ClipboardManager|null}
     */
    getClipboardManager() {
        return this.#clipboard;
    }

    /**
     * 设置允许的操作
     * @param {{ allowCopy?: boolean, allowPaste?: boolean, allowCut?: boolean }} permissions
     */
    setPermissions({ allowCopy, allowPaste, allowCut } = {}) {
        if (allowCopy !== undefined) this.#allowCopy = allowCopy;
        if (allowPaste !== undefined) this.#allowPaste = allowPaste;
        if (allowCut !== undefined) this.#allowCut = allowCut;
    }
}
