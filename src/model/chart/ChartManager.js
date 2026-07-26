import { SHEET_EVENTS } from "../../constants/sheetEvents.js";

/**
 * 图表管理器
 * 负责管理工作表中的所有图表实例，包括增删改查以及行列变动时的位置同步
 */
export class ChartManager {
    /**
     * @param {object} sheet - 所属的工作表实例
     */
    constructor(sheet) {
        this.sheet = sheet;
        /** @type {Map<string, object>} 以图表id为键的图表映射表 */
        this.charts = new Map();
    }

    /**
     * 添加图表到管理器中，并触发 CHART_ADDED 事件
     * @param {object} chart - 图表实例，需包含 id 和 type 属性
     */
    add(chart) {
        this.charts.set(chart.id, chart);
        this.sheet.bus.emit(SHEET_EVENTS.CHART_ADDED, { chartId: chart.id, type: chart.type }, { source: "ChartManager" });
    }

    /**
     * 移除指定id的图表，并触发 CHART_REMOVED 事件
     * @param {string} id - 要移除的图表id
     * @returns {object|null} 被移除的图表实例，若不存在则返回 null
     */
    remove(id) {
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
     * @param {string} id - 图表id
     * @returns {object|null} 图表实例，若不存在则返回 null
     */
    get(id) {
        return this.charts.get(id) || null;
    }

    /**
     * 获取所有图表实例
     * @returns {object[]} 图表实例数组
     */
    getAll() {
        return Array.from(this.charts.values());
    }

    /**
     * 更新指定图表的属性，并触发 CHART_UPDATED 事件
     * 支持更新的属性：offsetX、offsetY、width、height、dataRange、style
     * @param {string} id - 图表id
     * @param {object} updates - 要更新的属性键值对
     * @returns {object|null} 更新后的图表实例，若不存在则返回 null
     */
    update(id, updates) {
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
     * 锚点行 >= atRow 的图表向下移动一行，数据范围同理
     * @param {number} atRow - 插入行的位置
     */
    insertRow(atRow) {
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
     * 锚点行 > atRow 的图表向上移动一行，等于 atRow 的保持不变（下限为0）
     * @param {number} atRow - 删除行的位置
     */
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

    /**
     * 在指定列位置插入列时，调整所有图表的锚点列和数据范围列索引
     * 锚点列 >= atCol 的图表向右移动一列，数据范围同理
     * @param {number} atCol - 插入列的位置
     */
    insertCol(atCol) {
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
     * 锚点列 > atCol 的图表向左移动一列，等于 atCol 的保持不变（下限为0）
     * @param {number} atCol - 删除列的位置
     */
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

    /**
     * 移动行时，调整所有图表的锚点行索引
     * 处理三种情况：锚点行正好是被移动行、锚点行在移动区间内向下移动、锚点行在移动区间内向上移动
     * @param {number} fromRow - 源行位置
     * @param {number} toRow - 目标行位置
     */
    moveRow(fromRow, toRow) {
        this.charts.forEach((chart) => {
            if (chart.anchorRow === fromRow) chart.anchorRow = toRow;
            else if (fromRow < toRow && chart.anchorRow > fromRow && chart.anchorRow <= toRow) chart.anchorRow--;
            else if (fromRow > toRow && chart.anchorRow >= toRow && chart.anchorRow < fromRow) chart.anchorRow++;
        });
    }

    /**
     * 移动列时，调整所有图表的锚点列索引
     * 处理三种情况：锚点列正好是被移动列、锚点列在移动区间内向左移动、锚点列在移动区间内向右移动
     * @param {number} fromCol - 源列位置
     * @param {number} toCol - 目标列位置
     */
    moveCol(fromCol, toCol) {
        this.charts.forEach((chart) => {
            if (chart.anchorCol === fromCol) chart.anchorCol = toCol;
            else if (fromCol < toCol && chart.anchorCol > fromCol && chart.anchorCol <= toCol) chart.anchorCol--;
            else if (fromCol > toCol && chart.anchorCol >= toCol && chart.anchorCol < fromCol) chart.anchorCol++;
        });
    }

    /**
     * 获取当前图表数量
     * @returns {number} 图表数量
     */
    get count() {
        return this.charts.size;
    }

    /**
     * 销毁管理器，清空所有图表引用
     */
    destroy() {
        this.charts.clear();
    }
}
