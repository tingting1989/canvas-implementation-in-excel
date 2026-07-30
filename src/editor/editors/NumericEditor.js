/**
 * 数值编辑器 (Numeric Editor)
 *
 * 专用于编辑数值类型单元格的编辑器实现。
 * 继承自 {@link CellEditor} 基类，提供数值输入验证和格式化功能。
 *
 * 核心特性：
 * - **输入过滤**：实时拦截非数字字符（仅允许 0-9、.、-、eE）
 * - **粘贴净化**：自动将粘贴内容转换为有效数字
 * - **数值验证**：提交前调用工作表的验证逻辑
 * - **移动端优化**：使用 inputmode="decimal" 调出数字键盘
 *
 * 支持的数值格式：
 * ┌──────────────┬────────────────┬─────────────┐
 * │ 格式         │ 示例           │ 说明         │
 * ├──────────────┼────────────────┼─────────────┤
 * │ 整数         │ 42, -100      │ 普通整数     │
 * │ 小数         │ 3.14, -0.5    │ 浮点数       │
 * │ 科学计数法   │ 1.5e10, 2E-3  │ 大数/小数    │
 * │ 负数         │ -273.15       │ 带负号       │
 * └──────────────┴────────────────┴─────────────┘
 *
 * 输入过滤规则：
 * - ✅ 允许：数字(0-9)、小数点(.)、负号(-)、科学计数法(eE)
 * - ❌ 拒绝：字母（除eE外）、特殊符号、中文、空格等
 * - 特殊处理：负号只能在开头；小数点只能有一个
 *
 * 适用场景：
 * - 数量、金额、百分比等数值字段
 * - 科学计算数据
 * - 统计数据和财务报表
 * - 需要精确数值输入的场景
 *
 * 与父类的区别：
 * ┌────────────────────┬───────────────────┬───────────────────┐
 * │ 特性               │ CellEditor        │ NumericEditor     │
 * ├────────────────────┼───────────────────┼───────────────────┤
 * │ DOM 类型           │ input             │ input[type=text]  │
 * │ CSS 类名           │ ""                │ --numeric         │
 * │ 输入模式           │ text              │ decimal           │
 * │ 实时过滤           │ 无                │ ✅ 非数字字符     │
 * │ 粘贴处理           │ 默认              │ ✅ 自动转数字     │
 * │ 提交验证           │ 始终通过          │ ✅ 调用验证方法   │
 * └────────────────────┴───────────────────┴───────────────────┘
 *
 * @class NumericEditor
 * @extends CellEditor
 *
 * @example
 * ```js
 * // 创建数值编辑器
 * const editor = new NumericEditor(renderEngine, sheet);
 * editor.createEditor();
 * editor.show(3, 2);  // 编辑 C4 单元格
 *
 * // 用户输入 "abc123" → 自动过滤为 "123"
 * // 用户粘贴 "$1,234.56" → 自动转换为 "1234.56"
 *
 * // 获取验证后的值
 * const numValue = editor.getValue(); // "1234.56"
 * ```
 */
import { CellEditor } from "./CellEditor.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";

export class NumericEditor extends CellEditor {
    /**
     * 重写：返回数值编辑器的专用CSS类名
     *
     * 返回 "cs-cell-editor--numeric" 用于应用数值编辑器的特定样式，
     * 如右对齐、数字字体等视觉优化。
     *
     * @returns {string} CSS类名："cs-cell-editor--numeric"
     *
     * @override
     * @see CellEditor.getEditorCssClass - 基类实现（返回空字符串）
     */
    getEditorCssClass() {
        return "cs-cell-editor--numeric";
    }

