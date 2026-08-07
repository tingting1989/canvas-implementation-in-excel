/**
 * 下拉选择编辑器 (Select Editor)
 *
 * 专用于从预定义选项列表中选择值的编辑器实现。
 * 继承自 {@link CellEditor} 基类，提供下拉菜单式的数据输入方式。
 *
 * 核心特性：
 * - **选项列表**：从单元格类型配置中读取可选值
 * - **动态构建**：每次显示时根据单元格配置重新生成选项
 * - **多种模式**：支持严格模式和宽松模式
 * - **自定义输入**：可选择允许用户输入非预设值
 *
 * 数据源格式：
 * 支持两种格式的选项列表：
 *
 * 1. **简单数组**（值=显示文本）：
 * ```js
 * source: ["选项1", "选项2", "选项3"]
 * ```
 *
 * 2. **对象数组**（值和显示文本分离）：
 * ```js
 * source: [
 *   { value: "opt1", label: "选项一" },
 *   { value: "opt2", label: "选项二" }
 * ]
 * ```
 *
 * 编辑器配置（通过 CellType.getEditorOptions() 提供）：
 * ┌──────────────┬──────────┬─────────────────────────────────┐
 * │ 属性          │ 类型      │ 说明                            │
 * ├──────────────┼──────────┼─────────────────────────────────┤
 * │ source       │ Array    │ 选项数据源                      │
 * │ allowInvalid │ boolean  │ 是否允许自定义输入               │
 * │ strict       │ boolean  │ 是否严格验证（仅允许预设值）     │
 * └──────────────┴──────────┴─────────────────────────────────┘
 *
 * 适用场景：
 * - 状态字段（待处理/进行中/已完成）
 * - 类型分类（高/中/低优先级）
 * - 性别、学历等有限选项的字段
 * - 需要标准化输入以避免拼写错误的场景
 * - 枚举类型数据的录入
 *
 * 与父类的区别：
 * ┌────────────────────┬───────────────────┬───────────────────┐
 * │ 特性               │ CellEditor        │ SelectEditor      │
 * ├────────────────────┼───────────────────┼───────────────────┤
 * │ DOM 元素           │ input             │ select            │
 * │ CSS 类名           │ ""                │ --select          │
 * │ 输入方式           │ 键盘输入          │ 下拉选择          │
 * │ 选项来源           │ 无                │ ✅ 动态构建        │
 * │ 光标控制           │ 支持              │ 禁用              │
 * │ 滚动事件           │ 默认              │ ✅ 阻止冒泡       │
 * └────────────────────┴───────────────────┴───────────────────┘
 *
 * @class SelectEditor
 * @extends CellEditor
 *
 * @example
 * ```js
 * // 单元格类型配置示例
 * class StatusColumnType extends CellType {
 *   getEditorOptions() {
 *     return {
 *       source: [
 *         { value: "pending", label: "待处理" },
 *         { value: "processing", label: "进行中" },
 *         { value: "completed", label: "已完成" }
 *       ],
 *       allowInvalid: false,
 *       strict: true
 *     };
 *   }
 * }
 *
 * // 使用下拉编辑器
 * const editor = new SelectEditor(renderEngine, sheet);
 * editor.createEditor();
 * editor.show(5, 2);  // 显示包含三个选项的下拉框
 * ```
 */
import { CellEditor } from "./CellEditor.js";

export class SelectEditor extends CellEditor {
    /**
     * @private 私有字段 - 选项数据源
     *
     * 存储当前编辑器的可选值列表。
     * 在 afterShow() 中从单元格类型配置读取并赋值。
     *
     * @type {Array<string|Object>}
     * @private
     *
     * @example
     * // 简单格式
     * this.#source = ["选项A", "选项B"];
     *
     * // 对象格式
     * this.#source = [
     *   { value: "a", label: "选项A" },
     *   { value: "b", label: "选项B" }
     * ];
     */
    #source = [];

    /**
     * @private 私有字段 - 是否允许自定义输入（无效值）
     *
     * 当设置为 true 时：
     * - 第一个选项显示为"— 自定义输入 —"
     * - 用户可以选择该选项并手动输入任意值
     * - 适用于需要灵活性的场景
     *
     * 当设置为 false 时：
     * - 第一个选项显示为"— 请选择 —"
     * - 用户只能从预设选项中选择
     * - 适用于需要严格数据规范的场景
     *
     * @type {boolean}
     * @private
     */
    #allowInvalid = false;

