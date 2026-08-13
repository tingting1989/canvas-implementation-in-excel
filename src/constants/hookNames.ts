/**
 * 生命周期钩子名称常量定义
 *
 * 提供完整的生命周期钩子系统，允许开发者在关键节点注入自定义逻辑。
 * 所有钩子名称在此统一定义，避免拼写错误，并支持 IDE 自动补全。
 *
 * 钩子类型说明：
 * - **before* 钩子**: 操作执行前触发，返回 false 可阻止操作继续
 * - **after* 钩子**: 操作完成后触发，不可阻止，仅用于通知和副作用
 * - **on* 钩子**: 事件驱动型回调，用户交互时触发
 *
 * @module constants/hookNames
 */

export interface Hooks {
    // ── 编辑相关钩子 ──
    readonly BEFORE_BEGIN_EDITING: "beforeBeginEditing";
    readonly AFTER_BEGIN_EDITING: "afterBeginEditing";
    readonly BEFORE_FINISH_EDITING: "beforeFinishEditing";
    readonly AFTER_FINISH_EDITING: "afterFinishEditing";
    readonly BEFORE_CHANGE: "beforeChange";
    readonly AFTER_CHANGE: "afterChange";
    readonly BEFORE_SET_VALUE_AT: "beforeSetValueAt";
    readonly AFTER_SET_VALUE_AT: "afterSetValueAt";

    // ── 选择相关钩子 ──
    readonly BEFORE_SELECTION: "beforeSelection";
    readonly AFTER_SELECTION: "afterSelection";
    readonly BEFORE_SELECTION_END: "beforeSelectionEnd";
    readonly AFTER_SELECTION_END: "afterSelectionEnd";

    // ── 单元格交互钩子 ──
    readonly ON_CELL_MOUSE_DOWN: "onCellMouseDown";
    readonly ON_CELL_MOUSE_OVER: "onCellMouseOver";
    readonly ON_CELL_MOUSE_OUT: "onCellMouseOut";
    readonly ON_CELL_CLICK: "onCellClick";
    readonly ON_CELL_DBL_CLICK: "onCellDblClick";

    // ── 键盘相关钩子 ──
    readonly BEFORE_KEY_DOWN: "beforeKeyDown";
    readonly AFTER_KEY_DOWN: "afterKeyDown";

    // ── 滚动相关钩子 ──
    readonly AFTER_SCROLL_HORIZONTALLY: "afterScrollHorizontally";
    readonly AFTER_SCROLL_VERTICALLY: "afterScrollVertically";

    // ── 合并单元格相关钩子 ──
    readonly BEFORE_MERGE_CELLS: "beforeMergeCells";
    readonly AFTER_MERGE_CELLS: "afterMergeCells";
    readonly BEFORE_UNMERGE_CELLS: "beforeUnmergeCells";
    readonly AFTER_UNMERGE_CELLS: "afterUnmergeCells";

    // ── 剪贴板相关钩子 ──
    readonly BEFORE_COPY: "beforeCopy";
    readonly AFTER_COPY: "afterCopy";
    readonly BEFORE_CUT: "beforeCut";
    readonly AFTER_CUT: "afterCut";
    readonly BEFORE_PASTE: "beforePaste";
    readonly AFTER_PASTE: "afterPaste";

    // ── 列移动相关钩子 ──
    readonly BEFORE_COLUMN_MOVE: "beforeColumnMove";
    readonly AFTER_COLUMN_MOVE: "afterColumnMove";

    // ── 行移动相关钩子 ──
    readonly BEFORE_ROW_MOVE: "beforeRowMove";
    readonly AFTER_ROW_MOVE: "afterRowMove";

    // ── 隐藏列相关钩子 ──
    readonly AFTER_HIDE_COLUMN: "afterHideColumn";
    readonly AFTER_SHOW_COLUMN: "afterShowColumn";

    // ── 隐藏行相关钩子 ──
    readonly AFTER_HIDE_ROW: "afterHideRow";
    readonly AFTER_SHOW_ROW: "afterShowRow";

    // ── 冻结行列相关钩子 ──
    readonly AFTER_FREEZE: "afterFreeze";
    readonly AFTER_UNFREEZE: "afterUnfreeze";

