import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

const CACHE_TTL = 5000;

/**
 * 下拉列表数据源解析器
 *
 * 支持三种 Source 模式：
 * 1. **static** — 静态数组：`['选项1', '选项2', '选项3']`
 * 2. **dynamic** — 动态区域引用：`'=Sheet1!$A$1:$A$10'` 或 `'A1:A10'`
 * 3. **computed** — 计算公式：`'=UNIQUE(Data!A:A)'`（Phase 3+，本期不实现）
 *
 * 动态引用支持格式：
 * - `"A1:A10"` — 同表区域
 * - `"Sheet2!A1:A10"` — 跨表区域
 * - `"$A$1:$A$10"` — 绝对引用（$ 符号自动去除）
 *
 * @example
 * const resolver = new ListSourceResolver(cellStore, sheetManager);
 *
 * // 静态
 * const opts1 = await resolver.resolve(['男', '女', '其他']);
 *
 * // 动态
 * const opts2 = await resolver.resolve('=Sheet1!$A$1:$A$10');
 */
export class ListSourceResolver {
    /** @type {Object|null} CellStore 实例 */
    #cellStore = null;

    /** @type {Object|null} SheetManager 实例 */
    #sheetManager = null;

    /** @type {Map<string, {values: string[], timestamp: number}>} 解析缓存 */
    #cache = new Map();

    /** @type {Map<string, Set<Function>>} 区域变化监听器 */
    #watchers = new Map();

    /**
     * 构造解析器
     *
     * @param {Object} cellStore - CellStore 实例
     * @param {Object} [sheetManager=null] - SheetManager 实例（跨表引用需要）
     */
    constructor(cellStore, sheetManager = null) {
        this.#cellStore = cellStore;
        this.#sheetManager = sheetManager;
    }

