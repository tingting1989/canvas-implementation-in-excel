/**
 * 公式解析器 (Formula Parser)
 *
 * 核心功能：
 * 将Excel公式字符串转换为AST（Abstract Syntax Tree，抽象语法树），
 * 为后续的公式计算引擎提供结构化的表达式树。
 *
 * 支持的语法元素：
 *
 * 【单元格引用】
 * - 单元格：A1、B2、AA10（列字母+行数字）
 * - 范围：A1:B10（左上角:右下角）
 * - 跨表引用：Sheet2!A1、Sheet2!A1:B10（工作表名!单元格/范围）
 *
 * 【字面量】
 * - 数字常量：123、-456、78.90、.5
 * - 字符串常量："hello"、'world'
 * - 错误值：#N/A、#VALUE!、#REF!等
 *
 * 【运算符】
 * 算术运算符（按优先级从低到高）：
 *   + 加法        | 优先级: 1 | 左结合
 *   - 减法        | 优先级: 1 | 左结合
 *   * 乘法        | 优先级: 2 | 左结合
 *   / 除法        | 优先级: 2 | 左结合
 *   ^ 幂运算      | 优先级: 3 | 右结合（特殊）
 *   & 字符串连接  | 优先级: 0 | 左结合（最低）
 *
 * 比较运算符（优先级: -1，最低）：
 *   = 等于       | <> 不等于
 *   < 小于       | > 大于
 *   <= 小于等于  | >= 大于等于
 *
 * 【函数调用】
 * - 标准格式：SUM(A1:A10)、IF(condition, true_val, false_val)
 * - 支持嵌套：SUM(IF(A1:A10>0, A1:A10, 0))
 * - 参数分隔：逗号(,)，可变参数数量
 *
 * 【括号分组】
 * - 用于改变运算优先级：(A1+B1)*C1
 * - 用于函数参数：FUNCTION(arg1, arg2)
 *
 * 【坐标系统说明】
 * 采用零基索引（与Excel的显示行号差1）：
 * - 列索引：A=0, B=1, ..., Z=25, AA=26, AB=27, ..., ZZ=701
 * - 行索引：第1行=0, 第2行=1, ..., 第100行=99
 * - 示例转换：
 *   A1 → {row: 0, col: 0}
 *   B5 → {row: 4, col: 1}
 *   AA10 → {row: 9, col: 26}
 *   Z100 → {row: 99, col: 25}
 *
 * 【AST节点类型】
 * 生成的AST包含以下节点类型：
 * - literal: 字面量（数字、字符串、布尔值、错误值）
 * - cellRef: 单元格引用（含工作表名、行列号）
 * - rangeRef: 范围引用（矩形区域，4个边界值）
 * - function: 函数调用（函数名 + 参数数组）
 * - binaryOp: 二元运算（运算符 + 左操作数 + 右操作数）
 * - unaryOp: 一元运算（运算符 + 操作数，目前仅负号）
 *
 * 【使用示例】
 * 输入：SUM(A1:B2)*2+COUNT(C1:C10)
 * 输出AST：
 * {
 *   type: "binaryOp", operator: "+",
 *   left: {
 *     type: "binaryOp", operator: "*",
 *     left: { type: "function", name: "SUM", args: [{ type: "rangeRef", ... }] },
 *     right: { type: "literal", value: 2 }
 *   },
 *   right: { type: "function", name: "COUNT", args: [{ type: "rangeRef", ... }] }
 * }
 */

import { colToIndex, indexToCol } from "../utils/cellRef.js";

/**
 * Token 类型枚举
 * 定义词法分析阶段识别的所有符号类型
 */
const TOKEN = {
    NUMBER: "NUMBER", // 数字常量：123, 456.78, .9
    STRING: "STRING", // 字符串常量："hello", 'world'
    CELL_REF: "CELL_REF", // 单元格引用：A1, B2, AA10
    RANGE: "RANGE", // 范围引用标记（内部用COLON表示）
    FUNCTION: "FUNCTION", // 函数名标识符：SUM, IF, VLOOKUP
    OPERATOR: "OPERATOR", // 运算符：+, -, *, /, ^, &, =, <>, <, >, <=, >=
    LPAREN: "LPAREN", // 左括号：(
    RPAREN: "RPAREN", // 右括号：)
    COMMA: "COMMA", // 逗号：,
    COLON: "COLON", // 冒号：（用于范围 A1:B10）
    SHEET_REF: "SHEET_REF", // 工作表引用：Sheet2（在 ! 之前）
    ERROR: "ERROR", // Excel错误值：#N/A, #VALUE!, #REF!
    EOF: "EOF", // 结束标记（End of File）
};

