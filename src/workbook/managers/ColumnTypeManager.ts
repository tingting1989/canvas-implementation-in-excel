import {
    getColumnTypeInstance,
    resolveColumnTypeFromConfig,
    resolveCellTypeFromPosition,
    extractColumnTypeOptions,
    formatCellValue as formatCellValueInternal,
    parseCellValue as parseCellValueInternal,
    validateCellValue as validateCellValueInternal,
} from "../../types/index";
import { isFunction, isObject } from "../../utils/helper";
import { errorHandler } from "../../core/ErrorHandler";
import { ERROR_CODE } from "../../constants/errorCodes";
import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import type { Sheet } from "../Sheet";
import type { BaseColumnType } from "../../types/BaseColumnType";
import type { ColumnConfig } from "../interfaces/ISheet";

/**
 * 列类型管理器
 *
 * 负责管理单个工作表（Sheet）的列类型体系，包括：
 * - 列配置的读取与查询（getColumnConfig / getColumnType）
 * - 列类型实例的创建（getColumnTypeInstance / getCellTypeInstance）
 * - 列配置的应用（applyColumnsConfig）：将 columns 数组解析到 columnsConfig、colStyles、列宽等
 * - 单元格值的格式化、验证、解析（委托 BaseColumnType 实例）
 *
 * 类型解析优先级（getCellTypeInstance）：
 *   单元格级别类型（cellTypes） → 列级别类型（columnsConfig） → 默认 text 类型
 *
 * @class ColumnTypeManager
 */
export class ColumnTypeManager {
    /** 工作表引用 */
    #sheet: Sheet;
    /** 列配置映射表（列号 → 配置对象） */
    #columnsConfig: Map<number, ColumnConfig & Record<string, unknown>> = new Map();
    /** 单元格类型映射表（"r,c" → { name, options }） */
    #cellTypes: Map<string, { name: string; options: Record<string, unknown> }> = new Map();
    /**
     * 桥接器已接管的列集合
     *
     * 仅当列号在此集合中时，validateCellValue() 才降级为仅提示。
     * 由 ColumnTypeValidationBridge 通过 markBridgeTaken/unmarkBridgeTaken 管理。
     */
    #bridgeTakenCols: Set<number> = new Set();

    /**
     * @param sheet - 工作表实例
     */
    constructor(sheet: Sheet) {
        this.#sheet = sheet;
    }

    /**
     * 获取列配置映射表
     * @returns 列号到配置对象的 Map
     */
    get columnsConfig(): Map<number, ColumnConfig & Record<string, unknown>> {
        return this.#columnsConfig;
    }

    /**
     * 获取单元格类型映射表
     * @returns "r,c" 到类型信息的 Map
     */
    get cellTypes(): Map<string, { name: string; options: Record<string, unknown> }> {
        return this.#cellTypes;
    }

    /**
     * 获取列配置
     * @param col - 列号
     * @returns 列配置对象，未配置返回 null
     */
    getColumnConfig(col: number): (ColumnConfig & Record<string, unknown>) | null {
        return this.#columnsConfig.get(col) || null;
    }

    /**
     * 获取列类型名称
     * @param col - 列号
     * @returns 类型名称，默认 "text"
     */
    getColumnType(col: number): string {
        return this.#columnsConfig.get(col)?.type || "text";
    }

    /**
     * 检查列类型一致性
     *
     * 遍历 [topCol, bottomCol] 范围，检查所有列是否为同一类型。
     * 用于合并单元格前置校验。
     *
     * @param topCol - 起始列号
     * @param bottomCol - 结束列号
     * @returns 是否一致
     */
    checkColumnTypeConsistency(topCol: number, bottomCol: number): boolean {
        const firstType = this.getColumnType(topCol);
        for (let c = topCol + 1; c <= bottomCol; c++) {
            if (this.getColumnType(c) !== firstType) return false;
        }
        return true;
    }

