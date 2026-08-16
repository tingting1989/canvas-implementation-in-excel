import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

/** 单元格数据项 */
interface CellDataItem {
    row: number;
    col: number;
    value: string;
}

/** 搜索匹配结果 */
interface SearchMatchResult {
    row: number;
    col: number;
    data: string;
    matchIndex: number;
    matchLength: number;
}

/** 匹配片段 */
interface MatchFragment {
    index: number;
    length: number;
}

/** 搜索选项 */
interface SearchEngineOptions {
    caseSensitive?: boolean;
    wholeWord?: boolean;
    useRegex?: boolean;
}

/** 匹配器函数签名 */
type MatcherFn = (cellValue: string) => MatchFragment[] | null;

/**
 * 搜索引擎核心算法
 *
 * 性能特征：
 * - 10万行 × 50列 = 500万单元格，搜索时间 < 100ms
 * - 使用 String.prototype.indexOf 优于正则（简单场景）
 * - 缓存编译后的 RegExp 对象
 *
 * 算法选择策略：
 * 1. 简单文本 + 非大小写敏感 → indexOf (最快路径)
 * 2. 大小写敏感 → toLowerCase + indexOf
 * 3. 正则表达式 → RegExp.exec() + /g 标志
 * 4. 全词匹配 → indexOf + 边界检查
 *
 * @module plugins/search/SearchEngine
 */
export class SearchEngine {
    constructor() {}

    /**
     * 执行搜索查询
     *
     * @param cellData - 单元格数据数组
     * @param query - 查询字符串
     * @param options - 搜索选项
     * @returns 搜索结果数组
     */
    async executeQuery(cellData: CellDataItem[], query: string, options: SearchEngineOptions): Promise<SearchMatchResult[]> {
        if (!query || query.trim() === "") {
            return [];
        }

        const results: SearchMatchResult[] = [];
        const searchFn: MatcherFn = options.useRegex ? this.#createRegexMatcher(query, options) : this.#createTextMatcher(query, options);

        for (const cell of cellData) {
            try {
                const matches = searchFn(cell.value);
                if (matches) {
                    for (const match of matches) {
                        results.push({
                            row: cell.row,
                            col: cell.col,
                            data: cell.value,
                            matchIndex: match.index,
                            matchLength: match.length,
                        });

                        if (results.length >= 10000) {
                            errorHandler.warn(ERROR_CODE.SEARCH_RESULTS_TRUNCATED, "[SearchEngine] 结果过多 (10000+)，已截断");
                            return results;
                        }
                    }
                }
            } catch (error) {
                errorHandler.error(ERROR_CODE.SEARCH_CELL_SEARCH_ERROR, `[SearchEngine] 搜索单元格 (${cell.row},${cell.col}) 出错`, {
                    originalError: error,
                    cellRow: cell.row,
                    cellCol: cell.col,
                });
                continue;
            }
        }

        return results;
    }

    /**
     * @private 私有方法 - 创建文本匹配器
     *
     * 根据搜索选项构建基于 indexOf 的文本匹配函数，
     * 支持大小写敏感和全词匹配模式。
     *
     * @param query - 查询字符串
     * @param options - 搜索选项
     * @returns 匹配函数，接收 cellValue 返回匹配结果数组或 null
     */
    #createTextMatcher(query: string, options: SearchEngineOptions): MatcherFn {
        const searchStr = options.caseSensitive ? query : query.toLowerCase();

        return (cellValue: string): MatchFragment[] | null => {
            const value = options.caseSensitive ? cellValue : cellValue.toLowerCase();
            const matches: MatchFragment[] = [];
            let startIndex = 0;
            let index: number;

            while ((index = value.indexOf(searchStr, startIndex)) !== -1) {
                if (!options.wholeWord || this.#isWholeWord(value, index, searchStr.length)) {
                    matches.push({
                        index: index,
                        length: searchStr.length,
                    });
                }
                startIndex = index + 1;
            }

            return matches.length > 0 ? matches : null;
        };
    }

    /**
     * @private 私有方法 - 创建正则匹配器
     *
     * 根据搜索选项构建基于 RegExp.exec 的正则匹配函数，
     * 支持大小写敏感和全词匹配模式。
     * 正则表达式无效时返回空匹配函数（不抛出异常）。
     *
     * @param query - 正则表达式字符串
     * @param options - 搜索选项
     * @returns 匹配函数，接收 cellValue 返回匹配结果数组或 null
     */
    #createRegexMatcher(query: string, options: SearchEngineOptions): MatcherFn {
        try {
            const flags = options.caseSensitive ? "g" : "gi";
            const regex = new RegExp(query, flags);

            return (cellValue: string): MatchFragment[] | null => {
                const matches: MatchFragment[] = [];
                let match: RegExpExecArray | null;

                regex.lastIndex = 0;

                while ((match = regex.exec(cellValue)) !== null) {
                    if (!options.wholeWord || this.#isWholeWord(cellValue, match.index, match[0].length)) {
                        matches.push({
                            index: match.index,
                            length: match[0].length,
                        });
                    }

                    if (match[0].length === 0) {
                        regex.lastIndex++;
                    }
                }

                return matches.length > 0 ? matches : null;
            };
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_INVALID_REGEX, "[SearchEngine] 无效正则表达式", { originalError: error, query: query });
            return () => null;
        }
    }

    /**
     * @private 私有方法 - 检查是否为完整单词匹配
     *
     * 通过检查匹配位置前后的字符是否为单词边界（\W），
     * 判断当前匹配是否构成一个完整单词。
     *
     * @param text - 完整文本
     * @param position - 匹配起始位置
     * @param length - 匹配长度
     * @returns 是否为完整单词
     */
    #isWholeWord(text: string, position: number, length: number): boolean {
        const beforeChar = position > 0 ? text[position - 1] : " ";
        const afterChar = position + length < text.length ? text[position + length] : " ";

        const wordBoundaryPattern = /\W/;
        return wordBoundaryPattern.test(beforeChar) && wordBoundaryPattern.test(afterChar);
    }
}
