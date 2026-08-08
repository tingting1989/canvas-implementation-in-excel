/**
 * Search Plugin 模块导出
 *
 * 提供类似 Excel/Ctrl+F 的全局搜索功能：
 * - 文本搜索 / 正则表达式搜索
 * - 大小写敏感 / 全词匹配选项
 * - 结果高亮显示（Canvas 渲染）
 * - 键盘导航（F3/Shift+F3）
 * - 搜索替换功能（支持 Ctrl+Z 撤销）
 */

export { SearchPlugin } from "./SearchPlugin.js";
export { SearchState } from "./SearchState.js";
export { SearchEngine } from "./SearchEngine.js";
export { SearchUIController } from "./SearchUIController.js";
export { SearchDropdown } from "./SearchDropdown.js";
export { SearchNavigator } from "./SearchNavigator.js";
export { SearchResultHighlighter } from "./SearchResultHighlighter.js";
export { SearchStrategy } from "./SearchStrategy.js"; // ✅ 新增：搜索策略