    /**
     * 重写：返回数值编辑器的HTML属性
     *
     * 设置 input 元素的属性以优化数值输入体验：
     * - type="text": 使用文本类型（而非number）以支持更灵活的格式
     *   （如科学计数法、多小数点中间状态等）
     * - inputmode="decimal": 在移动设备上调出数字键盘（带小数点）
     *
     * 为什么不用 type="number"？
     * - type="number" 不支持科学计数法（1.5e10）
     * - 不允许某些中间状态（如 "-." 或 "1."）
     * - 不同浏览器的行为不一致
     * - 样式控制受限（如去除spinner按钮困难）
     *
     * @returns {Object<string, string>} HTML属性对象
     *          - type: "text"
     *          - inputmode: "decimal"
     *
     * @override
     * @see CellEditor.getEditorAttributes - 基类实现（返回空对象）
     */
    getEditorAttributes() {
        return { type: "text", inputmode: "decimal" };
    }

    /**
     * 重写：获取编辑器当前值（带trim处理）
     *
     * 在基类实现的基础上添加 trim() 操作，
     * 移除用户可能意外输入的首尾空白字符。
     *
     * 为什么需要trim？
     * - 复制粘贴时可能带入空格
     * - 某些输入法的全角/半角切换会产生空格
     * - 避免空格影响 parseFloat() 的解析结果
     *
     * @returns {string} 编辑器的值（已去除首尾空格）
     *                 如果编辑器不存在则返回空字符串
     *
     * @override
     * @see CellEditor.getEditorValue - 基类实现（无trim）
     */
    getEditorValue() {
        return this.editor?.value?.trim() ?? "";
    }

    /**
     * 重写：提交前的数值验证
     *
     * 在用户确认输入（按Enter或失焦）后、保存到单元格之前调用。
     * 委托给工作表的 validateCellValue() 方法进行验证。
     *
     * 验证流程：
     * 1. 调用 sheet.validateCellValue(row, col, newValue)
     * 2. 如果方法返回 false → 验证失败，拒绝提交
     * 3. 其他情况（true 或 undefined）→ 验证通过，允许提交
     *
     * 工作表可以实现的验证逻辑：
     * - 数值范围检查（如 0 ≤ x ≤ 100）
     * - 数据类型验证（如必须是整数）
     * - 业务规则校验（如不能为负数）
     * - 自定义错误提示
     *
     * @param {*} newValue - 用户输入的新值（字符串形式）
     *
     * @returns {boolean} 验证结果
     *          - true: 验证通过，允许提交
     *          - false: 验证失败，拒绝提交并恢复原值
     *
     * @override
     * @see CellEditor.validateBeforeCommit - 基类实现（始终返回true）
     * @see Sheet.validateCellValue - 工作表的验证方法
     */
    validateBeforeCommit(newValue) {
        return this.sheet.validateCellValue(this.activeRow, this.activeCol, newValue) !== false;
    }