    /**
     * 解析下拉列表来源
     *
     * 自动识别 source 类型（静态数组 / 动态引用 / 计算公式），
     * 并返回对应的选项列表。
     *
     * @param {string[]|string} source - 来源配置
     * @param {Object} [options={}] - 解析选项
     * @param {string} [options.currentSheet] - 当前工作表名称（同表引用需要）
     * @param {boolean} [options.skipHidden=false] - 是否跳过隐藏行列
     * @param {boolean} [options.useSnapshot=false] - 是否使用快照（排序场景）
     * @returns {Promise<string[]>} 选项列表
     */
    async resolve(source, options = {}) {
        if (Array.isArray(source)) {
            return this.#resolveStatic(source);
        }

        if (typeof source === "string") {
            const trimmed = source.trim();

            if (trimmed.startsWith("=")) {
                const formula = trimmed.substring(1);

                if (this.#isComputedFormula(formula)) {
                    return this.#resolveComputed(formula, options);
                }

                return this.#resolveDynamicRange(formula, options);
            }

            return this.#resolveDynamicRange(trimmed, options);
        }

        errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ListSourceResolver] 无效的 source 类型:", typeof source);
        return [];
    }

    /**
     * 解析动态区域引用（核心方法）
     *
     * @param {string} rangeRef - 区域引用（如 'Sheet1!$A$1:$A$10' 或 'A1:A10'）
     * @param {Object} [options={}] - 解析选项
     * @returns {Promise<string[]>} 选项列表
     */
    async resolveDynamicRange(rangeRef, options = {}) {
        return this.#resolveDynamicRange(rangeRef, options);
    }

    /**
     * 解析范围字符串为坐标对象
     *
     * @param {string} rangeRef - 范围引用字符串
     * @returns {{ startRow: number, endRow: number, startCol: number, endCol: number, sheetName: string|null }}
     */
    parseRange(rangeRef) {
        const cleaned = rangeRef.replace(/\$/g, "");

        let sheetName = null;
        let rangePart = cleaned;

        const sheetMatch = cleaned.match(/^(.+)!([A-Z]+\d+:[A-Z]+\d+)$/);
        if (sheetMatch) {
            sheetName = sheetMatch[1];
            rangePart = sheetMatch[2];
        }

        const rangeMatch = rangePart.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
        if (!rangeMatch) {
            throw new Error(`[ListSourceResolver] 无法解析范围引用: "${rangeRef}"`);
        }

        return {
            startRow: parseInt(rangeMatch[2]) - 1,
            endRow: parseInt(rangeMatch[4]) - 1,
            startCol: this.#colToNumber(rangeMatch[1]),
            endCol: this.#colToNumber(rangeMatch[3]),
            sheetName,
        };
    }

    /**
     * 监听区域变化（使缓存失效）
     *
     * @param {string} rangeRef - 区域引用
     * @param {Function} callback - 变化回调
     * @returns {Function} 取消监听函数
     */
    watchRangeChanges(rangeRef, callback) {
        if (!this.#watchers.has(rangeRef)) {
            this.#watchers.set(rangeRef, new Set());
        }

        this.#watchers.get(rangeRef).add(callback);

        return () => {
            const watchers = this.#watchers.get(rangeRef);
            if (watchers) {
                watchers.delete(callback);
                if (watchers.size === 0) {
                    this.#watchers.delete(rangeRef);
                }
            }
        };
    }

    /**
     * 使指定区域的缓存失效
     *
     * @param {string} rangeRef - 区域引用
     */
    invalidateCache(rangeRef) {
        const cacheKey = this.#getCacheKey(rangeRef);
        this.#cache.delete(cacheKey);

        const watchers = this.#watchers.get(rangeRef);
        if (watchers) {
            watchers.forEach((cb) => {
                try {
                    cb();
                } catch (e) {
                    errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, "[ListSourceResolver] watcher 回调执行失败:", e);
                }
            });
        }
    }

    /**
     * 清空所有缓存
     */
    clearCache() {
        this.#cache.clear();
    }

    /**
     * 销毁解析器
     */
    destroy() {
        this.#cache.clear();
        this.#watchers.clear();
        this.#cellStore = null;
        this.#sheetManager = null;
    }

    // ─── 私有方法 ───

    /**
     * 解析静态数组
     *
     * @private
     * @param {Array} source - 静态选项数组
     * @returns {string[]}
     */
    #resolveStatic(source) {
        if (source.length === 0) return [];

        if (typeof source[0] === "object" && source[0] !== null && "value" in source[0]) {
            return source.map((item) => String(item.value)).filter((v) => v !== "" && v !== "undefined" && v !== "null");
        }

        return source.map((item) => String(item)).filter((v) => v !== "" && v !== "undefined" && v !== "null");
    }

    /**
     * 解析动态区域引用
     *
     * @private
     * @param {string} rangeRef - 区域引用
     * @param {Object} options - 解析选项
     * @returns {Promise<string[]>}
     */
    async #resolveDynamicRange(rangeRef, options = {}) {
        const cacheKey = this.#getCacheKey(rangeRef);
        const cached = this.#cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.values;
        }

        try {
            const parsed = this.parseRange(rangeRef);
            const cellStore = this.#resolveCellStore(parsed.sheetName, options.currentSheet);

            if (!cellStore) {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[ListSourceResolver] 无法获取 CellStore: sheet="${parsed.sheetName}"`);
                return [];
            }

            const values = [];

            for (let row = parsed.startRow; row <= parsed.endRow; row++) {
                for (let col = parsed.startCol; col <= parsed.endCol; col++) {
                    if (options.skipHidden && this.#isHiddenCell(cellStore, row, col)) {
                        continue;
                    }

                    const cell = cellStore.get(row, col);
                    if (cell && cell.value !== null && cell.value !== undefined && cell.value !== "") {
                        values.push(String(cell.value));
                    }
                }
            }

            this.#cache.set(cacheKey, { values, timestamp: Date.now() });

            return values;
        } catch (error) {
            errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, `[ListSourceResolver] 解析动态引用失败: "${rangeRef}"`, error);
            return [];
        }
    }

    /**
     * 解析计算公式（Phase 3+ 占位）
     *
     * @private
     * @param {string} formula - 计算公式
     * @param {Object} options - 选项
     * @returns {Promise<string[]>}
     */
    async #resolveComputed(formula, options = {}) {
        errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[ListSourceResolver] 计算公式尚未实现: "${formula}"，返回空数组`);
        return [];
    }

    /**
     * 判断是否为计算公式（非区域引用）
     *
     * 计算公式以函数名开头（如 UNIQUE、SORT、FILTER），
     * 区域引用以列字母或表名开头。
     *
     * @private
     * @param {string} formula - 公式字符串（已去除前导 =）
     * @returns {boolean}
     */
    #isComputedFormula(formula) {
        const COMPUTED_FUNCTIONS = ["UNIQUE", "SORT", "FILTER", "CHOOSE", "SEQUENCE"];
        const upper = formula.toUpperCase().trim();
        return COMPUTED_FUNCTIONS.some((fn) => upper.startsWith(fn + "("));
    }

    /**
     * 根据表名获取对应的 CellStore
     *
     * @private
     * @param {string|null} sheetName - 表名
     * @param {string|undefined} currentSheet - 当前表名
     * @returns {Object|null}
     */
    #resolveCellStore(sheetName, currentSheet) {
        if (!sheetName || sheetName === currentSheet) {
            return this.#cellStore;
        }

        if (this.#sheetManager && typeof this.#sheetManager.getSheetCellStore === "function") {
            return this.#sheetManager.getSheetCellStore(sheetName);
        }

        if (this.#sheetManager && typeof this.#sheetManager.get === "function") {
            const sheet = this.#sheetManager.get(sheetName);
            return sheet?.cellStore || null;
        }

        return null;
    }

    /**
     * 检查单元格是否隐藏
     *
     * @private
     * @param {Object} cellStore - CellStore
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {boolean}
     */
    #isHiddenCell(cellStore, row, col) {
        if (cellStore.sheet && typeof cellStore.sheet.isRowHidden === "function") {
            if (cellStore.sheet.isRowHidden(row)) return true;
        }

        if (cellStore.sheet && typeof cellStore.sheet.isColHidden === "function") {
            if (cellStore.sheet.isColHidden(col)) return true;
        }

        return false;
    }

    /**
     * 列字母转数字（A→0, Z→25, AA→26）
     *
     * @private
     * @param {string} colStr - 列字母
     * @returns {number}
     */
    #colToNumber(colStr) {
        let num = 0;
        for (let i = 0; i < colStr.length; i++) {
            num = num * 26 + (colStr.charCodeAt(i) - 64);
        }
        return num - 1;
    }

    /**
     * 生成缓存键
     *
     * @private
     * @param {string} rangeRef - 区域引用
     * @returns {string}
     */
    #getCacheKey(rangeRef) {
        return `list_source:${rangeRef.replace(/\$/g, "")}`;
    }
}

export { CACHE_TTL };
