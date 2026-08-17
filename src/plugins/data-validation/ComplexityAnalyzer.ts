import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { isString } from "../../utils/helper.js";

export const FUNCTION_CATEGORY = Object.freeze({
    AGGREGATE: "AGGREGATE",
    LOOKUP: "LOOKUP",
    VOLATILE: "VOLATILE",
    CONDITIONAL: "CONDITIONAL",
    LOGICAL: "LOGICAL",
    TEXT: "TEXT",
    MATH: "MATH",
    CUSTOM: "CUSTOM",
});

export const COMPLEXITY_THRESHOLD = Object.freeze({
    SYNC_FAST_PATH_MAX: 2,
    SYNC_TIME_LIMIT_MS: 10,
    MAX_COMPLEXITY_SCORE: 10,
    DEPTH_WARNING_LEVEL: 3,
});

interface ASTNode {
    type: string;
    value?: string;
    name?: string;
    children: ASTNode[];
    depth: number;
}

interface AnalysisMetadata {
    depth: number;
    functionCount: number;
    refCount: number;
    formulaLength: number;
    analysisTime: number;
}

interface AnalysisResult {
    complexity: number;
    canUseSyncFastPath: boolean;
    path: string;
    reasons: string[];
    estimatedTime: number;
    metadata: AnalysisMetadata | Record<string, any>;
}

export class ComplexityAnalyzer {
    config: Record<string, any>;
    AGGREGATE_FUNCTIONS: readonly string[];
    LOOKUP_FUNCTIONS: readonly string[];
    VOLATILE_FUNCTIONS: readonly string[];
    CONDITIONAL_FUNCTIONS: readonly string[];
    LOGICAL_FUNCTIONS: readonly string[];
    TEXT_FUNCTIONS: readonly string[];
    MATH_FUNCTIONS: readonly string[];
    #astCache: Map<string, ASTNode>;
    #cacheMaxSize: number;

    constructor(config: Record<string, any> = {}) {
        this.config = {
            syncThreshold: COMPLEXITY_THRESHOLD.SYNC_TIME_LIMIT_MS,
            maxDepth: 8,
            cacheMaxSize: 1000,
            ...config,
        };

        this.AGGREGATE_FUNCTIONS = Object.freeze([
            "SUM",
            "AVERAGE",
            "COUNT",
            "COUNTA",
            "COUNTIF",
            "SUMPRODUCT",
            "MAX",
            "MIN",
            "STDEV",
            "VAR",
            "SUBTOTAL",
        ]);

        this.LOOKUP_FUNCTIONS = Object.freeze(["VLOOKUP", "HLOOKUP", "INDEX", "MATCH", "LOOKUP", "XLOOKUP"]);

        this.VOLATILE_FUNCTIONS = Object.freeze(["NOW", "TODAY", "RAND", "RANDBETWEEN", "INDIRECT", "OFFSET"]);

        this.CONDITIONAL_FUNCTIONS = Object.freeze(["SUMIF", "SUMIFS", "COUNTIF", "COUNTIFS", "AVERAGEIF", "AVERAGEIFS"]);

        this.LOGICAL_FUNCTIONS = Object.freeze(["IF", "AND", "OR", "NOT", "IFERROR", "IFNA", "XOR"]);

        this.TEXT_FUNCTIONS = Object.freeze([
            "LEN",
            "LEFT",
            "RIGHT",
            "MID",
            "FIND",
            "SEARCH",
            "SUBSTITUTE",
            "TRIM",
            "UPPER",
            "LOWER",
            "CONCAT",
            "TEXT",
        ]);

        this.MATH_FUNCTIONS = Object.freeze(["ABS", "ROUND", "ROUNDUP", "ROUNDDOWN", "INT", "MOD", "POWER", "SQRT", "CEILING", "FLOOR"]);

        this.#astCache = new Map();
        this.#cacheMaxSize = config.cacheMaxSize || 1000;
    }

