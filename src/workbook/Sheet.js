import { stylePool, DEFAULT_STYLE_ID } from "../styles/index.js";
import {
    ChunkedCellStore,
    SelectionManager,
    SetCellCommand,
    ToggleDisableCommand,
    HistoryStack,
    MergeManager,
    MergeCommand,
    UnmergeCommand,
    Cell,
    BatchCommand,
} from "../model/index.js";
import { RowColManager } from "../core/RowColManager.js";
import { CONFIG } from "../constants/config";
import { SheetStyleManager } from "./SheetStyleManager.js";
import { ColumnTypeManager } from "./ColumnTypeManager.js";
import { HeaderLabelManager } from "./HeaderLabelManager.js";
import { ConditionalFormatManager } from "./ConditionalFormatManager.js";

/**
 * 工作表
 *
 * 管理单个工作表的所有数据和状态，包括：
 * - 单元格数据（ChunkedCellStore）
 * - 行列尺寸（RowColManager）
 * - 选区（SelectionManager）
 * - 合并单元格（MergeManager）
 * - 操作历史（HistoryStack）
 * - 条件格式、行/列样式、数据绑定
 *
 * 坐标体系：
 * - 页面行号（pageRow）：分页模式下用户看到的行号，从 0 开始
 * - 实际行号（realRow）：数据在 cellStore 中的真实行号
 * - 列号：分页只影响行，列号无需转换
 *
 * 渲染刷新通过 #invalidateAll / #invalidateCell 通知 RenderEngine 重绘
 */
export class Sheet {
    /** 渲染引擎引用（由 Workbook.initRender 时注入） */
    #renderEngine = null;
    /** 批量模式：暂存子命令 */
    #batchCommands = [];
    /** 是否处于批量模式 */
    #inBatch = false;
    /** 样式缓存版本号，供 #invalidateAll 递增 */
    #styleCacheVersion = 0;
    /** 行同步器 */
    #rowSync = null;
    /** 列同步器 */
    #colSync = null;
    /** 样式管理器 */
    #styleManager = null;
    /** 列类型管理器 */
    #typeManager = null;
    /** 表头标签管理器 */
    #headerLabels = null;
    /** 条件格式管理器 */
    #conditionalFormat = null;

    /**
     * @param {string} name - 工作表名称
     * @param {RenderEngine} renderEngine - 渲染引擎（可选，后续通过 setter 注入）
     */
    constructor(name, renderEngine) {
        this.name = name;
        /** 所属工作簿引用（由 Workbook.addSheet 时注入） */
        this.workbook = null;
        /** 是否可见 */
        this.visible = true;

        /** 单元格数据存储（分块存储，按行分 chunk） */
        this.cellStore = new ChunkedCellStore();
        /** 选区管理器 */
        this.selection = new SelectionManager();
        /** 操作历史栈（支持 undo/redo） */
        this.history = new HistoryStack();
        /** 合并单元格管理器 */
        this.mergeManager = new MergeManager();
        /** 行列尺寸与坐标计算管理器 */
        this.rowColManager = new RowColManager();
        /**
         * cell 配置数组，每个元素指定 {row, col, style?, disabled?, readOnly?, value?}
         * 静态声明式配置，初始化时一次性应用（参考 Handsontable cell 选项）
         */
        this.cellConfig = [];
        /**
         * cells 函数 (row, col) => {style?, disabled?, readOnly?, value?}
         * 动态计算式配置，每次 resolveCellProperties 时调用（参考 Handsontable cells 选项）
         */
        this.cellsFn = null;
        /** 单元格文字内边距（px），左右两侧各保留此宽度 */
        this.cellPadding = CONFIG.CELL_PADDING;
        /** 单元格文字溢出时是否显示省略号（...） */
        this.textOverflowEllipsis = CONFIG.TEXT_OVERFLOW_ELLIPSIS;

        if (renderEngine) this.#renderEngine = renderEngine;

        // 子管理器必须在代理 getter 访问之前创建
        this.#styleManager = new SheetStyleManager(this);
        this.#typeManager = new ColumnTypeManager(this);
        this.#headerLabels = new HeaderLabelManager(this);
        this.#conditionalFormat = new ConditionalFormatManager(this);
        this.#rowSync = new RowColSync(this, "row");
        this.#colSync = new RowColSync(this, "col");
    }

