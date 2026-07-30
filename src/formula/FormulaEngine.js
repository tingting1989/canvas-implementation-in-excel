/**
 * 公式引擎 (Formula Engine)
 *
 * 核心功能模块，负责Excel公式的完整生命周期管理：
 * 【解析阶段】将公式字符串转换为AST（抽象语法树）
 * 【求值阶段】遍历AST并计算最终结果
 * 【依赖追踪】维护单元格间的引用关系图
 * 【自动重算】当源数据变化时级联更新所有相关公式
 *
 * 架构设计：
 * ┌─────────────────────────────────────────────────────┐
 * │                    FormulaEngine                      │
 * ├─────────────────────────────────────────────────────┤
 * │  ┌──────────┐   ┌──────────┐   ┌─────────────────┐  │
 * │  │ Formula- │   │ Formula- │   │  Dependency      │  │
 * │  │ Parser   │→  │ Evaluator│   │  Graph           │  │
 * │  └──────────┘   └──────────┘   └─────────────────┘  │
 * │       ↓              ↓                ↓            │
 * │   字符串→AST     AST→结果       依赖关系追踪       │
 * ├─────────────────────────────────────────────────────┤
 * │  数据结构：                                          │
 * │  • dependents: 被依赖者→依赖者映射                   │
 * │  • dependsOn:  公式→其依赖的单元格映射               │
 * │  • rangeDependents: 范围依赖快速查找表              │
 * │  • rangeSpatialIndex: 空间索引（性能优化）          │
 * │  • astCache: AST缓存（避免重复解析）                │
 * │  • resultCache: 结果缓存（避免重复更新UI）          │
 * └─────────────────────────────────────────────────────┘
 *
 * 依赖图工作原理：
 * 假设 B2 = A1*2，C5 = SUM(B2:B4)，D10 = C5+1
 *
 * dependents 映射：
 *   "Sheet!0,0"(A1) → {"Sheet!1,1"(B2)}
 *   "Sheet!1,1"(B2) → {"Sheet!4,4"(C5)}
 *   "Sheet!4,4"(C5) → {"Sheet!9,9"(D10)}
 *
 * 当 A1 变化时：
 * 1. 查找 dependents["Sheet!0,0"] → 找到 B2
 * 2. 标记 B2 为脏（dirty）
 * 3. 递归查找 B2 的依赖者 → 找到 C5
 * 4. 继续递归 → 找到 D10
 * 5. 按拓扑顺序重算：B2 → C5 → D10
 *
 * 性能优化策略：
 * 1. AST缓存：同一公式不重复解析
 * 2. 结果缓存：值未变时不触发UI更新
 * 3. 空间索引：范围查询从O(R)优化到O(k)（k=桶内范围数）
 * 4. 拓扑排序：确保依赖顺序正确，避免重复计算
 * 5. 脏标记：只重算受影响的公式
 *
 * 使用示例：
 * ```javascript
 * // 初始化引擎
 * const engine = new FormulaEngine(workbook);
 *
 * // 设置公式（自动解析和求值）
 * engine.setFormula(sheet, 5, 3, "=SUM(A1:A10)");
 * // 返回计算结果，同时建立依赖关系
 *
 * // 当普通单元格变化时，触发级联重算
 * engine.onCellChanged(sheet, 0, 0);  // A1变化
 * // 自动重算所有依赖A1的公式（B2, C5, D10...）
 *
 * // 批量初始化（不求值，仅建立依赖）
 * engine.registerFormulasBatch(sheet);
 *
 * // 注册自定义函数
 * FormulaEngine.registerFunction('TAX', (args) => args[0] * 0.13);
 * ```
 */

// 导入依赖模块
import { parseFormula } from "./FormulaParser.js"; // 公式解析器
import { indexToCol } from "../utils/cellRef.js"; // 列索引转换工具
import { FormulaEvaluator } from "./FormulaEvaluator.js"; // 公式求值器
import { isString } from "../utils/helper.js"; // 类型检查工具
import { functionRegistry } from "./functions/index.js"; // 函数注册中心
import { errorHandler, ERROR_CODE } from "../core/ErrorHandler.js"; // 错误处理系统

export class FormulaEngine {
    /**
     * 构造函数 - 初始化公式引擎实例
     *
     * 创建必要的内部组件和数据结构：
     * - FormulaEvaluator：执行实际的公式计算
     * - 依赖图数据结构：跟踪单元格间的引用关系
     * - 缓存系统：提升重复操作的性能
     *
     * @param {Object} workbook - 工作簿实例
     *                           必须包含 sheets 属性（Map类型）
     *                           用于跨表引用和获取其他工作表数据
     *
     * @example
     * ```js
     * const workbook = {
     *   sheets: new Map([
     *     ['Sheet1', sheet1Instance],
     *     ['Sheet2', sheet2Instance]
     *   ])
     * };
     * const engine = new FormulaEngine(workbook);
     * ```
     */
    constructor(workbook) {
        /**
         * 工作簿引用
         * @type {Object}
         * @property {Map<string, Object>} sheets - 工作表集合
         */
        this.workbook = workbook;

        /**
         * 公式求值器实例
         * 负责遍历AST并执行实际计算
         * @type {FormulaEvaluator}
         */
        this.evaluator = new FormulaEvaluator(workbook);

        /**
         * 正向依赖图（被依赖者 → 依赖者集合）
         *
         * 数据结构：Map<sourceKey, Set<targetKey>>
         * - sourceKey: 被引用的单元格/范围键
         * - targetKey: 引用该单元格的公式单元格键
         *
         * 用途：当 sourceKey 对应的单元格变化时，
         *       快速找到所有需要重算的目标公式
         *
         * 键格式：
         * - 单元格："SheetName!row,col" （如 "Sheet1!0,0"）
         * - 范围："SheetName!r1,c1:r2,c2" （如 "Sheet1!0,0:9,4"）
         *
         * @type {Map<string, Set<string>>}
         *
         * @example
         * // B2 = A1 + 1  且  C5 = SUM(B2:B4)
         * // dependents 内容：
         * // "Sheet1!0,0" → Set(["Sheet1!1,1"])     // A1被B2引用
         * // "Sheet1!1,1" → Set(["Sheet1!4,4"])     // B2被C5引用
         * // "Sheet1!1,1:1,3" → Set(["Sheet1!4,4"]) // B2:B4被C5引用
         */
        this.dependents = new Map();

        /**
         * 反向依赖图（公式单元格 → 其依赖的单元格集合）
         *
         * 数据结构：Map<formulaKey, Set<dependencyKey>>
         * - formulaKey: 公式所在单元格的键
         * - dependencyKey: 该公式引用的所有单元格/范围
         *
         * 用途：
         * 1. 删除公式时清理依赖关系
         * 2. 检测循环依赖
         * 3. 调试和可视化依赖链
         *
         * @type {Map<string, Set<string>>}
         *
         * @example
         * // B2 = A1 + C3 * 2
         * // dependsOn 内容：
         * // "Sheet1!1,1" → Set(["Sheet1!0,0", "Sheet1!2,2"])
         * // 表示B2依赖于A1和C3
         */
        this.dependsOn = new Map();

        /**
         * 范围依赖专用索引
         *
         * 仅存储范围类型（RangeRef）的依赖关系，
         * 用于在 onCellChanged 时快速判断某个单元格是否落在某个范围内。
         *
         * 为什么单独维护？
         * 单元格依赖可以直接用 dependents[key] 查找，
         * 但范围依赖需要遍历所有范围判断包含关系，
         * 时间复杂度 O(R)（R=范围数量），性能较差。
         *
         * 配合 rangeSpatialIndex 空间索引使用，
         * 可以将查询复杂度降低到 O(k)（k=相关桶内的范围数）。
         *
         * @type {Map<string, Set<string>>}
         * @see rangeSpatialIndex
         */
        this.rangeDependents = new Map();

        /**
         * 范围空间索引（Spatial Index for Ranges）
         *
         * 按行分桶的空间加速结构，用于快速查找包含指定单元格的范围。
         *
         * 数据结构：Map<bucketKey, Map<rangeKey, rangeInfo>>
         * - bucketKey: "SheetName:bucketIndex"
         *   bucketIndex = Math.floor(row / _spatialBucketSize)
         * - rangeKey: 范围的唯一标识符
         * - rangeInfo: {topRow, bottomRow, topCol, bottomCol}
         *
         * 工作原理：
         * 将行号空间划分为固定大小的桶（默认256行），
         * 每个范围根据其跨越的行范围放入一个或多个桶中。
         * 查询时只搜索目标单元格所在的桶，大幅减少比较次数。
         *
         * 性能对比（假设10000个范围）：
         * - 无索引：O(10000) 次范围包含判断
         * - 有索引：O(10000/256 ≈ 39) 次（假设均匀分布）
         *
         * @type {Map<string, Map<string, {topRow:number, bottomRow:number, topCol:number, bottomCol:number}>>}
         *
         * @example
         * // 假设桶大小为256，范围 A1:B500 (行0-499)
         * // 会放入桶0 (行0-255) 和桶1 (行256-511)
         * // 查询单元格 C300 时只查桶1
         */
        this.rangeSpatialIndex = new Map();

        /**
         * 空间索引的桶大小（行数）
         *
         * 权衡考虑：
         * - 太小（如64）：桶数量多，内存占用大，但每个桶内范围少
         * - 太大（如1024）：桶数量少，内存省，但每个桶内范围多
         * - 256：经验值，适合大多数电子表格场景
         *
         * @type {number}
         * @default 256
         */
        this._spatialBucketSize = 256;

        /**
         * AST（抽象语法树）缓存
         *
         * 缓存已解析的公式AST，避免对相同公式重复解析。
         * 解析过程虽然快，但在批量操作或频繁重算时有意义。
         *
         * 数据结构：Map<cellKey, ASTNode>
         * - cellKey: "SheetName!row,col"
         * - ASTNode: parseFormula() 返回的语法树根节点
         *
         * 何时清除？
         * - setFormula() 时替换为新AST
         * - removeFormula() 或 onStructureChanged() 时删除
         *
         * @type {Map<string, Object>}
         */
        this.astCache = new Map();

        /**
         * 计算结果缓存
         *
         * 存储最近一次计算的公式结果，
         * 用于在重算时检测值是否真正发生变化。
         *
         * 为什么需要？
         * 避免不必要的UI更新。如果公式重算后值不变，
         * 不需要通知渲染层重新绘制该单元格。
         *
         * @type {Map<string, *>}
         */
        this.resultCache = new Map();

        /**
         * 脏单元格集合（Dirty Cells Set）
         *
         * 在 onCellChanged() 触发级联重算时，
         * 收集所有需要重新计算的公式单元格。
         *
         * 使用Set而非数组确保去重：
         * 如果A和B都依赖C，C变化时A和B各被标记一次，
         * 但实际只需计算一次。
         *
         * 何时清空？在 #recalculate() 完成后清空。
         *
         * @type {Set<string>}
         */
        this.dirtyCells = new Set();
    }

