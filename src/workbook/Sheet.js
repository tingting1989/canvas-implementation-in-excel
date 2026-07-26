import { SHEET_EVENTS } from "../constants/sheetEvents.js";
import { EventBus } from "../core/EventBus.js";

import { ChunkedCellStore, SelectionManager, HistoryStack, MergeManager } from "@/model";
import { RowColManager } from "../model/grid/RowColManager.js";
import { RowColSync } from "../model/grid/RowColSync.js";
import { CONFIG } from "../constants/config";
import { SheetStyleManager } from "./managers/SheetStyleManager.js";
import { ColumnTypeManager } from "./managers/ColumnTypeManager.js";
import { HeaderLabelManager } from "./managers/HeaderLabelManager.js";
import { ConditionalFormatManager } from "./managers/ConditionalFormatManager.js";
import { BatchOperationManager } from "./managers/BatchOperationManager.js";
import { ChartManager } from "../model/chart/ChartManager.js";

import { SheetDataCoordinator } from "./coordinators/SheetDataCoordinator.js";
import { SheetStyleCoordinator } from "./coordinators/SheetStyleCoordinator.js";
import { SheetMergeCoordinator } from "./coordinators/SheetMergeCoordinator.js";
import { SheetOperationCoordinator } from "./coordinators/SheetOperationCoordinator.js";
import { SheetMetaCoordinator } from "./coordinators/SheetMetaCoordinator.js";

import { ISheet } from "./interfaces/ISheet.js";

/**
 * 工作表实现类（Coordinator 架构重构版）
 *
 * 职责：
 * - 协调各 Coordinator 子系统（数据、样式、合并、操作、元数据）
 * - 管理共享状态（冻结行列、只读模式、缓存版本号）
 * - 提供 100% 向后兼容的 API（薄代理模式）
 * - 作为外部调用的唯一入口点（Facade 模式）
 *
 * 设计理念：
 * - 本身不包含业务逻辑，仅做薄代理（Thin Proxy）
 * - 所有具体实现委托给对应的 Coordinator
 * - 通过懒初始化（Lazy Init）延迟创建 Coordinator 实例，避免构造时开销
 * - 公开属性供子系统和外部代码直接访问，减少 getter 开销
 *
 * 架构层次：
 * ┌─────────────────────────────────────────────┐
 * │              Sheet（Facade）                 │
 * │  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
 * │  │ Data     │ │ Style    │ │ Merge    │    │
 * │  │ Coord.   │ │ Coord.   │ │ Coord.   │    │
 * │  └────┬─────┘ └────┬─────┘ └────┬─────┘    │
 * │  ┌──────────┐ ┌──────────┐                   │
 * │  │ Operation│ │ Meta     │                   │
 * │  │ Coord.   │ │ Coord.   │                   │
 * │  └──────────┘ └──────────┘                   │
 * │  ┌──────────────────────────────────────┐    │
 * │  │ Managers: Style, Type, Header, ...   │    │
 * │  └──────────────────────────────────────┘    │
 * └─────────────────────────────────────────────┘
 *
 * @implements {ISheet}
 */
export class Sheet extends ISheet {
    // ============================================================
    // 公开属性（供所有子系统和外部代码访问）
    // ============================================================

    /** @type {EventBus} 事件总线 - 用于 Sheet 内部组件间通信 */
    bus;

    /** @type {string} 工作表名称（如 "Sheet1"） */
    name;

    /** @type {boolean} 工作表是否可见（隐藏的工作表不渲染） */
    visible = true;

    /** @type {ChunkedCellStore} 单元格数据存储 - 基于分块索引的高性能存储 */
    cellStore;

    /** @type {SelectionManager} 选区管理器 - 管理当前选中区域和活动单元格 */
    selection;

    /** @type {HistoryStack} 操作历史栈 - 支持撤销/重做 */
    history;

    /** @type {MergeManager} 合并单元格管理器 - 管理合并区域信息 */
    mergeManager;

    /** @type {RowColManager} 行列尺寸与坐标计算管理器 - O(1) 坐标查询 */
    rowColManager;

    /** @type {BatchOperationManager} 批量操作管理器 - 合并多次修改为单次提交 */
    batchOp;

    /** @type {ChartManager|null} 图表管理器 - 延迟初始化或由外部注入 */
    chartManager;

    /** @type {Array<Object>} 单元格静态配置 - 列类型、格式等固定配置 */
    cellConfig = [];

    /** @type {Function|null} 单元格动态配置函数 - 根据行列动态返回配置 */
    cellsFn = null;

