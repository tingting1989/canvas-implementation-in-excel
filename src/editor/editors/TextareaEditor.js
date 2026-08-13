/**
 * 多行文本编辑器 (Textarea Editor)
 *
 * 专用于编辑多行文本或长文本内容的编辑器实现。
 * 继承自 {@link CellEditor} 基类，使用 HTML <textarea> 元素。
 *
 * 核心特性：
 * - **多行支持**：使用 textarea 替代 input，支持 Enter 换行
 * - **自动调整高度**：根据内容自动扩展，但不超过可视区域
 * - **特殊按键行为**：
 *   - Enter: 插入换行（而非提交）
 *   - Ctrl+Enter / Meta+Enter: 提交编辑
 *   - Tab: 提交编辑
 *   - Escape: 取消编辑
 * - **滚动优化**：阻止滚轮事件冒泡，避免误操作
 *
 * 与单行编辑器的区别：
 * ┌────────────────────┬───────────────────┬───────────────────┐
 * │ 特性               │ TextEditor        │ TextareaEditor    │
 * ├────────────────────┼───────────────────┼───────────────────┤
 * │ DOM 元素           │ input             │ textarea          │
 * │ 换行行为           │ Enter 提交        │ Enter 换行        │
 * │ 提交方式           │ Enter/Tab/Esc     │ Ctrl+Enter/Tab   │
 * │ 高度               │ 固定              │ ✅ 自动调整       │
 * │ 适用场景           │ 短文本            │ 长文本/多行       │
 * │ 最大长度           │ 无限制            │ 可配置 maxLength  │
 * └────────────────────┴───────────────────┴───────────────────┘
 *
 * 样式特性：
 * - resize="none": 禁止用户手动拖拽调整大小
 * - overflow="hidden/auto": 超出范围时显示滚动条
 * - white-space="pre-wrap": 保留空白和换行符
 * - word-wrap="break-word": 长单词自动换行
 * - lineHeight: 可配置的行高比例（默认1.2）
 *
 * 适用场景：
 * - 备注字段、详细描述
 * - 日志内容、评论输入
 * - 地址、多行地址信息
 * - JSON/XML 等结构化文本
 * - 任何需要多行输入的场景
 *
 * 性能考量：
 * - autoResize() 在每次 input 事件时调用
 * - 使用 scrollHeight 计算实际内容高度
 * - 高度计算有最小值约束（#minHeight）
 * - 建议对超长文本（>10000字符）考虑虚拟化
 *
 * @class TextareaEditor
 * @extends CellEditor
 *
 * @example
 * ```js
 * // 创建多行文本编辑器
 * const editor = new TextareaEditor(renderEngine, sheet);
 * editor.createEditor();
 * editor.show(10, 2);  // 编辑 C11 单元格
 *
 * // 用户可以输入多行文本：
 * // 第一行内容
 * // 第二行内容
 * // 第三行内容
 *
 * // 按 Ctrl+Enter 提交
 * const multiLineText = editor.getValue();
 * // "第一行内容\n第二行内容\n第三行内容"
 * ```
 */
import { CellEditor } from "./CellEditor.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";
import { CONFIG } from "../../constants/config.js";

export class TextareaEditor extends CellEditor {
    /**
     * @private 私有字段 - 编辑器的最小高度
     *
     * 存储编辑器初始显示时的高度（即单元格的高度）。
     * 在 afterShow() 中设置，用于 autoResize() 的下限约束。
     *
     * 为什么需要最小高度？
     * - 防止编辑器收缩到比单元格还小
     * - 保证基本的可读性和可用性
     * - 避免用户看不到已输入的内容
     *
     * @type {number}
     * @private
     */
    #minHeight = 0;

    /**
     * 重写：返回 textarea 元素类型
     *
     * 覆盖基类的默认 input 元素，
     * 使用 HTML <textarea> 元素支持多行文本输入。
     *
     * @returns {string} 元素类型："textarea"
     *
     * @override
     * @see CellEditor.getElementType - 基类实现（返回 "input"）
     */
    getElementType() {
        return "textarea";
    }

