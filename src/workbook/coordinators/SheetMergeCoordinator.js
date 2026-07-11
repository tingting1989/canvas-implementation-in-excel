import { MergeCommand, UnmergeCommand } from "@/model";
import { ISheet } from "../interfaces/ISheet.js";

/**
 * 工作表合并单元格协调者
 *
 * 负责：
 * - 合并/取消合并单元格区域
 * - 查询合并信息
 * - 确保合并操作的合法性（如禁止跨不同列类型合并）
 * - 通过 ISheet 接口解耦对具体实现的依赖
 */
export class SheetMergeCoordinator {
    /** @type {ISheet} */
    #sheet;

    /**
     * @param {ISheet} sheet - 所属工作表实例（通过接口访问）
     */
    constructor(sheet) {
        this.#sheet = sheet;
    }

    get mergeManager() {
        return this.#sheet.mergeManager;
    }

    /**
     * 合并单元格区域
     *
     * 流程：
     * 1. 权限检查
     * 2. 列类型一致性检查（禁止跨不同类型合并）
     * 3. 执行合并命令
     * 4. 记录历史（支持撤销）
     * 5. 刷新视图
     *
     * @param {number} topRow - 左上角行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角行号
     * @param {number} bottomCol - 右下角列号
     * @returns {boolean} 是否成功
     */
    mergeCells(topRow, topCol, bottomRow, bottomCol) {
        if (!this.#sheet._ensureWritable()) return false;

        if (!this.#sheet.meta._checkColumnTypeConsistency(topCol, bottomCol)) {
            return false;
        }

        const cmd = new MergeCommand(this.mergeManager, topRow, topCol, bottomRow, bottomCol);
        cmd.redo();

        if (cmd.succeeded) {
            this.#sheet.history.push(cmd);
            this.#sheet._invalidateAll();
        }

        return cmd.succeeded;
    }

    /**
     * 取消合并单元格
     * @param {number} row - 合并区域内任意单元格的行号
     * @param {number} col - 合并区域内任意单元格的列号
     * @returns {boolean} 是否成功
     */
    unmergeCells(row, col) {
        if (!this.#sheet._ensureWritable()) return false;

        const cmd = new UnmergeCommand(this.mergeManager, row, col);
        cmd.redo();

        if (cmd.oldMerge) {
            this.#sheet.history.push(cmd);
            this.#sheet._invalidateAll();
            return true;
        }

        return false;
    }

    // ─── 查询方法 ─────────────────────────────────────

    /**
     * 获取单元格所属的合并区域信息
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {Object|null} 合并区域信息，未合并返回 null
     */
    getMerge(row, col) {
        return this.mergeManager.getMerge(row, col);
    }

    /**
     * 判断是否为合并区域的左上角单元格
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {boolean}
     */
    isMergeTopLeft(row, col) {
        return this.mergeManager.isTopLeft(row, col);
    }

    /**
     * 判断是否属于某个合并区域（且不是左上角）
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {boolean}
     */
    isMergedCell(row, col) {
        return this.mergeManager.isMerged(row, col);
    }

    /**
     * 获取所有合并单元格信息
     * @returns {Array<Object>}
     */
    getAllMerges() {
        return this.mergeManager.getAllMerges();
    }
}
