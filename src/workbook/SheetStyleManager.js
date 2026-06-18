import { stylePool, DEFAULT_STYLE_ID } from "../styles/index.js";
import { Cell } from "../model/index.js";

/**
 * 工作表样式管理器
 *
 * 负责管理单个工作表（Sheet）的样式体系，包括：
 * - 默认样式（defaultStyle）：所有单元格的基础样式
 * - 行样式（rowStyles）：整行应用的样式
 * - 列样式（colStyles）：整列应用的样式
 * - 单元格样式（cell.styleId）：单个单元格的样式
 *
 * 样式优先级（从低到高）：
 *   defaultStyle → colStyle → rowStyle → cellStyle → cellType默认样式 → cellProps.style
 *
 * 内部维护一个带版本号的缓存机制（#styleCache + #styleCacheVersion），
 * 任何样式变更都会递增版本号，resolveStyle 时检测版本不一致则清空缓存，
 * 避免在每次渲染时重复计算样式合并结果。
 */
export class SheetStyleManager {
    /** 所属工作表引用 */
    #sheet;

    /** 当前工作表的默认样式 ID，初始为全局 DEFAULT_STYLE_ID */
    #defaultStyleId = DEFAULT_STYLE_ID;

    /** 样式解析缓存：key = "realRow,col"，value = 合并后的样式对象 */
    #styleCache = new Map();

    /** 样式缓存版本号，每次样式变更时递增 */
    #styleCacheVersion = 0;

    /** 上次缓存构建时的版本号，用于判断缓存是否过期 */
    #styleCacheFrameVersion = -1;

    /**
     * @param {import("./Sheet.js").Sheet} sheet - 所属工作表实例
     */
    constructor(sheet) {
        this.#sheet = sheet;
    }

    /** 获取当前默认样式 ID */
    get defaultStyleId() {
        return this.#defaultStyleId;
    }

    /**
     * 使样式缓存失效
     *
     * 任何修改样式的操作后都应调用此方法，递增版本号，
     * 使下一次 resolveStyle 时清空并重建缓存。
     */
    invalidateCache() {
        this.#styleCacheVersion++;
    }

    /**
     * 设置整行样式
     * @param {number} row - 实际行号（realRow）
     * @param {number} styleId - 样式 ID（由 stylePool.getStyleId 获得）
     */
    setRowStyle(row, styleId) {
        this.#sheet.rowStyles.set(row, styleId);
        this.invalidateCache();
    }

    /**
     * 设置整列样式
     * @param {number} col - 列号
     * @param {number} styleId - 样式 ID
     */
    setColStyle(col, styleId) {
        this.#sheet.colStyles.set(col, styleId);
        this.invalidateCache();
    }

    /**
     * 设置工作表的默认样式
     * @param {Object} styleObj - 样式对象，将通过 stylePool 转为 ID 存储
     */
    setDefaultStyle(styleObj) {
        this.#defaultStyleId = stylePool.getStyleId(styleObj);
        this.invalidateCache();
    }