    // ============================================================
    // renderEngine getter / setter
    // ============================================================

    get renderEngine() {
        return this.#renderEngine;
    }

    set renderEngine(engine) {
        this.#renderEngine = engine;
    }

    // ============================================================
    // 数据访问代理 getter / setter
    //
    // 这些属性已搬入子管理器内部存储（解耦），通过代理保持
    // 外部代码（SettingsApplier、RowColSync、渲染器）的兼容性。
    // ============================================================

    // ---- SheetStyleManager 代理 ----
    get rowStyles() {
        return this.#styleManager.rowStyles;
    }
    get colStyles() {
        return this.#styleManager.colStyles;
    }

    // ---- ColumnTypeManager 代理 ----
    get columnsConfig() {
        return this.#typeManager.columnsConfig;
    }
    get cellTypes() {
        return this.#typeManager.cellTypes;
    }

    // ---- HeaderLabelManager 代理 ----
    get colHeaders() {
        return this.#headerLabels.colHeaders;
    }
    set colHeaders(v) {
        this.#headerLabels.colHeaders = v;
    }
    get rowHeaders() {
        return this.#headerLabels.rowHeaders;
    }
    set rowHeaders(v) {
        this.#headerLabels.rowHeaders = v;
    }
    get nestedHeaders() {
        return this.#headerLabels.nestedHeaders;
    }
    set nestedHeaders(v) {
        this.#headerLabels.nestedHeaders = v;
    }
    get rowHeaderWidth() {
        return this.#headerLabels.rowHeaderWidth;
    }
    set rowHeaderWidth(v) {
        this.#headerLabels.rowHeaderWidth = v;
    }

    // ============================================================
    // 行号转换（分页支持）
    // ============================================================

    /** 页面行号 → 实际行号 */
    toRealRow(pageRow) {
        const offset = this.rowColManager.pageStartRow;
        return offset >= 0 ? offset + pageRow : pageRow;
    }

    /** 实际行号 → 页面行号 */
    toPageRow(realRow) {
        const offset = this.rowColManager.pageStartRow;
        return offset >= 0 ? realRow - offset : realRow;
    }

    /** 可视列号 → 实际列号（当前宽度=0 隐藏列方案下无需转换） */
    toRealCol(visibleCol) {
        return visibleCol;
    }

    /** 实际列号 → 可视列号 */
    toVisibleCol(realCol) {
        return realCol;
    }

    // ============================================================
    // 内部：渲染失效通知
    // ============================================================

