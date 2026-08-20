import { EventStrategy } from "../../editor/strategies/EventStrategy.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { isNumber } from "../../utils/helper.js";
import { AUTO_FILL_DIR } from "../../constants/enums/AutoFillDir.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";
import type { CellRange } from "../../model/types";

/** 选区范围（别名，语义化） */
type SelectionRange = CellRange;

/**
 * 自动填充策略 (Auto Fill Strategy)
 *
 * 实现类似Excel的拖拽自动填充功能。
 * 通过拖拽选区右下角的填充手柄，快速复制或扩展数据序列。
 *
 * 优先级：STRATEGY_PRIORITY.AUTO_FILL
 *
 * 核心功能：
 * 1. **填充手柄检测**：检测鼠标是否在选区右下角的填充手柄上
 * 2. **拖拽填充**：拖拽手柄沿一个方向扩展数据
 * 3. **智能序列检测**：自动检测数值序列步长（如 1,3,5 → 步长2）
 * 4. **四方向填充**：支持上/下/左/右四个方向
 * 5. **循环复制**：源数据不够时循环使用并累加步长
 * 6. **批量操作**：使用 beginBatch/endBatch 优化性能
 *
 * 填充算法：
 * ┌──────────────────────────────────────────────────┐
 * │ 源数据: [1, 3, 5]  步长: 2                       │
 * │ 向下填充: 7, 9, 11, 13, 15, ...                  │
 * │ （每轮循环 = 源值 + 步长 × 源长度 × 循环次数）    │
 * └──────────────────────────────────────────────────┘
 *
 * @class AutoFillStrategy
 * @extends EventStrategy
 */
export class AutoFillStrategy extends EventStrategy {
    /** 策略优先级：自动填充 */
    priority: number = STRATEGY_PRIORITY.AUTO_FILL;

    /** 是否正在执行填充拖拽 */
    #filling: boolean = false;
    /** 源选区范围 */
    #sourceRange: SelectionRange | null = null;
    /** 填充方向：up/down/left/right */
    #fillDirection: string | null = null;
    /** 填充结束行号 */
    #fillEndRow: number = 0;
    /** 填充结束列号 */
    #fillEndCol: number = 0;
    /** 是否占用了光标样式 */
    #cursorOwned: boolean = false;

    constructor(handler: any) {
        super(handler);
    }

    init(): void {}

    destroy(): void {}