    /** @type {number} 单元格内边距（px） */
    cellPadding = CONFIG.CELL_PADDING;

    /** @type {boolean} 文本溢出时是否显示省略号 */
    textOverflowEllipsis = CONFIG.TEXT_OVERFLOW_ELLIPSIS;

    // ============================================================
    // 子系统管理器（供协调者直接访问）
    // ============================================================

    /** @type {SheetStyleManager} 样式管理器 - 管理单元格/行/列/默认样式 */
    styleManager;

    /** @type {ColumnTypeManager} 列类型管理器 - 管理列的数据类型和渲染器 */
    typeManager;

    /** @type {HeaderLabelManager} 表头标签管理器 - 管理自定义表头文本 */
    headerLabels;

    /** @type {ConditionalFormatManager} 条件格式管理器 - 管理条件样式规则 */
    conditionalFormat;

    /** @type {RowColSync} 行同步器 - 监听行变更并同步到 RowColManager */
    rowSync;

    /** @type {RowColSync} 列同步器 - 监听列变更并同步到 RowColManager */
    colSync;

    // ============================================================
    // 私有状态（仅限内部使用）
    // ============================================================

    /** @private 事件总线私有引用（与公开 bus 指向同一实例） */
    #bus;
    /** @private 冻结行区域高度缓存（-1 表示缓存失效，需重新计算） */
    #cachedFrozenRowsHeight = -1;
    /** @private 冻结列区域宽度缓存（-1 表示缓存失效，需重新计算） */
    #cachedFrozenColsWidth = -1;
    /** @private 顶部冻结行数 */
    #fixedRowsTop = 0;
    /** @private 左侧冻结列数 */
    #fixedColumnsStart = 0;
    /** @private 是否只读模式（禁止编辑单元格） */
    #readOnly = false;
    /** @private 样式缓存版本号（每次样式变更递增，用于脏检查） */
    #styleCacheVersion = 0;

    // ============================================================
    // 协调者实例（懒初始化）
    // ============================================================

    /** @private 数据操作协调者 - 管理单元格读写、数据加载 */
    #dataCoordinator;
    /** @private 样式管理协调者 - 管理样式设置、条件格式、数据绑定 */
    #styleCoordinator;
    /** @private 合并单元格协调者 - 管理合并/取消合并、合并区域查询 */
    #mergeCoordinator;
    /** @private 操作执行协调者 - 管理批量操作、撤销重做、行列增删 */
    #operationCoordinator;
    /** @private 元数据协调者 - 管理表头标签、列类型、单元格配置 */
    #metaCoordinator;
    /** @private 单元格数据访问器缓存（由 DataCoordinator 创建） */
    #cellDataAccessor;

    // ============================================================
    // 构造函数
    // ============================================================

    /**
     * 创建工作表实例
     *
     * 初始化流程：
     * 1. 调用父类 ISheet 构造函数
     * 2. 创建事件总线（strict 模式：未注册事件会抛错）
     * 3. 创建核心子系统（数据存储、选区、历史栈、合并、行列管理、批量操作）
     * 4. 创建子管理器（样式、列类型、表头、条件格式、行列同步）
     * 5. 图表管理器延迟初始化（由外部注入）
     *
     * @param {string} name - 工作表名称（如 "Sheet1"）
     */
    constructor(name) {
        super();

        this.name = name;

        this.#bus = new EventBus("Sheet", name, { strict: true });
        this.bus = this.#bus;

        this.cellStore = new ChunkedCellStore();
        this.selection = new SelectionManager();
        this.history = new HistoryStack();
        this.mergeManager = new MergeManager();
        this.rowColManager = new RowColManager();
        this.batchOp = new BatchOperationManager();

        this.styleManager = new SheetStyleManager(this);
        this.typeManager = new ColumnTypeManager(this);
        this.headerLabels = new HeaderLabelManager(this);
        this.conditionalFormat = new ConditionalFormatManager(this);
        this.rowSync = new RowColSync(this, CONFIG.AXIS_ROW);
        this.colSync = new RowColSync(this, CONFIG.AXIS_COL);

        this.chartManager = null;
    }

    // ============================================================
    // 协调者 Getter（懒初始化 + 缓存）
    //
    // 首次访问时创建 Coordinator 实例，后续访问直接返回缓存。
    // 优点：避免构造时创建所有协调者，减少初始化开销。
    // ============================================================

    /**
     * 数据操作协调者
     *
     * 负责单元格读写、数据加载、清空等数据层操作。
     *
     * @returns {SheetDataCoordinator}
     */
    get data() {
        if (!this.#dataCoordinator) {
            this.#dataCoordinator = new SheetDataCoordinator(this);
        }
        return this.#dataCoordinator;
    }

