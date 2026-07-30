/**
 * 日期时间编辑器 (Date Editor)
 *
 * 专用于编辑日期和时间类型单元格的编辑器实现。
 * 继承自 {@link CellEditor} 基类，提供日期选择和格式化功能。
 *
 * 核心特性：
 * - **多格式支持**：处理字符串、Date对象等多种输入格式
 * - **智能显示**：自动将Date对象转换为可读的日期字符串
 * - **原生选择器**：可选使用浏览器原生日期选择器（type="date"）
 * - **特殊验证**：支持"invalid"状态（允许用户先输入再修正）
 *
 * 支持的日期格式：
 * ┌──────────────────┬─────────────────┬─────────────────────┐
 * │ 输入类型         │ 示例            │ 处理方式            │
 * ├──────────────────┼─────────────────┼─────────────────────┤
 * │ 字符串(ISO)      │ "2024-01-15"   │ 直接使用           │
 * │ 字符串(其他)      │ "2024/1/5"     │ 直接使用           │
 * │ Date对象          │ new Date()     │ 转为 YYYY-MM-DD     │
 * │ 空值              │ null/""/undefined│ 显示为空          │
 * └──────────────────┴─────────────────┴─────────────────────┘
 *
 * 输出格式：
 * - 编辑时显示：YYYY-MM-DD（如 "2024-01-15"）
 * - 存储格式：取决于工作表的单元格配置
 *
 * 适用场景：
 * - 出生日期、入职日期等日期字段
 * - 计划时间、截止日期等时间管理
 * - 日程安排、预约系统
 * - 需要标准化日期格式的场景
 *
 * 与父类的区别：
 * ┌────────────────────┬───────────────────┬───────────────────┐
 * │ 特性               │ CellEditor        │ DateEditor        │
 * ├────────────────────┼───────────────────┼───────────────────┤
 * │ DOM 类型           │ input             │ input[type=text]  │
 * │ CSS 类名           │ ""                │ --date            │
 * │ 值格式化           │ String()          │ ✅ 智能日期转换   │
 * │ 光标模式控制       │ 始终生效          │ 可禁用（原生）    │
 * │ 验证逻辑           │ 通过/失败         │ ✅ 支持"invalid"  │
 * │ 值比较             │ ===               │ ✅ Date对象支持   │
 * └────────────────────┴───────────────────┴───────────────────┘
 *
 * @class DateEditor
 * @extends CellEditor
 *
 * @example
 * ```js
 * // 创建日期编辑器
 * const editor = new DateEditor(renderEngine, sheet);
 * editor.createEditor();
 * editor.show(2, 3);  // 编辑 D3 单元格
 *
 * // 如果单元格存储的是 Date 对象
 * // 编辑器会自动显示为 "2024-01-15"
 *
 * // 用户修改后获取值
 * const dateStr = editor.getValue(); // "2024-12-25"
 * ```
 */
import { CellEditor } from "./CellEditor.js";

export class DateEditor extends CellEditor {
    /**
     * @private 私有字段 - 是否使用原生日期选择器
     *
     * 当设置为 true 时：
     * - 浏览器会显示原生的日历选择界面
     * - 不执行光标定位操作（因为由浏览器控制）
     * - 用户体验更一致但定制性较低
     *
     * 当设置为 false 时：
     * - 使用普通文本输入框
     * - 用户手动输入日期字符串
     * - 可以完全自定义样式和行为
     *
     * 默认值：true（推荐大多数场景使用）
     *
     * @type {boolean}
     * @private
     */
    #useNativePicker = true;

    /**
     * 重写：返回日期编辑器的专用CSS类名
     *
     * 返回 "cs-cell-editor--date" 用于应用日期编辑器的特定样式，
     * 如日历图标、日期格式提示等视觉元素。
     *
     * @returns {string} CSS类名："cs-cell-editor--date"
     *
     * @override
     * @see CellEditor.getEditorCssClass - 基类实现
     */
    getEditorCssClass() {
        return "cs-cell-editor--date";
    }

