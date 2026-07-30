import { functionRegistry } from "./functions/index.js";
import { isNumber, isString } from "../utils/helper.js";
import { ERROR_CODE, errorHandler } from "../core/ErrorHandler.js";

/**
 * 公式求值器 (Formula Evaluator)
 *
 * 核心功能：遍历抽象语法树（AST）并递归计算公式的最终结果。
 *
 * 在公式引擎的三阶段架构中的角色：
 * ┌─────────────────┐   ┌──────────────────┐   ┌─────────────────┐
 * │  FormulaParser   │ → │ FormulaEvaluator │ → │  FormulaEngine   │
 * │  字符串 → AST    │   │  AST → 结果值    │   │  依赖管理+重算   │
 * └─────────────────┘   └──────────────────┘   └─────────────────┘
 *
 * 支持的 AST 节点类型及处理策略：
 * ┌────────────┬────────────────────────────────────────────────┐
 * │ 节点类型   │ 处理方式                                       │
 * ├────────────┼────────────────────────────────────────────────┤
 * │ literal    │ 直接返回字面值（数字、字符串、布尔值）          │
 * │ cellRef    │ 从工作表读取单元格值（支持跨表引用）           │
 * │ rangeRef   │ 读取矩形区域，返回二维数组                     │
 * │ function   │ 查找并执行注册表中的函数                        │
 * │ unaryOp    │ 一元运算（目前仅支持负号 -）                   │
 * │ binaryOp   │ 二元运算（算术/比较/逻辑/文本连接）            │
 * └────────────┴────────────────────────────────────────────────┘
 *
 * 核心职责：
 * 1. **递归求值**：深度优先遍历AST，自底向上计算结果
 * 2. **依赖收集**：记录访问的所有单元格和范围（用于依赖追踪）
 * 3. **循环检测**：维护调用栈，防止无限递归导致的栈溢出
 * 4. **错误处理**：将异常转换为Excel标准的错误值（#DIV/0!等）
 * 5. **类型转换**：自动将文本转换为数字以支持混合运算
 *
 * 使用示例：
 * ```js
 * const evaluator = new FormulaEvaluator(workbook);
 *
 * // 求值简单公式
 * const ast = parser.parse("A1 + B2 * 100");
 * const result = evaluator.evaluate(ast, sheet, "Sheet1!5,3");
 * console.log(result); // 计算结果
 *
 * // 查看依赖关系
 * console.log(evaluator.dependencies);
 * // Set { "Sheet1!0,0", "Sheet1!1,1" }
 * ```
 *
 * @class FormulaEvaluator
 * @see FormulaParser - 负责将公式字符串解析为AST
 * @see FormulaEngine - 负责依赖管理和自动重算
 */
export class FormulaEvaluator {
    /**
     * 创建公式求值器实例
     *
     * 初始化工作簿引用和内部状态：
     * - workbook: 用于跨表引用时查找目标工作表
     * - dependencies: 当前求值过程中的依赖项集合
     * - _callStack: 循环引用检测的调用栈
     *
     * @param {Object|null} workbook - 工作簿实例
     *                                用于跨表引用解析和访问公式引擎缓存
     *                                如果为null，跨表引用会返回 #REF!
     */
    constructor(workbook) {
        /**
         * 工作簿引用
         * @type {Object|null}
         */
        this.workbook = workbook;

        /**
         * 当前求值过程中收集到的依赖项集合
         *
         * 每次 evaluate() 调用时重置为空Set，
         * 在求值过程中逐步填充。
         *
         * 包含两种类型的键：
         * - 单元格键："SheetName!row,col"
         * - 范围键："SheetName!r1,c1:r2,c2"
         *
         * @type {Set<string>}
         * @example
         * // 公式 =SUM(A1:B10)+C5 的依赖集合：
         * evaluator.dependencies
         * // Set(2) { "Sheet1!0,0:9,1", "Sheet1!4,2" }
         */
        this.dependencies = new Set();

        /**
         * 循环引用检测调用栈
         *
         * 存储当前正在求值的单元格key列表，
         * 用于检测 A→B→C→A 这样的循环引用。
         *
         * 工作原理：
         * - 进入单元格求值前：_callStack.add(cellKey)
         * - 完成单元格求值后：_callStack.delete(cellKey)
         * - 如果遇到已在栈中的key：判定为循环引用
         *
         * @type {Set<string>}
         * @private
         * @example
         * // 假设 A1=B1, B1=C1, C1=A1
         * // 求 A1 时调用栈变化：
         * // 1. add("Sheet1!0,0")  ← 正在求A1
         * // 2. add("Sheet1!1,0")  ← A1引用B1，正在求B1
         * // 3. add("Sheet1!2,0")  ← B1引用C1，正在求C1
         * // 4. 检测到"Sheet1!0,0"已在栈中 → 循环引用！
         */
        this._callStack = new Set();
    }