    /**
     * @private 私有字段 - 是否启用严格验证模式
     *
     * 影响提交时的验证行为：
     * - true: 只接受预设选项中的值
     * - false: 允许任何值通过验证（配合 allowInvalid 使用）
     *
     * @type {boolean}
     * @private
     */
    #strict = false;

    /**
     * 重写：返回 select 元素类型
     *
     * 覆盖基类的默认 input 元素，
     * 使用 HTML <select> 元素提供下拉选择功能。
     *
     * @returns {string} 元素类型："select"
     *
     * @override
     * @see CellEditor.getElementType - 基类实现（返回 "input"）
     */
    getElementType() {
        return "select";
    }

    /**
     * 重写：返回下拉编辑器的专用CSS类名
     *
     * 返回 "cs-cell-editor--select" 用于应用特定的样式，
     * 如下拉箭头样式、选项悬停效果等。
     *
     * @returns {string} CSS类名："cs-cell-editor--select"
     *
     * @override
     * @see CellEditor.getEditorCssClass - 基类实现
     */
    getEditorCssClass() {
        return "cs-cell-editor--select";
    }

    /**
     * 重写：显示编辑器后的初始化（核心方法）
     *
     * 在基类的 show() 方法完成后调用。
     * 负责根据当前单元格的配置初始化下拉选项。
     *
     * 执行流程：
     * 1. **获取单元格类型实例**
     *    - 通过 sheet.getCellTypeInstance(row, col) 获取
     *    - 包含列的元数据和配置信息
     *
     * 2. **读取编辑器配置**
     *    - 调用 cellType.getEditorOptions() 获取配置对象
     *    - 提取 source、allowInvalid、strict 等属性
     *    - 设置默认值（allowInvalid/strict 默认为 false）
     *
     * 3. **构建选项列表**
     *    - 调用 #buildOptions() 生成 <option> 元素
     *    - 第一个选项是占位符（请选择/自定义输入）
     *    - 后续选项来自 source 数组
     *
     * 4. **设置当前选中值**
     *    - 调用 #selectValue() 匹配并选中当前值
     *    - 如果未匹配到则选中第一个占位符选项
     *
     * 5. **调整最大高度**
     *    - 计算编辑器底部到视口底部的距离
     *   - 设置 maxHeight 防止下拉列表超出可视区域
     *
     * 性能考量：
     * - 每次显示都重建选项（支持动态数据源）
     * - 对于静态数据源可考虑缓存优化
     * - 选项数量建议控制在 100 个以内以保证性能
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     *
     * @override
     * @see CellEditor.afterShow - 基类实现（空方法）
     * @see #buildOptions - 构建选项列表
     * @see #selectValue - 设置选中值
     */
    afterShow(row, col) {
        const cellType = this.sheet.getCellTypeInstance(row, col);
        const editorOpts = cellType?.getEditorOptions?.() || {};
        this.#source = editorOpts.source || [];
        this.#allowInvalid = editorOpts.allowInvalid ?? false;
        this.#strict = editorOpts.strict ?? false;

        this.#buildOptions();
        this.#selectValue(this.originalValue);

        if (this.editor) {
            const editorTop = parseInt(this.editor.style.top, 10) || 0;
            const viewH = this.viewport?.viewH ?? Infinity;
            const maxAllowed = Math.max(0, viewH - editorTop);
            this.editor.style.maxHeight = maxAllowed + "px";
        }
    }

    /**
     * 重写：提交前的选项验证
     *
     * 委托给工作表的验证逻辑，确保选中的值符合业务规则。
     * 与 NumericEditor 类似，调用 validateCellValue() 方法。
     *
     * @param {*} newValue - 选中的值
     *
     * @returns {boolean} 验证结果
     *
     * @override
     */
    validateBeforeCommit(newValue) {
        return this.sheet.validateCellValue(this.activeRow, this.activeCol, newValue) !== false;
    }

    /**
     * 重写：绑定下拉编辑器特有事件
     *
     * 绑定两个特殊事件：
     *
     * 1. **change事件**：用户选择选项后触发
     *    - 自动触发 blur() 提交编辑
     *    - 提供即时反馈（选中即确认）
     *
     * 2. **wheel事件**：鼠标滚轮滚动时触发
     *    - 调用 stopPropagation() 阻止事件冒泡
     *    - 防止在操作下拉框时意外滚动表格
     *    - 改善用户体验（避免误操作）
     *
     * @override
     */
    bindEditorEvents() {
        this.trackEvent(this.editor, "change", () => {
            this.editor.blur();
        });
        this.trackEvent(this.editor, "wheel", (e) => {
            e.stopPropagation();
        });
    }

