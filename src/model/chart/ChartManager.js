import { SHEET_EVENTS } from "../../constants/sheetEvents.js";

export class ChartManager {
    constructor(sheet) {
        this.sheet = sheet;
        this.charts = new Map();
    }

    add(chart) {
        this.charts.set(chart.id, chart);
        this.sheet.bus.emit(SHEET_EVENTS.CHART_ADDED, { chartId: chart.id, type: chart.type });
    }

    remove(id) {
        const chart = this.charts.get(id);
        if (chart) {
            this.charts.delete(id);
            this.sheet.bus.emit(SHEET_EVENTS.CHART_REMOVED, { chartId: id });
            return chart;
        }
        return null;
    }

    get(id) {
        return this.charts.get(id) || null;
    }

    getAll() {
        return Array.from(this.charts.values());
    }

    update(id, updates) {
        const chart = this.charts.get(id);
        if (!chart) return null;
        if (updates.offsetX !== undefined) chart.offsetX = updates.offsetX;
        if (updates.offsetY !== undefined) chart.offsetY = updates.offsetY;
        if (updates.width !== undefined) chart.width = updates.width;
        if (updates.height !== undefined) chart.height = updates.height;
        if (updates.dataRange !== undefined) chart.dataRange = updates.dataRange;
        if (updates.style !== undefined) Object.assign(chart.style, updates.style);
        this.sheet.bus.emit(SHEET_EVENTS.CHART_UPDATED, { chartId: id });
        return chart;
    }

    insertRow(atRow) {
        this.charts.forEach((chart) => {
            if (chart.anchorRow >= atRow) chart.anchorRow++;
            if (chart.dataRange) {
                if (chart.dataRange.startRow >= atRow) chart.dataRange.startRow++;
                if (chart.dataRange.endRow >= atRow) chart.dataRange.endRow++;
            }
        });
    }

    deleteRow(atRow) {
        this.charts.forEach((chart) => {
            if (chart.anchorRow > atRow) chart.anchorRow--;
            else if (chart.anchorRow === atRow) chart.anchorRow = Math.max(0, chart.anchorRow);
            if (chart.dataRange) {
                if (chart.dataRange.startRow > atRow) chart.dataRange.startRow--;
                else if (chart.dataRange.startRow === atRow) chart.dataRange.startRow = Math.max(0, chart.dataRange.startRow);
                if (chart.dataRange.endRow > atRow) chart.dataRange.endRow--;
                else if (chart.dataRange.endRow === atRow) chart.dataRange.endRow = Math.max(0, chart.dataRange.endRow);
            }
        });
    }

    insertCol(atCol) {
        this.charts.forEach((chart) => {
            if (chart.anchorCol >= atCol) chart.anchorCol++;
            if (chart.dataRange) {
                if (chart.dataRange.startCol >= atCol) chart.dataRange.startCol++;
                if (chart.dataRange.endCol >= atCol) chart.dataRange.endCol++;
            }
        });
    }

    deleteCol(atCol) {
        this.charts.forEach((chart) => {
            if (chart.anchorCol > atCol) chart.anchorCol--;
            else if (chart.anchorCol === atCol) chart.anchorCol = Math.max(0, chart.anchorCol);
            if (chart.dataRange) {
                if (chart.dataRange.startCol > atCol) chart.dataRange.startCol--;
                else if (chart.dataRange.startCol === atCol) chart.dataRange.startCol = Math.max(0, chart.dataRange.startCol);
                if (chart.dataRange.endCol > atCol) chart.dataRange.endCol--;
                else if (chart.dataRange.endCol === atCol) chart.dataRange.endCol = Math.max(0, chart.dataRange.endCol);
            }
        });
    }

    moveRow(fromRow, toRow) {
        this.charts.forEach((chart) => {
            if (chart.anchorRow === fromRow) chart.anchorRow = toRow;
            else if (fromRow < toRow && chart.anchorRow > fromRow && chart.anchorRow <= toRow) chart.anchorRow--;
            else if (fromRow > toRow && chart.anchorRow >= toRow && chart.anchorRow < fromRow) chart.anchorRow++;
        });
    }

    moveCol(fromCol, toCol) {
        this.charts.forEach((chart) => {
            if (chart.anchorCol === fromCol) chart.anchorCol = toCol;
            else if (fromCol < toCol && chart.anchorCol > fromCol && chart.anchorCol <= toCol) chart.anchorCol--;
            else if (fromCol > toCol && chart.anchorCol >= toCol && chart.anchorCol < fromCol) chart.anchorCol++;
        });
    }

    get count() {
        return this.charts.size;
    }

    destroy() {
        this.charts.clear();
    }
}