    // ── 工作表管理相关钩子 ──
    readonly BEFORE_SHEET_ADD: "beforeSheetAdd";
    readonly AFTER_SHEET_ADD: "afterSheetAdd";
    readonly BEFORE_SHEET_REMOVE: "beforeSheetRemove";
    readonly AFTER_SHEET_REMOVE: "afterSheetRemove";
    readonly BEFORE_SHEET_RENAME: "beforeSheetRename";
    readonly AFTER_SHEET_RENAME: "afterSheetRename";
    readonly BEFORE_SHEET_SWITCH: "beforeSheetSwitch";
    readonly AFTER_SHEET_SWITCH: "afterSheetSwitch";

    // ── 排序相关钩子 ──
    readonly AFTER_SORT: "afterSort";
    readonly AFTER_SORT_RESTORE: "afterSortRestore";

    // ── 生命周期钩子 ──
    readonly INIT: "init";
    readonly DESTROY: "destroy";

    // ── 图表相关钩子 ──
    readonly AFTER_CHART_ADD: "afterChartAdd";
    readonly AFTER_CHART_REMOVE: "afterChartRemove";
    readonly AFTER_CHART_UPDATE: "afterChartUpdate";

    // ── 自动超链接相关钩子 ──
    readonly ON_URL_DETECTED: "onUrlDetected";
    readonly BEFORE_OPEN_URL: "beforeOpenUrl";
    readonly AFTER_OPEN_URL: "afterOpenUrl";

    // ── 导入文件相关钩子 ──
    readonly IMPORT_PROGRESS: "onImportProgress";
    readonly IMPORT_COMPLETE: "onImportComplete";
    readonly IMPORT_ERROR: "onImportError";
    readonly IMPORT_BEFORE_IMPORT: "beforeImport";
    readonly IMPORT_ROW_PROCESSED: "onRowProcessed";
    readonly IMPORT_STYLE_WARNING: "onStyleWarning";

    // ── 导出文件相关钩子 ──
    readonly EXPORT_COMPLETE: "onExportComplete";
    readonly EXPORT_ERROR: "onExportError";

    // ── 数据清空相关钩子 ──
    readonly BEFORE_CLEAR_DATA: "beforeClearData";
    readonly AFTER_CLEAR_DATA: "afterClearData";

    // ── 数据验证相关钩子 ──
    readonly BEFORE_VALIDATE: "beforeValidate";
    readonly AFTER_VALIDATE: "afterValidate";
    readonly VALIDATION_FAILED: "validationFailed";
    readonly BEFORE_VALIDATION_RULE_CHANGE: "beforeValidationRuleChange";
    readonly AFTER_VALIDATION_RULE_CHANGE: "afterValidationRuleChange";
    readonly AFTER_BATCH_VALIDATION: "afterBatchValidation";

    // ── 搜索相关钩子 ──
    readonly BEFORE_SEARCH: "beforeSearch";
    readonly AFTER_SEARCH: "afterSearch";
    readonly BEFORE_SEARCH_NAVIGATE: "beforeSearchNavigate";
    readonly AFTER_SEARCH_NAVIGATE: "afterSearchNavigate";
    readonly BEFORE_SEARCH_REPLACE: "beforeSearchReplace";
    readonly AFTER_SEARCH_REPLACE: "afterSearchReplace";
    readonly BEFORE_SEARCH_REPLACE_ALL: "beforeSearchReplaceAll";
    readonly AFTER_SEARCH_REPLACE_ALL: "afterSearchReplaceAll";
}

