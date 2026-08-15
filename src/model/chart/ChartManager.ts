import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import type { DataRange } from "./ChartModel.js";

/**
 * 图表更新属性
 *
 * 用于 update() 方法中描述需要修改的图表属性，所有字段均为可选。
 */
interface ChartUpdates {
    /** 相对锚单元格的 X 像素偏移 */
    offsetX?: number;
    /** 相对锚单元格的 Y 像素偏移 */
    offsetY?: number;
    /** 图表宽度(px) */
    width?: number;
    /** 图表高度(px) */
    height?: number;
    /** 图表关联的数据范围，传 null 可清除数据范围 */
    dataRange?: DataRange | null;
    /** 图表样式配置键值对 */
    style?: Record<string, unknown>;
}

/**
 * 图表实例最小接口
 *
 * 定义 ChartManager 所需的最小图表实例契约，
 * 任何满足此接口的对象均可被管理器管理。
 */
interface ChartLike {
    /** 图表唯一标识 */
    id: string;
    /** 图表类型标识符 */
    type: string;
    /** 锚定行号 */
    anchorRow: number;
    /** 锚定列号 */
    anchorCol: number;
    /** 相对锚单元格的 X 像素偏移 */
    offsetX: number;
    /** 相对锚单元格的 Y 像素偏移 */
    offsetY: number;
    /** 图表宽度(px) */
    width: number;
    /** 图表高度(px) */
    height: number;
    /** 图表关联的数据范围 */
    dataRange: DataRange | null;
    /** 图表样式配置 */
    style: Record<string, unknown>;
}

/**
 * 图表管理器
 *
 * 负责管理工作表中的所有图表实例，包括增删改查以及行列变动时的位置同步。
 * 通过 EventBus 发出图表生命周期事件（CHART_ADDED / CHART_REMOVED / CHART_UPDATED），
 * 供渲染层和其他模块监听响应。
 *
 * @class ChartManager
 */
export class ChartManager {
    /** 所属的工作表实例 */
    sheet: any;
    /** 以图表id为键的图表映射表 */
    charts: Map<string, ChartLike> = new Map();

    /**
     * 构造图表管理器
     *
     * @param sheet - 所属的工作表实例，管理器通过 sheet.bus 访问 EventBus
     */
    constructor(sheet: any) {
        this.sheet = sheet;
        this.charts = new Map();
    }

    /**
     * 添加图表到管理器中，并触发 CHART_ADDED 事件
     *
     * @param chart - 要添加的图表实例，需满足 ChartLike 接口
     */
    add(chart: ChartLike): void {
        this.charts.set(chart.id, chart);
        this.sheet.bus.emit(SHEET_EVENTS.CHART_ADDED, { chartId: chart.id, type: chart.type }, { source: "ChartManager" });
    }

    /**
     * 移除指定id的图表，并触发 CHART_REMOVED 事件
     *
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
     *
     * @param id - 图表id
     * @returns 对应的图表实例，若不存在则返回 null
     */
    get(id: string): ChartLike | null {
        return this.charts.get(id) || null;
    }

    /**
     * 获取所有图表实例
     *
     * @returns 图表实例数组
     */
    getAll(): ChartLike[] {
        return Array.from(this.charts.values());
    }

    /**
     * 更新指定图表的属性，并触发 CHART_UPDATED 事件
     *
     * 仅更新 updates 中显式提供的字段（undefined 值会被跳过），
     * style 字段采用浅合并策略（Object.assign）。
     *
     * @param id - 图表id
     * @param updates - 要更新的属性键值对
     * @returns 更新后的图表实例，若图表不存在则返回 null
     */
    update(id: string, updates: ChartUpdates): ChartLike | null {
        const chart = this.charts.get(id);
        if (!chart) {
            return null;
        }
        // 逐字段判断，仅更新显式传入的属性
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
        // style 采用浅合并，保留原有未覆盖的样式键
        if (updates.style !== undefined) {
            Object.assign(chart.style, updates.style);
        }
        this.sheet.bus.emit(SHEET_EVENTS.CHART_UPDATED, { chartId: id }, { source: "ChartManager" });
        return chart;
    }

    /**
     * 在指定行位置插入行时，调整所有图表的锚点行和数据范围行索引
     *
     * 插入行后，位于插入位置及之后的行索引需要 +1，
     * 以保持图表与数据的对应关系不变。
     *
     * @param atRow - 插入行的位置（0-based 行号）
     */
    insertRow(atRow: number): void {
        this.charts.forEach((chart) => {
            // 锚点行 >= 插入位置时需要后移
            if (chart.anchorRow >= atRow) chart.anchorRow++;
            if (chart.dataRange) {
                // 数据范围的起止行同样需要后移
                if (chart.dataRange.startRow >= atRow) chart.dataRange.startRow++;
                if (chart.dataRange.endRow >= atRow) chart.dataRange.endRow++;
            }
        });
    }

