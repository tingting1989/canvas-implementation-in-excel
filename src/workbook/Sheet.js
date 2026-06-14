import {stylePool, DEFAULT_STYLE_ID} from "../styles/index.js";
import {
    ChunkedCellStore,
    ConditionalRule,
    SelectionManager,
    SetCellCommand,
    ToggleDisableCommand,
    HistoryStack,
    MergeManager,
    MergeCommand,
    UnmergeCommand,
    Cell,
} from "../model/index.js";
import {RowColManager} from "../core/RowColManager.js";
import {CONFIG} from "../constants/config";
import {STYLE_LEVEL} from "../constants/styleLevel";

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

    /**
     * @param {string} name - 工作表名称
     * @param {RenderEngine} renderEngine - 渲染引擎（可选，后续通过 setter 注入）
     */
    constructor(name, renderEngine) {
        /** 工作表名称 */
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
        /** 条件格式规则列表 */
        this.conditionalRules = [];
        /** 行级样式映射 row → styleId */
        this.rowStyles = new Map();
        /** 列级样式映射 col → styleId */
        this.colStyles = new Map();
        /** 数据绑定映射 col → mapperFn(cellValue) → styleId */
        this.dataBindings = new Map();

        /**
         * 列头配置：
         * - true / null → 使用默认 A/B/C... 标签
         * - string[] → 自定义标签数组
         * - Function → 自定义标签函数 (col) => string
         */
        this.colHeaders = true;
        /**
         * 行头配置：
         * - true / null → 使用默认 1/2/3... 标签
         * - string[] → 自定义标签数组
         * - Function → 自定义标签函数 (row) => string
         */
        this.rowHeaders = true;

        if (renderEngine) this.#renderEngine = renderEngine;
    }

    get renderEngine() { return this.#renderEngine; }
    set renderEngine(engine) { this.#renderEngine = engine; }

    /**
     * 页面行号 → 实际行号
     * 分页模式下 pageRow 需要加上分页偏移量
     * @param {number} pageRow - 页面行号
     * @returns {number} 实际行号
     */
    toRealRow(pageRow) {
        const offset = this.rowColManager.pageStartRow;
        return offset >= 0 ? offset + pageRow : pageRow;
    }

    /**
     * 实际行号 → 页面行号
     * @param {number} realRow - 实际行号
     * @returns {number} 页面行号
     */
    toPageRow(realRow) {
        const offset = this.rowColManager.pageStartRow;
        return offset >= 0 ? realRow - offset : realRow;
    }

    /**
     * 可视列号 → 实际列号
     * 宽度=0 隐藏列方案下列号无需转换，直接返回
     * @param {number} visibleCol - 可视列号
     * @returns {number} 实际列号
     */
    toRealCol(visibleCol) {
        return visibleCol;
    }

    /**
     * 实际列号 → 可视列号
     * 宽度=0 隐藏列方案下列号无需转换，直接返回
     * @param {number} realCol - 实际列号
     * @returns {number} 可视列号
     */
    toVisibleCol(realCol) {
        return realCol;
    }

    /** 标记整个视图需要重绘 */
    #invalidateAll() {
        const re = this.#renderEngine;
        if (re && typeof re.invalidateAll === 'function') re.invalidateAll();
    }

    /** 标记指定单元格需要重绘 */
    #invalidateCell(r, c) {
        const re = this.#renderEngine;
        if (re && typeof re.invalidateCell === 'function') re.invalidateCell(r, c);
    }

    /**
     * 设置单元格值
     * @param {number} r - 行号（页面行号）
     * @param {number} c - 列号
     * @param {*} value - 单元格值
     * @param {number} [styleId=0] - 样式 ID
     */
    setCell(r, c, value, styleId = 0) {
        const realR = this.toRealRow(r);
        this.rowColManager.ensureSize(realR + 1, c + 1);
        const old = this.cellStore.get(realR, c);
        const cell = new Cell(value, styleId);
        this.history.push(new SetCellCommand(this.cellStore, realR, c, old, cell));
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
        this.history.push(new ToggleDisableCommand(this.cellStore, realR, c, oldState));
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
        this.history.push(new ToggleDisableCommand(this.cellStore, realR, c, oldState));
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
        return this.cellStore.get(realR, c)?.disabled === true;
    }

    /**
     * 设置行级样式
     * @param {number} row - 行号
     * @param {number} styleId - 样式 ID
     */
    setRowStyle(row, styleId) {
        this.rowStyles.set(row, styleId);
    }

    /**
     * 设置列级样式
     * @param {number} col - 列号
     * @param {number} styleId - 样式 ID
     */
    setColStyle(col, styleId) {
        this.colStyles.set(col, styleId);
    }

    /**
     * 添加条件格式规则
     * @param {object} range - 适用范围
     * @param {Function} conditionFn - 条件判断函数
     * @param {number} styleId - 命中时应用的样式 ID
     */
    addConditionalRule(range, conditionFn, styleId) {
        this.conditionalRules.push(new ConditionalRule(range, conditionFn, styleId));
    }

    /**
     * 匹配条件格式样式
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {Cell} cell - 单元格对象
     * @returns {number|null} 命中的样式 ID，未命中返回 null
     */
    matchConditionalStyle(r, c, cell) {
        const realR = this.toRealRow(r);
        for (const rule of this.conditionalRules) {
            if (rule.match(realR, c, cell)) return rule.styleId;
        }
        return null;
    }

    /**
     * 绑定数据样式映射
     * @param {number} col - 列号
     * @param {Function} mapperFn - 映射函数 (cellValue) => styleId
     */
    bindDataStyle(col, mapperFn) {
        this.dataBindings.set(col, mapperFn);
    }

    /**
     * 获取数据绑定样式
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {number|null} 样式 ID
     */
    getDataBindStyle(r, c) {
        const realR = this.toRealRow(r);
        const fn = this.dataBindings.get(c);
        if (!fn) return null;
        const cell = this.cellStore.get(realR, c);
        return fn(cell?.value);
    }

    /**
     * 获取列头标签
     * @param {number} col - 列号
     * @returns {string} 列头文本
     */
    getColHeader(col) {
        const ch = this.colHeaders;
        if (ch === true || ch == null) return this.#defaultColLabel(col);
        if (Array.isArray(ch)) return col < ch.length ? ch[col] : this.#defaultColLabel(col);
        if (typeof ch === 'function') return ch(col);
        return this.#defaultColLabel(col);
    }

    /**
     * 获取行头标签
     * @param {number} row - 行号
     * @returns {string} 行头文本
     */
    getRowHeader(row) {
        const rh = this.rowHeaders;
        if (rh === true || rh == null) return String(row + 1);
        if (Array.isArray(rh)) return row < rh.length ? rh[row] : String(row + 1);
        if (typeof rh === 'function') return rh(row);
        return String(row + 1);
    }

    /**
     * 默认列标签：0→A, 1→B, ..., 25→Z, 26→AA, 27→AB, ...
     * @param {number} col - 列号
     * @returns {string}
     */
    #defaultColLabel(col) {
        let label = "";
        let n = col;
        do {
            label = String.fromCharCode(65 + (n % 26)) + label;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        return label;
    }

    /**
     * 加载二维数组数据
     * 自动扩展行列尺寸，跳过空值单元格
     * @param {Array<Array<*>>} data - 二维数组
     */
    loadData(data) {
        if (!Array.isArray(data)) return;
        const rows = data.length;
        if (rows === 0) return;

        let maxCols = 0;
        for (let r = 0; r < rows; r++) {
            const row = data[r];
            if (Array.isArray(row) && row.length > maxCols) {
                maxCols = row.length;
            }
        }
        if (maxCols === 0) return;

        this.rowColManager.ensureSize(rows, maxCols);

        for (let r = 0; r < rows; r++) {
            const row = data[r];
            if (!Array.isArray(row)) continue;
            for (let c = 0; c < row.length; c++) {
                if (row[c] !== undefined && row[c] !== null && row[c] !== '') {
                    this.cellStore.set(r, c, new Cell(row[c], 0));
                }
            }
        }

        this.#invalidateAll();
        this.#refreshPagination();
    }

    /** 刷新分页插件（数据加载后可能需要重新分页） */
    #refreshPagination() {
        const pg = this.workbook?.getPlugin('pagination');
        if (pg && pg.active) {
            pg.refresh();
        }
    }

    /**
     * 解析单元格最终样式
     * 优先级：列样式 < 行样式 < 单元格样式（后者覆盖前者）
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {object} 合并后的样式对象
     */
    resolveStyle(r, c) {
        const realR = this.toRealRow(r);
        const base = stylePool.getStyle(DEFAULT_STYLE_ID);
        const colStyleId = this.colStyles.get(c);
        const rowStyleId = this.rowStyles.get(realR);
        const cell = this.cellStore.get(realR, c);
        const cellStyleId = cell?.styleId;

        if (!colStyleId && !rowStyleId && !cellStyleId) return base;

        let style = base;
        if (colStyleId) style = {...style, ...stylePool.getStyle(colStyleId)};
        if (rowStyleId) style = {...style, ...stylePool.getStyle(rowStyleId)};
        if (cellStyleId) style = {...style, ...stylePool.getStyle(cellStyleId)};
        return style;
    }

    /**
     * 合并单元格
     * @param {number} topRow - 起始行
     * @param {number} topCol - 起始列
     * @param {number} bottomRow - 结束行
     * @param {number} bottomCol - 结束列
     * @returns {boolean} 是否合并成功
     */
    mergeCells(topRow, topCol, bottomRow, bottomCol) {
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
     * @param {number} row - 合并区域内的行
     * @param {number} col - 合并区域内的列
     * @returns {boolean} 是否取消成功
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

    /**
     * 获取合并单元格信息（返回页面行号）
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {object|null} 合并信息 { topRow, topCol, bottomRow, bottomCol }
     */
    getMerge(row, col) {
        const realRow = this.toRealRow(row);
        const merge = this.mergeManager.getMerge(realRow, col);
        if (!merge) return null;
        const offset = this.rowColManager.pageStartRow;
        if (offset < 0) return merge;
        return {
            ...merge,
            topRow: merge.topRow - offset,
            bottomRow: merge.bottomRow - offset,
        };
    }

    /**
     * 判断是否为合并区域的左上角单元格
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {boolean}
     */
    isMergeTopLeft(row, col) {
        const realRow = this.toRealRow(row);
        return this.mergeManager.isTopLeft(realRow, col);
    }

    /**
     * 判断是否属于某个合并区域（非左上角）
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {boolean}
     */
    isMergedCell(row, col) {
        const realRow = this.toRealRow(row);
        return this.mergeManager.isMerged(realRow, col);
    }

    /** 获取所有合并单元格信息 */
    getAllMerges() {
        return this.mergeManager.getAllMerges();
    }

    /** 触发渲染 */
    render() {
        const re = this.#renderEngine;
        if (re && typeof re.render === 'function') re.render(this);
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

    /**
     * 在指定位置插入行
     * @param {number} atRow - 插入位置行号
     */
    insertRow(atRow) {
        if (atRow < 0 || atRow >= CONFIG.MAX_ROWS) return;
        this.rowColManager.insertRow(atRow);
        this.cellStore.insertRow(atRow);
        this.mergeManager.insertRow(atRow);
        this.#invalidateAll();
    }

    /**
     * 在指定位置插入列
     * @param {number} atCol - 插入位置列号
     */
    insertCol(atCol) {
        if (atCol < 0 || atCol >= CONFIG.MAX_COLS) return;
        this.rowColManager.insertCol(atCol);
        this.cellStore.insertCol(atCol);
        this.mergeManager.insertCol(atCol);
        this.#invalidateAll();
    }

    /**
     * 删除指定行
     * @param {number} atRow - 要删除的行号
     */
    deleteRow(atRow) {
        if (atRow < 0 || atRow >= CONFIG.MAX_ROWS) return;
        this.rowColManager.deleteRow(atRow);
        this.cellStore.deleteRow(atRow);
        this.mergeManager.deleteRow(atRow);
        this.#invalidateAll();
    }

    /**
     * 删除指定列
     * @param {number} atCol - 要删除的列号
     */
    deleteCol(atCol) {
        if (atCol < 0 || atCol >= CONFIG.MAX_COLS) return;
        this.rowColManager.deleteCol(atCol);
        this.cellStore.deleteCol(atCol);
        this.mergeManager.deleteCol(atCol);
        this.#invalidateAll();
    }

    /**
     * 移动列：将 fromCol 的数据移到 toCol 位置
     * 中间列自动平移，同时移动列头标签
     * @param {number} fromCol - 源列号
     * @param {number} toCol - 目标列号
     */
    moveCol(fromCol, toCol) {
        if (fromCol === toCol || fromCol < 0 || toCol < 0) return;
        if (fromCol >= CONFIG.MAX_COLS || toCol >= CONFIG.MAX_COLS) return;

        this.cellStore.moveCol(fromCol, toCol);
        this.rowColManager.moveCol(fromCol, toCol);
        this.mergeManager.moveCol(fromCol, toCol);

        if (Array.isArray(this.colHeaders) && this.colHeaders.length > Math.max(fromCol, toCol)) {
            const [header] = this.colHeaders.splice(fromCol, 1);
            this.colHeaders.splice(toCol, 0, header);
        }

        this.#invalidateAll();
    }

    /**
     * 移动行：将 fromRow 的数据移到 toRow 位置
     * 中间行自动平移，同时移动行头标签
     * @param {number} fromRow - 源行号
     * @param {number} toRow - 目标行号
     */
    moveRow(fromRow, toRow) {
        if (fromRow === toRow || fromRow < 0 || toRow < 0) return;
        if (fromRow >= CONFIG.MAX_ROWS || toRow >= CONFIG.MAX_ROWS) return;

        this.cellStore.moveRow(fromRow, toRow);
        this.rowColManager.moveRow(fromRow, toRow);
        this.mergeManager.moveRow(fromRow, toRow);

        if (Array.isArray(this.rowHeaders) && this.rowHeaders.length > Math.max(fromRow, toRow)) {
            const [header] = this.rowHeaders.splice(fromRow, 1);
            this.rowHeaders.splice(toRow, 0, header);
        }

        this.#invalidateAll();
    }
}