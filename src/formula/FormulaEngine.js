import { parseFormula } from "./FormulaParser.js";
import { indexToCol } from "../utils/cellRef.js";
import { FormulaEvaluator } from "./FormulaEvaluator.js";
import { isString } from "../utils/helper.js";
import { functionRegistry } from "./functions/index.js";
import { errorHandler, ERROR_CODE } from "../core/ErrorHandler.js";

/**
 * 公式引擎
 *
 * 核心职责：
 * 1. 判断一个值是否为公式（以 "=" 开头）
 * 2. 解析公式字符串 → AST
 * 3. 求值 AST → 计算结果
 * 4. 维护依赖图：当源单元格变化时，自动重算所有关联公式
 *
 * 依赖图设计：
 * - dependents: Map<"Sheet1!0,0", Set<"Sheet1!5,3">>
 *   表示单元格 (0,0) 被 (5,3) 的公式引用
 * - 当 (0,0) 变化时，需要重算 (5,3)
 * - 支持级联：A 依赖 B，B 依赖 C，C 变化时 A、B 都需要重算
 *
 * 使用方式：
 * ```js
 * const engine = new FormulaEngine(workbook);
 *
 * // 设置公式单元格
 * engine.setFormula(sheet, 5, 3, "=SUM(A1:A10)");
 *
 * // 非公式单元格变化后触发重算
 * engine.onCellChanged(sheet, 0, 0);
 * ```
 */
export class FormulaEngine {
    /**
     * @param {object} workbook - Workbook 实例
     */
    constructor(workbook) {
        this.workbook = workbook;
        this.evaluator = new FormulaEvaluator(workbook);

        /**
         * 依赖图：被依赖者 → 依赖者集合
         * @type {Map<string, Set<string>>}
         */
        this.dependents = new Map();

        /**
         * 每个公式单元格引用了哪些前置单元格
         * @type {Map<string, Set<string>>}
         */
        this.dependsOn = new Map();

        /**
         * 范围依赖索引：仅存储范围类型的依赖 key
         * 用于 onCellChanged 时快速查找，避免遍历所有 dependents
         * @type {Map<string, Set<string>>}
         */
        this.rangeDependents = new Map();

        /**
         * 范围空间索引：按行分桶，快速查找包含指定单元格的范围
         * 结构: Map<sheetName:rowBucket, Map<rangeKey, {topRow, bottomRow, topCol, bottomCol}>>
         * 桶大小 256 行，单元格变化时只查对应桶，O(k) 而非 O(R)
         * @type {Map<string, Map<string, {topRow:number,bottomRow:number,topCol:number,bottomCol:number}>>}
         */
        this.rangeSpatialIndex = new Map();

        /** 空间索引桶大小（行数） */
        this._spatialBucketSize = 256;

        /**
         * 每个公式单元格的 AST 缓存
         * @type {Map<string, object>}
         */
        this.astCache = new Map();

        /**
         * 求值结果缓存：避免重算时重复更新未变化的依赖
         * @type {Map<string, *>}
         */
        this.resultCache = new Map();

        /**
         * 重算队列（避免重复计算）
         * @type {Set<string>}
         */
        this.dirtyCells = new Set();
    }

    /**
     * 判断值是否为公式
     * @param {*} value
     * @returns {boolean}
     */
    static isFormula(value) {
        return isString(value) && value.length > 1 && value[0] === "=";
    }

    /**
     * 设置公式单元格
     * 解析公式、求值、注册依赖关系
     *
     * @param {object} sheet - Sheet 实例
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {string} formulaStr - 公式字符串（含前导 "="）
     * @returns {*} 计算结果
     */
    setFormula(sheet, row, col, formulaStr) {
        const key = this.#cellKey(sheet.name, row, col);

        this.#removeDependencies(key);
        this.astCache.delete(key);

        const raw = formulaStr.startsWith("=") ? formulaStr.substring(1) : formulaStr;

        let ast;
        try {
            ast = parseFormula(raw);
        } catch (parseError) {
            errorHandler.handle(ERROR_CODE.FORMULA_PARSE_ERROR, `公式解析失败: ${formulaStr}`, {
                formulaStr,
                sheetName: sheet.name,
                row,
                col,
                error: parseError,
            });
            return "#PARSE!";
        }

        this.astCache.set(key, ast);

        this.evaluator.dependencies = new Set();
        let result;
        try {
            result = this.evaluator.evaluate(ast, sheet, key);
        } catch (evalError) {
            errorHandler.handle(ERROR_CODE.FORMULA_EVAL_ERROR, `公式求值失败: ${formulaStr}`, {
                formulaStr,
                sheetName: sheet.name,
                row,
                col,
                error: evalError,
            });
            result = "#VALUE!";
        }

        this.#updateDependencies(key, this.evaluator.dependencies);

        return result;
    }