    /**
     * 重写：返回多行文本编辑器的专用CSS类名
     *
     * 返回 "cs-cell-editor--textarea" 用于应用特定的样式，
     * 如等宽字体、合适的内边距等。
     *
     * @returns {string} CSS类名："cs-cell-editor--textarea"
     *
     * @override
     */
    getEditorCssClass() {
        return "cs-cell-editor--textarea";
    }

    /**
     * 重写：返回 textarea 的HTML属性
     *
     * 设置以下属性：
     * - rows="1": 初始显示为1行（会自动扩展）
     * - maxLength: 如果配置了最大长度限制则应用
     *
     * 为什么设置 rows=1？
     * - 初始状态紧凑，不占用过多空间
     * - 配合 autoResize() 实现动态高度
     * - 避免一开始就显示很大的文本框
     *
     * @returns {Object<string, string|number>} HTML属性对象
     *
     * @override
     */
    getEditorAttributes() {
        const attrs = {
            rows: 1,
        };
        if (this.options?.maxLength) {
            attrs.maxLength = this.options.maxLength;
        }
        return attrs;
    }

    /**
     * 重写：读取单元格值（与TextEditor相同）
     *
     * 支持公式显示：如果单元格包含公式，
     * 返回公式的字符串形式而非计算结果。
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     *
     * @returns {string} 单元格的值或公式字符串
     *
     * @override
     */
    readCellValue(row, col) {
        const cell = this.sheet.cellStore.get(row, col);
        if (cell?.formula) return cell.formula;
        return cell?.value ?? "";
    }

    /**
     * 重写：格式化值为字符串
     *
     * 将任意类型的值转换为字符串形式，
     * 用于在编辑器中显示。
     *
     * @param {*} rawValue - 原始值
     *
     * @returns {string} 格式化后的字符串
     *
     * @override
     */
    formatValueForEditor(rawValue) {
        return String(rawValue ?? "");
    }

    /**
     * 重写：获取编辑器当前值
     *
     * 返回 textarea 的当前内容。
     * 包含所有换行符和空格。
     *
     * @returns {string} 编辑器的完整文本内容
     *
     * @override
     */
    getEditorValue() {
        return this.editor?.value ?? "";
    }

    /**
     * 重写：创建后的样式初始化
     *
     * 设置 textarea 的关键CSS属性以实现多行编辑功能：
     *
     * - **resize="none"**: 禁止手动拖拽调整大小
     *   - 保持编辑器尺寸由代码控制
     *   - 避免用户破坏布局
     *
     * - **overflow="hidden"**: 默认隐藏溢出内容
     *   - 配合 autoResize() 动态调整高度
     *   - 超出最大高度时会改为 "auto" 显示滚动条
     *
     * - **lineHeight**: 行高比例（从CONFIG读取）
     *   - 影响每行文本的垂直间距
     *   - 默认值通常为 1.2 或 1.5
     *
     * - **paddingTop="2px"**: 顶部内边距
     *   - 文本不紧贴上边框
     *   - 提供更好的视觉效果
     *
     * - **whiteSpace="pre-wrap"**: 保留空白和换行
     *   - 保留用户输入的空格和制表符
     *   - 允许长行自动换行
     *
     * - **wordWrap="break-word"**: 长单词换行
     *   - 防止单词超出容器宽度
     *   - 特别适用于URL或长标识符
     *
     * @override
     */
    afterCreateEditor() {
        if (this.editor) {
            this.editor.style.resize = "none";
            this.editor.style.overflow = "hidden";
            this.editor.style.lineHeight = CONFIG.TEXTAREA_LINE_HEIGHT_RATIO;
            this.editor.style.paddingTop = "2px";
            this.editor.style.whiteSpace = "pre-wrap";
            this.editor.style.wordWrap = "break-word";
        }
    }