    /**
     * 判断一个值是否为Excel公式字符串
     *
     * 公式识别规则：
     * 1. 必须是字符串类型
     * 2. 长度必须大于1（至少"=x"）
     * 3. 必须以等号"="开头
     *
     * 注意：
     * - 不验证公式的语法正确性，只判断格式
     * - 空字符串""或纯等号"="不视为有效公式
     *
     * @param {*} value - 待检测的值（任意类型）
     * @returns {boolean} 如果是公式返回true，否则返回false
     *
     * @example
     * FormulaEngine.isFormula("=SUM(A1:A10)")   // true
     * FormulaEngine.isFormula("=A1+1")           // true
     * FormulaEngine.isFormula("=")               // false (太短)
     * FormulaEngine.isFormula("Hello")           // false (无等号)
     * FormulaEngine.isFormula(123)               // false (非字符串)
     * FormulaEngine.isFormula(null)              // false
     */
    static isFormula(value) {
        return isString(value) && value.length > 1 && value[0] === "=";
    }

    /**
     * 设置单元格公式并立即求值
     *
     * 这是公式引擎的核心方法之一，完成以下操作流程：
     *
     * 【步骤1】清理旧依赖
     * 如果该单元格之前已有公式，先移除其所有依赖关系，
     * 避免残留的依赖图导致错误的级联更新。
     *
     * 【步骤2】解析公式
     * 调用 FormulaParser 将公式字符串转换为AST。
     * 解析失败时返回错误标记 "#PARSE!" 并记录错误日志。
     *
     * 【步骤3】缓存AST
     * 将解析后的AST存入 astCache，供后续重算使用。
     * 避免对相同公式重复解析。
     *
     * 【步骤4】求值计算
     * 使用 FormulaEvaluator 遍历AST并计算结果。
     * 求值过程中会自动收集该公式的依赖项（引用的单元格）。
     * 求值失败时返回 "#VALUE!" 并记录错误日志。
     *
     * 【步骤5】注册依赖关系
     * 将收集到的依赖项注册到依赖图中：
     * - 更新 dependsOn：该公式→其依赖的单元格
     * - 更新 dependents：被依赖的单元格→该公式
     * - 如果包含范围依赖，同步更新 rangeDependents 和 rangeSpatialIndex
     *
     * 【步骤6】返回结果
     * 返回计算结果（数值、字符串、布尔值、错误值等）
     *
     * @param {Object} sheet - 工作表实例
     *                        必须包含 name 和 cellStore 属性
     * @param {number} row - 行索引（0-based）
     *                       例如第2行传入1
     * @param {number} col - 列索引（0-based）
     *                       例如第3列传入2
     * @param {string} formulaStr - 公式字符串
     *                               可以带或不带前导等号
     *                               示例："=SUM(A1:B10)" 或 "SUM(A1:B10)"
     *
     * @returns {*} 计算结果
     *          可能的类型：
     *          - number: 数值结果（123, 3.14, -5等）
     *          - string: 文本结果（"Hello", ""等）
     *          - boolean: 布尔结果（true, false）
     *          - 错误值: "#VALUE!", "#REF!", "#DIV/0!" 等
     *          - "#PARSE!": 公式解析错误时的特殊标记
     *
     * @throws {Error} 内部捕获异常并转换为错误值，不会向外抛出
     *
     * @example
     * ```js
     * // 设置简单公式
     * const result = engine.setFormula(sheet, 0, 0, "=A1+B1");
     * // 假设A1=10, B1=20 → result = 30
     *
     * // 设置复杂公式
     * const result = engine.setFormula(sheet, 5, 3, "=IF(SUM(A1:A10)>100,\"高\",\"低\")");
     * // 自动建立对 A1:A10 范围的依赖
     *
     * // 错误处理示例
     * const result = engine.setFormula(sheet, 0, 0, "=INVALID(");
     * // result = "#PARSE!" （括号不匹配）
     * ```
     */
    setFormula(sheet, row, col, formulaStr) {
        const key = this.#cellKey(sheet.name, row, col);

        this.#removeDependencies(key);
        this.astCache.delete(key);

        const raw = formulaStr.startsWith("=") ? formulaStr.substring(1) : formulaStr;

        let ast;
        try {
            ast = parseFormula(raw);
        } catch (parseError) {
            errorHandler.handle(ERROR_CODE.FORMULA_PARSE_ERROR, `公式解析失败: ${formulaStr}`, {
                formulaStr,
                sheetName: sheet.name,
                row,
                col,
                error: parseError,
            });
            return "#PARSE!";
        }

        this.astCache.set(key, ast);

        this.evaluator.dependencies = new Set();
        let result;
        try {
            result = this.evaluator.evaluate(ast, sheet, key);
        } catch (evalError) {
            errorHandler.handle(ERROR_CODE.FORMULA_EVAL_ERROR, `公式求值失败: ${formulaStr}`, {
                formulaStr,
                sheetName: sheet.name,
                row,
                col,
                error: evalError,
            });
            result = "#VALUE!";
        }

        this.#updateDependencies(key, this.evaluator.dependencies);

        return result;
    }

    /**
     * 批量注册工作表中的所有公式（仅解析和建立依赖，不求值）
     *
     * 使用场景：
     * - 工作表首次加载时，批量建立所有公式的依赖关系
     * - 从文件/数据库恢复数据后，重建依赖图
     * - 避免逐个调用 setFormula 导致的重复求值开销
     *
     * 工作流程：
     * 1. 遍历工作表的 cellStore（单元格存储）
     * 2. 检查每个单元格是否包含公式（cell.formula 以"="开头）
     * 3. 对找到的公式调用 #registerFormulaOnly()
     * 4. 仅解析AST并收集依赖关系，不执行计算
     *
     * 性能优势：
     * 假设工作表有1000个公式单元格：
     * - 使用 setFormula：1000次解析 + 1000次求值 = 较慢
     * - 使用 registerFormulasBatch：1000次解析 + 0次求值 = 更快
     * 后续可按需调用 recalculateAll() 统一求值
     *
     * 注意事项：
     * - 此方法不会更新单元格的显示值
     * - 需要后续手动调用 recalculateAll() 或触发 onCellChanged()
     * - 解析失败的公式会被跳过（记录错误但不中断批量操作）
     *
     * @param {Object} sheet - 要扫描的工作表实例
     *                        必须包含 cellStore 属性（单元格存储对象）
     *
     * @returns {void} 不返回值，但会修改内部状态：
     *          - astCache: 增加多个条目
     *          - dependsOn: 增加多个条目
     *          - dependents: 增加多个条目
     *          - rangeDependents: 可能增加范围依赖
     *          - rangeSpatialIndex: 可能更新空间索引
     *
     * @example
     * ```js
     * // 场景1：加载文件后初始化
     * const workbook = loadFromFile('data.xlsx');
     * const sheet = workbook.getSheet('Sheet1');
     *
     * // 批量注册所有公式（快速）
     * engine.registerFormulasBatch(sheet);
     * console.log(`已注册 ${engine.astCache.size} 个公式`);
     *
     * // 然后统一求值（一次性完成）
     * engine.recalculateAll(sheet);
     * ```
     */
    registerFormulasBatch(sheet) {
        const cellStore = sheet.cellStore;
        if (!cellStore) return;

        let count = 0;
        for (const [, chunk] of cellStore.chunks) {
            for (const { row, col, cell } of chunk.iterate()) {
                if (cell?.formula && typeof cell.formula === "string" && cell.formula.startsWith("=")) {
                    this.#registerFormulaOnly(sheet, row, col, cell.formula);
                    count++;
                }
            }
        }
    }

    /**
     * 注册单个公式（仅解析和建立依赖，不求值）
     *
     * 这是 registerFormulasBatch() 的内部实现方法，
     * 对单个单元格执行轻量级注册操作。
     *
     * 与 setFormula() 的区别：
     * ┌─────────────────┬────────────────┬──────────────────────┐
     * │      操作       │ setFormula()  │ registerFormulaOnly()│
     * ├─────────────────┼────────────────┼──────────────────────┤
     * │ 解析公式        │ ✅            │ ✅                   │
     * │ 缓存AST         │ ✅            │ ✅                   │
     * │ 收集依赖        │ ✅            │ ✅                   │
     * │ 更新依赖图      │ ✅            │ ✅                   │
     * │ 求值计算        │ ✅            │ ❌                   │
     * │ 返回计算结果    │ ✅            │ N/A                  │
     * │ 更新resultCache │ ✅            │ ❌                   │
     * │ 用途            │ 交互式输入    │ 批量初始化           │
     * └─────────────────┴────────────────┴──────────────────────┘
     *
     * 内部流程：
     * 1. 清理该单元格的旧依赖（如果有）
     * 2. 清除旧的AST缓存（如果有）
     * 3. 去除前导"="并解析为AST
     * 4. 缓存新AST到 astCache
     * 5. 遍历AST收集依赖项（调用 #evalNodeForDeps()）
     * 6. 将依赖项注册到依赖图（调用 #updateDependencies()）
     *
     * 错误处理：
     * - 解析失败时记录错误日志但不抛出异常
     * - 跳过该公式，继续处理下一个
     *
     * @param {Object} sheet - 工作表实例
     * @param {number} row - 行索引（0-based）
     * @param {number} col - 列索引（0-based）
     * @param {string} formulaStr - 公式字符串（应包含前导"="）
     *
     * @returns {void}
     * @private 此方法是私有方法，仅供 registerFormulasBatch() 调用
     */

