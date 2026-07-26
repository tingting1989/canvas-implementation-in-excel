import { isFunction, isNumber, isObject } from "../../utils/helper.js";
import { CONFIG } from "@/constants/config";

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
 *
 * 支持的配置项一览：
 * ┌──────────────────────┬──────────────────────────────────────────┐
 * │ 配置项               │ 目标                                     │
 * ├──────────────────────┼──────────────────────────────────────────┤
 * │ maxRows / maxCols    │ rowColManager.resetSize()（固定上限）     │
 * │ startRows/startCols  │ rowColManager.resetSize()（兼容旧配置）   │
 * │ colHeaders           │ headerLabelManager.colHeaders            │
 * │ rowHeaders           │ headerLabelManager.rowHeaders            │
 * │ rowHeaderWidth       │ headerLabelManager.rowHeaderWidth        │
 * │ headerHeight         │ headerLabelManager.headerHeight          │
 * │ nestedHeaders        │ headerLabelManager.nestedHeaders         │
 * │ data                 │ sheet.loadData()                         │
 * │ defaultStyle         │ sheet.setDefaultStyle()                  │
 * │ rowStyles            │ sheet.setRowStyle()（按行）               │
 * │ colStyles            │ sheet.setColStyle()（按列）               │
 * │ rangeStyles          │ sheet.setRangeStyle()（按范围）           │
 * │ rowHeights           │ rowColManager.setRowHeight()             │
 * │ colWidths            │ rowColManager.setColWidth()              │
 * │ mergeCells           │ sheet.mergeCells()                       │
 * │ conditionalStyles    │ sheet.addConditionalRule()               │
 * │ columns              │ sheet.applyColumnsConfig()               │
 * │ cell                 │ sheet.applyCellConfig()                  │
 * │ cells                │ sheet.cellsFn                            │
 * │ width / height       │ renderEngine.setCanvasSize()             │
 * │ cellPadding          │ sheet.cellPadding                        │
 * │ textOverflowEllipsis │ sheet.textOverflowEllipsis               │
 * │ readOnly             │ sheet.readOnly                           │
 * │ fixedRowsTop         │ sheet.fixedRowsTop                       │
 * │ fixedColumnsStart    │ sheet.fixedColumnsStart                  │
 * └──────────────────────┴──────────────────────────────────────────┘
 */
