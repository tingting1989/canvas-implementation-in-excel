/**
 * 编辑器模块 (Editors Module)
 *
 * 提供多种类型的单元格编辑器实现，
 * 用于在Canvas表格中编辑不同类型的数据。
 *
 * 编辑器类型及适用场景：
 * ┌────────────────┬─────────────────────────────────────────────┐
 * │ 编辑器         │ 适用数据类型                                 │
 * ├────────────────┼─────────────────────────────────────────────┤
 * │ CellEditor     │ 通用单元格编辑（基础类）                     │
 * │ TextEditor     │ 单行文本输入                                │
 * │ TextareaEditor │ 多行文本/长文本输入                         │
 * │ NumericEditor  │ 数值输入（整数、小数）                       │
 * │ DateEditor     │ 日期时间选择                                │
 * │ SelectEditor   │ 下拉选择列表                                │
 * └────────────────┴─────────────────────────────────────────────┘
 *
 * 模块架构：
 * - 所有编辑器继承自 CellEditor 基类
 * - 统一的接口规范便于扩展新类型
 * - 支持自定义验证和格式化逻辑
 *
 * 使用示例：
 * ```js
 * import { TextEditor, NumericEditor, DateEditor } from './editors';
 *
 * // 根据数据类型选择合适的编辑器
 * const editorMap = {
 *   'string': TextEditor,
 *   'number': NumericEditor,
 *   'date': DateEditor,
 *   'select': SelectEditor
 * };
 *
 * const EditorClass = editorMap[dataType];
 * const editor = new EditorClass(options);
 * editor.render(container);
 * ```
 *
 * @module editors
 * @see CellEditor - 基础编辑器类
 */

/** 通用单元格编辑器 */
export { CellEditor } from "./CellEditor.js";

/** 单行文本编辑器 */
export { TextEditor } from "./TextEditor.js";

/** 数值编辑器 */
export { NumericEditor } from "./NumericEditor.js";

/** 日期时间编辑器 */
export { DateEditor } from "./DateEditor.js";

/** 下拉选择编辑器 */
export { SelectEditor } from "./SelectEditor.js";

/** 多行文本编辑器 */
export { TextareaEditor } from "./TextareaEditor.js";
