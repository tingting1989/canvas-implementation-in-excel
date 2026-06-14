import { EventStrategy } from "./EventStrategy.js";
import { EVENT_NAMES } from "./eventNames.js";

/**
 * 自动填充策略（AutoFill）
 * 模拟 Excel 的拖拽填充功能：
 * - 鼠标按住选区右下角的填充手柄（绿色小方块）拖拽
 * - 拖拽过程中实时显示填充预览选区
 * - 松开鼠标时执行填充逻辑：
 *   - 数值序列自动递增（如 1,2,3 → 4,5,6）
 *   - 非数值内容直接复制
 *   - 多行多列选区按模式循环填充
 */
export class AutoFillStrategy extends EventStrategy {
    /** mousedown 事件处理器引用 */
    #mouseDownHandler = null;
    /** mousemove 事件处理器引用（document 级，用于拖拽填充） */
    #mouseMoveHandler = null;
    /** mouseup 事件处理器引用 */
    #mouseUpHandler = null;
    /** canvas 上的 mousemove 处理器引用（用于光标样式切换） */
    #cursorHandler = null;

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

    constructor(handler) {
        super(handler);
    }

    init() {
        this.#bindEvents();
    }

    destroy() {
        this.handler.canvas.removeEventListener(EVENT_NAMES.MOUSEDOWN, this.#mouseDownHandler);
        this.handler.canvas.removeEventListener(EVENT_NAMES.MOUSEMOVE, this.#cursorHandler);
        document.removeEventListener(EVENT_NAMES.MOUSEMOVE, this.#mouseMoveHandler);
        document.removeEventListener(EVENT_NAMES.MOUSEUP, this.#mouseUpHandler);
    }

    /**
     * 绑定鼠标事件
     * - mousedown 绑在 canvas 上（仅响应填充手柄区域）
     * - mousemove/mouseup 绑在 document 上（拖拽时鼠标可能移出 canvas）
     * - 额外的 mousemove 绑在 canvas 上（用于光标样式切换）
     */
    #bindEvents() {
        this.#mouseDownHandler = (e) => this.#onMouseDown(e);
        this.#mouseMoveHandler = (e) => this.#onMouseMove(e);
        this.#mouseUpHandler = (e) => this.#onMouseUp(e);
        this.#cursorHandler = (e) => this.#onCursorCheck(e);

        this.handler.canvas.addEventListener(EVENT_NAMES.MOUSEDOWN, this.#mouseDownHandler);
        this.handler.canvas.addEventListener(EVENT_NAMES.MOUSEMOVE, this.#cursorHandler);
        document.addEventListener(EVENT_NAMES.MOUSEMOVE, this.#mouseMoveHandler);
        document.addEventListener(EVENT_NAMES.MOUSEUP, this.#mouseUpHandler);
    }

    /**
     * 光标样式检测
     * 鼠标悬停在填充手柄上时切换为十字光标（crosshair）
     * 拖拽过程中保持十字光标，离开时恢复默认
     */
    #onCursorCheck(e) {
        if (!this.enabled || !this.handler.sheet) return;

        const canvas = this.handler.canvas;
        if (this.#filling) {
            canvas.style.cursor = "crosshair";
            return;
        }

        const isFillHandle = this.handler.renderEngine.fillHandleHitTest(e.clientX, e.clientY);
        canvas.style.cursor = isFillHandle ? "crosshair" : "";
    }

    /**
     * 鼠标按下：检测是否点击了填充手柄
     * 如果是，记录源选区并进入填充拖拽状态
     */
    #onMouseDown(e) {
        if (!this.enabled || !this.handler.sheet) return;
        if (e.button !== 0) return;

        const isFillHandle = this.handler.renderEngine.fillHandleHitTest(e.clientX, e.clientY);
        if (!isFillHandle) return;

        e.preventDefault();
        this.#filling = true;

        const range = this.handler.sheet.selection.getRange();
        this.#sourceRange = { ...range };
        this.#fillEndRow = range.bottomRow;
        this.#fillEndCol = range.bottomCol;
    }

    /**
     * 鼠标移动：如果正在拖拽填充，计算填充方向和目标范围
     * 实时更新选区以显示填充预览
     */
    #onMouseMove(e) {
        if (!this.#filling) return;

        const hit = this.handler.renderEngine.hitTest(e.clientX, e.clientY);
        if (!hit) return;

        const { row, col } = hit;
        const src = this.#sourceRange;

        /* 确定填充方向：只能沿一个方向填充（优先纵向） */
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
            /* 对角拖拽时优先纵向 */
            this.#fillDirection = dr > 0 ? "down" : "up";
            this.#fillEndRow = row;
            this.#fillEndCol = src.bottomCol;
        }

        /* 更新选区以显示填充预览范围 */
        const sheet = this.handler.sheet;
        const newBottomRow = Math.max(src.topRow, this.#fillEndRow);
        const newBottomCol = Math.max(src.topCol, this.#fillEndCol);
        const newTopRow = Math.min(src.topRow, this.#fillEndRow);
        const newTopCol = Math.min(src.topCol, this.#fillEndCol);

        sheet.selection.setRange(src.topRow, src.topCol, newBottomRow, newBottomCol);
        this.handler.render();
    }

    /**
     * 鼠标松开：执行填充逻辑
     * 根据源选区的内容和填充方向，计算填充值并写入目标单元格
     */
    #onMouseUp(e) {
        if (!this.#filling) return;
        this.#filling = false;

        /* 拖拽结束，恢复默认光标 */
        this.handler.canvas.style.cursor = "";

        const sheet = this.handler.sheet;
        const src = this.#sourceRange;

        if (!src) return;

        /* 计算实际填充目标范围（不包含源选区本身） */
        const targetRange = this.#computeTargetRange(src);

        if (targetRange) {
            this.#executeFill(sheet, src, targetRange);
        }

        /* 恢复选区为填充后的完整范围 */
        const finalRange = sheet.selection.getRange();
        sheet.selection.setRange(src.topRow, src.topCol, finalRange.bottomRow, finalRange.bottomCol);

        this.#sourceRange = null;
        this.#fillDirection = null;
        this.handler.renderEngine.invalidateAll();
        this.handler.render();
    }

    /**
     * 计算填充目标范围
     * 目标范围 = 扩展后的选区 - 源选区
     * 只返回需要填充的新区域
     *
     * @param {object} src - 源选区 { topRow, topCol, bottomRow, bottomCol }
     * @returns {object|null} 目标范围，如果无扩展则返回 null
     */
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

    /**
     * 执行填充逻辑
     * 1. 读取源选区的值
     * 2. 检测数值序列模式（等差数列）
     * 3. 按方向逐行/列填充目标区域
     *
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表
     * @param {object} src - 源选区
     * @param {object} target - 目标范围
     */
    #executeFill(sheet, src, target) {
        const dir = this.#fillDirection;

        /* 读取源选区的所有值，构建二维数组 */
        const srcValues = [];
        for (let r = src.topRow; r <= src.bottomRow; r++) {
            const rowData = [];
            for (let c = src.topCol; c <= src.bottomCol; c++) {
                const cell = sheet.cellStore.get(r, c);
                rowData.push(cell ? cell.value : "");
            }
            srcValues.push(rowData);
        }

        /* 检测每列/行的数值序列模式 */
        const srcHeight = src.bottomRow - src.topRow + 1;
        const srcWidth = src.bottomCol - src.topCol + 1;

        if (dir === "down" || dir === "up") {
            /* 纵向填充：按列处理 */
            for (let c = 0; c < srcWidth; c++) {
                const colValues = [];
                for (let r = 0; r < srcHeight; r++) {
                    colValues.push(srcValues[r][c]);
                }
                const step = this.#detectStep(colValues);
                this.#fillColumn(sheet, src, target, c, step, colValues, dir);
            }
        } else {
            /* 横向填充：按行处理 */
            for (let r = 0; r < srcHeight; r++) {
                const rowValues = srcValues[r];
                const step = this.#detectStep(rowValues);
                this.#fillRow(sheet, src, target, r, step, rowValues, dir);
            }
        }
    }

    /**
     * 检测数值序列的步长
     * 如果源数据全是数字，计算等差步长
     * - 单个数值：步长为 1（递增）
     * - 两个及以上数值：步长 = 后项 - 前项的平均值
     * - 非数值：步长为 0（复制模式）
     *
     * @param {Array} values - 源数据值数组
     * @returns {number} 步长
     */
    #detectStep(values) {
        const nums = values.filter(v => typeof v === "number");
        if (nums.length < values.length) return 0;

        if (nums.length === 1) return 1;

        let totalStep = 0;
        for (let i = 1; i < nums.length; i++) {
            totalStep += nums[i] - nums[i - 1];
        }
        return totalStep / (nums.length - 1);
    }

    /**
     * 纵向填充一列
     * 从源选区底部向下（或顶部向上）逐行填充
     *
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表
     * @param {object} src - 源选区
     * @param {object} target - 目标范围
     * @param {number} colOffset - 列偏移（相对于源选区左边界）
     * @param {number} step - 数值步长
     * @param {Array} srcColValues - 源列值数组
     * @param {string} dir - 填充方向 "down" 或 "up"
     */
    #fillColumn(sheet, src, target, colOffset, step, srcColValues, dir) {
        const col = src.topCol + colOffset;
        const srcLen = srcColValues.length;

        if (dir === "down") {
            for (let r = target.topRow; r <= target.bottomRow; r++) {
                const srcIdx = (r - src.topRow) % srcLen;
                const cycle = Math.floor((r - src.topRow) / srcLen);
                const value = this.#computeValue(srcColValues, srcIdx, step, cycle, srcLen);
                sheet.setCell(r, col, value);
            }
        } else {
            /* 向上填充：从源选区顶部向上递减 */
            for (let r = target.bottomRow; r >= target.topRow; r--) {
                const distFromTop = src.topRow - 1 - r;
                const srcIdx = (srcLen - 1 - (distFromTop % srcLen) - 1 + srcLen) % srcLen;
                const cycle = Math.floor(distFromTop / srcLen) + 1;
                const value = this.#computeValueReverse(srcColValues, srcIdx, step, cycle, srcLen);
                sheet.setCell(r, col, value);
            }
        }
    }

    /**
     * 横向填充一行
     * 从源选区右边界向右（或左边界向左）逐列填充
     *
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表
     * @param {object} src - 源选区
     * @param {object} target - 目标范围
     * @param {number} rowOffset - 行偏移（相对于源选区上边界）
     * @param {number} step - 数值步长
     * @param {Array} srcRowValues - 源行值数组
     * @param {string} dir - 填充方向 "right" 或 "left"
     */
    #fillRow(sheet, src, target, rowOffset, step, srcRowValues, dir) {
        const row = src.topRow + rowOffset;
        const srcLen = srcRowValues.length;

        if (dir === "right") {
            for (let c = target.topCol; c <= target.bottomCol; c++) {
                const srcIdx = (c - src.topCol) % srcLen;
                const cycle = Math.floor((c - src.topCol) / srcLen);
                const value = this.#computeValue(srcRowValues, srcIdx, step, cycle, srcLen);
                sheet.setCell(row, c, value);
            }
        } else {
            /* 向左填充：从源选区左边界向左递减 */
            for (let c = target.bottomCol; c >= target.topCol; c--) {
                const distFromLeft = src.topCol - 1 - c;
                const srcIdx = (srcLen - 1 - (distFromLeft % srcLen) - 1 + srcLen) % srcLen;
                const cycle = Math.floor(distFromLeft / srcLen) + 1;
                const value = this.#computeValueReverse(srcRowValues, srcIdx, step, cycle, srcLen);
                sheet.setCell(row, c, value);
            }
        }
    }

    /**
     * 计算向下/向右填充时的值
     * - 数值类型：基础值 + 步长 × 周期数
     * - 非数值类型：循环复制
     *
     * @param {Array} srcValues - 源值数组
     * @param {number} srcIdx - 当前循环到源数组中的索引
     * @param {number} step - 步长
     * @param {number} cycle - 当前是第几个完整循环（从 0 开始）
     * @param {number} srcLen - 源数组长度
     * @returns {string|number} 填充值
     */
    #computeValue(srcValues, srcIdx, step, cycle, srcLen) {
        const base = srcValues[srcIdx];
        if (base == null || base === "") return "";
        if (typeof base === "number" && step !== 0) {
            return base + step * srcLen * (cycle + 1);
        }
        if (typeof base === "number" && step === 0) {
            return base;
        }
        return base;
    }

    /**
     * 计算向上/向左填充时的值（反向递减）
     *
     * @param {Array} srcValues - 源值数组
     * @param {number} srcIdx - 当前循环到源数组中的索引
     * @param {number} step - 步长
     * @param {number} cycle - 当前是第几个完整循环（从 1 开始）
     * @param {number} srcLen - 源数组长度
     * @returns {string|number} 填充值
     */
    #computeValueReverse(srcValues, srcIdx, step, cycle, srcLen) {
        const base = srcValues[srcIdx];
        if (base == null || base === "") return "";
        if (typeof base === "number" && step !== 0) {
            return base - step * srcLen * cycle;
        }
        if (typeof base === "number" && step === 0) {
            return base;
        }
        return base;
    }
}