    /**
     * 获取当前默认样式对象
     * @returns {Object} 默认样式对象
     */
    getDefaultStyle() {
        return stylePool.getStyle(this.#defaultStyleId);
    }

    /**
     * 设置单个单元格的样式（增量合并）
     *
     * 将新样式与单元格现有样式合并（新样式覆盖同名属性），
     * 然后通过 stylePool 去重获取新 styleId，重新创建 Cell 实例。
     *
     * @param {number} r - 页面行号（pageRow）
     * @param {number} c - 列号
     * @param {Object} styleObj - 要合并的样式属性
     */
    setCellStyle(r, c, styleObj) {
        const realR = this.#sheet.toRealRow(r);
        // 确保行列表尺寸足够容纳目标单元格
        this.#sheet.rowColManager.ensureSize(realR + 1, c + 1);
        const cell = this.#sheet.cellStore.get(realR, c);
        const currentStyleId = cell?.styleId || 0;
        // 获取当前样式对象，styleId 为 0 时表示无自定义样式
        const currentStyle = currentStyleId ? stylePool.getStyle(currentStyleId) : {};
        // 增量合并：新样式覆盖同名属性
        const mergedStyle = { ...currentStyle, ...styleObj };
        const newStyleId = stylePool.getStyleId(mergedStyle);
        const value = cell?.value ?? "";
        // 保留原有 value 和 disabled 状态，仅更新 styleId
        this.#sheet.cellStore.set(realR, c, new Cell(value, newStyleId, cell?.disabled || false));
        this.invalidateCache();
    }

    /**
     * 清除单个单元格的自定义样式
     *
     * 将 styleId 重置为 0（表示无自定义样式，回退到行/列/默认样式），
     * 保留 value 和 disabled 状态。
     *
     * @param {number} r - 页面行号
     * @param {number} c - 列号
     */
    clearCellStyle(r, c) {
        const realR = this.#sheet.toRealRow(r);
        const cell = this.#sheet.cellStore.get(realR, c);
        if (!cell || cell.styleId === 0) return;
        this.#sheet.cellStore.set(realR, c, new Cell(cell.value, 0, cell.disabled));
        this.invalidateCache();
    }

    /**
     * 清除整行样式
     * @param {number} row - 实际行号
     */
    clearRowStyle(row) {
        if (!this.#sheet.rowStyles.has(row)) return;
        this.#sheet.rowStyles.delete(row);
        this.invalidateCache();
    }

    /**
     * 清除整列样式
     * @param {number} col - 列号
     */
    clearColStyle(col) {
        if (!this.#sheet.colStyles.has(col)) return;
        this.#sheet.colStyles.delete(col);
        this.invalidateCache();
    }

    /**
     * 为选区范围设置统一样式
     *
     * 优化策略：
     * - 若范围覆盖所有列（整行选区），则设置行样式而非逐单元格设置
     * - 若范围覆盖所有行（整列选区），则设置列样式而非逐单元格设置
     * - 否则逐单元格设置（跳过禁用单元格）
     *
     * @param {{ topRow: number, topCol: number, bottomRow: number, bottomCol: number }} range - 选区范围
     * @param {Object} styleObj - 样式对象
     */
    setRangeStyle(range, styleObj) {
        const styleId = stylePool.getStyleId(styleObj);
        const { topRow, topCol, bottomRow, bottomCol } = range;
        const rowColManager = this.#sheet.rowColManager;

        // 整行选区优化：范围覆盖所有列时，直接设置行样式
        if (topCol === 0 && bottomCol >= rowColManager.colCount - 1) {
            for (let r = topRow; r <= bottomRow; r++) {
                this.#sheet.rowStyles.set(this.#sheet.toRealRow(r), styleId);
            }
            this.invalidateCache();
            return;
        }

        // 整列选区优化：范围覆盖所有行时，直接设置列样式
        if (topRow === 0 && bottomRow >= rowColManager.rowCount - 1) {
            for (let c = topCol; c <= bottomCol; c++) {
                this.#sheet.colStyles.set(c, styleId);
            }
            this.invalidateCache();
            return;
        }

        // 一般情况：逐单元格设置，跳过禁用单元格
        for (let r = topRow; r <= bottomRow; r++) {
            for (let c = topCol; c <= bottomCol; c++) {
                if (!this.#sheet.isDisabled(r, c)) {
                    this.setCellStyle(r, c, styleObj);
                }
            }
        }
        this.invalidateCache();
    }

    /**
     * 解析单元格的最终合并样式
     *
     * 按优先级从低到高逐层合并：
     *   defaultStyle → colStyle → rowStyle → cellStyle → cellType默认样式 → cellProps.style
     *
     * 使用版本号缓存机制：
     * - 若当前帧版本号（#styleCacheFrameVersion）与最新版本号（#styleCacheVersion）一致，
     *   直接从缓存读取，避免重复计算
     * - 若版本号不一致（样式已变更），清空缓存并重新构建
     *
     * @param {number} r - 页面行号
     * @param {number} c - 列号
     * @returns {Object} 合并后的最终样式对象
     */
    resolveStyle(r, c) {
        const realR = this.#sheet.toRealRow(r);
        const key = `${realR},${c}`;

        // 缓存命中检查：版本号一致时尝试从缓存读取
        if (this.#styleCacheFrameVersion === this.#styleCacheVersion) {
            const cached = this.#styleCache.get(key);
            if (cached !== undefined) return cached;
        } else {
            // 版本号不一致，样式已变更，清空缓存
            this.#styleCacheFrameVersion = this.#styleCacheVersion;
            this.#styleCache.clear();
        }

        // 第 1 层：默认样式（基础）
        const base = stylePool.getStyle(this.#defaultStyleId);
        const colStyleId = this.#sheet.colStyles.get(c);
        const rowStyleId = this.#sheet.rowStyles.get(realR);
        const cell = this.#sheet.cellStore.get(realR, c);
        const cellStyleId = cell?.styleId;

        // 快速路径：无任何自定义样式且无数据绑定和列配置样式时，直接返回默认样式
        if (!colStyleId && !rowStyleId && !cellStyleId && !this.#sheet.cellsFn && !this.#sheet.columnsConfig.get(c)?.style) {
            this.#styleCache.set(key, base);
            return base;
        }

        // 第 2 层：列样式
        let style = base;
        if (colStyleId) style = { ...style, ...stylePool.getStyle(colStyleId) };
        // 第 3 层：行样式
        if (rowStyleId) style = { ...style, ...stylePool.getStyle(rowStyleId) };
        // 第 4 层：单元格样式
        if (cellStyleId) style = { ...style, ...stylePool.getStyle(cellStyleId) };

        // 第 5 层：列类型默认样式（如数字列右对齐等）
        const cellType = this.#sheet.getCellTypeInstance(r, c);
        if (cellType) {
            style = cellType.getDefaultStyle(style);
        }

        // 第 6 层：数据绑定属性中的样式（cells / cell 配置）
        const cellProps = this.#sheet.resolveCellProperties(r, c);
        if (cellProps?.style) style = { ...style, ...cellProps.style };

        this.#styleCache.set(key, style);
        return style;
    }
}
