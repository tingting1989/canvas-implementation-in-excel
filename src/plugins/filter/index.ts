/**
 * 筛选插件模块
 *
 * 导出所有筛选相关的类和工具：
 * - FilterState: 筛选状态管理
 * - FilterEngine: 筛选引擎（核心逻辑）
 * - FilterUIManager: UI 管理器
 * - FilterDropdown: 筛选下拉面板组件
 * - VirtualValueList: 虚拟值列表组件
 * - FilterIconRenderer: 筛选图标渲染器
 * - NullValueHandler: 空值处理
 *
 * @example
 * import { FilterState, FilterEngine } from "@/plugins/filter";
 *
 * @module plugins/filter
 */
export { FilterState } from "./FilterState.js";
export type { FilterConfig, FilterConfigValues, FilterConfigCondition } from "./FilterState.js";
export { FilterEngine } from "./FilterEngine.js";
export { FilterUIManager } from "./FilterUIManager.js";
export { FilterDropdown } from "./FilterDropdown.js";
export { VirtualValueList } from "./VirtualValueList.js";
export { NullValueHandler, NULL_VALUE_TYPES } from "./NullValueTypes.js";
export { FilterIconRenderer } from "./FilterIconRenderer.js";