    /**
     * @private 私有方法 - 仅注册公式到引擎（不立即求值）
     *
     * registerFormulasBatch() 的内部实现方法。
     * 只完成公式的解析和依赖注册，跳过求值步骤，
     * 用于批量操作时提升性能（避免中间状态的重复计算）。
     *
     * 执行流程：
     * 1. 解析公式字符串为AST
     * 2. 缓存AST到 astCache
     * 3. 遍历AST收集依赖项
     * 4. 注册依赖关系到依赖图
     * 5. 更新 cellStore 标记该单元格为公式类型
     *
     * 与 setFormula() 的区别：
     * - setFormula: 解析 + 注册 + 立即求值 + 更新值 + UI通知
     * - #registerFormulaOnly: 解析 + 注册（无求值，无UI更新）
     *
     * @param {Object} sheet - 工作表实例
     * @param {number} row - 行索引（0-based）
     * @param {number} col - 列索引（0-based）
     * @param {string} formulaStr - 公式字符串（含前导 "="）
     */
    #registerFormulaOnly(sheet, row, col, formulaStr) {
        const key = this.#cellKey(sheet.name, row, col);

        this.#removeDependencies(key);
        this.astCache.delete(key);

        const raw = formulaStr.startsWith("=") ? formulaStr.substring(1) : formulaStr;

        let ast;
        try {
            ast = parseFormula(raw);
        } catch (parseError) {
            errorHandler.handle(ERROR_CODE.FORMULA_PARSE_ERROR, `公式解析失败: ${formulaStr}`, {
                formulaStr,
                sheetName: sheet.name,
                row,
                col,
                error: parseError,
            });
            return;
        }

        this.astCache.set(key, ast);

        this.evaluator.dependencies = new Set();
        this.#evalNodeForDeps(ast, sheet);

