/**
 * 单元格引用工具函数
 *
 * 提供列索引与列字母之间的双向转换，遵循 Excel 列命名规则：
 * 0→A, 1→B, ..., 25→Z, 26→AA, 27→AB, ..., 701→ZZ, 702→AAA
 *
 * @module utils/cellRef
 */

/**
 * 列字母转列索引：A→0, B→1, ..., Z→25, AA→26
 * @param {string} colStr - 列字母（不区分大小写）
 * @returns {number} 列索引（0-based）
 */
export function colToIndex(colStr) {
    let result = 0;
    for (let i = 0; i < colStr.length; i++) {
        result = result * 26 + (colStr.toUpperCase().charCodeAt(i) - 65 + 1);
    }
    return result - 1;
}

/**
 * 列索引转列字母：0→A, 1→B, ..., 25→Z, 26→AA
 * @param {number} index - 列索引（0-based）
 * @returns {string} 列字母
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