/**
 * Excel错误值标准化映射
 * 将各种形式的错误值统一为标准格式
 * 支持大小写不敏感和常见变体（如 #NA 和 #N/A）
 */
const EXCEL_ERRORS = {
    "#N/A": "#N/A", // 值不可用（Not Available）
    "#NA": "#N/A", // #N/A 的简写形式
    "#VALUE!": "#VALUE!", // 值类型错误（Wrong data type）
    "#REF!": "#REF!", // 引用无效（Invalid reference）
    "#DIV/0!": "#DIV/0!", // 除以零错误（Division by zero）
    "#NUM!": "#NUM!", // 数值无效（Invalid number）
    "#NAME?": "#NAME?", // 名称未识别（Unrecognized name）
    "#NULL!": "#NULL!", // 交集无结果（Null intersection）
    "#NULL?": "#NULL!", // #NULL! 的变体
    "#GETTING_DATA": "#GETTING_DATA", // 数据加载中（异步计算时）
};

/**
 * 运算符属性表
 * 定义每个运算符的优先级（precedence）和结合性（associativity）
 *
 * 优先级规则（数值越大优先级越高）：
 * - 优先级高的运算符先计算
 * - 相同优先级根据结合性决定顺序
 * - 左结合(L)：从左到右计算（a-b-c = (a-b)-c）
 * - 右结合(R)：从右到左计算（a^b^c = a^(b^c)）
 *
 * 特殊说明：
 * - & (字符串连接) 优先级最低(0)，确保在算术运算后执行
 * - 比较运算符 优先级为(-1)，在所有算术运算后执行
 * - ^ (幂运算) 是唯一右结合的运算符（数学惯例）
 */
const OPERATORS = {
    "+": { prec: 1, assoc: "L" }, // 加法：左结合，中等优先级
    "-": { prec: 1, assoc: "L" }, // 减法：左结合，中等优先级
    "*": { prec: 2, assoc: "L" }, // 乘法：左结合，较高优先级
    "/": { prec: 2, assoc: "L" }, // 除法：左结合，较高优先级
    "^": { prec: 3, assoc: "R" }, // 幂运算：右结合（特殊！），最高优先级
    "&": { prec: 0, assoc: "L" }, // 字符串连接：左结合，最低优先级
    "=": { prec: -1, assoc: "L" }, // 等于：比较运算符
    "<>": { prec: -1, assoc: "L" }, // 不等于：比较运算符
    "<": { prec: -1, assoc: "L" }, // 小于：比较运算符
    ">": { prec: -1, assoc: "L" }, // 大于：比较运算符
    "<=": { prec: -1, assoc: "L" }, // 小于等于：比较运算符
    ">=": { prec: -1, assoc: "L" }, // 大于等于：比较运算符
};

/**
 * 解析公式字符串的主入口函数
 *
 * 执行流程：
 * 1. 词法分析：将公式字符串转换为Token流
 * 2. 语法分析：将Token流转换为AST（抽象语法树）
 * 3. 返回AST根节点供计算引擎使用
 *
 * @param {string} formula - Excel公式字符串（不含前导"="号）
 *                          示例："SUM(A1:B10)*2+COUNT(C1:C10)"
 * @returns {Object} AST根节点 - 抽象语法树的根节点对象
 *                        节点结构取决于公式内容：
 *                        - 简单值：{type:"literal", value:123}
 *                        - 单元格引用：{type:"cellRef", row:0, col:0, sheet:null}
 *                        - 运算表达式：{type:"binaryOp", operator:"+", left:{...}, right:{...}}
 *                        - 函数调用：{type:"function", name:"SUM", args:[...]}
 *
 * @example
 * parseFormula("1+2*3")
 * // 返回:
 * // {
 * //   type: "binaryOp",
 * //   operator: "+",
 * //   left: { type: "literal", value: 1 },
 * //   right: {
 * //     type: "binaryOp",
 * //     operator: "*",
 * //     left: { type: "literal", value: 2 },
 * //     right: { type: "literal", value: 3 }
 * //   }
 * // }
 *
 * @throws {Error} 当公式包含语法错误时抛出异常
 */
