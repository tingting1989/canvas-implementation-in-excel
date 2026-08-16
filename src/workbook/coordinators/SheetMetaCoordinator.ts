import { stylePool } from "../../model/styles";
import { Cell } from "../../model/store/Cell";
import { errorHandler } from "../../core/ErrorHandler";
import { extractColumnTypeOptions } from "../../types/index";
import type { ISheet } from "../interfaces/ISheet";
import { ERROR_CODE } from "../../constants/errorCodes";
import type { StyleObject, CellProperties } from "../interfaces/ISheet";

/**
 * 工作表元数据协调者
 *
 * 负责：
 * - 表头标签（行/列头文本、样式、嵌套表头）
 * - 列类型配置（数字、文本、日期、复选框等）
 * - 类型系统（格式化、验证、解析）
 * - 单元格静态/动态配置（cell 数组 / cellsFn 函数）
 * - 列类型一致性检查（合并单元格前置校验）
 *
 * 设计特点：
 * - 表头、列类型、单元格配置的读写都经过此协调者
 * - 通过 ISheet 接口解耦对具体实现的依赖
 * - resolveCellProperties 带异常保护，避免 cellsFn 抛错导致崩溃
 *
 * @class SheetMetaCoordinator
 */
export class SheetMetaCoordinator {
    /** 工作表接口引用 */
    #sheet: ISheet;

    /**
     * @param sheet - 工作表接口实例
     */
    constructor(sheet: ISheet) {
        this.#sheet = sheet;
    }