    /**
     * 公共方法 - 求值AST并返回计算结果
     *
     * 这是求值器的对外主入口方法，
     * 由 FormulaEngine 在 setFormula() 和 recalculate() 中调用。
     *
     * 执行流程：
     * 【准备阶段】
     * 1. 重置 dependencies 为空集（清除上次的依赖记录）
     * 2. 如果提供了 currentCellKey，将其加入调用栈（用于循环检测）
     *
     * 【求值阶段】
     * 3. 调用 #evalNode() 递归遍历AST
     * 4. 在遍历过程中自动填充 dependencies 集合
     *
     * 【清理阶段】
     * 5. 使用 try-finally 确保调用栈状态正确恢复
     *    即使求值过程中抛出异常也要清理调用栈
     *
     * 错误处理策略：
     * - 单元格不存在：返回空字符串 ""
     * - 工作表不存在：返回 "#REF!"
     * - 循环引用：返回 "#CIRCULAR!"
     * - 函数未定义：返回 "#NAME?"
     * - 函数执行错误：返回 "#VALUE!"
     * - 除零错误：返回 "#DIV/0!"
     * - 其他异常：返回 "#VALUE!" 并记录日志
     *
     * @param {Object} ast - 抽象语法树根节点
     *                       来自 FormulaParser.parse() 的输出
     *                       可能的类型：literal, cellRef, rangeRef,
     *                       function, unaryOp, binaryOp
     * @param {Object} sheet - 当前工作表实例
     *                         用于读取单元格值和解析相对引用
     *                         必须包含 name 和 cellStore 属性
     * @param {string} [currentCellKey=''] - 当前正在求值的单元格唯一标识
     *                                        格式："SheetName!row,col"
     *                                        用于循环引用检测
     *                                        如果不提供则跳过循环检测
     *
     * @returns {*} 公式计算结果
     *          可能的类型：
     *          - number: 数值结果
     *          - string: 文本结果或错误值（#DIV/0!, #REF!等）
     *          - boolean: 比较运算的结果
     *          - Array: 范围引用返回二维数组
     *
     * @sideEffect 修改以下实例属性：
     *              - this.dependencies: 重置并填充新的依赖项集合
     *              - this._callStack: 临时添加/移除当前单元格key
     *
     * @example
     * ```js
     * // 场景1：正常求值
     * const ast = { type: "binaryOp", operator: "+",
     *              left: { type: "cellRef", row: 0, col: 0 },
     *              right: { type: "literal", value: 100 }
     *            };
     * const result = evaluator.evaluate(ast, sheet, "Sheet1!5,3");
     * // 如果 A1=50，result=150
     *
     * // 场景2：查看依赖关系
     * evaluator.evaluate(ast, sheet, "Sheet1!5,3");
     * console.log([...evaluator.dependencies]);
     * // ["Sheet1!0,0"]  ← 引用了A1
     *
     * // 场景3：函数求值
     * const fnAst = { type: "function", name: "SUM",
     *                 args: [{ type: "rangeRef", ... }]
     *               };
     * const sum = evaluator.evaluate(fnAst, sheet, "Sheet1!10,0");
     * // 返回 SUM 函数的计算结果
     * ```
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

    /**
     * @private 私有方法 - 递归求值AST节点（核心分派器）
     *
     * 这是求值的核心方法，根据节点类型分发到对应的处理函数。
     * 采用深度优先遍历策略，先求值子节点再组合结果。
     *
     * 分派逻辑：
     * ┌────────────┬─────────────────────────────┐
     * │ 节点类型   │ 处理方法                    │
     * ├────────────┼─────────────────────────────┤
     * │ literal    │ 直接返回 node.value         │
     * │ cellRef    │ #evalCellRef()             │
     * │ rangeRef   │ #evalRangeRef()            │
     * │ function   │ #evalFunction()            │
     * │ unaryOp    │ #evalUnaryOp()             │
     * │ binaryOp   │ #evalBinaryOp()            │
     * │ 其他       │ 返回 "#VALUE!"             │
     * └────────────┴─────────────────────────────┘
     *
     * @param {Object} node - AST节点（任意类型）
     * @param {Object} sheet - 当前工作表实例
     *
     * @returns {*} 该节点的计算结果
     */
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

