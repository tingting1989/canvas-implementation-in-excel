import { stylePool } from "../styles/index.js";

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
     * @param {import("./Sheet.js").Sheet} params.sheet
     * @param {import("../render/RenderEngine.js").RenderEngine|null} params.renderEngine
     * @param {object} params.settings
     */
    static apply({ sheet, renderEngine, settings }) {
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
        if (Array.isArray(settings.cell)) {
            sheet.cellConfig = settings.cell;
            sheet.applyCellConfig();
        }
        if (typeof settings.cells === "function") {
            sheet.cellsFn = settings.cells;
        }
        if (Array.isArray(settings.columns)) {
            sheet.applyColumnsConfig(settings.columns);
        }
        if (Array.isArray(settings.cellTypes)) {
            SettingsApplier.#applyCellTypes(sheet, settings.cellTypes);
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
        if (settings.fixedRowsTop !== undefined) {
            sheet.fixedRowsTop = settings.fixedRowsTop;
        }
        if (settings.fixedColumnsStart !== undefined) {
            sheet.fixedColumnsStart = settings.fixedColumnsStart;
        }
    }

    // ---- 私有辅助 ----

    /** @param {import("./Sheet.js").Sheet} sheet */
    static #applyRowHeights(sheet, rowHeights) {
        const rc = sheet.rowColManager;
        if (typeof rowHeights === "number") {
            const count = rc.allocatedRowCount || 100;
            rc.ensureSize(count, 0);
            for (let r = 0; r < count; r++) rc.setRowHeight(r, rowHeights);
        } else if (Array.isArray(rowHeights)) {
            rc.ensureSize(rowHeights.length, 0);
            for (let r = 0; r < rowHeights.length; r++) rc.setRowHeight(r, rowHeights[r]);
        }
    }

    /** @param {import("./Sheet.js").Sheet} sheet */
    static #applyColWidths(sheet, colWidths) {
        const rc = sheet.rowColManager;
        if (typeof colWidths === "number") {
            const count = rc.allocatedColCount || 26;
            rc.ensureSize(0, count);
            for (let c = 0; c < count; c++) rc.setColWidth(c, colWidths);
        } else if (Array.isArray(colWidths)) {
            rc.ensureSize(0, colWidths.length);
            for (let c = 0; c < colWidths.length; c++) rc.setColWidth(c, colWidths[c]);
        }
    }

    /** @param {import("./Sheet.js").Sheet} sheet */
    static #applyMergeCells(sheet, mergeCells) {
        for (const m of mergeCells) {
            if (m.row == null || m.col == null || m.rowspan == null || m.colspan == null) continue;
            sheet.mergeCells(m.row, m.col, m.row + m.rowspan - 1, m.col + m.colspan - 1);
        }
    }

    /** @param {import("./Sheet.js").Sheet} sheet */
    static #applyConditionalStyles(sheet, conditionalStyles) {
        for (const cs of conditionalStyles) {
            if (!cs.range || !cs.condition || !cs.style) continue;
            sheet.addConditionalRule(cs.range, cs.condition, stylePool.getStyleId(cs.style));
        }
    }

    /** @param {import("./Sheet.js").Sheet} sheet */
    static #applyCellTypes(sheet, cellTypes) {
        for (const ct of cellTypes) {
            if (ct.row == null || ct.col == null || !ct.type) continue;
            const { row, col, type: name, ...rest } = ct;
            sheet.cellTypes.set(`${row},${col}`, { name, options: rest });
        }
    }
}