/**
 * 公式解析器
 *
 * 将公式字符串解析为 AST（抽象语法树），支持：
 * - 单元格引用：A1、B2、AA10
 * - 范围引用：A1:B10
 * - 跨表引用：Sheet2!A1、Sheet2!A1:B10
 * - 字面量：数字（123、1.5）、字符串（"hello"）
 * - 运算符：+、-、*、/、&、^
 * - 比较运算符：=、<>、<、>、<=、>=
 * - 函数调用：SUM(A1:A10)、IF(A1>0, "yes", "no")
 * - 括号：优先级分组
 *
 * A1 坐标转换：
 * - A=0, B=1, ..., Z=25, AA=26, AB=27, ...
 * - A1 → row=0, col=0
 * - B5 → row=4, col=1
 */

const TOKEN = {
    NUMBER: "NUMBER",
    STRING: "STRING",
    CELL_REF: "CELL_REF",
    RANGE: "RANGE",
    FUNCTION: "FUNCTION",
    OPERATOR: "OPERATOR",
    LPAREN: "LPAREN",
    RPAREN: "RPAREN",
    COMMA: "COMMA",
    COLON: "COLON",
    SHEET_REF: "SHEET_REF",
    EOF: "EOF",
};

const OPERATORS = {
    "+": { prec: 1, assoc: "L" },
    "-": { prec: 1, assoc: "L" },
    "*": { prec: 2, assoc: "L" },
    "/": { prec: 2, assoc: "L" },
    "^": { prec: 3, assoc: "R" },
    "&": { prec: 0, assoc: "L" },
    "=": { prec: -1, assoc: "L" },
    "<>": { prec: -1, assoc: "L" },
    "<": { prec: -1, assoc: "L" },
    ">": { prec: -1, assoc: "L" },
    "<=": { prec: -1, assoc: "L" },
    ">=": { prec: -1, assoc: "L" },
};

/**
 * 解析公式字符串，返回 AST 根节点
 * @param {string} formula - 公式字符串，不含前导 "="
 * @returns {object} AST 节点
 */
export function parseFormula(formula) {
    const tokens = tokenize(formula);
    if (tokens.length === 0) return { type: "literal", value: "" };

    const parser = new Parser(tokens);
    const ast = parser.parseExpression();
    return ast;
}

class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    peek() {
        return this.tokens[this.pos] || { type: TOKEN.EOF, value: "" };
    }

    consume(expectedType) {
        const token = this.tokens[this.pos];
        if (expectedType && token.type !== expectedType) {
            throw new Error(`Expected ${expectedType} but got ${token.type} at position ${this.pos}`);
        }
        this.pos++;
        return token;
    }

    parseExpression(minPrec = -2) {
        let left = this.parsePrimary();

        while (this.pos < this.tokens.length) {
            const token = this.peek();
            if (token.type !== TOKEN.OPERATOR) break;

            const op = OPERATORS[token.value];
            if (!op || op.prec < minPrec) break;

            this.consume();

            const nextMinPrec = op.assoc === "L" ? op.prec + 1 : op.prec;
            const right = this.parseExpression(nextMinPrec);

            left = {
                type: "binaryOp",
                operator: token.value,
                left,
                right,
            };
        }

        return left;
    }

    parsePrimary() {
        const token = this.peek();

        if (token.type === TOKEN.NUMBER) {
            this.consume();
            return { type: "literal", value: token.value };
        }

        if (token.type === TOKEN.STRING) {
            this.consume();
            return { type: "literal", value: token.value };
        }

        if (token.type === TOKEN.CELL_REF) {
            this.consume();
            const { sheet, row, col } = token.value;
            if (this.peek().type === TOKEN.COLON) {
                return this.parseRange(token);
            }
            return { type: "cellRef", sheet: sheet || null, row, col };
        }

        if (token.type === TOKEN.SHEET_REF) {
            this.consume();
            const sheetName = token.value;
            this.consume(TOKEN.OPERATOR); // consume "!"
            const refToken = this.consume(TOKEN.CELL_REF);
            const { row, col } = refToken.value;
            if (this.peek().type === TOKEN.COLON) {
                return this.parseRange(refToken, sheetName);
            }
            return { type: "cellRef", sheet: sheetName, row, col };
        }

        if (token.type === TOKEN.FUNCTION) {
            return this.parseFunction();
        }

        if (token.type === TOKEN.LPAREN) {
            this.consume();
            const expr = this.parseExpression();
            this.consume(TOKEN.RPAREN);
            return expr;
        }

        if (token.value === "-" && this.pos === 0) {
            this.consume();
            const operand = this.parsePrimary();
            return { type: "unaryOp", operator: "-", operand };
        }

        throw new Error(`Unexpected token: ${token.type} "${token.value}" at position ${this.pos}`);
    }

    parseRange(startToken, sheetName) {
        this.consume(); // consume ":"
        const endToken = this.consume(TOKEN.CELL_REF);
        const { row: sr, col: sc } = startToken.value;
        const { row: er, col: ec } = endToken.value;
        const sheet = sheetName || startToken.value.sheet || null;
        return {
            type: "rangeRef",
            sheet,
            topRow: Math.min(sr, er),
            topCol: Math.min(sc, ec),
            bottomRow: Math.max(sr, er),
            bottomCol: Math.max(sc, ec),
        };
    }

    parseFunction() {
        const nameToken = this.consume(TOKEN.FUNCTION);
        const fnName = nameToken.value.toUpperCase();
        this.consume(TOKEN.LPAREN);

        const args = [];
        if (this.peek().type !== TOKEN.RPAREN) {
            args.push(this.parseExpression());
            while (this.peek().type === TOKEN.COMMA) {
                this.consume();
                args.push(this.parseExpression());
            }
        }
        this.consume(TOKEN.RPAREN);
        return { type: "function", name: fnName, args };
    }
}