    /**
     * 样式管理协调者
     *
     * 负责单元格/行/列/默认样式设置、条件格式、数据绑定样式。
     *
     * @returns {SheetStyleCoordinator}
     */
    get styles() {
        if (!this.#styleCoordinator) {
            this.#styleCoordinator = new SheetStyleCoordinator(this);
        }
        return this.#styleCoordinator;
    }

    /**
     * 合并单元格协调者
     *
     * 负责合并/取消合并单元格、查询合并区域信息。
     *
     * @returns {SheetMergeCoordinator}
     */
    get merges() {
        if (!this.#mergeCoordinator) {
            this.#mergeCoordinator = new SheetMergeCoordinator(this);
        }
        return this.#mergeCoordinator;
    }

    /**
     * 操作执行协调者
     *
     * 负责批量操作、撤销/重做、行列增删移动、渲染触发。
     *
     * @returns {SheetOperationCoordinator}
     */
    get operations() {
        if (!this.#operationCoordinator) {
            this.#operationCoordinator = new SheetOperationCoordinator(this);
        }
        return this.#operationCoordinator;
    }

    /**
     * 元数据协调者
     *
     * 负责表头标签、列类型配置、单元格属性、格式化/校验。
     *
     * @returns {SheetMetaCoordinator}
     */
    get meta() {
        if (!this.#metaCoordinator) {
            this.#metaCoordinator = new SheetMetaCoordinator(this);
        }
        return this.#metaCoordinator;
    }

    /**
     * 检查工作表是否可写
     *
     * 只读模式下禁止编辑操作，由 Coordinator 在执行写操作前调用。
     *
     * @returns {boolean} true=可写，false=只读
     */
    _ensureWritable() {
        return !this.#readOnly;
    }

    /**
     * 标记整个视图需要重绘
     *
     * 递增样式缓存版本号并清除样式缓存，然后发出 INVALIDATE_ALL 事件。
     * 渲染引擎监听此事件后会在下一帧重新绘制整个视图。
     *
     * @private
     */
    _invalidateAll() {
        this.#styleCacheVersion++;
        this.styleManager.invalidateCache();
        this.#bus.emit(SHEET_EVENTS.INVALIDATE_ALL);
    }

    /**
     * 标记单个单元格需要重绘
     *
     * 清除样式缓存并发出 INVALIDATE_CELL 事件，携带行列信息。
     * 渲染引擎可据此仅重绘受影响的单元格，避免全量重绘。
     *
     * @param {number} r - 行号（0-based）
     * @param {number} c - 列号（0-based）
     */
    _invalidateCell(r, c) {
        this.styleManager.invalidateCache();
        this.#bus.emit(SHEET_EVENTS.INVALIDATE_CELL, { r, c });
    }

    // ============================================================
    // 冻结状态（getter/setter 维护缓存）
    //
    // 冻结行列的尺寸（frozenRowsHeight / frozenColsWidth）通过缓存
    // 避免每次渲染时重复计算。setter 在值变化时将缓存标记为失效（-1），
    // getter 在缓存失效时触发重新计算。
    // ============================================================

    /** @type {number} 顶部冻结行数 */
    get fixedRowsTop() {
        return this.#fixedRowsTop;
    }

    set fixedRowsTop(v) {
        if (this.#fixedRowsTop !== v) {
            this.#fixedRowsTop = v;
            this.#cachedFrozenRowsHeight = -1;
        }
    }

    /** @type {number} 左侧冻结列数 */
    get fixedColumnsStart() {
        return this.#fixedColumnsStart;
    }

    set fixedColumnsStart(v) {
        if (this.#fixedColumnsStart !== v) {
            this.#fixedColumnsStart = v;
            this.#cachedFrozenColsWidth = -1;
        }
    }

    /** @type {boolean} 是否只读模式 */
    get readOnly() {
        return this.#readOnly;
    }

    set readOnly(v) {
        this.#readOnly = !!v;
    }

    /** @type {number} 冻结行区域总高度（px，带缓存） */
    get frozenRowsHeight() {
        if (this.#cachedFrozenRowsHeight < 0) {
            this.#cachedFrozenRowsHeight = this.#calculateFrozenRowsHeight();
        }
        return this.#cachedFrozenRowsHeight;
    }

    /** @type {number} 冻结列区域总宽度（px，带缓存） */
    get frozenColsWidth() {
        if (this.#cachedFrozenColsWidth < 0) {
            this.#cachedFrozenColsWidth = this.#calculateFrozenColsWidth();
        }
        return this.#cachedFrozenColsWidth;
    }

