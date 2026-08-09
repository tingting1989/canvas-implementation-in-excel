import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

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
 */
export class SearchEngine {
    constructor() {}

    /**
     * 执行搜索查询
     *
     * @param {Array<{row: number, col: number, value: string}>} cellData - 单元格数据数组
     * @param {string} query - 查询字符串
     * @param {Object} options - 搜索选项
     * @returns {Promise<Array<{row: number, col: number, data: string, matchIndex: number, matchLength: number}>>}
     */
    async executeQuery(cellData, query, options) {
        if (!query || query.trim() === "") {
            return [];
        }

        const results = [];
        const searchFn = options.useRegex ? this.#createRegexMatcher(query, options) : this.#createTextMatcher(query, options);

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
                errorHandler.handle(ERROR_CODE.SEARCH_CELL_SEARCH_ERROR, `[SearchEngine] 搜索单元格 (${cell.row},${cell.col}) 出错`, {
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
     * 创建文本匹配器
     *
     * @private
     */
    #createTextMatcher(query, options) {
        const searchStr = options.caseSensitive ? query : query.toLowerCase();

        return (cellValue) => {
            const value = options.caseSensitive ? cellValue : cellValue.toLowerCase();
            const matches = [];
            let startIndex = 0;
            let index;

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
     * 创建正则匹配器
     *
     * @private
     */
    #createRegexMatcher(query, options) {
        try {
            const flags = options.caseSensitive ? "g" : "gi";
            const regex = new RegExp(query, flags);

            return (cellValue) => {
                const matches = [];
                let match;

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
            errorHandler.handle(ERROR_CODE.SEARCH_INVALID_REGEX, "[SearchEngine] 无效正则表达式", { originalError: error, query: query });
            return () => null;
        }
    }

    /**
     * 检查是否为完整单词
     *
     * @private
     * @param {string} text - 完整文本
     * @param {number} position - 匹配起始位置
     * @param {number} length - 匹配长度
     * @returns {boolean}
     */
    #isWholeWord(text, position, length) {
        const beforeChar = position > 0 ? text[position - 1] : " ";
        const afterChar = position + length < text.length ? text[position + length] : " ";

        const wordBoundaryPattern = /\W/;
        return wordBoundaryPattern.test(beforeChar) && wordBoundaryPattern.test(afterChar);
    }
}