    getEventHandlers(): Record<string, (e: Event) => boolean | void> {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e: Event) => this.#onMouseDown(e as MouseEvent),
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: (e: Event) => this.#onCursorCheck(e as MouseEvent),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e: Event) => this.#onMouseMove(e as MouseEvent),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: (e: Event) => this.#onMouseUp(e as MouseEvent),
        };
    }

    #onCursorCheck(e: MouseEvent): false | void {
        if (!this.enabled || !this.handler.sheet) return;

        const canvas = this.handler.canvasContext.canvas;
        if (this.#filling) {
            canvas.style.cursor = "crosshair";
            return false;
        }

        const isFillHandle = this.handler.viewport.fillHandleHitTest(e.clientX, e.clientY);

        if (isFillHandle) {
            canvas.style.cursor = "crosshair";
            this.#cursorOwned = true;
            return false;
        }

        if (this.#cursorOwned) {
            canvas.style.cursor = "";
            this.#cursorOwned = false;
        }
    }

    #onMouseDown(e: MouseEvent): false | void {
        if (!this.enabled || !this.handler.sheet) return;
        if (e.button !== 0) return;

        const isFillHandle = this.handler.viewport.fillHandleHitTest(e.clientX, e.clientY);
        if (!isFillHandle) return;

        e.preventDefault();
        this.#filling = true;

        const range = this.handler.sheet.selection.getRange();
        this.#sourceRange = { ...range };
        this.#fillEndRow = range.bottomRow;
        this.#fillEndCol = range.bottomCol;

        return false;
    }

    #onMouseMove(e: MouseEvent): false | void {
        if (!this.#filling) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (!hit) return false;

        const { row, col } = hit;
        const src = this.#sourceRange!;

        const dr = row - src.bottomRow;
        const dc = col - src.bottomCol;

        if (dr > 0 && dc === 0) {
            this.#fillDirection = "down";
            this.#fillEndRow = row;
            this.#fillEndCol = src.bottomCol;
        } else if (dr < 0 && dc === 0) {
            this.#fillDirection = "up";
            this.#fillEndRow = row;
            this.#fillEndCol = src.bottomCol;
        } else if (dc > 0 && dr === 0) {
            this.#fillDirection = "right";
            this.#fillEndRow = src.bottomRow;
            this.#fillEndCol = col;
        } else if (dc < 0 && dr === 0) {
            this.#fillDirection = "left";
            this.#fillEndRow = src.bottomRow;
            this.#fillEndCol = col;
        } else if (dr !== 0 && dc !== 0) {
            this.#fillDirection = dr > 0 ? "down" : "up";
            this.#fillEndRow = row;
            this.#fillEndCol = src.bottomCol;
        }

        const sheet = this.handler.sheet;
        const newBottomRow = Math.max(src.topRow, this.#fillEndRow);
        const newBottomCol = Math.max(src.topCol, this.#fillEndCol);
        const newTopRow = Math.min(src.topRow, this.#fillEndRow);
        const newTopCol = Math.min(src.topCol, this.#fillEndCol);

        sheet.selection.setRange(src.topRow, src.topCol, newBottomRow, newBottomCol);
        this.handler.render();

        return false;
    }

    #onMouseUp(_e: MouseEvent): void {
        if (!this.#filling) return;
        this.#filling = false;

        this.handler.canvasContext.canvas.style.cursor = "";

        const sheet = this.handler.sheet;
        const src = this.#sourceRange;

        if (!src) return;

        const targetRange = this.#computeTargetRange(src);

        if (targetRange) {
            this.#executeFill(sheet, src, targetRange);
        }

        const finalRange = sheet.selection.getRange();
        sheet.selection.setRange(src.topRow, src.topCol, finalRange.bottomRow, finalRange.bottomCol);

        this.#sourceRange = null;
        this.#fillDirection = null;
        this.handler.viewport.invalidateAll();
        this.handler.render();
    }

    #computeTargetRange(src: SelectionRange): SelectionRange | null {
        const current = this.handler.sheet.selection.getRange();
        const dir = this.#fillDirection;

        if (!dir) return null;

        switch (dir) {
            case "down":
                if (current.bottomRow <= src.bottomRow) return null;
                return {
                    topRow: src.bottomRow + 1,
                    topCol: src.topCol,
                    bottomRow: current.bottomRow,
                    bottomCol: src.bottomCol,
                };
            case "up":
                if (current.topRow >= src.topRow) return null;
                return {
                    topRow: current.topRow,
                    topCol: src.topCol,
                    bottomRow: src.topRow - 1,
                    bottomCol: src.bottomCol,
                };
            case "right":
                if (current.bottomCol <= src.bottomCol) return null;
                return {
                    topRow: src.topRow,
                    topCol: src.bottomCol + 1,
                    bottomRow: src.bottomRow,
                    bottomCol: current.bottomCol,
                };
            case "left":
                if (current.topCol >= src.topCol) return null;
                return {
                    topRow: src.topRow,
                    topCol: current.topCol,
                    bottomRow: src.bottomRow,
                    bottomCol: src.topCol - 1,
                };
            default:
                return null;
        }
    }

    #executeFill(sheet: any, src: SelectionRange, target: SelectionRange): void {
        const dir = this.#fillDirection;

        const accessor = sheet.cellDataAccessor;
        const srcValues = accessor.getValueMatrix(src.topRow, src.topCol, src.bottomRow, src.bottomCol);

        const srcHeight = src.bottomRow - src.topRow + 1;
        const srcWidth = src.bottomCol - src.topCol + 1;

        sheet.beginBatch();
        if (dir === AUTO_FILL_DIR.DOWN || dir === AUTO_FILL_DIR.UP) {
            for (let c = 0; c < srcWidth; c++) {
                const colValues: unknown[] = [];
                for (let r = 0; r < srcHeight; r++) {
                    colValues.push(srcValues[r][c]);
                }
                const step = this.#detectStep(colValues);
                this.#fillColumn(sheet, src, target, c, step, colValues, dir!);
            }
        } else {
            for (let r = 0; r < srcHeight; r++) {
                const rowValues = srcValues[r];
                const step = this.#detectStep(rowValues);
                this.#fillRow(sheet, src, target, r, step, rowValues, dir!);
            }
        }
        sheet.endBatch();
    }

    #detectStep(values: unknown[]): number {
        const nums = values.filter((v) => isNumber(v)) as number[];
        if (nums.length < values.length) return 0;
        if (nums.length === 1) return 1;

        let totalStep = 0;
        for (let i = 1; i < nums.length; i++) {
            totalStep += nums[i] - nums[i - 1];
        }
        return totalStep / (nums.length - 1);
    }

    #fillColumn(
        sheet: any,
        src: SelectionRange,
        target: SelectionRange,
        colOffset: number,
        step: number,
        srcColValues: unknown[],
        dir: string,
    ): void {
        const col = src.topCol + colOffset;
        const srcLen = srcColValues.length;

        if (dir === AUTO_FILL_DIR.DOWN) {
            for (let r = target.topRow; r <= target.bottomRow; r++) {
                if (sheet.isDisabled(r, col)) continue;

                const srcIdx = (r - src.topRow) % srcLen;
                const cycle = Math.floor((r - src.topRow) / srcLen);
                const value = this.#computeValue(srcColValues, srcIdx, step, cycle, srcLen);
                sheet.setCell(r, col, value);
            }
        } else {
            for (let r = target.bottomRow; r >= target.topRow; r--) {
                if (sheet.isDisabled(r, col)) continue;

                const distFromTop = src.topRow - 1 - r;
                const srcIdx = (srcLen - 1 - (distFromTop % srcLen) - 1 + srcLen) % srcLen;
                const cycle = Math.floor(distFromTop / srcLen) + 1;
                const value = this.#computeValueReverse(srcColValues, srcIdx, step, cycle, srcLen);
                sheet.setCell(r, col, value);
            }
        }
    }

    #fillRow(sheet: any, src: SelectionRange, target: SelectionRange, rowOffset: number, step: number, srcRowValues: unknown[], dir: string): void {
        const row = src.topRow + rowOffset;
        const srcLen = srcRowValues.length;

        if (dir === AUTO_FILL_DIR.RIGHT) {
            for (let c = target.topCol; c <= target.bottomCol; c++) {
                if (sheet.isDisabled(row, c)) continue;

                const srcIdx = (c - src.topCol) % srcLen;
                const cycle = Math.floor((c - src.topCol) / srcLen);
                const value = this.#computeValue(srcRowValues, srcIdx, step, cycle, srcLen);
                sheet.setCell(row, c, value);
            }
        } else {
            for (let c = target.bottomCol; c >= target.topCol; c--) {
                if (sheet.isDisabled(row, c)) continue;

                const distFromLeft = src.topCol - 1 - c;
                const srcIdx = (srcLen - 1 - (distFromLeft % srcLen) - 1 + srcLen) % srcLen;
                const cycle = Math.floor(distFromLeft / srcLen) + 1;
                const value = this.#computeValueReverse(srcRowValues, srcIdx, step, cycle, srcLen);
                sheet.setCell(row, c, value);
            }
        }
    }

    #computeValue(srcValues: unknown[], srcIdx: number, step: number, cycle: number, srcLen: number): unknown {
        const base = srcValues[srcIdx];
        if (base == null || base === "") return "";
        if (isNumber(base) && step !== 0) {
            return (base as number) + step * srcLen * cycle;
        }
        if (isNumber(base) && step === 0) {
            return base;
        }
        return base;
    }

    #computeValueReverse(srcValues: unknown[], srcIdx: number, step: number, cycle: number, srcLen: number): unknown {
        const base = srcValues[srcIdx];
        if (base == null || base === "") return "";
        if (isNumber(base) && step !== 0) {
            return (base as number) - step * srcLen * cycle;
        }
        if (isNumber(base) && step === 0) {
            return base;
        }
        return base;
    }
}