    /**
     * 使冻结区域缓存失效
     *
     * 当行高/列宽发生变化（拖拽调整、隐藏/显示行列）时必须调用，
     * 确保下次访问 frozenRowsHeight/frozenColsWidth 时重新计算。
     *
     * 此方法供以下场景调用：
     * - RenderEngine.render() 开始渲染前
     * - ImportFilePlugin 导入数据后
     * - RowColManager 调整尺寸后
     */
    invalidateFreezeCache() {
        this.#cachedFrozenRowsHeight = -1;
        this.#cachedFrozenColsWidth = -1;
    }

    // ============================================================
    // 向后兼容的 API 代理（保持所有现有调用方式不变）
    //
    // 以下方法均为薄代理（Thin Proxy），直接转发到对应的 Coordinator。
    // 不包含任何业务逻辑，仅保证外部调用接口不变。
    //
    // 代理映射关系：
    //   setCell / disableCell / enableCell / isDisabled / loadData → DataCoordinator
    //   setCellStyle / setRowStyle / setColStyle / ...             → StyleCoordinator
    //   mergeCells / unmergeCells / getMerge / ...                 → MergeCoordinator
    //   beginBatch / endBatch / undo / redo / insertRow / ...      → OperationCoordinator
    //   getColHeader / getColumnType / formatCellValue / ...        → MetaCoordinator
    // ============================================================

    // ---- DataCoordinator 代理 ----

    /**
     * 获取单元格数据访问器
     *
     * CellDataAccessor 提供对单元格值的统一读写接口，
     * 支持静态配置（cellConfig）和动态配置（cellsFn）的合并解析。
     *
     * @returns {import("../model/grid/CellDataAccessor.js").CellDataAccessor}
     */
    get cellDataAccessor() {
        return this.data.dataAccessor;
    }

    /**
     * 设置单元格值
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {*} value - 新值
     * @param {number} [styleId] - 样式 ID
     * @returns {*} 操作结果
     */
    setCell(...args) {
        return this.data.setCell(...args);
    }

    /**
     * 禁用单元格（不可编辑）
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    disableCell(...args) {
        return this.data.disableCell(...args);
    }

    /**
     * 启用单元格（可编辑）
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    enableCell(...args) {
        return this.data.enableCell(...args);
    }

    /**
     * 检查单元格是否被禁用
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {boolean}
     */
    isDisabled(...args) {
        return this.data.isDisabled(...args);
    }

    /**
     * 批量加载数据（二维数组）
     * @param {Array<Array<*>>} data - 二维数据数组
     */
    loadData(...args) {
        return this.data.loadData(...args);
    }

    /**
     * 清空所有单元格数据（Clear All Data）- 纯数据操作版本
     *
     * 此方法仅执行数据清除逻辑，不包含：
     * - Hook 生命周期（由 Workbook 层负责）
     * - 权限验证（由 Workbook 层负责）
     * - 渲染刷新（由调用方负责）
     *
     * 适用场景：
     * - Workbook.clearActiveSheetData() 内部调用
     * - 需要高性能的批量操作（配合 skipHistory）
     * - 单元测试（无需 Workbook 实例）
     *
     * ⚠️ 注意：此方法会触发 SHEET_EVENTS.DATA_CLEARED 内部事件，
     * 用于通知公式引擎、缓存系统等内部组件。
     *
     * @param {object} [options={}] - 配置选项
     * @param {boolean} [options.skipHistory=false] - 是否跳过撤销记录
     * @returns {{ changes: Array<{row:number, col:number, oldValue:*, styleId:number}>, clearedCount: number }}
     */
    clearData(options = {}) {
        const { skipHistory = false } = options;
        const accessor = this.cellDataAccessor;

        const { changes, clearedCount } = accessor.clearAll();

        if (changes.length > 0 && !skipHistory) {
            this.beginBatch();

            for (const { row, col, oldValue, styleId } of changes) {
                this.setCell(row, col, "", styleId);
            }

            this.endBatch();
        }

        // ✅ 通知内部组件（公式引擎、缓存等），但不涉及 Hooks
        this.bus.emit(SHEET_EVENTS.DATA_CLEARED, {
            sheet: this,
            changes,
            clearedCount,
            range: null, // 全表清空
        });

        return { changes, clearedCount };
    }

