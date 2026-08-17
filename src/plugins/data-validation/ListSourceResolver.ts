import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

const CACHE_TTL = 5000;

interface ResolveOptions {
    currentSheet?: string;
    skipHidden?: boolean;
    useSnapshot?: boolean;
}

interface ParsedRange {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
    sheetName: string | null;
}

export class ListSourceResolver {
    #cellStore: any = null;
    #sheetManager: any = null;
    #cache: Map<string, { values: string[]; timestamp: number }> = new Map();
    #watchers: Map<string, Set<Function>> = new Map();

    constructor(cellStore: any, sheetManager: any = null) {
        this.#cellStore = cellStore;
        this.#sheetManager = sheetManager;
    }

    async resolve(source: string[] | string, options: ResolveOptions = {}): Promise<string[]> {
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

    async resolveDynamicRange(rangeRef: string, options: ResolveOptions = {}): Promise<string[]> {
        return this.#resolveDynamicRange(rangeRef, options);
    }

    parseRange(rangeRef: string): ParsedRange {
        const cleaned = rangeRef.replace(/\$/g, "");

        let sheetName: string | null = null;
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

    watchRangeChanges(rangeRef: string, callback: Function): () => void {
        if (!this.#watchers.has(rangeRef)) {
            this.#watchers.set(rangeRef, new Set());
        }

        this.#watchers.get(rangeRef)!.add(callback);

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

    invalidateCache(rangeRef: string): void {
        const cacheKey = this.#getCacheKey(rangeRef);
        this.#cache.delete(cacheKey);

        const watchers = this.#watchers.get(rangeRef);
        if (watchers) {
            watchers.forEach((cb) => {
                try {
                    cb();
                } catch (e: any) {
                    errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[ListSourceResolver] watcher 回调执行失败:", e);
                }
            });
        }
    }

    clearCache(): void {
        this.#cache.clear();
    }

    destroy(): void {
        this.#cache.clear();
        this.#watchers.clear();
        this.#cellStore = null;
        this.#sheetManager = null;
    }

    #resolveStatic(source: any[]): string[] {
        if (source.length === 0) return [];

        if (typeof source[0] === "object" && source[0] !== null && "value" in source[0]) {
            return source.map((item) => String(item.value)).filter((v) => v !== "" && v !== "undefined" && v !== "null");
        }

        return source.map((item) => String(item)).filter((v) => v !== "" && v !== "undefined" && v !== "null");
    }

    async #resolveDynamicRange(rangeRef: string, options: ResolveOptions = {}): Promise<string[]> {
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

            const values: string[] = [];

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
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, `[ListSourceResolver] 解析动态引用失败: "${rangeRef}"`, error);
            return [];
        }
    }

    async #resolveComputed(formula: string, options: ResolveOptions = {}): Promise<string[]> {
        errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[ListSourceResolver] 计算公式尚未实现: "${formula}"，返回空数组`);
        return [];
    }

    #isComputedFormula(formula: string): boolean {
        const COMPUTED_FUNCTIONS = ["UNIQUE", "SORT", "FILTER", "CHOOSE", "SEQUENCE"];
        const upper = formula.toUpperCase().trim();
        return COMPUTED_FUNCTIONS.some((fn) => upper.startsWith(fn + "("));
    }

    #resolveCellStore(sheetName: string | null, currentSheet?: string): any | null {
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

    #isHiddenCell(cellStore: any, row: number, col: number): boolean {
        if (cellStore.sheet && typeof cellStore.sheet.isRowHidden === "function") {
            if (cellStore.sheet.isRowHidden(row)) return true;
        }

        if (cellStore.sheet && typeof cellStore.sheet.isColHidden === "function") {
            if (cellStore.sheet.isColHidden(col)) return true;
        }

        return false;
    }

    #colToNumber(colStr: string): number {
        let num = 0;
        for (let i = 0; i < colStr.length; i++) {
            num = num * 26 + (colStr.charCodeAt(i) - 64);
        }
        return num - 1;
    }

    #getCacheKey(rangeRef: string): string {
        return `list_source:${rangeRef.replace(/\$/g, "")}`;
    }
}

export { CACHE_TTL };
