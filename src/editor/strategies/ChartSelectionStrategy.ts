import { CONFIG } from "../../constants/config.js";
import { NativeChartRenderer } from "../../render/chart/NativeChartRenderer.js";
import { HIT_TYPE } from "../../constants/hitType.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";
import { EventStrategy } from "./EventStrategy.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";

/** 拖拽启动阈值（像素），避免微小移动误触发拖拽 */
const DRAG_THRESHOLD = 3;

/**
 * 图表选区交互策略 (Chart Selection Strategy)
 *
 * 处理Canvas表格中嵌入图表的选中和编辑交互。
 * 支持图表的选择、移动、拖拽调整大小等操作。
 *
 * 优先级：STRATEGY_PRIORITY.CHART_INTERACTION
 *
 * 核心功能：
 * 1. **图表选中**：点击图表区域选中图表，显示虚线边框和8个调整手柄
 * 2. **图表移动**：拖拽图表主体区域移动图表位置
 * 3. **图表调整大小**：拖拽8个手柄（nw/n/ne/e/se/s/sw/w）调整图表尺寸
 * 4. **数据点悬停**：悬停在图表数据点上显示提示信息
 * 5. **键盘操作**：Delete/Backspace删除图表，Escape取消选中
 * 6. **渲染节流**：使用requestAnimationFrame节流拖拽渲染，保证流畅性
 * 7. **最小尺寸约束**：调整大小时确保不小于CHART_MIN_WIDTH/HEIGHT
 *
 * 手柄布局：
 * ┌───[nw]────[n]────[ne]───┐
 * │                          │
 * [w]      图表区域         [e]
 * │                          │
 * └───[sw]────[s]────[se]───┘
 *
 * @class ChartSelectionStrategy
 * @extends EventStrategy
 */
export class ChartSelectionStrategy extends EventStrategy {
    /** 策略优先级：图表交互 */
    priority: number = STRATEGY_PRIORITY.CHART_INTERACTION;

    /** 当前选中的图表ID */
    #selectedChartId: string | null = null;
    /** 是否处于移动准备状态（mousedown后未超过阈值） */
    #isMoving: boolean = false;
    /** 是否正在拖拽移动图表 */
    #isDragging: boolean = false;
    /** 是否正在拖拽调整图表大小 */
    #isResizing: boolean = false;
    /** 当前拖拽的调整手柄名称 */
    #resizeHandle: string | null = null;
    /** 拖拽起始X坐标（相对Canvas） */
    #dragStartX: number = 0;
    /** 拖拽起始Y坐标（相对Canvas） */
    #dragStartY: number = 0;
    /** 图表拖拽起始偏移X */
    #dragStartOffsetX: number = 0;
    /** 图表拖拽起始偏移Y */
    #dragStartOffsetY: number = 0;
    /** 图表拖拽起始宽度 */
    #dragStartWidth: number = 0;
    /** 图表拖拽起始高度 */
    #dragStartHeight: number = 0;
    /** mousedown时的客户端X坐标 */
    #mouseDownX: number = 0;
    /** mousedown时的客户端Y坐标 */
    #mouseDownY: number = 0;
    /** 上次渲染时间戳，用于节流 */
    #lastRenderTime: number = 0;
    /** 待处理的requestAnimationFrame ID */
    #pendingUpdate: number | null = null;
    /** 最新客户端X坐标（用于RAF回调） */
    #lastClientX: number = 0;
    /** 最新客户端Y坐标（用于RAF回调） */
    #lastClientY: number = 0;

    constructor(handler: any) {
        super(handler);
    }

    init(): void {}