    /** 标记整个视图需要重绘 */
    #invalidateAll() {
        this.#renderEngine?.invalidateAll?.();
        this.#styleCacheVersion++;
        this.#styleManager.invalidateCache();
    }

    #invalidateCell(r, c) {
        const pageRow = this.toPageRow(r);
        this.#renderEngine?.invalidateCell?.(pageRow, c);
        this.#styleManager.invalidateCache();
    }

    // ============================================================
    // 单元格值操作
    // ============================================================

    /**
     * 设置单元格值
     * @param {number} r - 行号（页面行号）
     * @param {number} c - 列号
     * @param {*} value - 单元格值
     * @param {number} [styleId=0] - 样式 ID
     * @param {boolean} [disabled=false] - 是否禁用
     */
    setCell(r, c, value, styleId = 0, disabled = false) {
        const realR = this.toRealRow(r);
        this.rowColManager.ensureSize(realR + 1, c + 1);
        const old = this.cellStore.get(realR, c);
        const cell = new Cell(value, styleId, disabled);
        const cmd = new SetCellCommand(this.cellStore, realR, c, old, cell);
        if (this.#inBatch) {
            this.#batchCommands.push(cmd);
        } else {
            this.history.push(cmd);
        }
        this.cellStore.set(realR, c, cell);
        this.#invalidateCell(realR, c);
    }

    /**
     * 禁用单元格（只读）
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    disableCell(r, c) {
        const realR = this.toRealRow(r);
        this.rowColManager.ensureSize(realR + 1, c + 1);
        let cell = this.cellStore.get(realR, c);
        const oldState = cell?.disabled || false;
        if (!cell) {
            cell = new Cell("", 0, true);
        } else {
            cell.disabled = true;
        }
        const cmd = new ToggleDisableCommand(this.cellStore, realR, c, oldState);
        if (this.#inBatch) {
            this.#batchCommands.push(cmd);
        } else {
            this.history.push(cmd);
        }
        this.cellStore.set(realR, c, cell);
        this.#invalidateCell(realR, c);
    }

    /**
     * 启用单元格（取消只读）
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    enableCell(r, c) {
        const realR = this.toRealRow(r);
        const cell = this.cellStore.get(realR, c);
        if (!cell) return;
        const oldState = cell.disabled;
        cell.disabled = false;
        const cmd = new ToggleDisableCommand(this.cellStore, realR, c, oldState);
        if (this.#inBatch) {
            this.#batchCommands.push(cmd);
        } else {
            this.history.push(cmd);
        }
        this.#invalidateCell(realR, c);
    }

    /**
     * 判断单元格是否被禁用
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {boolean}
     */
    isDisabled(r, c) {
        const realR = this.toRealRow(r);
        const colConfig = this.columnsConfig.get(c);
        if (colConfig?.disabled === true || colConfig?.readOnly === true) return true;
        const cellProps = this.resolveCellProperties(r, c);
        if (cellProps?.disabled === true || cellProps?.readOnly === true) return true;
        return this.cellStore.get(realR, c)?.disabled === true;
    }

    // ============================================================
    // 样式操作（委托 SheetStyleManager）
    // ============================================================

    /** 设置行级样式 */
    setRowStyle(row, styleId) {
        this.#styleManager.setRowStyle(row, styleId);
        this.#invalidateAll();
    }

    /** 设置列级样式 */
    setColStyle(col, styleId) {
        this.#styleManager.setColStyle(col, styleId);
        this.#invalidateAll();
    }

    /** 设置工作表默认样式 */
    setDefaultStyle(styleObj) {
        this.#styleManager.setDefaultStyle(styleObj);
        this.#invalidateAll();
    }

    /** @returns {object} 默认样式对象 */
    getDefaultStyle() {
        return this.#styleManager.getDefaultStyle();
    }

    setCellStyle(r, c, styleObj) {
        this.#styleManager.setCellStyle(r, c, styleObj);
        this.#invalidateAll();
    }

    clearCellStyle(r, c) {
        this.#styleManager.clearCellStyle(r, c);
        this.#invalidateAll();
    }

    clearRowStyle(row) {
        this.#styleManager.clearRowStyle(row);
        this.#invalidateAll();
    }

    clearColStyle(col) {
        this.#styleManager.clearColStyle(col);
        this.#invalidateAll();
    }

    setRangeStyle(range, styleObj) {
        this.#styleManager.setRangeStyle(range, styleObj);
        this.#invalidateAll();
    }

    getCellStyle(r, c) {
        return this.resolveStyle(r, c);
    }

    // ============================================================
    // 条件格式 & 数据绑定（委托 ConditionalFormatManager）
    // ============================================================

    /** 添加条件格式规则 */
    addConditionalRule(range, conditionFn, styleId) {
        this.#conditionalFormat.addRule(range, conditionFn, styleId);
    }

    /** 匹配条件格式样式 */
    matchConditionalStyle(r, c, cell) {
        return this.#conditionalFormat.match(r, c, cell);
    }

    /** 绑定数据样式映射 */
    bindDataStyle(col, mapperFn) {
        this.#conditionalFormat.bind(col, mapperFn);
    }

    /** 获取数据绑定样式 */
    getDataBindStyle(r, c) {
        return this.#conditionalFormat.getBinding(r, c);
    }

    /**
     * 数据绑定 Map（供 RowColSync 行列同步时重映射键）
     * @returns {Map<number, Function>}
     */
    get dataBindings() {
        return this.#conditionalFormat.bindings;
    }

    // ============================================================
    // 行列头标签（委托 HeaderLabelManager）
    // ============================================================

    /** 获取列头标签 */
    getColHeader(col) {
        return this.#headerLabels.getColHeader(col);
    }

    /** 获取行头标签 */
    getRowHeader(row) {
        return this.#headerLabels.getRowHeader(row);
    }

    // ============================================================
    // 嵌套表头 & 表头尺寸（委托 HeaderLabelManager）
    // ============================================================

    /**
     * 获取嵌套表头的总层数
     * @returns {number} 0 表示未启用嵌套表头
     */
    getNestedHeaderRowCount() {
        return this.#headerLabels.getNestedHeaderRowCount();
    }

    /**
     * 获取嵌套表头中指定层、指定列的表头信息
     * @param {number} rowIndex - 嵌套层索引（0=顶层）
     * @param {number} col - 数据列号
     * @returns {{label: string, colspan: number}|null}
     */
    getNestedColHeader(rowIndex, col) {
        return this.#headerLabels.getNestedColHeader(rowIndex, col);
    }

    /**
     * 获取表头总高度（像素）
     * @returns {number}
     */
    getHeaderHeight() {
        return this.#headerLabels.getHeaderHeight();
    }

    /**
     * 获取行头列宽度（像素）
     * @returns {number}
     */
    getHeaderWidth() {
        return this.#headerLabels.getHeaderWidth();
    }

    // ============================================================
    // 数据加载
    // ============================================================

    /**
     * 加载二维数组数据，自动扩展行列尺寸，跳过空值单元格
     * @param {Array<Array<*>>} data
     */
    loadData(data) {
        if (!Array.isArray(data)) return;
        const rows = data.length;
        if (rows === 0) return;

        let maxCols = 0;
        for (let r = 0; r < rows; r++) {
            const row = data[r];
            if (Array.isArray(row) && row.length > maxCols) maxCols = row.length;
        }
        if (maxCols === 0) return;

        this.rowColManager.ensureSize(rows, maxCols);

        for (let r = 0; r < rows; r++) {
            const row = data[r];
            if (!Array.isArray(row)) continue;
            for (let c = 0; c < row.length; c++) {
                if (row[c] !== undefined && row[c] !== null && row[c] !== "") {
                    this.cellStore.set(r, c, new Cell(row[c], 0));
                }
            }
        }

        this.#invalidateAll();
        this.#refreshPagination();
    }

    /** 刷新分页插件（数据加载后可能需要重新分页） */
    #refreshPagination() {
        const pg = this.workbook?.getPlugin("pagination");
        if (pg?.active) pg.refresh();
    }

    // ============================================================
    // 样式解析（核心：带帧级缓存）
    // ============================================================

    /** 解析单元格最终样式（委托 SheetStyleManager） */
    resolveStyle(r, c) {
        return this.#styleManager.resolveStyle(r, c);
    }

    // ============================================================
    // cell / cells 配置
    // ============================================================

    /**
     * 应用 cell 配置（静态声明式）
     * 遍历 cellConfig 数组，逐项应用属性到对应单元格
     */
    applyCellConfig() {
        for (const item of this.cellConfig) {
            if (item.row == null || item.col == null) continue;
            const { row: r, col: c, value, style, disabled, readOnly } = item;
            this.rowColManager.ensureSize(r + 1, c + 1);

            if (value !== undefined) {
                const cell = this.cellStore.get(r, c);
                const styleId = style ? stylePool.getStyleId(style) : cell?.styleId || 0;
                const isDisabled = disabled ?? readOnly ?? cell?.disabled ?? false;
                this.cellStore.set(r, c, new Cell(value, styleId, isDisabled));
            } else if (style) {
                this.setCellStyle(r, c, style);
            }

            if (disabled === true || readOnly === true) {
                const cell = this.cellStore.get(r, c);
                if (cell && !cell.disabled) {
                    this.cellStore.set(r, c, new Cell(cell.value, cell.styleId, true));
                }
            }
        }
        this.#invalidateAll();
    }

    /**
     * 解析单元格属性（动态计算式，由 cellsFn 驱动）
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {{style?: object, disabled?: boolean, readOnly?: boolean, value?: *}|null}
     */
    resolveCellProperties(r, c) {
        if (typeof this.cellsFn !== "function") return null;
        try {
            return this.cellsFn(r, c);
        } catch {
            return null;
        }
    }

    // ============================================================
    // 合并单元格
    // ============================================================

    /**
     * 合并单元格
     * @param {number} topRow
     * @param {number} topCol
     * @param {number} bottomRow
     * @param {number} bottomCol
     * @returns {boolean}
     */
    mergeCells(topRow, topCol, bottomRow, bottomCol) {
        // 禁止跨不同列类型合并
        if (!this.#checkColumnTypeConsistency(topCol, bottomCol)) {
            return false;
        }

        const cmd = new MergeCommand(this.mergeManager, topRow, topCol, bottomRow, bottomCol);
        cmd.redo();
        if (cmd.succeeded) {
            this.history.push(cmd);
            this.#invalidateAll();
        }
        return cmd.succeeded;
    }

    /**
     * 取消合并单元格
     * @param {number} row
     * @param {number} col
     * @returns {boolean}
     */
    unmergeCells(row, col) {
        const cmd = new UnmergeCommand(this.mergeManager, row, col);
        cmd.redo();
        if (cmd.oldMerge) {
            this.history.push(cmd);
            this.#invalidateAll();
            return true;
        }
        return false;
    }

    /** 获取合并单元格信息（返回页面行号） */
    getMerge(row, col) {
        const realRow = this.toRealRow(row);
        const merge = this.mergeManager.getMerge(realRow, col);
        if (!merge) return null;
        const offset = this.rowColManager.pageStartRow;
        if (offset < 0) return merge;
        return { ...merge, topRow: merge.topRow - offset, bottomRow: merge.bottomRow - offset };
    }

    /** 判断是否为合并区域的左上角单元格 */
    isMergeTopLeft(row, col) {
        return this.mergeManager.isTopLeft(this.toRealRow(row), col);
    }

    /** 判断是否属于某个合并区域（非左上角） */
    isMergedCell(row, col) {
        return this.mergeManager.isMerged(this.toRealRow(row), col);
    }

    /** 获取所有合并单元格信息 */
    getAllMerges() {
        return this.mergeManager.getAllMerges();
    }

    // ============================================================
    // 批量操作
    // ============================================================

    /**
     * 开始批量操作
     *
     * 在批量模式下，setCell/disableCell/enableCell 产生的命令会暂存到 #batchCommands，
     * 直到 endBatch() 调用时合并为一个 BatchCommand 推入历史栈。
     * 这确保粘贴、剪切、自动填充等多单元格操作可以一键撤销。
     */
    beginBatch() {
        this.#inBatch = true;
        this.#batchCommands = [];
    }

    /**
     * 结束批量操作
     *
     * 将暂存的子命令合并为一个 BatchCommand 推入历史栈。
     * 如果没有子命令（空操作），不推入任何内容。
     */
    endBatch() {
        this.#inBatch = false;
        const commands = this.#batchCommands;
        this.#batchCommands = [];
        if (commands.length > 0) {
            this.history.push(new BatchCommand(commands));
        }
    }

    // ============================================================
    // 渲染 & 撤销/重做
    // ============================================================

    /** 触发渲染 */
    render() {
        this.#renderEngine?.render?.(this);
    }

    /** 撤销上一步操作 */
    undo() {
        this.history.undo();
        this.#invalidateAll();
    }

    /** 重做上一步撤销的操作 */
    redo() {
        this.history.redo();
        this.#invalidateAll();
    }

    // ============================================================
    // 行列操作：插入 / 删除 / 移动
    // ============================================================

    /** 在指定位置插入行 */
    insertRow(atRow) {
        if (!this.#isValidIndex(atRow, CONFIG.MAX_ROWS)) return;
        this.#dispatchToSubSystems("insertRow", atRow);
        this.#rowSync.insert(atRow);
    }

    /** 在指定位置插入列 */
    insertCol(atCol) {
        if (!this.#isValidIndex(atCol, CONFIG.MAX_COLS)) return;
        this.#dispatchToSubSystems("insertCol", atCol);
        this.#colSync.insert(atCol);
    }

    /** 删除指定行 */
    deleteRow(atRow) {
        if (!this.#isValidIndex(atRow, CONFIG.MAX_ROWS)) return;
        this.#dispatchToSubSystems("deleteRow", atRow);
        this.#rowSync.delete(atRow);
    }

    /** 删除指定列 */
    deleteCol(atCol) {
        if (!this.#isValidIndex(atCol, CONFIG.MAX_COLS)) return;
        this.#dispatchToSubSystems("deleteCol", atCol);
        this.#colSync.delete(atCol);
    }

    /** 移动列：将 fromCol 的数据移到 toCol 位置，中间列自动平移 */
    moveCol(fromCol, toCol) {
        if (fromCol === toCol || fromCol < 0 || toCol < 0) return;
        if (fromCol >= CONFIG.MAX_COLS || toCol >= CONFIG.MAX_COLS) return;
        this.#dispatchToSubSystems("moveCol", fromCol, toCol);
        this.#colSync.move(fromCol, toCol);
        this.#invalidateAll();
    }

    /** 移动行：将 fromRow 的数据移到 toRow 位置，中间行自动平移 */
    moveRow(fromRow, toRow) {
        if (fromRow === toRow || fromRow < 0 || toRow < 0) return;
        if (fromRow >= CONFIG.MAX_ROWS || toRow >= CONFIG.MAX_ROWS) return;
        this.#dispatchToSubSystems("moveRow", fromRow, toRow);
        this.#rowSync.move(fromRow, toRow);
        this.#invalidateAll();
    }

    #dispatchToSubSystems(method, ...args) {
        this.rowColManager[method](...args);
        this.cellStore[method](...args);
        this.mergeManager[method](...args);
        this.#invalidateAll();
    }

    #isValidIndex(index, max) {
        return index >= 0 && index < max;
    }

    // ============================================================
    // 列类型配置（委托 ColumnTypeManager）
    // ============================================================

    getColumnConfig(col) {
        return this.#typeManager.getColumnConfig(col);
    }

    getColumnType(col) {
        return this.#typeManager.getColumnType(col);
    }

    #checkColumnTypeConsistency(topCol, bottomCol) {
        return this.#typeManager.checkColumnTypeConsistency(topCol, bottomCol);
    }

    getColumnTypeInstance(col) {
        return this.#typeManager.getColumnTypeInstance(col);
    }

    getCellTypeInstance(r, c) {
        return this.#typeManager.getCellTypeInstance(r, c);
    }

    applyColumnsConfig(columnsConfig) {
        this.#typeManager.applyColumnsConfig(columnsConfig);
        this.#invalidateAll();
    }

    // ============================================================
    // 类型系统委托：格式化 / 验证 / 解析（委托 ColumnTypeManager）
    // ============================================================

    formatCellValue(r, c, value) {
        return this.#typeManager.formatCellValue(r, c, value);
    }

    validateCellValue(r, c, value) {
        return this.#typeManager.validateCellValue(r, c, value);
    }

    parseCellValue(r, c, input) {
        return this.#typeManager.parseCellValue(r, c, input);
    }
}

