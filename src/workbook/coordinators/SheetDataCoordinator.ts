import { CellDataAccessor } from "../../model/grid/CellDataAccessor";
import { SHEET_EVENTS } from "../../constants/sheetEvents";
import { Cell } from "../../model/store/Cell";
import { SetCellCommand } from "../../model/command/SetCellCommand";
import { ToggleDisableCommand } from "../../model/command/ToggleDisableCommand";
import type { ISheet } from "../interfaces/ISheet";
import type { ChunkedCellStore } from "../../model/store/ChunkedCellStore";

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
 * - 通过 ISheet 接口解耦对具体实现的依赖
 *
 * 数据流：
 * ┌──────────┐    ┌──────────────┐    ┌──────────────┐
 * │ setCell  │ ─→ │ cellStore.set │ ─→ │ CELL_CHANGED │
 * └──────────┘    └──────────────┘    └──────────────┘
 *       │
 *       ├── 值以 "=" 开头 → FORMULA_SET → 公式引擎计算
 *       └── 旧值有公式   → FORMULA_REMOVE → 清除公式依赖
 *
 * @class SheetDataCoordinator
 */
export class SheetDataCoordinator {
    /** 工作表接口引用 */
    #sheet: ISheet;
    /** 懒初始化的数据访问器 */
    #accessor: CellDataAccessor | null = null;

    /**
     * @param sheet - 工作表接口实例
     */
    constructor(sheet: ISheet) {
        this.#sheet = sheet;
    }

    /**
     * 获取单元格存储（直接引用 Sheet 的 cellStore）
     * @returns 分块单元格存储
     */
    get cellStore(): ChunkedCellStore {
        return this.#sheet.cellStore;
    }

    /**
     * 获取数据访问器（懒初始化）
     *
     * CellDataAccessor 提供批量遍历、范围清除等高效数据访问方法，
     * 首次访问时创建，后续复用同一实例。
     *
     * @returns 单元格数据访问器
     */
    get dataAccessor(): CellDataAccessor {
        if (!this.#accessor) {
            this.#accessor = new CellDataAccessor(this.#sheet);
        }
        return this.#accessor;
    }

    /**
     * 设置单元格值
     *
     * 核心写入方法，处理流程：
     * 1. 权限检查（只读保护）
     * 2. 尺寸确保（自动扩展行列范围）
     * 3. 公式检测：值以 "=" 开头时触发 FORMULA_SET 事件
     * 4. 公式清除：旧值有公式时触发 FORMULA_REMOVE 事件
     * 5. 创建命令并推入历史栈（支持撤销）
     * 6. 写入存储并使缓存失效
     * 7. 触发 CELL_CHANGED 事件（非公式时）
     *
     * @param r - 行号（从 0 开始）
     * @param c - 列号（从 0 开始）
     * @param value - 单元格值，字符串以 "=" 开头时识别为公式
     * @param styleId - 样式 ID，默认 0（无样式）
     * @param disabled - 是否禁用，默认 false
     */
    setCell(r: number, c: number, value: unknown, styleId: number = 0, disabled: boolean = false): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#sheet.rowColManager.ensureSize(r + 1, c + 1);

        let formula: string | null = null;
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
     * 禁用单元格
     *
     * 将单元格标记为禁用状态，禁用后不可编辑。
     * 如果单元格不存在，自动创建空值禁用单元格。
     * 操作记录为 ToggleDisableCommand，支持撤销。
     *
     * @param r - 行号
     * @param c - 列号
     */
    disableCell(r: number, c: number): void {
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
     * 启用单元格
     *
     * 将单元格的禁用状态移除，恢复可编辑。
     * 如果单元格不存在，不做任何操作。
     * 操作记录为 ToggleDisableCommand，支持撤销。
     *
     * @param r - 行号
     * @param c - 列号
     */
    enableCell(r: number, c: number): void {
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
     * 检查单元格是否被禁用
     *
     * 禁用判定优先级（任一为 true 即禁用）：
     * 1. 列配置的 disabled / readOnly 属性
     * 2. 动态属性（cellsFn）的 disabled / readOnly
     * 3. 单元格自身的 disabled 标记
     *
     * @param r - 行号
     * @param c - 列号
     * @returns 是否禁用
     */
    isDisabled(r: number, c: number): boolean {
        const colConfig = this.#sheet.meta.columnsConfig.get(c);
        if (colConfig?.disabled === true || colConfig?.readOnly === true) return true;

        const cellProps = this.#sheet.meta.resolveCellProperties(r, c);
        if (cellProps?.disabled === true || cellProps?.readOnly === true) return true;

        return this.cellStore.get(r, c)?.disabled === true;
    }

    /**
     * 批量加载数据
     *
     * 将二维数组写入单元格存储，自动处理公式。
     * 不记录命令历史（批量加载不可撤销）。
     *
     * 处理流程：
     * 1. 权限检查和输入验证
     * 2. 计算最大列数，确保存储尺寸
     * 3. 逐单元格写入，公式自动触发 FORMULA_SET
     * 4. 使所有缓存失效
     *
     * @param data - 二维数组，data[row][col]，空位补 ""
     */
    loadData(data: unknown[][]): void {
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