export const HOOKS: Hooks = Object.freeze({
    BEFORE_BEGIN_EDITING: "beforeBeginEditing",
    AFTER_BEGIN_EDITING: "afterBeginEditing",
    BEFORE_FINISH_EDITING: "beforeFinishEditing",
    AFTER_FINISH_EDITING: "afterFinishEditing",
    BEFORE_CHANGE: "beforeChange",
    AFTER_CHANGE: "afterChange",
    BEFORE_SET_VALUE_AT: "beforeSetValueAt",
    AFTER_SET_VALUE_AT: "afterSetValueAt",

    BEFORE_SELECTION: "beforeSelection",
    AFTER_SELECTION: "afterSelection",
    BEFORE_SELECTION_END: "beforeSelectionEnd",
    AFTER_SELECTION_END: "afterSelectionEnd",

    ON_CELL_MOUSE_DOWN: "onCellMouseDown",
    ON_CELL_MOUSE_OVER: "onCellMouseOver",
    ON_CELL_MOUSE_OUT: "onCellMouseOut",
    ON_CELL_CLICK: "onCellClick",
    ON_CELL_DBL_CLICK: "onCellDblClick",

    BEFORE_KEY_DOWN: "beforeKeyDown",
    AFTER_KEY_DOWN: "afterKeyDown",

    AFTER_SCROLL_HORIZONTALLY: "afterScrollHorizontally",
    AFTER_SCROLL_VERTICALLY: "afterScrollVertically",

    BEFORE_MERGE_CELLS: "beforeMergeCells",
    AFTER_MERGE_CELLS: "afterMergeCells",
    BEFORE_UNMERGE_CELLS: "beforeUnmergeCells",
    AFTER_UNMERGE_CELLS: "afterUnmergeCells",

    BEFORE_COPY: "beforeCopy",
    AFTER_COPY: "afterCopy",
    BEFORE_CUT: "beforeCut",
    AFTER_CUT: "afterCut",
    BEFORE_PASTE: "beforePaste",
    AFTER_PASTE: "afterPaste",

    BEFORE_COLUMN_MOVE: "beforeColumnMove",
    AFTER_COLUMN_MOVE: "afterColumnMove",

    BEFORE_ROW_MOVE: "beforeRowMove",
    AFTER_ROW_MOVE: "afterRowMove",

    AFTER_HIDE_COLUMN: "afterHideColumn",
    AFTER_SHOW_COLUMN: "afterShowColumn",

    AFTER_HIDE_ROW: "afterHideRow",
    AFTER_SHOW_ROW: "afterShowRow",

    AFTER_FREEZE: "afterFreeze",
    AFTER_UNFREEZE: "afterUnfreeze",

    BEFORE_SHEET_ADD: "beforeSheetAdd",
    AFTER_SHEET_ADD: "afterSheetAdd",
    BEFORE_SHEET_REMOVE: "beforeSheetRemove",
    AFTER_SHEET_REMOVE: "afterSheetRemove",
    BEFORE_SHEET_RENAME: "beforeSheetRename",
    AFTER_SHEET_RENAME: "afterSheetRename",
    BEFORE_SHEET_SWITCH: "beforeSheetSwitch",
    AFTER_SHEET_SWITCH: "afterSheetSwitch",

    AFTER_SORT: "afterSort",
    AFTER_SORT_RESTORE: "afterSortRestore",

    INIT: "init",
    DESTROY: "destroy",

    AFTER_CHART_ADD: "afterChartAdd",
    AFTER_CHART_REMOVE: "afterChartRemove",
    AFTER_CHART_UPDATE: "afterChartUpdate",

    ON_URL_DETECTED: "onUrlDetected",
    BEFORE_OPEN_URL: "beforeOpenUrl",
    AFTER_OPEN_URL: "afterOpenUrl",

    IMPORT_PROGRESS: "onImportProgress",
    IMPORT_COMPLETE: "onImportComplete",
    IMPORT_ERROR: "onImportError",
    IMPORT_BEFORE_IMPORT: "beforeImport",
    IMPORT_ROW_PROCESSED: "onRowProcessed",
    IMPORT_STYLE_WARNING: "onStyleWarning",

    EXPORT_COMPLETE: "onExportComplete",
    EXPORT_ERROR: "onExportError",

    BEFORE_CLEAR_DATA: "beforeClearData",
    AFTER_CLEAR_DATA: "afterClearData",

    BEFORE_VALIDATE: "beforeValidate",
    AFTER_VALIDATE: "afterValidate",
    VALIDATION_FAILED: "validationFailed",
    BEFORE_VALIDATION_RULE_CHANGE: "beforeValidationRuleChange",
    AFTER_VALIDATION_RULE_CHANGE: "afterValidationRuleChange",
    AFTER_BATCH_VALIDATION: "afterBatchValidation",

    BEFORE_SEARCH: "beforeSearch",
    AFTER_SEARCH: "afterSearch",
    BEFORE_SEARCH_NAVIGATE: "beforeSearchNavigate",
    AFTER_SEARCH_NAVIGATE: "afterSearchNavigate",
    BEFORE_SEARCH_REPLACE: "beforeSearchReplace",
    AFTER_SEARCH_REPLACE: "afterSearchReplace",
    BEFORE_SEARCH_REPLACE_ALL: "beforeSearchReplaceAll",
    AFTER_SEARCH_REPLACE_ALL: "afterSearchReplaceAll",
});