    /**
     * 清空指定区域的数据（Clear Range Data）- 纯数据操作版本
     *
     * 与 clearData() 类似，但仅处理选定的矩形范围。
     * 同样不包含 Hook 生命周期，由调用方负责。
     *
     * @param {number} topRow - 左上角行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角行号
     * @param {number} bottomCol - 右下角列号
     * @param {object} [options={}] - 配置选项（同 clearData）
     * @returns {{ changes: Array, clearedCount: number }}
     */
    clearRange(topRow, topCol, bottomRow, bottomCol, options = {}) {
        const { skipHistory = false } = options;
        const accessor = this.cellDataAccessor;

        const { changes, clearedCount } = accessor.clearRange(topRow, topCol, bottomRow, bottomCol);

        if (changes.length > 0 && !skipHistory) {
            this.beginBatch();

            for (const { row, col, oldValue, styleId } of changes) {
                this.setCell(row, col, "", styleId);
            }

            this.endBatch();
        }

        // ✅ 通知内部组件
        this.bus.emit(SHEET_EVENTS.DATA_CLEARED, {
            sheet: this,
            changes,
            clearedCount,
            range: { topRow, topCol, bottomRow, bottomCol },
        });

        return { changes, clearedCount };
    }

    // ---- StyleCoordinator 代理 ----

    /**
     * 获取行样式集合
     * @type {Object}
     */
    get rowStyles() {
        return this.styleManager.rowStyles;
    }
    /**
     * 获取列样式集合
     * @type {Object}
     */
    get colStyles() {
        return this.styleManager.colStyles;
    }

    /**
     * 设置整行的默认样式
     * @param {number} row - 行号
     * @param {Object} styleObj - 样式对象（如 { bold: "weight", color: 'red' }）
     */
    setRowStyle(...args) {
        return this.styles.setRowStyle(...args);
    }
    /**
     * 设置整列的默认样式
     * @param {number} col - 列号
     * @param {Object} styleObj - 样式对象
     */
    setColStyle(...args) {
        return this.styles.setColStyle(...args);
    }
    /**
     * 设置工作表的默认样式（应用于无自定义样式的单元格）
     * @param {Object} styleObj - 样式对象
     */
    setDefaultStyle(...args) {
        return this.styles.setDefaultStyle(...args);
    }
    /**
     * 获取工作表的默认样式
     * @returns {Object} 默认样式对象
     */
    getDefaultStyle(...args) {
        return this.styles.getDefaultStyle(...args);
    }
    /**
     * 设置单个单元格的自定义样式
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {Object} styleObj - 样式对象
     */
    setCellStyle(...args) {
        return this.styles.setCellStyle(...args);
    }
    /**
     * 清除单元格级别的自定义样式
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    clearCellStyle(...args) {
        return this.styles.clearCellStyle(...args);
    }
    /**
     * 清除行级别的自定义样式
     * @param {number} row - 行号
     */
    clearRowStyle(...args) {
        return this.styles.clearRowStyle(...args);
    }
    /**
     * 清除列级别的自定义样式
     * @param {number} col - 列号
     */
    clearColStyle(...args) {
        return this.styles.clearColStyle(...args);
    }
    /**
     * 设置矩形区域内所有单元格的样式
     * @param {{topRow:number, topCol:number, bottomRow:number, bottomCol:number}} range - 区域范围
     * @param {Object} styleObj - 样式对象
     */
    setRangeStyle(...args) {
        return this.styles.setRangeStyle(...args);
    }
    /**
     * 清除矩形区域的样式
     * @param {{topRow:number, topCol:number, bottomRow:number, bottomCol:number}} range - 区域范围
     */
    clearRangeStyle(...args) {
        return this.styles.clearRangeStyle(...args);
    }
    /**
     * 批量样式更新（在单个撤销步骤中执行多个样式修改）
     * @param {function(sheet: Sheet): void} fn - 样式修改回调函数
     */
    batchStyleUpdate(...args) {
        return this.styles.batchStyleUpdate(...args);
    }
    /**
     * 获取单元格的最终计算样式（合并行/列/单元格/条件格式/数据绑定层级）
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {Object} 最终样式对象
     */
    getCellStyle(...args) {
        return this.styles.getCellStyle(...args);
    }
    /**
     * 解析样式（将样式 ID 解析为样式对象，同 getCellStyle）
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {Object} 最终样式对象
     */
    resolveStyle(...args) {
        return this.styles.resolveStyle(...args);
    }