/**
 * 行列同步器：统一管理 insert/delete/move 时所有附属状态的同步
 *
 * 将原来分散在 6 个行列操作方法中的同步逻辑（数组、Map、cellTypes、嵌套表头）
 * 收敛到此处，消除重复代码。
 *
 * 内部使用 #remapMapKeys 和 #remapCellTypesKeys 两个通用方法，
 * 通过传入不同的 shiftFn 替代原来 6 套独立的移位逻辑。
 */
class RowColSync {
    #sheet;
    #axis;

    constructor(sheet, axis) {
        this.#sheet = sheet;
        this.#axis = axis;
    }

    get #headers() {
        return this.#axis === "row" ? this.#sheet.rowHeaders : this.#sheet.colHeaders;
    }
    get #maps() {
        return this.#axis === "row" ? [this.#sheet.rowStyles] : [this.#sheet.columnsConfig, this.#sheet.colStyles, this.#sheet.dataBindings];
    }

    insert(atIndex) {
        this.#insertArrayAt(this.#headers, atIndex);
        for (const map of this.#maps) this.#remapMapKeys(map, (k) => (k >= atIndex ? k + 1 : k));
        this.#remapCellTypesKeys((k) => (k >= atIndex ? k + 1 : k));
        if (this.#axis === "col") this.#insertNestedHeaderColumn(atIndex);
    }

    delete(atIndex) {
        this.#deleteArrayAt(this.#headers, atIndex);
        for (const map of this.#maps) {
            map.delete(atIndex);
            this.#remapMapKeys(map, (k) => (k > atIndex ? k - 1 : k));
        }
        this.#remapCellTypesKeys((k) => (k === atIndex ? -1 : k > atIndex ? k - 1 : k), true);
        if (this.#axis === "col") this.#deleteNestedHeaderColumn(atIndex);
    }

    move(from, to) {
        this.#shiftArray(this.#headers, from, to);
        for (const map of this.#maps) this.#remapMapKeys(map, (k) => this.#calcShiftedIndex(k, from, to));
        this.#remapCellTypesKeys((k) => this.#calcShiftedIndex(k, from, to));
        if (this.#axis === "col") this.#shiftNestedHeaders(from, to);
    }

    #insertArrayAt(arr, atIndex) {
        if (!Array.isArray(arr) || atIndex < 0 || atIndex >= CONFIG.MAX_COLS) return;
        arr.splice(atIndex, 0, "");
    }

    #deleteArrayAt(arr, atIndex) {
        if (!Array.isArray(arr) || atIndex < 0 || atIndex >= arr.length) return;
        arr.splice(atIndex, 1);
    }

    #shiftArray(arr, from, to) {
        if (!Array.isArray(arr) || arr.length <= Math.max(from, to)) return;
        const [item] = arr.splice(from, 1);
        arr.splice(to, 0, item);
    }

    #remapMapKeys(map, shiftFn) {
        const moved = [];
        for (const [key, val] of map) {
            const newKey = shiftFn(key);
            if (newKey !== key) moved.push({ old: key, new: newKey, val });
        }
        for (const { old: k } of moved) map.delete(k);
        for (const { new: k, val } of moved) map.set(k, val);
    }

    #remapCellTypesKeys(shiftFn, deleteOnMinusOne = false) {
        const toDelete = [];
        const moved = [];
        for (const [key, val] of this.#sheet.cellTypes) {
            const [r, c] = key.split(",").map(Number);
            const oldVal = this.#axis === "row" ? r : c;
            const newVal = shiftFn(oldVal);
            if (newVal === -1) {
                toDelete.push(key);
            } else if (newVal !== oldVal) {
                const newKey = this.#axis === "row" ? `${newVal},${c}` : `${r},${newVal}`;
                moved.push({ oldKey: key, newKey, val });
            }
        }
        for (const k of toDelete) this.#sheet.cellTypes.delete(k);
        for (const { oldKey } of moved) this.#sheet.cellTypes.delete(oldKey);
        for (const { newKey, val } of moved) this.#sheet.cellTypes.set(newKey, val);
    }

    #calcShiftedIndex(index, from, to) {
        if (index === from) return to;
        if (from < to) return index > from && index <= to ? index - 1 : index;
        return index >= to && index < from ? index + 1 : index;
    }

    #insertNestedHeaderColumn(atCol) {
        const nh = this.#sheet.nestedHeaders;
        if (!Array.isArray(nh) || nh.length === 0) return;
        for (const layer of nh) {
            if (!Array.isArray(layer) || layer.length === 0) continue;
            let consumed = 0;
            let inserted = false;
            for (let i = 0; i < layer.length; i++) {
                const item = layer[i];
                const isObj = typeof item === "object" && item !== null;
                const colspan = isObj && typeof item.colspan === "number" ? item.colspan : 1;
                if (atCol >= consumed && atCol < consumed + colspan) {
                    if (isObj) {
                        layer[i] = { ...item, colspan: colspan + 1 };
                    } else if (colspan > 1) {
                        layer[i] = { label: String(item), colspan: colspan + 1 };
                    } else {
                        layer.splice(i, 0, "");
                    }
                    inserted = true;
                    break;
                }
                consumed += colspan;
            }
            if (!inserted) layer.push("");
        }
    }

    #deleteNestedHeaderColumn(atCol) {
        const nh = this.#sheet.nestedHeaders;
        if (!Array.isArray(nh) || nh.length === 0) return;
        for (const layer of nh) {
            if (!Array.isArray(layer) || layer.length === 0) continue;
            let consumed = 0;
            for (let i = 0; i < layer.length; i++) {
                const item = layer[i];
                const isObj = typeof item === "object" && item !== null;
                const label = isObj ? (item.label ?? "") : String(item);
                const colspan = isObj && typeof item.colspan === "number" ? item.colspan : 1;
                if (atCol >= consumed && atCol < consumed + colspan) {
                    if (colspan > 1) {
                        const newSpan = colspan - 1;
                        layer[i] = newSpan === 1 ? label : { label, colspan: newSpan };
                    } else {
                        layer.splice(i, 1);
                    }
                    break;
                }
                consumed += colspan;
            }
        }
    }

    #shiftNestedHeaders(fromCol, toCol) {
        const nh = this.#sheet.nestedHeaders;
        if (!Array.isArray(nh) || nh.length === 0) return;
        for (let li = 0; li < nh.length; li++) {
            const layer = nh[li];
            if (!Array.isArray(layer) || layer.length === 0) continue;

            const flat = [];
            for (const item of layer) {
                const isObj = typeof item === "object" && item !== null;
                const label = isObj ? (item.label ?? "") : String(item);
                const colspan = isObj && typeof item.colspan === "number" ? item.colspan : 1;
                for (let i = 0; i < colspan; i++) flat.push(label);
            }

            if (fromCol < flat.length) {
                const [moved] = flat.splice(fromCol, 1);
                flat.splice(toCol, 0, moved);
            }

            const repacked = [];
            let i = 0;
            while (i < flat.length) {
                const label = flat[i];
                let span = 1;
                while (i + span < flat.length && flat[i + span] === label) span++;
                repacked.push(span === 1 ? label : { label, colspan: span });
                i += span;
            }
            nh[li] = repacked;
        }
    }
}
