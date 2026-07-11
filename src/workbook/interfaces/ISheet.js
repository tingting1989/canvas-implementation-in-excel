/**
 * @fileoverview 工作表抽象接口 (ISheet)
 *
 * 设计目的：
 * 1. 解耦 Sheet 与其使用者（RenderEngine、Plugin 等）之间的循环依赖
 * 2. 明确 Sheet 对外暴露的公共 API 契约
 * 3. 支持依赖注入和单元测试中的 Mock 实现
 * 4. 作为类型检查的契约，确保所有实现类提供一致的行为
 *
 * 使用方式：
 * - 外部代码应通过此接口访问 Sheet，而非直接引用具体实现
 * - 所有 Coordinator 都应依赖此接口，而非具体的 Sheet 类
 * - 可用于创建 MockSheet 进行单元测试
 */

// ============================================================
// 类型导入（避免循环依赖）
// ============================================================

/**
 * 单元格数据访问代理
 * @typedef {import("../../model/grid/CellDataAccessor.js").CellDataAccessor} CellDataAccessor
 */

/**
 * 行列管理器
 * @typedef {import("../../model/grid/RowColManager.js").RowColManager} RowColManager
 */

/**
 * 选区管理器
 * @typedef {import("../../model/selection/SelectionManager.js").SelectionManager} SelectionManager
 */

/**
 * 合并单元格管理器
 * @typedef {import("../../model/merge/MergeManager.js").MergeManager} MergeManager
 */

/**
 * 操作历史栈
 * @typedef {import("../../model/history/HistoryStack.js").HistoryStack} HistoryStack
 */

/**
 * 批量操作管理器
 * @typedef {import("./managers/BatchOperationManager.js").BatchOperationManager} BatchOperationManager
 */

/**
 * 图表管理器
 * @typedef {import("../../model/chart/ChartManager.js").ChartManager} ChartManager
 */

/**
 * 事件总线
 * @typedef {import("../../core/EventBus.js").EventBus} EventBus
 */

/**
 * 样式对象
 * @typedef {Object} StyleObject
 * @property {string} [fontWeight] - 字体粗细
 * @property {string} [color] - 文字颜色
 * @property {string} [backgroundColor] - 背景色
 * @property {string} [textAlign] - 水平对齐
 * @property {string} [verticalAlign] - 垂直对齐
 * @property {number} [fontSize] - 字号
 * @property {string} [fontFamily] - 字体族
 * @property {boolean} [italic] - 斜体
 * @property {boolean} [underline] - 下划线
 * @property {number} [rotation] - 旋转角度
 */

/**
 * 合并区域范围
 * @typedef {Object} MergeRange
 * @property {number} topRow - 左上角行号
 * @property {number} topCol - 左上角列号
 * @property {number} bottomRow - 右下角行号
 * @property {number} bottomCol - 右下角列号
 */

/**
 * 列配置项
 * @typedef {Object} ColumnConfig
 * @property {string} [type] - 列类型名称
 * @property {*} [defaultValue] - 默认值
 * @property {Object} [options] - 类型特定选项
 * @property {boolean} [readOnly] - 是否只读
 * @property {number} [width] - 列宽
 */

/**
 * Cell 配置项
 * @typedef {Object} CellConfigItem
 * @property {number} row - 行号
 * @property {number} col - 列号
 * @property {*} [value] - 单元格值
 * @property {StyleObject} [style] - 自定义样式
 * @property {boolean} [disabled] - 是否禁用
 * @property {boolean} [readOnly] - 是否只读
 * @property {string} [type] - 覆盖的列类型
 */

// ============================================================
// ISheet 接口定义
// ============================================================

/**
 * 工作表接口 (ISheet)
 *
 * 定义了工作表必须实现的全部公共方法，
 * 用于解耦外部代码与具体实现之间的依赖关系。
 *
 * @interface ISheet
 */
export class ISheet {
    // ============================================================
    // 基础属性
    // ============================================================

    /**
     * 工作表名称
     * @type {string}
     */
    get name() {}

    /**
     * 是否可见
     * @type {boolean}
     */
    get visible() {}

