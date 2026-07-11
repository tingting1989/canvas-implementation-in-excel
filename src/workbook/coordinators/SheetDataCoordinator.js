import { Cell, SetCellCommand, ToggleDisableCommand } from "@/model";
import { CellDataAccessor } from "../../model/grid/CellDataAccessor.js";
import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import { ISheet } from "../interfaces/ISheet.js";

/**
 * 工作表数据协调者
 *
 * 负责：
 * - 单元格值的增删改查（带事件、命令历史、公式支持）
 * - 批量数据加载
 * - 提供统一的数据访问接口（CellDataAccessor）
 *
 * 设计原则：
 * - 所有写入操作都经过此协调者，确保一致性
 * - 读取操作可通过 dataAccessor 进行批量优化
 */
export class SheetDataCoordinator {
    /** @type {ISheet} */
    #sheet;

    /** @type {CellDataAccessor|null} */
    #accessor = null;

    /**
     * @param {ISheet} sheet - 所属工作表实例（通过接口访问）
     */
    constructor(sheet) {
        this.#sheet = sheet;
    }

    // ─── 属性访问 ──────────────────────────────────────

    /**
     * 获取底层单元格存储
     * @returns {import("../../model/store/ChunkedCellStore.js").ChunkedCellStore}
     */
    get cellStore() {
        return this.#sheet.cellStore;
    }

    /**
     * 获取数据访问代理（懒初始化）
     *
     * 提供高效的批量读取方法：
     * - getValueMatrix(): 提取值矩阵
     * - getNonEmptyCells(): 获取非空单元格
     * - forEach(): 遍历回调
     * - [Symbol.iterator](): 迭代器模式
     *
     * @returns {CellDataAccessor}
     */
    get dataAccessor() {
        if (!this.#accessor) {
            this.#accessor = new CellDataAccessor(this.#sheet);
        }
        return this.#accessor;
    }

    // ─── 单元格值操作 ─────────────────────────────────

    /**
     * 设置单元格值
     *
     * 完整流程：
     * 1. 权限检查（只读模式拦截）
     * 2. 尺寸扩展（确保行列数足够）
     * 3. 公式处理（识别以 "=" 开头的公式）
     * 4. 命令记录（支持撤销/重做）
     * 5. 存储更新
     * 6. 缓存失效
     * 7. 事件通知
     *
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {*} value - 单元格值
     * @param {number} [styleId=0] - 样式 ID
     * @param {boolean} [disabled=false] - 是否禁用
     */
    setCell(r, c, value, styleId = 0, disabled = false) {
        if (!this.#sheet._ensureWritable()) return;
        this.#sheet.rowColManager.ensureSize(r + 1, c + 1);

        let formula = null;
        let cellValue = value;

        const old = this.cellStore.get(r, c);

        if (typeof value === "string" && value.startsWith("=")) {
            formula = value;
            const results = this.#sheet.bus.emit(SHEET_EVENTS.FORMULA_SET, { r, c, formula: value });
            cellValue = results !== undefined ? results : value;
        } else if (old?.formula) {
            this.#sheet.bus.emit(SHEET_EVENTS.FORMULA_REMOVE, { r, c });
        }

        const cell = new Cell(cellValue, styleId, disabled, formula);
        const cmd = new SetCellCommand(this.cellStore, r, c, old, cell);
        this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history);
        this.cellStore.set(r, c, cell);
        this.#sheet._invalidateCell(r, c);

        if (!formula) {
            this.#sheet.bus.emit(SHEET_EVENTS.CELL_CHANGED, { r, c });
        }
    }

    /**
     * 禁用单元格（设为只读）
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    disableCell(r, c) {
        if (!this.#sheet._ensureWritable()) return;
        this.#sheet.rowColManager.ensureSize(r + 1, c + 1);

        let cell = this.cellStore.get(r, c);
        const oldState = cell?.disabled || false;

        if (!cell) {
            cell = new Cell("", 0, true);
        } else {
            cell.disabled = true;
        }

        const cmd = new ToggleDisableCommand(this.cellStore, r, c, oldState);
        this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history);
        this.cellStore.set(r, c, cell);
        this.#sheet._invalidateCell(r, c);
    }

    /**
     * 启用单元格（取消只读）
     * @param {number} r - 行号
     * @param {number} c - 列号
     */
    enableCell(r, c) {
        if (!this.#sheet._ensureWritable()) return;
        const cell = this.cellStore.get(r, c);
        if (!cell) return;

        const oldState = cell.disabled;
        cell.disabled = false;

        const cmd = new ToggleDisableCommand(this.cellStore, r, c, oldState);
        this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history);
        this.#sheet._invalidateCell(r, c);
    }

    /**
     * 判断单元格是否被禁用
     *
     * 检查优先级：
     * 1. 列配置（columnsConfig）
     * 2. 单元格属性（cell/cells 函数）
     * 3. 单元格自身的 disabled 状态
     *
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {boolean}
     */
    isDisabled(r, c) {
        const colConfig = this.#sheet.meta.columnsConfig.get(c);
        if (colConfig?.disabled === true || colConfig?.readOnly === true) return true;

        const cellProps = this.#sheet.meta.resolveCellProperties(r, c);
        if (cellProps?.disabled === true || cellProps?.readOnly === true) return true;

        return this.cellStore.get(r, c)?.disabled === true;
    }

    // ─── 数据加载 ─────────────────────────────────────

    /**
     * 加载二维数组数据，完全替换目标区域的所有单元格
     *
     * 特点：
     * - 直接覆盖目标区域（包括空值）
     * - 支持公式识别（以 "=" 开头的字符串）
     * - 自动扩展行列尺寸
     * - 触发全量刷新
     *
     * @param {Array<Array<*>>} data - 二维数组数据
     */
    loadData(data) {
        if (!this.#sheet._ensureWritable()) return;
        if (!Array.isArray(data)) return;

        const rows = data.length;
        if (rows === 0) return;

        let maxCols = 0;
        for (let r = 0; r < rows; r++) {
            const row = data[r];
            if (Array.isArray(row) && row.length > maxCols) maxCols = row.length;
        }
        if (maxCols === 0) return;

        this.#sheet.rowColManager.ensureSize(rows, maxCols);

        for (let r = 0; r < rows; r++) {
            const row = data[r];
            if (!Array.isArray(row)) continue;

            for (let c = 0; c < maxCols; c++) {
                const val = c < row.length ? row[c] : "";

                if (typeof val === "string" && val.startsWith("=")) {
                    const results = this.#sheet.bus.emit(SHEET_EVENTS.FORMULA_SET, { r, c, formula: val });
                    const result = results !== undefined ? results : val;
                    this.cellStore.set(r, c, new Cell(result, 0, false, val));
                } else {
                    this.cellStore.set(r, c, new Cell(val, 0));
                }
            }
        }

        this.#sheet._invalidateAll();
    }
}