    /**
     * @private 私有方法 - 求值单元格引用节点
     *
     * 处理 cellRef 类型的AST节点，从工作表中读取指定单元格的值。
     * 支持跨表引用（如 Sheet2!A1）和当前表引用（如 A1）。
     *
     * 执行流程：
     * 1. 解析目标工作表
     *    - 如果 node.sheet 存在：跨表引用，查找指定工作表
     *    - 否则：使用当前 sheet 参数
     * 2. 生成单元格唯一键："SheetName!row,col"
     * 3. 将该键加入 dependencies 集合（依赖追踪）
     * 4. 检测循环引用：
     *    - 如果单元格已在调用栈中 → 返回 "#CIRCULAR!"
     *    - 否则继续正常求值
     * 5. 读取单元格值：
     *    - 如果单元格包含公式且缓存中有AST → 递归求值公式
     *    - 如果是普通单元格 → 返回 cell.value
     *    - 单元格不存在 → 返回空字符串 ""
     *
     * 特殊处理：
     * - 公式单元格的递归求值会使用 astCache 缓存，
     *   避免重复解析，提升性能
     * - 递归求值时会临时修改 _callStack 以检测间接循环引用
     *
     * 错误处理：
     * - 工作表不存在 → "#REF!"
     * - 循环引用 → "#CIRCULAR!" + 记录错误日志
     * - 递归求值异常 → "#CIRCULAR!" + 记录详细错误信息
     *
     * @param {Object} node - cellRef类型的AST节点
     *                       属性：
     *                       - sheet?: string 目标工作表名（跨表引用时）
     *                       - row: number 行索引（0-based）
     *                       - col: number 列索引（0-based）
     * @param {Object} sheet - 当前工作表实例
     *
     * @returns {*} 单元格的值
     *          可能的类型：
     *          - string: 文本内容或错误值
     *          - number: 数值
     *          - boolean: 布尔值
     *          - "": 空单元格
     *
     * @sideEffect
     * - this.dependencies.add(key): 添加依赖项
     * - this._callStack.add/delete(key): 临时修改调用栈（仅公式单元格时）
     *
     * @example
     * ```js
     * // 当前表引用
     * const node = { type: "cellRef", row: 0, col: 0 }; // A1
     * const value = evaluator.#evalCellRef(node, sheet);
     * // 返回 A1 的值
     *
     * // 跨表引用
     * const node2 = {
     *   type: "cellRef",
     *   sheet: "Sheet2",
     *   row: 5,
     *   col: 3  // D6
     * };
     * const value2 = evaluator.#evalCellRef(node2, sheet);
     * // 从 Sheet2!D6 读取值
     * ```
     */
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