export function parseFormula(formula) {
    const tokens = tokenize(formula);

    if (tokens.length === 0) {
        return { type: "literal", value: "" };
    }

    const parser = new Parser(tokens);
    const ast = parser.parseExpression();

    return ast;
}

/**
 * 递归下降解析器类 (Recursive Descent Parser)
 *
 * 实现基于运算符优先级的解析算法（Pratt Parser / Precedence Climbing），
 * 能够正确处理复杂的嵌套表达式和运算符优先级。
 *
 * 核心方法：
 * - peek(): 查看当前Token但不移动位置
 * - consume(): 消费当前Token并移动到下一个
 * - parseExpression(): 解析表达式（处理二元/一元运算符）
 * - parsePrimary(): 解析基本元素（字面量、单元格、函数等）
 * - parseRange(): 解析范围引用（A1:B10）
 * - parseFunction(): 解析函数调用（SUM(...), IF(...)）
 *
 * 算法特点：
 * 1. 使用minPrec参数控制运算符优先级
 * 2. 左结合运算符使用 prec+1 阻止右结合
 * 3. 右结合运算符（^）使用 prec 允许右结合
 * 4. 支持一元运算符（负号）的前缀解析
 */
class Parser {
    /**
     * 构造函数
     * @param {Array<Object>} tokens - tokenize()生成的Token数组
     *                                每个Token结构：{type, value}
     */
    constructor(tokens) {
        this.tokens = tokens; // Token流
        this.pos = 0; // 当前解析位置（指针）
    }

    /**
     * 查看当前Token（不消费）
     * 用于前瞻判断而不改变解析状态
     *
     * @returns {Object} 当前位置的Token对象
     *                  如果已到达末尾，返回EOF Token
     */
    peek() {
        return this.tokens[this.pos] || { type: TOKEN.EOF, value: "" };
    }

    /**
     * 消费当前Token并前进到下一个
     * 可选的类型检查确保语法的正确性
     *
     * @param {string|null} expectedType - 期望的Token类型（可选）
     *                                    如果提供且不匹配则抛出错误
     * @returns {Object} 被消费的Token对象
     * @throws {Error} 当类型不匹配时抛出语法错误
     */
    consume(expectedType) {
        const token = this.tokens[this.pos];

        if (expectedType && token.type !== expectedType) {
            throw new Error(`Expected ${expectedType} but got ${token.type} at position ${this.pos}`);
        }

        this.pos++;
        return token;
    }

    /**
     * 解析表达式（核心方法）
     *
     * 使用优先级上升算法（Precedence Climbing）处理运算符：
     * 1. 先解析一元运算符（如负号 -）
     * 2. 解析左侧操作数（调用parsePrimary）
     * 3. 循环处理二元运算符，根据优先级决定是否继续
     *
     * @param {number} [minPrec=-2] - 最小允许的运算符优先级
     *                               用于控制递归深度和结合性
     *                               初始调用时使用-2（低于所有运算符）
     *                               递归调用时会提高此值以实现正确的优先级
     *
     * @returns {Object} AST节点 - 表达式对应的AST子树
     *                            可能的类型：
     *                            - unaryOp: 一元运算（负号）
     *                            - binaryOp: 二元运算（加减乘除等）
     *                            - literal/cellRef/rangeRef/function: 基本元素
     *
     * @example
     * // 解析 "1+2*3" 的过程：
     * // 1. minPrec=-2, 解析left=1 (literal)
     * // 2. 遇到+, prec=1 >= -2, 消费+
     * // 3. nextMinPrec=2 (左结合, prec+1), 递归解析right
     * // 4. 递归中minPrec=2, 解析left=2
     * // 5. 遇到*, prec=2 >= 2, 消费*
     * // 6. nextMinPrec=3, 递归解析right=3
     * // 7. 返回 {type:"binaryOp", operator:"*", left:2, right:3}
     * // 8. 外层返回 {type:"binaryOp", operator:"+", left:1, right:(2*3)}
     */
    parseExpression(minPrec = -2) {
        const token = this.peek();

        // 处理一元运算符（目前仅支持负号）
        // 一元运算符的优先级设为-1，高于初始值但低于二元运算符
        if (token.type === TOKEN.OPERATOR && token.value === "-") {
            this.consume();
            const operand = this.parseExpression(-1);

            return {
                type: "unaryOp",
                operator: "-",
                operand,
            };
        }

        // 解析左侧基本元素（数字、字符串、单元格、函数等）
        let left = this.parsePrimary();

        // 循环处理后续的二元运算符
        while (this.pos < this.tokens.length) {
            const token = this.peek();

            // 只处理二元运算符
            if (token.type !== TOKEN.OPERATOR) break;

            // 获取当前运算符的属性
            const op = OPERATORS[token.value];

            // 如果运算符不存在或优先级不够高，停止循环
            // 这确保了高优先级运算符先被组合
            if (!op || op.prec < minPrec) break;

            // 消费运算符Token
            this.consume();

            // 计算右侧表达式的最小允许优先级
            // 左结合(L): 使用 prec+1，阻止相同优先级的右结合
            // 右结合(R): 使用 prec，允许相同优先级的右结合
            const nextMinPrec = op.assoc === "L" ? op.prec + 1 : op.prec;

            // 递归解析右侧表达式
            const right = this.parseExpression(nextMinPrec);

            // 构建二元运算AST节点
            left = {
                type: "binaryOp",
                operator: token.value,
                left,
                right,
            };
        }

        return left;
    }

