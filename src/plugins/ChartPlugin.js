import { BasePlugin } from "./BasePlugin.js";
import { ChartModel, CHART_TYPE } from "@/model/chart/ChartModel";
import { ChartManager } from "@/model/chart/ChartManager";
import { ChartSelectionStrategy } from "@/editor/strategies";
import { HOOKS } from "@/constants/hookNames";
import { SHEET_EVENTS } from "@/constants/sheetEvents";
import { CONFIG } from "@/constants/config.js";

export class ChartPlugin extends BasePlugin {
    static PLUGIN_NAME = "chart";

    init(options = {}) {
        super.init(options);
        this.#attachToSheets();
        this.addStrategy("chartSelection", new ChartSelectionStrategy(this.eventHandler));
        this.#listenEvents();
    }

    #attachToSheets() {
        const sheetsMap = this.workbook?.sheets;
        if (!sheetsMap) return;
        for (const sheet of sheetsMap.values()) {
            if (!sheet.chartManager) {
                sheet.chartManager = new ChartManager(sheet);
            }
        }
    }

    #listenEvents() {
        if (this.workbook?.bus) {
            this.workbook.bus.on(SHEET_EVENTS.SHEET_SWITCHED, () => {
                const sheet = this.workbook.activeSheet;
                if (sheet && !sheet.chartManager) {
                    sheet.chartManager = new ChartManager(sheet);
                }
            });
        }
    }

    addChart(type, dataRange, options = {}) {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) {
            return null;
        }

        let anchorRow = options.anchorRow ?? 0;
        let anchorCol = options.anchorCol ?? 0;
        const merge = sheet.getMerge?.(anchorRow, anchorCol);
        if (merge) {
            anchorRow = merge.topRow;
            anchorCol = merge.topCol;
        }
        const chart = new ChartModel({
            type,
            dataRange,
            anchorRow,
            anchorCol,
            ...options,
        });
        this.#clampToFrozenBoundary(chart, sheet);
        sheet.chartManager.add(chart);
        this.hooks?.runHooks(HOOKS.AFTER_CHART_ADD, chart);
        this.render();
        return chart;
    }

    addBarChart(dataRange, options = {}) {
        return this.addChart(CHART_TYPE.BAR, dataRange, options);
    }

    addLineChart(dataRange, options = {}) {
        return this.addChart(CHART_TYPE.LINE, dataRange, options);
    }

    addPieChart(dataRange, options = {}) {
        return this.addChart(CHART_TYPE.PIE, dataRange, options);
    }

    addAreaChart(dataRange, options = {}) {
        return this.addChart(CHART_TYPE.AREA, dataRange, options);
    }

    addScatterChart(dataRange, options = {}) {
        return this.addChart(CHART_TYPE.SCATTER, dataRange, options);
    }

    removeChart(id) {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return null;
        const chart = sheet.chartManager.remove(id);
        if (chart) {
            this.hooks?.runHooks(HOOKS.AFTER_CHART_REMOVE, id);
            this.render();
        }
        return chart;
    }

    updateChartStyle(id, styleUpdate) {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return null;
        const chart = sheet.chartManager.update(id, { style: styleUpdate });
        if (chart) {
            this.hooks?.runHooks(HOOKS.AFTER_CHART_UPDATE, id);
            this.render();
        }
        return chart;
    }

    updateChartDataRange(id, dataRange) {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return null;
        const chart = sheet.chartManager.update(id, { dataRange });
        if (chart) {
            this.hooks?.runHooks(HOOKS.AFTER_CHART_UPDATE, id);
            this.render();
        }
        return chart;
    }

    moveChart(id, anchorRow, anchorCol, offsetX, offsetY) {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return null;
        const updates = {};
        if (anchorRow !== undefined) updates.anchorRow = anchorRow;
        if (anchorCol !== undefined) updates.anchorCol = anchorCol;
        if (offsetX !== undefined) updates.offsetX = offsetX;
        if (offsetY !== undefined) updates.offsetY = offsetY;
        const chart = sheet.chartManager.update(id, updates);
        if (chart) {
            this.#clampToFrozenBoundary(chart, sheet);
            this.render();
        }
        return chart;
    }

    resizeChart(id, width, height) {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return null;
        const chart = sheet.chartManager.update(id, { width, height });
        if (chart) {
            this.#clampToFrozenBoundary(chart, sheet);
            this.render();
        }
        return chart;
    }

    getChart(id) {
        return this.sheet?.chartManager?.get(id) || null;
    }

    getAllCharts() {
        return this.sheet?.chartManager?.getAll() || [];
    }

    hasCharts() {
        return (this.sheet?.chartManager?.count ?? 0) > 0;
    }

    selectChart(id) {
        this.selectedChartId = id;
        this.render();
    }

    deselectChart() {
        this.selectedChartId = null;
        this.render();
    }

    #clampToFrozenBoundary(chart, sheet) {
        const MIN_W = CONFIG.CHART_MIN_WIDTH;
        const MIN_H = CONFIG.CHART_MIN_HEIGHT;
        chart.width = Math.max(MIN_W, chart.width);
        chart.height = Math.max(MIN_H, chart.height);
        const frozenColsW = sheet.frozenColsWidth || 0;
        const frozenRowsH = sheet.frozenRowsHeight || 0;
        if (frozenColsW > 0 && chart.anchorCol < (sheet.fixedColumnsStart || 0)) {
            const maxW = frozenColsW - chart.offsetX - 2;
            if (maxW > MIN_W) chart.width = Math.min(chart.width, maxW);
        }
        if (frozenRowsH > 0 && chart.anchorRow < (sheet.fixedRowsTop || 0)) {
            const maxH = frozenRowsH - chart.offsetY - 2;
            if (maxH > MIN_H) chart.height = Math.min(chart.height, maxH);
        }
    }

    get sheet() {
        return this.workbook?.activeSheet;
    }

    destroy() {
        const sheetsMap = this.workbook?.sheets;
        if (sheetsMap) {
            for (const sheet of sheetsMap.values()) {
                if (sheet.chartManager) {
                    sheet.chartManager.destroy();
                    sheet.chartManager = null;
                }
            }
        }
        super.destroy();
    }
}