    /**
     * 重写：禁用光标模式设置
     *
     * 下拉框（select元素）的光标由浏览器控制，
     * 不需要手动设置光标位置。
     * 因此重写为空方法，覆盖基类的实现。
     *
     * @param {string} cursorMode - 忽略此参数
     *
     * @override
     */
    setCursorMode() {}

    /**
     * @private 私有方法 - 构建下拉选项列表
     *
     * 根据 #source 数据源动态生成 <option> 元素并添加到 select 中。
     *
     * 生成流程：
     * 1. **清空现有选项**
     *    - 使用 innerHTML = "" 移除所有子元素
     *    - 确保每次都是全新的选项列表
     *
     * 2. **创建占位符选项**（第一个选项）
     *    - value="" (空字符串)
     *    - 文本根据 #allowInvalid 设置：
     *      - true: "— 自定义输入 —"
     *      - false: "— 请选择 —"
     *
     * 3. **遍历数据源创建选项**
     *    对 #source 数组中的每个项：
     *    - **对象格式**：提取 value 和 label 属性
     *      - value 用于提交值
     *      - label 用于显示文本（缺失时回退到value）
     *    - **简单值**：直接作为 value 和 label
     *    - 所有值都通过 String() 转换为字符串
     *
     * 选项结构示例：
     * ```html
     * <select>
     *   <option value="">— 请选择 —</option>           <!-- 占位符 -->
     *   <option value="opt1">选项一</option>             <!-- 对象格式 -->
     *   <option value="opt2">选项二</option>
     *   <option value="simpleOption">simpleOption</option> <!-- 简单格式 -->
     * </select>
     * ```
     *
     * @sideEffect 清空并重建 this.editor 的所有子元素
     */
    #buildOptions() {
        this.editor.innerHTML = "";

        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = this.#allowInvalid ? "— 自定义输入 —" : "— 请选择 —";
        this.editor.appendChild(emptyOption);

        for (const item of this.#source) {
            const option = document.createElement("option");
            if (item !== null && typeof item === "object") {
                option.value = String(item.value ?? "");
                option.textContent = String(item.label ?? item.value ?? "");
            } else {
                option.value = String(item);
                option.textContent = String(item);
            }
            this.editor.appendChild(option);
        }
    }

    /**
     * @private 私有方法 - 设置下拉框的选中值
     *
     * 根据给定的值在下拉选项中查找并选中匹配的项。
     * 如果未找到匹配项，则选中第一个占位符选项。
     *
     * 匹配逻辑：
     * 1. 将输入值转换为字符串（String(value ?? "")）
     * 2. 遍历所有 <option> 元素
     * 3. 使用严格等于 (===) 比较 option.value 和目标值
     * 4. 找到匹配项后设置 selectedIndex 并立即返回
     * 5. 遍历结束未找到：设置 selectedIndex = 0（选中占位符）
     *
     * 为什么用字符串比较？
     * - select 元素的 value 属性始终是字符串
     * - 统一类型避免隐式转换导致的意外行为
     * - 确保匹配的准确性
     *
     * 性能说明：
     * - 时间复杂度：O(n)，n 为选项数量
     * - 对于少量选项（<100）性能足够
     * - 大量选项时可考虑使用 Map 优化
     *
     * @param {*} value - 要选中的值
     *                    会转换为字符串进行比较
     *
     * @sideEffect 修改 this.editor.selectedIndex
     *
     * @example
     * ```js
     * // 假设选项为 ["opt1", "opt2", "opt3"]
     *
     * this.#selectValue("opt2");
     * // selectedIndex = 2 (第二个选项，从0开始)
     *
     * this.#selectValue("unknown");
     * // selectedIndex = 0 (占位符选项)
     *
     * this.#selectValue(null);
     * // selectedIndex = 0 (空值转为""，匹配占位符)
     * ```
     */
    #selectValue(value) {
        const strValue = String(value ?? "");
        for (let i = 0; i < this.editor.options.length; i++) {
            if (this.editor.options[i].value === strValue) {
                this.editor.selectedIndex = i;
                return;
            }
        }
        this.editor.selectedIndex = 0;
    }
}
