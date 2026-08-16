import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

interface ResolveContext {
    currentSheet?: string;
    [key: string]: any;
}

/**
 * 列表数据源解析器
 *
 * 负责将下拉列表验证规则中的 source 字符串解析为实际选项数组。
 * 支持两种格式：
 * 1. 静态数组字符串：'["选项1","选项2","选项3"]'
 * 2. 动态区域引用：'=Sheet1!$A$1:$A$10' 或 '=$A$1:$A$10'
 */
export class ListSourceResolver {
    #cellStore: any;
    #sheetManager: any;
    #cache: Map<string, { data: string[]; timestamp: number }> = new Map();
    #cacheTTL: number = 30000;

    constructor(cellStore: any, sheetManager: any = null) {
        this.#cellStore = cellStore;
        this.#sheetManager = sheetManager;
    }

    async resolve(source: string, context: ResolveContext = {}): Promise<string[]> {
        if (!source || typeof source !== "string") {
            return [];
        }

        const trimmed = source.trim();

        if (trimmed.startsWith("[")) {
            return this.parseStaticArray(trimmed);
        }

        if (trimmed.startsWith("=")) {
            const cacheKey = trimmed;
            const cached = this.#cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.#cacheTTL) {
                return cached.data;
            }

            const result = await this.resolveDynamicReference(trimmed, context);
            this.#cache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        }

        return trimmed
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item !== "");
    }

    parseStaticArray(source: string): string[] {
        try {
            const parsed = JSON.parse(source);
            if (Array.isArray(parsed)) {
                return parsed.map(String);
            }
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ListSourceResolver] 静态数组解析结果不是数组:", parsed);
            return [];
        } catch (e: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[ListSourceResolver] 静态数组解析失败:", e);
            return [];
        }
    }

    async resolveDynamicReference(ref: string, context: ResolveContext = {}): Promise<string[]> {
        const formula = ref.substring(1);

        const match = formula.match(/^(?:(\w+)!)?\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/);
        if (!match) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[ListSourceResolver] 无法解析区域引用: ${ref}`);
            return [];
        }

        const sheetName = match[1] || context.currentSheet || "";
        const startCol = this.colToIndex(match[2]);
        const startRow = parseInt(match[3]) - 1;
        const endCol = this.colToIndex(match[4]);
        const endRow = parseInt(match[5]) - 1;

        let cellStore = this.#cellStore;

        if (sheetName && this.#sheetManager) {
            try {
                const sheet = this.#sheetManager.getSheet(sheetName);
                if (sheet) {
                    cellStore = sheet.cellStore;
                }
            } catch (e: any) {
                errorHandler.error(ERROR_CODE.VALIDATION_ERROR, `[ListSourceResolver] 获取工作表 "${sheetName}" 失败:`, e);
                return [];
            }
        }

        if (!cellStore) {
            errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ListSourceResolver] CellStore 不可用");
            return [];
        }

        const values: string[] = [];
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const cell = cellStore.getCell ? cellStore.getCell(row, col) : cellStore.get(row, col);
                if (cell?.value != null && cell.value !== "") {
                    values.push(String(cell.value));
                }
            }
        }

        return values;
    }

    colToIndex(col: string): number {
        let index = 0;
        for (let i = 0; i < col.length; i++) {
            index = index * 26 + (col.charCodeAt(i) - 64);
        }
        return index - 1;
    }

    clearCache(): void {
        this.#cache.clear();
    }

    setCacheTTL(ttl: number): void {
        this.#cacheTTL = ttl;
    }
}
