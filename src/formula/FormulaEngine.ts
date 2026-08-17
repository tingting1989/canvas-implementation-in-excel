import { parseFormula, type ASTNode } from "./FormulaParser.js";
import { indexToCol } from "../utils/cellRef.js";
import { FormulaEvaluator } from "./FormulaEvaluator.js";
import { isString } from "../utils/helper.js";
import { functionRegistry } from "./functions/index.js";
import { errorHandler } from "../core/ErrorHandler.js";
import { ERROR_CODE } from "../constants/errorCodes.js";
import { Cell } from "../model/store/Cell.js";

interface Sheet {
    name: string;
    cellStore: {
        get(row: number, col: number): Cell | undefined;
        set(row: number, col: number, cell: Cell): void;
        chunks: IterableIterator<[unknown, { iterate(): IterableIterator<{ row: number; col: number; cell: Cell }> }]>;
    };
    cellDataAccessor: {
        getValueMatrix(topRow: number, topCol: number, bottomRow: number, bottomCol: number): unknown[][];
    };
    _invalidateCellInternal(row: number, col: number): void;
}

interface Workbook {
    sheets: Map<string, Sheet>;
    activeSheet: Sheet | null;
    formulaEngine: { astCache: Map<string, ASTNode> } | null;
    getActiveSheet(): Sheet | null;
}

interface RangeInfo {
    sheetName: string;
    topRow: number;
    topCol: number;
    bottomRow: number;
    bottomCol: number;
}

interface ValidationContext {
    value?: unknown;
    row?: number;
    col?: number;
    sheet?: Sheet | string | null;
    workbook?: Workbook | null;
    options?: Record<string, unknown>;
}

interface CellChange {
    sheetName: string;
    row: number;
    col: number;
    newValue: unknown;
}

export class FormulaEngine {
    workbook: Workbook | null;
    evaluator: FormulaEvaluator | null;
    dependents: Map<string, Set<string>>;
    dependsOn: Map<string, Set<string>>;
    rangeDependents: Map<string, Set<string>>;
    rangeSpatialIndex: Map<string, Map<string, { topRow: number; bottomRow: number; topCol: number; bottomCol: number }>>;
    _spatialBucketSize: number;
    astCache: Map<string, ASTNode>;
    resultCache: Map<string, unknown>;
    dirtyCells: Set<string>;

    static #CELL_KEY_RE = /^(.+)!(\d+),(\d+)$/;
    static #RANGE_KEY_RE = /^(.+)!(\d+),(\d+):(\d+),(\d+)$/;

    constructor(workbook: Workbook) {
        this.workbook = workbook;
        this.evaluator = new FormulaEvaluator(workbook);
        this.dependents = new Map();
        this.dependsOn = new Map();
        this.rangeDependents = new Map();
        this.rangeSpatialIndex = new Map();
        this._spatialBucketSize = 256;
        this.astCache = new Map();
        this.resultCache = new Map();
        this.dirtyCells = new Set();
    }

    static isFormula(value: unknown): boolean {
        return isString(value) && value.length > 1 && value[0] === "=";
    }

    setFormula(sheet: Sheet, row: number, col: number, formulaStr: string): unknown {
        const key = this.#cellKey(sheet.name, row, col);

        this.#removeDependencies(key);
        this.astCache.delete(key);

        const raw = formulaStr.startsWith("=") ? formulaStr.substring(1) : formulaStr;

        let ast: ASTNode;
        try {
            ast = parseFormula(raw);
        } catch (parseError) {
            errorHandler.error(ERROR_CODE.FORMULA_PARSE_ERROR, `公式解析失败: ${formulaStr}`, {
                formulaStr,
                sheetName: sheet.name,
                row,
                col,
                error: parseError,
            });
            return "#PARSE!";
        }

        this.astCache.set(key, ast);

        this.evaluator!.dependencies = new Set();
        let result: unknown;
        try {
            result = this.evaluator!.evaluate(ast, sheet, key);
        } catch (evalError) {
            errorHandler.error(ERROR_CODE.FORMULA_EVAL_ERROR, `公式求值失败: ${formulaStr}`, {
                formulaStr,
                sheetName: sheet.name,
                row,
                col,
                error: evalError,
            });
            result = "#VALUE!";
        }

        this.#updateDependencies(key, this.evaluator!.dependencies);

        return result;
    }