        this.#updateDependencies(key, this.evaluator.dependencies);
    }

    /**
     * @private 私有方法 - 遍历AST节点收集依赖关系（不求值）
     *
     * 这是 #registerFormulaOnly() 的核心辅助方法，
     * 递归遍历AST的所有节点，提取出单元格引用和范围引用，
     * 将它们收集到 evaluator.dependencies 集合中。
     *
     * 为什么需要单独的方法而不是复用求值逻辑？
     * 1. 求值过程可能因为缺少值而失败（如循环依赖、未初始化单元格）
     * 2. 即使求值失败，依赖关系仍然有效且需要记录
     * 3. 此方法只关注"谁引用了谁"，不关心具体的值
     *
     * 支持的AST节点类型：
     * ┌────────────┬──────────────────────────────────────┐
     * │ 节点类型   │ 处理方式                               │
     * ├────────────┼──────────────────────────────────────┤
     * │ cellRef    │ 提取sheet/row/col，生成单元格key      │
     * │ rangeRef   │ 提取范围边界，生成范围key              │
     * │ function   │ 递归处理所有参数                       │
     * │ binaryOp   │ 递归处理左操作数和右操作数              │
     * │ unaryOp    │ 递归处理操作数                         │
     * │ literal    │ 忽略（字面量不产生依赖）               │
     * └────────────┴──────────────────────────────────────┘
     *
     * 生成的键格式：
     * - 单元格："SheetName!row,col"
     * - 范围："SheetName!topRow,topCol:bottomRow,bottomCol"
     *
     * @param {Object} node - AST节点（任意类型）
     *                        来自 parseFormula() 的输出
     * @param {Object} sheet - 当前工作表实例
     *                        用于解析相对引用（无sheet属性的cellRef）
     *
     * @returns {void}
     * @sideEffect 向 this.evaluator.dependencies Set 添加依赖键
     *
     * @example
     * // 假设AST表示公式 =SUM(Sheet2!A1:B10)+C5
     * // 调用后 evaluator.dependencies 包含：
     * // [
     * //   "Sheet2!0,0:9,1",  // Sheet2!A1:B10 的范围引用
     * //   "Sheet1!4,2"       // C5 的单元格引用（假设当前表是Sheet1）
     * // ]
     */
    #evalNodeForDeps(node, sheet) {
        if (!node) return;

        switch (node.type) {
            case "cellRef": {
                let targetSheet;
                if (node.sheet) {
                    targetSheet = this.workbook?.sheets.get(node.sheet);
                } else {
                    targetSheet = sheet;
                }
                if (targetSheet) {
                    const key = this.#cellKey(targetSheet.name, node.row, node.col);
                    this.evaluator.dependencies.add(key);
                }
                break;
            }
            case "rangeRef": {
                let targetSheet;
                if (node.sheet) {
                    targetSheet = this.workbook?.sheets.get(node.sheet);
                } else {
                    targetSheet = sheet;
                }
                if (targetSheet) {
                    const rangeKey = `${targetSheet.name}!${node.topRow},${node.topCol}:${node.bottomRow},${node.bottomCol}`;
                    this.evaluator.dependencies.add(rangeKey);
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

    /**
     * 移除单元格的公式及其所有依赖关系
     *
     * 当用户删除公式、将公式单元格改为普通值、
     * 或清空单元格时调用此方法进行清理。
     *
     * 清理操作包括：
     * 1. 从 dependsOn 中移除该公式的所有依赖项
     * 2. 从 dependents 中移除其他单元格对该公式的引用
     * 3. 如果涉及范围依赖，同步更新 rangeDependents 和 rangeSpatialIndex
     * 4. 清除 astCache 中的AST缓存
     * 5. 清除 resultCache 中的结果缓存
     *
     * 为什么需要彻底清理？
     * 假设 B2 = A1 + 1，如果删除B2的公式但不清理依赖：
     * - dependents["Sheet!0,0"] 仍包含 "Sheet!1,1"（B2）
     * - 当A1变化时，引擎仍会尝试重算B2
     * - 但B2已经不是公式了，导致错误或无效操作
     *
     * @param {Object} sheet - 工作表实例
     * @param {number} row - 行索引（0-based）
     * @param {number} col - 列索引（0-based）
     *
     * @returns {void}
     *
     * @example
     * ```js
     * // 用户在 B2 输入了普通值 "Hello"，之前是公式 =A1+1
     * engine.removeFormula(sheet, 1, 1); // 清理B2的所有依赖关系
     *
     * // 现在A1变化时不会触发B2的重算
     * engine.onCellChanged(sheet, 0, 0); // 只影响真正依赖A1的公式
     * ```
     */
    removeFormula(sheet, row, col) {
        const key = this.#cellKey(sheet.name, row, col);
        this.#removeDependencies(key);
        this.astCache.delete(key);
    }

    /**
     * 处理单元格值变化事件（核心级联重算机制）
     *
     * 当普通单元格（非公式）的值发生变化时调用此方法，
     * 触发依赖链上的所有公式自动重新计算。
     *
     * 这是公式引擎实现"响应式"更新的关键方法。
     *
     * 执行流程：
     *
     * 【阶段1：收集受影响的公式（脏标记收集）】
     * 1. 生成变化单元格的key："SheetName!row,col"
     * 2. 在 dependents 中查找直接引用该单元格的公式集合
     * 3. 将这些公式加入 dirtyCells 集合（脏标记）
     * 4. 对每个脏公式，递归查找其依赖者（#collectDirty）
     *    → 实现级联传播，确保间接依赖也被重算
     * 5. 使用 visitedFormulas Set 避免重复访问和循环依赖死循环
     *
     * 【阶段2：范围依赖检查】
     * 调用 #findRangeDependents() 检查该单元格是否落在某个范围内：
     * - 使用空间索引快速定位可能相关的范围桶
     * - 对桶内每个范围进行精确包含判断
     * - 将匹配的范围对应的公式也加入 dirtyCells
     *
     * 【阶段3：拓扑排序重算】
     * 如果存在脏单元格：
     * 1. 调用 #recalculate() 执行实际计算
     * 2. 内部会按拓扑顺序处理（依赖先于被依赖）
     * 3. 每个公式的最新结果存入 cellStore
     * 4. 返回所有发生变化的单元格列表
     *
     * 【阶段4：UI失效通知】
     * 对每个结果变化的单元格调用 _invalidateCellInternal()
     * 通知渲染层该区域需要重新绘制
     *
     * 性能保证：
     * - 使用Set去重，避免重复计算
     * - 空间索引加速范围查询
     * - 只重算真正受影响的公式（脏标记机制）
     * - 值未变时不触发UI更新（resultCache对比）
     *
     * 时间复杂度分析：
     * - 最佳情况 O(1)：无依赖者，立即返回空数组
     * - 一般情况 O(D+k)：D=依赖者数量，k=相关范围数
     * - 最坏情况 O(F)：F=总公式数量（所有公式都间接依赖）
     *
     * @param {Object} sheet - 发生变化的工作表实例
     * @param {number} row - 变化单元格的行索引（0-based）
     * @param {number} col - 变化单元格的列索引（0-based）
     *
     * @returns {Array<Object>} 发生变化的单元格信息数组
     *          每个元素结构：
     *          {
     *            sheetName: string,   // 工作表名
     *            row: number,         // 行索引
     *            col: number,         // 列索引
     *            newValue: *         // 新的计算结果
     *          }
     *          如果没有任何公式依赖此单元格，返回空数组 []
     *
     * @example
     * ```js
     * // 用户修改了 A1 的值从 10 改为 20
     * const changes = engine.onCellChanged(sheet, 0, 0);
     *
     * // 假设 B2=A1*2, C5=SUM(B2:B4), D10=C5+1
     * // changes 可能是：
     * // [
     * //   { sheetName: "Sheet1", row: 1, col: 1, newValue: 40 },  // B2: 20*2
     * //   { sheetName: "Sheet1", row: 4, col: 4, newValue: ... }, // C5 变化
     * //   { sheetName: "Sheet1", row: 9, col: 9, newValue: ... }  // D10 变化
     * // ]
     *
     * // UI层可以根据changes数组局部刷新受影响的单元格
     * ```
     */
    onCellChanged(sheet, row, col) {
        const cellKey = this.#cellKey(sheet.name, row, col);

        this.dirtyCells = new Set();
        const visitedFormulas = new Set();

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

    /**
     * 处理工作表结构变化事件（插入/删除行列）
     *
     * 当用户执行插入行、删除行、插入列、删除列等操作时，
     * 工作表的结构发生变化，可能导致现有公式中的引用失效。
     *
     * 此方法负责清理受影响区域的公式依赖和AST缓存，
     * 避免后续计算使用过时的引用信息。
     *
     * 何时调用？
     * - 插入行/列后（isShift=true）
     * - 删除行/列后（isShift=true）
     * - 其他导致单元格坐标发生位移的操作
     *
     * 处理策略：
     * 采用保守的"清理"策略而非复杂的"更新引用"策略：
     * 1. 扫描所有公式的 dependsOn 记录
     * 2. 检查每个依赖项是否与受影响区域重叠
     * 3. 如果是单元格引用且在受影响行/列之后 → 清理
     * 4. 如果是范围引用且与受影响点重叠 → 清理
     * 5. 对需要清理的公式：
     *    - 移除其所有依赖关系
     *    - 删除其AST缓存
     *    - 下次访问时会触发重新解析和求值
     *
     * 为什么采用清理而非更新？
     * - 更新逻辑复杂：需要调整所有引用的行列号
     * - 边界情况多：范围引用、跨表引用、混合引用等
     * - 性能影响小：通常只涉及少量受影响的公式
     * - 安全性高：避免更新遗漏导致的隐蔽错误
     *
     * 受影响区域判断规则：
     * 对于单元格引用 (r, c)：
     * - 行操作（row>0）：如果 r >= row 则受影响
     * - 列操作（col>0）：如果 c >= col 则受影响
     * - 同时操作：满足任一条件即受影响
     *
     * 对于范围引用 [r1,c1:r2,c2]：
     * - 使用 #rangeOverlapsWithPoint() 判断是否包含受影响点
     *
     * @param {Object} sheet - 发生结构变化的工作表实例
     * @param {number} row - 受影响的起始行索引
     *                       >0 表示行操作（插入/删除行的位置）
     *                       =0 表示无行操作
     * @param {number} col - 受影响的起始列索引
     *                       >0 表示列操作（插入/删除列的位置）
     *                       =0 表示无列操作
     * @param {boolean} isShift - 是否是移位操作
     *                            true: 插入或删除行列（需要处理）
     *                            false: 非移位操作（直接返回，不处理）
     *
     * @returns {void}
     *
     * @example
     * ```js
     * // 用户在第3行前插入了新行（原第3行及之后都下移1行）
     * engine.onStructureChanged(sheet, 3, 0, true);
     * // 所有引用第3行及之后的公式都会被清理
     *
     * // 用户删除了B列（原C列及之后都左移1列）
     * engine.onStructureChanged(sheet, 0, 2, true);
     * // 所有引用第2列及之后的公式都会被清理
     * ```
     */
    onStructureChanged(sheet, row, col, isShift) {
        if (!isShift) return;

        const prefix = `${sheet.name}!`;
        const keysToRemove = [];

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

    /**
     * @private 私有方法 - 判断点是否在矩形范围内（空间索引查询的辅助方法）
     *
     * 简单的边界检查，判断坐标 (row, col)
     * 是否落在 range 描述的矩形区域内（包括边界）。
     *
     * 与 #isCellInRange() 的区别：
     * - #rangeOverlapsWithPoint(): 接收范围对象（已解析）
     * - #isCellInRange(): 接收范围键字符串（需解析）
     *
     * @param {Object} range - 范围对象
     *                         { topRow, bottomRow, topCol, bottomCol }
     * @param {number} row - 待检测点的行坐标
     * @param {number} col - 待检测点的列坐标
     *
     * @returns {boolean}
     *          true: 点在范围内或边界上
     *          false: 点在范围外
     */
    #rangeOverlapsWithPoint(range, row, col) {
        return row >= range.topRow && row <= range.bottomRow && col >= range.topCol && col <= range.bottomCol;
    }

    /**
     * 重算指定工作表中的所有公式（全局重算）
     *
     * 使用场景：
     * - 从文件加载数据后，需要根据当前值重新计算所有公式
     * - 执行撤销/重做操作后，恢复正确的计算状态
     * - 批量注册公式后（registerFormulasBatch），统一求值
     * - 修复循环依赖或计算错误后，强制刷新所有结果
     *
     * 工作流程：
     *
     * 【步骤1：收集待重算的公式】
     * 遍历 astCache，筛选出属于指定工作表的公式key。
     * 只处理有缓存的AST，跳过已被清理或无效的条目。
     *
     * 【步骤2：拓扑排序】
     * 调用 #topologicalSort() 对公式进行依赖顺序排列：
     * - 确保被依赖的公式先于依赖它的公式计算
     * - 例如 B2=A1+1, C5=B2*2 → 计算顺序必须是 B2 → C5
     * - 检测并处理循环依赖（无法排序的放到末尾）
     *
     * 【步骤3：按序求值】
     * 对排序后的每个公式：
     * 1. 从 astCache 获取缓存的AST
     * 2. 调用 evaluator.evaluate() 计算新值
     * 3. 收集新的依赖关系
     * 4. 更新 cellStore 中的单元格值和公式属性
     * 5. 更新 resultCache 缓存
     * 6. 更新依赖图（可能变化）
     *
     * 错误处理策略：
     * - 单个公式求值失败不影响其他公式的计算
     * - 失败的公式返回 "#VALUE!" 错误值
     * - 继续处理剩余公式
     *
     * 性能考虑：
     * - 时间复杂度 O(F + D)，F=公式数量，D=总依赖数
     * - 拓扑排序使用Kahn算法，时间复杂度 O(V+E)
     * - 对于大型工作表（数千个公式）可能有明显延迟
     * - 建议在后台线程执行或在操作提示中告知用户等待
     *
     * @param {Object} sheet - 要重算的工作表实例
     *                        必须包含 name 和 cellStore 属性
     *
     * @returns {void}
     * @sideEffect 修改以下内部状态：
     *              - cellStore: 更新所有公式单元格的计算值
     *              - resultCache: 刷新所有缓存的结果
     *              - dependsOn: 可能更新某些公式的依赖集合
     *
     * @example
     * ```js
     * // 场景1：加载文件后的初始化
     * engine.registerFormulasBatch(sheet); // 先建立依赖
     * engine.recalculateAll(sheet);         // 再统一求值
     *
     * // 场景2：撤销操作后恢复状态
     * undoManager.undo();                  // 恢复数据
     * engine.recalculateAll(sheet);         // 重算所有公式
     *
     * // 场景3：修复错误后强制刷新
     * fixDataErrors(data);                 // 修正数据源
     * engine.recalculateAll(sheet);         // 确保所有公式正确
     * ```
     */
    recalculateAll(sheet) {
        const prefix = `${sheet.name}!`;
        const formulaKeys = [];

        for (const key of this.astCache.keys()) {
            if (key.startsWith(prefix)) {
                formulaKeys.push(key);
            }
        }

        if (formulaKeys.length === 0) return;

        const sortedKeys = this.#topologicalSort(formulaKeys);

        let evalCount = 0;

        for (const key of sortedKeys) {
            const ast = this.astCache.get(key);
            if (!ast) continue;

            const [, row, col] = this.#parseKey(key);

            this.evaluator.dependencies = new Set();
            let result;
            try {
                result = this.evaluator.evaluate(ast, sheet, key);
                evalCount++;
            } catch (e) {
                result = "#VALUE!";
            }

            this.#updateDependencies(key, this.evaluator.dependencies);

            const cell = sheet.cellStore.get(row, col);
            if (cell) {
                sheet.cellStore.set(row, col, new cell.constructor(result, cell.styleId, cell.disabled, cell.formula));
                this.resultCache.set(key, result);
            }
        }
    }

    /**
     * 获取指定单元格公式的依赖列表（调试/诊断工具）
     *
     * 返回该公式引用的所有单元格和范围的键列表。
     * 用于调试复杂的依赖链、检测意外的引用关系、
     * 或可视化显示公式的数据来源。
     *
     * 与 getDependents() 的对比：
     * - getDependencies(): "谁依赖谁" → 该公式引用了哪些单元格（反向）
     * - getDependents(): "被谁依赖" → 哪些公式引用了该单元格（正向）
     *
     * @param {string} sheetName - 工作表名称（如 "Sheet1"）
     * @param {number} row - 行索引（0-based）
     * @param {number} col - 列索引（0-based）
     *
     * @returns {string[]} 依赖项键数组
     *          每个元素格式：
     *          - 单元格："SheetName!row,col"
     *          - 范围："SheetName!r1,c1:r2,c2"
     *          如果该单元格不是公式或无依赖，返回空数组 []
     *
     * @example
     * ```js
     * // 假设 B2 的公式是 =A1+SUM(Sheet2!C1:D10)
     * const deps = engine.getDependencies('Sheet1', 1, 1);
     * // deps = [
     * //   "Sheet1!0,0",              // A1
     * //   "Sheet2!2,2:3,3"          // Sheet2!C1:D10
     * // ]
     *
     * // 在控制台显示依赖树
     * console.log(`B2 依赖于 ${deps.length} 个源:`);
     * deps.forEach(dep => console.log(`  - ${dep}`));
     * ```
     */
    getDependencies(sheetName, row, col) {
        const key = this.#cellKey(sheetName, row, col);
        const deps = this.dependsOn.get(key);
        return deps ? [...deps] : [];
    }

    /**
     * 获取依赖指定单元格的公式列表（调试/诊断工具）
     *
     * 返回所有引用了该单元格的公式单元格键列表。
     * 用于分析影响范围、评估修改某单元格的后果、
     * 或追踪级联更新的传播路径。
     *
     * 典型应用场景：
     * - 修改重要数据前，查看会影响哪些公式
     * - 性能优化：找出被过多公式引用的"热点"单元格
     * - 循环依赖检测：检查是否存在相互引用
     *
     * @param {string} sheetName - 工作表名称（如 "Sheet1"）
     * @param {number} row - 行索引（0-based）
     * @param {number} col - 列索引（0-based）
     *
     * @returns {string[]} 依赖者键数组
     *          每个元素格式："SheetName!row,col"
     *          表示一个公式单元格的位置
     *          如果没有公式引用该单元格，返回空数组 []
     *
     * @example
     * ```js
     * // 查看 A1 被哪些公式引用
     * const dependents = engine.getDependents('Sheet1', 0, 0);
     * // dependents = [
     * //   "Sheet1!1,1",   // B2 = A1*2
     * //   "Sheet1!4,4",   // C5 = IF(A1>0,...)
     * //   "Sheet2!2,2"    // Sheet2!C3 = Sheet1!A1 + 100
     * // ]
     *
     * if (dependents.length > 10) {
     *   console.warn(`⚠️ A1 是热点单元格，被 ${dependents.length} 个公式引用`);
     * }
     * ```
     */
    getDependents(sheetName, row, col) {
        const key = this.#cellKey(sheetName, row, col);
        const deps = this.dependents.get(key);
        return deps ? [...deps] : [];
    }

    /**
     * @static 静态公共方法 - 注册自定义公式函数（扩展公式引擎功能）
     *
     * 允许用户向公式引擎添加自定义函数，
     * 就像使用内置的 SUM、IF、VLOOKUP 等函数一样。
     *
     * 函数签名规范：
     * 自定义函数应遵循以下签名：
     * ```
     * (args: Array, context?: Object) => any
     * ```
     *
     * 参数说明：
     * - args: 函数参数数组，元素类型可能是：
     *   - number: 数值常量或单元格值
     *   - string: 文本常量或单元格值
     *   - boolean: 布尔值
     *   - Excel错误值: "#N/A", "#VALUE!" 等
     *   - null/undefined: 空单元格
     *
     * - context (可选): 求值上下文对象
     *   - sheet: 当前工作表实例
     *   - workbook: 工作簿实例（可访问其他工作表）
     *
     * 返回值要求：
     * 可以返回任意JavaScript基本类型：
     * - number: 数值结果
     * - string: 文本结果
     * - boolean: 布尔结果
     * - Error对象或错误字符串: 会转换为Excel错误值
     *
     * 注意事项：
     * - 函数名会自动转换为大写（不区分大小写）
     * - 不能覆盖内置函数（除非先注销）
     * - 应进行参数验证和错误处理
     * - 避免副作用（如修改全局状态）
     *
     * @param {string} name - 函数名称
     *                        建议：全大写，如 'MYFUNC', 'CUSTOM_TAX'
     *                        不支持空格和特殊字符（除了下划线）
     *                        长度建议：3-30个字符
     * @param {Function} fn - 函数实现
     *                         签名：(args: Array, context?: Object) => any
     *                         必须是普通函数或箭头函数
     *                         不能是异步函数（async function）
     *
     * @throws {TypeError} 如果参数类型不正确时抛出
     *
     * @example
     * ```js
     * // 示例1：简单的数学函数
     * FormulaEngine.registerFunction('DOUBLE', (args) => {
     *     const value = args[0];           // 获取第一个参数
     *     if (typeof value !== 'number') return '#VALUE!';  // 类型检查
     *     return value * 2;               // 返回计算结果
     * });
     * // 使用：=DOUBLE(A1) → 如果A1=5，返回10
     *
     * // 示例2：带默认参数的财务函数
     * FormulaEngine.registerFunction('TAX', (args) => {
     *     const amount = args[0] || 0;       // 金额，默认0
     *     const rate = args[1] ?? 0.13;      // 税率，默认13%
     *     return amount * rate;
     * });
     * // 使用：=TAX(1000, 0.25) → 250
     * // 使用：=TAX(500) → 500*0.13 = 65
     *
     * // 示例3：访问工作簿的高级函数
     * FormulaEngine.registerFunction('SHEET_COUNT', (args, ctx) => {
     *     if (!ctx?.workbook) return '#CONTEXT!';
     *     return ctx.workbook.sheets.size;  // 返回工作表数量
     * });
     * // 使用：=SHEET_COUNT() → 3（如果有3个工作表）
     *
     * // 示例4：条件统计函数
     * FormulaEngine.registerFunction('COUNT_GREATER', (args) => {
     *     const threshold = args[0];        // 阈值
     *     const range = args.slice(1);      // 后续参数作为数据范围
     *     return range.filter(v => typeof v === 'number' && v > threshold).length;
     * });
     * // 使用：=COUNT_GREATER(10, A1:A10) → 统计A1:A10中>10的数字个数
     * ```
     */
    static registerFunction(name, fn) {
        functionRegistry.register(name, fn, { category: "custom" });
    }

    /**
     * @static 静态公共方法 - 注销（移除）已注册的自定义函数
     *
     * 从公式引擎中移除之前通过 registerFunction() 添加的函数。
     * 移除后，使用该函数名的公式将返回 #NAME? 错误。
     *
     * 注意事项：
     * - 只能移除自定义函数，不能移除内置函数
     * - 移除后，所有引用该函数的公式需要重新求值才会显示错误
     * - 如果函数不存在，不会报错，只是返回 false
     *
     * @param {string} name - 要移除的函数名（大小写不敏感）
     *
     * @returns {boolean} 操作是否成功
     *          true: 成功找到并移除了该函数
     *          false: 该函数不存在（可能从未注册或已被移除）
     *
     * @example
     * ```js
     * // 正常注销
     * const success = FormulaEngine.unregisterFunction('DOUBLE');
     * console.log(success);  // true
     *
     * // 尝试注销不存在的函数
     * const result = FormulaEngine.unregisterFunction('NONEXISTENT');
     * console.log(result);  // false
     *
     * // 注销后使用该函数会出错
     * // 单元格中的 =DOUBLE(A1) 将变为 #NAME?
     * ```
     */
    static unregisterFunction(name) {
        return functionRegistry.unregister(name);
    }

    /**
     * @static 静态公共方法 - 检查指定名称的函数是否已注册（内置或自定义）
     *
     * 用于在运行时动态检查某个函数是否可用，
     * 避免使用未注册函数导致的 #NAME? 错误。
     *
     * 检查范围包括：
     * - 内置函数：SUM, IF, VLOOKUP 等系统预定义函数
     * - 自定义函数：通过 registerFunction() 注册的用户函数
     *
     * @param {string} name - 要检查的函数名（大小写不敏感）
     *
     * @returns {boolean} 是否已注册
     *          true: 该函数可用（内置或自定义）
     *          false: 该函数未注册，使用会返回 #NAME?
     *
     * @example
     * ```js
     * // 检查内置函数
     * if (FormulaEngine.hasFunction('VLOOKUP')) {
     *     console.log('可以使用 VLOOKUP');
     * }
     *
     * // 检查自定义函数
     * if (!FormulaEngine.hasFunction('MY_CUSTOM_FUNC')) {
     *     FormulaEngine.registerFunction('MY_CUSTOM_FUNC', myImplementation);
     *     console.log('已自动注册缺失的自定义函数');
     * }
     *
     * // 在公式验证前检查
     * const formula = '=SOME_UNKNOWN_FUNC(A1)';
     * const funcName = formula.match(/^=(\w+)/)[1];
     * if (!FormulaEngine.hasFunction(funcName)) {
     *     console.warn(`⚠️ 公式使用了未注册的函数: ${funcName}`);
     * }
     * ```
     */
    static hasFunction(name) {
        return functionRegistry.has(name);
    }

    /**
     * @static 静态公共方法 - 获取所有已注册函数的名称列表（用于调试、文档生成、UI展示等）
     *
     * 返回当前公式引擎中可用的所有函数名，
     * 包括内置函数和用户通过 registerFunction() 添加的自定义函数。
     *
     * 返回值特点：
     * - 所有名称都是大写格式（标准化）
     * - 包含内置函数和自定义函数
     * - 顺序不确定（依赖Map的迭代顺序）
     * - 返回的是副本，修改不影响内部状态
     *
     * 典型用途：
     * - 调试时查看可用的函数列表
     * - 生成函数文档或帮助信息
     * - UI中显示函数下拉列表或自动完成提示
     * - 单元测试时验证函数注册状态
     *
     * @returns {string[]} 已注册函数名的数组
     *                  所有名称统一为大写格式
     *                  示例：["SUM", "AVERAGE", "IF", "VLOOKUP", "MY_CUSTOM_FUNC"]
     *
     * @example
     * ```js
     * // 场景1：控制台输出所有可用函数
     * const functions = FormulaEngine.getRegisteredFunctions();
     * console.log(`共 ${functions.length} 个可用函数:`);
     * console.table(functions.map((name, i) => ({ 序号: i+1, 函数名: name })));
     *
     * // 场景2：构建UI自动完成列表
     * const functionList = FormulaEngine.getRegisteredFunctions();
     * autoComplete.init(functionList);  // 初始化自动完成组件
     *
     * // 场景3：筛选自定义函数
     * const allFuncs = FormulaEngine.getRegisteredFunctions();
     * const builtInFuncs = ['SUM', 'AVERAGE', 'IF', ...];  // 内置函数白名单
     * const customFuncs = allFuncs.filter(f => !builtInFuncs.includes(f));
     * console.log('自定义函数:', customFuncs);
     *
     * // 场景4：单元测试
     * test('应包含核心数学函数', () => {
     *     const funcs = FormulaEngine.getRegisteredFunctions();
     *     expect(funcs).toContain('SUM');
     *     expect(funcs).toContain('PRODUCT');
     *     expect(funcs).toContain('POWER');
     * });
     * ```
     */
    static getRegisteredFunctions() {
        return functionRegistry.list();
    }

    /**
     * 销毁公式引擎实例并释放所有资源
     *
     * 当工作簿不再需要或页面卸载时应调用此方法，
     * 以防止内存泄漏和无效引用。
     *
     * 清理操作：
     * 1. 清空所有依赖图数据结构：
     *    - dependents（正向依赖图）
     *    - dependsOn（反向依赖图）
     *    - rangeDependents（范围依赖索引）
     *    - rangeSpatialIndex（空间索引）
     * 2. 清除缓存：
     *    - astCache（AST语法树缓存）
     *    - resultCache（计算结果缓存）
     * 3. 清空脏标记集合：
     *    - dirtyCells（待重算单元格集合）
     * 4. 断开外部引用：
     *    - workbook = null（解除对工作簿的引用）
     *    - evaluator = null（释放求值器）
     *
     * 为什么需要显式销毁？
     * JavaScript有垃圾回收机制，但循环引用可能导致内存泄漏：
     * - workbook → sheets → cells → formulas → engine → workbook
     * - 显式置null可以打破这个循环引用链
     * - 特别是对于长时间运行的单页应用（SPA）很重要
     *
     * 销毁后的状态：
     * - 所有方法调用将失败或返回默认值
     * - 不应再使用该实例，应创建新实例替代
     * - 可以安全地让垃圾回收器回收此对象
     *
     * @returns {void}
     *
     * @example
     * ```js
     * // 场景1：应用关闭/页面卸载前
     * window.addEventListener('beforeunload', () => {
     *     if (engine) {
     *         engine.destroy();
     *         engine = null;
     *     }
     * });
     *
     * // 场景2：切换工作簿时
     * function switchWorkbook(newWorkbook) {
     *     if (engine) engine.destroy();      // 销毁旧引擎
     *     engine = new FormulaEngine(newWorkbook);  // 创建新引擎
     * }
     *
     * // 场景3：单元测试中的清理
     * afterEach(() => {
     *     if (engine) {
     *         engine.destroy();
     *     }
     * });
     * ```
     */
    destroy() {
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

    // ============================================================
    // 私有方法（内部工具方法）
    // ============================================================

    /**
     * @private 私有方法 - 生成单元格的唯一标识键
     *
     * 将工作表名、行号、列号组合成唯一的字符串键，
     * 用于在依赖图Map中标识特定单元格。
     *
     * 键格式："{SheetName}!{row},{col}"
     * - SheetName: 工作表名称
     * - row: 行索引（0-based）
     * - col: 列索引（0-based）
     * - 分隔符: "!" 分隔表名和坐标，"," 分隔行和列
     *
     * 设计考虑：
     * - 使用字符串键而非对象，因为Map的键比较对对象是引用相等
     * - 格式简洁，便于调试日志输出
     * - 包含工作表信息，支持跨表引用
     * - 使用特殊字符分隔，便于正则解析（#parseKey）
     *
     * @param {string} sheetName - 工作表名称
     * @param {number} row - 行索引（0-based）
     * @param {number} col - 列索引（0-based）
     *
     * @returns {string} 单元格唯一标识键
     *
     * @example
     * #cellKey('Sheet1', 0, 0)   // → "Sheet1!0,0" (A1)
     * #cellKey('Sheet2', 4, 2)   // → "Sheet2!4,2" (C5 in Sheet2)
     * #cellKey('Data', 99, 25)   // → "Data!99,25" (Z100 in Data)
     */
    #cellKey(sheetName, row, col) {
        return `${sheetName}!${row},${col}`;
    }

    /**
     * @static @private 静态私有字段 - 单元格键的正则表达式模式
     */
    static #CELL_KEY_RE = /^(.+)!(\d+),(\d+)$/;

    /**
     * @static @private 静态私有字段 - 范围键的正则表达式模式
     */
    static #RANGE_KEY_RE = /^(.+)!(\d+),(\d+):(\d+),(\d+)$/;

    /**
     * @private 私有方法 - 解析单元格键，提取工作表名、行号、列号
     *
     * 与 #cellKey() 相反的操作，从键字符串还原为各组件。
     *
     * @param {string} key - 由 #cellKey() 生成的键字符串
     *
     * @returns {[string, number, number]} 包含三个元素的数组：
     *          [0] sheetName: string - 工作表名称
     *          [1] row: number - 行索引（0-based）
     *          [2] col: number - 列索引（0-based）
     *          如果格式不匹配，返回 ["", 0, 0]
     */
    #parseKey(key) {
        const match = key.match(FormulaEngine.#CELL_KEY_RE);
        if (!match) return ["", 0, 0];
        return [match[1], parseInt(match[2], 10), parseInt(match[3], 10)];
    }

    /**
     * @private 私有方法 - 解析范围键，提取范围边界信息
     *
     * 范围键格式："{SheetName}!{topRow},{topCol}:{bottomRow},{bottomCol}"
     *
     * @param {string} key - 范围依赖的键字符串
     *
     * @returns {Object|null} 范围信息对象或null
     *          成功时返回：
     *          {
     *            sheetName: string,
     *            topRow: number,
     *            topCol: number,
     *            bottomRow: number,
     *            bottomCol: number
     *          }
     *          格式不匹配时返回 null
     */
    #parseRangeKey(key) {
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

    /**
     * @private 私有方法 - 判断单元格是否在指定范围内
     *
     * 检查给定坐标是否落在范围键描述的矩形区域内。
     * 用于 onCellChanged 时判断某个单元格的变化
     * 是否会影响引用了该范围的公式。
     *
     * @param {string} sheetName - 待检查单元格的工作表名
     * @param {number} row - 待检查单元格的行索引（0-based）
     * @param {number} col - 待检查单元格的列索引（0-based）
     * @param {string} rangeKey - 范围键（由 #cellKey 生成或 #parseRangeKey 解析）
     *
     * @returns {boolean}
     *          true: 单元格在范围内（包括边界上）且工作表匹配
     *          false: 单元格在范围外、工作表不匹配、或范围键格式无效
     */
    #isCellInRange(sheetName, row, col, rangeKey) {
        const range = this.#parseRangeKey(rangeKey);
        if (!range) return false;
        if (range.sheetName !== sheetName) return false;
        return row >= range.topRow && row <= range.bottomRow && col >= range.topCol && col <= range.bottomCol;
    }

    /**
     * @private 私有方法 - 判断键是否为范围类型（包含冒号）
     *
     * 范围键的格式包含冒号分隔的两个坐标点，
     * 单元格键不包含冒号。
     *
     * @param {string} key - 待判断的依赖键
     *
     * @returns {boolean}
     *          true: 是范围键（如 "Sheet1!0,0:9,4"）
     *          false: 是单元格键（如 "Sheet1!5,3"）或格式异常
     */
    #isRangeKey(key) {
        return key.includes(":");
    }

    /**
     * @private 私有方法 - 将范围添加到空间索引中
     *
     * 空间索引按行分桶，将范围插入到其覆盖的所有桶中。
     * 查询时只需搜索目标单元格所在的桶即可。
     *
     * 桶分配算法：
     * 1. 计算范围的起始桶号：startBucket = floor(topRow / bucketSize)
     * 2. 计算范围的结束桶号：endBucket = floor(bottomRow / bucketSize)
     * 3. 对 [startBucket, endBucket] 区间内的每个桶：
     *    - 生成桶键："SheetName:bucketIndex"
     *    - 获取或创建该桶的Map
     *    - 将范围信息存入桶Map
     *
     * 一个跨桶的范围会出现在多个桶中，
     * 这是为了确保查询时不遗漏。
     *
     * @param {string} rangeKey - 范围的唯一标识键
     * @param {Object} range - 范围边界信息
     *                        { sheetName, topRow, bottomRow, topCol, bottomCol }
     */
    #addToSpatialIndex(rangeKey, range) {
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

    /**
     * @private 私有方法 - 从空间索引中移除范围
     *
     * 与 #addToSpatialIndex() 相反的操作。
     * 从范围覆盖的所有桶中删除该范围的记录。
     * 如果桶变空则一并删除桶本身，释放内存。
     *
     * @param {string} rangeKey - 要移除的范围键
     * @param {Object|null} range - 范围边界信息（如果为null则跳过）
     */
    #removeFromSpatialIndex(rangeKey, range) {
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

    /**
     * @private 私有方法 - 使用空间索引查找包含指定单元格的范围依赖
     *
     * 这是 onCellChanged() 的关键优化步骤。
     * 当单元格 (row, col) 变化时，需要找出所有
     * 引用了包含该单元格的范围的公式。
     *
     * 查询流程：
     * 1. 根据行号计算目标桶索引：bucketIndex = floor(row / bucketSize)
     * 2. 生成桶键："SheetName:bucketIndex"
     * 3. 从 rangeSpatialIndex 获取该桶的Map
     * 4. 遍历桶内所有范围，检查是否包含目标单元格
     * 5. 对匹配的范围，从 rangeDependents 获取依赖它的公式列表
     * 6. 将这些公式加入 dirtyCells（如果尚未访问）
     * 7. 递归收集这些公式的依赖者（级联传播）
     *
     * 性能优势：
     * 假设有 R 个范围，桶大小为 B，工作表有 N 行：
     * - 无索引：需要检查所有 R 个范围 → O(R)
     * - 有索引：只检查目标桶内的范围 → O(R/N*B)
     * - 典型情况：R=10000, B=256, N=10000 → 约39次比较 vs 10000次
     *
     * @param {string} sheetName - 变化单元格的工作表名
     * @param {number} row - 变化单元格的行索引
     * @param {number} col - 变化单元格的列索引
     * @param {Set<string>} visitedFormulas - 已访问公式集合（防止重复和循环）
     */
    #findRangeDependents(sheetName, row, col, visitedFormulas) {
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

    /**
     * @private 私有方法 - 对公式列表进行拓扑排序（Kahn算法）
     *
     * 拓扑排序确保在重算时，被依赖的公式先于依赖它的公式计算。
     * 这对于保证计算结果的正确性至关重要。
     *
     * 例如：
     * - B2 = A1 + 1  （B2 依赖 A1）
     * - C5 = B2 * 2  （C5 依赖 B2）
     * 正确的计算顺序：A1(如果也是公式) → B2 → C5
     *
     * 算法说明（Kahn算法 / BFS拓扑排序）：
     * 1. 计算每个节点的入度（被多少其他节点依赖）
     * 2. 建立邻接表（依赖关系图）
     * 3. 将入度为0的节点加入队列
     * 4. 循环取出队列头部节点，加入结果列表
     * 5. 对该节点的所有后继节点入度减1
     * 6. 如果后继节点入度变为0，加入队列
     * 7. 重复直到队列为空
     *
     * 处理循环依赖：
     * 如果存在循环依赖（A→B→C→A），
     * 这些节点的入度永远不会变为0，
     * 它们不会出现在前半部分的有序结果中。
     * 最后将剩余的未排序节点追加到末尾，
     * 保证不丢失任何公式（虽然顺序可能不完全正确）。
     *
     * 时间复杂度：O(V + E)
     * - V: 公式数量（顶点数）
     * - E: 公式间的依赖关系数量（边数）
     *
     * @param {string[]} formulaKeys - 需要排序的公式键数组
     *
     * @returns {string[]} 拓扑排序后的公式键数组
     *                  依赖者排在被依赖者之后
     *                  无循环依赖时完全正确
     *                  有循环依赖时，循环部分追加到末尾
     */
    #topologicalSort(formulaKeys) {
        const keySet = new Set(formulaKeys);
        const inDegree = new Map();
        const adj = new Map();

        for (const key of formulaKeys) {
            inDegree.set(key, 0);
            adj.set(key, []);
        }

        for (const key of formulaKeys) {
            const deps = this.dependsOn.get(key);
            if (!deps) continue;

            for (const dep of deps) {
                if (!this.#isRangeKey(dep) && keySet.has(dep)) {
                    inDegree.set(key, inDegree.get(key) + 1);
                    adj.get(dep).push(key);
                }
            }
        }

        const queue = [];
        for (const [key, degree] of inDegree) {
            if (degree === 0) queue.push(key);
        }

        const sorted = [];
        while (queue.length > 0) {
            const key = queue.shift();
            sorted.push(key);

            for (const dependent of adj.get(key)) {
                const newDegree = inDegree.get(dependent) - 1;
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

    /**
     * @private 私有方法 - 更新公式的依赖关系（核心依赖图维护方法）
     *
     * 在 setFormula() 或重算完成后调用，
     * 将公式的最新依赖项注册到依赖图中。
     *
     * 执行流程：
     * 【1. 清理旧依赖】
     * 如果该公式之前已有依赖记录（oldDeps）：
     * - 遍历每个旧依赖项
     * - 从 dependents[dep] 中移除该公式
     * - 如果 dependents[dep] 变空，删除整个条目
     * - 如果是范围依赖，同步更新 rangeDependents 和 rangeSpatialIndex
     *
     * 【2. 注册新依赖】
     * - 将 newDeps 存入 dependsOn[formulaKey]
     * - 对每个新依赖项 dep：
     *   a. 确保 dependents[dep] 存在（如不存在则创建空Set）
     *   b. 将 formulaKey 加入 dependents[dep]
     *   c. 如果是范围依赖：
     *      - 更新 rangeDependents
     *      - 如该范围首次被引用，添加到空间索引
     *
     * 为什么需要先清理再注册？
     * 公式的依赖可能发生变化（例如用户修改了公式），
     * 不清理会导致残留的无效依赖。
     *
     * @param {string} formulaKey - 公式单元格的键
     * @param {Set<string>} newDeps - 新的依赖项集合
     */
    #updateDependencies(formulaKey, newDeps) {
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
            this.dependents.get(dep).add(formulaKey);

            if (this.#isRangeKey(dep)) {
                if (!this.rangeDependents.has(dep)) {
                    this.rangeDependents.set(dep, new Set());
                    const range = this.#parseRangeKey(dep);
                    if (range) this.#addToSpatialIndex(dep, range);
                }
                this.rangeDependents.get(dep).add(formulaKey);
            }
        }
    }

    /**
     * @private 私有方法 - 条件性更新依赖关系（仅在变化时更新）
     *
     * #updateDependencies() 的优化版本，
     * 先比较新旧依赖集合，只有确实发生变化时才执行更新。
     *
     * 为什么需要这个优化？
     * 在 #recalculate() 中，大多数公式的依赖关系不会改变
     * （只是引用的值变了），频繁更新依赖图是浪费的。
     *
     * 比较策略：
     * 1. 如果旧依赖不存在 → 视为变化，直接更新
     * 2. 如果新旧依赖数量不同 → 必然有变化，直接更新
     * 3. 如果数量相同 → 逐项比较：
     *    - 遍历新依赖的每一项
     *    - 检查旧依赖中是否存在
     *    - 任一项不存在则视为变化
     * 4. 完全相同 → 返回 false，跳过更新
     *
     * 性能影响：
     * - 比较操作：O(D)，D=依赖数量
     * - 避免无效更新：节省 Map 的删除和插入操作
     * - 对于大型工作表效果明显
     *
     * @param {string} formulaKey - 公式单元格键
     * @param {Set<string>} newDeps - 新的依赖项集合
     *
     * @returns {boolean} 依赖关系是否发生了变化
     *          true: 发生了变化，已调用 #updateDependencies()
     *          false: 无变化，未执行任何操作
     */
    #updateDependenciesIfChanged(formulaKey, newDeps) {
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

    /**
     * @private 私有方法 - 完全移除公式的所有依赖关系
     *
     * 在 removeFormula() 时调用，
     * 将该公式从依赖图中彻底清除。
     *
     * 执行步骤：
     * 1. 从 dependsOn 中删除该公式条目
     * 2. 获取旧依赖集合（如果存在）
     * 3. 对每个旧依赖项：
     *    a. 从 dependents[dep] 中移除该公式
     *    b. 如果 dependents[dep] 变空，删除整个条目
     *    c. 如果是范围依赖：
     *       - 从 rangeDependents[dep] 中移除该公式
     *       - 如果 rangeDependents[dep] 变空，从空间索引中移除该范围
     *
     * 与 #updateDependencies 的区别：
     * - #updateDependencies: 替换依赖（先清后加）
     * - #removeDependencies: 完全清除（只清不加）
     *
     * @param {string} formulaKey - 要移除的公式单元格键
     */
    #removeDependencies(formulaKey) {
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

    /**
     * @private 私有方法 - 递归收集受影响的公式（级联依赖传播）
     *
     * 在 onCellChanged() 中调用，
     * 从一个脏公式出发，递归查找所有直接或间接
     * 依赖于该公式的其他公式。
     *
     * 为什么需要递归？
     * 假设依赖链：A → B → C → D
     * 当 A 变化时：
     * - 直接依赖者：B（第一层）
     * - B 的依赖者：C（第二层）
     * - C 的依赖者：D（第三层）
     * 只查一层会漏掉 C 和 D。
     *
     * 算法流程：
     * 1. 在 dependents 中查找 key 的直接依赖者集合
     * 2. 对每个依赖者 formulaKey：
     *    a. 检查是否已访问过（防止循环和重复）
     *    b. 标记为已访问，加入 dirtyCells
     *    c. 递归调用自身，继续向下传播
     *
     * 防止无限循环：
     * visited Set 记录所有已访问的公式，
     * 如果再次遇到同一个公式则停止递归。
     * 这在存在循环依赖时尤为重要：
     * A→B→C→A 会形成闭环，
     * 没有 visited 会导致栈溢出。
     *
     * 时间复杂度：O(V + E)
     * V = 受影响的公式数量，E = 它们之间的边数
     *
     * @param {string} key - 当前正在处理的公式键
     * @param {Set<string>} visited - 已访问的公式集合（用于防循环）
     */
    #collectDirty(key, visited) {
        if (visited.has(key)) return;
        visited.add(key);

        const depSet = this.dependents.get(key);
        if (!depSet) return;

        for (const formulaKey of depSet) {
            this.dirtyCells.add(formulaKey);
            this.#collectDirty(formulaKey, visited);
        }
    }

    /**
     * @private 私有方法 - 执行脏单元格的实际重算操作
     *
     * 这是 onCellChanged() 的核心计算步骤。
     * 遍历 dirtyCells 集合中的每个公式，
     * 使用缓存的AST重新求值，并更新相关状态。
     *
     * 执行流程：
     * 【步骤1：准备阶段】
     * - 创建 results 数组，用于记录值发生变化的单元格
     * - 清空脏标记集合（重算完成后不再需要）
     *
     * 【步骤2：逐个公式重算】
     * 对 dirtyCells 中的每个 key：
     * a. 从 astCache 获取缓存的AST（跳过无缓存的）
     * b. 解析 key 获取工作表名、行号、列号
     * c. 确定目标工作表实例
     * d. 重置 evaluator.dependencies 为新Set
     * e. 调用 evaluator.evaluate() 计算新值
     * f. 捕获可能的异常，返回 "#VALUE!" 错误
     * g. 更新 resultCache 缓存
     * h. 比较新旧值是否变化
     * i. 如果变化：
     *      - 更新 cellStore 中的值
     *      - 条件性更新依赖关系（#updateDependenciesIfChanged）
     *      - 将变更信息加入 results 数组
     *
     * 【步骤3：返回结果】
     * 返回 results 数组供 onCellChanged() 使用，
     * 后续会触发UI失效通知。
     *
     * 错误处理策略：
     * - 单个公式求值异常不影响其他公式
     * - 异常时返回 "#VALUE!" 并继续处理
     * - 不抛出异常到上层调用者
     *
     * 性能优化点：
     * - 使用缓存避免重复解析公式字符串
     * - 条件性更新依赖关系减少Map操作
     * - 只记录实际变化的单元格减少UI更新开销
     *
     * @param {Object} sheet - 当前工作表实例（作为默认目标）
     *
     * @returns {Array<Object>} 发生变化的单元格信息数组
     *          每个元素结构：
     *          {
     *            sheetName: string,   // 工作表名称
     *            row: number,         // 行索引（0-based）
     *            col: number,         // 列索引（0-based）
     *            newValue: any        // 新的计算结果
     *          }
     */
    #recalculate(sheet) {
        const results = [];

        for (const key of this.dirtyCells) {
            const ast = this.astCache.get(key);
            if (!ast) continue;

            const [sheetName, row, col] = this.#parseKey(key);
            const targetSheet = this.workbook?.sheets.get(sheetName) || sheet;

            this.evaluator.dependencies = new Set();
            let result;
            try {
                result = this.evaluator.evaluate(ast, targetSheet, key);
            } catch (e) {
                result = "#VALUE!";
            }

            const depsChanged = this.#updateDependenciesIfChanged(key, this.evaluator.dependencies);

            const cell = targetSheet.cellStore.get(row, col);
            if (cell && cell.formula) {
                const oldValue = this.resultCache.get(key);
                const valueChanged = oldValue === undefined || oldValue !== result;

                if (valueChanged || depsChanged) {
                    targetSheet.cellStore.set(row, col, new cell.constructor(result, cell.styleId, cell.disabled, cell.formula));
                    this.resultCache.set(key, result);
                    results.push({ sheetName, row, col, newValue: result });
                }
            }
        }

        this.dirtyCells.clear();

        return results;
    }

    /**
     * @private 私有方法 - 将AST节点还原为原始公式字符串（序列化）
     *
     * 与 FormulaParser.parse() 的逆操作。
     * 将内存中的AST结构转换回可读的公式文本，
     * 用于调试、显示、存储或比较。
     *
     * 递归处理各种AST节点类型：
     * - literal: 数字或字符串常量
     *   - 数字直接返回
     *   - 字符串用双引号包裹（转义内部引号）
     *
     * - cellRef: 单元格引用
     *   - 格式："{SheetName}!{ColLetter}{RowNumber}"
     *   - 使用 #toExcelCol() 将列索引转换为字母
     *
     * - rangeRef: 范围引用
     *   - 格式："{StartCell}:{EndCell}"
     *   - 分别序列化起点和终点单元格
     *
     * - binaryOp: 二元运算
     *   - 格式："(left operator right)"
     *   - 用括号确保优先级正确
     *   - 例如："(A1 + B2)"
     *
     * - unaryOp: 一元运算
     *   - 格式："(-operand)"
     *   - 目前只支持负号
     *   - 例如："(-5)"
     *
     * - function: 函数调用
     *   - 格式："{FUNC_NAME}(arg1, arg2, ...)"
     *   - 递归序列化每个参数
     *   - 参数间用逗号和空格分隔
     *
     * 注意事项：
     * - 输出格式可能与原始输入略有不同（空格、括号等）
     * - 但语义完全等价，重新解析会得到相同的AST
     * - 用于 getFormula() 返回用户可读的公式字符串
     *
     * @param {Object} ast - AST根节点或子树节点
     *
     * @returns {string} 公式字符串（不含前导 "="）
     *
     * @example
     * // 输入AST:
     * {
     *   type: "binaryOp",
     *   operator: "+",
     *   left: { type: "cellRef", sheetName: "Sheet1", col: 0, row: 0 },
     *   right: { type: "literal", value: 100 }
     * }
     * // 输出："(A1 + 100)"
     *
     * // 输入AST:
     * {
     *   type: "function",
     *   name: "SUM",
     *   args: [
     *     { type: "rangeRef", start: {...}, end: {...} },
     *     { type: "literal", value: 50 }
     *   ]
     * }
     * // 输出："SUM(A1:B10, 50)"
     */
    #astToRaw(ast) {
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

    /**
     * 验证专用同步求值方法
     * 支持：
     * - 自定义函数（通过 functionRegistry）
     * - 内置函数
     * - 单元格引用
     * - 虚拟上下文（编辑时单元格可能没有实际值）
     *
     * @param {string} formulaStr - 公式字符串（含前导 "="）
     * @param {Object} context - 验证上下文
     * @param {*} context.value - 当前单元格值
     * @param {number} context.row - 当前行号
     * @param {number} context.col - 当前列号
     * @param {object} context.sheet - Sheet 实例
     * @param {object} [context.workbook] - Workbook 实例
     * @param {Object} [context.options] - 求值选项
     * @returns {*} 公式计算结果
     */
    evaluateForValidation(formulaStr, context = {}) {
        return Promise.resolve().then(() => this.evaluateForValidationSync(formulaStr, context));
    }

    /**
     * 验证专用同步求值方法
     * 支持：
     * - 自定义函数（通过 functionRegistry）
     * - 内置函数
     * - 单元格引用
     * - 虚拟上下文（编辑时单元格可能没有实际值）
     *
     * @param {string} formulaStr - 公式字符串（含前导 "="）
     * @param {Object} context - 验证上下文
     * @param {*} context.value - 当前单元格值
     * @param {number} context.row - 当前行号
     * @param {number} context.col - 当前列号
     * @param {object} context.sheet - Sheet 实例
     * @param {object} [context.workbook] - Workbook 实例
     * @param {Object} [context.options] - 求值选项
     * @returns {*} 公式计算结果
     */
    evaluateForValidationSync(formulaStr, context = {}) {
        if (!formulaStr || typeof formulaStr !== "string") {
            return true;
        }

        const raw = formulaStr.startsWith("=") ? formulaStr.substring(1) : formulaStr;

        let ast;
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
        const targetSheet = sheet || this.workbook?.getActiveSheet?.();

        if (!targetSheet) {
            errorHandler.debug(ERROR_CODE.VALIDATION_ERROR, "验证上下文缺少 sheet", { context });
            return false;
        }

        const virtualSheet = this.#createVirtualSheet(targetSheet, row, col, value);

        this.evaluator.dependencies = new Set();

        try {
            const result = this.evaluator.evaluate(ast, virtualSheet);
            return result;
        } catch (evalError) {
            errorHandler.debug(ERROR_CODE.FORMULA_EVAL_ERROR, `验证公式求值失败: ${formulaStr}`, {
                formulaStr,
                error: evalError,
            });
            return false;
        }
    }

    /**
     * @private 私有方法 - 创建虚拟工作表（用于公式验证时的隔离求值环境）
     *
     * 在 evaluateForValidationSync() 中调用，
     * 为正在编辑的公式创建一个临时的、隔离的工作表对象。
     *
     * 为什么需要虚拟工作表？
     * 当用户在单元格中输入公式时（编辑状态）：
     * - 该单元格的新值尚未保存到 cellStore
     * - 但公式可能引用自身（虽然不推荐，但需要处理）
     * - 需要在验证时使用用户输入的值，而非旧值
     * - 不能修改真实的 cellStore（避免副作用）
     *
     * 虚拟工作表的特性：
     * 1. 代理 cellStore.get 操作：
     *    - 如果查询的是当前编辑的单元格 (row, col)
     *      → 返回用户输入的新值 value
     *    - 否则 → 委托给真实工作表的 cellStore
     * 2. 禁用 cellStore.set 操作：
     *    - set 是空函数，防止验证过程修改数据
     * 3. 保持其他属性不变：
     *    - name: 使用真实工作表名（保证跨表引用正确）
     *    - cellDataAccessor: 委托给真实工作表
     *    - getAllCells: 返回空数组（验证不需要遍历）
     *    - workbook: 引用真实工作簿实例
     *
     * 设计模式：代理模式（Proxy Pattern）
     * 虚拟工作表作为真实工作表的代理，
     * 拦截并修改 get 行为，禁用 set 行为。
     *
     * @param {Object} realSheet - 真实的工作表实例
     * @param {number} row - 当前编辑单元格的行索引
     * @param {number} col - 当前编辑单元格的列索引
     * @param {*} value - 用户输入的新值（可能是部分输入的文本）
     *
     * @returns {Object} 虚拟工作表对象（模拟 Sheet 接口）
     */
    #createVirtualSheet(realSheet, row, col, value) {
        const self = this;

        return {
            name: realSheet.name,
            cellStore: {
                get: (r, c) => {
                    if (r === row && c === col) {
                        return { value, formula: null };
                    }
                    return realSheet.cellStore?.get?.(r, c) || null;
                },
                set: () => {},
            },
            cellDataAccessor: realSheet.cellDataAccessor,
            getAllCells: () => [],
            workbook: self.workbook,
        };
    }
}