    analyze(formula: string): AnalysisResult {
        const startTime = performance.now();

        try {
            if (!isString(formula) || formula.trim().length === 0) {
                return this.#createResult(0, true, [], 0);
            }

            let ast: ASTNode;
            try {
                ast = this.#parseAST(formula);
            } catch (error: any) {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[ComplexityAnalyzer] 公式解析失败: ${formula}`, { error });
                return this.#createResult(COMPLEXITY_THRESHOLD.MAX_COMPLEXITY_SCORE, false, [`公式语法错误: ${error.message}`], Infinity);
            }

            const depth = this.#getNestingDepth(ast);
            const functionsUsed = this.#extractFunctions(ast);
            const refCount = this.#countCellReferences(ast);

            let score = 0;
            const reasons: string[] = [];

            if (depth > COMPLEXITY_THRESHOLD.DEPTH_WARNING_LEVEL) {
                score += (depth - COMPLEXITY_THRESHOLD.DEPTH_WARNING_LEVEL) * 2;
                reasons.push(`嵌套过深 (${depth}层 > ${COMPLEXITY_THRESHOLD.DEPTH_WARNING_LEVEL}层)`);
            }

            for (const func of functionsUsed) {
                if (this.AGGREGATE_FUNCTIONS.includes(func)) {
                    score += 4;
                    reasons.push(`聚合函数: ${func}`);
                } else if (this.LOOKUP_FUNCTIONS.includes(func)) {
                    score += 5;
                    reasons.push(`查找函数: ${func}`);
                } else if (this.VOLATILE_FUNCTIONS.includes(func)) {
                    score += 6;
                    reasons.push(`易变函数: ${func}`);
                } else if (this.CONDITIONAL_FUNCTIONS.includes(func)) {
                    score += 4;
                    reasons.push(`条件聚合函数: ${func}`);
                }
            }

            if (refCount > 10) {
                score += Math.min(refCount - 10, 10) + Math.floor((refCount - 10) / 5);
                reasons.push(`大量单元格引用 (${refCount}个)`);
            }

            if (formula.length > 100) {
                score += Math.floor(formula.length / 50);
                reasons.push(`公式较长 (${formula.length}字符)`);
            }

            const complexity = Math.min(score, COMPLEXITY_THRESHOLD.MAX_COMPLEXITY_SCORE);
            const canUseSyncFastPath = complexity <= COMPLEXITY_THRESHOLD.SYNC_FAST_PATH_MAX;
            const estimatedTime = this.#estimateTime(complexity, functionsUsed, refCount);
            const path = canUseSyncFastPath ? "sync-fast-path" : "async-pipeline";

            const result: AnalysisResult = {
                complexity,
                canUseSyncFastPath,
                path,
                reasons,
                estimatedTime,
                metadata: {
                    depth,
                    functionCount: functionsUsed.length,
                    refCount,
                    formulaLength: formula.length,
                    analysisTime: performance.now() - startTime,
                },
            };

            errorHandler.debug(
                ERROR_CODE.VALIDATION_DEBUG_LOG,
                `[ComplexityAnalyzer] 分析完成: complexity=${complexity}, path=${path}, time=${estimatedTime.toFixed(1)}ms`,
            );

            return result;
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, `[ComplexityAnalyzer] 分析过程异常`, { error, formula });

            return this.#createResult(COMPLEXITY_THRESHOLD.MAX_COMPLEXITY_SCORE, false, [`分析异常: ${error.message}`], Infinity);
        }
    }

    #createResult(complexity: number, canUseSyncFastPath: boolean, reasons: string[], estimatedTime: number): AnalysisResult {
        return {
            complexity,
            canUseSyncFastPath,
            path: canUseSyncFastPath ? "sync-fast-path" : "async-pipeline",
            reasons,
            estimatedTime,
            metadata: {},
        };
    }

    #parseAST(formula: string): ASTNode {
        if (this.#astCache.has(formula)) {
            return this.#astCache.get(formula)!;
        }

        const ast: ASTNode = {
            type: "formula",
            value: formula,
            children: [],
            depth: 0,
        };

        this.#buildSimpleAST(ast, formula);

        if (this.#astCache.size >= this.#cacheMaxSize) {
            const firstKey = this.#astCache.keys().next().value as string;
            this.#astCache.delete(firstKey);
        }
        this.#astCache.set(formula, ast);

        return ast;
    }

    #buildSimpleAST(node: ASTNode, formula: string): void {
        const functionRegex = /\b([A-Z_][A-Z0-9_]*)\s*\(/gi;
        let match: RegExpExecArray | null;
        let maxDepth = 0;

        while ((match = functionRegex.exec(formula)) !== null) {
            const funcName = match[1].toUpperCase();

            let parenCount = 1;
            let pos = match.index + match[0].length;

            while (pos < formula.length && parenCount > 0) {
                if (formula[pos] === "(") {
                    parenCount++;
                } else if (formula[pos] === ")") {
                    parenCount--;
                }
                pos++;
            }

            const innerFormula = formula.substring(match.index + match[0].length, pos - 1);

            const childNode: ASTNode = {
                type: "function",
                name: funcName,
                children: [],
                depth: node.depth + 1,
            };

            this.#buildSimpleAST(childNode, innerFormula);

            node.children.push(childNode);
            maxDepth = Math.max(maxDepth, childNode.depth);
        }

        node.depth = maxDepth;
    }

    #getNestingDepth(ast: ASTNode | null): number {
        if (!ast || !ast.children || ast.children.length === 0) {
            return 0;
        }

        return Math.max(...ast.children.map((child) => this.#getNestingDepth(child))) + 1;
    }

    #extractFunctions(ast: ASTNode | null): string[] {
        const functions: string[] = [];

        if (!ast || !ast.children) {
            return functions;
        }

        for (const child of ast.children) {
            if (child.type === "function" && child.name) {
                functions.push(child.name);
            }
            functions.push(...this.#extractFunctions(child));
        }

        return [...new Set(functions)];
    }

    #countCellReferences(ast: ASTNode | null): number {
        if (!ast || !ast.value) {
            return 0;
        }

        const cellRefPatterns: RegExp[] = [/\$?[A-Z]+\$?\d+/g, /[A-Z]+\d+:[A-Z]+\d+/g, /'[^']+'!\$?[A-Z]+\$?\d+/g];

        let count = 0;
        for (const pattern of cellRefPatterns) {
            const matches = ast.value.match(pattern);
            if (matches) {
                count += matches.length;
            }
        }

        return count;
    }

    #estimateTime(complexity: number, functionsUsed: string[], refCount: number): number {
        let baseTime = 0.5;

        baseTime += complexity * 2;

        for (const func of functionsUsed) {
            if (this.LOOKUP_FUNCTIONS.includes(func)) {
                baseTime += 30;
            } else if (this.AGGREGATE_FUNCTIONS.includes(func)) {
                baseTime += 15;
            } else if (this.CONDITIONAL_FUNCTIONS.includes(func)) {
                baseTime += 20;
            } else if (this.VOLATILE_FUNCTIONS.includes(func)) {
                baseTime += 25;
            } else {
                baseTime += 2;
            }
        }

        baseTime += refCount * 0.5;

        const variance = baseTime * 0.05;
        baseTime += (Math.random() - 0.5) * variance;

        return Math.max(0.1, baseTime);
    }

    clearCache(): void {
        this.#astCache.clear();
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ComplexityAnalyzer] ✅ AST 缓存已清除");
    }

    getCacheStats(): { size: number; maxSize: number; usage: string } {
        return {
            size: this.#astCache.size,
            maxSize: this.#cacheMaxSize,
            usage: `${((this.#astCache.size / this.#cacheMaxSize) * 100).toFixed(1)}%`,
        };
    }
}

export const complexityAnalyzer = new ComplexityAnalyzer();

export default ComplexityAnalyzer;
