import { CONFIG } from "../../constants/config";
import { isNumber, isObject } from "../../utils/helper.js";

/**
 * 行列同步器
 *
 * 统一管理 insert/delete/move 时所有附属状态的同步：
 * - 行/列头标签数组（rowHeaders / colHeaders）
 * - 行/列样式 Map（rowStyles / colStyles）
 * - 列配置 Map（columnsConfig）
 * - 数据绑定 Map（dataBindings）
 * - 单元格类型 Map（cellTypes）
 * - 嵌套表头（nestedHeaders）
 *
 * 将原来分散在 6 个行列操作方法中的同步逻辑收敛到此处，
 * 通过 #remapMapKeys 和 #remapCellTypesKeys 两个通用方法
 * 替代原来 6 套独立的移位代码。
 */
export class RowColSync {
    /** @type {import("../../workbook/Sheet.js").Sheet} */
    #sheet;

    /** @type {"row"|"col"} */
    #axis;

    /**
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 所属工作表
     * @param {"row"|"col"} axis - 同步轴
     */
    constructor(sheet, axis) {
        this.#sheet = sheet;
        this.#axis = axis;
    }

    /** 行头或列头标签数组（取决于 axis） */
    get #headers() {
        return this.#axis === CONFIG.AXIS_ROW ? this.#sheet.rowHeaders : this.#sheet.colHeaders;
    }

    /** 需要同步的 Map 集合（行：rowStyles；列：columnsConfig + colStyles + dataBindings） */
    get #maps() {
        return this.#axis === CONFIG.AXIS_ROW
            ? [this.#sheet.rowStyles]
            : [this.#sheet.columnsConfig, this.#sheet.colStyles, this.#sheet.dataBindings];
    }

    /**
     * 在指定位置插入行/列，同步所有附属状态
     * @param {number} atIndex - 插入位置
     */
    insert(atIndex) {
        this.#insertArrayAt(this.#headers, atIndex);
        for (const map of this.#maps) {
            this.#remapMapKeys(map, (k) => (k >= atIndex ? k + 1 : k));
        }
        this.#remapCellTypesKeys((k) => (k >= atIndex ? k + 1 : k));
        if (this.#axis === CONFIG.AXIS_COL) this.#insertNestedHeaderColumn(atIndex);
    }

    /**
     * 删除指定位置的行/列，同步所有附属状态
     * @param {number} atIndex - 删除位置
     */
    delete(atIndex) {
        this.#deleteArrayAt(this.#headers, atIndex);
        for (const map of this.#maps) {
            map.delete(atIndex);
            this.#remapMapKeys(map, (k) => (k > atIndex ? k - 1 : k));
        }
        this.#remapCellTypesKeys((k) => (k === atIndex ? -1 : k > atIndex ? k - 1 : k), true);
        if (this.#axis === CONFIG.AXIS_COL) this.#deleteNestedHeaderColumn(atIndex);
    }

    /**
     * 移动行/列，从 from 位置移到 to 位置，同步所有附属状态
     * @param {number} from - 源位置
     * @param {number} to - 目标位置
     */
    move(from, to) {
        this.#shiftArray(this.#headers, from, to);
        for (const map of this.#maps) {
            this.#remapMapKeys(map, (k) => this.#calcShiftedIndex(k, from, to));
        }
        this.#remapCellTypesKeys((k) => this.#calcShiftedIndex(k, from, to));
        if (this.#axis === CONFIG.AXIS_COL) this.#shiftNestedHeaders(from, to);
    }

    // ─── 数组操作工具 ──────────────────────────────────

    /**
     * 在数组指定位置插入空字符串元素
     * 用于插入行/列时在标签数组中添加新标签位
     * @param {string[]} arr - 标签数组
     * @param {number} atIndex - 插入位置索引
     */
    #insertArrayAt(arr, atIndex) {
        if (!Array.isArray(arr) || atIndex < 0 || atIndex >= CONFIG.MAX_COLS) return;
        arr.splice(atIndex, 0, "");
    }

    /**
     * 删除数组指定位置的元素
     * 用于删除行/列时从标签数组中移除对应标签
     * @param {string[]} arr - 标签数组
     * @param {number} atIndex - 删除位置索引
     */
    #deleteArrayAt(arr, atIndex) {
        if (!Array.isArray(arr) || atIndex < 0 || atIndex >= arr.length) return;
        arr.splice(atIndex, 1);
    }

    /**
     * 将数组元素从 from 位置移到 to 位置
     * 用于移动行/列时调整标签数组中元素的顺序
     * @param {string[]} arr - 标签数组
     * @param {number} from - 源位置
     * @param {number} to - 目标位置
     */
    #shiftArray(arr, from, to) {
        if (!Array.isArray(arr) || arr.length <= Math.max(from, to)) return;
        const [item] = arr.splice(from, 1);
        arr.splice(to, 0, item);
    }

    // ─── Map 键重映射 ──────────────────────────────────

    /**
     * 重映射 Map 的所有键
     * 遍历 Map 中所有条目，对每个键应用 shiftFn 得到新键，
     * 若新键与旧键不同则先删除旧键再设置新键，避免键冲突
     * @param {Map<number, *>} map - 需要重映射键的 Map
     * @param {(key: number) => number} shiftFn - 键映射函数，接收旧键返回新键
     */
    #remapMapKeys(map, shiftFn) {
        const moved = [];
        for (const [key, val] of map) {
            const newKey = shiftFn(key);
            if (newKey !== key) moved.push({ old: key, new: newKey, val });
        }
        for (const { old: k } of moved) map.delete(k);
        for (const { new: k, val } of moved) map.set(k, val);
    }

    /**
     * 重映射 cellTypes Map 的键
     * cellTypes 的键格式为 "row,col" 字符串，需要根据轴类型（行/列）提取对应索引并重映射
     * - 若映射结果为 -1，表示该条目应被删除（对应行/列已被删除）
     * - 若映射结果与原值不同，则更新键中的行号或列号
     * @param {(key: number) => number} shiftFn - 键映射函数，接收旧行/列索引返回新索引
     * @param {boolean} [deleteOnMinusOne=false] - 是否在映射结果为 -1 时删除该条目（删除操作时为 true）
     */
    #remapCellTypesKeys(shiftFn, deleteOnMinusOne = false) {
        const toDelete = [];
        const moved = [];
        for (const [key, val] of this.#sheet.cellTypes) {
            const [r, c] = key.split(",").map(Number);
            const oldVal = this.#axis === CONFIG.AXIS_ROW ? r : c;
            const newVal = shiftFn(oldVal);
            if (newVal === -1) {
                toDelete.push(key);
            } else if (newVal !== oldVal) {
                const newKey = this.#axis === CONFIG.AXIS_ROW ? `${newVal},${c}` : `${r},${newVal}`;
                moved.push({ oldKey: key, newKey, val });
            }
        }
        for (const k of toDelete) this.#sheet.cellTypes.delete(k);
        for (const { oldKey } of moved) this.#sheet.cellTypes.delete(oldKey);
        for (const { newKey, val } of moved) this.#sheet.cellTypes.set(newKey, val);
    }

    // ─── 移动索引计算 ──────────────────────────────────

    /**
     * 计算移动操作后的新索引
     * 处理三种情况：
     * - 被移动元素本身：直接移到目标位置
     * - 向后移动（from < to）：区间 (from, to] 内的元素前移一位
     * - 向前移动（from > to）：区间 [to, from) 内的元素后移一位
     * @param {number} index - 原始索引
     * @param {number} from - 源位置
     * @param {number} to - 目标位置
     * @returns {number} 移动后的新索引
     */
    #calcShiftedIndex(index, from, to) {
        if (index === from) return to;
        if (from < to) return index > from && index <= to ? index - 1 : index;
        return index >= to && index < from ? index + 1 : index;
    }

    // ─── 嵌套表头操作（仅列轴）──────────────────────────

    /**
     * 插入列时扩展嵌套表头的 colspan
     * 遍历每一层嵌套表头，找到插入列所在的表头项：
     * - 若该项有 colspan，则 colspan +1
     * - 若该项为简单字符串且 colspan=1，则在该位置插入空字符串项
     * 若插入位置超出所有表头项的范围，则在末尾追加空字符串
     * @param {number} atCol - 插入列的位置
     */
    #insertNestedHeaderColumn(atCol) {
        const nh = this.#sheet.nestedHeaders;
        if (!Array.isArray(nh) || nh.length === 0) return;
        for (const layer of nh) {
            if (!Array.isArray(layer) || layer.length === 0) continue;
            let consumed = 0;
            let inserted = false;
            for (let i = 0; i < layer.length; i++) {
                const item = layer[i];
                const isObj = isObject(item);
                const colspan = isObj && isNumber(item.colspan) ? item.colspan : 1;
                if (atCol >= consumed && atCol < consumed + colspan) {
                    if (isObj) {
                        layer[i] = { ...item, colspan: colspan + 1 };
                    } else if (colspan > 1) {
                        layer[i] = { label: String(item), colspan: colspan + 1 };
                    } else {
                        layer.splice(i, 0, "");
                    }
                    inserted = true;
                    break;
                }
                consumed += colspan;
            }
            if (!inserted) layer.push("");
        }
    }

    /**
     * 删除列时缩减嵌套表头的 colspan
     * 遍历每一层嵌套表头，找到删除列所在的表头项：
     * - 若 colspan > 1，则 colspan -1（减为 1 时退化为简单字符串）
     * - 若 colspan = 1，则直接移除该项
     * @param {number} atCol - 删除列的位置
     */
    #deleteNestedHeaderColumn(atCol) {
        const nh = this.#sheet.nestedHeaders;
        if (!Array.isArray(nh) || nh.length === 0) return;
        for (const layer of nh) {
            if (!Array.isArray(layer) || layer.length === 0) continue;
            let consumed = 0;
            for (let i = 0; i < layer.length; i++) {
                const item = layer[i];
                const isObj = isObject(item);
                const label = isObj ? (item.label ?? "") : String(item);
                const colspan = isObj && isNumber(item.colspan) ? item.colspan : 1;
                if (atCol >= consumed && atCol < consumed + colspan) {
                    if (colspan > 1) {
                        const newSpan = colspan - 1;
                        layer[i] = newSpan === 1 ? label : { label, colspan: newSpan };
                    } else {
                        layer.splice(i, 1);
                    }
                    break;
                }
                consumed += colspan;
            }
        }
    }

    /**
     * 移动列时平移嵌套表头的标签和样式
     * 处理步骤：
     * 1. 将每一层嵌套表头展开为扁平数组（每个单元格对应一个条目）
     * 2. 在扁平数组中执行 from → to 的移动操作
     * 3. 重新打包：将相邻且标签和样式相同的条目合并为带 colspan 的对象
     * @param {number} fromCol - 源列位置
     * @param {number} toCol - 目标列位置
     */
    #shiftNestedHeaders(fromCol, toCol) {
        const nh = this.#sheet.nestedHeaders;
        if (!Array.isArray(nh) || nh.length === 0) return;
        for (let li = 0; li < nh.length; li++) {
            const layer = nh[li];
            if (!Array.isArray(layer) || layer.length === 0) continue;

            const flat = [];
            for (const item of layer) {
                const isObj = isObject(item);
                const label = isObj ? (item.label ?? "") : String(item);
                const colspan = isObj && isNumber(item.colspan) ? item.colspan : 1;
                const style = isObj ? item.style : null;
                for (let i = 0; i < colspan; i++) {
                    flat.push({ label, style });
                }
            }

            if (fromCol < flat.length) {
                const [moved] = flat.splice(fromCol, 1);
                flat.splice(toCol, 0, moved);
            }

            const repacked = [];
            let i = 0;
            while (i < flat.length) {
                const { label, style } = flat[i];
                let span = 1;
                while (i + span < flat.length) {
                    const next = flat[i + span];
                    if (next.label === label && this.#stylesEqual(next.style, style)) {
                        span++;
                    } else {
                        break;
                    }
                }
                if (span === 1) {
                    repacked.push(style ? { label, style } : label);
                } else {
                    repacked.push(style ? { label, colspan: span, style } : { label, colspan: span });
                }
                i += span;
            }
            nh[li] = repacked;
        }
    }

    // ─── 工具方法 ─────────────────────────────────────

    /**
     * 浅比较两个样式对象是否相等
     * 两个 null 引用视为相等，null 与非 null 视为不等
     * 比较所有自有属性的数量和值
     * @param {object|null} a - 第一个样式对象
     * @param {object|null} b - 第二个样式对象
     * @returns {boolean} 两个样式对象是否浅相等
     */
    #stylesEqual(a, b) {
        if (a === b) return true;
        if (!a || !b) return false;
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        for (const key of keysA) {
            if (a[key] !== b[key]) return false;
        }
        return true;
    }
}
