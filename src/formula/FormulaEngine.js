import { parseFormula } from "./FormulaParser.js";
import { FormulaEvaluator } from "./FormulaEvaluator.js";
import { isString } from "lodash-es";

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
         * 每个公式单元格的 AST 缓存
         * @type {Map<string, object>}
         */
        this.astCache = new Map();

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
        const raw = formulaStr.startsWith("=") ? formulaStr.substring(1) : formulaStr;

        let ast;
        try {
            ast = parseFormula(raw);
        } catch {
            return "#PARSE!";
        }

        this.astCache.set(key, ast);

        this.evaluator.dependencies = new Set();
        let result;
        try {
            result = this.evaluator.evaluate(ast, sheet);
        } catch {
            result = "#VALUE!";
        }

        this.#updateDependencies(key, this.evaluator.dependencies);

        return result;
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
        const key = this.#cellKey(sheet.name, row, col);
        const depSet = this.dependents.get(key);
        if (!depSet || depSet.size === 0) return [];

        this.dirtyCells = new Set();
        this.#collectDirty(key, new Set());
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
            const [, r, c] = this.#parseKey(key);
            if (r >= row || c >= col) {
                keysToRemove.push(key);
            }
        }

        for (const key of keysToRemove) {
            this.#removeDependencies(key);
            this.astCache.delete(key);
        }
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

        for (const key of formulaKeys) {
            const ast = this.astCache.get(key);
            if (!ast) continue;

            const [, row, col] = this.#parseKey(key);

            this.evaluator.dependencies = new Set();
            let result;
            try {
                result = this.evaluator.evaluate(ast, sheet);
            } catch {
                result = "#VALUE!";
            }

            this.#updateDependencies(key, this.evaluator.dependencies);

            const cell = sheet.cellStore.get(row, col);
            if (cell) {
                sheet.cellStore.set(
                    row,
                    col,
                    new (cell.constructor)(result, cell.styleId, cell.disabled, cell.formula)
                );
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
     * 销毁引擎，清理所有数据
     */
    destroy() {
        this.dependents.clear();
        this.dependsOn.clear();
        this.astCache.clear();
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

    #parseKey(key) {
        const match = key.match(/^(.+)!(\d+),(\d+)$/);
        if (!match) return ["", 0, 0];
        return [match[1], parseInt(match[2], 10), parseInt(match[3], 10)];
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
            }
        }

        this.dependsOn.set(formulaKey, new Set(newDeps));
        for (const dep of newDeps) {
            if (!this.dependents.has(dep)) {
                this.dependents.set(dep, new Set());
            }
            this.dependents.get(dep).add(formulaKey);
        }
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
            }
        }
        this.dependsOn.delete(formulaKey);
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
                result = this.evaluator.evaluate(ast, targetSheet);
            } catch {
                result = "#VALUE!";
            }

            this.#updateDependencies(key, this.evaluator.dependencies);

            const cell = targetSheet.cellStore.get(row, col);
            if (cell && cell.formula === `=${this.#astToRaw(ast)}`) {
                targetSheet.cellStore.set(row, col, new (cell.constructor)(result, cell.styleId, cell.disabled, cell.formula));
            }

            results.push({ sheetName, row, col, newValue: result });
        }

        this.dirtyCells.clear();
        return results;
    }

    #astToRaw(ast) {
        if (!ast) return "";
        switch (ast.type) {
            case "literal": return String(ast.value);
            case "cellRef": return `${ast.sheet ? ast.sheet + "!" : ""}${String.fromCharCode(65 + ast.col)}${ast.row + 1}`;
            case "rangeRef": return `${ast.sheet ? ast.sheet + "!" : ""}${String.fromCharCode(65 + ast.topCol)}${ast.topRow + 1}:${String.fromCharCode(65 + ast.bottomCol)}${ast.bottomRow + 1}`;
            case "function": return `${ast.name}(${ast.args.map((a) => this.#astToRaw(a)).join(",")})`;
            case "binaryOp": return `${this.#astToRaw(ast.left)}${ast.operator}${this.#astToRaw(ast.right)}`;
            case "unaryOp": return `${ast.operator}${this.#astToRaw(ast.operand)}`;
            default: return "";
        }
    }
}