import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "@/core/ErrorHandler.js";

import { stylePool } from "../../model/styles";
import { isFunction, isNumber, isObject } from "../../utils/utils.js";
import { CONFIG } from "@/constants/config";

/**
 * 配置应用器
 *
 * 将 Workbook 构造选项 / updateSettings 中的配置项应用到 Sheet 和 RenderEngine。
 * 将解析逻辑从 Workbook 中分离，保持 Workbook 的 Facade 职责纯粹。
 *
 * 所有方法均为静态方法，无状态，纯粹的数据转换。
 */
export class SettingsApplier {
    /**
     * 应用全部配置项到指定的 Sheet
     *
     * @param {object} params
     * @param {import("../Sheet.js").Sheet} params.sheet
     * @param {import("../../render/RenderEngine.js").RenderEngine|null} params.renderEngine
     * @param {object} params.settings
     */
    static apply({ sheet, renderEngine, settings }) {
        // errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[SettingsApplier] Applying settings to sheet "${sheet.name}":`, {
        //     maxRows: settings.maxRows,
        //     maxCols: settings.maxCols,
        //     rowHeights: settings.rowHeights?.length || "not set",
        //     columns: settings.columns?.length || "not set",
        // });

        // 使用 maxRows/maxCols 作为固定行列数的上限配置，使用该配置，则新增的行数和列数之后的总数不会超过该配置，超过该配置则忽略
        if (settings.maxRows !== undefined || settings.maxCols !== undefined) {
            const rows = settings.maxRows || CONFIG.MAX_ROWS;
            const cols = settings.maxCols || CONFIG.MAX_COLS;
            //errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[SettingsApplying] ✅ Found maxRows/maxCols! Calling resetSize(${rows}, ${cols})`);
            sheet.rowColManager.resetSize(rows, cols);
        } else {
            // 兼容旧的 startRows/startCols 配置,初始时设置默认的行数和列数，使用该配置，则可以添加行和列
            if (settings.startRows !== undefined || settings.startCols !== undefined) {
                const rows = settings.startRows || CONFIG.DEFAULT_START_ROWS;
                const cols = settings.startCols || CONFIG.DEFAULT_START_COLS;
                // errorHandler.debug(
                //     ERROR_CODE.DEBUG_LOG,
                //     `[SettingsApplying] ⚠️ Using legacy startRows/startCols! Calling resetSize(${rows}, ${cols})`,
                // );
                sheet.rowColManager.resetSize(rows, cols);
            } else {
                // errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[SettingsApplying] ℹ️ No maxRows/maxCols or startRows/startCols in settings`);
            }
        }

        if (settings.colHeaders !== undefined) {
            sheet.colHeaders = settings.colHeaders;
        }
        if (settings.rowHeaders !== undefined) {
            sheet.rowHeaders = settings.rowHeaders;
        }
        if (settings.rowHeaderWidth !== undefined) {
            sheet.rowHeaderWidth = settings.rowHeaderWidth;
        }
        if (Array.isArray(settings.nestedHeaders)) {
            sheet.nestedHeaders = settings.nestedHeaders;
        }
        if (settings.data) {
            sheet.loadData(settings.data);
        }
        if (settings.defaultStyle) {
            sheet.setDefaultStyle(settings.defaultStyle);
        }
        if (settings.rowStyles) {
            SettingsApplier.#applyRowStyles(sheet, settings.rowStyles);
        }
        if (settings.colStyles) {
            SettingsApplier.#applyColStyles(sheet, settings.colStyles);
        }
        if (settings.rangeStyles) {
            SettingsApplier.#applyRangeStyles(sheet, settings.rangeStyles);
        }
        if (settings.rowHeights !== undefined) {
            SettingsApplier.#applyRowHeights(sheet, settings.rowHeights);
        }
        if (settings.colWidths !== undefined) {
            SettingsApplier.#applyColWidths(sheet, settings.colWidths);
        }
        if (Array.isArray(settings.mergeCells)) {
            SettingsApplier.#applyMergeCells(sheet, settings.mergeCells);
        }
        if (Array.isArray(settings.conditionalStyles)) {
            SettingsApplier.#applyConditionalStyles(sheet, settings.conditionalStyles);
        }
        if (Array.isArray(settings.columns)) {
            sheet.applyColumnsConfig(settings.columns);
        }
        if (Array.isArray(settings.cell)) {
            sheet.cellConfig = settings.cell;
            sheet.applyCellConfig();
        }
        if (isFunction(settings.cells)) {
            sheet.cellsFn = settings.cells;
        }
        if (settings.width != null || settings.height != null) {
            renderEngine?.setCanvasSize(settings.width, settings.height);
        }

        // 单元格渲染配置
        if (settings.cellPadding !== undefined) {
            sheet.cellPadding = settings.cellPadding;
        }
        if (settings.textOverflowEllipsis !== undefined) {
            sheet.textOverflowEllipsis = settings.textOverflowEllipsis;
        }

        // 只读模式
        if (settings.readOnly !== undefined) {
            sheet.readOnly = settings.readOnly;
        }
        if (settings.fixedRowsTop !== undefined) {
            sheet.fixedRowsTop = settings.fixedRowsTop;
        }
        if (settings.fixedColumnsStart !== undefined) {
            sheet.fixedColumnsStart = settings.fixedColumnsStart;
        }
    }

