import { CONFIG } from "../../constants/config";
import { isNumber, isObject } from "../../utils/helper";

/** 嵌套表头项类型 */
type NestedHeaderItem = string | { label?: string; colspan?: number; style?: Record<string, unknown> };

/** Sheet 最小接口（仅 RowColSync 所需） */
interface SheetLike {
    rowHeaders: string[];
    colHeaders: string[];
    rowStyles: Map<number, unknown>;
    columnsConfig: Map<number, unknown>;
    colStyles: Map<number, unknown>;
    dataBindings: Map<number, unknown>;
    cellTypes: Map<string, unknown>;
    nestedHeaders: NestedHeaderItem[][];
}

/** 轴类型 */
type Axis = "row" | "col";

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
    #sheet: SheetLike;
    #axis: Axis;

    /**
     * @param sheet - 所属工作表
     * @param axis - 同步轴
     */
    constructor(sheet: SheetLike, axis: Axis) {
        this.#sheet = sheet;
        this.#axis = axis;
    }

    /** 行头或列头标签数组（取决于 axis） */
    get #headers(): string[] {
        return this.#axis === CONFIG.AXIS_ROW ? this.#sheet.rowHeaders : this.#sheet.colHeaders;
    }

    /** 需要同步的 Map 集合 */
    get #maps(): Map<number, unknown>[] {
        return this.#axis === CONFIG.AXIS_ROW
            ? [this.#sheet.rowStyles]
            : [this.#sheet.columnsConfig, this.#sheet.colStyles, this.#sheet.dataBindings];
    }

    /**
     * 在指定位置插入行/列，同步所有附属状态
     * @param atIndex - 插入位置
     */
    insert(atIndex: number): void {
        this.#insertArrayAt(this.#headers, atIndex);
        for (const map of this.#maps) {
            this.#remapMapKeys(map, (k) => (k >= atIndex ? k + 1 : k));
        }
        this.#remapCellTypesKeys((k) => (k >= atIndex ? k + 1 : k));
        if (this.#axis === CONFIG.AXIS_COL) this.#insertNestedHeaderColumn(atIndex);
    }

    /**
     * 删除指定位置的行/列，同步所有附属状态
     * @param atIndex - 删除位置
     */
    delete(atIndex: number): void {
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
     * @param from - 源位置
     * @param to - 目标位置
     */
    move(from: number, to: number): void {
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
     * @param arr - 标签数组
     * @param atIndex - 插入位置索引
     */
    #insertArrayAt(arr: string[], atIndex: number): void {
        if (!Array.isArray(arr) || atIndex < 0 || atIndex >= CONFIG.MAX_COLS) return;
        arr.splice(atIndex, 0, "");
    }

    /**
     * 删除数组指定位置的元素
     * @param arr - 标签数组
     * @param atIndex - 删除位置索引
     */
    #deleteArrayAt(arr: string[], atIndex: number): void {
        if (!Array.isArray(arr) || atIndex < 0 || atIndex >= arr.length) return;
        arr.splice(atIndex, 1);
    }

    /**
     * 将数组元素从 from 位置移到 to 位置
     * @param arr - 标签数组
     * @param from - 源位置
     * @param to - 目标位置
     */
    #shiftArray(arr: string[], from: number, to: number): void {
        if (!Array.isArray(arr) || arr.length <= Math.max(from, to)) return;
        const [item] = arr.splice(from, 1);
        arr.splice(to, 0, item);
    }

    // ─── Map 键重映射 ──────────────────────────────────

    /**
     * 重映射 Map 的所有键
     * @param map - 需要重映射键的 Map
     * @param shiftFn - 键映射函数
     */
    #remapMapKeys(map: Map<number, unknown>, shiftFn: (key: number) => number): void {
        const moved: Array<{ old: number; new: number; val: unknown }> = [];
        for (const [key, val] of map) {
            const newKey = shiftFn(key);
            if (newKey !== key) moved.push({ old: key, new: newKey, val });
        }
        for (const { old: k } of moved) map.delete(k);
        for (const { new: k, val } of moved) map.set(k, val);
    }

    /**
     * 重映射 cellTypes Map 的键
     * @param shiftFn - 键映射函数
     * @param deleteOnMinusOne - 是否在映射结果为 -1 时删除该条目
     */
    #remapCellTypesKeys(shiftFn: (key: number) => number, deleteOnMinusOne: boolean = false): void {
        const toDelete: string[] = [];
        const moved: Array<{ oldKey: string; newKey: string; val: unknown }> = [];
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
     * @param index - 原始索引
     * @param from - 源位置
     * @param to - 目标位置
     * @returns 移动后的新索引
     */
    #calcShiftedIndex(index: number, from: number, to: number): number {
        if (index === from) return to;
        if (from < to) return index > from && index <= to ? index - 1 : index;
        return index >= to && index < from ? index + 1 : index;
    }

    // ─── 嵌套表头操作（仅列轴）──────────────────────────

    /**
     * 插入列时扩展嵌套表头的 colspan
     * @param atCol - 插入列的位置
     */
    #insertNestedHeaderColumn(atCol: number): void {
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
     * @param atCol - 删除列的位置
     */
    #deleteNestedHeaderColumn(atCol: number): void {
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
     * @param fromCol - 源列位置
     * @param toCol - 目标列位置
     */
    #shiftNestedHeaders(fromCol: number, toCol: number): void {
        const nh = this.#sheet.nestedHeaders;
        if (!Array.isArray(nh) || nh.length === 0) return;
        for (let li = 0; li < nh.length; li++) {
            const layer = nh[li];
            if (!Array.isArray(layer) || layer.length === 0) continue;

            const flat: Array<{ label: string; style: Record<string, unknown> | null }> = [];
            for (const item of layer) {
                const isObj = isObject(item);
                const label = isObj ? (item.label ?? "") : String(item);
                const colspan = isObj && isNumber(item.colspan) ? item.colspan : 1;
                const style = isObj ? (item.style as Record<string, unknown>) : null;
                for (let i = 0; i < colspan; i++) {
                    flat.push({ label, style });
                }
            }

            if (fromCol < flat.length) {
                const [moved] = flat.splice(fromCol, 1);
                flat.splice(toCol, 0, moved);
            }

            const repacked: NestedHeaderItem[] = [];
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
     * @param a - 第一个样式对象
     * @param b - 第二个样式对象
     * @returns 两个样式对象是否浅相等
     */
    #stylesEqual(a: Record<string, unknown> | null, b: Record<string, unknown> | null): boolean {
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
