import { CONFIG } from "../constants/config";

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
    /** @type {import("../workbook/Sheet.js").Sheet} */
    #sheet;
    /** @type {"row"|"col"} */
    #axis;

    /**
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 所属工作表
     * @param {"row"|"col"} axis - 同步轴
     */
    constructor(sheet, axis) {
        this.#sheet = sheet;
        this.#axis = axis;
    }

    /** 行头或列头标签数组（取决于 axis） */
    get #headers() {
        return this.#axis === "row" ? this.#sheet.rowHeaders : this.#sheet.colHeaders;
    }

    /** 需要同步的 Map 集合（行：rowStyles；列：columnsConfig + colStyles + dataBindings） */
    get #maps() {
        return this.#axis === "row"
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
        if (this.#axis === "col") this.#insertNestedHeaderColumn(atIndex);
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
        if (this.#axis === "col") this.#deleteNestedHeaderColumn(atIndex);
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
        if (this.#axis === "col") this.#shiftNestedHeaders(from, to);
    }

    // ─── 数组操作工具 ──────────────────────────────────

    /** 在数组指定位置插入空元素 */
    #insertArrayAt(arr, atIndex) {
        if (!Array.isArray(arr) || atIndex < 0 || atIndex >= CONFIG.MAX_COLS) return;
        arr.splice(atIndex, 0, "");
    }

    /** 删除数组指定位置的元素 */
    #deleteArrayAt(arr, atIndex) {
        if (!Array.isArray(arr) || atIndex < 0 || atIndex >= arr.length) return;
        arr.splice(atIndex, 1);
    }

    /** 将数组元素从 from 位置移到 to 位置 */
    #shiftArray(arr, from, to) {
        if (!Array.isArray(arr) || arr.length <= Math.max(from, to)) return;
        const [item] = arr.splice(from, 1);
        arr.splice(to, 0, item);
    }

    // ─── Map 键重映射 ──────────────────────────────────

    /**
     * 重映射 Map 的所有键
     * @param {Map<number, *>} map
     * @param {(key: number) => number} shiftFn - 键映射函数
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
     * @param {(key: number) => number} shiftFn - 键映射函数
     * @param {boolean} [deleteOnMinusOne=false] - 是否在映射结果为 -1 时删除该条目
     */
    #remapCellTypesKeys(shiftFn, deleteOnMinusOne = false) {
        const toDelete = [];
        const moved = [];
        for (const [key, val] of this.#sheet.cellTypes) {
            const [r, c] = key.split(",").map(Number);
            const oldVal = this.#axis === "row" ? r : c;
            const newVal = shiftFn(oldVal);
            if (newVal === -1) {
                toDelete.push(key);
            } else if (newVal !== oldVal) {
                const newKey = this.#axis === "row" ? `${newVal},${c}` : `${r},${newVal}`;
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
     * @param {number} index - 原始索引
     * @param {number} from - 源位置
     * @param {number} to - 目标位置
     * @returns {number}
     */
    #calcShiftedIndex(index, from, to) {
        if (index === from) return to;
        if (from < to) return index > from && index <= to ? index - 1 : index;
        return index >= to && index < from ? index + 1 : index;
    }

    // ─── 嵌套表头操作（仅列轴）──────────────────────────

    /** 插入列时扩展嵌套表头的 colspan */
    #insertNestedHeaderColumn(atCol) {
        const nh = this.#sheet.nestedHeaders;
        if (!Array.isArray(nh) || nh.length === 0) return;
        for (const layer of nh) {
            if (!Array.isArray(layer) || layer.length === 0) continue;
            let consumed = 0;
            let inserted = false;
            for (let i = 0; i < layer.length; i++) {
                const item = layer[i];
                const isObj = typeof item === "object" && item !== null;
                const colspan = isObj && typeof item.colspan === "number" ? item.colspan : 1;
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

    /** 删除列时缩减嵌套表头的 colspan */
    #deleteNestedHeaderColumn(atCol) {
        const nh = this.#sheet.nestedHeaders;
        if (!Array.isArray(nh) || nh.length === 0) return;
        for (const layer of nh) {
            if (!Array.isArray(layer) || layer.length === 0) continue;
            let consumed = 0;
            for (let i = 0; i < layer.length; i++) {
                const item = layer[i];
                const isObj = typeof item === "object" && item !== null;
                const label = isObj ? (item.label ?? "") : String(item);
                const colspan = isObj && typeof item.colspan === "number" ? item.colspan : 1;
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

    /** 移动列时平移嵌套表头的标签 */
    #shiftNestedHeaders(fromCol, toCol) {
        const nh = this.#sheet.nestedHeaders;
        if (!Array.isArray(nh) || nh.length === 0) return;
        for (let li = 0; li < nh.length; li++) {
            const layer = nh[li];
            if (!Array.isArray(layer) || layer.length === 0) continue;

            const flat = [];
            for (const item of layer) {
                const isObj = typeof item === "object" && item !== null;
                const label = isObj ? (item.label ?? "") : String(item);
                const colspan = isObj && typeof item.colspan === "number" ? item.colspan : 1;
                for (let i = 0; i < colspan; i++) flat.push(label);
            }

            if (fromCol < flat.length) {
                const [moved] = flat.splice(fromCol, 1);
                flat.splice(toCol, 0, moved);
            }

            const repacked = [];
            let i = 0;
            while (i < flat.length) {
                const label = flat[i];
                let span = 1;
                while (i + span < flat.length && flat[i + span] === label) span++;
                repacked.push(span === 1 ? label : { label, colspan: span });
                i += span;
            }
            nh[li] = repacked;
        }
    }
}