    /**
     * 重写：创建编辑器后的初始化
     *
     * 在基类的 createEditor() 流程完成后调用。
     * 将 input 元素的 type 设置为 "text"。
     *
     * 为什么用 text 而不是 date？
     * - type="date" 的值格式必须是 YYYY-MM-DD
     * - 不同浏览器的日历UI不一致
     * - 无法方便地支持空值或部分输入
     * - 使用 text 可以更灵活地处理各种日期格式
     *
     * 如果未来想启用原生选择器，可以改为：
     * ```js
     * afterCreateEditor() {
     *     if (this.#useNativePicker) {
     *         this.editor.type = "date";
     *     } else {
     *         this.editor.type = "text";
     *     }
     * }
     * ```
     *
     * @override
     * @see CellEditor.afterCreateEditor - 基类实现（空方法）
     */
    afterCreateEditor() {
        this.editor.type = "text";
    }

    /**
     * 重写：将单元格值格式化为可编辑的日期字符串
     *
     * 根据输入值的类型采用不同的格式化策略：
     *
     * 1. **非空字符串**：直接返回原值
     *    - 假设已经是有效的日期字符串格式
     *    - 保持用户原有的输入格式
     *
     * 2. **Date对象**：转换为 ISO 格式 (YYYY-MM-DD)
     *    - 使用 #toDateString() 私有方法处理
     *    - 统一输出格式便于用户识别和编辑
     *
     * 3. **其他类型**（null、undefined、数字等）：
     *    - 转换为字符串
     *    - null/undefined → ""（空字符串）
     *
     * 设计考量：
     * - 优先保留用户的原始输入（字符串直接返回）
     * - 对程序设置的Date对象进行标准化显示
     * - 兼容各种数据源（API返回、数据库导入等）
     *
     * @param {*} rawValue - 单元格的原始值
     *                     可能的类型：
     *                     - string: 日期字符串
     *                     - Date: JavaScript Date对象
     *                     - 其他: 会转为字符串
     *
     * @returns {string} 格式化后的日期字符串
     *                  - 有效日期："2024-01-15"、"2024/1/5" 等
     *                  - 空值：""
     *
     * @override
     * @see CellEditor.formatValueForEditor - 基类实现（简单String转换）
     * @see #toDateString - Date对象的格式化方法
     */
    formatValueForEditor(rawValue) {
        // 直接返回原始字符串值
        if (typeof rawValue === "string" && rawValue) {
            return rawValue;
        }
        // 如果是 Date 对象，转换为 YYYY-MM-DD 格式
        if (rawValue instanceof Date) {
            return this.#toDateString(rawValue);
        }
        // 其他类型转为字符串
        return String(rawValue ?? "");
    }

