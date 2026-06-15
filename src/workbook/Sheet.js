import { stylePool, DEFAULT_STYLE_ID } from "../styles/index.js";
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
import { RowColManager } from "../core/RowColManager.js";
import { CONFIG } from "../constants/config";
import { STYLE_LEVEL } from "../constants/styleLevel";

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
    /** 工作表默认样式 ID（覆盖全局 DEFAULT_STYLE_ID） */
    #defaultStyleId = DEFAULT_STYLE_ID;
    /** resolveStyle 缓存：key = "r,c" → value = 合并后的样式对象 */
    #styleCache = new Map();
    /** 样式缓存版本号，每次样式变更递增，渲染帧内使用版本号判断是否过期 */
    #styleCacheVersion = 0;
    /** 当前渲染帧的缓存版本，帧内相同版本直接命中缓存 */
    #styleCacheFrameVersion = -1;

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
         * cell 配置：数组，每个元素指定 {row, col, style?, disabled?, readOnly?, value?}
         * 静态声明式配置，初始化时一次性应用
         * 参考 Handsontable 的 cell 选项
         */
        this.cellConfig = [];
        /**
         * cells 配置：函数 (row, col) => {style?, disabled?, readOnly?, value?}
         * 动态计算式配置，每次 resolveCellProperties 时调用
         * 优先级高于 cell 配置
         * 参考 Handsontable 的 cells 选项
         */
        this.cellsFn = null;

        /**
         * 列配置映射 col → ColumnConfig
         * 参考 Handsontable 的 columns 选项
         *
         * ColumnConfig 支持的属性：
         * - type: 'text' | 'numeric' | 'date' — 列类型，决定编辑器和渲染方式
         * - width: number — 列宽
         * - style: object — 列默认样式
         * - disabled / readOnly: boolean — 整列禁用
         * - numericFormat: { pattern: string, culture: string } — 数字格式化配置
         * - validator: Function — 值验证函数 (value) => boolean | string
         * - allowInvalid: boolean — 是否允许无效值
         * - source: Array — 下拉列表数据源（type='dropdown' 时使用）
         */
        this.columnsConfig = new Map();

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

    get renderEngine() {
        return this.#renderEngine;
    }
    set renderEngine(engine) {
        this.#renderEngine = engine;
    }

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
        if (re && typeof re.invalidateAll === "function") re.invalidateAll();
        this.#styleCacheVersion++;
    }

    /** 标记指定单元格需要重绘 */
    #invalidateCell(r, c) {
        const re = this.#renderEngine;
        if (re && typeof re.invalidateCell === "function") re.invalidateCell(r, c);
        this.#styleCache.delete(`${r},${c}`);
        this.#styleCacheVersion++;
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
        const colConfig = this.columnsConfig.get(c);
        if (colConfig?.disabled === true || colConfig?.readOnly === true) return true;
        const cellProps = this.resolveCellProperties(r, c);
        if (cellProps?.disabled === true || cellProps?.readOnly === true) return true;
        return this.cellStore.get(realR, c)?.disabled === true;
    }

    /**
     * 设置行级样式
     * @param {number} row - 行号
     * @param {number} styleId - 样式 ID
     */
    setRowStyle(row, styleId) {
        this.rowStyles.set(row, styleId);
        this.#invalidateAll();
    }

    /**
     * 设置列级样式
     * @param {number} col - 列号
     * @param {number} styleId - 样式 ID
     */
    setColStyle(col, styleId) {
        this.colStyles.set(col, styleId);
        this.#invalidateAll();
    }

    /**
     * 设置工作表默认样式
     * 覆盖全局 DEFAULT_STYLE_ID，影响所有未设置行/列/单元格样式的单元格
     * @param {object} styleObj - 样式对象，如 { fontSize: 14, fontFamily: "Arial" }
     */
    setDefaultStyle(styleObj) {
        this.#defaultStyleId = stylePool.getStyleId(styleObj);
        this.#invalidateAll();
    }

    /**
     * 获取工作表默认样式
     * @returns {object} 默认样式对象
     */
    getDefaultStyle() {
        return stylePool.getStyle(this.#defaultStyleId);
    }

    /**
     * 设置单个单元格样式
     * 保留单元格原有值，仅更新样式
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {object} styleObj - 样式对象，如 { fontSize: 16, fontWeight: "bold" }
     */
    setCellStyle(r, c, styleObj) {
        const realR = this.toRealRow(r);
        this.rowColManager.ensureSize(realR + 1, c + 1);
        const cell = this.cellStore.get(realR, c);
        const currentStyleId = cell?.styleId || 0;
        const currentStyle = currentStyleId ? stylePool.getStyle(currentStyleId) : {};
        const mergedStyle = { ...currentStyle, ...styleObj };
        const newStyleId = stylePool.getStyleId(mergedStyle);
        const value = cell?.value ?? "";
        this.cellStore.set(realR, c, new Cell(value, newStyleId, cell?.disabled || false));
        this.#invalidateAll();
    }

    /**
     * 清除单元格样式
     * 将单元格 styleId 重置为 0（默认样式），保留值和禁用状态
     *
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    clearCellStyle(r, c) {
        const realR = this.toRealRow(r);
        const cell = this.cellStore.get(realR, c);
        if (!cell || cell.styleId === 0) return;
        this.cellStore.set(realR, c, new Cell(cell.value, 0, cell.disabled));
        this.#invalidateAll();
    }

    /**
     * 清除行级样式
     *
     * @param {number} row - 行号
     */
    clearRowStyle(row) {
        if (!this.rowStyles.has(row)) return;
        this.rowStyles.delete(row);
        this.#invalidateAll();
    }

    /**
     * 清除列级样式
     *
     * @param {number} col - 列号
     */
    clearColStyle(col) {
        if (!this.colStyles.has(col)) return;
        this.colStyles.delete(col);
        this.#invalidateAll();
    }

    /**
     * 批量设置选区样式（高性能版本）
     *
     * 优化策略：
     * 1. 整行覆盖 → 使用 rowStyles（O(行数)）
     * 2. 整列覆盖 → 使用 colStyles（O(列数)）
     * 3. 混合选区 → 逐单元格设置，但只调用一次 invalidateAll
     *
     * @param {{ topRow: number, topCol: number, bottomRow: number, bottomCol: number }} range - 选区范围
     * @param {object} styleObj - 样式对象
     */
    setRangeStyle(range, styleObj) {
        const styleId = stylePool.getStyleId(styleObj);
        const totalCols = this.rowColManager.totalCols;
        const isFullRow = range.topCol === 0 && range.bottomCol >= totalCols - 1;

        if (isFullRow) {
            for (let r = range.topRow; r <= range.bottomRow; r++) {
                const realR = this.toRealRow(r);
                this.rowStyles.set(realR, styleId);
            }
            this.#invalidateAll();
            return;
        }

        const totalRows = this.rowColManager.totalRows;
        const isFullCol = range.topRow === 0 && range.bottomRow >= totalRows - 1;

        if (isFullCol) {
            for (let c = range.topCol; c <= range.bottomCol; c++) {
                this.colStyles.set(c, styleId);
            }
            this.#invalidateAll();
            return;
        }

        for (let r = range.topRow; r <= range.bottomRow; r++) {
            for (let c = range.topCol; c <= range.bottomCol; c++) {
                if (this.isDisabled(r, c)) continue;
                this.setCellStyle(r, c, styleObj);
            }
        }
        this.#invalidateAll();
    }

    /**
     * 获取单元格最终解析样式
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {object} 合并后的样式对象
     */
    getCellStyle(r, c) {
        return this.resolveStyle(r, c);
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
        if (typeof ch === "function") return ch(col);
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
        if (typeof rh === "function") return rh(row);
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
        if (pg && pg.active) {
            pg.refresh();
        }
    }

    /**
     * 解析单元格最终样式（带帧级缓存）
     *
     * 优先级：默认样式 < 列样式 < 行样式 < 单元格样式（后者覆盖前者）
     *
     * 缓存策略：
     * - 同一渲染帧内，相同 (r,c) 直接返回缓存结果，避免重复对象展开
     * - 样式变更时 #styleCacheVersion 递增，下一帧自动失效
     * - 帧切换时清空缓存，防止内存泄漏
     *
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {object} 合并后的样式对象
     */
    resolveStyle(r, c) {
        const realR = this.toRealRow(r);
        const key = `${realR},${c}`;

        if (this.#styleCacheFrameVersion === this.#styleCacheVersion) {
            const cached = this.#styleCache.get(key);
            if (cached !== undefined) return cached;
        } else {
            this.#styleCacheFrameVersion = this.#styleCacheVersion;
            this.#styleCache.clear();
        }

        const base = stylePool.getStyle(this.#defaultStyleId);
        const colStyleId = this.colStyles.get(c);
        const rowStyleId = this.rowStyles.get(realR);
        const cell = this.cellStore.get(realR, c);
        const cellStyleId = cell?.styleId;

        if (!colStyleId && !rowStyleId && !cellStyleId && !this.cellsFn && !this.columnsConfig.get(c)?.style) {
            this.#styleCache.set(key, base);
            return base;
        }

        let style = base;
        if (colStyleId) style = { ...style, ...stylePool.getStyle(colStyleId) };
        if (rowStyleId) style = { ...style, ...stylePool.getStyle(rowStyleId) };
        if (cellStyleId) style = { ...style, ...stylePool.getStyle(cellStyleId) };

        const colConfig = this.columnsConfig.get(c);
        if (colConfig?.type === "numeric" && !style.textAlign) {
            style = { ...style, textAlign: "right" };
        }

        const cellProps = this.resolveCellProperties(r, c);
        if (cellProps?.style) style = { ...style, ...cellProps.style };

        this.#styleCache.set(key, style);
        return style;
    }

    /**
     * 应用 cell 配置（静态声明式）
     * 遍历 cellConfig 数组，逐项应用属性到对应单元格
     * 支持：style（样式对象）、disabled/readOnly（禁用）、value（初始值）
     */
    applyCellConfig() {
        for (const item of this.cellConfig) {
            if (item.row == null || item.col == null) continue;
            const r = item.row;
            const c = item.col;
            this.rowColManager.ensureSize(r + 1, c + 1);

            if (item.value !== undefined) {
                const cell = this.cellStore.get(r, c);
                const styleId = item.style ? stylePool.getStyleId(item.style) : cell?.styleId || 0;
                const disabled = item.disabled ?? item.readOnly ?? cell?.disabled ?? false;
                this.cellStore.set(r, c, new Cell(item.value, styleId, disabled));
            } else if (item.style) {
                this.setCellStyle(r, c, item.style);
            }

            if (item.disabled === true || item.readOnly === true) {
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
     * 每次调用时执行 cellsFn(row, col) 获取属性
     *
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
        if (re && typeof re.render === "function") re.render(this);
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

    /**
     * 获取指定列的配置
     * @param {number} col - 列号
     * @returns {object|null} 列配置对象
     */
    getColumnConfig(col) {
        return this.columnsConfig.get(col) || null;
    }

    /**
     * 获取指定列的类型
     * @param {number} col - 列号
     * @returns {string} 列类型，默认 'text'
     */
    getColumnType(col) {
        return this.columnsConfig.get(col)?.type || "text";
    }

    /**
     * 应用 columns 配置
     * 遍历列配置数组，逐列应用属性
     *
     * @param {Array<Function|object>} columnsConfig - 列配置数组
     *   数组元素为对象时：直接作为该列的配置
     *   数组元素为函数时：(col) => ColumnConfig，动态计算列配置
     */
    applyColumnsConfig(columnsConfig) {
        if (!Array.isArray(columnsConfig)) return;

        for (let c = 0; c < columnsConfig.length; c++) {
            let config = columnsConfig[c];

            if (typeof config === "function") {
                try {
                    config = config(c);
                } catch {
                    continue;
                }
            }

            if (!config || typeof config !== "object") continue;

            this.columnsConfig.set(c, config);

            if (config.width != null) {
                this.rowColManager.setColWidth(c, config.width);
            }

            if (config.style) {
                this.colStyles.set(c, stylePool.getStyleId(config.style));
            }

            if (config.disabled === true || config.readOnly === true) {
                this.rowColManager.ensureSize(1, c + 1);
            }
        }

        this.#invalidateAll();
    }

    /**
     * 格式化单元格显示值
     * 根据列类型的 numericFormat 等配置，将原始值转换为显示文本
     *
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {*} value - 原始值
     * @returns {string} 格式化后的显示文本
     */
    formatCellValue(r, c, value) {
        if (value === undefined || value === null) return "";

        const colConfig = this.columnsConfig.get(c);
        if (!colConfig) return String(value);

        switch (colConfig.type) {
            case "numeric":
                return this.#formatNumeric(value, colConfig.numericFormat);
            default:
                return String(value);
        }
    }

    /**
     * 数字格式化
     * @param {*} value - 原始值
     * @param {object} [numericFormat] - 格式化配置
     * @param {string} [numericFormat.pattern] - 格式模式，如 '0,0.00'、'0.00%'、'$0,0.00'
     * @param {string} [numericFormat.culture] - 区域设置（预留）
     * @returns {string}
     */
    #formatNumeric(value, numericFormat) {
        const num = typeof value === "number" ? value : parseFloat(value);
        if (isNaN(num)) return String(value);

        if (!numericFormat || !numericFormat.pattern) {
            return String(num);
        }

        const pattern = numericFormat.pattern;

        if (pattern === "0,0.00" || pattern === "0,0.0" || pattern === "0,0") {
            const decimals = pattern.includes(".00") ? 2 : pattern.includes(".0") ? 1 : 0;
            return num.toLocaleString("en-US", {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
            });
        }

        if (pattern === "0.00%" || pattern === "0.0%" || pattern === "0%") {
            const decimals = pattern.includes(".00") ? 2 : pattern.includes(".0") ? 1 : 0;
            return (num * 100).toLocaleString("en-US", {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
            }) + "%";
        }

        if (pattern.startsWith("$") || pattern.startsWith("€") || pattern.startsWith("¥")) {
            const symbol = pattern[0];
            const rest = pattern.slice(1);
            const decimals = rest.includes(".00") ? 2 : rest.includes(".0") ? 1 : 0;
            const hasGroup = rest.includes(",");
            const formatted = hasGroup
                ? num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
                : num.toFixed(decimals);
            return symbol + formatted;
        }

        if (pattern === "0.00" || pattern === "0.0" || pattern === "0") {
            const decimals = pattern.includes(".00") ? 2 : pattern.includes(".0") ? 1 : 0;
            return num.toFixed(decimals);
        }

        return String(num);
    }

    /**
     * 验证单元格值是否符合列配置的 validator
     * @param {number} c - 列号
     * @param {*} value - 待验证的值
     * @returns {boolean|string} true=有效, false=无效, string=错误消息
     */
    validateCellValue(c, value) {
        const colConfig = this.columnsConfig.get(c);
        if (!colConfig) return true;

        if (colConfig.type === "numeric" && value !== "" && value !== undefined && value !== null) {
            const num = typeof value === "number" ? value : parseFloat(value);
            if (isNaN(num)) {
                return colConfig.allowInvalid ? "invalid" : false;
            }
        }

        if (typeof colConfig.validator === "function") {
            try {
                return colConfig.validator(value);
            } catch {
                return false;
            }
        }

        return true;
    }
}