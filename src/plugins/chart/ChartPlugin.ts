import { BasePlugin } from "../base/BasePlugin.js";
import { ChartModel } from "./ChartModel.js";
import { ChartManager } from "./ChartManager.js";
import { ChartSelectionStrategy } from "./ChartSelectionStrategy.js";
import { HOOKS } from "../../constants/hookNames.js";
import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import { CONFIG } from "../../constants/config.js";
import { CHART_TYPE } from "../../constants/enums/ChartType.js";

interface DataRange {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
}

interface ChartOptions {
    anchorRow?: number;
    anchorCol?: number;
    offsetX?: number;
    offsetY?: number;
    width?: number;
    height?: number;
    style?: Record<string, any>;
    [key: string]: any;
}

export class ChartPlugin extends BasePlugin {
    static PLUGIN_NAME: string = "chart";

    #sheetSwitchUnsubscribe: (() => void) | null = null;
    selectedChartId: string | null = null;

    init(options: Record<string, any> = {}): void {
        super.init(options);
        this.#attachToSheets();
        this.addStrategy("chartSelection", new ChartSelectionStrategy(this.eventHandler));
        this.#bindSheetSwitchListener(this.sheet);
        if (options.enabled === false) {
            this.disable();
        }
    }

    #attachToSheets(): void {
        const sheetsMap = this.workbook?.sheets;
        if (!sheetsMap) return;
        for (const sheet of sheetsMap.values()) {
            if (!sheet.chartManager) {
                sheet.chartManager = new ChartManager(sheet);
            }
        }
    }

    #bindSheetSwitchListener(sheet: any): void {
        if (!sheet?.bus) return;
        this.#unbindSheetSwitchListener();
        this.#sheetSwitchUnsubscribe = sheet.bus.on(SHEET_EVENTS.SHEET_SWITCHED, (envelope: any) => {
            const { currentSheet } = envelope.payload;
            const newSheet = this.workbook!.sheets.get(currentSheet);
            if (newSheet && !newSheet.chartManager) {
                newSheet.chartManager = new ChartManager(newSheet);
            }
            this.#bindSheetSwitchListener(newSheet);
        });
    }

    #unbindSheetSwitchListener(): void {
        if (this.#sheetSwitchUnsubscribe) {
            this.#sheetSwitchUnsubscribe();
            this.#sheetSwitchUnsubscribe = null;
        }
    }

    addChart(type: string, dataRange: DataRange, options: ChartOptions = {}): ChartModel | null {
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
        this.renderEngine?.chartLayer?.markDirty();
        this.render();
        return chart;
    }

    addBarChart(dataRange: DataRange, options: ChartOptions = {}): ChartModel | null {
        return this.addChart(CHART_TYPE.BAR, dataRange, options);
    }

    addLineChart(dataRange: DataRange, options: ChartOptions = {}): ChartModel | null {
        return this.addChart(CHART_TYPE.LINE, dataRange, options);
    }

    addPieChart(dataRange: DataRange, options: ChartOptions = {}): ChartModel | null {
        return this.addChart(CHART_TYPE.PIE, dataRange, options);
    }

    addAreaChart(dataRange: DataRange, options: ChartOptions = {}): ChartModel | null {
        return this.addChart(CHART_TYPE.AREA, dataRange, options);
    }

    addScatterChart(dataRange: DataRange, options: ChartOptions = {}): ChartModel | null {
        return this.addChart(CHART_TYPE.SCATTER, dataRange, options);
    }

    addCandlestickChart(dataRange: DataRange, options: ChartOptions = {}): ChartModel | null {
        return this.addChart(CHART_TYPE.CANDLESTICK, dataRange, options);
    }

    addGaugeChart(dataRange: DataRange, options: ChartOptions = {}): ChartModel | null {
        return this.addChart(CHART_TYPE.GAUGE, dataRange, options);
    }

    addFunnelChart(dataRange: DataRange, options: ChartOptions = {}): ChartModel | null {
        return this.addChart(CHART_TYPE.FUNNEL, dataRange, options);
    }

    addRadarChart(dataRange: DataRange, options: ChartOptions = {}): ChartModel | null {
        return this.addChart(CHART_TYPE.RADAR, dataRange, options);
    }

    addHeatmapChart(dataRange: DataRange, options: ChartOptions = {}): ChartModel | null {
        return this.addChart(CHART_TYPE.HEATMAP, dataRange, options);
    }

    removeChart(id: string): ChartModel | null {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return null;
        const chart = sheet.chartManager.remove(id);
        if (chart) {
            this.hooks?.runHooks(HOOKS.AFTER_CHART_REMOVE, id);
            this.renderEngine?.chartLayer?.removeChartCache(id);
            this.render();
        }
        return chart;
    }

    updateChartStyle(id: string, styleUpdate: Record<string, any>): ChartModel | null {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return null;
        const chart = sheet.chartManager.update(id, { style: styleUpdate });
        if (chart) {
            this.hooks?.runHooks(HOOKS.AFTER_CHART_UPDATE, id);
            this.renderEngine?.chartLayer?.invalidateChart(id);
            this.render();
        }
        return chart;
    }

    updateChartDataRange(id: string, dataRange: DataRange): ChartModel | null {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return null;
        const chart = sheet.chartManager.update(id, { dataRange });
        if (chart) {
            this.hooks?.runHooks(HOOKS.AFTER_CHART_UPDATE, id);
            this.renderEngine?.chartLayer?.invalidateChart(id);
            this.render();
        }
        return chart;
    }

    moveChart(id: string, anchorRow?: number, anchorCol?: number, offsetX?: number, offsetY?: number): ChartModel | null {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return null;
        const updates: Record<string, any> = {};
        if (anchorRow !== undefined) updates.anchorRow = anchorRow;
        if (anchorCol !== undefined) updates.anchorCol = anchorCol;
        if (offsetX !== undefined) updates.offsetX = offsetX;
        if (offsetY !== undefined) updates.offsetY = offsetY;
        const chart = sheet.chartManager.update(id, updates);
        if (chart) {
            this.#clampToFrozenBoundary(chart, sheet);
            this.renderEngine?.chartLayer?.markDirty();
            this.render();
        }
        return chart;
    }

    resizeChart(id: string, width: number, height: number): ChartModel | null {
        const sheet = this.sheet;
        if (!sheet || !sheet.chartManager) return null;
        const chart = sheet.chartManager.update(id, { width, height });
        if (chart) {
            this.#clampToFrozenBoundary(chart, sheet);
            this.renderEngine?.chartLayer?.invalidateChart(id);
            this.render();
        }
        return chart;
    }

    getChart(id: string): ChartModel | null {
        return this.sheet?.chartManager?.get(id) || null;
    }

    getAllCharts(): ChartModel[] {
        return this.sheet?.chartManager?.getAll() || [];
    }

    hasCharts(): boolean {
        return (this.sheet?.chartManager?.count ?? 0) > 0;
    }

    selectChart(id: string): void {
        this.selectedChartId = id;
        this.render();
    }

    deselectChart(): void {
        this.selectedChartId = null;
        this.render();
    }

    #clampToFrozenBoundary(chart: any, sheet: any): void {
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

    get sheet(): any {
        return this.workbook?.activeSheet;
    }

    destroy(): void {
        this.#unbindSheetSwitchListener();
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