    /**
     * 添加条件格式规则
     * @param {Object} options - 规则选项
     * @param {{topRow:number, topCol:number, bottomRow:number, bottomCol:number}} options.range - 应用范围
     * @param {function(value: *, cell?: Object): boolean} options.condition - 条件判断函数
     * @param {Object} [options.style={}] - 命中时应用的样式对象
     */
    addConditionalRule(...args) {
        return this.styles.addConditionalRule(...args);
    }
    /**
     * 检查是否存在条件格式规则
     * @returns {boolean}
     */
    hasConditionalRules(...args) {
        return this.styles.hasConditionalRules(...args);
    }
    /**
     * 检查是否存在数据绑定
     * @returns {boolean}
     */
    hasDataBindings(...args) {
        return this.styles.hasDataBindings(...args);
    }
    /**
     * 匹配条件格式样式（根据单元格值返回匹配的条件样式）
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {Object} cell - 单元格对象
     * @returns {Object|null} 匹配的样式对象，未匹配返回 null
     */
    matchConditionalStyle(...args) {
        return this.styles.matchConditionalStyle(...args);
    }
    /**
     * 绑定数据到样式映射（将某列的值映射为不同的样式）
     * @param {number} col - 列号
     * @param {function(value: *): number} mapperFn - 值→样式ID 的映射函数
     */
    bindDataStyle(...args) {
        return this.styles.bindDataStyle(...args);
    }
    /**
     * 获取数据绑定的样式
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {Object|null}
     */
    getDataBindStyle(...args) {
        return this.styles.getDataBindStyle(...args);
    }
    /**
     * 获取所有数据绑定映射
     * @type {Map<number, Function>}
     */
    get dataBindings() {
        return this.styles.dataBindings;
    }

    // ---- MetaCoordinator 代理 ----

    /**
     * 获取列配置列表
     * @type {Array<Object>}
     */
    get columnsConfig() {
        return this.meta.columnsConfig;
    }
    /**
     * 获取单元格类型映射
     * @type {Object}
     */
    get cellTypes() {
        return this.meta.cellTypes;
    }
    /**
     * 获取自定义列头标签
     * @type {Array<string>|Object}
     */
    get colHeaders() {
        return this.meta.colHeaders;
    }
    set colHeaders(v) {
        this.meta.colHeaders = v;
    }
    /**
     * 获取自定义行头标签
     * @type {Array<string>|Object}
     */
    get rowHeaders() {
        return this.meta.rowHeaders;
    }
    set rowHeaders(v) {
        this.meta.rowHeaders = v;
    }
    /**
     * 获取嵌套表头配置
     * @type {Array<Object>}
     */
    get nestedHeaders() {
        return this.meta.nestedHeaders;
    }
    set nestedHeaders(v) {
        this.meta.nestedHeaders = v;
    }
    /**
     * 获取行头宽度
     * @type {number}
     */
    get rowHeaderWidth() {
        return this.meta.rowHeaderWidth;
    }
    set rowHeaderWidth(v) {
        this.meta.rowHeaderWidth = v;
    }
    /**
     * 获取指定列的头部标签文本
     * @param {number} col - 列号
     * @returns {string}
     */
    getColHeader(...args) {
        return this.meta.getColHeader(...args);
    }
    /**
     * 获取指定列的头部样式
     * @param {number} col - 列号
     * @returns {Object}
     */
    getColHeaderStyle(...args) {
        return this.meta.getColHeaderStyle(...args);
    }
    /**
     * 获取指定行的头部标签文本
     * @param {number} row - 行号
     * @returns {string}
     */
    getRowHeader(...args) {
        return this.meta.getRowHeader(...args);
    }
    /**
     * 获取指定行的头部样式
     * @param {number} row - 行号
     * @returns {Object}
     */
    getRowHeaderStyle(...args) {
        return this.meta.getRowHeaderStyle(...args);
    }
    /**
     * 获取嵌套表头的总层数
     * @returns {number} 0 表示未启用嵌套表头
     */
    getNestedHeaderRowCount(...args) {
        return this.meta.getNestedHeaderRowCount(...args);
    }
    /**
     * 获取嵌套表头中指定层的表头信息
     * @param {number} rowIndex - 嵌套层索引（0=顶层）
     * @param {number} col - 数据列号
     * @returns {{label: string, colspan: number}|null}
     */
    getNestedColHeader(...args) {
        return this.meta.getNestedColHeader(...args);
    }
    /**
     * 获取表头总高度
     * @type {number}
     */
    get headerHeight() {
        return this.meta.headerHeight;
    }
    set headerHeight(v) {
        this.meta.headerHeight = v;
    }
    /**
     * 计算表头区域高度（像素）
     * @returns {number}
     */
    getHeaderHeight(...args) {
        return this.meta.getHeaderHeight(...args);
    }
    /**
     * 计算表头区域宽度（像素）
     * @returns {number}
     */
    getHeaderWidth(...args) {
        return this.meta.getHeaderWidth(...args);
    }