    /**
     * 重写：显示后的初始化（核心方法）
     *
     * 在编辑器显示后执行关键的初始化工作：
     *
     * 1. **记录最小高度**
     *    - 将当前单元格高度保存到 #minHeight
     *    - 作为 autoResize() 的下限
     *    - 确保编辑器不会小于单元格
     *
     * 2. **计算并设置精确行高**
     *    - 从编辑器样式中读取字号
     *    - 乘以配置的行高比例（如1.2）
     *    - 以像素单位设置 lineHeight
     *    - 确保行高与字号成比例
     *
     * 3. **设置最大高度**
     *    - 计算编辑器底部到视口底部的距离
     *    - 设置 maxHeight 防止超出可视区域
     *    - 与 SelectEditor 类似的逻辑
     *
     * 4. **触发自动调整大小**
     *    - 调用 #autoResize() 根据内容调整高度
     *    - 处理可能存在的多行内容
     *
     * @param {number} _row - 行号（未使用，保留参数）
     * @param {number} _col - 列号（未使用，保留参数）
     * @param {string} _cursorMode - 光标模式（未使用，保留参数）
     *
     * @override
     */
    afterShow(_row, _col, _cursorMode) {
        if (this.editor) {
            this.#minHeight = parseInt(this.editor.style.height, 10) || 0;
            const fontSize = parseFloat(this.editor.style.fontSize) || CONFIG.DEFAULT_FONT_SIZE;
            const lineHeight = fontSize * CONFIG.TEXTAREA_LINE_HEIGHT_RATIO;
            this.editor.style.lineHeight = lineHeight + "px";

            const editorTop = parseInt(this.editor.style.top, 10) || 0;
            const viewH = this.viewport?.viewH ?? Infinity;
            const maxAllowed = Math.max(0, viewH - editorTop);
            this.editor.style.maxHeight = maxAllowed + "px";
        }
        this.#autoResize();
    }

    /**
     * 重写：绑定多行文本编辑器特有事件
     *
     * 绑定三个特殊事件：
     *
     * 1. **input事件**：每次内容变化时触发
     *    - 调用 #autoResize() 自动调整高度
     *    - 确保编辑器始终适应内容大小
     *
     * 2. **keydown事件**：处理特殊的按键行为
     *    - Enter: 允许换行（不提交）
     *    - Ctrl+Enter: 提交编辑
     *    - Escape: 取消编辑
     *    - Tab: 提交编辑
     *    - 调用 #onTextareaKeyDown() 处理
     *
     * 3. **wheel事件**：阻止滚轮冒泡
     *    - 防止在操作文本框时意外滚动表格
     *
     * @override
     */
    bindEditorEvents() {
        if (!this.editor) return;
        this.trackEvent(this.editor, "input", () => this.#autoResize());
        this.trackEvent(this.editor, EVENT_NAMES.KEYDOWN, (e) => this.#onTextareaKeyDown(e));
        this.trackEvent(this.editor, EVENT_NAMES.WHEEL, (e) => {
            e.stopPropagation();
        });
    }

    /**
     * @private 私有方法 - 处理键盘按下事件（特殊按键行为）
     *
     * 覆盖基类的默认键盘处理，为多行文本编辑提供特殊行为：
     *
     * **Enter键**（无修饰键）：
     * - 允许插入换行符（return 不做任何事）
     * - 这是与单行编辑器的关键区别
     *
     * **Ctrl+Enter / Meta+Enter**：
     * - 阻止默认行为（preventDefault）
     * - 触发 blur() 提交编辑
     * - 这是多行文本的主要提交方式
     *
     * **Escape键**：
     * - 恢复原始值（originalValue）
     * - 清除批量填充范围
     * - 触发 blur() 取消编辑
     *
     * **Tab键**：
     * - 阻止默认的焦点切换
     * - 触发 blur() 提交编辑
     * - 与基类 Tab 行为一致
     *
     * 其他按键由浏览器默认处理（字符输入、删除等）。
     *
     * @param {KeyboardEvent} e - 键盘事件对象
     *
     * @sideEffect 可能触发 blur() 导致编辑提交或取消
     */
    #onTextareaKeyDown(e) {
        if (this.composing) return;

        if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
            return;
        }

        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.editor.blur();
            return;
        }