    /**
     * @private 私有方法 - 求值范围引用节点
     *
     * 处理 rangeRef 类型的AST节点，从工作表中读取矩形区域的值。
     * 返回二维数组，供 SUM、AVERAGE 等聚合函数使用。
     *
     * 执行流程：
     * 1. 解析目标工作表（同 #evalCellRef 的逻辑）
     * 2. 使用 cellDataAccessor.getValueMatrix() 批量读取区域数据
     *    - 该方法会返回一个二维数组
     *    - 数组结构：matrix[相对行][相对列] = 单元格值
     * 3. 生成范围唯一键："SheetName!r1,c1:r2,c2"
     * 4. 将该键加入 dependencies 集合（依赖追踪）
     *
     * 返回的矩阵示例：
     * ```js
     * // 公式 =SUM(A1:B2) 对应的范围引用
     * // 假设 A1=1, B1=2, A2=3, B2=4
     * const matrix = [
     *   [1, 2],  // 第0行: A1, B1
     *   [3, 4],  // 第1行: A2, B2
     * ];
     * ```
     *
     * 性能优化：
     * - 使用 cellDataAccessor 的批量读取接口，
     *   比逐个单元格读取效率更高
     * - 范围作为整体依赖项，避免记录每个子单元格
     *
     * @param {Object} node - rangeRef类型的AST节点
     *                       属性：
     *                       - sheet?: string 目标工作表名
     *                       - topRow: number 左上角行号（0-based）
     *                       - topCol: number 左上角列号（0-based）
     *                       - bottomRow: number 右下角行号（0-based）
     *                       - bottomCol: number 右下角列号（0-based）
     * @param {Object} sheet - 当前工作表实例
     *
     * @returns {Array<Array<*>>} 二维数组，包含范围内所有单元格的值
     *          数组维度：(bottomRow-topRow+1) × (bottomCol-topCol+1)
     *          每个元素可能是：number, string, boolean, ""
     *
     * @sideEffect this.dependencies.add(rangeKey): 添加范围依赖项
     *
     * @example
     * ```js
     * // A1:B3 范围引用（3行×2列）
     * const node = {
     *   type: "rangeRef",
     *   topRow: 0, topCol: 0,
     *   bottomRow: 2, bottomCol: 1
     * };
     * const matrix = evaluator.#evalRangeRef(node, sheet);
     * // matrix 是一个 3×2 的二维数组：
     * // [
     * //   [A1的值, B1的值],
     * //   [A2的值, B2的值],
     * //   [A3的值, B3的值]
     * // ]
     * ```
     */
    #evalRangeRef(node, sheet) {
        let targetSheet;
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

