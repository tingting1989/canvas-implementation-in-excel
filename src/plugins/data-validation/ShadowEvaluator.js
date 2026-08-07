import {errorHandler} from "../../core/ErrorHandler.js";
import {ERROR_CODE} from "../../constants/errorCodes.js";
import { indexToCol } from "../../utils/cellRef.js";

const VOLATILE_FUNCTIONS = Object.freeze(["INDIRECT", "OFFSET", "RAND", "RANDBETWEEN", "NOW", "TODAY"]);

/**
 * 影子求值器（Shadow Evaluator）
 *
 * 为数据验证提供完全隔离的公式求值环境，确保零副作用：
 * - ❌ 禁止写入 CellStore
 * - ❌ 禁止更新 DependencyGraph
 * - ❌ 禁止触发 Hooks
 * - ❌ 禁止写入 Cache
 * - ❌ 禁止调用 setVirtualCell
 * - ✅ 只读访问 CellStore（优先返回上下文中的虚拟值）
 * - ✅ 跟踪依赖（仅调试/分析用，不写入任何存储）
 * - ❌ 禁止使用易变函数（INDIRECT/OFFSET/RAND/RANDBETWEEN/NOW/TODAY）
 *
 * @example
 * const shadow = new ShadowEvaluator(formulaEngine, {
 *     currentCell: { row: 0, col: 0, value: 50 },
 *     sheet: 'Sheet1'
 * });
 *
 * try {
 *     const result = await shadow.evaluate('=AND(A1>0, A1<100)');
 *     console.log(result); // true
 * } finally {
 *     shadow.destroy();
 * }
 */
export class ShadowEvaluator {
    /** @type {Object|null} 父 FormulaEngine 引用 */
    #parentEngine = null;

    /** @type {Object|null} 只读上下文 */
    #context = null;

    /** @type {Set<string>} 本次求值跟踪的依赖 */
    #trackedDependencies = new Set();

    /** @type {boolean} 是否已销毁 */
    #destroyed = false;

    /** @type {Object} 拦截后的只读代理 */
    #readOnlyCellStore = null;

    /** @type {Object|null} 原始 CellStore 引用（用于只读访问） */
    #realCellStore = null;

    /**
     * 构造影子求值器
     *
     * @param {Object} parentEngine - 父 FormulaEngine 实例
     * @param {Object} context - 验证上下文
     * @param {number} context.row - 当前行号
     * @param {number} context.col - 当前列号
     * @param {*} context.value - 当前正在验证的值（尚未落盘）
     * @param {string} [context.sheet='Sheet1'] - 工作表名称
     */
    constructor(parentEngine, context) {
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

    /**
     * 在隔离沙箱中执行公式求值
     *
     * @param {string} formula - 公式字符串（如 '=AND(A1>0, A1<100)'）
     * @returns {Promise<boolean>} TRUE=通过, FALSE=拒绝
     * @throws {Error} 包含易变函数时抛出安全异常
     * @throws {Error} 求值器已销毁时抛出异常
     */
    async evaluate(formula) {
        if (this.#destroyed) {
            throw new Error("[ShadowEvaluator] 求值器已销毁，无法执行求值");
        }

        this.#checkVolatileFunctions(formula);

        try {
            const result = await this.#executeInSandbox(formula);
            return !!result;
        } catch (error) {
            if (error.message?.includes("[SECURITY]")) {
                throw error;
            }
            errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, "[ShadowEvaluator] 沙箱求值失败:", error);
            throw error;
        }
    }

    /**
     * 获取本次求值跟踪的依赖（仅调试/分析用）
     *
     * @returns {Set<string>} 依赖集合，格式为 "Sheet1!A1"
     */
    getTrackedDependencies() {
        return new Set(this.#trackedDependencies);
    }

    /**
     * 销毁影子实例（释放内存，防止泄漏）
     *
     * 销毁后不可再调用 evaluate()。
     * 必须在验证完成后调用，否则可能造成内存泄漏。
     */
    destroy() {
        this.#destroyed = true;
        this.#parentEngine = null;
        this.#context = null;
        this.#trackedDependencies.clear();
        this.#readOnlyCellStore = null;
        this.#realCellStore = null;
    }

    /**
     * 检查公式是否包含易变函数
     *
     * @private
     * @param {string} formula - 公式字符串
     * @throws {Error} 包含易变函数时抛出安全异常
     */
    #checkVolatileFunctions(formula) {
        const upperFormula = formula.toUpperCase();

        for (const fnName of VOLATILE_FUNCTIONS) {
            const pattern = new RegExp(`\\b${fnName}\\s*\\(`, "g");
            if (pattern.test(upperFormula)) {
                throw new Error(`[SECURITY] 验证模式下不支持易变函数: ${fnName}。易变函数在验证时可能产生不可预测的结果。`);
            }
        }
    }

    /**
     * 在沙箱中执行求值
     *
     * 使用父引擎的 AST 解析能力，但替换运行时环境为只读代理。
     *
     * @private
     * @param {string} formula - 公式字符串
     * @returns {Promise<*>} 求值结果
     */
    async #executeInSandbox(formula) {
        if (!this.#parentEngine) {
            throw new Error("[ShadowEvaluator] 父 FormulaEngine 未提供");
        }

        const evaluateFn =
            this.#parentEngine.evaluateInContext?.bind(this.#parentEngine) || this.#parentEngine.evaluateFormula?.bind(this.#parentEngine);

        if (!evaluateFn) {
            throw new Error("[ShadowEvaluator] 父 FormulaEngine 缺少必要的求值方法");
        }

        const sandboxContext = {
            currentCell: this.#context.currentCell,
            sheet: this.#context.sheet,
            mode: "validation",
            readOnly: true,
            cellStore: this.#readOnlyCellStore,
            disableHooks: true,
            disableCaching: true,
            disableDependencyTracking: true,
            onCellAccess: (row, col, sheet) => {
                this.#trackedDependencies.add(`${sheet || this.#context.sheet}!${indexToCol(col)}${row + 1}`);
            },
        };

        return await evaluateFn(formula, sandboxContext);
    }

    /**
     * 创建 CellStore 的只读代理
     *
     * 拦截所有写入操作，优先返回上下文中的虚拟值。
     *
     * @private
     * @returns {Object} 只读代理对象
     */
    #createReadOnlyProxy() {
        const self = this;

        return {
            get(row, col) {
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

            has(row, col) {
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
