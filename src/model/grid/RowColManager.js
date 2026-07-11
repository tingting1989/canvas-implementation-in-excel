import { CONFIG } from "@/constants/config";

/**
 * 行列管理器类
 *
 * 负责管理表格中所有行的高度和列的宽度信息，
 * 提供行列尺寸设置、查询、插入、删除、移动等操作。
 * 支持行列隐藏/显示功能，以及基于像素坐标的行列位置查找。
 *
 * 主要功能：
 * - 行高和列宽的动态管理
 * - 行列的增删改操作
 * - 隐藏行/列的支持
 * - 像素坐标与行列号的相互转换
 * - 前缀和优化以加速范围查询
 */
export class RowColManager {
    /** @private 存储每行的实际高度值（索引 = 行号） */
    #rowHeights = [];

    /** @private 存储每列的实际宽度值（索引 = 列号） */
    #colWidths = [];

    /** @private 行高度的前缀和数组，用于快速计算任意行的Y坐标 */
    #rowPrefixSum = null;

    /** @private 列宽度的前缀和数组，用于快速计算任意列的X坐标 */
    #colPrefixSum = null;

    /** @private 标记行前缀和是否需要重新计算（脏标记） */
    #rowPrefixDirty = true;

    /** @private 标记列前缀和是否需要重新计算（脏标记） */
    #colPrefixDirty = true;

    /** @private 所有已分配行高的累计总高度（像素） */
    #allocatedHeight = 0;

    /** @private 所有已分配列宽的累计总宽度（像素） */
    #allocatedWidth = 0;

    /** @private 隐藏列集合（存储实际列号） */
    #hiddenCols = new Set();

    /** @private 隐藏列的原始宽度缓存（隐藏前保存，显示时恢复） */
    #originalColWidths = new Map();

    /** @private 隐藏行集合（存储实际行号） */
    #hiddenRows = new Set();

    /** @private 隐藏行的原始高度缓存（隐藏前保存，显示时恢复） */
    #originalRowHeights = new Map();

    /** @private 实际使用的列数（由 ensureSize 或 resetSize 设置） */
    #usedCols = 0;

    /** @private 实际使用的行数（由 ensureSize 或 resetSize 设置） */
    #usedRows = 0;

    /** @private 是否通过 resetSize() 显式设置了行列数（优先级最高） */
    #explicitlySized = false;

