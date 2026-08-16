import type { ISheet } from "../interfaces/ISheet";
import { MergeCommand } from "../../model/command/MergeCommand";
import { UnmergeCommand } from "../../model/command/UnmergeCommand";

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
    #sheet: ISheet;

    constructor(sheet: ISheet) {
        this.#sheet = sheet;
    }

    get mergeManager() {
        return this.#sheet.mergeManager;
    }

    mergeCells(topRow: number, topCol: number, bottomRow: number, bottomCol: number): boolean {
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

    unmergeCells(row: number, col: number): boolean {
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

    getMerge(row: number, col: number) {
        return this.mergeManager.getMerge(row, col);
    }

    isMergeTopLeft(row: number, col: number): boolean {
        return this.mergeManager.isTopLeft(row, col);
    }

    isMergedCell(row: number, col: number): boolean {
        return this.mergeManager.isMerged(row, col);
    }

    getAllMerges() {
        return this.mergeManager.getAllMerges();
    }
}
