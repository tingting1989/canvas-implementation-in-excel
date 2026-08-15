/**
 * 通用工具函数
 *
 * 提供公式计算所需的底层辅助函数：
 * - 数组展平 (_flatten)
 * - 数值转换 (_toNum)
 * - 空值判断 (_isBlank)
 *
 * @module formula/functions/utils/helpers
 */

/**
 * 展平嵌套数组（迭代版本，避免栈溢出）
 *
 * 将多维数组递归展平为一维数组
 *
 * @param arr - 要展平的数组（可包含任意层级的嵌套）
 * @returns 展平后的一维数组
 *
 * @example
 * _flatten([1, [2, [3, 4]], 5])        // [1, 2, 3, 4, 5]
 * _flatten([[1, 2], [3, [4, 5]]])      // [1, 2, 3, 4, 5]
 */
export function _flatten(arr: unknown[]): unknown[] {
    const result: unknown[] = [];
    const stack: { arr: unknown[]; index: number }[] = [{ arr: arr, index: 0 }];

    while (stack.length > 0) {
        const frame = stack[stack.length - 1];

        if (frame.index >= frame.arr.length) {
            stack.pop();
            continue;
        }

        const item = frame.arr[frame.index];
        frame.index++;

        if (Array.isArray(item)) {
            stack.push({ arr: item as unknown[], index: 0 });
        } else {
            result.push(item);
        }
    }

    return result;
}

/**
 * 将值转换为数值
 *
 * 支持多种输入类型的转换：
 * - 数值类型：直接返回
 * - 字符串类型：尝试解析为浮点数
 * - 其他类型：返回 NaN
 *
 * @param v - 要转换的值
 * @returns 转换后的数值，无法转换时返回 NaN
 *
 * @example
 * _toNum(123)         // 123
 * _toNum("456")       // 456
 * _toNum("3.14")      // 3.14
 * _toNum("abc")       // NaN
 * _toNum(null)        // NaN
 * _toNum(undefined)   // NaN
 */
export function _toNum(v: unknown): number {
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "string" && v.trim() !== "") {
        const trimmed = v.trim();
        if (/^0[xX]/.test(trimmed)) return NaN;
        const n = parseFloat(v);
        return isNaN(n) ? NaN : n;
    }
    return NaN;
}

/**
 * 判断值是否为空（用于 COUNTBLANK 等函数）
 *
 * 与 Excel 行为一致：
 * - 空字符串 "" → 空白
 * - null → 空白
 * - undefined → 空白
 * - 其他值 → 非空白（包括 0、false、空格等）
 *
 * @param value - 要检查的值
 * @returns 是否为空白
 *
 * @example
 * _isBlank("")          // true
 * _isBlank(null)        // true
 * _isBlank(undefined)   // true
 * _isBlank(0)           // false
 * _isBlank(false)       // false
 * _isBlank(" ")         // false (空格不算空)
 * _isBlank("Hello")     // false
 */
export function _isBlank(value: unknown): boolean {
    return value === "" || value === null || value === undefined;
}

/**
 * 惰性遍历公式参数（不创建中间数组）
 *
 * 公式函数接收的 args 可能是：
 * - 标量值: 42
 * - 一维数组: [1, 2, 3]（单行范围）
 * - 二维数组: [[1,2],[3,4]]（多行范围）
 *
 * 此函数直接遍历所有叶子值，调用 callback(value)，
 * 避免 _flatten() 创建中间数组带来的内存和 GC 开销。
 *
 * @param args - 公式函数的参数数组
 * @param callback - 对每个叶子值调用的回调
 *
 * @example
 * // 替代: const flat = _flatten(args); for (const v of flat) { ... }
 * _forEachLeaf(args, (v) => { const n = _toNum(v); if (!isNaN(n)) sum += n; });
 */
export function _forEachLeaf(args: unknown[], callback: (value: unknown) => void): void {
    for (let i = 0; i < args.length; i++) {
        const item = args[i];
        if (Array.isArray(item)) {
            for (let j = 0; j < item.length; j++) {
                const row = item[j];
                if (Array.isArray(row)) {
                    for (let k = 0; k < row.length; k++) {
                        callback(row[k]);
                    }
                } else {
                    callback(row);
                }
            }
        } else {
            callback(item);
        }
    }
}

/**
 * 惰性收集数值（不创建中间数组）
 *
 * 遍历所有叶子值，将有效数值直接收集到输出数组。
 * 比 _flatten(args).map(_toNum).filter(v => !isNaN(v)) 减少 2 次中间数组创建。
 *
 * @param args - 公式函数的参数数组
 * @returns 有效数值数组
 */
export function _collectNums(args: unknown[]): number[] {
    const nums: number[] = [];
    _forEachLeaf(args, (v) => {
        const n = _toNum(v);
        if (!isNaN(n)) nums.push(n);
    });
    return nums;
}