    /**
     * 获取表格的总高度（像素）
     * 包括已分配高度的行 + 未分配但使用的默认高度行
     * @returns {number} 总高度（像素）
     */
    get totalHeight() {
        this.#ensureRowPrefix();

        // 使用实际行数计算总高度
        const actualRowCount = Math.max(this.#usedRows, this.#rowHeights.length);
        return this.#allocatedHeight + Math.max(0, actualRowCount - this.#rowHeights.length) * CONFIG.DEFAULT_ROW_HEIGHT;
    }

    /**
     * 获取表格的总宽度（像素）
     * 包括已分配宽度的列 + 未分配但使用的默认宽度列
     * @returns {number} 总宽度（像素）
     */
    get totalWidth() {
        this.#ensureColPrefix();

        // 使用实际列数计算总宽度
        const actualColCount = Math.max(this.#usedCols, this.#colWidths.length);
        return this.#allocatedWidth + Math.max(0, actualColCount - this.#colWidths.length) * CONFIG.DEFAULT_COL_WIDTH;
    }

    /**
     * 获取当前管理的总行数
     * 取 usedRows 和实际数组长度中的较大值，至少为1
     * @returns {number} 总行数
     */
    get rowCount() {
        return Math.max(this.#usedRows, this.#rowHeights.length, 1);
    }

    /**
     * 获取当前管理的总列数
     * 取 usedCols 和实际数组长度中的较大值，至少为1
     * @returns {number} 总列数
     */
    get colCount() {
        return Math.max(this.#usedCols, this.#colWidths.length, 1);
    }

    /**
     * 获取实际列数（与 colCount 相同）
     * @returns {number} 实际列数
     */
    get realColCount() {
        return this.colCount;
    }

    /**
     * 获取可视列总数（排除隐藏列）
     * 用于渲染时确定需要绘制的列数量
     * @returns {number} 可视列总数
     */
    get visibleColCount() {
        const actualColCount = Math.max(this.#usedCols, this.#colWidths.length, 1);
        return actualColCount - this.#hiddenCols.size;
    }

    /**
     * 获取可视行总数（排除隐藏行）
     * 用于渲染时确定需要绘制的行数量
     * @returns {number} 可视行总数
     */
    get visibleRowCount() {
        const actualRowCount = Math.max(this.#usedRows, this.#rowHeights.length, 1);
        return actualRowCount - this.#hiddenRows.size;
    }

    /**
     * 获取已分配行高的行数（即 rowHeights 数组的长度）
     * @returns {number} 已分配行数的数量
     */
    get allocatedRowCount() {
        return this.#rowHeights.length;
    }

    /**
     * 获取已分配列宽的列数（即 colWidths 数组的长度）
     * @returns {number} 已分配列数的数量
     */
    get allocatedColCount() {
        return this.#colWidths.length;
    }

    /**
     * 强制设置行列数（用于初始化配置，覆盖之前的值）
     * 此方法具有最高优先级，调用后 ensureSize 将不再生效
     * 会自动调整数组大小，新增的行列使用默认尺寸
     *
     * @param {number} rows - 要设置的行数（不超过 CONFIG.MAX_ROWS）
     * @param {number} cols - 要设置的列数（不超过 CONFIG.MAX_COLS）
     */
    resetSize(rows, cols) {
        rows = Math.min(rows, CONFIG.MAX_ROWS);
        cols = Math.min(cols, CONFIG.MAX_COLS);
        this.#usedRows = rows;
        this.#usedCols = cols;
        this.#explicitlySized = true; // 标记为显式配置

        // 强制调整数组长度（可以扩大或缩小）
        if (this.#rowHeights.length !== rows) {
            const oldLen = this.#rowHeights.length;
            this.#rowHeights.length = rows;
            if (rows > oldLen) {
                // 新增的行使用默认高度填充
                this.#rowHeights.fill(CONFIG.DEFAULT_ROW_HEIGHT, oldLen, rows);
            }
            this.#rowPrefixDirty = true; // 标记前缀和需要重建
        }

        if (this.#colWidths.length !== cols) {
            const oldLen = this.#colWidths.length;
            this.#colWidths.length = cols;
            if (cols > oldLen) {
                // 新增的列使用默认宽度填充
                this.#colWidths.fill(CONFIG.DEFAULT_COL_WIDTH, oldLen, cols);
            }
            this.#colPrefixDirty = true; // 标记前缀和需要重建
        }
    }

    /**
     * 是否通过 resetSize() 显式设置了行列数
     * @returns {boolean} 如果是显式设置则返回 true
     */
    get isExplicitlySized() {
        return this.#explicitlySized;
    }

    /**
     * 确保数组大小足够容纳指定的行列数
     * 仅在未调用 resetSize 时生效（如果已显式设置则直接返回）
     * 只会扩大数组，不会缩小
     *
     * @param {number} rows - 需要的最少行数
     * @param {number} cols - 需要的最少列数
     */
    ensureSize(rows, cols) {
        rows = Math.min(rows, CONFIG.MAX_ROWS);
        cols = Math.min(cols, CONFIG.MAX_COLS);

        // 如果已经通过 resetSize 显式设置，则忽略此调用
        if (this.#explicitlySized) return;

        // 更新实际使用的行列数为较大值
        this.#usedRows = Math.max(this.#usedRows, rows);
        this.#usedCols = Math.max(this.#usedCols, cols);

        // 扩展行高数组（如果需要）
        if (this.#rowHeights.length < rows) {
            const oldLen = this.#rowHeights.length;
            this.#rowHeights.length = rows;
            this.#rowHeights.fill(CONFIG.DEFAULT_ROW_HEIGHT, oldLen, rows);
            this.#rowPrefixDirty = true;
        }
        // 扩展列宽数组（如果需要）
        if (this.#colWidths.length < cols) {
            const oldLen = this.#colWidths.length;
            this.#colWidths.length = cols;
            this.#colWidths.fill(CONFIG.DEFAULT_COL_WIDTH, oldLen, cols);
            this.#colPrefixDirty = true;
        }
    }

    /**
     * 设置指定行的高度
     * 会自动扩展数组以容纳该行
     *
     * @param {number} row - 行索引（从0开始）
     * @param {number} height - 行高（像素）
     */
    setRowHeight(row, height) {
        this.ensureSize(row + 1, 0); // 确保数组足够大
        if (this.#rowHeights[row] !== height) {
            this.#rowHeights[row] = height;
            this.#rowPrefixDirty = true; // 高度变化，标记前缀和需重建
        }
    }

    /**
     * 设置指定列的宽度
     * 会自动扩展数组以容纳该列
     *
     * @param {number} col - 列索引（从0开始）
     * @param {number} width - 列宽（像素）
     */
    setColWidth(col, width) {
        this.ensureSize(0, col + 1); // 确保数组足够大
        if (this.#colWidths[col] !== width) {
            this.#colWidths[col] = width;
            this.#colPrefixDirty = true; // 宽度变化，标记前缀和需重建
        }
    }

    /**
     * 获取指定行的高度
     * 如果行在数组范围内返回实际高度，否则返回默认高度或0（如果隐藏）
     *
     * @param {number} row - 行索引
     * @returns {number} 行高（像素）
     */
    getRowHeight(row) {
        if (row >= 0 && row < this.#rowHeights.length) return this.#rowHeights[row];
        if (this.#hiddenRows.has(row)) return 0; // 隐藏的行返回0
        return CONFIG.DEFAULT_ROW_HEIGHT; // 超出范围的行返回默认高度
    }

    /**
     * 获取指定列的宽度
     * 如果列在数组范围内返回实际宽度，否则返回默认宽度或0（如果隐藏）
     *
     * @param {number} col - 列索引
     * @returns {number} 列宽（像素）
     */
    getColWidth(col) {
        if (col >= 0 && col < this.#colWidths.length) return this.#colWidths[col];
        if (this.#hiddenCols.has(col)) return 0; // 隐藏的列返回0
        return CONFIG.DEFAULT_COL_WIDTH; // 超出范围的列返回默认宽度
    }

    /**
     * 获取指定行顶部边缘的 Y 坐标（像素）
     * 即该行之前所有行的累计高度
     *
     * @param {number} row - 行索引
     * @returns {number} 该行顶部的 Y 坐标（像素）
     */
    getRowY(row) {
        return this.#rawGetRowY(row);
    }

    /**
     * 内部方法：获取指定行顶部边缘的原始 Y 坐标
     * 不经过任何偏移转换，直接基于全局坐标系计算
     *
     * @private
     * @param {number} row - 行索引
     * @returns {number} Y 坐标（像素）
     */
    #rawGetRowY(row) {
        if (row <= 0) return 0; // 第0行或负数行的Y坐标为0
        this.#ensureRowPrefix(); // 确保前缀和已计算
        if (row <= this.#rowHeights.length) {
            // 在已分配范围内，从前缀和数组获取
            return this.#rowPrefixSum[row - 1];
        }
        // 超出已分配范围的部分按默认高度计算
        return this.#allocatedHeight + (row - this.#rowHeights.length) * CONFIG.DEFAULT_ROW_HEIGHT;
    }

    /**
     * 获取指定列左侧边缘的 X 坐标（像素）
     * 即该列之前所有列的累计宽度
     *
     * @param {number} col - 列索引
     * @returns {number} 该列左侧的 X 坐标（像素）
     */
    getColX(col) {
        if (col <= 0) return 0; // 第0列或负数列的X坐标为0
        this.#ensureColPrefix(); // 确保前缀和已计算
        if (col <= this.#colWidths.length) {
            // 在已分配范围内，从前缀和数组获取
            return this.#colPrefixSum[col - 1];
        }
        // 超出已分配范围的部分按默认宽度计算
        return this.#allocatedWidth + (col - this.#colWidths.length) * CONFIG.DEFAULT_COL_WIDTH;
    }

    /**
     * 根据 Y 像素坐标查找对应的行号
     * 会跳过隐藏的行，返回下一个可见行
     *
     * @param {number} y - Y 像素坐标
     * @returns {number} 对应的行号
     */
    rowAt(y) {
        if (y < 0) return 0;
        return this.rawRowAt(y);
    }

    /**
     * 根据全局像素 Y 坐标查找实际行号（不经过页面偏移转换）
     * 使用二分搜索在前缀和数组中快速定位
     * 对于超出已分配范围的位置，按默认高度计算虚拟行号
     * 自动跳过隐藏行，返回下一个可见行
     *
     * @param {number} y - 全局像素 Y 坐标
     * @returns {number} 实际行号（不超过 CONFIG.MAX_ROWS）
     */
    rawRowAt(y) {
        if (y < 0) return 0;
        this.#ensureRowPrefix();
        let row;
        if (y < this.#allocatedHeight) {
            // 在已分配高度范围内，使用二分搜索定位行
            row = this.#binarySearch(this.#rowPrefixSum, y);
        } else {
            // 在虚拟区域（超出已分配范围），按默认高度计算
            const virtualY = y - this.#allocatedHeight;
            row = this.#rowHeights.length + Math.floor(virtualY / CONFIG.DEFAULT_ROW_HEIGHT);
        }
        // 跳过隐藏的行，找到下一个可见行
        while (row < CONFIG.MAX_ROWS && this.#hiddenRows.has(row)) {
            row++;
        }

        // rawRowAt 返回全局坐标对应的实际行号，不应受限于当前数据范围
        // 分页模式下可能需要访问超出 #rowHeights.length 的虚拟行号
        return Math.min(row, CONFIG.MAX_ROWS);
    }

    /**
     * 根据 X 像素坐标查找对应的列号
     * 会跳过隐藏的列，返回下一个可见列
     *
     * @param {number} x - X 像素坐标
     * @returns {number} 对应的列号
     */
    colAt(x) {
        if (x < 0) return 0;
        this.#ensureColPrefix();
        let col;
        if (x < this.#allocatedWidth) {
            // 在已分配宽度范围内，使用二分搜索定位列
            col = this.#binarySearch(this.#colPrefixSum, x);
        } else {
            // 在虚拟区域（超出已分配范围），按默认宽度计算
            const virtualX = x - this.#allocatedWidth;
            col = this.#colWidths.length + Math.floor(virtualX / CONFIG.DEFAULT_COL_WIDTH);
        }
        // 跳过隐藏的列，找到下一个可见列
        while (col < CONFIG.MAX_COLS && this.#hiddenCols.has(col)) {
            col++;
        }

        // colAt 返回全局坐标对应的实际列号，不应受限于当前数据范围
        return Math.min(col, CONFIG.MAX_COLS);
    }

    /**
     * 二分搜索：在前缀和数组中查找指定位置对应的索引
     * 返回使得 prefixSum[index] <= pos 的最大 index，然后 +1 得到目标索引
     *
     * @private
     * @param {Float64Array} prefixSum - 前缀和数组
     * @param {number} pos - 要查找的位置（像素值）
     * @returns {number} 对应的索引（行列号）
     */
    #binarySearch(prefixSum, pos) {
        if (prefixSum.length === 0 || pos < prefixSum[0]) return 0;
        let lo = 0,
            hi = prefixSum.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1; // 向上取整的中点
            if (prefixSum[mid] <= pos) lo = mid;
            else hi = mid - 1;
        }
        return lo + 1; // 返回的是行列号（比前缀和索引大1）
    }

    /**
     * 在指定位置插入一行
     * 新行使用默认高度，后续行号自动递增
     * 同时更新隐藏行集合和原始高度缓存的索引
     *
     * @param {number} atRow - 要插入的行位置（新行将占据此索引）
     */
    insertRow(atRow) {
        this.ensureSize(atRow + 1, 0); // 确保数组足够大
        this.#rowHeights.splice(atRow, 0, CONFIG.DEFAULT_ROW_HEIGHT); // 插入默认高度的行

        // 更新隐藏行集合：>= atRow 的行号都 +1
        this.#hiddenRows = new Set([...this.#hiddenRows].map((r) => (r >= atRow ? r + 1 : r)));
        // 更新原始高度缓存：>= atRow 的行号都 +1
        this.#originalRowHeights = new Map([...this.#originalRowHeights].map(([r, h]) => [r >= atRow ? r + 1 : r, h]));
        this.#rowPrefixDirty = true; // 标记前缀和需重建
    }

    /**
     * 在指定位置插入一列
     * 新列使用默认宽度，后续列号自动递增
     * 同时更新隐藏列集合和原始宽度缓存的索引
     *
     * @param {number} atCol - 要插入的列位置（新列将占据此索引）
     */
    insertCol(atCol) {
        this.ensureSize(0, atCol + 1); // 确保数组足够大
        this.#colWidths.splice(atCol, 0, CONFIG.DEFAULT_COL_WIDTH); // 插入默认宽度的列

        // 更新隐藏列集合：>= atCol 的列号都 +1
        this.#hiddenCols = new Set([...this.#hiddenCols].map((c) => (c >= atCol ? c + 1 : c)));
        // 更新原始宽度缓存：>= atCol 的列号都 +1
        this.#originalColWidths = new Map([...this.#originalColWidths].map(([c, w]) => [c >= atCol ? c + 1 : c, w]));
        this.#colPrefixDirty = true; // 标记前缀和需重建
    }

    /**
     * 删除指定行
     * 后续行号自动递减，同时清理相关的隐藏状态和缓存
     *
     * @param {number} row - 要删除的行索引
     */
    deleteRow(row) {
        if (row < 0 || row >= this.#rowHeights.length) return; // 边界检查
        this.#rowHeights.splice(row, 1); // 删除行

        // 清理被删除行的隐藏信息和缓存
        this.#hiddenRows.delete(row);
        this.#originalRowHeights.delete(row);

        // 更新剩余隐藏行的索引：> row 的行号都 -1
        this.#hiddenRows = new Set([...this.#hiddenRows].map((r) => (r > row ? r - 1 : r)));
        // 更新剩余原始高度缓存的索引：> row 的行号都 -1
        this.#originalRowHeights = new Map([...this.#originalRowHeights].map(([r, h]) => [r > row ? r - 1 : r, h]));
        this.#rowPrefixDirty = true; // 标记前缀和需重建
    }

    /**
     * 删除指定列
     * 后续列号自动递减，同时清理相关的隐藏状态和缓存
     *
     * @param {number} col - 要删除的列索引
     */
    deleteCol(col) {
        if (col < 0 || col >= this.#colWidths.length) return; // 边界检查
        this.#colWidths.splice(col, 1); // 删除列

        // 清理被删除列的隐藏信息和缓存
        this.#hiddenCols.delete(col);
        this.#originalColWidths.delete(col);

        // 更新剩余隐藏列的索引：> col 的列号都 -1
        this.#hiddenCols = new Set([...this.#hiddenCols].map((c) => (c > col ? c - 1 : c)));
        // 更新剩余原始宽度缓存的索引：> col 的列号都 -1
        this.#originalColWidths = new Map([...this.#originalColWidths].map(([c, w]) => [c > col ? c - 1 : c, w]));
        this.#colPrefixDirty = true; // 标记前缀和需重建
    }

    /**
     * 计算移动操作后的新索引
     * 当一个元素从 from 位置移动到 to 位置时，
     * 其他元素的索引会相应地向前或向后移动
     *
     * @private
     * @param {number} idx - 原始索引
     * @param {number} from - 起始位置（被移动元素的原位置）
     * @param {number} to - 目标位置（被移动元素的新位置）
     * @returns {number} 移动后的新索引
     */
    #shiftIndex(idx, from, to) {
        if (idx === from) return to; // 被移动的元素直接到目标位置
        if (from < to) {
            // 向右移动：中间的元素向左移一位
            return idx > from && idx <= to ? idx - 1 : idx;
        }
        // 向左移动：中间的元素向右移一位
        return idx >= to && idx < from ? idx + 1 : idx;
    }

    /**
     * 移动一列到新位置
     * 保持列宽不变，只改变顺序
     * 同时更新隐藏列集合和原始宽度缓存的索引映射
     *
     * @param {number} fromCol - 要移动的列的当前位置
     * @param {number} toCol - 目标位置
     */
    moveCol(fromCol, toCol) {
        if (fromCol === toCol) return; // 无需移动
        this.ensureSize(0, Math.max(fromCol, toCol) + 1); // 确保数组足够大

        // 先取出原位置的列宽，再插入到目标位置
        const [width] = this.#colWidths.splice(fromCol, 1);
        this.#colWidths.splice(toCol, 0, width);

        // 更新隐藏列集合的索引映射
        this.#hiddenCols = new Set([...this.#hiddenCols].map((c) => this.#shiftIndex(c, fromCol, toCol)));
        // 更新原始宽度缓存的索引映射
        this.#originalColWidths = new Map([...this.#originalColWidths].map(([c, w]) => [this.#shiftIndex(c, fromCol, toCol), w]));

        this.#colPrefixDirty = true; // 标记前缀和需重建
    }

    /**
     * 移动一行到新位置
     * 保持行高不变，只改变顺序
     * 同时更新隐藏行集合和原始高度缓存的索引映射
     *
     * @param {number} fromRow - 要移动的行的当前位置
     * @param {number} toRow - 目标位置
     */
    moveRow(fromRow, toRow) {
        if (fromRow === toRow) return; // 无需移动
        this.ensureSize(Math.max(fromRow, toRow) + 1, 0); // 确保数组足够大

        // 先取出原位置的行高，再插入到目标位置
        const [height] = this.#rowHeights.splice(fromRow, 1);
        this.#rowHeights.splice(toRow, 0, height);

        // 更新隐藏行集合的索引映射
        this.#hiddenRows = new Set([...this.#hiddenRows].map((r) => this.#shiftIndex(r, fromRow, toRow)));
        // 更新原始高度缓存的索引映射
        this.#originalRowHeights = new Map([...this.#originalRowHeights].map(([r, h]) => [this.#shiftIndex(r, fromRow, toRow), h]));

        this.#rowPrefixDirty = true; // 标记前缀和需重建
    }

    /**
     * 获取可视区域内的行列范围
     * 根据视口的起始位置和尺寸，计算出需要渲染的行列范围
     *
     * @param {number} viewX - 视口左侧 X 坐标（像素）
     * @param {number} viewY - 视口顶部 Y 坐标（像素）
     * @param {number} viewW - 视口宽度（像素）
     * @param {number} viewH - 视口高度（像素）
     * @returns {{topRow: number, topCol: number, bottomRow: number, bottomCol: number}} 可视范围
     */
    getVisibleRange(viewX, viewY, viewW, viewH) {
        const topCol = this.colAt(viewX); // 左侧第一列
        const topRow = this.rowAt(viewY); // 顶部第一行
        const bottomCol = Math.min(this.colCount, this.colAt(viewX + viewW) + 1); // 右侧最后一列+1
        const bottomRow = Math.min(this.rowCount, this.rowAt(viewY + viewH) + 1); // 底部最后一行+1
        return { topRow, topCol, bottomRow, bottomCol };
    }

    /**
     * 隐藏指定列（将宽度设为 0）
     * 保存原始宽度以便后续恢复
     * 如果列已经隐藏或索引无效，则不做任何操作
     *
     * @param {number} col - 要隐藏的列索引
     */
    hideColumn(col) {
        if (col < 0 || this.#hiddenCols.has(col)) return; // 边界检查
        this.ensureSize(0, col + 1); // 确保数组包含此列
        const currentWidth = this.#colWidths[col];
        this.#originalColWidths.set(col, currentWidth); // 保存原始宽度
        this.#colWidths[col] = 0; // 设置宽度为0（隐藏效果）
        this.#hiddenCols.add(col); // 加入隐藏集合
        this.#colPrefixDirty = true; // 标记前缀和需重建
    }

    /**
     * 显示指定列（恢复原始宽度）
     * 从缓存中恢复隐藏前的宽度，如果没有缓存则使用默认宽度
     * 如果列未隐藏，则不做任何操作
     *
     * @param {number} col - 要显示的列索引
     */
    showColumn(col) {
        if (!this.#hiddenCols.has(col)) return; // 只有隐藏的列才能显示
        const originalWidth = this.#originalColWidths.get(col) ?? CONFIG.DEFAULT_COL_WIDTH; // 获取原始宽度或默认值
        this.#colWidths[col] = originalWidth; // 恢复宽度
        this.#originalColWidths.delete(col); // 清除缓存
        this.#hiddenCols.delete(col); // 从隐藏集合移除
        this.#colPrefixDirty = true; // 标记前缀和需重建
    }

    /**
     * 判断指定列是否隐藏
     *
     * @param {number} col - 列索引
     * @returns {boolean} 如果列被隐藏返回 true，否则返回 false
     */
    isColumnHidden(col) {
        return this.#hiddenCols.has(col);
    }

    /**
     * 获取所有隐藏列索引
     * 返回结果按升序排列
     *
     * @returns {number[]} 隐藏列索引数组（升序）
     */
    getHiddenColumns() {
        return [...this.#hiddenCols].sort((a, b) => a - b);
    }

    /**
     * 清除所有隐藏列，恢复全量显示
     * 将所有隐藏列恢复为其原始宽度（或默认宽度）
     * 清空隐藏列集合和原始宽度缓存
     */
    clearHiddenColumns() {
        for (const col of this.#hiddenCols) {
            const originalWidth = this.#originalColWidths.get(col) ?? CONFIG.DEFAULT_COL_WIDTH;
            if (col < this.#colWidths.length) {
                this.#colWidths[col] = originalWidth; // 恢复每个隐藏列的宽度
            }
        }
        this.#hiddenCols.clear(); // 清空隐藏集合
        this.#originalColWidths.clear(); // 清空缓存
        this.#colPrefixDirty = true; // 标记前缀和需重建
    }

    /**
     * 检查是否存在隐藏列
     * @returns {boolean} 如果有隐藏列返回 true
     */
    get hasHiddenColumns() {
        return this.#hiddenCols.size > 0;
    }

    /**
     * 隐藏指定行（将高度设为 0）
     * 保存原始高度以便后续恢复
     * 如果行已经隐藏或索引无效，则不做任何操作
     *
     * @param {number} row - 要隐藏的行索引
     */
    hideRow(row) {
        if (row < 0 || this.#hiddenRows.has(row)) return; // 边界检查
        this.ensureSize(row + 1, 0); // 确保数组包含此行
        const currentHeight = this.#rowHeights[row];
        this.#originalRowHeights.set(row, currentHeight); // 保存原始高度
        this.#rowHeights[row] = 0; // 设置高度为0（隐藏效果）
        this.#hiddenRows.add(row); // 加入隐藏集合
        this.#rowPrefixDirty = true; // 标记前缀和需重建
    }

    /**
     * 显示指定行（恢复原始高度）
     * 从缓存中恢复隐藏前的高度，如果没有缓存则使用默认高度
     * 如果行未隐藏，则不做任何操作
     *
     * @param {number} row - 要显示的行索引
     */
    showRow(row) {
        if (!this.#hiddenRows.has(row)) return; // 只有隐藏的行才能显示
        const originalHeight = this.#originalRowHeights.get(row) ?? CONFIG.DEFAULT_ROW_HEIGHT; // 获取原始高度或默认值
        this.#rowHeights[row] = originalHeight; // 恢复高度
        this.#originalRowHeights.delete(row); // 清除缓存
        this.#hiddenRows.delete(row); // 从隐藏集合移除
        this.#rowPrefixDirty = true; // 标记前缀和需重建
    }

    /**
     * 判断指定行是否隐藏
     *
     * @param {number} row - 行索引
     * @returns {boolean} 如果行被隐藏返回 true，否则返回 false
     */
    isRowHidden(row) {
        return this.#hiddenRows.has(row);
    }

    /**
     * 获取所有隐藏行索引
     * 返回结果按升序排列
     *
     * @returns {number[]} 隐藏行索引数组（升序）
     */
    getHiddenRows() {
        return [...this.#hiddenRows].sort((a, b) => a - b);
    }

    /**
     * 清除所有隐藏行，恢复全量显示
     * 将所有隐藏行恢复为其原始高度（或默认高度）
     * 清空隐藏行集合和原始高度缓存
     */
    clearHiddenRows() {
        for (const row of this.#hiddenRows) {
            const originalHeight = this.#originalRowHeights.get(row) ?? CONFIG.DEFAULT_ROW_HEIGHT;
            if (row < this.#rowHeights.length) {
                this.#rowHeights[row] = originalHeight; // 恢复每个隐藏行的高度
            }
        }
        this.#hiddenRows.clear(); // 清空隐藏集合
        this.#originalRowHeights.clear(); // 清空缓存
        this.#rowPrefixDirty = true; // 标记前缀和需重建
    }

    /**
     * 检查是否存在隐藏行
     * @returns {boolean} 如果有隐藏行返回 true
     */
    get hasHiddenRows() {
        return this.#hiddenRows.size > 0;
    }

    /**
     * 重建前缀和数组
     * 根据尺寸数组计算每个位置的累计值（前缀和）
     * 使用 Float64Array 以获得更好的数值精度和性能
     *
     * @private
     * @param {number[]} sizes - 尺寸数组（行高或列宽数组）
     * @param {boolean} dirtyFlag - 脏标记引用（用于标记是否需要重建）
     * @returns {{prefix: Float64Array, allocated: number}} 前缀和数组及总分配值
     */
    #rebuildPrefix(sizes, dirtyFlag) {
        const n = sizes.length;
        if (n > 0) {
            const prefix = new Float64Array(n); // 使用 Float64Array 提高性能
            let sum = 0;
            for (let i = 0; i < n; i++) {
                sum += sizes[i]; // 累计求和
                prefix[i] = sum; // 存储前缀和
            }
            return { prefix, allocated: sum }; // 返回前缀和数组及总分配值
        }
        return { prefix: new Float64Array(0), allocated: 0 }; // 空数组情况
    }

    /**
     * 确保行前缀和数组是最新的
     * 如果脏标记为 true，则重新计算前缀和
     * 使用延迟计算策略，只在需要时才重建
     *
     * @private
     */
    #ensureRowPrefix() {
        if (!this.#rowPrefixDirty) return; // 如果是干净的，无需重建
        const { prefix, allocated } = this.#rebuildPrefix(this.#rowHeights); // 重建前缀和
        this.#rowPrefixSum = prefix; // 保存前缀和数组
        this.#allocatedHeight = allocated; // 保存总分配高度
        this.#rowPrefixDirty = false; // 标记为干净
    }

    /**
     * 确保列前缀和数组是最新的
     * 如果脏标记为 true，则重新计算前缀和
     * 使用延迟计算策略，只在需要时才重建
     *
     * @private
     */
    #ensureColPrefix() {
        if (!this.#colPrefixDirty) return; // 如果是干净的，无需重建
        const { prefix, allocated } = this.#rebuildPrefix(this.#colWidths); // 重建前缀和
        this.#colPrefixSum = prefix; // 保存前缀和数组
        this.#allocatedWidth = allocated; // 保存总分配宽度
        this.#colPrefixDirty = false; // 标记为干净
    }
}