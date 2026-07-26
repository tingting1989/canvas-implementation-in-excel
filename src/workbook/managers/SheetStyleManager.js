import { stylePool, DEFAULT_STYLE_ID } from "../../model/styles";
import { Cell } from "../../model";
import { StyleChangeRecorder, StyleChangeCommand } from "../../model/command/StyleChangeRecorder.js";
import { STYLE_SCOPE } from "../../constants/enums/StyleScope.js";
import { themeStyleProvider } from "../../theme/index.js";

/**
 * 工作表样式管理器
 *
 * 负责管理单个工作表（Sheet）的样式体系，包括：
 * - 默认样式（defaultStyle）：所有单元格的基础样式
 * - 行样式（rowStyles）：整行应用的样式
 * - 列样式（colStyles）：整列应用的样式
 * - 单元格样式（cell.styleId）：单个单元格的样式
 *
 * 样式优先级（从低到高，后者覆盖前者同名属性）：
 *   第1层: defaultStyle（基础默认样式）
 *   第2层: themeStyle（主题样式，按单元格类型匹配）
 *   第3层: colStyle（列级样式）
 *   第4层: rowStyle（行级样式）
 *   第5层: cellStyle（单元格级样式）
 *   第6层: cellType默认样式（如数字列右对齐）
 *   第7层: cellProps.style（cells/cell 配置中的样式）
 *   第8层: conditionalFormat（条件格式样式）
 *   第9层: dataBinding（数据绑定样式）
 *
 * 缓存机制：
 * - 内部维护 #styleCache（Map）和版本号 #styleCacheVersion
 * - 任何样式变更都递增版本号，resolveStyle 检测版本不一致则清空缓存
 * - 同一渲染帧内，版本号一致时直接从缓存读取，避免重复计算
 *
 * 撤销/重做：
 * - 所有样式修改操作通过 StyleChangeRecorder 记录变更
 * - 调用 buildStyleCommand() 生成可撤销/重做的 Command 对象
 * - Command 内部调用 applyStyleId() 恢复或重做样式
 *
 * 主题订阅：
 * - 构造时订阅 themeStyleProvider，主题切换时自动失效缓存
 * - 销毁时需调用 destroy() 取消订阅，避免内存泄漏
 */
export class SheetStyleManager {
    /** @type {import("../Sheet.js").Sheet} 所属工作表引用 */
    #sheet;

    /** @type {Map<number, number>} 行级样式映射：行号 → styleId */
    #rowStyles = new Map();

    /** @type {Map<number, number>} 列级样式映射：列号 → styleId */
    #colStyles = new Map();

    /** @type {number} 当前工作表的默认样式 ID，初始为全局 DEFAULT_STYLE_ID */
    #defaultStyleId = DEFAULT_STYLE_ID;

    /** @type {Map<string, Object>} 样式解析缓存：key = "row,col"，value = 合并后的样式对象 */
    #styleCache = new Map();

    /** @type {number} 样式缓存版本号，每次样式变更时递增 */
    #styleCacheVersion = 0;

    /** @type {number} 上次缓存构建时的版本号，用于判断缓存是否过期 */
    #styleCacheFrameVersion = -1;

    /** @type {StyleChangeRecorder} 样式变更记录器，用于 Command 化撤销/重做 */
    #recorder = new StyleChangeRecorder();

    /** @type {Function|null} 主题变化取消订阅函数 */
    #unsubscribeTheme = null;