    /**
     * @private 私有方法 - 生成范围唯一标识键
     *
     * 将范围边界信息组合成唯一的字符串键，
     * 用于在依赖图中标识特定的矩形区域。
     *
     * 键格式："{SheetName}!{topRow},{topCol}:{bottomRow},{bottomCol}"
     *
     * @param {string} sheetName - 工作表名称
     * @param {number} topRow - 左上角行索引（0-based）
     * @param {number} topCol - 左上角列索引（0-based）
     * @param {number} bottomRow - 右下角行索引（0-based）
     * @param {number} bottomCol - 右下角列索引（0-based）
     *
     * @returns {string} 范围的唯一键
     *
     * @example
     * ```js
     * evaluator.#rangeKey("Sheet1", 0, 0, 2, 1)
     * // 返回: "Sheet1!0,0:2,1"  (表示 A1:B3)
     *
     * evaluator.#rangeKey("Data", 5, 3, 10, 7)
     * // 返回: "Data!5,3:10,7"  (表示 D6:H11)
     * ```
     */
    #rangeKey(sheetName, topRow, topCol, bottomRow, bottomCol) {
        return `${sheetName}!${topRow},${topCol}:${bottomRow},${bottomCol}`;
    }

    /**
     * @private 私有方法 - 求值函数调用节点
     *
     * 处理 function 类型的AST节点，查找并执行注册的公式函数。
     * 这是连接求值器和函数注册表的关键桥梁。
     *
     * 执行流程：
     * 1. **函数名标准化**：统一转为大写（如 sum → SUM）
     *    - Excel函数名不区分大小写
     * 2. **函数查找**：从 functionRegistry 中获取函数实现
     *    - 包含内置函数和用户自定义函数
     * 3. **参数求值**：递归计算所有参数表达式
     *    - 每个参数都是独立的AST子树
     *    - 支持嵌套函数调用（如 SUM(A1, MAX(B1:B10))）
     * 4. **函数执行**：调用函数并传入参数
     *    - 参数格式：已求值的值数组
     *    - 上下文对象：{ sheet, workbook }
     * 5. **错误处理**：捕获异常并转换为标准错误值
     *
     * 函数接收的上下文对象：
     * ```js
     * {
     *   sheet: Object,      // 当前工作表实例
     *   workbook: Object    // 工作簿实例（用于跨表操作）
     * }
     * ```
     *
     * 错误处理策略：
     * - 函数未注册 → "#NAME?" + 调试日志
     * - 函数执行异常 → "#VALUE!" + 详细错误信息
     *
     * @param {Object} node - function类型的AST节点
     *                       属性：
     *                       - name: string 函数名（如 "SUM", "IF"）
     *                       - args: Array<AST> 参数AST数组
     * @param {Object} sheet - 当前工作表实例
     *
     * @returns {*} 函数的计算结果
     *          具体类型取决于函数定义：
     *          - SUM/AVERAGE等 → number
     *          - CONCAT/UPPER等 → string
     *          - IF/AND/OR等 → boolean 或其他
     *          - 出错时 → string (错误代码)
     *
     * @see functionRegistry 函数注册表
     * @see ../functions/index.js 内置函数实现
     *
     * @example
     * ```js
     * // 公式 =SUM(A1:B10, 100)
     * const node = {
     *   type: "function",
     *   name: "SUM",
     *   args: [
     *     { type: "rangeRef", topRow: 0, topCol: 0, ... },
     *     { type: "literal", value: 100 }
     *   ]
     * };
     * const result = evaluator.#evalFunction(node, sheet);
     * // result = A1:B10的总和 + 100
     * ```
     */
    #evalFunction(node, sheet) {
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
            errorHandler.handle(ERROR_CODE.FORMULA_EVAL_ERROR, `函数 ${node.name} 执行失败`, { functionName: node.name, args, error: fnError });
            return "#VALUE!";
        }
    }

    /**
     * @private 私有方法 - 求值一元运算符节点
     *
     * 处理 unaryOp 类型的AST节点，对单个操作数执行一元运算。
     * 目前仅支持负号运算（取负数）。
     *
     * 执行流程：
     * 1. 递归求值操作数（operand）
     * 2. 根据运算符类型执行相应操作
     *    - "-": 返回操作数的相反数（-value）
     *    - 其他: 返回原值（暂未实现）
     *
     * 支持的一元运算符：
     * ┌──────────┬─────────┬────────────┐
     * │ 运算符   │ 操作    │ 示例       │
     * ├──────────┼─────────┼────────────┤
     * │ -        │ 取负    │ -5 → 5     │
     * │ +        │ 取正    │ +5 → 5     │
     * │ (预留)   │ (待扩展)│            │
     * └──────────┴─────────┴────────────┘
     *
     * @param {Object} node - unaryOp类型的AST节点
     *                       属性：
     *                       - operator: string 运算符（目前只有 "-"）
     *                       - operand: AST 操作数的AST子树
     * @param {Object} sheet - 当前工作表实例
     *
     * @returns {*} 一元运算的结果
     *          对于 "-" 返回 number 类型
     *
     * @example
     * ```js
     * // 公式 =-A1 (A1的相反数)
     * const node = {
     *   type: "unaryOp",
     *   operator: "-",
     *   operand: { type: "cellRef", row: 0, col: 0 }
     * };
     * const result = evaluator.#evalUnaryOp(node, sheet);
     * // 如果 A1=100, result=-100
     * // 如果 A1=-50, result=50
     * ```
     */
    #evalUnaryOp(node, sheet) {
        const operand = this.#evalNode(node.operand, sheet);
        if (node.operator === "-") return -operand;
        return operand;
    }

    /**
     * @private 私有方法 - 求值二元运算符节点
     *
     * 处理 binaryOp 类型的AST节点，对两个操作数执行二元运算。
     * 这是公式计算中最常用的节点类型之一。
     *
     * 执行流程：
     * 1. **左操作数求值**：递归计算 left 表达式
     * 2. **右操作数求值**：递归计算 right 表达式
     * 3. **类型转换**：使用 _toNum() 将值转换为数字
     *    - 数字：直接返回
     *   - 字符串：尝试 parseFloat()
     *   - 其他：返回 NaN
     * 4. **执行运算**：根据 operator 执行对应操作
     * 5. **特殊处理**：
     *    - 除法：检测除零错误 → "#DIV/0!"
     *    - 文本连接：使用 String() 转换并拼接
     *
     * 支持的二元运算符分类：
     *
     * 【算术运算符】
     * ┌──────┬──────────┬─────────────────┐
     * │ 符号 │ 运算      │ 示例            │
     * ├──────┼──────────┼─────────────────┤
     * │ +    │ 加法      │ 3+2=5           │
     * │ -    │ 减法      │ 10-4=6          │
     * │ *    │ 乘法      │ 3*7=21          │
     * │ /    │ 除法      │ 15/3=5          │
     * │ ^    │ 幂运算    │ 2^3=8           │
     * └──────┴──────────┴─────────────────┘
     *
     * 【比较运算符】
     * ┌──────┬──────────┬─────────────────┐
     * │ 符号 │ 运算      │ 示例            │
     * ├──────┼──────────┼─────────────────┤
     * │ =    │ 等于      │ 5=5→true        │
     * │ <>   │ 不等于    │ 3<>5→true       │
     * │ <    │ 小于      │ 2<8→true        │
     * │ >    │ 大于      │ 9>4→true        │
     * │ <=   │ 小于等于  │ 5<=5→true       │
     * │ >=   │ 大于等于  │ 7>=3→true       │
     * └──────┴──────────┴─────────────────┘
     *
     * 【文本运算符】
     * ┌──────┬──────────┬─────────────────────┐
     * │ 符号 │ 运算      │ 示例                │
     * ├──────┼──────────┼─────────────────────┤
     * │ &    │ 文本连接  │ "A"&"B"="AB"       │
     * └──────┴──────────┴─────────────────────┘
     *
     * 错误处理：
     * - 除零错误：返回 "#DIV/0!" 而非 Infinity 或抛出异常
     * - 无效运算符：返回 "#VALUE!"
     * - NaN参与比较：结果为 false（符合IEEE 754标准）
     *
     * @param {Object} node - binaryOp类型的AST节点
     *                       属性：
     *                       - operator: string 运算符符号
     *                       - left: AST 左操作数的AST子树
     *                       - right: AST 右操作数的AST子树
     * @param {Object} sheet - 当前工作表实例
     *
     * @returns {*} 二元运算的结果
     *          可能的类型：
     *          - number: 算术运算结果
     *          - boolean: 比较运算结果
     *          - string: 文本连接结果或错误代码
     *
     * @see _toNum 内部辅助函数，负责类型转换
     *
     * @example
     * ```js
     * // 算术运算：=A1+B2*100
     * const node = {
     *   type: "binaryOp",
     *   operator: "+",
     *   left: { type: "cellRef", row: 0, col: 0 },
     *   right: {
     *     type: "binaryOp",
     *     operator: "*",
     *     left: { type: "cellRef", row: 1, col: 1 },
     *     right: { type: "literal", value: 100 }
     *   }
     * };
     * const result = evaluator.#evalBinaryOp(node, sheet);
     * // 如果 A1=50, B2=3, result=350 (50+300)
     *
     * // 比较运算：=A1>100
     * const cmpNode = {
     *   type: "binaryOp",
     *   operator: ">",
     *   left: { type: "cellRef", row: 0, col: 0 },
     *   right: { type: "literal", value: 100 }
     * };
     * const isGreater = evaluator.#evalBinaryOp(cmpNode, sheet);
     * // boolean: true/false
     * ```
     */
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

    /**
     * @private 私有方法 - 解析工作表名称，获取工作表实例
     *
     * 根据工作表名从工作簿中查找对应的工作表对象。
     * 用于支持跨表引用（如 Sheet2!A1）。
     *
     * 查找逻辑：
     * 1. 检查 workbook 是否存在
     *    - 如果构造时未传入 workbook 或为null → 返回null
     * 2. 从 workbook.sheets Map 中查找
     *    - 使用 sheets.get(name) 方法
     * 3. 返回查找结果
     *    - 找到 → 返回 Sheet 实例
     *    - 未找到 → 返回null（调用方会返回 "#REF!"）
     *
     * @param {string} name - 工作表名称（如 "Sheet1", "Data"）
     *
     * @returns {Object|null} 工作表实例或null
     *          - Object: 包含 name, cellStore 等属性的工作表
     *          - null: 工作簿未初始化或工作表不存在
     *
     * @example
     * ```js
     * // 查找存在的工作表
     * const sheet = evaluator.#resolveSheet("Sheet1");
     * // sheet 是一个有效的 Sheet 实例
     *
     * // 查找不存在的工作表
     * const missing = evaluator.#resolveSheet("NotExist");
     * // missing = null → 调用方返回 "#REF!"
     * ```
     */
    #resolveSheet(name) {
        if (!this.workbook) return null;
        return this.workbook.sheets.get(name) || null;
    }

    /**
     * @private 私有方法 - 生成单元格唯一标识键
     *
     * 将工作表名、行号、列号组合成唯一的字符串键，
     * 用于在依赖图中标识特定单元格。
     *
     * 键格式："{SheetName}!{row},{col}"
     *
     * 与 FormulaEngine.#cellKey() 功能相同，
     * 保持独立实现是为了降低耦合度。
     *
     * @param {string} sheetName - 工作表名称
     * @param {number} row - 行索引（0-based）
     * @param {number} col - 列索引（0-based）
     *
     * @returns {string} 单元格的唯一键
     *
     * @example
     * ```js
     * evaluator.#cellKey("Sheet1", 0, 0)
     * // "Sheet1!0,0" (表示 A1)
     *
     * evaluator.#cellKey("Data", 5, 3)
     * // "Data!5,3" (表示 D6)
     * ```
     */
    #cellKey(sheetName, row, col) {
        return `${sheetName}!${row},${col}`;
    }
}