export class SettingsApplier {
    /**
     * 应用全部配置项到指定的 Sheet
     *
     * 按配置项逐一检查并应用，未设置的项跳过。
     * 应用顺序：行列尺寸 → 表头配置 → 数据 → 样式 → 合并/条件格式 → 列配置 → 渲染配置 → 只读/冻结
     *
     * @param {object} params - 配置参数
     * @param {import("../Sheet.js").Sheet} params.sheet - 目标工作表
     * @param {import("../../render/RenderEngine.js").RenderEngine|null} params.renderEngine - 渲染引擎（可选）
     * @param {object} params.settings - 配置项集合
     */
    static apply({ sheet, renderEngine, settings }) {
        if (settings.maxRows !== undefined || settings.maxCols !== undefined) {
            const rows = settings.maxRows || CONFIG.MAX_ROWS;
            const cols = settings.maxCols || CONFIG.MAX_COLS;
            sheet.rowColManager.resetSize(rows, cols);
        } else {
            if (settings.startRows !== undefined || settings.startCols !== undefined) {
                const rows = settings.startRows || CONFIG.DEFAULT_START_ROWS;
                const cols = settings.startCols || CONFIG.DEFAULT_START_COLS;
                sheet.rowColManager.resetSize(rows, cols);
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
        if (settings.headerHeight !== undefined) {
            sheet.headerHeight = settings.headerHeight;
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
        if ((settings.width !== null && settings.width !== undefined) || (settings.height !== null && settings.height !== undefined)) {
            renderEngine?.setCanvasSize(settings.width, settings.height);
        }

        if (settings.cellPadding !== undefined) {
            sheet.cellPadding = settings.cellPadding;
        }
        if (settings.textOverflowEllipsis !== undefined) {
            sheet.textOverflowEllipsis = settings.textOverflowEllipsis;
        }

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

    /**
     * 应用行高配置
     *
     * 支持两种形式：
     * - number：统一设置所有行的高度（按 allocatedRowCount 或默认 100 行）
     * - number[]：按索引逐行设置高度
     *
     * @param {import("../Sheet.js").Sheet} sheet - 目标工作表
     * @param {number|number[]} rowHeights - 行高配置（统一值或数组）
     */
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

    /**
     * 应用列宽配置
     *
     * 支持两种形式：
     * - number：统一设置所有列的宽度（按 allocatedColCount 或默认 26 列）
     * - number[]：按索引逐列设置宽度
     *
     * @param {import("../Sheet.js").Sheet} sheet - 目标工作表
     * @param {number|number[]} colWidths - 列宽配置（统一值或数组）
     */
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

    /**
     * 应用合并单元格配置
     *
     * 每个合并项需包含 { row, col, rowspan, colspan } 四个字段，
     * 缺少任一字段的项会被跳过。
     * 内部将 rowspan/colspan 转换为 bottomRow/bottomCol 传给 mergeCells()。
     *
     * @param {import("../Sheet.js").Sheet} sheet - 目标工作表
     * @param {Array<{row:number, col:number, rowspan:number, colspan:number}>} mergeCells - 合并单元格列表
     */
    static #applyMergeCells(sheet, mergeCells) {
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

    /**
     * 应用条件格式样式配置
     *
     * 每个条件样式项需包含 { range, condition, style } 三个字段，
     * 缺少任一字段的项会被跳过。
     *
     * @param {import("../Sheet.js").Sheet} sheet - 目标工作表
     * @param {Array<{range:object, condition:Function, style:object}>} conditionalStyles - 条件样式列表
     */
    static #applyConditionalStyles(sheet, conditionalStyles) {
        for (const cs of conditionalStyles) {
            if (!cs.range || !cs.condition || !cs.style) continue;
            sheet.addConditionalRule(cs);
        }
    }

    /**
     * 应用行样式配置
     *
     * 配置形式为 { [rowIndex]: styleObj }，遍历每个键值对调用 setRowStyle()。
     * 非对象值会被跳过。
     *
     * @param {import("../Sheet.js").Sheet} sheet - 目标工作表
     * @param {Object<number, Object>} rowStyles - 行号→样式对象的映射
     */
    static #applyRowStyles(sheet, rowStyles) {
        if (!isObject(rowStyles)) return;
        for (const [row, styleObj] of Object.entries(rowStyles)) {
            if (!styleObj || typeof styleObj !== "object") continue;
            sheet.setRowStyle(Number(row), styleObj);
        }
    }

    /**
     * 应用列样式配置
     *
     * 配置形式为 { [colIndex]: styleObj }，遍历每个键值对调用 setColStyle()。
     * 非对象值会被跳过。
     *
     * @param {import("../Sheet.js").Sheet} sheet - 目标工作表
     * @param {Object<number, Object>} colStyles - 列号→样式对象的映射
     */
    static #applyColStyles(sheet, colStyles) {
        if (!isObject(colStyles)) return;
        for (const [col, styleObj] of Object.entries(colStyles)) {
            if (!styleObj || typeof styleObj !== "object") continue;
            sheet.setColStyle(Number(col), styleObj);
        }
    }

    /**
     * 应用范围样式配置
     *
     * 配置形式为 [{ range, style }]，每个项指定一个矩形范围和对应样式。
     * 缺少 range 或 style 的项会被跳过。
     *
     * @param {import("../Sheet.js").Sheet} sheet - 目标工作表
     * @param {Array<{range:object, style:object}>} rangeStyles - 范围样式列表
     */
    static #applyRangeStyles(sheet, rangeStyles) {
        if (!Array.isArray(rangeStyles)) return;
        for (const rs of rangeStyles) {
            if (!rs.range || !rs.style) continue;
            sheet.setRangeStyle(rs.range, rs.style);
        }
    }
}
