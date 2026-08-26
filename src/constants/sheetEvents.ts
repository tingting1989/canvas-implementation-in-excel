/**
 * 工作表内部事件常量定义
 *
 * 定义 Sheet 和 Workbook 组件间的通信事件体系。
 * 采用命名空间格式 "module:event-name" 避免命名冲突。
 *
 * @module constants/sheetEvents
 */

export interface SheetEvents {
    // ── 渲染控制事件 ──
    readonly INVALIDATE_ALL: "sheet:invalidate-all";
    readonly INVALIDATE_CELL: "sheet:invalidate-cell";
    readonly RENDER_REQUEST: "sheet:render-request";

    // ── 数据变更事件 ──
    readonly CELL_VALUE_SET: "sheet:cell-value-set";
    readonly FORMULA_SET: "sheet:formula-set";
    readonly FORMULA_REMOVE: "sheet:formula-remove";
    readonly CELL_CHANGED: "sheet:cell-changed";
    readonly BEFORE_CHANGE: "sheet:before-change";
    readonly AFTER_CHANGE: "sheet:after-change";

    // ── 操作历史事件 ──
    readonly UNDO: "sheet:undo";
    readonly REDO: "sheet:redo";

    // ── 系统功能事件 ──
    readonly DATA_LOADED: "sheet:data-loaded";

    // ── 数据清空事件 ──
    readonly DATA_CLEARED: "sheet:data-cleared";
    readonly ROW_COL_RESIZE: "sheet:row-col-resize";
    readonly GET_CLIPBOARD: "sheet:get-clipboard";
    readonly GET_PLUGIN: "sheet:get-plugin";

    // ── 列/行移动事件 ──
    readonly COLUMN_MOVED: "sheet:column-moved";
    readonly ROW_MOVED: "sheet:row-moved";

    // ── 列/行插入删除事件 ──
    readonly COLUMN_INSERTED: "sheet:column-inserted";
    readonly COLUMN_DELETED: "sheet:column-deleted";
    readonly ROW_INSERTED: "sheet:row-inserted";
    readonly ROW_DELETED: "sheet:row-deleted";

    // ── 列配置变更事件 ──
    readonly COLUMN_CONFIG_CHANGED: "sheet:column-config-changed";

    // ── 编辑器生命周期事件 ──
    readonly EDITOR_BEFORE_BEGIN: "editor:before-begin";
    readonly EDITOR_AFTER_BEGIN: "editor:after-begin";
    readonly EDITOR_BEFORE_FINISH: "editor:before-finish";
    readonly EDITOR_AFTER_FINISH: "editor:after-finish";

    // ── 鼠标交互事件 ──
    readonly CELL_MOUSE_OVER: "cell:mouse-over";
    readonly CELL_MOUSE_OUT: "cell:mouse-out";

    // ── Workbook 级别事件 ──
    readonly WORKBOOK_INIT: "workbook:init";
    readonly WORKBOOK_DESTROY: "workbook:destroy";
    readonly CHART_ADDED: "chart:added";
    readonly CHART_REMOVED: "chart:removed";
    readonly CHART_UPDATED: "chart:updated";
    readonly SHEET_SWITCHED: "workbook:sheet-switched";
}

export const SHEET_EVENTS: SheetEvents = Object.freeze({
    INVALIDATE_ALL: "sheet:invalidate-all",
    INVALIDATE_CELL: "sheet:invalidate-cell",
    RENDER_REQUEST: "sheet:render-request",

    CELL_VALUE_SET: "sheet:cell-value-set",
    FORMULA_SET: "sheet:formula-set",
    FORMULA_REMOVE: "sheet:formula-remove",
    CELL_CHANGED: "sheet:cell-changed",
    BEFORE_CHANGE: "sheet:before-change",
    AFTER_CHANGE: "sheet:after-change",

    UNDO: "sheet:undo",
    REDO: "sheet:redo",

    DATA_LOADED: "sheet:data-loaded",

    DATA_CLEARED: "sheet:data-cleared",
    ROW_COL_RESIZE: "sheet:row-col-resize",
    GET_CLIPBOARD: "sheet:get-clipboard",
    GET_PLUGIN: "sheet:get-plugin",

    COLUMN_MOVED: "sheet:column-moved",
    ROW_MOVED: "sheet:row-moved",

    COLUMN_INSERTED: "sheet:column-inserted",
    COLUMN_DELETED: "sheet:column-deleted",
    ROW_INSERTED: "sheet:row-inserted",
    ROW_DELETED: "sheet:row-deleted",

    COLUMN_CONFIG_CHANGED: "sheet:column-config-changed",

    EDITOR_BEFORE_BEGIN: "editor:before-begin",
    EDITOR_AFTER_BEGIN: "editor:after-begin",
    EDITOR_BEFORE_FINISH: "editor:before-finish",
    EDITOR_AFTER_FINISH: "editor:after-finish",

    CELL_MOUSE_OVER: "cell:mouse-over",
    CELL_MOUSE_OUT: "cell:mouse-out",

    WORKBOOK_INIT: "workbook:init",
    WORKBOOK_DESTROY: "workbook:destroy",
    CHART_ADDED: "chart:added",
    CHART_REMOVED: "chart:removed",
    CHART_UPDATED: "chart:updated",
    SHEET_SWITCHED: "workbook:sheet-switched",
});

