import { isFunction, isNumber, isObject } from "../../utils/helper";
import { CONFIG } from "../../constants/config";
import type { Sheet } from "../Sheet";
import type { RenderEngine } from "../../render/RenderEngine";
import type { StyleObject, CellConfigItem } from "../interfaces/ISheet";
import type { CellRange } from "../../model/types";

/**
 * 配置应用器
 *
 * 将 Workbook 构造选项 / updateSettings 中的配置项应用到 Sheet 和 RenderEngine。
 * 将解析逻辑从 Workbook 中分离，保持 Workbook 的 Facade 职责纯粹。
 *
 * 设计原则：
 * - 所有方法均为静态方法，无状态，纯粹的数据转换
 * - 每个配置项对应一个应用逻辑分支，互不耦合
 * - 复杂配置项提取为私有辅助方法（#applyRowHeights 等）
 */
export class SettingsApplier {
    static apply({ sheet, renderEngine, settings }: { sheet: Sheet; renderEngine: RenderEngine | null; settings: Record<string, unknown> }): void {
        if (settings.maxRows !== undefined || settings.maxCols !== undefined) {
            const rows = (settings.maxRows as number) || CONFIG.MAX_ROWS;
            const cols = (settings.maxCols as number) || CONFIG.MAX_COLS;
            sheet.rowColManager.resetSize(rows, cols);
        } else {
            if (settings.startRows !== undefined || settings.startCols !== undefined) {
                const rows = (settings.startRows as number) || CONFIG.DEFAULT_START_ROWS;
                const cols = (settings.startCols as number) || CONFIG.DEFAULT_START_COLS;
                sheet.rowColManager.resetSize(rows, cols);
            }
        }

        if (settings.colHeaders !== undefined) {
            sheet.colHeaders = settings.colHeaders as boolean | string[] | ((index: number) => string);
        }
        if (settings.rowHeaders !== undefined) {
            sheet.rowHeaders = settings.rowHeaders as boolean | string[] | ((index: number) => string);
        }
        if (settings.rowHeaderWidth !== undefined) {
            sheet.rowHeaderWidth = settings.rowHeaderWidth as number;
        }
        if (settings.headerHeight !== undefined) {
            sheet.headerHeight = settings.headerHeight as number;
        }
        if (Array.isArray(settings.nestedHeaders)) {
            sheet.nestedHeaders = settings.nestedHeaders as (string | Record<string, unknown>)[][];
        }
        if (settings.data) {
            sheet.loadData(settings.data as unknown[][]);
        }
        if (settings.defaultStyle) {
            sheet.setDefaultStyle(settings.defaultStyle as StyleObject);
        }
        if (settings.rowStyles) {
            SettingsApplier.#applyRowStyles(sheet, settings.rowStyles as Record<string, StyleObject>);
        }
        if (settings.colStyles) {
            SettingsApplier.#applyColStyles(sheet, settings.colStyles as Record<string, StyleObject>);
        }
        if (settings.rangeStyles) {
            SettingsApplier.#applyRangeStyles(sheet, settings.rangeStyles as { range: CellRange; style: StyleObject }[]);
        }
        if (settings.rowHeights !== undefined) {
            SettingsApplier.#applyRowHeights(sheet, settings.rowHeights as number | number[]);
        }
        if (settings.colWidths !== undefined) {
            SettingsApplier.#applyColWidths(sheet, settings.colWidths as number | number[]);
        }
        if (Array.isArray(settings.mergeCells)) {
            SettingsApplier.#applyMergeCells(sheet, settings.mergeCells as { row: number; col: number; rowspan: number; colspan: number }[]);
        }
        if (Array.isArray(settings.conditionalStyles)) {
            SettingsApplier.#applyConditionalStyles(
                sheet,
                settings.conditionalStyles as { range: CellRange; condition: (value: unknown, cell?: unknown) => boolean; style: StyleObject }[],
            );
        }
        if (Array.isArray(settings.columns)) {
            sheet.applyColumnsConfig(settings.columns as Record<string, unknown>[]);
        }
        if (Array.isArray(settings.cell)) {
            sheet.cellConfig = settings.cell as CellConfigItem[];
            sheet.applyCellConfig();
        }
        if (isFunction(settings.cells)) {
            sheet.cellsFn = settings.cells as (r: number, c: number) => Record<string, unknown> | null;
        }
        if ((settings.width !== null && settings.width !== undefined) || (settings.height !== null && settings.height !== undefined)) {
            renderEngine?.setCanvasSize(settings.width as number, settings.height as number);
        }

