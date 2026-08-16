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
 */
export class ColumnTypeManager {
    #sheet: Sheet;
    #columnsConfig: Map<number, ColumnConfig & Record<string, unknown>> = new Map();
    #cellTypes: Map<string, { name: string; options: Record<string, unknown> }> = new Map();

    constructor(sheet: Sheet) {
        this.#sheet = sheet;
    }

    get columnsConfig(): Map<number, ColumnConfig & Record<string, unknown>> {
        return this.#columnsConfig;
    }

    get cellTypes(): Map<string, { name: string; options: Record<string, unknown> }> {
        return this.#cellTypes;
    }

    getColumnConfig(col: number): (ColumnConfig & Record<string, unknown>) | null {
        return this.#columnsConfig.get(col) || null;
    }

    getColumnType(col: number): string {
        return this.#columnsConfig.get(col)?.type || "text";
    }

    checkColumnTypeConsistency(topCol: number, bottomCol: number): boolean {
        const firstType = this.getColumnType(topCol);
        for (let c = topCol + 1; c <= bottomCol; c++) {
            if (this.getColumnType(c) !== firstType) return false;
        }
        return true;
    }

    getColumnTypeInstance(col: number): BaseColumnType {
        return resolveColumnTypeFromConfig(this.#columnsConfig.get(col));
    }

    getCellTypeInstance(r: number, c: number): BaseColumnType {
        const cellProps = this.#sheet.resolveCellProperties(r, c);
        if (cellProps?.type) {
            const { type: name, ...rest } = cellProps;
            return getColumnTypeInstance(name, extractColumnTypeOptions(rest));
        }

        return resolveCellTypeFromPosition(r, c, this.#cellTypes, this.#columnsConfig);
    }

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
    }

    formatCellValue(r: number, c: number, value: unknown): string {
        return formatCellValueInternal(this.getCellTypeInstance(r, c), value);
    }

    validateCellValue(r: number, c: number, value: unknown): boolean | string {
        return validateCellValueInternal(this.getCellTypeInstance(r, c), value, this.#columnsConfig.get(c));
    }

    parseCellValue(r: number, c: number, input: string): unknown {
        return parseCellValueInternal(this.getCellTypeInstance(r, c), input);
    }
}
