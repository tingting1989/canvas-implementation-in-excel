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
 * 使用方式：
 * ```javascript
 * import { HOOKS } from './constants/hookNames.js';
 *
 * // 添加钩子
 * workbook.addHook(HOOKS.BEFORE_CHANGE, (changes) => {
 *     console.log('数据即将变更:', changes);
 *     // 返回 false 可阻止变更
 *     return true;
 * });
 *
 * // 移除钩子
 * workbook.removeHook(HOOKS.BEFORE_CHANGE, handlerRef);
 * ```
 *
 * 设计原则：
 * 1. 单一职责：每个钩子只关注一个特定的事件点
 * 2. 命名一致性：遵循 before/after/on 前缀规范
 * 3. 参数标准化：相似钩子保持参数结构一致
 * 4. 性能考虑：钩子回调应尽量轻量，避免阻塞主线程
 *
 * @module constants/hookNames
 * @see Workbook.addHook()
 * @see Workbook.removeHook()
 */
export const HOOKS = Object.freeze({
    /*
     * ==================== 编辑相关钩子 ====================
     * 控制单元格编辑流程的生命周期
     */

    /** 编辑开始前 - 用户触发编辑但编辑器未打开时，返回 false 可阻止编辑 */
    BEFORE_BEGIN_EDITING: "beforeBeginEditing",

    /** 编辑开始后 - 编辑器已打开并准备好接收输入 */
    AFTER_BEGIN_EDITING: "afterBeginEditing",

    /** 编辑结束前 - 用户提交编辑内容时，返回 false 可阻止提交 */
    BEFORE_FINISH_EDITING: "beforeFinishEditing",

    /** 编辑结束后 - 新值已写入数据模型 */
    AFTER_FINISH_EDITING: "afterFinishEditing",

    /** 数据变更前 - 任何修改单元格值的操作之前，最后的机会阻止变更 */
    BEFORE_CHANGE: "beforeChange",

    /** 数据变更后 - 单元格值已更新到存储层 */
    AFTER_CHANGE: "afterChange",

    /** 设置单元格值前 - 单个单元格写入前触发，返回 false 可阻止写入（用于数据验证拦截） */
    BEFORE_SET_VALUE_AT: "beforeSetValueAt",

    /** 设置单元格值后 - 单个单元格写入后触发 */
    AFTER_SET_VALUE_AT: "afterSetValueAt",

    /*
     * ==================== 选择相关钩子 ====================
     * 追踪单元格选择区域的变更
     */

    /** 选择开始前 - 用户开始新的选择操作 */
    BEFORE_SELECTION: "beforeSelection",

    /** 选择完成后 - 选择区域已确定并高亮显示 */
    AFTER_SELECTION: "afterSelection",

    /** 选择结束前（拖拽选择中）- 拖拽即将释放 */
    BEFORE_SELECTION_END: "beforeSelectionEnd",

    /** 选择结束后 - 拖拽选择操作已完成 */
    AFTER_SELECTION_END: "afterSelectionEnd",

    /*
     * ==================== 单元格交互钩子 ====================
     * 响应用户在单元格上的鼠标操作
     */

    /** 单元格鼠标按下 - 在单元格区域内按下鼠标按钮 */
    ON_CELL_MOUSE_DOWN: "onCellMouseDown",

    /** 单元格鼠标移入 - 鼠标指针进入单元格边界 */
    ON_CELL_MOUSE_OVER: "onCellMouseOver",

    /** 单元格鼠标移出 - 鼠标指针离开单元格边界 */
    ON_CELL_MOUSE_OUT: "onCellMouseOut",

    /** 单元格点击 - 完整的 click 事件（mousedown + mouseup） */
    ON_CELL_CLICK: "onCellClick",

    /** 单元格双击 - 快速连续两次点击，通常用于进入编辑模式 */
    ON_CELL_DBL_CLICK: "onCellDblClick",

    /*
     * ==================== 键盘相关钩子 ====================
     * 捕获和处理键盘输入
     */

    /** 键盘按下前 - 按键被处理之前，返回 false 可拦截按键 */
    BEFORE_KEY_DOWN: "beforeKeyDown",

    /** 键盘按下后 - 按键已被处理并产生相应效果 */
    AFTER_KEY_DOWN: "afterKeyDown",

    /*
     * ==================== 滚动相关钩子 ====================
     * 监听视口位置变化
     */

    /** 水平滚动后 - 视口水平位置已改变 */
    AFTER_SCROLL_HORIZONTALLY: "afterScrollHorizontally",

    /** 垂直滚动后 - 视口垂直位置已改变 */
    AFTER_SCROLL_VERTICALLY: "afterScrollVertically",

    /*
     * ==================== 合并单元格相关钩子 ====================
     * 控制单元格合并与取消合并操作
     */

    /** 合并前 - 即将执行合并操作，返回 false 可阻止 */
    BEFORE_MERGE_CELLS: "beforeMergeCells",

    /** 合并后 - 单元格已成功合并为一个区域 */
    AFTER_MERGE_CELLS: "afterMergeCells",

    /** 取消合并前 - 即将拆分合并单元格，返回 false 可阻止 */
    BEFORE_UNMERGE_CELLS: "beforeUnmergeCells",

    /** 取消合并后 - 合并单元格已恢复为独立单元格 */
    AFTER_UNMERGE_CELLS: "afterUnmergeCells",

    /*
     * ==================== 剪贴板相关钩子 ====================
     * 管理复制/剪切/粘贴操作
     */

    /** 复制前 - 数据即将复制到剪贴板 */
    BEFORE_COPY: "beforeCopy",

    /** 复制后 - 数据已复制到剪贴板 */
    AFTER_COPY: "afterCopy",

    /** 剪切前 - 数据即将剪切到剪贴板并从原位置移除 */
    BEFORE_CUT: "beforeCut",

    /** 剪切后 - 数据已从原位置移除 */
    AFTER_CUT: "afterCut",

    /** 粘贴前 - 剪贴板数据即将粘贴到目标位置 */
    BEFORE_PASTE: "beforePaste",

    /** 粘贴后 - 剪贴板数据已插入到目标位置 */
    AFTER_PASTE: "afterPaste",

    /*
     * ==================== 列移动相关钩子 ====================
     * 监控列位置的拖拽调整
     */

    /** 列移动前 - 即将通过拖拽改变列顺序 */
    BEFORE_COLUMN_MOVE: "beforeColumnMove",

    /** 列移动后 - 列顺序已调整完成 */
    AFTER_COLUMN_MOVE: "afterColumnMove",

    /*
     * ==================== 行移动相关钩子 ====================
     * 监控行位置的拖拽调整
     */

    /** 行移动前 - 即将通过拖拽改变行顺序 */
    BEFORE_ROW_MOVE: "beforeRowMove",

    /** 行移动后 - 行顺序已调整完成 */
    AFTER_ROW_MOVE: "afterRowMove",

    /*
     * ==================== 隐藏列相关钩子 ====================
     * 控制列的显示与隐藏
     */

    /** 列隐藏后 - 指定列已从视图中隐藏 */
    AFTER_HIDE_COLUMN: "afterHideColumn",

    /** 列显示后 - 隐藏的列已重新可见 */
    AFTER_SHOW_COLUMN: "afterShowColumn",

    /*
     * ==================== 隐藏行相关钩子 ====================
     * 控制行的显示与隐藏
     */

    /** 行隐藏后 - 指定行已从视图中隐藏 */
    AFTER_HIDE_ROW: "afterHideRow",

    /** 行显示后 - 隐藏的行已重新可见 */
    AFTER_SHOW_ROW: "afterShowRow",

    /*
     * ==================== 冻结行列相关钩子 ====================
     * 管理冻结窗格功能
     */

    /** 冻结后 - 冻结窗格已生效 */
    AFTER_FREEZE: "afterFreeze",

    /** 解冻后 - 冻结窗格已取消 */
    AFTER_UNFREEZE: "afterUnfreeze",

    /*
     * ==================== 工作表管理相关钩子 ====================
     * 管理工作表的增删改查操作
     */

    /** 工作表新增前 - 即将创建新工作表，返回 false 可阻止 */
    BEFORE_SHEET_ADD: "beforeSheetAdd",

    /** 工作表新增后 - 新工作表已成功创建 */
    AFTER_SHEET_ADD: "afterSheetAdd",

    /** 工作表删除前 - 即将删除工作表，返回 false 可阻止 */
    BEFORE_SHEET_REMOVE: "beforeSheetRemove",

    /** 工作表删除后 - 工作表已从工作簿中移除 */
    AFTER_SHEET_REMOVE: "afterSheetRemove",

    /** 工作表重命名前 - 即将重命名工作表，返回 false 可阻止 */
    BEFORE_SHEET_RENAME: "beforeSheetRename",

    /** 工作表重命名后 - 工作表名称已更改 */
    AFTER_SHEET_RENAME: "afterSheetRename",

    /** 工作表切换前 - 即将切换到指定工作表，返回 false 可阻止 */
    BEFORE_SHEET_SWITCH: "beforeSheetSwitch",

    /** 工作表切换后 - 当前活动工作表已改变 */
    AFTER_SHEET_SWITCH: "afterSheetSwitch",

    /*
     * ==================== 排序相关钩子 ====================
     * 追踪排序操作的执行与恢复
     */

    /** 排序后 - 数据已按指定规则重新排列 */
    AFTER_SORT: "afterSort",

    /** 排序恢复后 - 已撤销排序操作，恢复原始顺序 */
    AFTER_SORT_RESTORE: "afterSortRestore",

    /*
     * ==================== 生命周期钩子 ====================
     * 对象创建与销毁的全局通知
     */

    /** 初始化完成 - Workbook/Sheet 构造完成并准备就绪 */
    INIT: "init",

    /** 销毁前 - 对象即将被清理和释放资源 */
    DESTROY: "destroy",

    /*
     * ==================== 图表相关钩子 ====================
     * 监控图表的增删改操作
     */

    /** 图表添加后 - 新图表已创建并添加到工作表 */
    AFTER_CHART_ADD: "afterChartAdd",

    /** 图表删除后 - 图表已从工作表中移除 */
    AFTER_CHART_REMOVE: "afterChartRemove",

    /** 图表更新后 - 图表数据或样式已变更 */
    AFTER_CHART_UPDATE: "afterChartUpdate",

    /*
     * ==================== 自动超链接相关钩子 ====================
     * 监控单元格中自动检测到的 URL 的交互行为
     */

    /** URL 检测到 - 单元格值被识别为 URL 时触发（渲染前） */
    ON_URL_DETECTED: "onUrlDetected",

    /** URL 点击 - 用户 Ctrl+Click 包含 URL 的单元格时触发，返回 false 可阻止打开 */
    BEFORE_OPEN_URL: "beforeOpenUrl",

    /** URL 已打开 - 链接已通过 window.open 打开 */
    AFTER_OPEN_URL: "afterOpenUrl",
});