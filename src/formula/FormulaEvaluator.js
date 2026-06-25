import { FUNCTIONS, getRegisteredFunctions } from "./functions/index.js";
import { isNumber, isString } from "../core/utils.js";
import { errorHandler, ERROR_CODE } from "../core/ErrorHandler.js";

/**
 * 公式求值器
 *
 * 遍历 AST 并递归求值：
 * - cellRef 节点：从 sheet 中读取单元格值
 * - rangeRef 节点：读取范围，返回二维数组
 * - function 节点：调用函数注册表中的函数
 * - binaryOp 节点：执行算术/比较/文本运算
 * - literal 节点：返回字面值
 *
 * 同时收集公式引用的所有单元格（用于依赖追踪）。
 */
export class FormulaEvaluator {
    /**
     * @param {object} workbook - Workbook 实例（用于跨表引用）
     */
    constructor(workbook) {
        this.workbook = workbook;

        /** @type {Set<string>} 当前求值中引用的单元格 key 集合 */
        this.dependencies = new Set();

        /**
         * 调用栈（用于循环引用检测）
         * @type {Set<string>}
         * @private
         */
        this._callStack = new Set();
    }

    /**
     * 求值 AST 并返回结果
     * @param {object} ast - AST 根节点
     * @param {object} sheet - 当前 Sheet
     * @param {string} [currentCellKey] - 当前正在求值的单元格 key（用于循环引用检测）
     * @returns {*} 计算结果
     */
    evaluate(ast, sheet, currentCellKey) {
        this.dependencies = new Set();

        if (currentCellKey) {
            this._callStack.add(currentCellKey);
        }

        try {
            return this.#evalNode(ast, sheet);
        } finally {
            if (currentCellKey) {
                this._callStack.delete(currentCellKey);
            }
        }
    }

    #evalNode(node, sheet) {
        switch (node.type) {
            case "literal":
                return node.value;

            case "cellRef":
                return this.#evalCellRef(node, sheet);

            case "rangeRef":
                return this.#evalRangeRef(node, sheet);

            case "function":
                return this.#evalFunction(node, sheet);

            case "unaryOp":
                return this.#evalUnaryOp(node, sheet);

            case "binaryOp":
                return this.#evalBinaryOp(node, sheet);

            default:
                return "#VALUE!";
        }
    }

    #evalCellRef(node, sheet) {
        let targetSheet;
        if (node.sheet) {
            targetSheet = this.#resolveSheet(node.sheet);
        } else if (sheet) {
            targetSheet = sheet;
        }
        if (!targetSheet) return "#REF!";

        const key = this.#cellKey(targetSheet.name, node.row, node.col);

        this.dependencies.add(key);

        if (this._callStack.has(key)) {
            errorHandler.handle(ERROR_CODE.FORMULA_CIRCULAR_REFERENCE, `检测到循环引用: ${key}`, {
                circularCell: key,
                callStack: [...this._callStack],
                sheetName: targetSheet.name,
                row: node.row,
                col: node.col,
            });
            return "#CIRCULAR!";
        }

        const cell = targetSheet.cellStore.get(node.row, node.col);

        if (cell && cell.formula) {
            const astCache = this.workbook?.formulaEngine?.astCache;
            if (astCache && astCache.has(key)) {
                try {
                    this._callStack.add(key);
                    const result = this.#evalNode(astCache.get(key), targetSheet);
                    this._callStack.delete(key);
                    return result;
                } catch (error) {
                    this._callStack.delete(key);
                    errorHandler.handle(ERROR_CODE.FORMULA_EVAL_ERROR, `循环引用求值失败: ${key}`, { circularCell: key, error });
                    return "#CIRCULAR!";
                }
            }
        }

        return cell ? cell.value : "";
    }

    #evalRangeRef(node, sheet) {
        let targetSheet;
        if (node.sheet) {
            targetSheet = this.#resolveSheet(node.sheet);
        } else if (sheet) {
            targetSheet = sheet;
        }
        if (!targetSheet) return "#REF!";

        const result = [];
        for (let r = node.topRow; r <= node.bottomRow; r++) {
            const rowData = [];
            for (let c = node.topCol; c <= node.bottomCol; c++) {
                const cell = targetSheet.cellStore.get(r, c);
                const key = this.#cellKey(targetSheet.name, r, c);
                this.dependencies.add(key);
                rowData.push(cell ? cell.value : "");
            }
            result.push(rowData);
        }
        return result;
    }

    #evalFunction(node, sheet) {
        const fnName = node.name ? node.name.toUpperCase() : node.name;
        const fn = typeof FUNCTIONS.get === "function" ? FUNCTIONS.get(fnName) : FUNCTIONS[fnName];

        if (!fn) {
            errorHandler.debug(ERROR_CODE.FORMULA_FUNCTION_NOT_FOUND, `函数 ${node.name} 未注册`, {
                functionName: node.name,
                availableFunctions: typeof getRegisteredFunctions === "function" ? getRegisteredFunctions().slice(0, 10) : "N/A",
                sheetName: sheet?.name,
            });
            return "#NAME?";
        }

        const args = node.args.map((arg) => this.#evalNode(arg, sheet));
        try {
            return fn(args, { sheet, workbook: this.workbook });
        } catch (fnError) {
            errorHandler.handle(ERROR_CODE.FORMULA_EVAL_ERROR, `函数 ${node.name} 执行失败`, { functionName: node.name, args, error: fnError });
            return "#VALUE!";
        }
    }

    #evalUnaryOp(node, sheet) {
        const operand = this.#evalNode(node.operand, sheet);
        if (node.operator === "-") return -operand;
        return operand;
    }

    #evalBinaryOp(node, sheet) {
        const left = this.#evalNode(node.left, sheet);
        const right = this.#evalNode(node.right, sheet);

        switch (node.operator) {
            case "+":
                return _toNum(left) + _toNum(right);
            case "-":
                return _toNum(left) - _toNum(right);
            case "*":
                return _toNum(left) * _toNum(right);
            case "/": {
                const divisor = _toNum(right);
                return divisor === 0 ? "#DIV/0!" : _toNum(left) / divisor;
            }
            case "^":
                return Math.pow(_toNum(left), _toNum(right));
            case "&":
                return String(left ?? "") + String(right ?? "");
            case "=":
                return left === right;
            case "<>":
                return left !== right;
            case "<":
                return _toNum(left) < _toNum(right);
            case ">":
                return _toNum(left) > _toNum(right);
            case "<=":
                return _toNum(left) <= _toNum(right);
            case ">=":
                return _toNum(left) >= _toNum(right);
            default:
                return "#VALUE!";
        }
    }

    #resolveSheet(name) {
        if (!this.workbook) return null;
        return this.workbook.sheets.get(name) || null;
    }

    #cellKey(sheetName, row, col) {
        return `${sheetName}!${row},${col}`;
    }
}

function _toNum(v) {
    if (isNumber(v)) return v;
    if (isString(v) && v.trim() !== "") {
        const n = parseFloat(v);
        return isNaN(n) ? NaN : n;
    }
    return NaN;
}