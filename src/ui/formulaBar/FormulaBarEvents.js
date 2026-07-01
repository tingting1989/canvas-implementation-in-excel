/**
 * 公式栏自定义事件名称常量
 *
 * 统一管理 FormulaBarElement 派发和 FormulaBarManager 监听的自定义事件名称，
 * 避免硬编码字符串，提高可维护性。
 *
 * 事件流：FormulaBarElement (emit) → FormulaBarManager (trackEvent)
 *
 * @module ui/formulaBar/FormulaBarEvents
 */
export const FORMULA_BAR_EVENTS = {
    /** 确认提交 — Enter 触发，detail: { value } */
    COMMIT: "commit",

    /** 取消编辑 — Escape 或失焦触发 */
    CANCEL: "cancel",

    /** 确认并移动 — Tab 触发，detail: { value, direction } */
    COMMIT_AND_MOVE: "commit-and-move",

    /** 开始编辑 — 公式栏获得焦点触发 */
    START_EDIT: "start-edit",
};