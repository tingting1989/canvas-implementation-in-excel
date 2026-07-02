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
    /** 切换工作表 — 点击标签触发，detail: { name } */
    SWITCH: "switch",

    /** 关闭工作表 — 右键菜单删除触发，detail: { name } */
    CLOSE: "close",

    /** 重命名工作表 — 双击标签或右键菜单重命名确认时触发，detail: { oldName, newName } */
    RENAME: "rename",

    /** 新增工作表 — 点击添加按钮触发 */
    ADD: "add",

    /** 复制工作表 — 右键菜单复制触发，detail: { name } */
    COPY: "copy",

    /** 隐藏工作表 — 右键菜单隐藏触发，detail: { name } */
    HIDE: "hide",
};