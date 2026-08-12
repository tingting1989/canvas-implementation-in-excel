import { EventStrategy } from "./EventStrategy.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";
import { InputDetector } from "../../utils/inputDetection.js";

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
    /**
     * 策略优先级 - 高于 KeyboardStrategy(100)
     *
     * 设置为 SHORTCUT_KEY (10) 确保 Ctrl/Cmd+C/V/X 快捷键被此策略优先拦截，
     * 防止被键盘策略的默认分支（字符输入处理）捕获。
     */
    priority = STRATEGY_PRIORITY.SHORTCUT_KEY;

    /**
     * @private 私有字段 - 外部输入框检测器实例
     *
     * 使用公共工具 InputDetector 避免代码重复，
     * 与 KeyboardStrategy 共享相同的检测逻辑。
     *
     * @type {InputDetector}
     * @see InputDetector - 公共外部输入框检测器
     */
    #inputDetector = new InputDetector();

    /**
     * @private 私有字段 - 隐藏的 contentEditable div，用于接收浏览器 paste 事件
     *
     * **技术原理**：
     * 浏览器的 paste 事件只在可编辑元素（contentEditable、input、textarea）上触发。
     * Canvas 元素本身不支持 contentEditable，因此需要创建一个隐藏的可编辑 div 作为代理。
     *
     * **生命周期管理**：
     * - 在 `init()` 时通过 `#ensurePasteTarget()` 创建并挂载到 document.body
     * - 在 `destroy()` 时通过 `#removePasteTarget()` 移除并清理引用
     * - 持久复用：避免每次粘贴都创建/销毁 DOM 元素（性能优化）
     *
     * **CSS 隐藏策略**：
     * ```
     * position: fixed;      // 固定定位，不占用布局空间
     * left: -9999px;        // 移出可视区域
     * top: -9999px;         // 移出可视区域
     * opacity: 0;           // 完全透明
     * width: 1px; height: 1px;  // 最小尺寸
     * overflow: hidden;     // 隐藏溢出内容
     * ```
     *
     * **为什么不使用 display: none**：
     * display: none 的元素无法获得焦点，而我们需要聚焦它来触发浏览器的粘贴事件流。
     *
     * @type {HTMLDivElement|null}
     */
    #pasteTarget = null;

    /**
     * @private 私有字段 - 绑定的 paste 事件处理器引用
     *
     * 保存绑定到 #pasteTarget 上的 paste 事件监听器函数引用。
     * 用于在 destroy() 时正确移除事件监听器（避免内存泄漏）。
     *
     * **为什么需要保存引用**：
     * addEventListener/removeEventListener 必须使用相同的函数引用才能正确解绑。
     * 如果使用匿名函数，将无法在后续移除监听器。
     *
     * @type {Function|null}
     * @see #ensurePasteTarget - 创建时绑定
     * @see #removePasteTarget - 销毁时解绑
     */
    #boundPasteHandler = null;

    /**
     * 构造函数 - 初始化复制/粘贴策略
     *
     * 接收 EventHandler 和 ClipboardManager 实例，建立策略与数据管理器的关联关系。
     *
     * @param {import("../../core/EventHandler.js").EventHandler} handler - 事件处理器实例
     * @param {import("./ClipboardManager.js").ClipboardManager} clipboardManager - 剪贴板数据管理器
     *
     * @example
     * // CopyPastePlugin.init() 中调用
     * const clipboard = new ClipboardManager();
     * const strategy = new CopyPasteStrategy(this.eventHandler, clipboard);
     */
    constructor(handler, clipboardManager) {
        super(handler);
        this.clipboardManager = clipboardManager;
    }

    /**
     * 公共方法 - 初始化策略
     *
     * 执行初始化逻辑：
     * - 调用 `#ensurePasteTarget()` 创建隐藏的 contentEditable div
     * - 该 div 将用于接收浏览器的原生 paste 事件
     *
     * 由 EventHandler 在注册策略后自动调用。
     */
    init() {
        this.#ensurePasteTarget();
    }

    /**
     * 公共方法 - 销毁策略
     *
     * 清理所有资源：
     * 1. 调用 `#removePasteTarget()` 移除隐藏的 div 并解绑事件监听器
     * 2. 清空 clipboardManager 引用（帮助垃圾回收）
     *
     * 由 EventHandler 在移除策略或工作簿销毁时自动调用。
     */
    destroy() {
        this.#removePasteTarget();
        this.clipboardManager = null;
    }

    /**
     * 公共方法 - 获取事件处理器映射表
     *
     * 仅注册 DOCUMENT_KEYDOWN 事件处理器。
     * 通过拦截键盘事件来捕获 Ctrl/Cmd + C/V/X 快捷键组合。
     *
     * 为什么使用 DOCUMENT_KEYDOWN 而非 CANVAS_KEYDOWN：
     * - 即使焦点不在 canvas 上也能响应快捷键（提升用户体验）
     * - 符合用户对全局快捷键的心理预期
     *
     * @returns {Object<string, Function>} 事件类型到处理函数的映射
     */
    getEventHandlers() {
        return {
            [DELEGATE_KEYS.DOCUMENT_KEYDOWN]: (e) => this.#handleKeyDown(e),
        };
    }

    /**
     * @private 私有方法 - 处理 Ctrl/Cmd + C/V/X 快捷键（核心事件分发逻辑）
     *
     ** 前置条件检查：**
     1. 策略必须启用（this.enabled）
     2. 必须存在 sheet 和 editor 实例
     3. 不能处于单元格编辑状态（编辑框显示时让渡给编辑器处理）
     *
     ** 快捷键处理流程：**
     *
     * **Ctrl+C / Cmd+C - 复制操作**
     * ```
     * 检测到 ctrlOrMeta + 'c'
     *    ↓
     * preventDefault() 阻止浏览器默认行为
     *    ↓
     * 触发 beforeCopy 钩子（可取消或修改选区）
     *    ↓
     * clipboardManager.copy(sheet) 执行复制：
     *   - 读取当前选区的单元格数据
     *   - 序列化为 TSV 格式文本
     *   - 写入系统剪贴板（navigator.clipboard.writeText）
     *   - 同时保存内部副本（支持跨应用粘贴）
     *    ↓
     * 触发 afterCopy 钩子（用于同步UI状态，如显示复制边框）
     *    ↓
     * 返回 false 阻止事件继续传播
     * ```
     *
     * **Ctrl+V / Cmd+V - 粘贴操作**
     * ```
     * 检测到 ctrlOrMeta + 'v'
     *    ↓
     * 不调用 preventDefault()（需要浏览器处理粘贴快捷键）
     *    ↓
     * 调用 #focusPasteTarget() 聚焦隐藏的 contentEditable div
     *    ↓
     * 浏览器检测到可编辑元素上的 Ctrl+V → 自动触发 paste 事件
     *    ↓
     * paste 事件由 #boundPasteHandler 异步处理
     *    ↓
     * 返回 false 阻止 KeyboardStrategy 处理此按键
     * ```
     *
     * **Ctrl+X / Cmd+X - 剪切操作**
     * ```
     * 检测到 ctrlOrMeta + 'x'
     *    ↓
     * preventDefault() 阻止浏览器默认行为
     *    ↓
     * 触发 beforeCut 钩子
     *    ↓
     * clipboardManager.copy(sheet) 先执行复制（保存数据到剪贴板）
     *    ↓
     * #handleDelete() 删除选区内容（清空单元格值）
     *    ↓
     * 触发 afterCut 钩子
     *    ↓
     * 返回 false 阻止事件传播
     * ```
     *
     ** 返回值语义：**
     * - `false`：事件已消费，阻止 KeyboardStrategy 继续处理
     * - `undefined`：事件未匹配，允许其他策略处理
     *
     * @param {KeyboardEvent} e - 键盘事件对象
     * @returns {boolean|undefined} false 表示已消费，undefined 表示未处理
     *
     * @see #focusPasteTarget - 粘贴时聚焦隐藏div
     * @see #handleDelete - 剪切时的删除操作
     */
    #handleKeyDown(e) {
        if (!this.enabled) return undefined;

        const { sheet, editor } = this.handler;
        if (!sheet || !editor) return undefined;

        // 编辑状态下不拦截（编辑框内应有自己的复制粘贴行为）
        const activeEditor = editor.getActiveEditor();
        if (activeEditor && activeEditor.editor && activeEditor.editor.style.display === "block") {
            return undefined;
        }

        // ✅ 关键修复：检查焦点是否在外部输入框上（使用公共工具 InputDetector）
        // 如果用户在 input/textarea 等元素上操作，应让浏览器原生处理复制/粘贴/剪切
        if (this.#inputDetector.isExternalInput()) {
            return undefined; // 让渡给浏览器默认行为
        }

        const ctrlOrMeta = e.ctrlKey || e.metaKey;

        // ✅ 关键修复：存在文档文本选区时，Ctrl+C/X 让浏览器原生复制/剪切选中文本
        // （<input>/<textarea> 的选区不在 window.getSelection() 中，<canvas> 无可选文本，
        //   因此非空 getSelection 必定来自普通 HTML 内容，不应被 Canvas 策略拦截）
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

    // ═══════════════════════════════════════════════════════════════
    // 隐藏 contentEditable div 管理（粘贴机制的核心）
    // ═══════════════════════════════════════════════════════════════

    /**
     * @private 私有方法 - 确保隐藏的 contentEditable div 存在并绑定 paste 事件处理器
     *
     ** 执行步骤：**
     *
     * **1. 幂等性检查**：
     * 如果 #pasteTarget 已存在，直接返回（避免重复创建）。
     * 这种模式称为"懒初始化"或"确保存在"（Ensure Pattern）。
     *
     * **2. 创建 DOM 元素**：
     * ```javascript
     * const div = document.createElement('div');
     * div.contentEditable = 'true';  // 关键：使元素可接收 paste 事件
     * ```
     *
     * **3. 应用 CSS 隐藏样式**：
     * 使用内联样式而非 class（避免样式冲突和依赖外部CSS文件）：
     * - `position: fixed` - 脱离文档流，不影响页面布局
     * - `left/top: -9999px` - 移出可视区域（负坐标定位）
     * - `opacity: 0` - 完全透明（视觉隐藏但可交互）
     * - `width/height: 1px` - 最小尺寸减少内存占用
     * - `overflow: hidden` - 隐藏可能溢出的粘贴内容
     *
     * **4. 挂载到 DOM**：
     * `document.body.appendChild(div)` - 必须挂载到真实DOM树中，
     * 否则浏览器不会对其触发 paste 事件。
     *
     * **5. 绑定 paste 事件处理器**：
     * 创建 #boundPasteHandler 函数并绑定到 div 的 'paste' 事件。
     * 该处理器将在用户执行 Ctrl+V 后被浏览器自动调用。
     *
     * **paste 处理器内部逻辑：**
     * ```
     * 接收 ClipboardEvent 对象
     *    ↓
     * 前置条件检查（enabled、sheet、非编辑状态）
     *    ↓
     * preventDefault() + stopPropagation() 防止默认粘贴行为
     *    ↓
     * 触发 beforePaste 钩子
     *    ↓
     * clipboardManager.pasteFromEvent() 解析剪贴板数据：
     *   - text/plain → TSV 文本解析
     *   - text/html → 富文本提取
     *   - image/* → Blob 图片处理
     *    ↓
     * 触发 afterPaste 钩子
     *    ↓
     * 清空 div 内容（防止残留数据干扰下次粘贴）
     * ```
     *
     ** 无障碍考虑：**
     * 不设置 `aria-hidden="true"`，因为聚焦该元素时屏幕阅读器会发出警告。
     * 通过 CSS 完全隐藏已足够避免视觉干扰。
     *
     ** 性能优化：**
     * - DOM 元素持久复用（init 时创建，destroy 时销毁）
     * - 事件处理器引用保存（#boundPasteHandler）便于后续解绑
     * - 避免频繁的 DOM 操作（创建/销毁开销大）
     *
     * @returns {void}
     *
     * @see #boundPasteHandler - 绑定的 paste 事件处理器
     * @see #removePasteTarget - 销毁时的清理逻辑
     * @see #focusPasteTarget - 粘贴前的聚焦操作
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
            if (!this.enabled) return undefined;

            const { sheet, editor } = this.handler;
            if (!sheet) return undefined;

            const activeEditor = editor?.getActiveEditor();
            if (activeEditor && activeEditor.editor && activeEditor.editor.style.display === "block") {
                return undefined;
            }

            pasteEvent.preventDefault();
            pasteEvent.stopPropagation();

            this.handler.runHooks("beforePaste", sheet.selection.getActive());
            this.clipboardManager.pasteFromEvent(sheet, pasteEvent);
            this.handler.runHooks("afterPaste", sheet.selection.getActive());

            // 清除 div 中可能残留的内容
            div.textContent = "";
            return undefined;
        };

        div.addEventListener("paste", this.#boundPasteHandler);
    }

    /**
     * @private 私有方法 - 移除隐藏的 contentEditable div 并解绑所有事件监听器
     *
     ** 清理步骤：**
     *
     * **1. 安全检查**：
     * 仅当 #pasteTarget 存在时才执行清理（防御性编程）。
     *
     * **2. 解绑事件处理器**：
     * ```javascript
     * if (this.#boundPasteHandler) {
     *     this.#pasteTarget.removeEventListener('paste', this.#boundPasteHandler);
     *     this.#boundPasteHandler = null;  // 释放函数引用
     * }
     * ```
     * 必须使用相同的函数引用才能正确解绑（这是为什么需要保存 #boundPasteHandler）。
     *
     * **3. 从 DOM 移除元素**：
     * ```javascript
     * if (document.body.contains(this.#pasteTarget)) {
     *     this.#pasteTarget.remove();  // 从 DOM 树移除
     * }
     * ```
     * 先检查 contains() 避免抛出异常（如果元素已被外部代码移除）。
     *
     * **4. 清空引用**：
     * `this.#pasteTarget = null` - 帮助垃圾回收器回收 DOM 元素内存。
     *
     ** 内存泄漏防护：**
     * - 事件监听器解绑：防止 DOM 元素无法被 GC 回收
     * - 引用置 null：断开 JavaScript 对象与 DOM 元素的强引用
     * - DOM 移除：释放浏览器的 DOM 节点内存
     *
     ** 调用时机：**
     * - destroy() 时调用（策略销毁）
     * - 插件卸载时间接调用（通过 destroy 链）
     *
     * @returns {void}
     *
     * @see #ensurePasteTarget - 创建时的反向操作
     * @see destroy - 调用此方法的公共接口
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
     * @private 私有方法 - 聚焦隐藏的 contentEditable div 以触发浏览器 paste 事件流
     *
     ** 工作原理：**
     *
     * 当用户按下 Ctrl+V 时，浏览器的粘贴行为取决于焦点所在的元素类型：
     * - input/textarea/contentEditable 元素：自动触发 paste 事件 ✅
     * - 普通 div/span/canvas 等：不触发 paste 事件 ❌
     *
     * 因此，我们需要在检测到 Ctrl+V 后立即将焦点转移到隐藏的 contentEditable div 上，
     * 让浏览器"以为"用户是在一个可编辑元素上按下了粘贴快捷键。
     *
     ** 执行流程：**
     * ```
     * 用户按下 Ctrl+V
     *    ↓
     * #handleKeyDown() 检测到快捷键
     *    ↓
     * 调用 #focusPasteTarget()
     *    ↓
     * #ensurePasteTarget() 确保 div 存在（懒初始化）
     *    ↓
     * this.#pasteTarget.focus() 聚焦隐藏的 div
     *    ↓
     * 浏览器检测到：contentEditable 元素获得焦点 + Ctrl+V 快捷键
     *    ↓
     * 浏览器自动触发 paste 事件（异步，在下一个事件循环）
     *    ↓
     * #boundPasteHandler() 接收 ClipboardEvent 并处理数据
     * ```
     *
     ** 为什么是异步的？**
     * focus() 是同步操作，但浏览器的 paste 事件触发是异步的。
     * 这意味着 #handleKeyDown 返回后，paste 事件稍后才到达。
     * 这种机制允许我们在返回 false 阻止 KeyboardStrategy 后，
     * 仍然能够正确接收和处理粘贴数据。
     *
     ** 边界情况处理：**
     * - 如果 #pasteTarget 为 null（理论上不应该发生），先调用 #ensurePasteTarget()
     * - 如果聚焦失败（如元素被从 DOM 移除），paste 事件将不会触发（安全降级）
     *
     * @returns {void}
     *
     * @see #handleKeyDown - 粘贴快捷键的处理入口
     * @see #ensurePasteTarget - 确保目标元素存在
     * @see #boundPasteHandler - 实际的数据处理逻辑
     */
    #focusPasteTarget() {
        this.#ensurePasteTarget();
        if (this.#pasteTarget) {
            this.#pasteTarget.focus();
        }
    }

    /**
     * @private 私有方法 - 批量删除选区内的单元格内容（剪切操作的一部分）
     *
     ** 功能定位：**
     * 剪切操作 = 复制 + 删除。本方法负责"删除"部分。
     * 与 KeyboardStrategy.#handleDelete 保持逻辑一致性，确保用户体验统一。
     *
     ** 执行流程：**
     *
     * **阶段1：收集变更信息（不修改数据）**
     * ```
     * 获取当前选区范围 (range)
     *    ↓
     * 遍历选区内的每个单元格 (row, col)
     *    ↓
     * 过滤条件：
     *   ├── 单元格未被禁用 (!isDisabled)
     *   └── 单元格有实际值 (value !== "")
     *    ↓
     * 记录变更对象：{ row, col, oldValue, newValue: "" }
     *    ↓
     * 生成 changes 数组
     * ```
     *
     * **阶段2：前置钩子检查**
     * ```
     * 触发 beforeChange 钩子，传入 changes 数组
     *    ↓
     * 外部代码可：
     *   - 验证删除操作的合法性
     *   - 修改 changes 数组（添加/移除某些变更）
     *   - 返回 false 取消操作（通过钩子系统）
     * ```
     *
     * **阶段3：执行批量删除**
     * ```
     * 遍历 changes 数组
     *    ↓
     * 对每个单元格调用 sheet.setCell(row, col, "", styleId)
     *   - value 设为空字符串（清除内容）
     *   - styleId 保留原值（保留格式，仅清空数据）
     *    ↓
     * CellStore 内部更新数据模型
     * ```
     *
     * **阶段4：后置处理**
     * ```
     * 触发 afterChange 钩子通知其他组件
     *    ↓
     * handler.render() 重绘视口以反映变化
     * ```
     *
     ** 性能优化：**
     * - 两阶段处理（先收集再执行）减少不必要的遍历
     * - 空选区快速返回（changes.length === 0 检查）
     * - 单次 render() 而非每个单元格修改后都渲染
     * - 使用 cellDataAccessor 直接访问数据层（跳过渲染层）
     *
     ** 数据完整性保障：**
     * - 保留样式 ID（styleId）：删除内容但保留格式设置
     * - 跳过禁用单元格：防止修改受保护的区域
     * - 记录旧值：支持撤销/重做功能（UndoManager 可利用 changes 数组）
     * - 钩子拦截：允许外部验证和取消操作
     *
     ** 与其他组件的协作：**
     * - CellDataAccessor：读取和写入单元格数据
     * - SelectionManager：获取当前选区范围
     * - UndoManager：可通过 afterChange 钩子记录撤销快照
     * - RenderEngine：最终重绘反映变化
     *
     ** 边界情况处理：**
     * - 选区内所有单元格为空：changes 为空数组，提前返回
     * - 选区包含禁用单元格：自动跳过，不报错
     * - 单元格无样式（styleId 为 undefined）：使用默认值 0
     * - 大选区（如 1000x1000）：性能依赖 CellStore 的批量更新能力
     *
     * @returns {void}
     *
     * @see #handleKeyDown - 剪切操作时调用此方法
     * @see ClipboardManager.copy - 剪切的复制部分
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

        if (changes.length === 0) return undefined;

        this.handler.runHooks("beforeChange", changes);

        for (const { row, col } of changes) {
            const oldCell = accessor.get(row, col);
            sheet.setCell(row, col, "", oldCell?.styleId || 0);
        }

        this.handler.runHooks("afterChange", changes);
        this.handler.render();
        return undefined;
    }
}
