/**
 * 工作表标签自定义事件名称常量
 *
 * 统一管理 SheetTabBarElement 派发和 SheetTabManager 监听的自定义事件名称，
 * 避免硬编码字符串，提高可维护性。
 *
 * 事件流：SheetTabBarElement (emit) → SheetTabManager (trackEvent)
 *
 * @module ui/sheetTab/SheetTabEvents
 */
export const SHEET_TAB_EVENTS = {
    SWITCH: "switch",
    CLOSE: "close",
    RENAME: "rename",
    ADD: "add",
    COPY: "copy",
    HIDE: "hide",
} as const;

export type SheetTabEventName = (typeof SHEET_TAB_EVENTS)[keyof typeof SHEET_TAB_EVENTS];
