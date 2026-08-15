import { functionRegistry } from "./functions/index.js";
import { isNumber, isString } from "../utils/helper.js";
import { errorHandler } from "../core/ErrorHandler.js";
import { ERROR_CODE } from "../constants/errorCodes.js";
import { type ASTNode, type ASTCellRef, type ASTRangeRef, type ASTFunction, type ASTUnaryOp, type ASTBinaryOp } from "./FormulaParser.js";
import { Cell } from "../model/store/Cell.js";

interface Sheet {
    name: string;
    cellStore: {
        get(row: number, col: number): Cell | undefined;
    };
    cellDataAccessor: {
        getValueMatrix(topRow: number, topCol: number, bottomRow: number, bottomCol: number): unknown[][];
    };
}

interface Workbook {
    sheets: Map<string, Sheet>;
    formulaEngine: { astCache: Map<string, ASTNode> } | null;
}

export class FormulaEvaluator {
    workbook: Workbook | null;
    dependencies: Set<string>;
    _callStack: Set<string>;

    constructor(workbook: Workbook | null) {
        this.workbook = workbook;
        this.dependencies = new Set();
        this._callStack = new Set();
    }

    evaluate(ast: ASTNode, sheet: Sheet | null, currentCellKey?: string): unknown {
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

    #evalNode(node: ASTNode, sheet: Sheet | null): unknown {
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

    #evalCellRef(node: ASTCellRef, sheet: Sheet | null): unknown {
        let targetSheet: Sheet | null | undefined;
        if (node.sheet) {
            targetSheet = this.#resolveSheet(node.sheet);
        } else if (sheet) {
            targetSheet = sheet;
        }
        if (!targetSheet) return "#REF!";

        const key = this.#cellKey(targetSheet.name, node.row, node.col);

        this.dependencies.add(key);

        if (this._callStack.has(key)) {
            errorHandler.error(ERROR_CODE.FORMULA_CIRCULAR_REFERENCE, `检测到循环引用: ${key}`, {
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
                    const result = this.#evalNode(astCache.get(key)!, targetSheet);
                    this._callStack.delete(key);
                    return result;
                } catch (error) {
                    this._callStack.delete(key);
                    errorHandler.error(ERROR_CODE.FORMULA_EVAL_ERROR, `循环引用求值失败: ${key}`, { circularCell: key, error });
                    return "#CIRCULAR!";
                }
            }
        }

        return cell ? cell.value : "";
    }

    #evalRangeRef(node: ASTRangeRef, sheet: Sheet | null): unknown {
        let targetSheet: Sheet | null | undefined;
        if (node.sheet) {
            targetSheet = this.#resolveSheet(node.sheet);
        } else if (sheet) {
            targetSheet = sheet;
        }
        if (!targetSheet) return "#REF!";

        const accessor = targetSheet.cellDataAccessor;
        const matrix = accessor.getValueMatrix(node.topRow, node.topCol, node.bottomRow, node.bottomCol);

        const rangeKey = this.#rangeKey(targetSheet.name, node.topRow, node.topCol, node.bottomRow, node.bottomCol);
        this.dependencies.add(rangeKey);

        return matrix;
    }

    #rangeKey(sheetName: string, topRow: number, topCol: number, bottomRow: number, bottomCol: number): string {
        return `${sheetName}!${topRow},${topCol}:${bottomRow},${bottomCol}`;
    }

    #evalFunction(node: ASTFunction, sheet: Sheet | null): unknown {
        const fnName = node.name ? node.name.toUpperCase() : node.name;
        const fn = functionRegistry.get(fnName);

        if (!fn) {
            errorHandler.debug(ERROR_CODE.FORMULA_FUNCTION_NOT_FOUND, `函数 ${node.name} 未注册`, {
                functionName: node.name,
                availableFunctions: functionRegistry.list().slice(0, 10),
                sheetName: sheet?.name,
            });
            return "#NAME?";
        }

        const args = node.args.map((arg) => this.#evalNode(arg, sheet));
        try {
            return fn(args, { sheet, workbook: this.workbook });
        } catch (fnError) {
            errorHandler.error(ERROR_CODE.FORMULA_EVAL_ERROR, `函数 ${node.name} 执行失败`, { functionName: node.name, args, error: fnError });
            return "#VALUE!";
        }
    }

    #evalUnaryOp(node: ASTUnaryOp, sheet: Sheet | null): unknown {
        const operand = this.#evalNode(node.operand, sheet);
        if (node.operator === "-") return -(operand as number);
        return operand;
    }

    #evalBinaryOp(node: ASTBinaryOp, sheet: Sheet | null): unknown {
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

    #resolveSheet(name: string): Sheet | null {
        if (!this.workbook) return null;
        return this.workbook.sheets.get(name) || null;
    }

    #cellKey(sheetName: string, row: number, col: number): string {
        return `${sheetName}!${row},${col}`;
    }
}

function _toNum(v: unknown): number {
    if (isNumber(v)) return v as number;
    if (isString(v) && (v as string).trim() !== "") {
        const n = parseFloat(v as string);
        return isNaN(n) ? NaN : n;
    }
    return NaN;
}