/**
 * 内部辅助函数 - 将值转换为数字类型
 *
 * 在二元运算符求值中使用，用于将操作数转换为可计算的数值。
 * 支持多种输入类型的自动转换，模拟Excel的隐式类型转换行为。
 *
 * 转换规则：
 * ┌──────────────┬────────────────┬─────────────┐
 * │ 输入类型      │ 转换结果       │ 示例         │
 * ├──────────────┼────────────────┼─────────────┤
 * │ number       │ 直接返回       │ 42→42       │
 * │ string(数字)  │ parseFloat()   │ "3.14"→3.14│
 * │ string(空)    │ NaN           │ ""→NaN      │
 * │ string(文本)  │ NaN           │ "abc"→NaN   │
 * │ boolean       │ NaN           │ true→NaN    │
 * │ null/undefined│ NaN           │ null→NaN    │
 * │ object        │ NaN           │ {}→NaN      │
 * └──────────────┴────────────────┴─────────────┘
 *
 * 设计考量：
 * - **宽松转换**：与Excel行为一致，允许文本参与数学运算
 * - **错误传播**：无法转换时返回NaN，由调用方决定处理方式
 * - **性能优化**：优先使用 typeof 快速判断类型
 *
 * 使用场景：
 * 1. 算术运算前：+、-、*、/、^ 的操作数转换
 * 2. 比较运算前：<、>、<=、>= 的操作数转换
 * 3. 不用于：=、<>（严格比较）和 &（文本连接）
 *
 * @param {*} v - 需要转换的值（任意类型）
 *
 * @returns {number} 转换后的数字
 *          - number: 成功转换的数值
 *          - NaN: 无法转换或无效输入
 *
 * @example
 * ```js
 * _toNum(100)         // 100
 * _toNum("3.14")      // 3.14
 * _toNum("  42  ")    // 42 (自动trim空格)
 * _toNum("hello")     // NaN
 * _toNum("")          // NaN
 * _toNum(true)        // NaN
 * _toNum(null)        // NaN
 * ```
 *
 * @see #evalBinaryOp 主要使用场景
 */
function _toNum(v) {
    if (isNumber(v)) return v;
    if (isString(v) && v.trim() !== "") {
        const n = parseFloat(v);
        return isNaN(n) ? NaN : n;
    }
    return NaN;
}
