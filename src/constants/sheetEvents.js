export const SHEET_EVENTS = Object.freeze({
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
    ROW_COL_RESIZE: "sheet:row-col-resize",
    PAGINATION_REFRESH: "sheet:pagination-refresh",
    GET_CLIPBOARD: "sheet:get-clipboard",
    GET_PLUGIN: "sheet:get-plugin",
});

/**
 * 事件流向注册表
 *
 * 声明每个事件的合法发射方与监听方，用于：
 * 1. 架构文档化 — 一目了然地了解模块间通信拓扑
 * 2. 运行时契约校验 — EventBus.emit 对照此表验证 source 合法性
 *
 * emitters / listeners 中的字符串为模块标识（对应 EventEnvelope.source）
 * "Sheet" 表示由 Sheet 实例自身发射（构造时传入 EventBus 的默认 source）
 *
 * @type {Record<string, { emitters: string[], listeners: string[] }>}
 */
export const EVENT_FLOW_REGISTRY = Object.freeze({
    [SHEET_EVENTS.INVALIDATE_ALL]: {
        emitters: ["Sheet"],
        listeners: ["Workbook"],
    },
    [SHEET_EVENTS.INVALIDATE_CELL]: {
        emitters: ["Sheet"],
        listeners: ["Workbook"],
    },
    [SHEET_EVENTS.RENDER_REQUEST]: {
        emitters: ["Sheet"],
        listeners: ["Workbook"],
    },
    [SHEET_EVENTS.CELL_VALUE_SET]: {
        emitters: [],
        listeners: [],
    },
    [SHEET_EVENTS.FORMULA_SET]: {
        emitters: ["Sheet"],
        listeners: ["Workbook"],
    },
    [SHEET_EVENTS.FORMULA_REMOVE]: {
        emitters: ["Sheet"],
        listeners: ["Workbook"],
    },
    [SHEET_EVENTS.CELL_CHANGED]: {
        emitters: ["Sheet"],
        listeners: ["Workbook"],
    },
    [SHEET_EVENTS.BEFORE_CHANGE]: {
        emitters: ["CellEditor"],
        listeners: ["Workbook"],
    },
    [SHEET_EVENTS.AFTER_CHANGE]: {
        emitters: ["Sheet", "CellEditor"],
        listeners: ["Workbook"],
    },
    [SHEET_EVENTS.UNDO]: {
        emitters: ["Sheet"],
        listeners: ["Workbook"],
    },
    [SHEET_EVENTS.REDO]: {
        emitters: ["Sheet"],
        listeners: ["Workbook"],
    },
    [SHEET_EVENTS.DATA_LOADED]: {
        emitters: [],
        listeners: [],
    },
    [SHEET_EVENTS.ROW_COL_RESIZE]: {
        emitters: ["Sheet"],
        listeners: ["Workbook"],
    },
    [SHEET_EVENTS.PAGINATION_REFRESH]: {
        emitters: ["Sheet"],
        listeners: ["Workbook"],
    },
    [SHEET_EVENTS.GET_CLIPBOARD]: {
        emitters: ["TileRenderer", "ContextMenuStrategy"],
        listeners: ["Workbook"],
    },
    [SHEET_EVENTS.GET_PLUGIN]: {
        emitters: ["ContextMenuStrategy"],
        listeners: ["Workbook"],
    },
});