    /**
     * 重写：绑定数值编辑器特有事件
     *
     * 除了基类的通用事件（blur、keydown）外，
     * 还绑定以下事件以实现数值专用功能：
     *
     * 1. **input事件**：每次按键后触发
     *    - 实时过滤非数字字符
     *    - 保持光标位置正确
     *
     * 2. **paste事件**：用户粘贴时触发
     *    - 拦截默认粘贴行为
     *    - 将剪贴板内容转换为纯数字
     *
     * @override
     * @see CellEditor.bindEditorEvents - 基类实现（空方法）
     * @see #onInput - 输入事件处理器
     * @see #onPaste - 粘贴事件处理器
     */
    bindEditorEvents() {
        this.trackEvent(this.editor, EVENT_NAMES.INPUT, (e) => this.#onInput(e));
        this.trackEvent(this.editor, EVENT_NAMES.PASTE, (e) => this.#onPaste(e));
    }

    /**
     * @private 私有方法 - 处理输入事件（实时过滤非数字字符）
     *
     * 每次用户按键或输入内容时触发此方法。
     * 核心职责是确保编辑器中只包含合法的数字字符。
     *
     * 过滤逻辑：
     * 1. 获取当前编辑器的完整值
     * 2. 使用正则表达式 `/[^0-9.\-eE]/g` 移除非数字字符
     *    - 保留：0-9 数字、. 小数点、- 负号、e/E 科学计数法
     *    - 移除：字母、中文、符号、空格等
     * 3. 如果过滤后的值与原值不同（说明有非法字符被移除）：
     *    a. 记录当前光标位置（selectionStart）
     *    b. 计算被移除的字符数量
     *    c. 更新编辑器值为过滤后的值
     *    d. 恢复光标位置（减去偏移量）
     *
     * 光标位置修正的重要性：
     * - 如果不修正，光标会跳到末尾，用户体验差
     * - 通过计算 diff（删除的字符数），精确定位光标
     * - 确保在任意位置输入非法字符时光标保持稳定
     *
     * 特殊情况处理：
     * - 中文输入法组合状态（composing）：跳过过滤，避免干扰IME
     * - 多个连续非法字符：一次性全部移除
     * - 负号和小数点的位置验证：由后续的validateBeforeCommit处理
     *
     * @param {InputEvent} e - InputEvent 对象
     *
     * @sideEffect 可能修改 this.editor.value 和光标位置
     *
     * @example
     * ```js
     * // 用户依次输入：a 1 b 2 . c 3
     * // 过滤过程：
     * // "a"     → ""     (删除a)
     * // "1"     → "1"    (保留)
     * // "1b"    → "1"    (删除b)
     * // "12"    → "12"   (保留)
     * // "12."   → "12."  (保留)
     * // "12.c"  → "12."  (删除c)
     * // "12.3"  → "12.3" (保留)
     * // 最终结果："12.3"
     * ```
     */
    #onInput(e) {
        if (this.composing) return;
        const value = this.editor.value;
        const cleaned = value.replace(/[^0-9.\-eE]/g, "");

        if (cleaned !== value) {
            const start = this.editor.selectionStart;
            const diff = value.length - cleaned.length;
            this.editor.value = cleaned;
            this.editor.setSelectionRange(start - diff, start - diff);
        }
    }

    /**
     * @private 私有方法 - 处理粘贴事件（自动转换为数字）
     *
     * 当用户使用 Ctrl+V 或右键粘贴时触发。
     * 拦截默认粘贴行为，将剪贴板内容智能转换为有效数字。
     *
     * 转换流程：
     * 1. 调用 e.preventDefault() 阻止默认粘贴
     * 2. 从 clipboardData 获取文本内容
     * 3. 使用 parseFloat() 尝试转换为数字
     * 4. 如果转换成功（非NaN）：替换编辑器内容为数字字符串
     * 5. 如果转换失败：忽略粘贴操作（保持原值不变）
     *
     * 智能转换示例：
     * ┌─────────────────┬──────────────┬─────────────────┐
     * │ 剪贴板内容      │ parseFloat() │ 最终结果         │
     * ├─────────────────┼──────────────┼─────────────────┤
     * │ "$1,234.56"     │ 1234.56      │ "1234.56"        │
     * │ "  42  "        │ 42           │ "42"             │
     * │ "3.14e2"        │ 314          │ "314"            │
     * │ "abc"           │ NaN          │ (忽略)           │
     * │ "1,000,000"     │ 1            │ "1" ⚠️          │
     * └─────────────────┴──────────────┴─────────────────┘
     *
     * ⚠️ 注意事项：
     * - parseFloat() 不处理千分位逗号（"1,000" → 1）
     * - 对于包含多个数字的文本，只取第一个
     * - 空字符串或纯文本会返回NaN并被忽略
     *
     * @param {ClipboardEvent} e - ClipboardEvent 对象
     *
     * @sideEffect 可能修改 this.editor.value
     *
     * @example
     * ```js
     * // 场景1：复制金额
     * // 剪贴板: "$1,234.56"
     * // 结果: 编辑器显示 "1234.56"
     *
     * // 场景2：复制普通文本
     * // 剪贴板: "Hello World"
     * // parseFloat("Hello World") = NaN
     * // 结果: 忽略粘贴，保持原值
     * ```
     */
    #onPaste(e) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData("text");
        const num = parseFloat(text);
        if (!isNaN(num)) {
            this.editor.value = String(num);
        }
    }
}
