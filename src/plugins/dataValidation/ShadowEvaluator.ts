import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { indexToCol } from "../../utils/cellRef.js";

const VOLATILE_FUNCTIONS: readonly string[] = Object.freeze(["INDIRECT", "OFFSET", "RAND", "RANDBETWEEN", "NOW", "TODAY"]);

interface ShadowContext {
    row?: number;
    col?: number;
    value?: any;
    sheet?: string;
}

interface ReadOnlyCellStore {
    get: (row: number, col: number) => any;
    set: () => never;
    setValue: () => never;
    delete: () => never;
    has: (row: number, col: number) => boolean;
}

export class ShadowEvaluator {
    #parentEngine: any = null;
    #context: {
        currentCell: { row: number; col: number; value: any };
        sheet: string;
        mode: string;
    } | null = null;
    #trackedDependencies: Set<string> = new Set();
    #destroyed: boolean = false;
    #readOnlyCellStore: ReadOnlyCellStore | null = null;
    #realCellStore: any | null = null;

    constructor(parentEngine: any, context: ShadowContext) {
        this.#parentEngine = parentEngine;
        this.#context = {
            currentCell: {
                row: context.row ?? 0,
                col: context.col ?? 0,
                value: context.value,
            },
            sheet: context.sheet || "Sheet1",
            mode: "validation",
        };

        this.#realCellStore = parentEngine?.cellStore || null;
        this.#readOnlyCellStore = this.#createReadOnlyProxy();
    }

    async evaluate(formula: string): Promise<boolean> {
        if (this.#destroyed) {
            throw new Error("[ShadowEvaluator] 求值器已销毁，无法执行求值");
        }

        this.#checkVolatileFunctions(formula);

        try {
            const result = await this.#executeInSandbox(formula);
            return !!result;
        } catch (error: any) {
            if (error.message?.includes("[SECURITY]")) {
                throw error;
            }
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[ShadowEvaluator] 沙箱求值失败:", error);
            throw error;
        }
    }

    getTrackedDependencies(): Set<string> {
        return new Set(this.#trackedDependencies);
    }

    destroy(): void {
        this.#destroyed = true;
        this.#parentEngine = null;
        this.#context = null;
        this.#trackedDependencies.clear();
        this.#readOnlyCellStore = null;
        this.#realCellStore = null;
    }

    #checkVolatileFunctions(formula: string): void {
        const upperFormula = formula.toUpperCase();

        for (const fnName of VOLATILE_FUNCTIONS) {
            const pattern = new RegExp(`\\b${fnName}\\s*\\(`, "g");
            if (pattern.test(upperFormula)) {
                throw new Error(`[SECURITY] 验证模式下不支持易变函数: ${fnName}。易变函数在验证时可能产生不可预测的结果。`);
            }
        }
    }

    async #executeInSandbox(formula: string): Promise<any> {
        if (!this.#parentEngine) {
            throw new Error("[ShadowEvaluator] 父 FormulaEngine 未提供");
        }

        const evaluateFn =
            this.#parentEngine.evaluateInContext?.bind(this.#parentEngine) || this.#parentEngine.evaluateFormula?.bind(this.#parentEngine);

        if (!evaluateFn) {
            throw new Error("[ShadowEvaluator] 父 FormulaEngine 缺少必要的求值方法");
        }

        const sandboxContext = {
            currentCell: this.#context!.currentCell,
            sheet: this.#context!.sheet,
            mode: "validation",
            readOnly: true,
            cellStore: this.#readOnlyCellStore,
            disableHooks: true,
            disableCaching: true,
            disableDependencyTracking: true,
            onCellAccess: (row: number, col: number, sheet?: string) => {
                this.#trackedDependencies.add(`${sheet || this.#context!.sheet}!${indexToCol(col)}${row + 1}`);
            },
        };

        return await evaluateFn(formula, sandboxContext);
    }

    #createReadOnlyProxy(): ReadOnlyCellStore {
        const self = this;

        return {
            get(row: number, col: number) {
                if (self.#context?.currentCell?.row === row && self.#context?.currentCell?.col === col) {
                    return { value: self.#context.currentCell.value };
                }

                if (self.#realCellStore && typeof self.#realCellStore.get === "function") {
                    return self.#realCellStore.get(row, col);
                }

                return null;
            },

            set() {
                throw new Error("[SECURITY] 写入操作在验证模式下被禁止");
            },

            setValue() {
                throw new Error("[SECURITY] 写入操作在验证模式下被禁止");
            },

            delete() {
                throw new Error("[SECURITY] 删除操作在验证模式下被禁止");
            },

            has(row: number, col: number) {
                if (self.#context?.currentCell?.row === row && self.#context?.currentCell?.col === col) {
                    return true;
                }
                if (self.#realCellStore && typeof self.#realCellStore.has === "function") {
                    return self.#realCellStore.has(row, col);
                }
                return false;
            },
        };
    }
}

export { VOLATILE_FUNCTIONS };