    /**
     * 批量注册公式（仅解析和建立依赖，不求值）
     * 用于初始化时避免重复求值
     *
     * @param {object} sheet - Sheet 实例
     */
    registerFormulasBatch(sheet) {
        const cellStore = sheet.cellStore;
        if (!cellStore) return;

        let count = 0;
        for (const [, chunk] of cellStore.chunks) {
            for (const { row, col, cell } of chunk.iterate()) {
                if (cell?.formula && typeof cell.formula === "string" && cell.formula.startsWith("=")) {
                    this.#registerFormulaOnly(sheet, row, col, cell.formula);
                    count++;
                }
            }
        }
    }

    /**
     * 仅注册公式（解析并建立依赖关系，不求值）
     * 用于批量初始化
     *
     * @param {object} sheet - Sheet 实例
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {string} formulaStr - 公式字符串
     */
    #registerFormulaOnly(sheet, row, col, formulaStr) {
        const key = this.#cellKey(sheet.name, row, col);

        this.#removeDependencies(key);
        this.astCache.delete(key);

        const raw = formulaStr.startsWith("=") ? formulaStr.substring(1) : formulaStr;

        let ast;
        try {
            ast = parseFormula(raw);
        } catch (parseError) {
            errorHandler.handle(ERROR_CODE.FORMULA_PARSE_ERROR, `公式解析失败: ${formulaStr}`, {
                formulaStr,
                sheetName: sheet.name,
                row,
                col,
                error: parseError,
            });
            return;
        }

        this.astCache.set(key, ast);

        this.evaluator.dependencies = new Set();
        this.#evalNodeForDeps(ast, sheet);