    /**
     * 获取指定列的完整配置
     * @param {number} col - 列号
     * @returns {Object}
     */
    getColumnConfig(...args) {
        return this.meta.getColumnConfig(...args);
    }
    /**
     * 获取指定列的类型名称
     * @param {number} col - 列号
     * @returns {string}
     */
    getColumnType(...args) {
        return this.meta.getColumnType(...args);
    }
    /**
     * 检查列类型一致性（内部使用）
     * @param {number} topCol - 起始列
     * @param {number} bottomCol - 结束列
     * @returns {boolean}
     */
    _checkColumnTypeConsistency(...args) {
        return this.meta._checkColumnTypeConsistency(...args);
    }
    /**
     * 获取列类型的实例（包含编辑器和渲染器）
     * @param {number} col - 列号
     * @returns {Object}
     */
    getColumnTypeInstance(...args) {
        return this.meta.getColumnTypeInstance(...args);
    }
    /**
     * 获取指定单元格的类型实例（优先单元格级 > 列级 > 默认）
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {Object}
     */
    getCellTypeInstance(...args) {
        return this.meta.getCellTypeInstance(...args);
    }
    /**
     * 应用列配置数组（批量设置列类型、宽度等）
     * @param {Array<Object>} columnsConfig - 列配置数组
     */
    applyColumnsConfig(...args) {
        return this.meta.applyColumnsConfig(...args);
    }

    /**
     * 格式化单元格值用于显示
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {*} value - 原始值
     * @returns {string} 格式化后的字符串
     */
    formatCellValue(...args) {
        return this.meta.formatCellValue(...args);
    }
    /**
     * 验证单元格值是否符合类型约束
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {*} value - 待验证的值
     * @returns {boolean} 是否有效
     */
    validateCellValue(...args) {
        return this.meta.validateCellValue(...args);
    }
    /**
     * 解析用户输入为标准值
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {string} input - 用户输入的字符串
     * @returns {*} 解析后的值
     */
    parseCellValue(...args) {
        return this.meta.parseCellValue(...args);
    }

    /**
     * 应用静态 cell 配置数组
     */
    applyCellConfig(...args) {
        return this.meta.applyCellConfig(...args);
    }
    /**
     * 解析单元格属性（合并静态配置和动态 cellsFn）
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {{style?: Object, disabled?: boolean, readOnly?: boolean, value?: *}|null}
     */
    resolveCellProperties(...args) {
        return this.meta.resolveCellProperties(...args);
    }

    // ---- MergeCoordinator 代理 ----

    /**
     * 合并指定区域的单元格
     * @param {number} topRow - 左上角行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角行号
     * @param {number} bottomCol - 右下角列号
     * @returns {boolean} 是否成功
     */
    mergeCells(...args) {
        return this.merges.mergeCells(...args);
    }
    /**
     * 取消合并单元格
     * @param {number} row - 合并区域内任意单元格的行号
     * @param {number} col - 合并区域内任意单元格的列号
     * @returns {boolean} 是否成功
     */
    unmergeCells(...args) {
        return this.merges.unmergeCells(...args);
    }
    /**
     * 获取单元格所属的合并区域信息
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {Object|null} 合并区域信息，未合并返回 null
     */
    getMerge(...args) {
        return this.merges.getMerge(...args);
    }
    /**
     * 判断是否为合并区域的左上角单元格
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {boolean}
     */
    isMergeTopLeft(...args) {
        return this.merges.isMergeTopLeft(...args);
    }
    /**
     * 判断是否属于某个合并区域（且不是左上角）
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {boolean}
     */
    isMergedCell(...args) {
        return this.merges.isMergedCell(...args);
    }
    /**
     * 获取所有合并单元格信息
     * @returns {Array<Object>}
     */
    getAllMerges(...args) {
        return this.merges.getAllMerges(...args);
    }

    // ---- OperationCoordinator 代理 ----