    /**
     * 删除指定行时，调整所有图表的锚点行和数据范围行索引
     *
     * 删除行后，位于被删行之后的行索引需要 -1；
     * 位于被删行位置的锚点/范围行保持为 0（不允许负索引）。
     *
     * @param atRow - 删除行的位置（0-based 行号）
     */
    deleteRow(atRow: number): void {
        this.charts.forEach((chart) => {
            // 锚点行 > 被删行：正常前移；等于被删行：钳位到 0
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
     *
     * 插入列后，位于插入位置及之后的列索引需要 +1，
     * 以保持图表与数据的对应关系不变。
     *
     * @param atCol - 插入列的位置（0-based 列号）
     */
    insertCol(atCol: number): void {
        this.charts.forEach((chart) => {
            // 锚点列 >= 插入位置时需要后移
            if (chart.anchorCol >= atCol) chart.anchorCol++;
            if (chart.dataRange) {
                // 数据范围的起止列同样需要后移
                if (chart.dataRange.startCol >= atCol) chart.dataRange.startCol++;
                if (chart.dataRange.endCol >= atCol) chart.dataRange.endCol++;
            }
        });
    }

    /**
     * 删除指定列时，调整所有图表的锚点列和数据范围列索引
     *
     * 删除列后，位于被删列之后的列索引需要 -1；
     * 位于被删列位置的锚点/范围列保持为 0（不允许负索引）。
     *
     * @param atCol - 删除列的位置（0-based 列号）
     */
    deleteCol(atCol: number): void {
        this.charts.forEach((chart) => {
            // 锚点列 > 被删列：正常前移；等于被删列：钳位到 0
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
     *
     * 三种情况：
     * 1. 锚点行恰好是被移动行 → 直接设为目标行
     * 2. 向下移动（fromRow < toRow）→ 区间 (fromRow, toRow] 内的锚点行 -1
     * 3. 向上移动（fromRow > toRow）→ 区间 [toRow, fromRow) 内的锚点行 +1
     *
     * @param fromRow - 源行位置（0-based 行号）
     * @param toRow - 目标行位置（0-based 行号）
     */
    moveRow(fromRow: number, toRow: number): void {
        this.charts.forEach((chart) => {
            if (chart.anchorRow === fromRow) {
                // 被移动行本身直接跟随
                chart.anchorRow = toRow;
            } else if (fromRow < toRow && chart.anchorRow > fromRow && chart.anchorRow <= toRow) {
                // 向下移动：中间行被"挤"上去
                chart.anchorRow--;
            } else if (fromRow > toRow && chart.anchorRow >= toRow && chart.anchorRow < fromRow) {
                // 向上移动：中间行被"挤"下去
                chart.anchorRow++;
            }
        });
    }

    /**
     * 移动列时，调整所有图表的锚点列索引
     *
     * 三种情况：
     * 1. 锚点列恰好是被移动列 → 直接设为目标列
     * 2. 向右移动（fromCol < toCol）→ 区间 (fromCol, toCol] 内的锚点列 -1
     * 3. 向左移动（fromCol > toCol）→ 区间 [toCol, fromCol) 内的锚点列 +1
     *
     * @param fromCol - 源列位置（0-based 列号）
     * @param toCol - 目标列位置（0-based 列号）
     */
    moveCol(fromCol: number, toCol: number): void {
        this.charts.forEach((chart) => {
            if (chart.anchorCol === fromCol) {
                // 被移动列本身直接跟随
                chart.anchorCol = toCol;
            } else if (fromCol < toCol && chart.anchorCol > fromCol && chart.anchorCol <= toCol) {
                // 向右移动：中间列被"挤"到左边
                chart.anchorCol--;
            } else if (fromCol > toCol && chart.anchorCol >= toCol && chart.anchorCol < fromCol) {
                // 向左移动：中间列被"挤"到右边
                chart.anchorCol++;
            }
        });
    }

    /**
     * 获取当前图表数量
     *
     * @returns 管理器中图表的数量
     */
    get count(): number {
        return this.charts.size;
    }

    /**
     * 销毁管理器，清空所有图表引用
     *
     * 调用后管理器不再持有任何图表实例，但不会触发 CHART_REMOVED 事件。
     * 通常在工作表销毁时调用。
     */
    destroy(): void {
        this.charts.clear();
    }
}

export type { ChartLike, ChartUpdates };