    /**
     * 重写：设置光标模式（条件性执行）
     *
     * 仅在非原生选择器模式下才执行光标定位。
     * 当使用原生日期选择器时，跳过此方法。
     *
     * 为什么需要这个判断？
     * - 原生 date 输入的光标由浏览器控制
     * - 强制设置光标可能干扰原生行为
     * - 某些浏览器可能会报错或表现异常
     *
     * @param {string} cursorMode - 光标模式："select" 或 "end"
     *
     * @override
     * @see CellEditor.setCursorMode - 基类实现（始终执行）
     */
    setCursorMode(cursorMode) {
        if (this.#useNativePicker) return;
        super.setCursorMode(cursorMode);
    }

    /**
     * 重写：提交前的日期验证
     *
     * 与 NumericEditor 的验证逻辑略有不同：
     * - 除了接受 `true`（验证通过），还接受 `"invalid"` 状态
     * - 这允许用户暂时输入无效日期（如 "2024-02-30"），
     *   以便后续修正，而不是立即拒绝并恢复原值
     *
     * 验证结果含义：
     * - `true`: 日期有效且符合要求
     * - `"invalid"`: 日期格式有效但值不合法（如2月30日）
     *   → 允许提交，由后续处理层决定如何处理
     * - `false`: 完全无效的输入（如 "abc"、错误格式）
     *   → 拒绝提交，恢复原值
     * - `undefined`/其他: 未定义验证规则，默认通过
     *
     * 这种设计的优势：
     * - 更宽容的用户体验（不会频繁打断输入）
     * - 支持渐进式输入（可以先输年再输月）
     * - 与某些业务场景兼容（如允许临时保存）
     *
     * @param {*} newValue - 用户输入的新日期值
     *
     * @returns {boolean} 是否允许提交
     *          - true: 验证通过或状态为"invalid"
     *          - false: 验证失败，拒绝提交
     *
     * @override
     * @see CellEditor.validateBeforeCommit - 基类实现
     * @see NumericEditor.validateBeforeCommit - 对比数值编辑器的严格验证
     */
    validateBeforeCommit(newValue) {
        const result = this.sheet.validateCellValue(this.activeRow, this.activeCol, newValue);
        return result === true || result === "invalid";
    }

    /**
     * 重写：比较两个日期值是否相等
     *
     * 扩展了基类的严格等于（===）比较，
     * 支持Date对象的语义化比较（比较时间戳）。
     *
     * 比较逻辑：
     * 1. 如果 oldValue 和 newValue 都是 Date 对象：
     *    - 分别调用 .getTime() 获取时间戳
     *    - 比较时间戳是否相等
     * 2. 如果一个是Date另一个不是：
     *    - Date对象转为时间戳，另一个保持原样
     *    - 进行松散比较（通常不相等）
     * 3. 如果都不是Date对象：
     *    - 使用标准的 === 比较
     *
     * 特殊情况 - NaN处理：
     * - NaN !== NaN （JavaScript特性）
     * - 如果**两个值都是NaN**（如两个无效Date）：
     *   → 认为它们相等（都是"无效"状态）
     * - 如果只有一个NaN：
     *   → 认为不等（一个无效一个有效）
     *
     * 为什么需要这种特殊处理？
     * - 避免无效日期导致的无限循环或不必要的更新
     * - 提供更合理的"脏检查"（dirty checking）行为
     *
     * @param {*} oldValue - 旧值（可能是Date对象或字符串）
     * @param {*} newValue - 新值（可能是Date对象或字符串）
     *
     * @returns {boolean} 是否相等
     *          - true: 值相同或都是无效状态
     *          - false: 值不同
     *
     * @override
     * @see CellEditor.areValuesEqual - 基类实现（使用===）
     */
    areValuesEqual(oldValue, newValue) {
        const oldMs = oldValue instanceof Date ? oldValue.getTime() : oldValue;
        const newMs = newValue instanceof Date ? newValue.getTime() : newValue;
        if (oldMs !== oldMs && newMs !== newMs) return true;
        return oldMs === newMs;
    }

    /**
     * @private 私有方法 - 将Date对象格式化为日期字符串
     *
     * 将JavaScript Date对象转换为标准化的日期字符串格式。
     * 输出格式遵循ISO 8601标准的日期部分：YYYY-MM-DD。
     *
     * 格式化规则：
     * - 年份：4位数（如 2024）
     * - 月份：2位数，不足补0（如 01, 12）
     * - 日期：2位数，不足补0（如 05, 31）
     * - 分隔符：连字符 "-"
     *
     * 安全检查：
     * - 验证输入是否为有效的Date实例
     * - 检查日期是否有效（排除 Invalid Date）
     * - 无效输入返回空字符串而非抛出异常
     *
     * @param {Date} date - 要格式化的Date对象
     *
     * @returns {string} 格式化后的日期字符串
     *          - 有效日期："2024-01-15"、"1999-12-31"
     *          - 无效日期：""
     *
     * @example
     * ```js
     * this.#toDateString(new Date(2024, 0, 15))
     * // "2024-01-15"
     *
     * this.#toDateString(new Date("invalid"))
     * // ""
     *
     * this.#toDateString(new Date(2024, 11, 25))
     * // "2024-12-25"
     * ```
     */
    #toDateString(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) return "";
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
}