    /**
     * 解析基本表达式元素（原子/终结符）
     *
     * 处理表达式中不可再分的基本单元：
     * - 字面量：数字、字符串、错误值
     * - 单元格引用：A1、B2（可能扩展为范围）
     * - 跨表引用：Sheet2!A1
     * - 函数调用：SUM(...)、IF(...)
     * - 括号分组：(expression)
     *
     * @returns {Object} AST叶子节点或复合节点
     *                  根据Token类型返回不同的AST结构：
     *                  - NUMBER/STRING/ERROR → literal节点
     *                  - CELL_REF → cellRef 或 rangeRef 节点
     *                  - SHEET_REF → 带工作表名的引用节点
     *                  - FUNCTION → function 节点
     *                  - LPAREN → 括号内表达式的AST
     *
     * @throws {Error} 遇到无法识别的Token时抛出语法错误
     */
    parsePrimary() {
        const token = this.peek();

        // 【数字常量】123, 456.78, .9
        // 返回字面量节点，value为解析后的数值
        if (token.type === TOKEN.NUMBER) {
            this.consume();

            return {
                type: "literal",
                value: token.value,
            };
        }

        // 【字符串常量】"hello", 'world'
        // 返回字面量节点，value为字符串内容（不含引号）
        if (token.type === TOKEN.STRING) {
            this.consume();

            return {
                type: "literal",
                value: token.value,
            };
        }

        // 【Excel错误值】#N/A, #VALUE!, #REF! 等
        // 返回字面量节点，value为标准化的错误字符串
        if (token.type === TOKEN.ERROR) {
            this.consume();

            return {
                type: "literal",
                value: token.value,
            };
        }

        // 【单元格引用】A1, B2, AA10
        // 检查后续是否有冒号(:)，如果有则解析为范围引用
        if (token.type === TOKEN.CELL_REF) {
            this.consume();

            const { sheet, row, col } = token.value;

            // 如果后面跟着冒号，说明是范围引用 A1:B10
            if (this.peek().type === TOKEN.COLON) {
                return this.parseRange(token);
            }

            // 否则是普通单元格引用
            return {
                type: "cellRef",
                sheet: sheet || null, // 工作表名（null表示当前表）
                row, // 行索引（0-based）
                col, // 列索引（0-based）
            };
        }

        // 【跨表引用】Sheet2!A1, Sheet3!B5:C10
        // 格式：工作表名 + ! + 单元格/范围
        if (token.type === TOKEN.SHEET_REF) {
            this.consume(); // 消费工作表名
            const sheetName = token.value; // 保存工作表名
            this.consume(TOKEN.OPERATOR); // 消费 "!" 运算符

            // 解析单元格引用部分
            const refToken = this.consume(TOKEN.CELL_REF);
            const { row, col } = refToken.value;

            // 检查是否是范围引用 Sheet2!A1:B10
            if (this.peek().type === TOKEN.COLON) {
                return this.parseRange(refToken, sheetName);
            }

            // 普通跨表单元格引用
            return {
                type: "cellRef",
                sheet: sheetName, // 非null，指定工作表
                row,
                col,
            };
        }

        // 【函数调用】SUM(...), IF(...), VLOOKUP(...)
        // 函数名后面必须跟左括号
        if (token.type === TOKEN.FUNCTION) {
            return this.parseFunction();
        }

        // 【括号分组】(expression)
        // 用于改变运算优先级或明确分组
        if (token.type === TOKEN.LPAREN) {
            this.consume(); // 消费 "("
            const expr = this.parseExpression(); // 递归解析内部表达式
            this.consume(TOKEN.RPAREN); // 消费 ")"
            return expr; // 返回括号内表达式的AST
        }

        // 【未知Token】抛出语法错误
        throw new Error(`Unexpected token: ${token.type} "${token.value}" at position ${this.pos}`);
    }

