/**
 * 工作表标签自定义事件名称常量
 *
 * 统一管理 SheetTabElement 派发和 SheetTabManager 监听的自定义事件名称，
 * 避免硬编码字符串，提高可维护性。
 *
 * 事件流：SheetTabElement (emit) → SheetTabManager (trackEvent)
 *
 * @module ui/sheetTab/SheetTabEvents
 */
export const SHEET_TAB_EVENTS = {
    /** 切换工作表 — 点击标签触发，detail: { name } */
    SWITCH: "switch",

    /** 关闭工作表 — 点击关闭按钮触发，detail: { name } */
    CLOSE: "close",

    /** 重命名工作表 — 双击标签触发，detail: { name } */
    RENAME: "rename",
};
