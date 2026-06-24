import { EventStrategy } from "./EventStrategy.js";
import { HIT_TYPE } from "../../constants/hitType";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { HOOKS } from "../../constants/hookNames.js";

/** 拖拽启动阈值（像素），鼠标移动超过此距离才视为拖拽开始 */
const DRAG_THRESHOLD = 3;

/**
 * 行拖拽移动策略
 *
 * 交互流程：
 * 1. 鼠标在行头区域按下 → 记录源行
 * 2. 鼠标移动超过阈值 → 进入拖拽状态，显示幽灵行和插入指示器
 * 3. 鼠标松开 → 执行 moveRow，调整选区，触发钩子
 *
 * 渲染委托给 HeaderRenderer.setRowMoveState()，
 * 本策略只负责交互逻辑和状态传递。
 */
export class RowMoveStrategy extends EventStrategy {
    /** 优先级低于列移动（80），避免同时拖列和行时冲突 */
    priority = 79;

    /** 是否处于 mousedown 状态（尚未超过拖拽阈值） */
    #moving = false;
    /** 是否已进入真正的拖拽状态（移动距离超过阈值） */
    #dragStarted = false;
    /** 拖拽源行索引 */
    #sourceRow = -1;
    /** 拖拽目标行索引（鼠标当前位置对应的行） */
    #targetRow = -1;
    /** 拖拽起始时鼠标在 canvas 内的 Y 坐标 */
    #dragStartY = 0;
    /** mousedown 时鼠标在屏幕上的 Y 坐标（用于计算阈值） */
    #mouseDownY = 0;

    /** 是否由本策略设置了光标（用于光标所有权管理） */
    #cursorOwned = false;

    constructor(handler) {
        super(handler);
    }

    init() {}

    destroy() {
        this.#clearIndicator();
    }

    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => this.#onMouseDown(e),
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: (e) => this.#onHover(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e) => this.#onMouseMove(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: (e) => this.#onMouseUp(e),
        };
    }

    /**
     * 鼠标按下：仅在行头区域且非调整行高时启动拖拽准备
     */
    #onMouseDown(e) {
        if (!this.enabled || !this.handler.sheet) return;
        if (e.button !== 0) return;

        const resizeHit = this.handler.renderEngine.headerHitTest(e.clientX, e.clientY);
        if (resizeHit) return;

        const hit = this.handler.renderEngine.hitTest(e.clientX, e.clientY);
        if (!hit || hit.type !== HIT_TYPE.ROW_HEADER) return;

        this.#moving = true;
        this.#dragStarted = false;
        this.#sourceRow = hit.index;
        this.#targetRow = hit.index;

        const rect = this.handler.canvas.getBoundingClientRect();
        this.#mouseDownY = e.clientY;
        this.#dragStartY = e.clientY - rect.top;
    }

    /**
     * 鼠标悬停：在行头区域显示 grab 光标
     * 拖拽进行中时不处理
     *
     * 光标所有权机制：
     * - 设置光标时 return false 阻止低优先级策略覆盖
     * - 仅在本策略曾设置光标时才清除，避免误清其他策略的光标
     */
    #onHover(e) {
        if (!this.enabled || !this.handler.sheet) return;
        if (this.#moving) return;

        const resizeHit = this.handler.renderEngine.headerHitTest(e.clientX, e.clientY);
        if (resizeHit) return;

        const hit = this.handler.renderEngine.hitTest(e.clientX, e.clientY);
        if (hit && hit.type === HIT_TYPE.ROW_HEADER) {
            this.handler.canvas.style.cursor = "grab";
            this.#cursorOwned = true;
            return false;
        }

        if (this.#cursorOwned) {
            this.handler.canvas.style.cursor = "";
            this.#cursorOwned = false;
        }
    }

    /**
     * 鼠标移动（document 级别监听）：
     * - 首次超过阈值时进入拖拽状态
     * - 持续更新目标行和幽灵行位置
     * - 返回 false 阻止低优先级策略处理同一事件
     */
    #onMouseMove(e) {
        if (!this.#moving) return;

        // 拖拽阈值检测
        if (!this.#dragStarted) {
            const dy = Math.abs(e.clientY - this.#mouseDownY);
            if (dy < DRAG_THRESHOLD) return;

            this.#dragStarted = true;
            this.handler.canvas.style.cursor = "grabbing";
        }

        // 更新目标行：行头或单元格区域均可
        const hit = this.handler.renderEngine.hitTest(e.clientX, e.clientY);
        if (hit && (hit.type === HIT_TYPE.ROW_HEADER || hit.type === HIT_TYPE.CELL)) {
            this.#targetRow = hit.type === HIT_TYPE.ROW_HEADER ? hit.index : hit.row;
        }

        // 传递拖拽状态给 HeaderRenderer 渲染幽灵行和插入指示器
        const rc = this.handler.sheet.rowColManager;
        const rect = this.handler.canvas.getBoundingClientRect();
        const dragY = e.clientY - rect.top;

        this.handler.renderEngine.dragIndicatorLayer.setRowMoveState({
            sourceRow: this.#sourceRow,
            targetRow: this.#targetRow,
            dragY: dragY,
            dragStartY: this.#dragStartY,
            rowH: rc.getRowHeight(this.#sourceRow),
        });

        this.handler.renderEngine.invalidateAll();
        this.handler.render();

        return false;
    }

    /**
     * 鼠标松开：
     * 1. 触发 beforeRowMove 钩子（可取消）
     * 2. 执行 Sheet.moveRow 数据移动
     * 3. 调整选区到新位置
     * 4. 触发 afterRowMove 钩子
     */
    #onMouseUp(e) {
        if (!this.#moving) return;
        this.#moving = false;
        this.handler.canvas.style.cursor = "";

        this.#clearIndicator();

        if (this.#dragStarted && this.#sourceRow !== this.#targetRow && this.#targetRow >= 0) {
            // 钩子可返回 false 阻止移动
            const cancelled = this.handler.runHooksUntil(HOOKS.BEFORE_ROW_MOVE, this.#sourceRow, this.#targetRow);
            if (cancelled === false) {
                this.#sourceRow = -1;
                this.#targetRow = -1;
                this.#dragStarted = false;
                this.handler.renderEngine.invalidateAll();
                this.handler.render();
                return;
            }

            // 执行行移动
            this.handler.sheet.moveRow(this.#sourceRow, this.#targetRow);

            // 调整选区：跟随源行移动到目标位置
            const sheet = this.handler.sheet;
            const range = sheet.selection.getRange();
            const delta = this.#targetRow - this.#sourceRow;
            const newTopRow = Math.max(0, range.topRow + (delta > 0 ? 1 : 0));
            const newBottomRow = Math.max(0, range.bottomRow + (delta > 0 ? 1 : 0));
            sheet.selection.setRange(newTopRow, range.topCol, newBottomRow, range.bottomCol);

            this.handler.runHooks(HOOKS.AFTER_ROW_MOVE, this.#sourceRow, this.#targetRow);
        }

        this.#sourceRow = -1;
        this.#targetRow = -1;
        this.#dragStarted = false;

        this.handler.renderEngine.invalidateAll();
        this.handler.render();
    }

    /** 清除 HeaderRenderer 中的行移动指示器 */
    #clearIndicator() {
        if (this.handler.renderEngine?.dragIndicatorLayer) {
            this.handler.renderEngine.dragIndicatorLayer.setRowMoveState(null);
        }
    }
}