function tokenize(formula) {
    const tokens = [];
    let i = 0;

    while (i < formula.length) {
        const ch = formula[i];

        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
            i++;
            continue;
        }

        if (ch === "(") {
            tokens.push({ type: TOKEN.LPAREN, value: "(" });
            i++;
            continue;
        }
        if (ch === ")") {
            tokens.push({ type: TOKEN.RPAREN, value: ")" });
            i++;
            continue;
        }
        if (ch === ",") {
            tokens.push({ type: TOKEN.COMMA, value: "," });
            i++;
            continue;
        }
        if (ch === ":") {
            tokens.push({ type: TOKEN.COLON, value: ":" });
            i++;
            continue;
        }

        if (ch === "!" && tokens.length > 0) {
            const prev = tokens[tokens.length - 1];
            if (prev.type === TOKEN.CELL_REF && prev.value.sheet === "auto") {
                prev.value = { ...prev.value, sheet: "auto" };
                prev.type = TOKEN.CELL_REF;
            }
            tokens.push({ type: TOKEN.OPERATOR, value: "!" });
            i++;
            continue;
        }

        if (ch === "<" || ch === ">") {
            if (formula[i + 1] === "=" || (ch === "<" && formula[i + 1] === ">")) {
                tokens.push({ type: TOKEN.OPERATOR, value: formula.substring(i, i + 2) });
                i += 2;
            } else {
                tokens.push({ type: TOKEN.OPERATOR, value: ch });
                i++;
            }
            continue;
        }

        if (ch === "&") {
            tokens.push({ type: TOKEN.OPERATOR, value: "&" });
            i++;
            continue;
        }

        if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^" || ch === "=") {
            tokens.push({ type: TOKEN.OPERATOR, value: ch });
            i++;
            continue;
        }

        if (ch === '"' || ch === "'") {
            const quote = ch;
            let str = "";
            i++;
            while (i < formula.length && formula[i] !== quote) {
                str += formula[i];
                i++;
            }
            i++; // skip closing quote
            tokens.push({ type: TOKEN.STRING, value: str });
            continue;
        }

        if ((ch >= "0" && ch <= "9") || ch === ".") {
            let num = "";
            while (i < formula.length && ((formula[i] >= "0" && formula[i] <= "9") || formula[i] === ".")) {
                num += formula[i];
                i++;
            }
            tokens.push({ type: TOKEN.NUMBER, value: parseFloat(num) });
            continue;
        }

        if ((ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z")) {
            const word = readWord();
            const upper = word.toUpperCase();

            if (i < formula.length && formula[i] === "(") {
                tokens.push({ type: TOKEN.FUNCTION, value: upper });
                continue;
            }

            if (i < formula.length && formula[i] === "!") {
                tokens.push({ type: TOKEN.SHEET_REF, value: word });
                tokens.push({ type: TOKEN.OPERATOR, value: "!" });
                i++; // skip "!"
                continue;
            }

            const cellRef = parseCellRef(word);
            if (cellRef && i >= formula.length) {
                tokens.push({ type: TOKEN.CELL_REF, value: { row: cellRef.row, col: cellRef.col, sheet: null } });
                continue;
            }

            if (cellRef) {
                tokens.push({ type: TOKEN.CELL_REF, value: { row: cellRef.row, col: cellRef.col, sheet: null } });
                continue;
            }

            tokens.push({ type: TOKEN.STRING, value: word });
            continue;
        }

        throw new Error(`Unexpected character: "${ch}" at position ${i}`);
    }

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

    function parseCellRef(word) {
        const match = word.match(/^([A-Za-z]+)(\d+)$/);
        if (!match) return null;
        const col = colToIndex(match[1]);
        const row = parseInt(match[2], 10) - 1;
        if (row < 0 || col < 0) return null;
        return { row, col };
    }

    return tokens;
}

/**
 * 列字母转索引：A=0, B=1, ..., Z=25, AA=26, AB=27
 * @param {string} colStr
 * @returns {number}
 */
export function colToIndex(colStr) {
    let result = 0;
    for (let i = 0; i < colStr.length; i++) {
        result = result * 26 + (colStr.toUpperCase().charCodeAt(i) - 65 + 1);
    }
    return result - 1;
}

/**
 * 列索引转字母：0=A, 1=B, ..., 25=Z, 26=AA
 * @param {number} index
 * @returns {string}
 */
export function indexToCol(index) {
    let result = "";
    let n = index + 1;
    while (n > 0) {
        const rem = (n - 1) % 26;
        result = String.fromCharCode(65 + rem) + result;
        n = Math.floor((n - 1) / 26);
    }
    return result;
}
