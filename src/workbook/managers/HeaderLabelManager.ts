import { CONFIG } from "../../constants/config";
import { isFunction, isObject, isString } from "../../utils/helper";
import { indexToCol } from "../../utils/cellRef";
import type { Sheet } from "../Sheet";

/**
 * 表头配置类型
 *
 * - boolean: true 显示默认标签，false 隐藏
 * - string[]: 自定义标签文本数组
 * - ((index: number) => string): 动态标签函数
 * - Record<string, unknown>[]: 带样式和标签的对象数组
 * - null: 使用默认
 */
type HeaderConfig = boolean | string[] | ((index: number) => string) | Record<string, unknown>[] | null;

/** 嵌套表头单项：字符串或带 label/colspan/style 的对象 */
type NestedHeaderItem = string | { label?: string; colspan?: number; style?: Record<string, unknown> };

/** 嵌套表头行 */
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
 *
 * @class HeaderLabelManager
 */
export class HeaderLabelManager {
    /** 工作表引用 */
    #sheet: Sheet;
    /** 列头配置 */
    #colHeaders: HeaderConfig = true;
    /** 行头配置 */
    #rowHeaders: HeaderConfig = true;
    /** 嵌套表头配置 */
    #nestedHeaders: NestedHeaderRow[] | null = null;
    /** 行头宽度（px） */
    #rowHeaderWidth: number = CONFIG.HEADER_WIDTH;
    /** 单行表头高度（px） */
    #headerHeight: number = CONFIG.HEADER_HEIGHT;

    /**
     * @param sheet - 工作表实例
     */
    constructor(sheet: Sheet) {
        this.#sheet = sheet;
    }

    /** 获取列头配置 */
    get colHeaders(): HeaderConfig {
        return this.#colHeaders;
    }
    /** 设置列头配置 */
    set colHeaders(v: HeaderConfig) {
        this.#colHeaders = v;
    }

    /** 获取行头配置 */
    get rowHeaders(): HeaderConfig {
        return this.#rowHeaders;
    }
    /** 设置行头配置 */
    set rowHeaders(v: HeaderConfig) {
        this.#rowHeaders = v;
    }

    /** 获取嵌套表头配置 */
    get nestedHeaders(): NestedHeaderRow[] | null {
        return this.#nestedHeaders;
    }
    /** 设置嵌套表头配置 */
    set nestedHeaders(v: NestedHeaderRow[] | null) {
        this.#nestedHeaders = v;
    }

    /** 获取行头宽度（px） */
    get rowHeaderWidth(): number {
        return this.#rowHeaderWidth;
    }
    /** 设置行头宽度（px） */
    set rowHeaderWidth(v: number) {
        this.#rowHeaderWidth = v;
    }

    /** 获取单行表头高度（px） */
    get headerHeight(): number {
        return this.#headerHeight;
    }
    /** 设置单行表头高度（px），必须为正数 */
    set headerHeight(v: number) {
        if (v > 0) {
            this.#headerHeight = v;
        }
    }

    /**
     * 获取列头标签文本
     *
     * 根据 colHeaders 配置解析：
     * - true/null → 默认列标签（A, B, C...）
     * - string[] → 数组对应位置文本
     * - Function → 函数返回值
     * - object[] → 对象的 label 属性
     *
     * @param col - 列号
     * @returns 列头文本
     */
    getColHeader(col: number): string {
        return this.#resolve(this.#colHeaders, col, indexToCol);
    }

    /**
     * 获取列头样式
     * @param col - 列号
     * @returns 样式对象，无样式返回 null
     */
    getColHeaderStyle(col: number): Record<string, unknown> | null {
        return this.#resolveStyle(this.#colHeaders, col);
    }

    /**
     * 获取行头标签文本
     *
     * 默认行标签为 1, 2, 3...
     *
     * @param row - 行号
     * @returns 行头文本
     */
    getRowHeader(row: number): string {
        return this.#resolve(this.#rowHeaders, row, (i) => String(i + 1));
    }

    /**
     * 获取行头样式
     * @param row - 行号
     * @returns 样式对象，无样式返回 null
     */
    getRowHeaderStyle(row: number): Record<string, unknown> | null {
        return this.#resolveStyle(this.#rowHeaders, row);
    }

    /**
     * 解析表头样式
     *
     * 仅当配置为 object[] 时，返回对应位置的 style 属性。
     *
     * @param config - 表头配置
     * @param index - 行/列号
     * @returns 样式对象或 null
     */
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

    /**
     * 解析表头标签
     *
     * 按配置类型分派：
     * - true/null → 调用 defaultFn 生成默认标签
     * - Array → 取对应位置元素，支持 string 和 { label } 对象
     * - Function → 调用函数返回标签
     *
     * @param config - 表头配置
     * @param index - 行/列号
     * @param defaultFn - 默认标签生成函数
     * @returns 标签文本
     */
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

    /**
     * 获取嵌套表头行数
     * @returns 嵌套表头行数，无嵌套返回 0
     */
    getNestedHeaderRowCount(): number {
        const nh = this.#nestedHeaders;
        return Array.isArray(nh) ? nh.length : 0;
    }

    /**
     * 获取嵌套列头信息
     *
     * 遍历嵌套表头行，根据 colspan 累计消耗列数，
     * 返回包含指定列号的那个表头项的信息。
     *
     * @param rowIndex - 嵌套行索引（从 0 开始）
     * @param col - 列号
     * @returns 标签、跨列数和可选样式，未找到返回 null
     */
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

    /**
     * 获取表头总高度（px）
     *
     * 考虑嵌套表头行数：行数 × 单行高度。
     * 无嵌套时使用 CONFIG.NESTED_HEADER_ROWS。
     *
     * @returns 表头总高度
     */
    getHeaderHeight(): number {
        const rows = this.getNestedHeaderRowCount() || CONFIG.NESTED_HEADER_ROWS;
        return rows * this.#headerHeight;
    }

    /**
     * 获取表头宽度（px）
     * @returns 行头宽度
     */
    getHeaderWidth(): number {
        return this.#rowHeaderWidth ?? CONFIG.HEADER_WIDTH;
    }
}