        if (settings.cellPadding !== undefined) {
            sheet.cellPadding = settings.cellPadding as number;
        }
        if (settings.textOverflowEllipsis !== undefined) {
            sheet.textOverflowEllipsis = settings.textOverflowEllipsis as boolean;
        }

        if (settings.readOnly !== undefined) {
            sheet.readOnly = settings.readOnly as boolean;
        }
        if (settings.fixedRowsTop !== undefined) {
            sheet.fixedRowsTop = settings.fixedRowsTop as number;
        }
        if (settings.fixedColumnsStart !== undefined) {
            sheet.fixedColumnsStart = settings.fixedColumnsStart as number;
        }
    }

    static #applyRowHeights(sheet: Sheet, rowHeights: number | number[]): void {
        const rc = sheet.rowColManager;
        if (isNumber(rowHeights)) {
            const count = rc.allocatedRowCount || 100;
            rc.ensureSize(count, 0);
            for (let r = 0; r < count; r++) rc.setRowHeight(r, rowHeights as number);
        } else if (Array.isArray(rowHeights)) {
            rc.ensureSize(rowHeights.length, 0);
            for (let r = 0; r < rowHeights.length; r++) rc.setRowHeight(r, rowHeights[r]);
        }
    }

    static #applyColWidths(sheet: Sheet, colWidths: number | number[]): void {
        const rc = sheet.rowColManager;
        if (isNumber(colWidths)) {
            const count = rc.allocatedColCount || 26;
            rc.ensureSize(0, count);
            for (let c = 0; c < count; c++) rc.setColWidth(c, colWidths as number);
        } else if (Array.isArray(colWidths)) {
            rc.ensureSize(0, colWidths.length);
            for (let c = 0; c < colWidths.length; c++) rc.setColWidth(c, colWidths[c]);
        }
    }

    static #applyMergeCells(sheet: Sheet, mergeCells: { row: number; col: number; rowspan: number; colspan: number }[]): void {
        for (const m of mergeCells) {
            if (
                m.row === null ||
                m.row === undefined ||
                m.col === null ||
                m.col === undefined ||
                m.rowspan === null ||
                m.rowspan === undefined ||
                m.colspan === null ||
                m.colspan === undefined
            )
                continue;
            sheet.mergeCells(m.row, m.col, m.row + m.rowspan - 1, m.col + m.colspan - 1);
        }
    }

    static #applyConditionalStyles(
        sheet: Sheet,
        conditionalStyles: { range: CellRange; condition: (value: unknown, cell?: unknown) => boolean; style: StyleObject }[],
    ): void {
        for (const cs of conditionalStyles) {
            if (!cs.range || !cs.condition || !cs.style) continue;
            sheet.addConditionalRule(cs);
        }
    }

    static #applyRowStyles(sheet: Sheet, rowStyles: Record<string, StyleObject>): void {
        if (!isObject(rowStyles)) return;
        for (const [row, styleObj] of Object.entries(rowStyles)) {
            if (!styleObj || typeof styleObj !== "object") continue;
            sheet.setRowStyle(Number(row), styleObj);
        }
    }

    static #applyColStyles(sheet: Sheet, colStyles: Record<string, StyleObject>): void {
        if (!isObject(colStyles)) return;
        for (const [col, styleObj] of Object.entries(colStyles)) {
            if (!styleObj || typeof styleObj !== "object") continue;
            sheet.setColStyle(Number(col), styleObj);
        }
    }

    static #applyRangeStyles(sheet: Sheet, rangeStyles: { range: CellRange; style: StyleObject }[]): void {
        if (!Array.isArray(rangeStyles)) return;
        for (const rs of rangeStyles) {
            if (!rs.range || !rs.style) continue;
            sheet.setRangeStyle(rs.range, rs.style);
        }
    }
}
