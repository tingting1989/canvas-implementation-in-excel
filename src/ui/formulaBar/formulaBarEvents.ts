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
    COMMIT: "commit",
    CANCEL: "cancel",
    COMMIT_AND_MOVE: "commit-and-move",
    START_EDIT: "start-edit",
} as const;

export type FormulaBarEventName = (typeof FORMULA_BAR_EVENTS)[keyof typeof FORMULA_BAR_EVENTS];
