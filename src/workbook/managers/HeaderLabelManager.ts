import { CONFIG } from "../../constants/config";
import { isFunction, isObject, isString } from "../../utils/helper";
import { indexToCol } from "../../utils/cellRef";
import type { Sheet } from "../Sheet";

type HeaderConfig = boolean | string[] | ((index: number) => string) | Record<string, unknown>[] | null;
type NestedHeaderItem = string | { label?: string; colspan?: number; style?: Record<string, unknown> };
type NestedHeaderRow = NestedHeaderItem[];

/**
 * 表头标签管理器
 *
 * 从 Sheet 中提取的独立子模块，负责：
 * - 行头/列头标签解析（支持 true | string[] | Function 三种配置形式）
 * - 默认列标签生成（A, B, C, ..., Z, AA, ...）
 * - 嵌套表头查询（支持 colspan 跨列和自定义样式）
 * - 表头尺寸计算（宽度/高度）
 *
 * 所有方法均通过 Sheet 上的同名公开方法暴露，外部调用者无感知。
 */
export class HeaderLabelManager {
    #sheet: Sheet;
    #colHeaders: HeaderConfig = true;
    #rowHeaders: HeaderConfig = true;
    #nestedHeaders: NestedHeaderRow[] | null = null;
    #rowHeaderWidth: number = CONFIG.HEADER_WIDTH;
    #headerHeight: number = CONFIG.HEADER_HEIGHT;

    constructor(sheet: Sheet) {
        this.#sheet = sheet;
    }

    get colHeaders(): HeaderConfig {
        return this.#colHeaders;
    }
    set colHeaders(v: HeaderConfig) {
        this.#colHeaders = v;
    }

    get rowHeaders(): HeaderConfig {
        return this.#rowHeaders;
    }
    set rowHeaders(v: HeaderConfig) {
        this.#rowHeaders = v;
    }

    get nestedHeaders(): NestedHeaderRow[] | null {
        return this.#nestedHeaders;
    }
    set nestedHeaders(v: NestedHeaderRow[] | null) {
        this.#nestedHeaders = v;
    }

    get rowHeaderWidth(): number {
        return this.#rowHeaderWidth;
    }
    set rowHeaderWidth(v: number) {
        this.#rowHeaderWidth = v;
    }

    get headerHeight(): number {
        return this.#headerHeight;
    }
    set headerHeight(v: number) {
        if (v > 0) {
            this.#headerHeight = v;
        }
    }

    getColHeader(col: number): string {
        return this.#resolve(this.#colHeaders, col, indexToCol);
    }

    getColHeaderStyle(col: number): Record<string, unknown> | null {
        return this.#resolveStyle(this.#colHeaders, col);
    }

    getRowHeader(row: number): string {
        return this.#resolve(this.#rowHeaders, row, (i) => String(i + 1));
    }

    getRowHeaderStyle(row: number): Record<string, unknown> | null {
        return this.#resolveStyle(this.#rowHeaders, row);
    }

    #resolveStyle(config: HeaderConfig, index: number): Record<string, unknown> | null {
        if (config === true || config === null || config === undefined) return null;
        if (Array.isArray(config)) {
            if (index >= config.length) return null;
            const item = config[index];
            if (isObject(item) && (item as Record<string, unknown>).style) return (item as Record<string, unknown>).style as Record<string, unknown>;
            return null;
        }
        return null;
    }

    #resolve(config: HeaderConfig, index: number, defaultFn: (index: number) => string): string {
        if (config === true || config === null || config === undefined) return defaultFn(index);
        if (Array.isArray(config)) {
            if (index >= config.length) return defaultFn(index);
            const item = config[index];

            if (isObject(item) && (item as Record<string, unknown>).label !== undefined) return (item as Record<string, unknown>).label as string;

            if (isString(item)) return item as string;
            return defaultFn(index);
        }
        if (isFunction(config)) return (config as (index: number) => string)(index);
        return defaultFn(index);
    }

    getNestedHeaderRowCount(): number {
        const nh = this.#nestedHeaders;
        return Array.isArray(nh) ? nh.length : 0;
    }

    getNestedColHeader(rowIndex: number, col: number): { label: string; colspan: number; style?: Record<string, unknown> } | null {
        const nh = this.#nestedHeaders;
        if (!nh || rowIndex >= nh.length) return null;
        const row = nh[rowIndex];
        if (!Array.isArray(row)) return null;

        let consumed = 0;
        for (let i = 0; i < row.length; i++) {
            const item = row[i];
            const label = isString(item) ? (item as string) : String((item as Record<string, unknown>)?.label ?? "");
            const colspan =
                item && isObject(item) && (item as Record<string, unknown>).colspan ? ((item as Record<string, unknown>).colspan as number) : 1;
            const style =
                item && isObject(item) && (item as Record<string, unknown>).style
                    ? ((item as Record<string, unknown>).style as Record<string, unknown>)
                    : null;

            if (col >= consumed && col < consumed + colspan) {
                const result: { label: string; colspan: number; style?: Record<string, unknown> } = { label, colspan };
                if (style) result.style = style;
                return result;
            }
            consumed += colspan;
        }

        return null;
    }

    getHeaderHeight(): number {
        const rows = this.getNestedHeaderRowCount() || CONFIG.NESTED_HEADER_ROWS;
        return rows * this.#headerHeight;
    }

    getHeaderWidth(): number {
        return this.#rowHeaderWidth ?? CONFIG.HEADER_WIDTH;
    }
}