    /**
     * 解析范围引用（A1:B10, Sheet2!C5:D20）
     *
     * 范围引用表示一个矩形区域，由左上角和右下角两个单元格定义。
     * 无论输入顺序如何，都会规范化为：
     * - topRow/topCol：左上角坐标（较小值）
     * - bottomRow/bottomCol：右下角坐标（较大值）
     *
     * @param {Object} startToken - 范围起始位置的CELL_REF Token
     *                              结构：{ type:"CELL_REF", value:{sheet, row, col} }
     * @param {string|null} [sheetName=null] - 可选的工作表名
     *                                         如果是跨表引用则提供此参数
     *
     * @returns {Object} rangeRef AST节点
     *                  结构：
     *                  {
     *                    type: "rangeRef",       // 节点类型标识
     *                    sheet: string|null,     // 工作表名（null=当前表）
     *                    topRow: number,         // 顶部行索引（0-based）
     *                    topCol: number,         // 左侧列索引（0-based）
     *                    bottomRow: number,      // 底部行索引（0-based）
     *                    bottomCol: number       // 右侧列索引（0-based）
     *                  }
     *
     * @example
     * parseRange(A1的Token)
     * // 假设后续Token是 : B5
     * // 返回:
     * // {
     * //   type: "rangeRef",
     * //   sheet: null,
     * //   topRow: 0,      // A1的行号
     * //   topCol: 0,      // A1的列号
     * //   bottomRow: 4,   // B5的行号
     * //   bottomCol: 1    // B5的列号
     * // }
     */
    parseRange(startToken, sheetName) {
        this.consume(); // 消费 ":" 冒号

        // 消费范围结束位置的单元格引用
        const endToken = this.consume(TOKEN.CELL_REF);

        // 提取起止坐标
        const { row: sr, col: sc } = startToken.value; // 起始位置
        const { row: er, col: ec } = endToken.value; // 结束位置

        // 确定工作表名（优先使用传入的sheetName）
        const sheet = sheetName || startToken.value.sheet || null;

        // 规范化范围：确保top<=bottom, left<=right
        // 这样即使输入B5:A1也能正确处理
        return {
            type: "rangeRef",
            sheet,
            topRow: Math.min(sr, er), // 较小的行号作为顶部
            topCol: Math.min(sc, ec), // 较小的列号作为左侧
            bottomRow: Math.max(sr, er), // 较大的行号作为底部
            bottomCol: Math.max(sc, ec), // 较大的列号作为右侧
        };
    }

    /**
     * 解析函数调用（SUM(...), IF(condition, t, f), VLOOKUP(...)）
     *
     * 函数调用语法：
     * FUNCTION_NAME ( arg1 , arg2 , ... )
     *
     * 特点：
     * - 函数名不区分大小写，统一转换为大写
     * - 支持可变数量的参数（0个到多个）
     * - 参数可以是任意表达式（包括嵌套的函数调用）
     * - 参数之间用逗号分隔
     * - 支持无参函数（空括号）
     *
     * @returns {Object} function AST节点
     *                  结构：
     *                  {
     *                    type: "function",          // 节点类型标识
     *                    name: string,               // 函数名（大写）
     *                    args: Array<Object>         // 参数数组，每个元素是一个AST节点
     *                                          // 可以是literal、cellRef、rangeRef、
     *                                          // binaryOp、function等任意类型
     *                  }
     *
     * @example
     * parseFunction()
     * // 假设当前Token是 SUM，后面跟着 (A1:B10, C1*2)
     * // 返回:
     * // {
     * //   type: "function",
     * //   name: "SUM",
     * //   args: [
     * //     { type: "rangeRef", ... },           // A1:B10
     * //     { type: "binaryOp", operator: "*",  // C1*2
     * //       left: { type: "cellRef", ... },
     * //       right: { type: "literal", value: 2 }
     * //     }
     * //   ]
     * // }
     */
    parseFunction() {
        // 消费函数名并转为大写（标准化）
        const nameToken = this.consume(TOKEN.FUNCTION);
        const fnName = nameToken.value.toUpperCase();

        // 消费左括号 "("
        this.consume(TOKEN.LPAREN);

        // 解析参数列表
        const args = [];

        // 如果不是立即遇到右括号，说明有参数
        if (this.peek().type !== TOKEN.RPAREN) {
            // 解析第一个参数（可以是任意表达式）
            args.push(this.parseExpression());

            // 循环解析剩余参数（用逗号分隔）
            while (this.peek().type === TOKEN.COMMA) {
                this.consume(); // 消费 ","
                args.push(this.parseExpression()); // 解析下一个参数
            }
        }

        // 消费右括号 ")"
        this.consume(TOKEN.RPAREN);

        // 返回函数调用AST节点
        return {
            type: "function",
            name: fnName,
            args,
        };
    }
}