    destroy(): void {
        if (this.#pendingUpdate) {
            cancelAnimationFrame(this.#pendingUpdate);
            this.#pendingUpdate = null;
        }
        this.#selectedChartId = null;
        this.#isMoving = false;
        this.#isDragging = false;
        this.#isResizing = false;
    }

    getEventHandlers(): Record<string, (e: Event) => boolean | void> {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e: Event) => this.#onMouseDown(e as MouseEvent),
            [DELEGATE_KEYS.CANVAS_MOUSEMOVE]: (e: Event) => this.#onHover(e as MouseEvent),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e: Event) => this.#onMouseMove(e as MouseEvent),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: (e: Event) => this.#onMouseUp(e as MouseEvent),
            [DELEGATE_KEYS.DOCUMENT_KEYDOWN]: (e: Event) => this.#onKeyDown(e as KeyboardEvent),
        };
    }

    #getChartManager(): any | null {
        return this.handler.sheet?.chartManager || null;
    }

    #syncSelectionToLayer(): void {
        const layer = this.handler.viewport.chartLayer;
        if (layer) {
            layer.selectedChartId = this.#selectedChartId;
        }
    }

    #onMouseDown(e: MouseEvent): boolean | void {
        if (!this.enabled || !this.handler.sheet) return;
        if (e.button !== 0) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (!hit || hit.type !== HIT_TYPE.CHART) {
            if (this.#selectedChartId) {
                this.#deselect();
                return true;
            }
            return;
        }

        const chart = hit.chart;
        if (!chart) return;

        this.#isMoving = true;
        this.#isDragging = false;
        this.#isResizing = false;
        this.#selectedChartId = chart.id;
        this.#syncSelectionToLayer();

        const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;

        const handle = this.#hitHandle(px, py, chart, hit.bounds);
        if (handle) {
            this.#resizeHandle = handle;
        }

        this.#mouseDownX = e.clientX;
        this.#mouseDownY = e.clientY;
        this.#dragStartX = px;
        this.#dragStartY = py;
        this.#dragStartOffsetX = chart.offsetX;
        this.#dragStartOffsetY = chart.offsetY;
        this.#dragStartWidth = chart.width;
        this.#dragStartHeight = chart.height;

        this.handler.viewport.invalidateAll();
        this.handler.render();

        return false;
    }

    #onHover(e: MouseEvent): false | void {
        if (!this.enabled || !this.handler.sheet) return;
        if (this.#isMoving) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (hit && hit.type === HIT_TYPE.CHART) {
            const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const handle = this.#hitHandle(px, py, hit.chart, hit.bounds);

            const chartBounds = hit.chart.getBounds(hit.vt);
            const localX = px - chartBounds.x;
            const localY = py - chartBounds.y;

            const data = hit.chart._cachedData;
            if (data && data.data && data.data.length) {
                const plotArea = {
                    x: 56,
                    y: 36,
                    w: hit.chart.width - 56 - 20,
                    h: hit.chart.height - 36 - 44,
                };
                const yScale = NativeChartRenderer.buildYScale(data, hit.chart.type);
                const hoverInfo = NativeChartRenderer.hitTestDataPoint(localX, localY, hit.chart.type, data, plotArea, yScale);

                if (hoverInfo) {
                    hoverInfo.pointX = chartBounds.x + hoverInfo.pointX;
                    hoverInfo.pointY = chartBounds.y + hoverInfo.pointY;
                    hoverInfo.chartType = hit.chart.type;
                    this.handler.viewport.chartLayer.setHoverInfo(hit.chartId, hoverInfo);
                } else {
                    this.handler.viewport.chartLayer.setHoverInfo(hit.chartId, null);
                }
            }

            this.handler.canvasContext.canvas.style.cursor = handle ? this.#getCursorForHandle(handle) : "move";
            return false;
        }

        this.handler.canvasContext.canvas.style.cursor = "";
        this.handler.viewport.chartLayer.setHoverInfo(null, null);
    }

    #onMouseMove(e: MouseEvent): false | void {
        if (!this.#isMoving) return;

        if (!this.#isDragging && !this.#isResizing) {
            const dx = Math.abs(e.clientX - this.#mouseDownX);
            const dy = Math.abs(e.clientY - this.#mouseDownY);
            if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;

            if (this.#resizeHandle) {
                this.#isResizing = true;
            } else {
                this.#isDragging = true;
            }
        }

        const now = performance.now();
        if (now - this.#lastRenderTime < 16) {
            this.#lastClientX = e.clientX;
            this.#lastClientY = e.clientY;
            if (!this.#pendingUpdate) {
                this.#pendingUpdate = requestAnimationFrame(() => {
                    this.#pendingUpdate = null;
                    this.#processMove(this.#lastClientX, this.#lastClientY);
                });
            }
            return false;
        }

        this.#lastRenderTime = now;
        this.#processMove(e.clientX, e.clientY);
        return false;
    }

    #processMove(clientX: number, clientY: number): void {
        const rect = this.handler.canvasContext.canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const dx = px - this.#dragStartX;
        const dy = py - this.#dragStartY;

        const cm = this.#getChartManager();
        if (!cm) return;

        if (this.#isDragging) {
            cm.update(this.#selectedChartId, {
                offsetX: this.#dragStartOffsetX + dx,
                offsetY: this.#dragStartOffsetY + dy,
            });
            this.handler.canvasContext.canvas.style.cursor = "move";
        } else if (this.#isResizing) {
            let newW = this.#dragStartWidth;
            let newH = this.#dragStartHeight;
            const h = this.#resizeHandle!;
            if (h.includes("e")) newW = Math.max(CONFIG.CHART_MIN_WIDTH, this.#dragStartWidth + dx);
            if (h.includes("w")) newW = Math.max(CONFIG.CHART_MIN_WIDTH, this.#dragStartWidth - dx);
            if (h.includes("s")) newH = Math.max(CONFIG.CHART_MIN_HEIGHT, this.#dragStartHeight + dy);
            if (h.includes("n")) newH = Math.max(CONFIG.CHART_MIN_HEIGHT, this.#dragStartHeight - dy);
            cm.update(this.#selectedChartId, { width: newW, height: newH });
            this.handler.canvasContext.canvas.style.cursor = this.#getCursorForHandle(h);
        }

        this.handler.viewport.chartLayer?.markDirty();
        this.handler.render();
    }

    #onMouseUp(_e: MouseEvent): void {
        if (!this.#isMoving) return;
        this.#isMoving = false;
        this.#isDragging = false;
        this.#isResizing = false;
        this.#resizeHandle = null;
        this.handler.canvasContext.canvas.style.cursor = "";

        if (this.#pendingUpdate) {
            cancelAnimationFrame(this.#pendingUpdate);
            this.#pendingUpdate = null;
        }

        this.handler.viewport.invalidateAll();
        this.handler.render();
    }

    #onKeyDown(e: KeyboardEvent): false | void {
        if (!this.#selectedChartId) return;
        if (e.key === "Delete" || e.key === "Backspace") {
            const cm = this.#getChartManager();
            if (cm) {
                cm.remove(this.#selectedChartId);
                this.#selectedChartId = null;
                this.#syncSelectionToLayer();
            }
            this.handler.viewport.invalidateAll();
            this.handler.render();
            return false;
        }
        if (e.key === "Escape") {
            this.#deselect();
            return false;
        }
    }

    #deselect(): void {
        this.#selectedChartId = null;
        this.#syncSelectionToLayer();
        this.handler.viewport.invalidateAll();
        this.handler.render();
    }

    #hitHandle(px: number, py: number, _chart: any, bounds: { x: number; y: number; w: number; h: number } | null): string | null {
        const b = bounds;
        if (!b) return null;
        const handles = this.#getHandlePositions(b);
        const half = CONFIG.CHART_SELECTION_HANDLE_SIZE / 2;
        for (const [name, pos] of Object.entries(handles)) {
            if (px >= pos.x - half && px <= pos.x + half && py >= pos.y - half && py <= pos.y + half) {
                return name;
            }
        }
        return null;
    }

    #getHandlePositions(b: { x: number; y: number; w: number; h: number }): Record<string, { x: number; y: number }> {
        const mx = b.x + b.w / 2;
        const my = b.y + b.h / 2;
        return {
            nw: { x: b.x, y: b.y },
            n: { x: mx, y: b.y },
            ne: { x: b.x + b.w, y: b.y },
            e: { x: b.x + b.w, y: my },
            se: { x: b.x + b.w, y: b.y + b.h },
            s: { x: mx, y: b.y + b.h },
            sw: { x: b.x, y: b.y + b.h },
            w: { x: b.x, y: my },
        };
    }

    #getCursorForHandle(handle: string): string {
        const cursorMap: Record<string, string> = {
            nw: "nwse-resize",
            se: "nwse-resize",
            ne: "nesw-resize",
            sw: "nesw-resize",
            n: "ns-resize",
            s: "ns-resize",
            e: "ew-resize",
            w: "ew-resize",
        };
        return cursorMap[handle] || "default";
    }

    renderSelectionOverlay(ctx: CanvasRenderingContext2D, chart: any, vt: any): void {
        if (!this.#selectedChartId || !chart || chart.id !== this.#selectedChartId) return;
        const b = chart.getBounds(vt);
        if (!b) return;
        ctx.save();
        ctx.strokeStyle = CONFIG.CHART_SELECTION_BORDER_COLOR;
        ctx.lineWidth = CONFIG.CHART_SELECTION_BORDER_WIDTH;
        ctx.setLineDash(CONFIG.UI_DASH_PATTERN);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.setLineDash([]);
        const handles = this.#getHandlePositions(b);
        const half = CONFIG.CHART_SELECTION_HANDLE_SIZE / 2;
        for (const pos of Object.values(handles)) {
            ctx.fillStyle = CONFIG.CHART_SELECTION_HANDLE_FILL;
            ctx.strokeStyle = CONFIG.CHART_SELECTION_BORDER_COLOR;
            ctx.lineWidth = CONFIG.CHART_SELECTION_HANDLE_LINE_WIDTH;
            ctx.fillRect(pos.x - half, pos.y - half, CONFIG.CHART_SELECTION_HANDLE_SIZE, CONFIG.CHART_SELECTION_HANDLE_SIZE);
            ctx.strokeRect(pos.x - half, pos.y - half, CONFIG.CHART_SELECTION_HANDLE_SIZE, CONFIG.CHART_SELECTION_HANDLE_SIZE);
        }
        ctx.restore();
    }

    get selectedChartId(): string | null {
        return this.#selectedChartId;
    }
}
