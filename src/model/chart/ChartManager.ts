import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import type { DataRange } from "./ChartModel.js";

/** 图表更新属性 */
interface ChartUpdates {
    offsetX?: number;
    offsetY?: number;
    width?: number;
    height?: number;
    dataRange?: DataRange | null;
    style?: Record<string, unknown>;
}

/** 图表实例最小接口 */
interface ChartLike {
    id: string;
    type: string;
    anchorRow: number;
    anchorCol: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
    dataRange: DataRange | null;
    style: Record<string, unknown>;
}

/**
 * 图表管理器 (Chart Manager)
 *
 * 负责管理工作表中的所有图表实例，包括增删改查以及行列变动时的位置同步。
 *
 * @class ChartManager
 */
export class ChartManager {
    /** 所属的工作表实例 */
    sheet: any;
    /** 以图表id为键的图表映射表 */
    charts: Map<string, ChartLike> = new Map();

    /**
     * @param sheet - 所属的工作表实例
     */
    constructor(sheet: any) {
        this.sheet = sheet;
        this.charts = new Map();
    }

    /**
     * 添加图表到管理器中，并触发 CHART_ADDED 事件
     * @param chart - 图表实例
     */
    add(chart: ChartLike): void {
        this.charts.set(chart.id, chart);
        this.sheet.bus.emit(SHEET_EVENTS.CHART_ADDED, { chartId: chart.id, type: chart.type }, { source: "ChartManager" });
    }

    /**
     * 移除指定id的图表，并触发 CHART_REMOVED 事件
     * @param id - 要移除的图表id
     * @returns 被移除的图表实例，若不存在则返回 null
     */
    remove(id: string): ChartLike | null {
        const chart = this.charts.get(id);
        if (chart) {
            this.charts.delete(id);
            this.sheet.bus.emit(SHEET_EVENTS.CHART_REMOVED, { chartId: id }, { source: "ChartManager" });
            return chart;
        }
        return null;
    }

    /**
     * 根据id获取图表实例
     * @param id - 图表id
     */
    get(id: string): ChartLike | null {
        return this.charts.get(id) || null;
    }

    /**
     * 获取所有图表实例
     */
    getAll(): ChartLike[] {
        return Array.from(this.charts.values());
    }

    /**
     * 更新指定图表的属性，并触发 CHART_UPDATED 事件
     * @param id - 图表id
     * @param updates - 要更新的属性键值对
     */
    update(id: string, updates: ChartUpdates): ChartLike | null {
        const chart = this.charts.get(id);
        if (!chart) {
            return null;
        }
        if (updates.offsetX !== undefined) {
            chart.offsetX = updates.offsetX;
        }
        if (updates.offsetY !== undefined) {
            chart.offsetY = updates.offsetY;
        }
        if (updates.width !== undefined) {
            chart.width = updates.width;
        }
        if (updates.height !== undefined) {
            chart.height = updates.height;
        }
        if (updates.dataRange !== undefined) {
            chart.dataRange = updates.dataRange;
        }
        if (updates.style !== undefined) {
            Object.assign(chart.style, updates.style);
        }
        this.sheet.bus.emit(SHEET_EVENTS.CHART_UPDATED, { chartId: id }, { source: "ChartManager" });
        return chart;
    }

    /**
     * 在指定行位置插入行时，调整所有图表的锚点行和数据范围行索引
     * @param atRow - 插入行的位置
     */
    insertRow(atRow: number): void {
        this.charts.forEach((chart) => {
            if (chart.anchorRow >= atRow) chart.anchorRow++;
            if (chart.dataRange) {
                if (chart.dataRange.startRow >= atRow) chart.dataRange.startRow++;
                if (chart.dataRange.endRow >= atRow) chart.dataRange.endRow++;
            }
        });
    }

    /**
     * 删除指定行时，调整所有图表的锚点行和数据范围行索引
     * @param atRow - 删除行的位置
     */
    deleteRow(atRow: number): void {
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

    /**
     * 在指定列位置插入列时，调整所有图表的锚点列和数据范围列索引
     * @param atCol - 插入列的位置
     */
    insertCol(atCol: number): void {
        this.charts.forEach((chart) => {
            if (chart.anchorCol >= atCol) chart.anchorCol++;
            if (chart.dataRange) {
                if (chart.dataRange.startCol >= atCol) chart.dataRange.startCol++;
                if (chart.dataRange.endCol >= atCol) chart.dataRange.endCol++;
            }
        });
    }

    /**
     * 删除指定列时，调整所有图表的锚点列和数据范围列索引
     * @param atCol - 删除列的位置
     */
    deleteCol(atCol: number): void {
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

    /**
     * 移动行时，调整所有图表的锚点行索引
     * @param fromRow - 源行位置
     * @param toRow - 目标行位置
     */
    moveRow(fromRow: number, toRow: number): void {
        this.charts.forEach((chart) => {
            if (chart.anchorRow === fromRow) chart.anchorRow = toRow;
            else if (fromRow < toRow && chart.anchorRow > fromRow && chart.anchorRow <= toRow) chart.anchorRow--;
            else if (fromRow > toRow && chart.anchorRow >= toRow && chart.anchorRow < fromRow) chart.anchorRow++;
        });
    }

    /**
     * 移动列时，调整所有图表的锚点列索引
     * @param fromCol - 源列位置
     * @param toCol - 目标列位置
     */
    moveCol(fromCol: number, toCol: number): void {
        this.charts.forEach((chart) => {
            if (chart.anchorCol === fromCol) chart.anchorCol = toCol;
            else if (fromCol < toCol && chart.anchorCol > fromCol && chart.anchorCol <= toCol) chart.anchorCol--;
            else if (fromCol > toCol && chart.anchorCol >= toCol && chart.anchorCol < fromCol) chart.anchorCol++;
        });
    }

    /** 获取当前图表数量 */
    get count(): number {
        return this.charts.size;
    }

    /** 销毁管理器，清空所有图表引用 */
    destroy(): void {
        this.charts.clear();
    }
}

export type { ChartLike, ChartUpdates };
