/**
 * 钩子名称常量
 * 所有钩子名称统一定义，防止拼写错误，支持 IDE 自动补全
 *
 * 使用方式：
 * ```js
 * import { HOOKS } from './hookNames.js';
 * wb.addHook(HOOKS.ON_CELL_CLICK, (row, col) => { ... });
 * ```
 *
 * 命名规范：
 * - before*  → 操作前触发，可返回 false 阻止操作
 * - after*   → 操作后触发
 * - on*      → 事件触发时回调
 */
export const HOOKS = Object.freeze({
    /** 编辑相关 */
    BEFORE_BEGIN_EDITING: "beforeBeginEditing",
    AFTER_BEGIN_EDITING: "afterBeginEditing",
    BEFORE_FINISH_EDITING: "beforeFinishEditing",
    AFTER_FINISH_EDITING: "afterFinishEditing",
    BEFORE_CHANGE: "beforeChange",
    AFTER_CHANGE: "afterChange",

    /** 选区相关 */
    BEFORE_SELECTION: "beforeSelection",
    AFTER_SELECTION: "afterSelection",
    BEFORE_SELECTION_END: "beforeSelectionEnd",
    AFTER_SELECTION_END: "afterSelectionEnd",

    /** 单元格交互相关 */
    ON_CELL_MOUSE_DOWN: "onCellMouseDown",
    ON_CELL_MOUSE_OVER: "onCellMouseOver",
    ON_CELL_MOUSE_OUT: "onCellMouseOut",
    ON_CELL_CLICK: "onCellClick",
    ON_CELL_DBL_CLICK: "onCellDblClick",

    /** 键盘相关 */
    BEFORE_KEY_DOWN: "beforeKeyDown",
    AFTER_KEY_DOWN: "afterKeyDown",

    /** 滚动相关 */
    AFTER_SCROLL_HORIZONTALLY: "afterScrollHorizontally",
    AFTER_SCROLL_VERTICALLY: "afterScrollVertically",

    /** 合并单元格相关 */
    BEFORE_MERGE_CELLS: "beforeMergeCells",
    AFTER_MERGE_CELLS: "afterMergeCells",
    BEFORE_UNMERGE_CELLS: "beforeUnmergeCells",
    AFTER_UNMERGE_CELLS: "afterUnmergeCells",

    /** 剪贴板相关 */
    BEFORE_COPY: "beforeCopy",
    AFTER_COPY: "afterCopy",
    BEFORE_CUT: "beforeCut",
    AFTER_CUT: "afterCut",
    BEFORE_PASTE: "beforePaste",
    AFTER_PASTE: "afterPaste",

    /** 列移动相关 */
    BEFORE_COLUMN_MOVE: "beforeColumnMove",
    AFTER_COLUMN_MOVE: "afterColumnMove",

    /** 分页相关 */
    AFTER_PAGE_CHANGE: "afterPageChange",
    AFTER_PAGE_SIZE_CHANGE: "afterPageSizeChange",

    /** 生命周期相关 */
    INIT: "init",
    DESTROY: "destroy",
});