    set visible(value) {}

    /**
     * 只读模式
     * @type {boolean}
     */
    get readOnly() {}

    set readOnly(value) {}

    // ============================================================
    // 核心子系统访问器
    // ============================================================

    /**
     * 事件总线
     * @returns {EventBus}
     */
    get bus() {}

    /**
     * 单元格数据存储
     * @returns {ChunkedCellStore}
     */
    get cellStore() {}

    /**
     * 行列尺寸管理器
     * @returns {RowColManager}
     */
    get rowColManager() {}

    /**
     * 选区管理器
     * @returns {SelectionManager}
     */
    get selection() {}

    /**
     * 合并单元格管理器
     * @returns {MergeManager}
     */
    get mergeManager() {}

    /**
     * 操作历史栈
     * @returns {HistoryStack}
     */
    get history() {}

    /**
     * 批量操作管理器
     * @returns {BatchOperationManager}
     */
    get batchOp() {}

    /**
     * 图表管理器
     * @returns {ChartManager|undefined}
     */
    get chartManager() {}

    // ============================================================
    // 数据操作（委托给 DataCoordinator）
    // ============================================================

    /**
     * 设置单元格值
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {*} value - 值
     * @param {number} [styleId=0] - 样式ID
     * @param {boolean} [disabled=false] - 是否禁用
     */
    setCell(r, c, value, styleId = 0, disabled = false) {}

    /**
     * 禁用单元格
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    disableCell(r, c) {}

    /**
     * 启用单元格
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    enableCell(r, c) {}

    /**
     * 判断单元格是否禁用
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {boolean}
     */
    isDisabled(r, c) {}

    /**
     * 加载数据
     * @param {Array<Array<*>>} data - 二维数组
     */
    loadData(data) {}

    /**
     * 获取数据访问代理
     * @returns {CellDataAccessor}
     */
    get cellDataAccessor() {}

    // ============================================================
    // 样式操作（委托给 StyleCoordinator）
    // ============================================================

    /**
     * 设置行样式
     * @param {number} row - 行号
     * @param {StyleObject} styleObj - 样式对象
     */
    setRowStyle(row, styleObj) {}

    /**
     * 设置列样式
     * @param {number} col - 列号
     * @param {StyleObject} styleObj - 样式对象
     */
    setColStyle(col, styleObj) {}

    /**
     * 设置默认样式
     * @param {StyleObject} styleObj - 样式对象
     */
    setDefaultStyle(styleObj) {}

    /**
     * 获取默认样式
     * @returns {StyleObject}
     */
    getDefaultStyle() {}

    /**
     * 设置单元格样式
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {StyleObject} styleObj - 样式对象
     */
    setCellStyle(r, c, styleObj) {}

    /**
     * 清除单元格样式
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    clearCellStyle(r, c) {}

    /**
     * 解析最终样式
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {StyleObject}
     */
    resolveStyle(r, c) {}

    /**
     * 批量样式更新
     * @param {function(ISheet): void} fn - 更新函数
     */
    batchStyleUpdate(fn) {}

    // ============================================================
    // 合并单元格操作（委托给 MergeCoordinator）
    // ============================================================

    /**
     * 合并单元格区域
     * @param {number} topRow - 左上角行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角行号
     * @param {number} bottomCol - 右下角列号
     * @returns {boolean} 是否成功
     */
    mergeCells(topRow, topCol, bottomRow, bottomCol) {}

    /**
     * 取消合并
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {boolean} 是否成功
     */
    unmergeCells(row, col) {}

    /**
     * 获取合并信息
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {MergeRange|null}
     */
    getMerge(row, col) {}

    /**
     * 是否为合并左上角
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {boolean}
     */
    isMergeTopLeft(row, col) {}

    /**
     * 是否为被合并单元格
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {boolean}
     */
    isMergedCell(row, col) {}

    // ============================================================
    // 操作执行（委托给 OperationCoordinator）
    // ============================================================

    /**
     * 开始批量操作
     */
    beginBatch() {}

    /**
     * 结束批量操作
     */
    endBatch() {}