        if (e.key === "Escape") {
            e.preventDefault();
            this.editor.value = this.formatValueForEditor(this.originalValue);
            delete this.sheet._batchFillRange;
            this.editor.blur();
            return;
        }

        if (e.key === "Tab") {
            e.preventDefault();
            this.editor.blur();
            return;
        }
    }

    /**
     * @private 私有方法 - 自动调整编辑器高度
     *
     * 根据文本内容动态调整 textarea 的高度，
     * 在最小高度（#minHeight）和最大高度（maxHeight）之间。
     *
     * 调整算法：
     * 1. **临时重置高度**：设置 height="auto"
     *    - 让浏览器根据内容计算自然高度
     *    - scrollHeight 会反映内容的实际高度
     *
     * 2. **获取内容高度**：读取 scrollHeight
     *    - 包含所有行的高度总和
     *   - 包括 padding 但不包括 border/margin
     *
     * 3. **读取最大高度限制**：
     *    - 从 style.maxHeight 解析（在 afterShow 中设置）
     *    - 如果未设置则使用 scrollH（即不限制）
     *
     * 4. **计算目标高度**：
     *    ```js
     *    targetH = Math.max(
     *      Math.min(scrollH, maxH),  // 不超过最大值
     *      this.#minHeight            // 不小于最小值
     *    )
     *    ```
     *
     * 5. **应用新高度和溢出模式**：
     *    - 设置 height = targetH + "px"
     *    - 如果内容超出 → overflow = "auto"（显示滚动条）
     *    - 如果内容适配 → overflow = "hidden"（隐藏滚动条）
     *
     * 调用时机：
     * - afterShow(): 初始显示时
     * - input 事件: 每次用户输入/删除字符时
     *
     * 性能说明：
     * - 每次调用都会触发 reflow（读取 scrollHeight）
     * - 对于频繁输入可能造成性能压力
     * - 可考虑使用 debounce 优化（如 16ms 延迟）
     * - 现代浏览器的 reflow 已经很快，通常可接受
     *
     * @sideEffect 修改 this.editor.style.height 和 .overflow
     */
    #autoResize() {
        if (!this.editor) return;
        this.editor.style.height = "auto";
        const scrollH = this.editor.scrollHeight;
        const maxH = parseInt(this.editor.style.maxHeight, 10) || scrollH;
        const targetH = Math.max(Math.min(scrollH, maxH), this.#minHeight);
        this.editor.style.height = targetH + "px";
        this.editor.style.overflow = scrollH > maxH ? "auto" : "hidden";
    }

    /**
     * 重写：设置光标模式（增强版）
     *
     * 覆盖基类的光标设置，增加对多行文本的特殊处理：
     *
     * **"end" 模式**（定位到末尾）：
     * - 将光标移动到文本末尾
     * - 额外操作：**滚动到底部**
     *   - 设置 scrollTop = scrollHeight
     *   - 确保用户看到最后一行
     *   - 对于多行文本非常重要
     *
     * **"select" 模式**（全选）：
     * - 调用基类实现（editor.select()）
     * - 选中所有文本
     *
     * 为什么需要滚动到底部？
     * - 多行文本编辑器可能内容很长
     * - 光标在末尾但视图还在顶部
     * - 用户需要看到正在编辑的位置
     * - 提供更好的用户体验
     *
     * @param {string} cursorMode - 光标模式："end" 或 "select"
     *
     * @override
     * @see CellEditor.setCursorMode - 基类实现
     */
    setCursorMode(cursorMode) {
        if (!this.editor) return;
        if (cursorMode === "end") {
            const len = this.editor.value.length;
            this.editor.setSelectionRange(len, len);
            this.editor.scrollTop = this.editor.scrollHeight;
        }
    }
}