    /**
     * 获取列类型实例
     *
     * 根据列配置创建对应的 BaseColumnType 子类实例。
     *
     * @param col - 列号
     * @returns 列类型实例
     */
    getColumnTypeInstance(col: number): BaseColumnType {
        return resolveColumnTypeFromConfig(this.#columnsConfig.get(col))!;
    }

    /**
     * 获取单元格类型实例
     *
     * 查找优先级：
     * 1. 动态属性（cellsFn）的 type 字段
     * 2. 单元格级类型（cellTypes Map）
     * 3. 列级类型（columnsConfig Map）
     * 4. 默认 text 类型
     *
     * @param r - 行号
     * @param c - 列号
     * @returns 类型实例
     */
    getCellTypeInstance(r: number, c: number): BaseColumnType {
        const cellProps = this.#sheet.resolveCellProperties(r, c);
        if (cellProps?.type) {
            const { type: name, ...rest } = cellProps;
            return getColumnTypeInstance(name, extractColumnTypeOptions(rest))!;
        }

        return resolveCellTypeFromPosition(r, c, this.#cellTypes, this.#columnsConfig)!;
    }

    /**
     * 应用列配置数组
     *
     * 解析 columns 数组，逐列设置：
     * - 列配置对象（存入 columnsConfig）
     * - 列宽（rowColManager.setColWidth）
     * - 列样式（sheet.setColStyle）
     * - 禁用/只读标记
     *
     * 支持函数式配置：columns[i] 可以是 (col) => config 的函数。
     *
     * @param columnsConfig - 列配置数组，元素为配置对象或函数
     */
    applyColumnsConfig(columnsConfig: (Record<string, unknown> | ((col: number) => Record<string, unknown>))[]): void {
        if (!Array.isArray(columnsConfig)) return;

        for (let c = 0; c < columnsConfig.length; c++) {
            let config: Record<string, unknown> | undefined = columnsConfig[c] as Record<string, unknown>;

            if (isFunction(config)) {
                try {
                    config = (config as (col: number) => Record<string, unknown>)(c);
                } catch (error) {
                    errorHandler.error(ERROR_CODE.TYPE_PARSE_ERROR, `Column config function failed at column ${c}`, { originalError: error });
                    continue;
                }
            }

            if (!config || !isObject(config)) continue;

            this.#columnsConfig.set(c, config);

            if (config.width != null) {
                this.#sheet.rowColManager.setColWidth(c, config.width as number);
            }

            if (config.style) {
                this.#sheet.setColStyle(c, config.style as Record<string, unknown>);
            }

            if (config.disabled === true || config.readOnly === true) {
                this.#sheet.rowColManager.ensureSize(1, c + 1);
            }
        }

        this.#sheet.bus?.emit(SHEET_EVENTS.COLUMN_CONFIG_CHANGED, {
            columnsConfig: this.#columnsConfig,
        });
    }

    /**
     * 格式化单元格值为显示文本
     *
     * 通过 getCellTypeInstance 获取类型实例，调用其 format() 方法。
     *
     * @param r - 行号
     * @param c - 列号
     * @param value - 原始值
     * @returns 格式化后的字符串
     */
    formatCellValue(r: number, c: number, value: unknown): string {
        return formatCellValueInternal(this.getCellTypeInstance(r, c), value);
    }

    /**
     * 验证单元格值
     *
     * 降级逻辑：
     * - validation 存在 + 桥接器已接管 → 仅提示（DataValidationPlugin 负责拦截）
     * - validation 存在 + 桥接器未接管 → 正常阻止（列类型验证兜底）
     * - validation 不存在 → 正常行为
     *
     * @param r - 行号
     * @param c - 列号
     * @param value - 待验证值
     * @returns true 表示通过，string 表示错误消息
     */
    validateCellValue(r: number, c: number, value: unknown): boolean | string {
        const result = validateCellValueInternal(this.getCellTypeInstance(r, c), value, this.#columnsConfig.get(c));
        const config = this.#columnsConfig.get(c);

        if (config?.validation && this.#bridgeTakenCols.has(c) && result !== true) {
            return typeof result === "string" ? result : "invalid";
        }

        return result;
    }

    /**
     * 标记桥接器已接管指定列的验证
     *
     * 调用后，该列的 validateCellValue() 将降级为仅提示（不阻止提交），
     * 验证拦截由 DataValidationPlugin 统一处理。
     *
     * @param col - 列号
     */
    markBridgeTaken(col: number): void {
        this.#bridgeTakenCols.add(col);
    }

    /**
     * 取消桥接器对指定列的接管
     *
     * 调用后，该列的 validateCellValue() 恢复正常行为（阻止无效值提交）。
     *
     * @param col - 列号
     */
    unmarkBridgeTaken(col: number): void {
        this.#bridgeTakenCols.delete(col);
    }

    /**
     * 清除所有桥接器接管标记
     *
     * 用于桥接器停用/销毁时批量恢复列类型验证。
     */
    clearBridgeTaken(): void {
        this.#bridgeTakenCols.clear();
    }

    /**
     * 查询指定列是否被桥接器接管
     *
     * @param col - 列号
     * @returns 是否被桥接器接管
     */
    isBridgeTaken(col: number): boolean {
        return this.#bridgeTakenCols.has(col);
    }

    /**
     * 解析用户输入为目标类型值
     *
     * 通过类型实例的 parse() 方法转换。
     *
     * @param r - 行号
     * @param c - 列号
     * @param input - 用户输入字符串
     * @returns 解析后的值
     */
    parseCellValue(r: number, c: number, input: string): unknown {
        return parseCellValueInternal(this.getCellTypeInstance(r, c), input);
    }
}