    // ---- 私有辅助 ----

    /** @param {import("../Sheet.js").Sheet} sheet */
    static #applyRowHeights(sheet, rowHeights) {
        const rc = sheet.rowColManager;
        if (isNumber(rowHeights)) {
            const count = rc.allocatedRowCount || 100;
            rc.ensureSize(count, 0);
            for (let r = 0; r < count; r++) rc.setRowHeight(r, rowHeights);
        } else if (Array.isArray(rowHeights)) {
            rc.ensureSize(rowHeights.length, 0);
            for (let r = 0; r < rowHeights.length; r++) rc.setRowHeight(r, rowHeights[r]);
        }
    }

    /** @param {import("../Sheet.js").Sheet} sheet */
    static #applyColWidths(sheet, colWidths) {
        const rc = sheet.rowColManager;
        if (isNumber(colWidths)) {
            const count = rc.allocatedColCount || 26;
            rc.ensureSize(0, count);
            for (let c = 0; c < count; c++) rc.setColWidth(c, colWidths);
        } else if (Array.isArray(colWidths)) {
            rc.ensureSize(0, colWidths.length);
            for (let c = 0; c < colWidths.length; c++) rc.setColWidth(c, colWidths[c]);
        }
    }

    /** @param {import("../Sheet.js").Sheet} sheet */
    static #applyMergeCells(sheet, mergeCells) {
        for (const m of mergeCells) {
            if (m.row == null || m.col == null || m.rowspan == null || m.colspan == null) continue;
            sheet.mergeCells(m.row, m.col, m.row + m.rowspan - 1, m.col + m.colspan - 1);
        }
    }

    /** @param {import("../Sheet.js").Sheet} sheet */
    static #applyConditionalStyles(sheet, conditionalStyles) {
        for (const cs of conditionalStyles) {
            if (!cs.range || !cs.condition || !cs.style) continue;
            sheet.addConditionalRule(cs.range, cs.condition, stylePool.getStyleId(cs.style));
        }
    }

    /** @param {import("../Sheet.js").Sheet} sheet */
    static #applyRowStyles(sheet, rowStyles) {
        if (!isObject(rowStyles)) return;
        for (const [row, styleObj] of Object.entries(rowStyles)) {
            if (!styleObj || typeof styleObj !== "object") continue;
            sheet.setRowStyle(Number(row), styleObj);
        }
    }

    /** @param {import("../Sheet.js").Sheet} sheet */
    static #applyColStyles(sheet, colStyles) {
        if (!isObject(colStyles)) return;
        for (const [col, styleObj] of Object.entries(colStyles)) {
            if (!styleObj || typeof styleObj !== "object") continue;
            sheet.setColStyle(Number(col), styleObj);
        }
    }

    /** @param {import("../Sheet.js").Sheet} sheet */
    static #applyRangeStyles(sheet, rangeStyles) {
        if (!Array.isArray(rangeStyles)) return;
        for (const rs of rangeStyles) {
            if (!rs.range || !rs.style) continue;
            sheet.setRangeStyle(rs.range, rs.style);
        }
    }
}