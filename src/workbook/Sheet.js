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
    BatchCommand,
} from "../model/index.js";
import { RowColManager } from "../core/RowColManager.js";
import { CONFIG } from "../constants/config";
import { getColumnTypeFromConfig, resolveCellType } from "../types/index.js";

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
    /** 批量模式：暂存子命令 */
    #batchCommands = [];
    /** 是否处于批量模式 */
    #inBatch = false;
    /** 当前渲染帧的缓存版本，帧内相同版本直接命中缓存 */
    #styleCacheFrameVersion = -1;

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
        /** 条件格式规则列表 */
        this.conditionalRules = [];
        /** 行级样式映射 row → styleId */
        this.rowStyles = new Map();
        /** 列级样式映射 col → styleId */
        this.colStyles = new Map();
        /** 数据绑定映射 col → mapperFn(cellValue) → styleId */
        this.dataBindings = new Map();
        /** 单元格级别类型配置映射 key("r,c") → {name: string, options: object} */
        this.cellTypes = new Map();
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
        /**
         * 列配置映射 col → ColumnConfig（参考 Handsontable columns 选项）
         *
         * ColumnConfig 支持的属性：
         * - type: 'text' | 'numeric' | 'date' | 'boolean' | 'select'
         * - width: number
         * - style: object
         * - disabled / readOnly: boolean
         * - numericFormat: { pattern: string }  (type='numeric')
         * - dateFormat: { pattern: string }      (type='date')
         * - labels: { true: string, false: string } (type='boolean')
         * - source: Array                        (type='select')
         * - min / max: number|string             (type='numeric'/'date')
         * - maxLength: number                    (type='text')
         * - validator: Function                  (value) => boolean | string
         * - allowInvalid: boolean
         */
        this.columnsConfig = new Map();

        /** 列头配置：true→A/B/C... | string[] | Function(col) */
        this.colHeaders = true;
        /** 行头配置：true→1/2/3... | string[] | Function(row) */
        this.rowHeaders = true;
        /**
         * 嵌套表头配置
         *
         * 参考 Handsontable nestedHeaders API：
         *   二维数组，每行对应一层表头，每列的元素定义该层对应列的标签。
         *   元素可以是：
         *     - 字符串：直接作为该表头单元格的文本
         *     - 对象：{ label: string, colspan: number }
         *
         *   示例：
         *     nestedHeaders: [
         *       ['A', {label: 'Group B', colspan: 3}, 'C'],
         *       ['A1', 'B1', 'B2', 'B3', 'C1'],
         *     ]
         *
         *   当配置了 nestedHeaders 时，它优先于 colHeaders，但 colHeaders
         *   仍可用于提供最底层（叶子层）的标签。
         *
         * @type {Array<Array<string|{label:string, colspan:number}>>|null}
         */
        this.nestedHeaders = null;

        if (renderEngine) this.#renderEngine = renderEngine;
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
    }

    /** 标记指定单元格需要重绘 */
    #invalidateCell(r, c) {
        // r 可能是真实行号（realR），需要转为页面行号
        // TileRenderer.invalidateCell → getRowY 在分页模式下期望页面行号
        const pageRow = this.toPageRow(r);
        this.#renderEngine?.invalidateCell?.(pageRow, c);
        this.#styleCache.delete(`${r},${c}`);
        this.#styleCacheVersion++;
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
    // 样式操作
    // ============================================================

    /** 设置行级样式 */
    setRowStyle(row, styleId) {
        this.rowStyles.set(row, styleId);
        this.#invalidateAll();
    }

    /** 设置列级样式 */
    setColStyle(col, styleId) {
        this.colStyles.set(col, styleId);
        this.#invalidateAll();
    }

    /** 设置工作表默认样式 */
    setDefaultStyle(styleObj) {
        this.#defaultStyleId = stylePool.getStyleId(styleObj);
        this.#invalidateAll();
    }

    /** @returns {object} 默认样式对象 */
    getDefaultStyle() {
        return stylePool.getStyle(this.#defaultStyleId);
    }

    /**
     * 设置单个单元格样式（保留原有值，仅更新样式）
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {object} styleObj
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

    /** 清除单元格样式，保留值和禁用状态 */
    clearCellStyle(r, c) {
        const realR = this.toRealRow(r);
        const cell = this.cellStore.get(realR, c);
        if (!cell || cell.styleId === 0) return;
        this.cellStore.set(realR, c, new Cell(cell.value, 0, cell.disabled));
        this.#invalidateAll();
    }

    /** 清除行级样式 */
    clearRowStyle(row) {
        if (!this.rowStyles.has(row)) return;
        this.rowStyles.delete(row);
        this.#invalidateAll();
    }

    /** 清除列级样式 */
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
     * 3. 混合选区 → 逐单元格设置，仅调用一次 invalidateAll
     *
     * @param {{ topRow: number, topCol: number, bottomRow: number, bottomCol: number }} range
     * @param {object} styleObj
     */
    setRangeStyle(range, styleObj) {
        const styleId = stylePool.getStyleId(styleObj);
        const { topRow, topCol, bottomRow, bottomCol } = range;

        // 整行覆盖
        if (topCol === 0 && bottomCol >= this.rowColManager.colCount - 1) {
            for (let r = topRow; r <= bottomRow; r++) {
                this.rowStyles.set(this.toRealRow(r), styleId);
            }
            this.#invalidateAll();
            return;
        }

        // 整列覆盖
        if (topRow === 0 && bottomRow >= this.rowColManager.rowCount - 1) {
            for (let c = topCol; c <= bottomCol; c++) {
                this.colStyles.set(c, styleId);
            }
            this.#invalidateAll();
            return;
        }

        // 混合选区
        for (let r = topRow; r <= bottomRow; r++) {
            for (let c = topCol; c <= bottomCol; c++) {
                if (!this.isDisabled(r, c)) {
                    this.setCellStyle(r, c, styleObj);
                }
            }
        }
        this.#invalidateAll();
    }

    /** 获取单元格最终解析样式 */
    getCellStyle(r, c) {
        return this.resolveStyle(r, c);
    }

    // ============================================================
    // 条件格式 & 数据绑定
    // ============================================================

    /** 添加条件格式规则 */
    addConditionalRule(range, conditionFn, styleId) {
        this.conditionalRules.push(new ConditionalRule(range, conditionFn, styleId));
    }

    /** 匹配条件格式样式 */
    matchConditionalStyle(r, c, cell) {
        const realR = this.toRealRow(r);
        for (const rule of this.conditionalRules) {
            if (rule.match(realR, c, cell)) return rule.styleId;
        }
        return null;
    }

    /** 绑定数据样式映射 */
    bindDataStyle(col, mapperFn) {
        this.dataBindings.set(col, mapperFn);
    }

    /** 获取数据绑定样式 */
    getDataBindStyle(r, c) {
        const realR = this.toRealRow(r);
        const fn = this.dataBindings.get(c);
        if (!fn) return null;
        const cell = this.cellStore.get(realR, c);
        return fn(cell?.value);
    }

    // ============================================================
    // 行列头标签
    // ============================================================

    /** 获取列头标签 */
    getColHeader(col) {
        return this.#resolveHeader(this.colHeaders, col, this.#defaultColLabel);
    }

    /** 获取行头标签 */
    getRowHeader(row) {
        return this.#resolveHeader(this.rowHeaders, row, (i) => String(i + 1));
    }

    /**
     * 统一的行/列头解析
     * @param {true|string[]|Function|null} config
     * @param {number} index
     * @param {(index: number) => string} defaultFn
     * @returns {string}
     */
    #resolveHeader(config, index, defaultFn) {
        if (config === true || config == null) return defaultFn(index);
        if (Array.isArray(config)) return index < config.length ? config[index] : defaultFn(index);
        if (typeof config === "function") return config(index);
        return defaultFn(index);
    }

    /**
     * 默认列标签：0→A, 1→B, ..., 25→Z, 26→AA, ...
     * @param {number} col - 列号
     * @returns {string}
     */
    #defaultColLabel(col) {
        let label = "";
        let n = col + 1;
        while (n > 0) {
            n = n - 1;
            label = String.fromCharCode(65 + (n % 26)) + label;
            n = Math.floor(n / 26);
        }
        return label || "A";
    }

    // ============================================================
    // 嵌套表头
    // ============================================================

    /**
     * 获取嵌套表头的总层数
     * @returns {number} 0 表示未启用嵌套表头
     */
    getNestedHeaderRowCount() {
        return Array.isArray(this.nestedHeaders) ? this.nestedHeaders.length : 0;
    }

    /**
     * 获取嵌套表头中指定层、指定列的表头信息
     *
     * 返回值可能是：
     *   - null：该层该列被上方 colspan 跨越（应绘制空单元格）
     *   - { label: string, colspan: number }：带跨列的表头
     *   - { label: string, colspan: 1 }：普通单列表头
     *
     * @param {number} rowIndex - 嵌套层索引（0=顶层）
     * @param {number} col - 数据列号
     * @returns {{label: string, colspan: number}|null}
     */
    getNestedColHeader(rowIndex, col) {
        if (!this.nestedHeaders || rowIndex >= this.nestedHeaders.length) return null;

        const row = this.nestedHeaders[rowIndex];
        if (!Array.isArray(row)) return null;

        // 遍历该层的元素，找到 col 对应的表头定义
        // 由于 colspan 的存在，需要跟踪当前已消费的列数
        let consumed = 0;
        for (let i = 0; i < row.length; i++) {
            const item = row[i];
            const label = typeof item === "string" ? item : (item?.label ?? "");
            const colspan = item && typeof item === "object" && item.colspan ? item.colspan : 1;

            if (col >= consumed && col < consumed + colspan) {
                return { label, colspan };
            }
            consumed += colspan;
        }

        // col 超出该层定义范围，由默认 colHeaders 兜底
        return null;
    }

    /**
     * 获取表头总高度（像素）
     * 嵌套表头时 = HEADER_HEIGHT × 嵌套层数，否则 = HEADER_HEIGHT
     *
     * @returns {number}
     */
    getHeaderHeight() {
        const rows = this.getNestedHeaderRowCount() || CONFIG.NESTED_HEADER_ROWS;
        return rows * CONFIG.HEADER_HEIGHT;
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

        // 帧级缓存命中
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

        // 快速路径：无任何额外样式 → 直接返回 base
        if (!colStyleId && !rowStyleId && !cellStyleId && !this.cellsFn && !this.columnsConfig.get(c)?.style) {
            this.#styleCache.set(key, base);
            return base;
        }

        let style = base;
        if (colStyleId) style = { ...style, ...stylePool.getStyle(colStyleId) };
        if (rowStyleId) style = { ...style, ...stylePool.getStyle(rowStyleId) };
        if (cellStyleId) style = { ...style, ...stylePool.getStyle(cellStyleId) };

        // 类型系统默认样式（如 numeric 右对齐、date 居中、boolean 居中等）
        const cellType = this.getCellTypeInstance(r, c);
        if (cellType) {
            style = cellType.getDefaultStyle(style);
        }

        // cellsFn 动态属性（优先级最高）
        const cellProps = this.resolveCellProperties(r, c);
        if (cellProps?.style) style = { ...style, ...cellProps.style };

        this.#styleCache.set(key, style);
        return style;
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
    }

    /** 在指定位置插入列 */
    insertCol(atCol) {
        if (!this.#isValidIndex(atCol, CONFIG.MAX_COLS)) return;
        this.#dispatchToSubSystems("insertCol", atCol);
    }

    /** 删除指定行 */
    deleteRow(atRow) {
        if (!this.#isValidIndex(atRow, CONFIG.MAX_ROWS)) return;
        this.#dispatchToSubSystems("deleteRow", atRow);
    }

    /** 删除指定列 */
    deleteCol(atCol) {
        if (!this.#isValidIndex(atCol, CONFIG.MAX_COLS)) return;
        this.#dispatchToSubSystems("deleteCol", atCol);
    }

    /** 移动列：将 fromCol 的数据移到 toCol 位置，中间列自动平移 */
    moveCol(fromCol, toCol) {
        if (fromCol === toCol || fromCol < 0 || toCol < 0) return;
        if (fromCol >= CONFIG.MAX_COLS || toCol >= CONFIG.MAX_COLS) return;

        this.#dispatchToSubSystems("moveCol", fromCol, toCol);

        // 移动列头标签
        this.#shiftArray(this.colHeaders, fromCol, toCol);

        // 同步更新列级别配置 Map
        for (const map of [this.columnsConfig, this.colStyles, this.dataBindings]) {
            this.#shiftMapIndex(map, fromCol, toCol);
        }

        // 同步更新单元格级别类型配置 cellTypes
        this.#shiftCellTypesIndex("col", fromCol, toCol);

        // 同步更新嵌套表头（nestedHeaders）
        this.#shiftNestedHeaders(fromCol, toCol);

        this.#invalidateAll();
    }

    /** 移动行：将 fromRow 的数据移到 toRow 位置，中间行自动平移 */
    moveRow(fromRow, toRow) {
        if (fromRow === toRow || fromRow < 0 || toRow < 0) return;
        if (fromRow >= CONFIG.MAX_ROWS || toRow >= CONFIG.MAX_ROWS) return;

        this.#dispatchToSubSystems("moveRow", fromRow, toRow);

        // 移动行头标签
        this.#shiftArray(this.rowHeaders, fromRow, toRow);

        // 同步更新行级别配置 Map
        this.#shiftMapIndex(this.rowStyles, fromRow, toRow);

        // 同步更新单元格级别类型配置 cellTypes
        this.#shiftCellTypesIndex("row", fromRow, toRow);

        this.#invalidateAll();
    }

    // ---- 行列操作辅助 ----

    /**
     * 将操作分发到三个子系统
     * @param {"insertRow"|"insertCol"|"deleteRow"|"deleteCol"|"moveRow"|"moveCol"} method
     * @param  {...number} args
     */
    #dispatchToSubSystems(method, ...args) {
        this.rowColManager[method](...args);
        this.cellStore[method](...args);
        this.mergeManager[method](...args);
        this.#invalidateAll();
    }

    /** @param {number} index @param {number} max @returns {boolean} */
    #isValidIndex(index, max) {
        return index >= 0 && index < max;
    }

    /**
     * 平移数组元素（用于 colHeaders / rowHeaders）
     * @param {Array|true|Function|null} arr
     * @param {number} from
     * @param {number} to
     */
    #shiftArray(arr, from, to) {
        if (!Array.isArray(arr) || arr.length <= Math.max(from, to)) return;
        const [item] = arr.splice(from, 1);
        arr.splice(to, 0, item);
    }

    /**
     * 平移嵌套表头（nestedHeaders）以匹配列拖拽后的新列顺序
     *
     * 策略：展开 → 平移 → 重新打包
     * 1. 将每层按 colspan 展开为逐列标签
     * 2. 执行与数据列相同的数组平移操作
     * 3. 将连续相同标签重新打包为 colspan 对象
     *
     * @param {number} fromCol - 源列号
     * @param {number} toCol - 目标列号
     */
    #shiftNestedHeaders(fromCol, toCol) {
        if (!Array.isArray(this.nestedHeaders) || this.nestedHeaders.length === 0) return;

        for (let layerIdx = 0; layerIdx < this.nestedHeaders.length; layerIdx++) {
            const layer = this.nestedHeaders[layerIdx];
            if (!Array.isArray(layer) || layer.length === 0) continue;

            // 1. 按 colspan 展开为逐列标签数组
            const flat = [];
            for (const item of layer) {
                const isObj = typeof item === "object" && item !== null;
                const label = isObj ? (item.label ?? "") : String(item);
                const colspan = isObj && typeof item.colspan === "number" ? item.colspan : 1;
                for (let i = 0; i < colspan; i++) {
                    flat.push(label);
                }
            }

            // 2. 执行与数据列相同的位置平移
            //    移除 fromCol 处的元素，插入到 toCol 处
            if (fromCol < flat.length) {
                const [moved] = flat.splice(fromCol, 1);
                flat.splice(toCol, 0, moved);
            }

            // 3. 重新打包：连续相同标签合并为 colspan > 1
            const repacked = [];
            let i = 0;
            while (i < flat.length) {
                const label = flat[i];
                let span = 1;
                while (i + span < flat.length && flat[i + span] === label) {
                    span++;
                }
                if (span === 1) {
                    repacked.push(label);
                } else {
                    repacked.push({ label, colspan: span });
                }
                i += span;
            }
            this.nestedHeaders[layerIdx] = repacked;
        }
    }

    /**
     * 平移 Map 中指定索引的键（通用行列均可）
     * 将 from 的 entry 移到 to，中间索引平移
     * @param {Map<number, any>} map
     * @param {number} from
     * @param {number} to
     */
    #shiftMapIndex(map, from, to) {
        const moved = [];
        for (const [index, val] of map) {
            const newIndex = this.#calcShiftedIndex(index, from, to);
            if (newIndex !== index) moved.push({ old: index, new: newIndex, val });
        }
        for (const { old: oldIndex } of moved) map.delete(oldIndex);
        for (const { new: newIndex, val } of moved) map.set(newIndex, val);
    }

    /**
     * 平移 cellTypes Map 中 key 的行/列索引
     * cellTypes key 格式为 "r,c"
     * @param {"row"|"col"} axis
     * @param {number} from
     * @param {number} to
     */
    #shiftCellTypesIndex(axis, from, to) {
        const moved = [];
        for (const [key, val] of this.cellTypes) {
            const [r, c] = key.split(",").map(Number);
            const oldAxisVal = axis === "row" ? r : c;
            const newAxisVal = this.#calcShiftedIndex(oldAxisVal, from, to);
            if (newAxisVal !== oldAxisVal) {
                const newKey = axis === "row" ? `${newAxisVal},${c}` : `${r},${newAxisVal}`;
                moved.push({ oldKey: key, newKey, val });
            }
        }
        for (const { oldKey } of moved) this.cellTypes.delete(oldKey);
        for (const { newKey, val } of moved) this.cellTypes.set(newKey, val);
    }

    /**
     * 计算平移后的索引值
     * @param {number} index - 当前索引
     * @param {number} from - 源位置
     * @param {number} to - 目标位置
     * @returns {number}
     */
    #calcShiftedIndex(index, from, to) {
        if (index === from) return to;
        if (from < to) {
            return index > from && index <= to ? index - 1 : index;
        }
        return index >= to && index < from ? index + 1 : index;
    }

    // ============================================================
    // 列类型配置
    // ============================================================

    /** 获取指定列的配置 */
    getColumnConfig(col) {
        return this.columnsConfig.get(col) || null;
    }

    /** 获取指定列的类型字符串，默认 'text' */
    getColumnType(col) {
        return this.columnsConfig.get(col)?.type || "text";
    }

    /**
     * 获取指定列的 ColumnType 实例（仅列级别，忽略单元格级别）
     * @param {number} col
     * @returns {import("../types/ColumnType.js").ColumnType}
     */
    getColumnTypeInstance(col) {
        return getColumnTypeFromConfig(this.columnsConfig.get(col));
    }

    /**
     * 获取指定单元格的类型实例（ColumnType）
     *
     * 优先级：cellTypes Map > columnsConfig Map > 默认 text 类型
     * 这是所有格式化/验证/解析/样式路由的统一入口。
     *
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {import("../types/ColumnType.js").ColumnType}
     */
    getCellTypeInstance(r, c) {
        const realR = this.toRealRow(r);
        return resolveCellType(realR, c, this.cellTypes, this.columnsConfig);
    }

    /**
     * 应用 columns 配置
     * 遍历列配置数组，逐列应用属性
     *
     * @param {Array<Function|object>} columnsConfig
     *   数组元素为对象：直接作为该列配置
     *   数组元素为函数：(col) => ColumnConfig，动态计算列配置
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

    // ============================================================
    // 类型系统委托：格式化 / 验证 / 解析
    // ============================================================

    /**
     * 格式化单元格显示值
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {*} value - 原始值
     * @returns {string}
     */
    formatCellValue(r, c, value) {
        if (value === undefined || value === null) return "";
        const cellType = this.getCellTypeInstance(r, c);
        return cellType ? cellType.format(value) : String(value);
    }

    /**
     * 验证单元格值（类型系统 + 自定义 validator）
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {*} value
     * @returns {boolean|string}
     */
    validateCellValue(r, c, value) {
        const cellType = this.getCellTypeInstance(r, c);
        if (cellType) {
            const result = cellType.validate(value);
            if (result !== true) return result;
        }

        const colConfig = this.columnsConfig.get(c);
        if (colConfig && typeof colConfig.validator === "function") {
            try {
                return colConfig.validator(value);
            } catch {
                return false;
            }
        }

        return true;
    }

    /**
     * 解析用户输入值
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {string} input - 用户输入的原始字符串
     * @returns {*}
     */
    parseCellValue(r, c, input) {
        if (input === "" || input === undefined || input === null) return "";
        const cellType = this.getCellTypeInstance(r, c);
        return cellType ? cellType.parse(input) : input;
    }
}