    /**
     * 创建工作表样式管理器
     *
     * 构造时自动订阅主题变化，主题切换时调用 invalidateCache() 失效缓存。
     * 销毁时需调用 destroy() 取消订阅。
     *
     * @param {import("../Sheet.js").Sheet} sheet - 所属工作表实例
     */
    constructor(sheet) {
        this.#sheet = sheet;

        this.#unsubscribeTheme = themeStyleProvider.subscribe(() => {
            this.invalidateCache();
        });
    }

    /**
     * 销毁方法，清理订阅等资源
     *
     * 在 Sheet 被销毁时应调用此方法，取消主题订阅，避免内存泄漏。
     */
    destroy() {
        if (this.#unsubscribeTheme) {
            this.#unsubscribeTheme();
            this.#unsubscribeTheme = null;
        }
    }

    /**
     * 获取行级样式 Map
     *
     * 供 RowColSync 等内部模块在行列移动/删除时重映射键。
     * 直接返回内部 Map 引用，外部可修改。
     *
     * @type {Map<number, number>}
     */
    get rowStyles() {
        return this.#rowStyles;
    }

    /**
     * 获取列级样式 Map
     *
     * 供 RowColSync 等内部模块在行列移动/删除时重映射键。
     * 直接返回内部 Map 引用，外部可修改。
     *
     * @type {Map<number, number>}
     */
    get colStyles() {
        return this.#colStyles;
    }

    /**
     * 获取当前默认样式 ID
     *
     * @type {number}
     */
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
     *
     * 通过 StyleChangeRecorder 记录变更（oldStyleId → newStyleId），
     * 以支持撤销/重做操作。
     *
     * @param {number} row - 实际行号（realRow，0-based）
     * @param {number} styleId - 样式 ID（由 stylePool.getStyleId 获得）
     */
    setRowStyle(row, styleId) {
        const oldStyleId = this.#rowStyles.get(row) || 0;
        this.#recorder.record("row", row, oldStyleId, styleId);
        this.#rowStyles.set(row, styleId);
        this.invalidateCache();
    }

    /**
     * 设置整列样式
     *
     * 通过 StyleChangeRecorder 记录变更，以支持撤销/重做。
     *
     * @param {number} col - 列号（0-based）
     * @param {number} styleId - 样式 ID（由 stylePool.getStyleId 获得）
     */
    setColStyle(col, styleId) {
        const oldStyleId = this.#colStyles.get(col) || 0;
        this.#recorder.record("col", col, oldStyleId, styleId);
        this.#colStyles.set(col, styleId);
        this.invalidateCache();
    }

    /**
     * 设置工作表的默认样式
     *
     * 将传入的样式对象与当前默认样式合并（新属性覆盖同名属性），
     * 通过 stylePool 去重获取新 styleId。
     *
     * @param {Object} styleObj - 样式对象，将与当前默认样式合并
     */
    setDefaultStyle(styleObj) {
        const current = this.#defaultStyleId ? stylePool.getStyle(this.#defaultStyleId) : {};
        const merged = { ...current, ...styleObj };
        this.#defaultStyleId = stylePool.getStyleId(merged);
        this.invalidateCache();
    }

    /**
     * 获取当前默认样式对象
     *
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
     * 同时确保行列尺寸足够容纳该单元格。
     *
     * @param {number} r - 页面行号（pageRow，0-based）
     * @param {number} c - 列号（0-based）
     * @param {Object} styleObj - 要合并的样式属性
     */
    setCellStyle(r, c, styleObj) {
        this.#sheet.rowColManager.ensureSize(r + 1, c + 1);
        const cell = this.#sheet.cellStore.get(r, c);
        const currentStyleId = cell?.styleId || 0;

        const currentStyle = currentStyleId ? stylePool.getStyle(currentStyleId) : {};

        const mergedStyle = { ...currentStyle, ...styleObj };
        const newStyleId = stylePool.getStyleId(mergedStyle);
        const value = cell?.value ?? "";

        this.#recorder.record("cell", `${r},${c}`, currentStyleId, newStyleId);
        this.#sheet.cellStore.set(r, c, new Cell(value, newStyleId, cell?.disabled || false));
        this.invalidateCache();
    }

    /**
     * 清除单个单元格的自定义样式
     *
     * 将 styleId 重置为 0（表示无自定义样式，回退到行/列/默认样式），
     * 保留 value 和 disabled 状态。
     * 若单元格不存在或已无自定义样式，不做任何操作。
     *
     * @param {number} r - 页面行号（0-based）
     * @param {number} c - 列号（0-based）
     */
    clearCellStyle(r, c) {
        const cell = this.#sheet.cellStore.get(r, c);
        if (!cell || cell.styleId === 0) return;
        this.#sheet.cellStore.set(r, c, new Cell(cell.value, 0, cell.disabled));
        this.invalidateCache();
    }

    /**
     * 清除整行样式
     *
     * 若该行无自定义样式，不做任何操作。
     *
     * @param {number} row - 实际行号（0-based）
     */
    clearRowStyle(row) {
        if (!this.#rowStyles.has(row)) return;
        this.#rowStyles.delete(row);
        this.invalidateCache();
    }

    /**
     * 清除整列样式
     *
     * 若该列无自定义样式，不做任何操作。
     *
     * @param {number} col - 列号（0-based）
     */
    clearColStyle(col) {
        if (!this.#colStyles.has(col)) return;
        this.#colStyles.delete(col);
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
        const { topRow, topCol, bottomRow, bottomCol } = range;
        const rowColManager = this.#sheet.rowColManager;

        if (topCol === 0 && bottomCol >= rowColManager.colCount - 1) {
            for (let r = topRow; r <= bottomRow; r++) {
                const existingId = this.#rowStyles.get(r);
                const existing = existingId ? stylePool.getStyle(existingId) : {};
                const merged = { ...existing, ...styleObj };
                const newId = stylePool.getStyleId(merged);
                this.#recorder.record("row", r, existingId || 0, newId);
                this.#rowStyles.set(r, newId);
            }
            this.invalidateCache();
            return;
        }

        if (topRow === 0 && bottomRow >= rowColManager.rowCount - 1) {
            for (let c = topCol; c <= bottomCol; c++) {
                const existingId = this.#colStyles.get(c);
                const existing = existingId ? stylePool.getStyle(existingId) : {};
                const merged = { ...existing, ...styleObj };
                const newId = stylePool.getStyleId(merged);
                this.#recorder.record("col", c, existingId || 0, newId);
                this.#colStyles.set(c, newId);
            }
            this.invalidateCache();
            return;
        }

        const accessor = this.#sheet.cellDataAccessor;
        accessor.forEach(topRow, topCol, bottomRow, bottomCol, (r, c) => {
            if (!this.#sheet.isDisabled(r, c)) {
                this.setCellStyle(r, c, styleObj);
            }
        });
        this.invalidateCache();
    }

    /**
     * 清除选区范围内的所有样式
     *
     * 同时清除范围涉及的行级样式和范围内每个单元格的自定义样式。
     * 列级样式不在清除范围内（列样式通常跨整个列，不应因局部选区而清除）。
     *
     * @param {{ topRow: number, topCol: number, bottomRow: number, bottomCol: number }} range - 选区范围
     */
    clearRangeStyle(range) {
        const { topRow, topCol, bottomRow, bottomCol } = range;
        const accessor = this.#sheet.cellDataAccessor;

        for (let r = topRow; r <= bottomRow; r++) {
            this.#rowStyles.delete(r);
        }

        accessor.forEach(topRow, topCol, bottomRow, bottomCol, (r, c) => {
            this.clearCellStyle(r, c);
        });
        this.invalidateCache();
    }

    /**
     * 根据单元格类型获取对应的主题样式
     *
     * 将单元格类型名称映射到主题样式键，再通过 themeStyleProvider 获取样式。
     * 未匹配的类型回退到 "cell.default"。
     *
     * 类型→主题样式映射：
     * - hyperlink → cell.hyperlink
     * - numeric  → cell.numeric
     * - text     → cell.text
     * - textarea → cell.textarea
     * - date     → cell.date
     * - checkbox → cell.checkbox
     * - selected → cell.selected
     * - 其他     → cell.default
     *
     * @param {Object} cellType - 单元格类型实例（需有 name 属性）
     * @returns {Object} 主题样式对象
     */
    #getThemeStyleByCellType(cellType) {
        const typeToStyleMap = {
            hyperlink: "cell.hyperlink",
            numeric: "cell.numeric",
            text: "cell.text",
            textarea: "cell.textarea",
            date: "cell.date",
            checkbox: "cell.checkbox",
            selected: "cell.selected",
        };
        const styleType = typeToStyleMap[cellType?.name] || "cell.default";
        return themeStyleProvider.getStyle(styleType);
    }

    /**
     * 解析单元格的最终合并样式
     *
     * 按优先级从低到高逐层合并（后者覆盖前者同名属性）：
     *   第1层: defaultStyle（基础默认样式）
     *   第2层: themeStyle（主题样式，按单元格类型匹配）
     *   第3层: colStyle（列级样式）
     *   第4层: rowStyle（行级样式）
     *   第5层: cellStyle（单元格级样式）
     *   第6层: cellType默认样式（如数字列右对齐）
     *   第7层: cellProps.style（cells/cell 配置中的样式）
     *   第8层: conditionalFormat（条件格式样式）
     *   第9层: dataBinding（数据绑定样式）
     *
     * 缓存机制：
     * - 若 #styleCacheFrameVersion === #styleCacheVersion，尝试从缓存读取
     * - 若版本号不一致（样式已变更），清空缓存并重新构建
     * - 快速路径：无任何自定义样式时，仅合并 defaultStyle + themeStyle + cellType默认样式
     *
     * @param {number} r - 页面行号（0-based）
     * @param {number} c - 列号（0-based）
     * @returns {Object} 合并后的最终样式对象
     */
    resolveStyle(r, c) {
        const key = `${r},${c}`;

        if (this.#styleCacheFrameVersion === this.#styleCacheVersion) {
            const cached = this.#styleCache.get(key);
            if (cached !== undefined) return cached;
        } else {
            this.#styleCacheFrameVersion = this.#styleCacheVersion;
            this.#styleCache.clear();
        }

        const base = stylePool.getStyle(this.#defaultStyleId);
        const colStyleId = this.#colStyles.get(c);
        const rowStyleId = this.#rowStyles.get(r);
        const cell = this.#sheet.cellStore.get(r, c);
        const cellStyleId = cell?.styleId;

        if (
            !colStyleId &&
            !rowStyleId &&
            !cellStyleId &&
            !this.#sheet.cellsFn &&
            !this.#sheet.columnsConfig.get(c)?.style &&
            !this.#sheet.hasConditionalRules() &&
            !this.#sheet.hasDataBindings()
        ) {
            const cellType = this.#sheet.getCellTypeInstance(r, c);
            const themeStyle = this.#getThemeStyleByCellType(cellType);
            let result = { ...base, ...themeStyle };

            if (cellType) {
                result = cellType.getDefaultStyle(result);
            }

            this.#styleCache.set(key, result);
            return result;
        }

        const cellType = this.#sheet.getCellTypeInstance(r, c);

        const themeStyle = this.#getThemeStyleByCellType(cellType);

        let style = { ...base, ...themeStyle };
        if (colStyleId) style = { ...style, ...stylePool.getStyle(colStyleId) };

        if (rowStyleId) style = { ...style, ...stylePool.getStyle(rowStyleId) };

        if (cellStyleId) style = { ...style, ...stylePool.getStyle(cellStyleId) };

        if (cellType) {
            style = cellType.getDefaultStyle(style);
        }

        const cellProps = this.#sheet.resolveCellProperties(r, c);
        if (cellProps?.style) style = { ...style, ...cellProps.style };

        const cfStyleId = this.#sheet.matchConditionalStyle(r, c, cell);
        if (cfStyleId) style = { ...style, ...stylePool.getStyle(cfStyleId) };

        const dbStyleId = this.#sheet.getDataBindStyle(r, c);
        if (dbStyleId) style = { ...style, ...stylePool.getStyle(dbStyleId) };

        this.#styleCache.set(key, style);
        return style;
    }

    /**
     * 按作用域应用样式 ID（供 Command 撤销/重做调用）
     *
     * 根据 STYLE_SCOPE 类型将 styleId 应用到行、列或单元格：
     * - ROW：设置/删除行级样式（styleId=0 时删除）
     * - COL：设置/删除列级样式（styleId=0 时删除）
     * - CELL：设置单元格级样式（key 格式为 "r,c"）
     *
     * 此方法不经过 StyleChangeRecorder 记录，由 Command 直接调用。
     *
     * @param {string} type - 样式作用域，值为 STYLE_SCOPE.ROW / STYLE_SCOPE.COL / STYLE_SCOPE.CELL
     * @param {number|string} key - 行号 / 列号 / "r,c" 格式的单元格坐标
     * @param {number} styleId - 要应用的样式 ID（0 表示删除/清除）
     */
    applyStyleId(type, key, styleId) {
        if (type === STYLE_SCOPE.ROW) {
            if (styleId === 0) {
                this.#rowStyles.delete(key);
            } else {
                this.#rowStyles.set(key, styleId);
            }
        } else if (type === STYLE_SCOPE.COL) {
            if (styleId === 0) {
                this.#colStyles.delete(key);
            } else {
                this.#colStyles.set(key, styleId);
            }
        } else if (type === STYLE_SCOPE.CELL) {
            const [r, c] = key.split(",").map(Number);
            const cell = this.#sheet.cellStore.get(r, c);
            if (cell) {
                this.#sheet.cellStore.set(r, c, new Cell(cell.value, styleId, cell.disabled, cell.formula));
            }
        }
        this.invalidateCache();
    }

    /**
     * 构建样式变更命令
     *
     * 将 StyleChangeRecorder 中累积的变更记录打包为 StyleChangeCommand，
     * 支持 undo() / redo() 操作。
     * 构建后自动清空记录器。
     *
     * @returns {StyleChangeCommand|null} 样式变更命令，无变更时返回 null
     */
    buildStyleCommand() {
        return this.#recorder.buildCommand(this);
    }

    /**
     * 重置样式变更记录器
     *
     * 清空所有已记录但未构建为 Command 的变更。
     * 通常在操作被取消时调用。
     */
    resetRecorder() {
        this.#recorder.reset();
    }
}