    /**
     * 触发渲染
     */
    render() {}

    /**
     * 撤销
     */
    undo() {}

    /**
     * 重做
     */
    redo() {}

    /**
     * 插入行
     * @param {number} atRow - 插入位置
     */
    insertRow(atRow) {}

    /**
     * 插入列
     * @param {number} atCol - 插入位置
     */
    insertCol(atCol) {}

    /**
     * 删除行
     * @param {number} atRow - 行号
     */
    deleteRow(atRow) {}

    /**
     * 删除列
     * @param {number} atCol - 列号
     */
    deleteCol(atCol) {}

    /**
     * 移动列
     * @param {number} fromCol - 源列
     * @param {number} toCol - 目标列
     */
    moveCol(fromCol, toCol) {}

    /**
     * 移动行
     * @param {number} fromRow - 源行
     * @param {number} toRow - 目标行
     */
    moveRow(fromRow, toRow) {}

    /**
     * 设置行数
     * @param {number} rows - 行数
     */
    setRowCount(rows) {}

    /**
     * 设置列数
     * @param {number} cols - 列数
     */
    setColCount(cols) {}

    /**
     * 设置网格尺寸
     * @param {number} rows - 行数
     * @param {number} cols - 列数
     */
    setGridSize(rows, cols) {}

    // ============================================================
    // 元数据操作（委托给 MetaCoordinator）
    // ============================================================

    /**
     * 获取列头标签
     * @param {number} col - 列号
     * @returns {string}
     */
    getColHeader(col) {}

    /**
     * 获取行头标签
     * @param {number} row - 行号
     * @returns {string}
     */
    getRowHeader(row) {}

    /**
     * 获取表头总高度
     * @returns {number} 像素
     */
    getHeaderHeight() {}

    /**
     * 获取表头总宽度
     * @returns {number} 像素
     */
    getHeaderWidth() {}

    /**
     * 获取列配置
     * @param {number} col - 列号
     * @returns {ColumnConfig}
     */
    getColumnConfig(col) {}

    /**
     * 获取列类型
     * @param {number} col - 列号
     * @returns {string}
     */
    getColumnType(col) {}

    /**
     * 格式化单元格值
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {*} value - 原始值
     * @returns {string}
     */
    formatCellValue(r, c, value) {}

    /**
     * 应用 cell 配置
     */
    applyCellConfig() {}

    // ============================================================
    // 冻结与缓存控制
    // ============================================================

    /**
     * 冻结行数（顶部固定）
     * @type {number}
     */
    get fixedRowsTop() {}
    set fixedRowsTop(v) {}

    /**
     * 冻结列数（左侧固定）
     * @type {number}
     */
    get fixedColumnsStart() {}
    set fixedColumnsStart(v) {}

    /**
     * 冻结行像素高度（带缓存）
     * @returns {number}
     */
    get frozenRowsHeight() {}

    /**
     * 冻结列像素宽度（带缓存）
     * @returns {number}
     */
    get frozenColsWidth() {}

    /**
     * 使冻结区域缓存失效
     *
     * 当行高/列宽发生变化时必须调用，
     * 确保下次访问 frozenRowsHeight/frozenColsWidth 时重新计算。
     */
    invalidateFreezeCache() {}

    // ============================================================
    // 视图刷新
    // ============================================================

    /**
     * 使整个视图失效（触发全量重绘）
     */
    invalidateAll() {}

    /**
     * 使单个单元格失效
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    _invalidateCellInternal(r, c) {}

    // ============================================================
    // 坐标转换工具
    // ============================================================

    /**
     * 可视列 → 实际列
     * @param {number} visibleCol - 可视列号
     * @returns {number} 实际列号
     */
    toRealCol(visibleCol) {}

    /**
     * 实际列 → 可视列
     * @param {number} realCol - 实际列号
     * @returns {number} 可视列号
     */
    toVisibleCol(realCol) {}
}

/**
 * 导出接口类型（供 TypeScript 或 JSDoc 使用）
 * @typedef {ISheet} ISheetType
 */
export default ISheet;