    registerFormulasBatch(sheet: Sheet): void {
        const cellStore = sheet.cellStore;
        if (!cellStore) return;

        for (const [, chunk] of cellStore.chunks) {
            for (const { row, col, cell } of chunk.iterate()) {
                if (cell?.formula && typeof cell.formula === "string" && cell.formula.startsWith("=")) {
                    this.#registerFormulaOnly(sheet, row, col, cell.formula);
                }
            }
        }
    }

    #registerFormulaOnly(sheet: Sheet, row: number, col: number, formulaStr: string): void {
        const key = this.#cellKey(sheet.name, row, col);

        this.#removeDependencies(key);
        this.astCache.delete(key);

        const raw = formulaStr.startsWith("=") ? formulaStr.substring(1) : formulaStr;

        let ast: ASTNode;
        try {
            ast = parseFormula(raw);
        } catch (parseError) {
            errorHandler.error(ERROR_CODE.FORMULA_PARSE_ERROR, `公式解析失败: ${formulaStr}`, {
                formulaStr,
                sheetName: sheet.name,
                row,
                col,
                error: parseError,
            });
            return;
        }

        this.astCache.set(key, ast);

        this.evaluator!.dependencies = new Set();
        this.#evalNodeForDeps(ast, sheet);

        this.#updateDependencies(key, this.evaluator!.dependencies);
    }

    #evalNodeForDeps(node: ASTNode, sheet: Sheet): void {
        if (!node) return;

        switch (node.type) {
            case "cellRef": {
                let targetSheet: Sheet | null | undefined;
                if (node.sheet) {
                    targetSheet = this.workbook?.sheets.get(node.sheet) || null;
                } else {
                    targetSheet = sheet;
                }
                if (targetSheet) {
                    const key = this.#cellKey(targetSheet.name, node.row, node.col);
                    this.evaluator!.dependencies.add(key);
                }
                break;
            }
            case "rangeRef": {
                let targetSheet: Sheet | null | undefined;
                if (node.sheet) {
                    targetSheet = this.workbook?.sheets.get(node.sheet) || null;
                } else {
                    targetSheet = sheet;
                }
                if (targetSheet) {
                    const rangeKey = `${targetSheet.name}!${node.topRow},${node.topCol}:${node.bottomRow},${node.bottomCol}`;
                    this.evaluator!.dependencies.add(rangeKey);
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

    removeFormula(sheet: Sheet, row: number, col: number): void {
        const key = this.#cellKey(sheet.name, row, col);
        this.#removeDependencies(key);
        this.astCache.delete(key);
    }

    onCellChanged(sheet: Sheet, row: number, col: number): CellChange[] {
        const cellKey = this.#cellKey(sheet.name, row, col);

        this.dirtyCells = new Set();
        const visitedFormulas = new Set<string>();

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

    onStructureChanged(sheet: Sheet, row: number, col: number, isShift: boolean): void {
        if (!isShift) return;

        const prefix = `${sheet.name}!`;
        const keysToRemove: string[] = [];

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

    #rangeOverlapsWithPoint(range: RangeInfo, row: number, col: number): boolean {
        return row >= range.topRow && row <= range.bottomRow && col >= range.topCol && col <= range.bottomCol;
    }

    recalculateAll(sheet: Sheet): void {
        const prefix = `${sheet.name}!`;
        const formulaKeys: string[] = [];

        for (const key of this.astCache.keys()) {
            if (key.startsWith(prefix)) {
                formulaKeys.push(key);
            }
        }

        if (formulaKeys.length === 0) return;

        const sortedKeys = this.#topologicalSort(formulaKeys);

        for (const key of sortedKeys) {
            const ast = this.astCache.get(key);
            if (!ast) continue;

            const [, row, col] = this.#parseKey(key);

            this.evaluator!.dependencies = new Set();
            let result: unknown;
            try {
                result = this.evaluator!.evaluate(ast, sheet, key);
            } catch (e) {
                result = "#VALUE!";
            }

            this.#updateDependencies(key, this.evaluator!.dependencies);

            const cell = sheet.cellStore.get(row, col);
            if (cell) {
                sheet.cellStore.set(row, col, new Cell(result, cell.styleId, cell.disabled, cell.formula));
                this.resultCache.set(key, result);
            }
        }
    }

    getDependencies(sheetName: string, row: number, col: number): string[] {
        const key = this.#cellKey(sheetName, row, col);
        const deps = this.dependsOn.get(key);
        return deps ? [...deps] : [];
    }

    getDependents(sheetName: string, row: number, col: number): string[] {
        const key = this.#cellKey(sheetName, row, col);
        const deps = this.dependents.get(key);
        return deps ? [...deps] : [];
    }

    static registerFunction(name: string, fn: (args: unknown[], ctx?: unknown) => unknown): void {
        functionRegistry.register(name, fn, { category: "custom" });
    }

    static unregisterFunction(name: string): boolean {
        return functionRegistry.unregister(name);
    }

    static hasFunction(name: string): boolean {
        return functionRegistry.has(name);
    }

    static getRegisteredFunctions(): string[] {
        return functionRegistry.list();
    }

    destroy(): void {
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

    #cellKey(sheetName: string, row: number, col: number): string {
        return `${sheetName}!${row},${col}`;
    }

    #parseKey(key: string): [string, number, number] {
        const match = key.match(FormulaEngine.#CELL_KEY_RE);
        if (!match) return ["", 0, 0];
        return [match[1], parseInt(match[2], 10), parseInt(match[3], 10)];
    }

    #parseRangeKey(key: string): RangeInfo | null {
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

    #isCellInRange(sheetName: string, row: number, col: number, rangeKey: string): boolean {
        const range = this.#parseRangeKey(rangeKey);
        if (!range) return false;
        if (range.sheetName !== sheetName) return false;
        return row >= range.topRow && row <= range.bottomRow && col >= range.topCol && col <= range.bottomCol;
    }

    #isRangeKey(key: string): boolean {
        return key.includes(":");
    }

    #addToSpatialIndex(rangeKey: string, range: RangeInfo): void {
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

    #removeFromSpatialIndex(rangeKey: string, range: RangeInfo | null): void {
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

    #findRangeDependents(sheetName: string, row: number, col: number, visitedFormulas: Set<string>): void {
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

    #topologicalSort(formulaKeys: string[]): string[] {
        const keySet = new Set(formulaKeys);
        const inDegree = new Map<string, number>();
        const adj = new Map<string, string[]>();

        for (const key of formulaKeys) {
            inDegree.set(key, 0);
            adj.set(key, []);
        }

        for (const key of formulaKeys) {
            const deps = this.dependsOn.get(key);
            if (!deps) continue;

            for (const dep of deps) {
                if (!this.#isRangeKey(dep) && keySet.has(dep)) {
                    inDegree.set(key, inDegree.get(key)! + 1);
                    adj.get(dep)!.push(key);
                }
            }
        }

        const queue: string[] = [];
        for (const [key, degree] of inDegree) {
            if (degree === 0) queue.push(key);
        }

        const sorted: string[] = [];
        while (queue.length > 0) {
            const key = queue.shift()!;
            sorted.push(key);

            for (const dependent of adj.get(key)!) {
                const newDegree = inDegree.get(dependent)! - 1;
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

    #updateDependencies(formulaKey: string, newDeps: Set<string>): void {
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
            this.dependents.get(dep)!.add(formulaKey);

            if (this.#isRangeKey(dep)) {
                if (!this.rangeDependents.has(dep)) {
                    this.rangeDependents.set(dep, new Set());
                    const range = this.#parseRangeKey(dep);
                    if (range) this.#addToSpatialIndex(dep, range);
                }
                this.rangeDependents.get(dep)!.add(formulaKey);
            }
        }
    }

    #updateDependenciesIfChanged(formulaKey: string, newDeps: Set<string>): boolean {
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

    #removeDependencies(formulaKey: string): void {
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

    #collectDirty(key: string, visited: Set<string>): void {
        if (visited.has(key)) return;
        visited.add(key);

        const depSet = this.dependents.get(key);
        if (!depSet) return;

        for (const formulaKey of depSet) {
            this.dirtyCells.add(formulaKey);
            this.#collectDirty(formulaKey, visited);
        }
    }

    #recalculate(sheet: Sheet): CellChange[] {
        const results: CellChange[] = [];

        for (const key of this.dirtyCells) {
            const ast = this.astCache.get(key);
            if (!ast) continue;

            const [sheetName, row, col] = this.#parseKey(key);
            const targetSheet = this.workbook?.sheets.get(sheetName) || sheet;

            this.evaluator!.dependencies = new Set();
            let result: unknown;
            try {
                result = this.evaluator!.evaluate(ast, targetSheet, key);
            } catch (e) {
                result = "#VALUE!";
            }

            const depsChanged = this.#updateDependenciesIfChanged(key, this.evaluator!.dependencies);

            const cell = targetSheet.cellStore.get(row, col);
            if (cell && cell.formula) {
                const oldValue = this.resultCache.get(key);
                const valueChanged = oldValue === undefined || oldValue !== result;

                if (valueChanged || depsChanged) {
                    targetSheet.cellStore.set(row, col, new Cell(result, cell.styleId, cell.disabled, cell.formula));
                    this.resultCache.set(key, result);
                    results.push({ sheetName, row, col, newValue: result });
                }
            }
        }

        this.dirtyCells.clear();

        return results;
    }

    #astToRaw(ast: ASTNode | null): string {
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

    evaluateForValidation(formulaStr: string, context: ValidationContext = {}): Promise<unknown> {
        return Promise.resolve().then(() => this.evaluateForValidationSync(formulaStr, context));
    }

    evaluateForValidationSync(formulaStr: string, context: ValidationContext = {}): unknown {
        if (!formulaStr || typeof formulaStr !== "string") {
            return true;
        }

        const raw = formulaStr.startsWith("=") ? formulaStr.substring(1) : formulaStr;

        let ast: ASTNode;
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
        let targetSheet: Sheet | null | undefined;
        if (sheet && typeof sheet === "object" && "cellStore" in sheet) {
            targetSheet = sheet as Sheet;
        } else {
            targetSheet = this.workbook?.getActiveSheet();
        }

        if (!targetSheet) {
            errorHandler.debug(ERROR_CODE.VALIDATION_ERROR, "验证上下文缺少 sheet", { context });
            return false;
        }

        const virtualSheet = this.#createVirtualSheet(targetSheet, row ?? 0, col ?? 0, value);

        this.evaluator!.dependencies = new Set();

        try {
            const result = this.evaluator!.evaluate(ast, virtualSheet);
            return result;
        } catch (evalError) {
            errorHandler.debug(ERROR_CODE.FORMULA_EVAL_ERROR, `验证公式求值失败: ${formulaStr}`, {
                formulaStr,
                error: evalError,
            });
            return false;
        }
    }

    #createVirtualSheet(realSheet: Sheet, row: number, col: number, value: unknown): Sheet {
        return {
            name: realSheet.name,
            cellStore: {
                get: (r: number, c: number) => {
                    if (r === row && c === col) {
                        return new Cell(value, 0, false, null);
                    }
                    return realSheet.cellStore?.get?.(r, c) || null;
                },
                set: () => {},
                chunks: realSheet.cellStore?.chunks,
            },
            cellDataAccessor: realSheet.cellDataAccessor,
            getAllCells: () => [],
            _invalidateCellInternal: () => {},
        } as unknown as Sheet;
    }
}