        this.#updateDependencies(key, this.evaluator.dependencies);
    }

    /**
     * 仅遍历 AST 收集依赖关系，不计算值
     * @param {object} node - AST 节点
     * @param {object} sheet - 当前 Sheet
     */
    #evalNodeForDeps(node, sheet) {
        if (!node) return;

        switch (node.type) {
            case "cellRef": {
                let targetSheet;
                if (node.sheet) {
                    targetSheet = this.workbook?.sheets.get(node.sheet);
                } else {
                    targetSheet = sheet;
                }
                if (targetSheet) {
                    const key = this.#cellKey(targetSheet.name, node.row, node.col);
                    this.evaluator.dependencies.add(key);
                }
                break;
            }
            case "rangeRef": {
                let targetSheet;
                if (node.sheet) {
                    targetSheet = this.workbook?.sheets.get(node.sheet);
                } else {
                    targetSheet = sheet;
                }
                if (targetSheet) {
                    const rangeKey = `${targetSheet.name}!${node.topRow},${node.topCol}:${node.bottomRow},${node.bottomCol}`;
                    this.evaluator.dependencies.add(rangeKey);
                }
                break;
            }
            case "function":
                for (const arg of node.args) {
                    this.#evalNodeForDeps(arg, sheet);
                }
                break;
            case "binaryOp":
                this.#evalNodeForDeps(node.left, sheet);
                this.#evalNodeForDeps(node.right, sheet);
                break;
            case "unaryOp":
                this.#evalNodeForDeps(node.operand, sheet);
                break;
        }
    }

    /**
     * 移除单元格的公式及其所有依赖关系
     * 当公式被删除或改为非公式值时调用
     *
     * @param {object} sheet - Sheet 实例
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    removeFormula(sheet, row, col) {
        const key = this.#cellKey(sheet.name, row, col);
        this.#removeDependencies(key);
        this.astCache.delete(key);
    }

    /**
     * 当非公式单元格变化时调用
     * 查找所有依赖该单元格的公式，标记为脏，然后重算
     *
     * @param {object} sheet - Sheet 实例
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {Array<{sheetName: string, row: number, col: number, newValue: *}>} 受影响的重算结果
     */
    onCellChanged(sheet, row, col) {
        const cellKey = this.#cellKey(sheet.name, row, col);

        this.dirtyCells = new Set();
        const visitedFormulas = new Set();

        const cellDepSet = this.dependents.get(cellKey);
        if (cellDepSet && cellDepSet.size > 0) {
            for (const formulaKey of cellDepSet) {
                if (!visitedFormulas.has(formulaKey)) {
                    visitedFormulas.add(formulaKey);
                    this.dirtyCells.add(formulaKey);
                    this.#collectDirty(formulaKey, visitedFormulas);
                }
            }
        }

        this.#findRangeDependents(sheet.name, row, col, visitedFormulas);

        if (this.dirtyCells.size === 0) {
            return [];
        }

        const results = this.#recalculate(sheet);

        for (const { sheetName, row: r, col: c } of results) {
            const s = this.workbook?.sheets.get(sheetName);
            if (s) {
                s._invalidateCellInternal(r, c);
            }
        }

        return results;
    }

    /**
     * 当行/列被插入/删除时调用，清理受影响公式的依赖和 AST
     *
     * @param {object} sheet - Sheet 实例
     * @param {number} row - 受影响的行号
     * @param {number} col - 受影响的列号
     * @param {boolean} isShift - 是否是移位操作（插入/删除行列）
     */
    onStructureChanged(sheet, row, col, isShift) {
        if (!isShift) return;

        const prefix = `${sheet.name}!`;
        const keysToRemove = [];

        for (const key of this.dependsOn.keys()) {
            if (!key.startsWith(prefix)) continue;

            if (this.#isRangeKey(key)) {
                const range = this.#parseRangeKey(key);
                if (range) {
                    const overlaps = this.#rangeOverlapsWithPoint(range, row, col);
                    if (overlaps) {
                        keysToRemove.push(key);
                    }
                }
            } else {
                const [, r, c] = this.#parseKey(key);
                if (row > 0 && r >= row) {
                    keysToRemove.push(key);
                } else if (col > 0 && c >= col) {
                    keysToRemove.push(key);
                }
            }
        }

        for (const key of keysToRemove) {
            this.#removeDependencies(key);
            this.astCache.delete(key);
        }
    }

    #rangeOverlapsWithPoint(range, row, col) {
        return row >= range.topRow && row <= range.bottomRow && col >= range.topCol && col <= range.bottomCol;
    }

    /**
     * 重算指定 Sheet 中的所有公式单元格
     * 用于 undo/redo 或数据加载后确保公式正确
     *
     * @param {object} sheet - Sheet 实例
     */
    recalculateAll(sheet) {
        const prefix = `${sheet.name}!`;
        const formulaKeys = [];

        for (const key of this.astCache.keys()) {
            if (key.startsWith(prefix)) {
                formulaKeys.push(key);
            }
        }

        if (formulaKeys.length === 0) return;

        const sortedKeys = this.#topologicalSort(formulaKeys);

        let evalCount = 0;

        for (const key of sortedKeys) {
            const ast = this.astCache.get(key);
            if (!ast) continue;

            const [, row, col] = this.#parseKey(key);

            this.evaluator.dependencies = new Set();
            let result;
            try {
                result = this.evaluator.evaluate(ast, sheet, key);
                evalCount++;
            } catch (e) {
                result = "#VALUE!";
            }

            this.#updateDependencies(key, this.evaluator.dependencies);

            const cell = sheet.cellStore.get(row, col);
            if (cell) {
                sheet.cellStore.set(row, col, new cell.constructor(result, cell.styleId, cell.disabled, cell.formula));
                this.resultCache.set(key, result);
            }
        }
    }

    /**
     * 获取公式单元格的依赖列表（调试用）
     * @param {string} sheetName
     * @param {number} row
     * @param {number} col
     * @returns {string[]}
     */
    getDependencies(sheetName, row, col) {
        const key = this.#cellKey(sheetName, row, col);
        const deps = this.dependsOn.get(key);
        return deps ? [...deps] : [];
    }

    /**
     * 获取依赖某个单元格的公式列表（调试用）
     * @param {string} sheetName
     * @param {number} row
     * @param {number} col
     * @returns {string[]}
     */
    getDependents(sheetName, row, col) {
        const key = this.#cellKey(sheetName, row, col);
        const deps = this.dependents.get(key);
        return deps ? [...deps] : [];
    }

    /**
     * 注册自定义公式函数
     *
     * @param {string} name - 函数名（如 'MYFUNC'，会自动转大写）
     * @param {Function} fn - 函数实现 (args: Array, context: { sheet, workbook }) => any
     * @throws {Error} 参数类型错误时抛出
     *
     * @example
     * ```js
     * engine.registerFunction('DOUBLE', (args) => args[0] * 2);
     * // 然后可以在单元格中使用 =DOUBLE(A1)
     *
     * // 复杂示例：使用上下文访问工作簿
     * engine.registerFunction('TAX', (args, ctx) => {
     *     const amount = args[0];
     *     const rate = args[1] ?? 0.13;
     *     return amount * rate;
     * });
     * ```
     */
    static registerFunction(name, fn) {
        functionRegistry.register(name, fn, { category: "custom" });
    }

    /**
     * 注销自定义公式函数
     *
     * @param {string} name - 要移除的函数名
     * @returns {boolean} 是否成功移除
     *
     * @example
     * ```js
     * FormulaEngine.unregisterFunction('DOUBLE');
     * ```
     */
    static unregisterFunction(name) {
        return functionRegistry.unregister(name);
    }

    /**
     * 检查函数是否已注册
     *
     * @param {string} name - 函数名
     * @returns {boolean}
     */
    static hasFunction(name) {
        return functionRegistry.has(name);
    }

    /**
     * 获取所有已注册的函数名列表（调试用）
     *
     * @returns {string[]} 函数名数组（全部大写）
     *
     * @example
     * ```js
     * console.log(FormulaEngine.getRegisteredFunctions());
     * // ["SUM", "AVERAGE", "IF", "MY_CUSTOM_FUNC", ...]
     * ```
     */
    static getRegisteredFunctions() {
        return functionRegistry.list();
    }

    /**
     * 销毁引擎，清理所有数据
     */
    destroy() {
        this.dependents.clear();
        this.dependsOn.clear();
        this.rangeDependents.clear();
        this.rangeSpatialIndex.clear();
        this.astCache.clear();
        this.resultCache.clear();
        this.dirtyCells.clear();
        this.workbook = null;
        this.evaluator = null;
    }

    // ============================================================
    // 私有方法
    // ============================================================

    #cellKey(sheetName, row, col) {
        return `${sheetName}!${row},${col}`;
    }

    static #CELL_KEY_RE = /^(.+)!(\d+),(\d+)$/;
    static #RANGE_KEY_RE = /^(.+)!(\d+),(\d+):(\d+),(\d+)$/;

    #parseKey(key) {
        const match = key.match(FormulaEngine.#CELL_KEY_RE);
        if (!match) return ["", 0, 0];
        return [match[1], parseInt(match[2], 10), parseInt(match[3], 10)];
    }

    #parseRangeKey(key) {
        const match = key.match(FormulaEngine.#RANGE_KEY_RE);
        if (!match) return null;
        return {
            sheetName: match[1],
            topRow: parseInt(match[2], 10),
            topCol: parseInt(match[3], 10),
            bottomRow: parseInt(match[4], 10),
            bottomCol: parseInt(match[5], 10),
        };
    }

    #isCellInRange(sheetName, row, col, rangeKey) {
        const range = this.#parseRangeKey(rangeKey);
        if (!range) return false;
        if (range.sheetName !== sheetName) return false;
        return row >= range.topRow && row <= range.bottomRow && col >= range.topCol && col <= range.bottomCol;
    }

    #isRangeKey(key) {
        return key.includes(":");
    }

    #addToSpatialIndex(rangeKey, range) {
        const { sheetName, topRow, bottomRow, topCol, bottomCol } = range;
        const bucketSize = this._spatialBucketSize;
        const startBucket = Math.floor(topRow / bucketSize);
        const endBucket = Math.floor(bottomRow / bucketSize);

        for (let b = startBucket; b <= endBucket; b++) {
            const bucketKey = `${sheetName}:${b}`;
            let bucket = this.rangeSpatialIndex.get(bucketKey);
            if (!bucket) {
                bucket = new Map();
                this.rangeSpatialIndex.set(bucketKey, bucket);
            }
            bucket.set(rangeKey, { topRow, bottomRow, topCol, bottomCol });
        }
    }

    #removeFromSpatialIndex(rangeKey, range) {
        if (!range) return;
        const { sheetName, topRow, bottomRow } = range;
        const bucketSize = this._spatialBucketSize;
        const startBucket = Math.floor(topRow / bucketSize);
        const endBucket = Math.floor(bottomRow / bucketSize);

        for (let b = startBucket; b <= endBucket; b++) {
            const bucketKey = `${sheetName}:${b}`;
            const bucket = this.rangeSpatialIndex.get(bucketKey);
            if (bucket) {
                bucket.delete(rangeKey);
                if (bucket.size === 0) {
                    this.rangeSpatialIndex.delete(bucketKey);
                }
            }
        }
    }

    #findRangeDependents(sheetName, row, col, visitedFormulas) {
        const bucketSize = this._spatialBucketSize;
        const bucketIndex = Math.floor(row / bucketSize);
        const bucketKey = `${sheetName}:${bucketIndex}`;
        const bucket = this.rangeSpatialIndex.get(bucketKey);

        if (!bucket) return;

        for (const [rangeKey, rangeInfo] of bucket) {
            if (row >= rangeInfo.topRow && row <= rangeInfo.bottomRow && col >= rangeInfo.topCol && col <= rangeInfo.bottomCol) {
                const formulaKeys = this.rangeDependents.get(rangeKey);
                if (formulaKeys) {
                    for (const formulaKey of formulaKeys) {
                        if (!visitedFormulas.has(formulaKey)) {
                            visitedFormulas.add(formulaKey);
                            this.dirtyCells.add(formulaKey);
                            this.#collectDirty(formulaKey, visitedFormulas);
                        }
                    }
                }
            }
        }
    }

    #topologicalSort(formulaKeys) {
        const keySet = new Set(formulaKeys);
        const inDegree = new Map();
        const adj = new Map();

        for (const key of formulaKeys) {
            inDegree.set(key, 0);
            adj.set(key, []);
        }

        for (const key of formulaKeys) {
            const deps = this.dependsOn.get(key);
            if (!deps) continue;

            for (const dep of deps) {
                if (!this.#isRangeKey(dep) && keySet.has(dep)) {
                    inDegree.set(key, inDegree.get(key) + 1);
                    adj.get(dep).push(key);
                }
            }
        }

        const queue = [];
        for (const [key, degree] of inDegree) {
            if (degree === 0) queue.push(key);
        }

        const sorted = [];
        while (queue.length > 0) {
            const key = queue.shift();
            sorted.push(key);

            for (const dependent of adj.get(key)) {
                const newDegree = inDegree.get(dependent) - 1;
                inDegree.set(dependent, newDegree);
                if (newDegree === 0) {
                    queue.push(dependent);
                }
            }
        }

        for (const key of formulaKeys) {
            if (!sorted.includes(key)) {
                sorted.push(key);
            }
        }

        return sorted;
    }

    #updateDependencies(formulaKey, newDeps) {
        const oldDeps = this.dependsOn.get(formulaKey);
        if (oldDeps) {
            for (const dep of oldDeps) {
                const depSet = this.dependents.get(dep);
                if (depSet) {
                    depSet.delete(formulaKey);
                    if (depSet.size === 0) this.dependents.delete(dep);
                }
                if (this.#isRangeKey(dep)) {
                    const rangeSet = this.rangeDependents.get(dep);
                    if (rangeSet) {
                        rangeSet.delete(formulaKey);
                        if (rangeSet.size === 0) {
                            this.rangeDependents.delete(dep);
                            const range = this.#parseRangeKey(dep);
                            this.#removeFromSpatialIndex(dep, range);
                        }
                    }
                }
            }
        }

        this.dependsOn.set(formulaKey, new Set(newDeps));
        for (const dep of newDeps) {
            if (!this.dependents.has(dep)) {
                this.dependents.set(dep, new Set());
            }
            this.dependents.get(dep).add(formulaKey);

            if (this.#isRangeKey(dep)) {
                if (!this.rangeDependents.has(dep)) {
                    this.rangeDependents.set(dep, new Set());
                    const range = this.#parseRangeKey(dep);
                    if (range) this.#addToSpatialIndex(dep, range);
                }
                this.rangeDependents.get(dep).add(formulaKey);
            }
        }
    }

    /**
     * 仅在依赖关系发生变化时才更新，返回是否变化
     * @param {string} formulaKey
     * @param {Set<string>} newDeps
     * @returns {boolean} 依赖是否变化
     */
    #updateDependenciesIfChanged(formulaKey, newDeps) {
        const oldDeps = this.dependsOn.get(formulaKey);

        if (oldDeps && oldDeps.size === newDeps.size) {
            let changed = false;
            for (const dep of newDeps) {
                if (!oldDeps.has(dep)) {
                    changed = true;
                    break;
                }
            }
            if (!changed) return false;
        }

        this.#updateDependencies(formulaKey, newDeps);
        return true;
    }

    #removeDependencies(formulaKey) {
        const deps = this.dependsOn.get(formulaKey);
        if (deps) {
            for (const dep of deps) {
                const depSet = this.dependents.get(dep);
                if (depSet) {
                    depSet.delete(formulaKey);
                    if (depSet.size === 0) this.dependents.delete(dep);
                }
                if (this.#isRangeKey(dep)) {
                    const rangeSet = this.rangeDependents.get(dep);
                    if (rangeSet) {
                        rangeSet.delete(formulaKey);
                        if (rangeSet.size === 0) {
                            this.rangeDependents.delete(dep);
                            const range = this.#parseRangeKey(dep);
                            this.#removeFromSpatialIndex(dep, range);
                        }
                    }
                }
            }
        }
        this.dependsOn.delete(formulaKey);
        this.resultCache.delete(formulaKey);
    }

    #collectDirty(key, visited) {
        if (visited.has(key)) return;
        visited.add(key);

        const depSet = this.dependents.get(key);
        if (!depSet) return;

        for (const formulaKey of depSet) {
            this.dirtyCells.add(formulaKey);
            this.#collectDirty(formulaKey, visited);
        }
    }

    #recalculate(sheet) {
        const results = [];

        for (const key of this.dirtyCells) {
            const ast = this.astCache.get(key);
            if (!ast) continue;

            const [sheetName, row, col] = this.#parseKey(key);
            const targetSheet = this.workbook?.sheets.get(sheetName) || sheet;

            this.evaluator.dependencies = new Set();
            let result;
            try {
                result = this.evaluator.evaluate(ast, targetSheet, key);
            } catch (e) {
                result = "#VALUE!";
            }

            const depsChanged = this.#updateDependenciesIfChanged(key, this.evaluator.dependencies);

            const cell = targetSheet.cellStore.get(row, col);
            if (cell && cell.formula) {
                const oldValue = this.resultCache.get(key);
                const valueChanged = oldValue === undefined || oldValue !== result;

                if (valueChanged || depsChanged) {
                    targetSheet.cellStore.set(row, col, new cell.constructor(result, cell.styleId, cell.disabled, cell.formula));
                    this.resultCache.set(key, result);
                    results.push({ sheetName, row, col, newValue: result });
                }
            }
        }

        this.dirtyCells.clear();

        return results;
    }

    #astToRaw(ast) {
        if (!ast) return "";
        switch (ast.type) {
            case "literal": {
                const v = ast.value;
                if (typeof v === "string") return `"${v}"`;
                return String(v);
            }
            case "cellRef":
                return `${ast.sheet ? ast.sheet + "!" : ""}${indexToCol(ast.col)}${ast.row + 1}`;
            case "rangeRef":
                return `${ast.sheet ? ast.sheet + "!" : ""}${indexToCol(ast.topCol)}${ast.topRow + 1}:${indexToCol(ast.bottomCol)}${ast.bottomRow + 1}`;
            case "function":
                return `${ast.name}(${ast.args.map((a) => this.#astToRaw(a)).join(",")})`;
            case "binaryOp":
                return `${this.#astToRaw(ast.left)}${ast.operator}${this.#astToRaw(ast.right)}`;
            case "unaryOp":
                return `${ast.operator}${this.#astToRaw(ast.operand)}`;
            default:
                return "";
        }
    }

    /**
     * 验证专用同步求值方法
     * 支持：
     * - 自定义函数（通过 functionRegistry）
     * - 内置函数
     * - 单元格引用
     * - 虚拟上下文（编辑时单元格可能没有实际值）
     *
     * @param {string} formulaStr - 公式字符串（含前导 "="）
     * @param {Object} context - 验证上下文
     * @param {*} context.value - 当前单元格值
     * @param {number} context.row - 当前行号
     * @param {number} context.col - 当前列号
     * @param {object} context.sheet - Sheet 实例
     * @param {object} [context.workbook] - Workbook 实例
     * @param {Object} [context.options] - 求值选项
     * @returns {*} 公式计算结果
     */
    evaluateForValidation(formulaStr, context = {}) {
        return Promise.resolve().then(() => this.evaluateForValidationSync(formulaStr, context));
    }

    /**
     * 验证专用同步求值方法
     * 支持：
     * - 自定义函数（通过 functionRegistry）
     * - 内置函数
     * - 单元格引用
     * - 虚拟上下文（编辑时单元格可能没有实际值）
     *
     * @param {string} formulaStr - 公式字符串（含前导 "="）
     * @param {Object} context - 验证上下文
     * @param {*} context.value - 当前单元格值
     * @param {number} context.row - 当前行号
     * @param {number} context.col - 当前列号
     * @param {object} context.sheet - Sheet 实例
     * @param {object} [context.workbook] - Workbook 实例
     * @param {Object} [context.options] - 求值选项
     * @returns {*} 公式计算结果
     */
    evaluateForValidationSync(formulaStr, context = {}) {
        if (!formulaStr || typeof formulaStr !== "string") {
            return true;
        }

        const raw = formulaStr.startsWith("=") ? formulaStr.substring(1) : formulaStr;

        let ast;
        try {
            ast = parseFormula(raw);
        } catch (parseError) {
            errorHandler.debug(ERROR_CODE.FORMULA_PARSE_ERROR, `验证公式解析失败: ${formulaStr}`, {
                formulaStr,
                error: parseError,
            });
            return false;
        }

        const { value, row, col, sheet, options = {} } = context;
        const targetSheet = sheet || this.workbook?.getActiveSheet?.();

        if (!targetSheet) {
            errorHandler.debug(ERROR_CODE.VALIDATION_ERROR, "验证上下文缺少 sheet", { context });
            return false;
        }

        const virtualSheet = this.#createVirtualSheet(targetSheet, row, col, value);

        this.evaluator.dependencies = new Set();

        try {
            const result = this.evaluator.evaluate(ast, virtualSheet);
            return result;
        } catch (evalError) {
            errorHandler.debug(ERROR_CODE.FORMULA_EVAL_ERROR, `验证公式求值失败: ${formulaStr}`, {
                formulaStr,
                error: evalError,
            });
            return false;
        }
    }

    /**
     * 创建虚拟 Sheet，用于验证时提供隔离的求值环境
     * @private
     */
    #createVirtualSheet(realSheet, row, col, value) {
        const self = this;

        return {
            name: realSheet.name,
            cellStore: {
                get: (r, c) => {
                    if (r === row && c === col) {
                        return { value, formula: null };
                    }
                    return realSheet.cellStore?.get?.(r, c) || null;
                },
                set: () => {},
            },
            cellDataAccessor: realSheet.cellDataAccessor,
            getAllCells: () => [],
            workbook: self.workbook,
        };
    }
}