/**
 * 词法分析器（Lexer / Tokenizer）
 *
 * 将公式字符串转换为Token流（Token Array），
 * 是解析过程的第一阶段（Phase 1: Lexical Analysis）。
 *
 * 工作原理：
 * 逐个字符扫描输入字符串，根据当前字符和上下文识别不同类型的Token。
 *
 * 识别规则（按优先级排序）：
 * 1. 空白符：跳过（空格、制表符、换行）
 * 2. 标点符号：(),: 直接映射为对应Token
 * 3. 运算符：单字符(+,-,*,/,^,=,&)或双字符(<=,>=,<>)
 * 4. 字符串常量：以"或'开头，到匹配的引号结束
 * 5. 错误值：以#开头，到非标识符字符结束
 * 6. 数字常量：以数字或小数点开头，连续的数字/小数点
 * 7. 标识符：字母开头，可包含字母、数字、下划线
 *    - 后跟"(" → 函数名
 *    - 后跟"!" → 工作表引用
 *    - 匹配单元格格式 → 单元格引用
 *    - 其他 → 字符串字面量
 *
 * @param {string} formula - 原始公式字符串（不含前导"="）
 *                          示例："SUM(A1:B10)*2+IF(C1>0,\"yes\",\"no\")"
 *
 * @returns {Array<Object>} Token数组
 *                          每个元素结构：{ type: string, value: * }
 *                          type来自TOKEN枚举，value是具体内容
 *
 * @example
 * tokenize("1+2*3")
 * // 返回:
 * // [
 * //   { type: "NUMBER", value: 1 },
 * //   { type: "OPERATOR", value: "+" },
 * //   { type: "NUMBER", value: 2 },
 * //   { type: "OPERATOR", value: "*" },
 * //   { type: "NUMBER", value: 3 }
 * // ]
 *
 * @throws {Error} 遇到非法字符或未知错误值时抛出异常
 */