    /**
     * 开始批量操作（暂停事件派发和渲染更新）
     */
    beginBatch(...args) {
        return this.operations.beginBatch(...args);
    }
    /**
     * 结束批量操作（提交所有变更并触发渲染）
     */
    endBatch(...args) {
        return this.operations.endBatch(...args);
    }
    /**
     * 触发工作表重新渲染
     */
    render(...args) {
        return this.operations.render(...args);
    }
    /**
     * 撤销上一步操作
     */
    undo(...args) {
        return this.operations.undo(...args);
    }
    /**
     * 重做已撤销的操作
     */
    redo(...args) {
        return this.operations.redo(...args);
    }
    /**
     * 在指定位置插入新行
     * @param {number} atRow - 插入位置的行号
     */
    insertRow(...args) {
        return this.operations.insertRow(...args);
    }
    /**
     * 在指定位置插入新列
     * @param {number} atCol - 插入位置的列号
     */
    insertCol(...args) {
        return this.operations.insertCol(...args);
    }
    /**
     * 删除指定行
     * @param {number} atRow - 要删除的行号
     */
    deleteRow(...args) {
        return this.operations.deleteRow(...args);
    }
    /**
     * 删除指定列
     * @param {number} atCol - 要删除的列号
     */
    deleteCol(...args) {
        return this.operations.deleteCol(...args);
    }
    /**
     * 移动列：将 fromCol 的数据移到 toCol 位置
     * @param {number} fromCol - 源列号
     * @param {number} toCol - 目标列号
     */
    moveCol(...args) {
        return this.operations.moveCol(...args);
    }
    /**
     * 移动行：将 fromRow 的数据移到 toRow 位置
     * @param {number} fromRow - 源行号
     * @param {number} toRow - 目标行号
     */
    moveRow(...args) {
        return this.operations.moveRow(...args);
    }
    /**
     * 动态设置行数
     * @param {number} rows - 新的行数（必须 >= 1）
     */
    setRowCount(...args) {
        return this.operations.setRowCount(...args);
    }
    /**
     * 动态设置列数
     * @param {number} cols - 新的列数（必须 >= 1）
     */
    setColCount(...args) {
        return this.operations.setColCount(...args);
    }
    /**
     * 同时动态设置行数和列数
     * @param {number} rows - 新的行数（必须 >= 1）
     * @param {number} cols - 新的列数（必须 >= 1）
     */
    setGridSize(...args) {
        return this.operations.setGridSize(...args);
    }

    // ---- 兼容性工具方法 ----

    /**
     * 可见列号 → 真实列号
     *
     * 当前实现为恒等映射（未实现列隐藏功能）。
     * 未来支持列隐藏后，此方法将跳过隐藏列进行映射。
     *
     * @param {number} visibleCol - 可见列索引
     * @returns {number} 真实列索引
     */
    toRealCol(visibleCol) {
        return visibleCol;
    }

    /**
     * 真实列号 → 可见列号
     *
     * 当前实现为恒等映射（未实现列隐藏功能）。
     * 与 toRealCol 互为逆操作。
     *
     * @param {number} realCol - 真实列索引
     * @returns {number} 可见列索引
     */
    toVisibleCol(realCol) {
        return realCol;
    }

    /**
     * 标记整个视图需要重绘（公开版本）
     *
     * 外部代码应调用此方法而非 _invalidateAll()。
     */
    invalidateAll() {
        this._invalidateAll();
    }

    /**
     * 标记单个单元格需要重绘（内部版本）
     *
     * 供 Coordinator 内部调用，外部代码应使用 invalidateAll()。
     *
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    _invalidateCellInternal(r, c) {
        this._invalidateCell(r, c);
    }

    // ---- 内部计算方法（冻结尺寸）----

    /**
     * 计算冻结行区域的总高度
     *
     * 从第 0 行累加到第 (fixedRowsTop - 1) 行的高度。
     * 利用 RowColManager 的缓存坐标实现 O(1) 时间复杂度：
     *   总高度 = 最后一冻结行的 Y 坐标 + 最后一冻结行的高度
     *
     * @private
     * @returns {number} 冻结行区域总高度（px），无冻结行时返回 0
     */
    #calculateFrozenRowsHeight() {
        if (this.#fixedRowsTop <= 0) return 0;

        const rc = this.rowColManager;
        const lastFrozenRow = this.#fixedRowsTop - 1;

        return rc.getRowY(lastFrozenRow) + rc.getRowHeight(lastFrozenRow);
    }

    /**
     * 计算冻结列区域的总宽度
     *
     * 从第 0 列累加到第 (fixedColumnsStart - 1) 列的宽度。
     * 利用 RowColManager 的缓存坐标实现 O(1) 时间复杂度：
     *   总宽度 = 最后一冻结列的 X 坐标 + 最后一冻结列的宽度
     *
     * @private
     * @returns {number} 冻结列区域总宽度（px），无冻结列时返回 0
     */
    #calculateFrozenColsWidth() {
        if (this.#fixedColumnsStart <= 0) return 0;

        const rc = this.rowColManager;
        const lastFrozenCol = this.#fixedColumnsStart - 1;

        return rc.getColX(lastFrozenCol) + rc.getColWidth(lastFrozenCol);
    }
}
