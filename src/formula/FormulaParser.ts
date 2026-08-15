import { colToIndex } from "../utils/cellRef.js";

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
    ERROR: "ERROR",
    EOF: "EOF",
} as const;

type TokenType = (typeof TOKEN)[keyof typeof TOKEN];

interface Token {
    type: TokenType;
    value: string | number | { row: number; col: number; sheet: string | null };
}

const EXCEL_ERRORS: Record<string, string> = {
    "#N/A": "#N/A",
    "#NA": "#N/A",
    "#VALUE!": "#VALUE!",
    "#REF!": "#REF!",
    "#DIV/0!": "#DIV/0!",
    "#NUM!": "#NUM!",
    "#NAME?": "#NAME?",
    "#NULL!": "#NULL!",
    "#NULL?": "#NULL!",
    "#GETTING_DATA": "#GETTING_DATA",
};

interface OperatorInfo {
    prec: number;
    assoc: "L" | "R";
}

const OPERATORS: Record<string, OperatorInfo> = {
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

export interface ASTLiteral {
    type: "literal";
    value: unknown;
}

export interface ASTCellRef {
    type: "cellRef";
    sheet: string | null;
    row: number;
    col: number;
}

export interface ASTRangeRef {
    type: "rangeRef";
    sheet: string | null;
    topRow: number;
    topCol: number;
    bottomRow: number;
    bottomCol: number;
}

export interface ASTFunction {
    type: "function";
    name: string;
    args: ASTNode[];
}

export interface ASTUnaryOp {
    type: "unaryOp";
    operator: string;
    operand: ASTNode;
}

export interface ASTBinaryOp {
    type: "binaryOp";
    operator: string;
    left: ASTNode;
    right: ASTNode;
}

export type ASTNode = ASTLiteral | ASTCellRef | ASTRangeRef | ASTFunction | ASTUnaryOp | ASTBinaryOp;

export function parseFormula(formula: string): ASTNode {
    const tokens = tokenize(formula);

    if (tokens.length === 0) {
        return { type: "literal", value: "" };
    }

    const parser = new Parser(tokens);
    const ast = parser.parseExpression();

    return ast;
}

class Parser {
    private tokens: Token[];
    private pos: number;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
        this.pos = 0;
    }

    peek(): Token {
        return this.tokens[this.pos] || { type: TOKEN.EOF, value: "" };
    }

    consume(expectedType?: TokenType): Token {
        const token = this.tokens[this.pos];

        if (expectedType && token.type !== expectedType) {
            throw new Error(`Expected ${expectedType} but got ${token.type} at position ${this.pos}`);
        }

        this.pos++;
        return token;
    }

    parseExpression(minPrec: number = -2): ASTNode {
        const token = this.peek();

        if (token.type === TOKEN.OPERATOR && token.value === "-") {
            this.consume();
            const operand = this.parseExpression(-1);

            return {
                type: "unaryOp",
                operator: "-",
                operand,
            };
        }

        let left = this.parsePrimary();

        while (this.pos < this.tokens.length) {
            const token = this.peek();

            if (token.type !== TOKEN.OPERATOR) break;

            const op = OPERATORS[token.value as string];

            if (!op || op.prec < minPrec) break;

            this.consume();

            const nextMinPrec = op.assoc === "L" ? op.prec + 1 : op.prec;

            const right = this.parseExpression(nextMinPrec);

            left = {
                type: "binaryOp",
                operator: token.value as string,
                left,
                right,
            };
        }

        return left;
    }

    parsePrimary(): ASTNode {
        const token = this.peek();

        if (token.type === TOKEN.NUMBER) {
            this.consume();

            return {
                type: "literal",
                value: token.value,
            };
        }

        if (token.type === TOKEN.STRING) {
            this.consume();

            return {
                type: "literal",
                value: token.value,
            };
        }

        if (token.type === TOKEN.ERROR) {
            this.consume();

            return {
                type: "literal",
                value: token.value,
            };
        }

        if (token.type === TOKEN.CELL_REF) {
            this.consume();

            const cellValue = token.value as { sheet: string | null; row: number; col: number };
            const { sheet, row, col } = cellValue;

            if (this.peek().type === TOKEN.COLON) {
                return this.parseRange(token as Token & { value: { sheet: string | null; row: number; col: number } });
            }

            return {
                type: "cellRef",
                sheet: sheet || null,
                row,
                col,
            };
        }

        if (token.type === TOKEN.SHEET_REF) {
            this.consume();
            const sheetName = token.value as string;
            this.consume(TOKEN.OPERATOR);

            const refToken = this.consume(TOKEN.CELL_REF);
            const refValue = refToken.value as { row: number; col: number };
            const { row, col } = refValue;

            if (this.peek().type === TOKEN.COLON) {
                return this.parseRange(refToken as Token & { value: { sheet: string | null; row: number; col: number } }, sheetName);
            }

            return {
                type: "cellRef",
                sheet: sheetName,
                row,
                col,
            };
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

        throw new Error(`Unexpected token: ${token.type} "${token.value}" at position ${this.pos}`);
    }

    parseRange(startToken: Token & { value: { sheet: string | null; row: number; col: number } }, sheetName?: string): ASTRangeRef {
        this.consume();

        const endToken = this.consume(TOKEN.CELL_REF);
        const endValue = endToken.value as { row: number; col: number };

        const { row: sr, col: sc } = startToken.value;
        const { row: er, col: ec } = endValue;

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

    parseFunction(): ASTFunction {
        const nameToken = this.consume(TOKEN.FUNCTION);
        const fnName = (nameToken.value as string).toUpperCase();

        this.consume(TOKEN.LPAREN);

        const args: ASTNode[] = [];

        if (this.peek().type !== TOKEN.RPAREN) {
            args.push(this.parseExpression());

            while (this.peek().type === TOKEN.COMMA) {
                this.consume();
                args.push(this.parseExpression());
            }
        }

        this.consume(TOKEN.RPAREN);

        return {
            type: "function",
            name: fnName,
            args,
        };
    }
}

function tokenize(formula: string): Token[] {
    const tokens: Token[] = [];
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

            if (prev.type === TOKEN.CELL_REF && (prev.value as { sheet: string | null }).sheet === "auto") {
                prev.value = { ...(prev.value as { sheet: string | null; row: number; col: number }), sheet: "auto" };
                prev.type = TOKEN.CELL_REF;
            }

            tokens.push({ type: TOKEN.OPERATOR, value: "!" });
            i++;
            continue;
        }

        if (ch === "<" || ch === ">") {
            if (formula[i + 1] === "=" || (ch === "<" && formula[i + 1] === ">")) {
                tokens.push({
                    type: TOKEN.OPERATOR,
                    value: formula.substring(i, i + 2),
                });
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

            i++;

            tokens.push({ type: TOKEN.STRING, value: str });
            continue;
        }

        if (ch === "#") {
            let errorStr = "#";
            i++;

            while (i < formula.length && formula[i] !== "," && formula[i] !== ")" && formula[i] !== " " && formula[i] !== "\t") {
                errorStr += formula[i];
                i++;
            }

            const upper = errorStr.toUpperCase();

            if (EXCEL_ERRORS[upper] !== undefined) {
                tokens.push({
                    type: TOKEN.ERROR,
                    value: EXCEL_ERRORS[upper],
                });
            } else if (EXCEL_ERRORS[errorStr] !== undefined) {
                tokens.push({
                    type: TOKEN.ERROR,
                    value: EXCEL_ERRORS[errorStr],
                });
            } else {
                throw new Error(`Unknown error constant: "${errorStr}" at position ${i - errorStr.length}`);
            }
            continue;
        }

        if ((ch >= "0" && ch <= "9") || ch === ".") {
            let num = "";

            while (i < formula.length && ((formula[i] >= "0" && formula[i] <= "9") || formula[i] === ".")) {
                num += formula[i];
                i++;
            }

            tokens.push({
                type: TOKEN.NUMBER,
                value: parseFloat(num),
            });
            continue;
        }

        if ((ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z")) {
            const word = readWord();
            const upper = word.toUpperCase();

            if (i < formula.length && formula[i] === "(") {
                tokens.push({
                    type: TOKEN.FUNCTION,
                    value: upper,
                });
                continue;
            }

            if (i < formula.length && formula[i] === "!") {
                tokens.push({
                    type: TOKEN.SHEET_REF,
                    value: word,
                });
                tokens.push({
                    type: TOKEN.OPERATOR,
                    value: "!",
                });
                i++;
                continue;
            }

            const cellRef = parseCellRef(word);

            if (cellRef && i >= formula.length) {
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

            tokens.push({
                type: TOKEN.STRING,
                value: word,
            });
            continue;
        }

        throw new Error(`Unexpected character: "${ch}" at position ${i}`);
    }

    function readWord(): string {
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

    function parseCellRef(word: string): { row: number; col: number } | null {
        const match = word.match(/^([A-Za-z]+)(\d+)$/);

        if (!match) return null;

        const colStr = match[1];
        const rowStr = match[2];

        const col = colToIndex(colStr);
        const row = parseInt(rowStr, 10) - 1;

        if (row < 0 || col < 0) return null;

        return { row, col };
    }

    return tokens;
}