function tokenize(formula) {
    const tokens = []; // 输出的Token数组
    let i = 0; // 当前扫描位置（指针）

    while (i < formula.length) {
        const ch = formula[i];

        // 【1. 空白符处理】跳过空格、制表符、换行符
        // Excel公式中空白符通常无意义（除字符串内部）
        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
            i++;
            continue;
        }

        // 【2. 标点符号 - 左括号】用于函数调用和表达式分组
        if (ch === "(") {
            tokens.push({ type: TOKEN.LPAREN, value: "(" });
            i++;
            continue;
        }

        // 【2. 标点符号 - 右括号】结束函数调用或分组表达式
        if (ch === ")") {
            tokens.push({ type: TOKEN.RPAREN, value: ")" });
            i++;
            continue;
        }

        // 【2. 标点符号 - 逗号】分隔函数参数
        if (ch === ",") {
            tokens.push({ type: TOKEN.COMMA, value: "," });
            i++;
            continue;
        }

        // 【2. 标点符号 - 冒号】定义范围引用 A1:B10
        if (ch === ":") {
            tokens.push({ type: TOKEN.COLON, value: ":" });
            i++;
            continue;
        }

        // 【3. 运算符 - 感叹号】跨表引用分隔符 SheetName!CellRef
        // 特殊处理：如果前面是CELL_REF，可能需要更新sheet属性
        if (ch === "!" && tokens.length > 0) {
            const prev = tokens[tokens.length - 1];

            // 如果前一个Token是单元格引用且标记为自动工作表
            if (prev.type === TOKEN.CELL_REF && prev.value.sheet === "auto") {
                prev.value = { ...prev.value, sheet: "auto" };
                prev.type = TOKEN.CELL_REF;
            }

            // 将!作为运算符Token添加
            tokens.push({ type: TOKEN.OPERATOR, value: "!" });
            i++;
            continue;
        }

        // 【3. 运算符 - 比较运算符】支持单字符和双字符形式
        // < 或 > 可能后面跟 = 形成 <= >=，或者 <> 表示不等于
        if (ch === "<" || ch === ">") {
            // 检查是否是双字符比较运算符：<=, >=, <>
            if (formula[i + 1] === "=" || (ch === "<" && formula[i + 1] === ">")) {
                tokens.push({
                    type: TOKEN.OPERATOR,
                    value: formula.substring(i, i + 2), // 取两个字符
                });
                i += 2; // 前进两个位置
            } else {
                // 单字符形式：< 或 >
                tokens.push({ type: TOKEN.OPERATOR, value: ch });
                i++;
            }
            continue;
        }

        // 【3. 运算符 - 字符串连接符】& 用于拼接字符串
        if (ch === "&") {
            tokens.push({ type: TOKEN.OPERATOR, value: "&" });
            i++;
            continue;
        }

        // 【3. 运算符 - 算术/赋值运算符】+ - * / ^ =
        if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^" || ch === "=") {
            tokens.push({ type: TOKEN.OPERATOR, value: ch });
            i++;
            continue;
        }

        // 【4. 字符串常量】以双引号或单引号包裹的文本
        // 支持两种引号风格（Excel通常使用双引号）
        if (ch === '"' || ch === "'") {
            const quote = ch; // 记录开始引号类型
            let str = ""; // 存储字符串内容
            i++; // 跳过开始引号

            // 读取直到匹配的结束引号
            while (i < formula.length && formula[i] !== quote) {
                str += formula[i]; // 累加字符
                i++;
            }

            i++; // 跳过结束引号

            // 生成STRING Token（value不含引号）
            tokens.push({ type: TOKEN.STRING, value: str });
            continue;
        }

        // 【5. Excel错误值】以#开头的特殊常量
        // 错误值格式：#NAME? 或 #VALUE! 等
        // 终止条件：遇到逗号、右括号、空白符
        if (ch === "#") {
            let errorStr = "#"; // 以#开始
            i++;

            // 读取后续字符直到遇到终止符
            while (i < formula.length && formula[i] !== "," && formula[i] !== ")" && formula[i] !== " " && formula[i] !== "\t") {
                errorStr += formula[i];
                i++;
            }

            // 标准化错误值（转大写并查找映射）
            const upper = errorStr.toUpperCase();

            if (EXCEL_ERRORS[upper] !== undefined) {
                // 找到大写形式的映射（标准形式）
                tokens.push({
                    type: TOKEN.ERROR,
                    value: EXCEL_ERRORS[upper],
                });
            } else if (EXCEL_ERRORS[errorStr] !== undefined) {
                // 找到原始形式的映射
                tokens.push({
                    type: TOKEN.ERROR,
                    value: EXCEL_ERRORS[errorStr],
                });
            } else {
                // 未知的错误值格式，抛出异常
                throw new Error(`Unknown error constant: "${errorStr}" at position ${i - errorStr.length}`);
            }
            continue;
        }

        // 【6. 数字常量】整数或浮点数
        // 支持格式：123, 456.78, .9（小数点开头）
        // 注意：不支持科学计数法（1.23e4）和十六进制（0xFF）
        if ((ch >= "0" && ch <= "9") || ch === ".") {
            let num = ""; // 存储数字字符串

            // 连续读取数字和小数点
            while (i < formula.length && ((formula[i] >= "0" && formula[i] <= "9") || formula[i] === ".")) {
                num += formula[i];
                i++;
            }

            // 转换为数值类型并生成Token
            tokens.push({
                type: TOKEN.NUMBER,
                value: parseFloat(num),
            });
            continue;
        }

        // 【7. 标识符/关键字】字母或下划线开头
        // 可能是：函数名、工作表名、单元格引用、或普通字符串
        if ((ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z")) {
            // 读取完整单词（标识符）
            const word = readWord(); // 调用辅助函数
            const upper = word.toUpperCase();

            // 【7a. 函数名判断】如果后面紧跟左括号 → 函数调用
            // 例如：SUM( → SUM是函数名
            if (i < formula.length && formula[i] === "(") {
                tokens.push({
                    type: TOKEN.FUNCTION,
                    value: upper, // 函数名统一大写
                });
                continue;
            }

            // 【7b. 工作表引用判断】如果后面紧跟感叹号 → 跨表引用
            // 例如：Sheet2!A1 → Sheet2是工作表名
            if (i < formula.length && formula[i] === "!") {
                tokens.push({
                    type: TOKEN.SHEET_REF,
                    value: word, // 工作表名保留原始大小写
                });
                tokens.push({
                    type: TOKEN.OPERATOR,
                    value: "!", // ! 作为运算符
                });
                i++; // 手动跳过 !
                continue;
            }

            // 【7c. 单元格引用判断】尝试匹配 A1 格式
            // 正则表达式：一个或多个字母 + 一个或多个数字
            const cellRef = parseCellRef(word);

            // 如果到达字符串末尾且匹配成功 → 单元格引用
            if (cellRef && i >= formula.length) {
                tokens.push({
                    type: TOKEN.CELL_REF,
                    value: {
                        row: cellRef.row,
                        col: cellRef.col,
                        sheet: null, // 当前工作表
                    },
                });
                continue;
            }

            // 如果中间位置且匹配成功 → 也可能是单元格引用
            if (cellRef) {
                tokens.push({
                    type: TOKEN.CELL_REF,
                    value: {
                        row: cellRef.row,
                        col: cellRef.col,
                        sheet: null,
                    },
                });
                continue;
            }

            // 【7d. 普通标识符】不匹配以上任何模式 → 作为字符串处理
            // 这种情况在Excel公式中较少见，但为了容错性支持
            tokens.push({
                type: TOKEN.STRING,
                value: word,
            });
            continue;
        }

        // 【8. 非法字符】无法识别的字符，抛出词法错误
        throw new Error(`Unexpected character: "${ch}" at position ${i}`);
    }

    /**
     * 辅助函数：读取单词（标识符）
     *
     * 从当前位置连续读取符合标识符规则的字符：
     * - 大写字母 A-Z
     * - 小写字母 a-z
     * - 数字 0-9（但不能作为首字符，由调用者保证）
     * - 下划线 _
     *
     * @returns {string} 读取到的单词字符串
     *
     * @example
     * 假设公式从位置i开始是 "SUM(A1)"
     * 调用readWord()后返回 "SUM"，i指向"("的位置
     */
    function readWord() {
        let word = "";

        while (
            i < formula.length &&
            ((formula[i] >= "A" && formula[i] <= "Z") ||
                (formula[i] >= "a" && formula[i] <= "z") ||
                (formula[i] >= "0" && formula[i] <= "9") ||
                formula[i] === "_")
        ) {
            word += formula[i];
            i++;
        }

        return word;
    }

    /**
     * 辅助函数：解析单元格引用字符串
     *
     * 将形如 "A1"、"B23"、"AA100" 的字符串转换为行列坐标。
     *
     * 格式要求：
     * - 必须以一个或多个字母开头（列标识）
     * - 后跟一个或多个数字（行标识）
     * - 不允许中间有其他字符
     *
     * @param {string} word - 待解析的字符串（如"A1"、"B23"）
     *
     * @returns {Object|null} 解析结果对象或null
     *                       成功时返回：{ row: number, col: number }
     *                       - row: 行索引（0-based，即显示行号-1）
     *                       - col: 列索引（0-based，A=0, B=1,...）
     *                       失败时返回null（格式不匹配或值无效）
     *
     * @example
     * parseCellRef("A1")    // → { row: 0, col: 0 }
     * parseCellRef("B5")    // → { row: 4, col: 1 }
     * parseCellRef("AA10")  // → { row: 9, col: 26 }
     * parseCellRef("123")   // → null（不是有效的单元格引用）
     * parseCellRef("ABC")   // → null（缺少数字部分）
     */
    function parseCellRef(word) {
        // 使用正则表达式匹配：字母+数字 格式
        const match = word.match(/^([A-Za-z]+)(\d+)$/);

        if (!match) return null; // 格式不匹配

        // 提取列字母和行数字
        const colStr = match[1]; // 列部分："A", "B", "AA", ...
        const rowStr = match[2]; // 行部分："1", "5", "10", ...

        // 将列字母转换为数字索引（使用工具函数）
        const col = colToIndex(colStr);

        // 将行数字转换为0-based索引
        const row = parseInt(rowStr, 10) - 1;

        // 验证有效性：行号和列号都必须>=0
        if (row < 0 || col < 0) return null;

        return { row, col };
    }

    // 返回完整的Token数组
    return tokens;
}
