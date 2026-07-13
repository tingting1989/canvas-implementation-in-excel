/**
 * 工作表内部事件常量定义
 *
 * 定义 Sheet 和 Workbook 组件间的通信事件体系。
 * 采用命名空间格式 "module:event-name" 避免命名冲突。
 *
 * 事件分类：
 * - **渲染相关**: 控制画布重绘和缓存失效
 * - **数据变更**: 追踪单元格数据的修改流程
 * - **操作历史**: 管理撤销/重做状态
 * - **系统功能**: 分页、剪贴板、插件访问等
 *
 * 事件流转机制：
 * 1. 事件源 (Emitter) 通过 EventBus.emit() 发射事件
 * 2. 事件总线 (EventBus) 根据注册表验证合法性
 * 3. 监听器 (Listener) 通过 EventBus.on() 接收并处理事件
 *
 * 使用场景：
 * - 数据变更通知：当单元格值改变时，通知渲染层更新显示
 * - 跨组件通信：Sheet 与 Workbook 之间的状态同步
 * - 插件扩展：第三方插件监听核心事件以扩展功能
 *
 * @module constants/sheetEvents
 * @example
 * import { SHEET_EVENTS } from './constants/sheetEvents.js';
 * import { EventBus } from '../core/EventBus.js';
 *
 * // 在 Sheet 中发射事件
 * this.eventBus.emit(SHEET_EVENTS.CELL_CHANGED, { row, col, oldValue, newValue });
 *
 * // 在 Workbook 中监听事件
 * this.eventBus.on(SHEET_EVENTS.CELL_CHANGED, this.handleCellChanged.bind(this));
 */
export const SHEET_EVENTS = Object.freeze({
    /*
     * ==================== 渲染控制事件 ====================
     * 用于管理画布重绘和缓存失效
     */

    /** 使整个画布失效 - 触发完全重绘，通常在窗口resize或全局刷新时使用 */
    INVALIDATE_ALL: "sheet:invalidate-all",

    /** 使单个单元格失效 - 仅重绘指定单元格区域，优化性能 */
    INVALIDATE_CELL: "sheet:invalidate-cell",

    /** 渲染请求 - 请求下一帧进行渲染，用于批量合并渲染操作 */
    RENDER_REQUEST: "sheet:render-request",

    /*
     * ==================== 数据变更事件 ====================
     * 追踪单元格数据的完整生命周期
     */

    /** 单元格值已设置 - 底层数据存储更新完成 */
    CELL_VALUE_SET: "sheet:cell-value-set",

    /** 公式已设置 - 新公式被添加到单元格 */
    FORMULA_SET: "sheet:formula-set",

    /** 公式已移除 - 单元格从公式模式转为普通值模式 */
    FORMULA_REMOVE: "sheet:formula-remove",

    /** 单元格已变更 - 用户编辑导致的最终数据变更（包含旧值和新值） */
    CELL_CHANGED: "sheet:cell-changed",

    /** 变更即将发生 - 编辑器提交前的最后拦截点，可取消变更 */
    BEFORE_CHANGE: "sheet:before-change",

    /** 变更已完成 - 数据已持久化到模型，可触发依赖更新 */
    AFTER_CHANGE: "sheet:after-change",

    /*
     * ==================== 操作历史事件 ====================
     * 支持撤销/重做功能的状态管理
     */

    /** 撤销操作 - 用户触发了 Ctrl+Z 或调用 undo() */
    UNDO: "sheet:undo",

    /** 重做操作 - 用户触发了 Ctrl+Y 或调用 redo() */
    REDO: "sheet:redo",

    /*
     * ==================== 系统功能事件 ====================
     * 各种辅助功能的通信接口
     */

    /** 数据加载完成 - 外部数据源导入或初始化完成 */
    DATA_LOADED: "sheet:data-loaded",

    /** 行列尺寸调整 - 用户拖拽改变了行高或列宽 */
    ROW_COL_RESIZE: "sheet:row-col-resize",

    /** 获取剪贴板数据 - 请求系统剪贴板内容的同步接口 */
    GET_CLIPBOARD: "sheet:get-clipboard",

    /** 获取插件实例 - 按名称查找并返回插件引用 */
    GET_PLUGIN: "sheet:get-plugin",

    /*
     * ==================== 编辑器生命周期事件 ====================
     * 单元格编辑器的完整生命周期，用于触发对应的 Hooks
     */

    /** 即将开始编辑 - 编辑器显示前，可返回 false 阻止 */
    EDITOR_BEFORE_BEGIN: "editor:before-begin",

    /** 已开始编辑 - 编辑器显示后 */
    EDITOR_AFTER_BEGIN: "editor:after-begin",

    /** 即将提交编辑 - 值变更前，可返回 false 阻止 */
    EDITOR_BEFORE_FINISH: "editor:before-finish",

    /** 已完成编辑 - 编辑器隐藏后 */
    EDITOR_AFTER_FINISH: "editor:after-finish",

    /*
     * ==================== 鼠标交互事件 ====================
     * 单元格级别的鼠标交互，用于触发对应 Hooks
     */

    /** 鼠标进入单元格 */
    CELL_MOUSE_OVER: "cell:mouse-over",

    /** 鼠标离开单元格 */
    CELL_MOUSE_OUT: "cell:mouse-out",

    /*
     * ==================== Workbook 级别事件 ====================
     * 工作簿内部的全局事件（非 Sheet 实例事件）
     */

    /** 工作簿初始化完成 - 所有子系统创建完毕 */
    WORKBOOK_INIT: "workbook:init",

    /** 工作簿即将销毁 - 销毁前清理资源 */
    WORKBOOK_DESTROY: "workbook:destroy",

    /** 图表已添加 */
    CHART_ADDED: "chart:added",

    /** 图表已移除 */
    CHART_REMOVED: "chart:removed",

    /** 图表已更新 */
    CHART_UPDATED: "chart:updated",

    /** 工作表已切换 - 用户点击标签栏切换了当前活动工作表 */
    SHEET_SWITCHED: "workbook:sheet-switched",
});

