import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

interface ComplexityResult {
    score: number;
    level: "simple" | "moderate" | "complex" | "dangerous";
    factors: Record<string, number>;
    recommendation: "direct" | "shadow" | "reject";
}

/**
 * 复杂度分析器
 *
 * 分析公式复杂度，为验证引擎选择最优执行路径：
 * - simple (0-20)：直接执行
 * - moderate (21-50)：直接执行，但记录警告
 * - complex (51-100)：沙箱隔离执行
 * - dangerous (>100)：拒绝执行
 */
export class ComplexityAnalyzer {
    #weights: Record<string, number> = {
        nesting: 15,
        functionCalls: 8,
        arrayOps: 12,
        stringOps: 5,
        mathOps: 3,
        conditionalOps: 10,
        referenceOps: 6,
        volatileOps: 20,
    };

    analyze(formula: string): ComplexityResult {
        if (!formula || typeof formula !== "string") {
            return {
                score: 0,
                level: "simple",
                factors: {},
                recommendation: "direct",
            };
        }

        const cleaned = formula.replace(/^=/, "");

        const factors: Record<string, number> = {
            nesting: this.analyzeNestingDepth(cleaned),
            functionCalls: this.countFunctionCalls(cleaned),
            arrayOps: this.countArrayOperations(cleaned),
            stringOps: this.countStringOperations(cleaned),
            mathOps: this.countMathOperations(cleaned),
            conditionalOps: this.countConditionalOperations(cleaned),
            referenceOps: this.countReferences(cleaned),
            volatileOps: this.countVolatileFunctions(cleaned),
        };

        let score = 0;
        for (const [factor, count] of Object.entries(factors)) {
            const weight = this.#weights[factor] || 1;
            score += count * weight;
        }

        score = Math.min(score, 200);

        let level: ComplexityResult["level"];
        let recommendation: ComplexityResult["recommendation"];

        if (score <= 20) {
            level = "simple";
            recommendation = "direct";
        } else if (score <= 50) {
            level = "moderate";
            recommendation = "direct";
        } else if (score <= 100) {
            level = "complex";
            recommendation = "shadow";
        } else {
            level = "dangerous";
            recommendation = "reject";
        }

        return { score, level, factors, recommendation };
    }

    analyzeNestingDepth(formula: string): number {
        let maxDepth = 0;
        let currentDepth = 0;

        for (const char of formula) {
            if (char === "(") {
                currentDepth++;
                maxDepth = Math.max(maxDepth, currentDepth);
            } else if (char === ")") {
                currentDepth = Math.max(0, currentDepth - 1);
            }
        }

        return maxDepth;
    }

    countFunctionCalls(formula: string): number {
        const matches = formula.match(/[A-Z]+\s*\(/g);
        return matches ? matches.length : 0;
    }

    countArrayOperations(formula: string): number {
        const arrayFuncs = ["SUM", "AVERAGE", "COUNT", "MAX", "MIN", "SUMIF", "COUNTIF", "VLOOKUP", "INDEX", "MATCH"];
        let count = 0;
        for (const func of arrayFuncs) {
            const regex = new RegExp(`\\b${func}\\s*\\(`, "gi");
            const matches = formula.match(regex);
            if (matches) count += matches.length;
        }
        return count;
    }

    countStringOperations(formula: string): number {
        const stringFuncs = ["LEFT", "RIGHT", "MID", "LEN", "FIND", "SEARCH", "REPLACE", "SUBSTITUTE", "CONCATENATE", "TEXT"];
        let count = 0;
        for (const func of stringFuncs) {
            const regex = new RegExp(`\\b${func}\\s*\\(`, "gi");
            const matches = formula.match(regex);
            if (matches) count += matches.length;
        }
        return count;
    }

    countMathOperations(formula: string): number {
        const matches = formula.match(/[+\-*/^%]/g);
        return matches ? matches.length : 0;
    }

    countConditionalOperations(formula: string): number {
        const condFuncs = ["IF", "IFS", "SWITCH", "AND", "OR", "NOT"];
        let count = 0;
        for (const func of condFuncs) {
            const regex = new RegExp(`\\b${func}\\s*\\(`, "gi");
            const matches = formula.match(regex);
            if (matches) count += matches.length;
        }
        return count;
    }

    countReferences(formula: string): number {
        const matches = formula.match(/\$?[A-Z]+\$?\d+/g);
        return matches ? matches.length : 0;
    }

    countVolatileFunctions(formula: string): number {
        const volatileFuncs = ["NOW", "TODAY", "RAND", "RANDBETWEEN", "OFFSET", "INDIRECT"];
        let count = 0;
        for (const func of volatileFuncs) {
            const regex = new RegExp(`\\b${func}\\s*\\(`, "gi");
            const matches = formula.match(regex);
            if (matches) count += matches.length;
        }
        return count;
    }
}
