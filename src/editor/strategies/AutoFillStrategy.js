import { EventStrategy } from "./EventStrategy.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { isNumber } from "../../utils/utils.js";

/**
 * 自动填充策略（AutoFill）
 * 优先级较高（90），确保填充手柄事件优先于普通选区策略处理
 *
 * 模拟 Excel 的拖拽填充功能：
 * - 鼠标按住选区右下角的填充手柄（绿色小方块）拖拽
 * - 拖拽过程中实时显示填充预览选区
 * - 松开鼠标时执行填充逻辑：
 *   - 数值序列自动递增（如 1,2,3 → 4,5,6）
 *   - 非数值内容直接复制
 *   - 多行多列选区按模式循环填充
 */
export class AutoFillStrategy extends EventStrategy {
    priority = 90;

    /** 是否正在拖拽填充 */
    #filling = false;

    /** 源选区（拖拽开始时的选区范围） */
    #sourceRange = null;

    /** 填充方向：down / up / right / left */
    #fillDirection = null;

    /** 填充目标终点行号 */
    #fillEndRow = 0;

    /** 填充目标终点列号 */
    #fillEndCol = 0;

    /** 是否由本策略设置了光标（用于光标所有权管理） */
    #cursorOwned = false;

    constructor(handler) {
        super(handler);
    }

    init() {}

    destroy() {}

    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => this.#onMouseDown(e),
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: (e) => this.#onCursorCheck(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e) => this.#onMouseMove(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: (e) => this.#onMouseUp(e),
        };
    }

    /**
     * 光标样式检测
     * 鼠标悬停在填充手柄上时切换为十字光标（crosshair）
     * 拖拽过程中保持十字光标，离开时恢复默认
     *
     * 光标所有权机制：
     * - 设置光标时 return false 阻止低优先级策略覆盖
     * - 仅在本策略曾设置光标时才清除，避免误清其他策略的光标
     */
    #onCursorCheck(e) {
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

    /**
     * 鼠标按下：检测是否点击了填充手柄
     * 如果是，记录源选区并进入填充拖拽状态
     * 返回 false 阻止 MouseStrategy 处理同一事件
     */
    #onMouseDown(e) {
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

    /**
     * 鼠标移动：如果正在拖拽填充，计算填充方向和目标范围
     * 实时更新选区以显示填充预览
     * 返回 false 阻止 MouseStrategy 处理拖拽选区
     */
    #onMouseMove(e) {
        if (!this.#filling) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (!hit) return false;

        const { row, col } = hit;
        const src = this.#sourceRange;

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

    /**
     * 鼠标松开：执行填充逻辑
     * 根据源选区的内容和填充方向，计算填充值并写入目标单元格
     */
    #onMouseUp(e) {
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

    #computeTargetRange(src) {
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

    #executeFill(sheet, src, target) {
        const dir = this.#fillDirection;

        const srcValues = [];
        for (let r = src.topRow; r <= src.bottomRow; r++) {
            const rowData = [];
            const realR = sheet.toRealRow(r);
            for (let c = src.topCol; c <= src.bottomCol; c++) {
                const cell = sheet.cellStore.get(realR, c);
                rowData.push(cell ? cell.value : "");
            }
            srcValues.push(rowData);
        }

        const srcHeight = src.bottomRow - src.topRow + 1;
        const srcWidth = src.bottomCol - src.topCol + 1;

        sheet.beginBatch();
        if (dir === "down" || dir === "up") {
            for (let c = 0; c < srcWidth; c++) {
                const colValues = [];
                for (let r = 0; r < srcHeight; r++) {
                    colValues.push(srcValues[r][c]);
                }
                const step = this.#detectStep(colValues);
                this.#fillColumn(sheet, src, target, c, step, colValues, dir);
            }
        } else {
            for (let r = 0; r < srcHeight; r++) {
                const rowValues = srcValues[r];
                const step = this.#detectStep(rowValues);
                this.#fillRow(sheet, src, target, r, step, rowValues, dir);
            }
        }
        sheet.endBatch();
    }

    #detectStep(values) {
        const nums = values.filter((v) => isNumber(v));
        if (nums.length < values.length) return 0;
        if (nums.length === 1) return 1;

        let totalStep = 0;
        for (let i = 1; i < nums.length; i++) {
            totalStep += nums[i] - nums[i - 1];
        }
        return totalStep / (nums.length - 1);
    }

    #fillColumn(sheet, src, target, colOffset, step, srcColValues, dir) {
        const col = src.topCol + colOffset;
        const srcLen = srcColValues.length;

        if (dir === "down") {
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

    #fillRow(sheet, src, target, rowOffset, step, srcRowValues, dir) {
        const row = src.topRow + rowOffset;
        const srcLen = srcRowValues.length;

        if (dir === "right") {
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

    #computeValue(srcValues, srcIdx, step, cycle, srcLen) {
        const base = srcValues[srcIdx];
        if (base == null || base === "") return "";
        if (isNumber(base) && step !== 0) {
            return base + step * srcLen * cycle;
        }
        if (isNumber(base) && step === 0) {
            return base;
        }
        return base;
    }

    #computeValueReverse(srcValues, srcIdx, step, cycle, srcLen) {
        const base = srcValues[srcIdx];
        if (base == null || base === "") return "";
        if (isNumber(base) && step !== 0) {
            return base - step * srcLen * cycle;
        }
        if (isNumber(base) && step === 0) {
            return base;
        }
        return base;
    }
}