/**
 * 事件流向注册表（Event Flow Registry）
 *
 * 声明每个事件的合法发射方(emitters)与监听方(listeners)，构成系统的通信契约。
 * 此注册表具有双重作用：
 *
 * 1. **架构文档**：一目了然地展示模块间通信拓扑关系
 *    - 快速理解哪些组件会触发特定事件
 *    - 明确知道哪些组件需要响应这些事件
 *    - 便于新开发者理解系统架构
 *
 * 2. **运行时校验**：EventBus.emit() 时对照此表验证 source 合法性
 *    - 防止非法组件发射事件（安全检查）
 *    - 在开发阶段快速定位事件来源错误
 *    - 提供清晰的错误提示信息
 *
 * 模块标识说明：
 * - **Sheet**: 工作表实例自身（构造时传入 EventBus 的默认 source）
 * - **Workbook**: 工作簿管理器，负责协调多个 Sheet
 * - **CellEditor**: 单元格编辑器组件
 * - **TileRenderer**: 瓦片渲染器，负责可见区域绘制
 * - **ContextMenuStrategy**: 右键菜单策略处理器
 * - **SortPlugin**: 排序功能插件
 * - **FreezePlugin**: 冻结窗格插件
 *
 * 数据结构：
 * @type {Record<string, { emitters: string[], listeners: string[] }>}
 *
 * @example
 * // 查看某个事件的通信路径
 * const flow = EVENT_FLOW_REGISTRY[SHEET_EVENTS.CELL_CHANGED];
 * console.log(`发射方: ${flow.emitters.join(', ')}`);
 * console.log(`接收方: ${flow.listeners.join(', ')}`);
 * // 输出: 发射方: Sheet
 * //      接收方: Workbook
 *
 * @module constants/sheetEvents
 * @see EventBus
 * @see EventEnvelope
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
    [SHEET_EVENTS.GET_CLIPBOARD]: {
        emitters: ["TileRenderer", "ContextMenuStrategy"],
        listeners: ["Workbook"],
    },
    [SHEET_EVENTS.GET_PLUGIN]: {
        emitters: ["ContextMenuStrategy"],
        listeners: ["Workbook"],
    },

    [SHEET_EVENTS.SHEET_SWITCHED]: {
        emitters: ["Workbook"],
        listeners: ["SortPlugin", "FreezePlugin", "ChartPlugin"],
    },

    /*
     * ==================== 编辑器生命周期事件流向 ====================
     */
    [SHEET_EVENTS.EDITOR_BEFORE_BEGIN]: {
        emitters: ["CellEditor"],
        listeners: ["EventHandler"],
    },
    [SHEET_EVENTS.EDITOR_AFTER_BEGIN]: {
        emitters: ["CellEditor"],
        listeners: ["EventHandler"],
    },
    [SHEET_EVENTS.EDITOR_BEFORE_FINISH]: {
        emitters: ["CellEditor"],
        listeners: ["EventHandler"],
    },
    [SHEET_EVENTS.EDITOR_AFTER_FINISH]: {
        emitters: ["CellEditor"],
        listeners: ["EventHandler"],
    },

    /*
     * ==================== 鼠标交互事件流向 ====================
     */
    [SHEET_EVENTS.CELL_MOUSE_OVER]: {
        emitters: ["MouseStrategy"],
        listeners: ["EventHandler"],
    },
    [SHEET_EVENTS.CELL_MOUSE_OUT]: {
        emitters: ["MouseStrategy"],
        listeners: ["EventHandler"],
    },

    /*
     * ==================== Workbook 生命周期事件流向 ====================
     */
    [SHEET_EVENTS.WORKBOOK_INIT]: {
        emitters: ["Workbook"],
        listeners: ["EventHandler"],
    },
    [SHEET_EVENTS.WORKBOOK_DESTROY]: {
        emitters: ["Workbook"],
        listeners: ["EventHandler"],
    },

    /*
     * ==================== 图表事件流向 ====================
     */
    [SHEET_EVENTS.CHART_ADDED]: {
        emitters: ["ChartManager"],
        listeners: ["ChartPlugin", "ChartLayer"],
    },
    [SHEET_EVENTS.CHART_REMOVED]: {
        emitters: ["ChartManager"],
        listeners: ["ChartPlugin", "ChartLayer"],
    },
    [SHEET_EVENTS.CHART_UPDATED]: {
        emitters: ["ChartManager"],
        listeners: ["ChartPlugin", "ChartLayer"],
    },
});