/**
 * 事件流向注册表
 *
 * 声明每个事件的合法发射方(emitters)与监听方(listeners)。
 */
export interface EventFlowEntry {
    emitters: readonly string[];
    listeners: readonly string[];
}

export type EventFlowRegistry = Readonly<Record<string, EventFlowEntry>>;

export const EVENT_FLOW_REGISTRY: EventFlowRegistry = Object.freeze({
    [SHEET_EVENTS.INVALIDATE_ALL]: { emitters: ["Sheet"], listeners: ["Workbook"] },
    [SHEET_EVENTS.INVALIDATE_CELL]: { emitters: ["Sheet"], listeners: ["Workbook"] },
    [SHEET_EVENTS.RENDER_REQUEST]: { emitters: ["Sheet"], listeners: ["Workbook"] },
    [SHEET_EVENTS.CELL_VALUE_SET]: { emitters: [], listeners: [] },
    [SHEET_EVENTS.FORMULA_SET]: { emitters: ["Sheet"], listeners: ["Workbook"] },
    [SHEET_EVENTS.FORMULA_REMOVE]: { emitters: ["Sheet"], listeners: ["Workbook"] },
    [SHEET_EVENTS.CELL_CHANGED]: { emitters: ["Sheet"], listeners: ["Workbook"] },
    [SHEET_EVENTS.BEFORE_CHANGE]: { emitters: ["CellEditor"], listeners: ["Workbook"] },
    [SHEET_EVENTS.AFTER_CHANGE]: { emitters: ["Sheet", "CellEditor"], listeners: ["Workbook"] },
    [SHEET_EVENTS.UNDO]: { emitters: ["Sheet"], listeners: ["Workbook"] },
    [SHEET_EVENTS.REDO]: { emitters: ["Sheet"], listeners: ["Workbook"] },
    [SHEET_EVENTS.DATA_LOADED]: { emitters: [], listeners: [] },
    [SHEET_EVENTS.DATA_CLEARED]: { emitters: ["Sheet"], listeners: ["Workbook"] },
    [SHEET_EVENTS.ROW_COL_RESIZE]: { emitters: ["Sheet"], listeners: ["Workbook"] },
    [SHEET_EVENTS.GET_CLIPBOARD]: { emitters: ["TileRenderer", "ContextMenuStrategy"], listeners: ["Workbook"] },
    [SHEET_EVENTS.GET_PLUGIN]: { emitters: ["ContextMenuStrategy"], listeners: ["Workbook"] },
    [SHEET_EVENTS.SHEET_SWITCHED]: { emitters: ["Workbook"], listeners: ["SortPlugin", "FreezePlugin", "ChartPlugin"] },
    [SHEET_EVENTS.COLUMN_MOVED]: { emitters: ["Sheet"], listeners: ["FilterPlugin", "SortPlugin", "DataValidationPlugin"] },
    [SHEET_EVENTS.ROW_MOVED]: { emitters: ["Sheet"], listeners: ["DataValidationPlugin"] },
    [SHEET_EVENTS.COLUMN_INSERTED]: { emitters: ["Sheet"], listeners: ["DataValidationPlugin"] },
    [SHEET_EVENTS.COLUMN_DELETED]: { emitters: ["Sheet"], listeners: ["DataValidationPlugin"] },
    [SHEET_EVENTS.ROW_INSERTED]: { emitters: ["Sheet"], listeners: ["DataValidationPlugin"] },
    [SHEET_EVENTS.ROW_DELETED]: { emitters: ["Sheet"], listeners: ["DataValidationPlugin"] },
    [SHEET_EVENTS.COLUMN_CONFIG_CHANGED]: { emitters: ["ColumnTypeManager", "Sheet"], listeners: ["DataValidationPlugin"] },
    [SHEET_EVENTS.EDITOR_BEFORE_BEGIN]: { emitters: ["CellEditor"], listeners: ["EventHandler"] },
    [SHEET_EVENTS.EDITOR_AFTER_BEGIN]: { emitters: ["CellEditor"], listeners: ["EventHandler"] },
    [SHEET_EVENTS.EDITOR_BEFORE_FINISH]: { emitters: ["CellEditor"], listeners: ["EventHandler"] },
    [SHEET_EVENTS.EDITOR_AFTER_FINISH]: { emitters: ["CellEditor"], listeners: ["EventHandler"] },
    [SHEET_EVENTS.CELL_MOUSE_OVER]: { emitters: ["MouseStrategy"], listeners: ["EventHandler"] },
    [SHEET_EVENTS.CELL_MOUSE_OUT]: { emitters: ["MouseStrategy"], listeners: ["EventHandler"] },
    [SHEET_EVENTS.WORKBOOK_INIT]: { emitters: ["Workbook"], listeners: ["EventHandler"] },
    [SHEET_EVENTS.WORKBOOK_DESTROY]: { emitters: ["Workbook"], listeners: ["EventHandler"] },
    [SHEET_EVENTS.CHART_ADDED]: { emitters: ["ChartManager"], listeners: ["ChartPlugin", "ChartLayer"] },
    [SHEET_EVENTS.CHART_REMOVED]: { emitters: ["ChartManager"], listeners: ["ChartPlugin", "ChartLayer"] },
    [SHEET_EVENTS.CHART_UPDATED]: { emitters: ["ChartManager"], listeners: ["ChartPlugin", "ChartLayer"] },
});