    /** 获取表头标签管理器（私有访问器） */
    get #headerLabels() {
        return this.#sheet.headerLabels;
    }

    /** 获取列类型管理器（私有访问器） */
    get #typeManager() {
        return this.#sheet.typeManager;
    }

    // ─── 表头标签 ──────────────────────────────────────

    /** 获取列头配置 */
    get colHeaders() {
        return this.#headerLabels.colHeaders;
    }

    /**
     * 设置列头配置
     *
     * 支持类型：
     * - boolean: true 显示默认列头（A, B, C...），false 隐藏
     * - string[]: 自定义列头文本
     * - ((index: number) => string): 动态列头函数
     * - Record<string, unknown>[]: 带样式的列头对象数组
     * - null: 重置为默认
     */
    set colHeaders(v: unknown) {
        this.#headerLabels.colHeaders = v as boolean | string[] | ((index: number) => string) | Record<string, unknown>[] | null;
    }

    /**
     * 获取列头标签文本
     * @param col - 列号
     * @returns 列头文本
     */
    getColHeader(col: number): string {
        return this.#headerLabels.getColHeader(col);
    }

    /**
     * 获取列头样式
     * @param col - 列号
     * @returns 样式对象，无样式返回 null
     */
    getColHeaderStyle(col: number): Record<string, unknown> | null {
        return this.#headerLabels.getColHeaderStyle(col);
    }

    /** 获取行头配置 */
    get rowHeaders() {
        return this.#headerLabels.rowHeaders;
    }

    /**
     * 设置行头配置（类型同 colHeaders）
     */
    set rowHeaders(v: unknown) {
        this.#headerLabels.rowHeaders = v as boolean | string[] | ((index: number) => string) | Record<string, unknown>[] | null;
    }

    /**
     * 获取行头标签文本
     * @param row - 行号
     * @returns 行头文本
     */
    getRowHeader(row: number): string {
        return this.#headerLabels.getRowHeader(row);
    }

    /**
     * 获取行头样式
     * @param row - 行号
     * @returns 样式对象，无样式返回 null
     */
    getRowHeaderStyle(row: number): Record<string, unknown> | null {
        return this.#headerLabels.getRowHeaderStyle(row);
    }

    /** 获取嵌套表头配置 */
    get nestedHeaders() {
        return this.#headerLabels.nestedHeaders;
    }

    /**
     * 设置嵌套表头配置
     *
     * 嵌套表头是多行表头，每行由标签数组组成。
     * 每个标签可以是字符串或带 label/colspan/style 的对象。
     */
    set nestedHeaders(v: unknown) {
        this.#headerLabels.nestedHeaders = v as (string | { label?: string; colspan?: number; style?: Record<string, unknown> })[][] | null;
    }

    /**
     * 获取嵌套表头行数
     * @returns 嵌套表头行数，无嵌套返回 0
     */
    getNestedHeaderRowCount(): number {
        return this.#headerLabels.getNestedHeaderRowCount();
    }

    /**
     * 获取嵌套列头信息
     * @param rowIndex - 嵌套行索引（从 0 开始）
     * @param col - 列号
     * @returns 标签、跨列数和可选样式
     */
    getNestedColHeader(rowIndex: number, col: number): { label: string; colspan: number; style?: Record<string, unknown> } | null {
        return this.#headerLabels.getNestedColHeader(rowIndex, col);
    }

    /** 获取行头宽度（px） */
    get rowHeaderWidth() {
        return this.#headerLabels.rowHeaderWidth;
    }

    /** 设置行头宽度（px） */
    set rowHeaderWidth(v: number) {
        this.#headerLabels.rowHeaderWidth = v;
    }

    /**
     * 获取表头高度（px）
     * @returns 表头高度
     */
    getHeaderHeight(): number {
        return this.#headerLabels.getHeaderHeight();
    }

    /** 获取表头高度属性（px） */
    get headerHeight() {
        return this.#headerLabels.headerHeight;
    }

    /** 设置表头高度（px） */
    set headerHeight(v: number) {
        this.#headerLabels.headerHeight = v;
    }

    /**
     * 获取表头宽度（px）
     * @returns 表头宽度
     */
    getHeaderWidth(): number {
        return this.#headerLabels.getHeaderWidth();
    }

    // ─── 列类型系统 ────────────────────────────────────

    /** 获取列配置映射表 */
    get columnsConfig() {
        return this.#typeManager.columnsConfig;
    }

    /** 获取单元格类型映射表（键为 "r,c"） */
    get cellTypes() {
        return this.#typeManager.cellTypes;
    }

    /**
     * 获取列配置
     * @param col - 列号
     * @returns 列配置对象，未配置返回 null
     */
    getColumnConfig(col: number) {
        return this.#typeManager.getColumnConfig(col);
    }

    /**
     * 获取列类型名称
     * @param col - 列号
     * @returns 类型名称，默认 "text"
     */
    getColumnType(col: number): string {
        return this.#typeManager.getColumnType(col);
    }

    /**
     * 检查列类型一致性
     *
     * 用于合并单元格前置校验：区域内所有列必须为同一类型。
     *
     * @param topCol - 起始列号
     * @param bottomCol - 结束列号
     * @returns 是否一致
     */
    _checkColumnTypeConsistency(topCol: number, bottomCol: number): boolean {
        return this.#typeManager.checkColumnTypeConsistency(topCol, bottomCol);
    }

    /**
     * 获取列类型实例
     * @param col - 列号
     * @returns 列类型实例
     */
    getColumnTypeInstance(col: number) {
        return this.#typeManager.getColumnTypeInstance(col);
    }

    /**
     * 获取单元格类型实例
     *
     * 查找优先级：单元格级类型 → 列级类型 → 默认 text 类型
     *
     * @param r - 行号
     * @param c - 列号
     * @returns 类型实例
     */
    getCellTypeInstance(r: number, c: number) {
        return this.#typeManager.getCellTypeInstance(r, c);
    }

    /**
     * 应用列配置数组
     *
     * 解析 columns 数组，设置列宽、类型、样式等配置。
     *
     * @param columnsConfig - 列配置数组
     */
    applyColumnsConfig(columnsConfig: Record<string, unknown>[]): void {
        this.#typeManager.applyColumnsConfig(columnsConfig);
        this.#sheet.invalidateAll();
    }

    /**
     * 格式化单元格值为显示文本
     *
     * 通过列类型实例的 format() 方法转换。
     *
     * @param r - 行号
     * @param c - 列号
     * @param value - 原始值
     * @returns 格式化后的字符串
     */
    formatCellValue(r: number, c: number, value: unknown): string {
        return this.#typeManager.formatCellValue(r, c, value);
    }

    /**
     * 验证单元格值
     *
     * 通过列类型实例的 validate() 方法检查。
     *
     * @param r - 行号
     * @param c - 列号
     * @param value - 待验证值
     * @returns true 表示通过，string 表示错误消息
     */
    validateCellValue(r: number, c: number, value: unknown): boolean | string {
        return this.#typeManager.validateCellValue(r, c, value);
    }

    /**
     * 解析用户输入为目标类型值
     *
     * 通过列类型实例的 parse() 方法转换。
     *
     * @param r - 行号
     * @param c - 列号
     * @param input - 用户输入字符串
     * @returns 解析后的值
     */
    parseCellValue(r: number, c: number, input: string): unknown {
        return this.#typeManager.parseCellValue(r, c, input);
    }

    // ─── 单元格配置 ────────────────────────────────────

    /**
     * 应用静态单元格配置（cell 数组）
     *
     * 遍历 cellConfig 数组，逐项应用：
     * 1. 设置单元格级类型（type + typeOptions）
     * 2. 合并样式（与已有样式合并）
     * 3. 设置值、禁用/只读状态
     *
     * 注意：此操作不记录命令历史（初始化阶段调用）。
     */
    applyCellConfig(): void {
        for (const item of this.#sheet.cellConfig) {
            if (item.row == null || item.col == null) continue;

            const { row: r, col: c, value, style, disabled, readOnly, type, ...typeOptions } = item;

            this.#sheet.rowColManager.ensureSize(r + 1, c + 1);

            if (type) {
                this.#typeManager.cellTypes.set(`${r},${c}`, {
                    name: type,
                    options: extractColumnTypeOptions(typeOptions),
                });
            }

            const cell = this.#sheet.cellStore.get(r, c);
            const existingStyleId = cell?.styleId || 0;
            const existingStyle = existingStyleId ? stylePool.getStyle(existingStyleId) : {};
            const mergedStyle = style ? { ...existingStyle, ...style } : existingStyle;
            const newStyleId = stylePool.getStyleId(mergedStyle);

            const isDisabled = disabled ?? readOnly ?? cell?.disabled ?? false;
            const cellValue = value !== undefined ? value : (cell?.value ?? "");

            this.#sheet.cellStore.set(r, c, new Cell(cellValue, newStyleId, isDisabled, cell?.formula));

            if (disabled === true || readOnly === true) {
                const updatedCell = this.#sheet.cellStore.get(r, c);
                if (updatedCell && !updatedCell.disabled) {
                    this.#sheet.cellStore.set(r, c, new Cell(updatedCell.value, updatedCell.styleId, true, updatedCell.formula));
                }
            }
        }

        this.#sheet.invalidateAll();
    }

    /**
     * 解析动态单元格属性
     *
     * 调用 cellsFn(r, c) 获取运行时动态属性。
     * 带异常保护：cellsFn 抛错时记录错误并返回 null，
     * 避免单个单元格的异常导致整个渲染崩溃。
     *
     * @param r - 行号
     * @param c - 列号
     * @returns 属性对象，无动态属性或执行失败返回 null
     */
    resolveCellProperties(r: number, c: number): CellProperties | null {
        if (typeof this.#sheet.cellsFn !== "function") return null;

        try {
            return this.#sheet.cellsFn(r, c);
        } catch (error) {
            errorHandler.error(ERROR_CODE.CELL_INVALID_DATA, `cellsFn execution failed at (${r},${c})`, { originalError: error });
            return null;
        }
    }
}
