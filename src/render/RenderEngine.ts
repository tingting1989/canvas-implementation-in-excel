import { ScrollManager } from "../ui/ScrollManager.js";
import { SheetTabManager } from "../ui/sheetTab/SheetTabManager.js";
import { ViewportTransform } from "./ViewportTransform.js";
import { EVENT_NAMES } from "../constants/eventNames.js";
import { CONFIG } from "../constants/config.js";
import { HIT_TYPE } from "../constants/hitType.js";
import { CONTENT_TYPE } from "../constants/enums/ContentType.js";
import { SELECTION_CONFIG } from "../constants/selectionConfig.js";
import { LayerCompositor } from "./LayerCompositor.js";
import { TileLayer } from "./layers/TileLayer.js";
import { SelectionLayer } from "./layers/SelectionLayer.js";
import { FrozenLayer } from "./layers/FrozenLayer.js";
import { InteractionLayer } from "./layers/InteractionLayer.js";
import { HeaderLayer } from "./layers/HeaderLayer.js";
import { ChartLayer } from "./layers/ChartLayer.js";
import { ReactiveStore } from "../state/ReactiveStore.js";
import { DOMComponent } from "../core/DOMComponent.js";
import type { Sheet } from "../workbook/Sheet.js";

/** 视口坐标矩形 */
interface ViewRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** 命中测试结果 */
interface HitResult {
    type: string;
    [key: string]: unknown;
}

/**
 * 渲染引擎
 *
 * Canvas 渲染的核心控制器，负责：
 * - 管理 Canvas 元素及其容器布局
 * - 协调多个渲染图层（Tile / Selection / Frozen / Interaction / Header / Chart）
 * - 通过 ReactiveStore 驱动图层响应式更新
 * - 处理视口变换（ViewportTransform）与滚动
 * - 提供命中测试（hitTest）接口，将客户端坐标映射为单元格/表头/图表等
 * - 调度 requestAnimationFrame 渲染帧
 */
export class RenderEngine extends DOMComponent {
    /** @private 私有字段 - 当前渲染的 Sheet 实例 */
    #currentSheet: Sheet | null = null;

    /** @private 私有字段 - requestAnimationFrame 返回的 id，用于取消 */
    #rafId: number | null = null;

    /** @private 私有字段 - 是否已有待执行的渲染帧，防止重复调度 rAF */
    #pendingRender: boolean = false;

    /** @private 私有字段 - 画布可视区域宽度（CSS 像素） */
    #viewW: number = 0;

    /** @private 私有字段 - 画布可视区域高度（CSS 像素） */
    #viewH: number = 0;

    /** @private 私有字段 - 缓存的视口变换对象 */
    #cachedVT: ViewportTransform | null = null;

    /** @private 私有字段 - 缓存 VT 对应的 sheet 标识键，用于判断是否需要重建 */
    #cachedVTSheetKey: string = "";

    /** @private 私有字段 - 用户手动指定的宽度，null 表示自动取容器宽度 */
    #userWidth: number | null = null;

    /** @private 私有字段 - 用户手动指定的高度，null 表示自动取容器高度 */
    #userHeight: number | null = null;

    /** @private 私有字段 - 每帧渲染完成后的回调列表（多订阅者） */
    #afterRenderCallbacks: Array<() => void> = [];

    /** @private 私有字段 - 搜索结果高亮渲染器实例 */
    #searchHighlighter: any = null;

    /** Canvas 元素 */
    canvas: HTMLCanvasElement | null;

    /** Canvas 2D 上下文 */
    ctx: CanvasRenderingContext2D | null;

    /** 外层容器 */
    outerWrap: HTMLElement | null;

    /** 内部包裹层 */
    wrap: HTMLElement;

    /** 滚动管理器 */
    scrollMgr: ScrollManager;

    /** Sheet 标签栏管理器 */
    sheetTabBar: SheetTabManager;

    /** 响应式存储 */
    store!: ReactiveStore;

    /** 图层合成器 */
    compositor!: LayerCompositor;

    /** 瓦片图层 */
    tileLayer!: TileLayer;

    /** 选区图层 */
    selectionLayer!: SelectionLayer;

    /** 冻结图层 */
    frozenLayer!: FrozenLayer;

    /** 交互图层 */
    interactionLayer!: InteractionLayer;

    /** 表头图层 */
    headerLayer!: HeaderLayer;

    /** 图表图层 */
    chartLayer!: ChartLayer;

    /** 编辑器引用（由外部设置） */
    editor: any;

    /**
     * @param element - Canvas 元素、元素 id 或容器元素
     */
    constructor(element: HTMLElement | string) {
        super();

        if (typeof element === "string") {
            this.canvas = document.getElementById(element) as HTMLCanvasElement;
        } else if ((element as HTMLElement).tagName === "CANVAS") {
            this.canvas = element as HTMLCanvasElement;
        } else {
            this.canvas = (element as HTMLElement).querySelector("canvas") || document.createElement("canvas");
            if (!this.canvas.parentNode) {
                (element as HTMLElement).appendChild(this.canvas);
            }
        }
        this.ctx = this.canvas.getContext("2d");
        this.outerWrap = this.canvas.parentElement;

        this.wrap = this.createElement("div", {
            className: "cs-canvas-wrap",
            style: { position: "relative", overflow: "hidden" },
        });
        this.outerWrap!.insertBefore(this.wrap, this.canvas);
        this.wrap.appendChild(this.canvas);

        this.scrollMgr = new ScrollManager(this.wrap, this.canvas);
        this.trackChild(this.scrollMgr as any);

        this.sheetTabBar = new SheetTabManager(this.wrap, null as any);
        this.trackChild(this.sheetTabBar as any);

        this.editor = null;
        this.#initLayerSystem();
        this.#initCanvasSize();
        this.#bindEvents();
    }

    /**
     * @private 私有方法 - 初始化图层系统
     *
     * 创建 ReactiveStore 管理渲染状态，实例化各图层并注册到合成器，
     * 最后将所有图层绑定到同一个 Store 实现响应式联动。
     */
    #initLayerSystem(): void {
        this.store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            frozen: { rows: 0, cols: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            selection: { ranges: [], activeRange: null, merges: [] },
            editor: { visible: false, row: -1, col: -1, value: "" },
            viewport: { width: 0, height: 0 },
            tile: { size: 256, cacheMax: 512 },
            charts: { version: 0 },
        });

        this.compositor = new LayerCompositor();

        this.tileLayer = new TileLayer();
        this.selectionLayer = new SelectionLayer();
        this.frozenLayer = new FrozenLayer();
        this.interactionLayer = new InteractionLayer();
        this.headerLayer = new HeaderLayer();
        this.chartLayer = new ChartLayer();

        this.tileLayer.onContentReady = () => {
            this.requestRender();
        };

        this.chartLayer.onContentReady = () => {
            this.requestRender();
        };

        this.compositor.register(this.tileLayer);
        this.compositor.register(this.selectionLayer);
        this.compositor.register(this.frozenLayer);
        this.compositor.register(this.chartLayer);
        this.compositor.register(this.interactionLayer);
        this.compositor.register(this.headerLayer);

        this.headerLayer.setDragIndicator(this.selectionLayer);

        this.compositor.bindAllLayers(this.store);
    }

    /** 当前水平滚动偏移（数据坐标） */
    get scrollX(): number {
        return this.scrollMgr.scrollX;
    }
    /** 当前垂直滚动偏移（数据坐标） */
    get scrollY(): number {
        return this.scrollMgr.scrollY;
    }
    /** 视口宽度（CSS 像素） */
    get viewW(): number {
        return this.#viewW;
    }
    /** 视口高度（CSS 像素） */
    get viewH(): number {
        return this.#viewH;
    }
    /** 当前渲染的 Sheet 实例 */
    get currentSheet(): Sheet | null {
        return this.#currentSheet;
    }

    /** 表头渲染器（委托给 HeaderLayer） */
    get headerRenderer(): any {
        return this.headerLayer.headerRenderer;
    }

    /** 覆盖层渲染器（委托给 SelectionLayer） */
    get overlayRenderer(): any {
        return this.selectionLayer.overlayRenderer;
    }

    /**
     * 设置行列调整大小指示线
     *
     * @param type - "row" 或 "col"
     * @param index - 行/列索引
     * @param position - 指示线位置（CSS 像素）
     */
    setResizeLine(type: string, index: number, position: number): void {
        this.interactionLayer.setResizeLine(type, index, position);
    }

    /** 清除行列调整大小指示线 */
    clearResizeLine(): void {
        this.interactionLayer.clearResizeLine();
    }

    /** 滚动回调函数（由外部设置） */
    get onScrollCallback(): any {
        return this.scrollMgr.onScrollCallback;
    }
    set onScrollCallback(fn: any) {
        this.scrollMgr.onScrollCallback = fn;
    }

    /**
     * @private 私有方法 - 初始化/重置 Canvas 尺寸
     *
     * 根据容器尺寸（或用户指定尺寸）设置 Canvas 的物理像素和 CSS 像素大小，
     * 考虑 DPR 缩放和滚动条/标签栏占用空间。
     *
     * @param width - 指定宽度，null 时取容器宽度
     * @param height - 指定高度，null 时取容器高度
     */
    #initCanvasSize(width?: number | null, height?: number | null): void {
        const rect = this.outerWrap!.getBoundingClientRect();
        const w = width ?? rect.width;
        const h = height ?? rect.height;
        const canvasW = w - CONFIG.SCROLLBAR_WIDTH;
        const canvasH = h - CONFIG.SHEET_TAB_HEIGHT;
        this.#viewW = canvasW;
        this.#viewH = canvasH;
        this.canvas!.width = canvasW * CONFIG.DPR;
        this.canvas!.height = canvasH * CONFIG.DPR;
        this.canvas!.style.width = canvasW + "px";
        this.canvas!.style.height = canvasH + "px";
        this.wrap.style.width = w + "px";
        this.wrap.style.height = h + "px";
    }

    /**
     * 外部设置画布尺寸
     *
     * @param width - 指定宽度
     * @param height - 指定高度
     */
    setCanvasSize(width?: number | null, height?: number | null): void {
        if (width != null) this.#userWidth = width;
        if (height != null) this.#userHeight = height;
        this.#initCanvasSize(this.#userWidth, this.#userHeight);
        this.requestRender();
    }

    /**
     * @private 私有方法 - 绑定事件监听
     *
     * - 滚动事件：滚动后请求重绘
     * - 窗口 resize：重新计算画布尺寸并重绘
     */
    #bindEvents(): void {
        this.scrollMgr.bind();
        this.scrollMgr.onAfterScroll = () => {
            this.requestRender();
        };

        this.trackEvent(window, EVENT_NAMES.RESIZE, () => {
            this.#initCanvasSize(this.#userWidth, this.#userHeight);
            this.requestRender();
        });
    }

    /**
     * 请求渲染一帧
     *
     * 使用 requestAnimationFrame 调度，通过 #pendingRender 标志去重，
     * 确保同一帧内多次调用只产生一次实际渲染。
     */
    requestRender(): void {
        if (this.#pendingRender) return;
        this.#pendingRender = true;
        this.#rafId = requestAnimationFrame(() => {
            this.#pendingRender = false;
            if (this.#currentSheet) {
                this.render(this.#currentSheet);
            }
        });
    }

    /**
     * 执行一次完整渲染
     *
     * 渲染流程：
     * 1. 校验 Sheet 可见性
     * 2. 更新冻结缓存和滚动边界
     * 3. 设置 CSS 变量供 DOM 组件使用
     * 4. 清空画布，设置 DPR 变换
     * 5. 批量更新 ReactiveStore 中的状态
     * 6. 刷新 Store，触发各图层响应式更新
     * 7. 获取/创建 ViewportTransform
     * 8. 调用合成器 compose 绘制所有图层
     * 9. 更新滚动条和标签栏布局
     * 10. 触发 afterRender 回调列表
     *
     * @param sheet - 要渲染的 Sheet 实例
     */
    render(sheet: Sheet): void {
        if (!sheet || !(sheet as any).visible) return;

        if (this.#currentSheet !== sheet) {
            this.chartLayer?.bindSheet(sheet);
        }
        this.#currentSheet = sheet;

        (sheet as any).invalidateFreezeCache();

        const rc = (sheet as any).rowColManager;
        const headerH = (sheet as any).getHeaderHeight();
        const headerW = (sheet as any).getHeaderWidth();
        const frozenRowsH = (sheet as any).frozenRowsHeight;
        const frozenColsW = (sheet as any).frozenColsWidth;

        this.scrollMgr.updateScrollBounds(rc.totalWidth, rc.totalHeight, this.#viewW, this.#viewH, headerH, headerW, frozenRowsH, frozenColsW);

        this.wrap.style.setProperty("--header-height", `${headerH}px`);
        this.wrap.style.setProperty("--header-width", `${headerW}px`);

        const ctx = this.ctx!;
        const viewW = this.#viewW;
        const viewH = this.#viewH;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;

        ctx.setTransform(CONFIG.DPR, 0, 0, CONFIG.DPR, 0, 0);
        ctx.clearRect(0, 0, viewW, viewH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        this.store.batch(() => {
            this.store.state.scroll.x = sx;
            this.store.state.scroll.y = sy;
            this.store.state.frozen.rows = (sheet as any).fixedRowsTop;
            this.store.state.frozen.cols = (sheet as any).fixedColumnsStart;
            this.store.state.frozenOffset.colsWidth = frozenColsW;
            this.store.state.frozenOffset.rowsHeight = frozenRowsH;
            this.store.state.viewport.width = viewW;
            this.store.state.viewport.height = viewH;

            const range = (sheet as any).selection.getRange();
            const [focusRow, focusCol] = (sheet as any).selection.getFocus();
            this.store.state.selection.activeRange = range;
            this.store.state.selection.focusRow = focusRow;
            this.store.state.selection.focusCol = focusCol;

            this.store.state.editor.visible = this.editor?.isVisible ?? false;
            this.store.state.editor.row = this.editor?.activeRow ?? -1;
            this.store.state.editor.col = this.editor?.activeCol ?? -1;
        });

        this.store.flush();

        const vt = this.#getViewportTransform();

        const composeOptions = {
            scrollX: sx,
            scrollY: sy,
        };

        this.compositor.compose(ctx, sheet, vt!, viewW, viewH, composeOptions);

        if (this.#searchHighlighter) {
            try {
                this.#searchHighlighter.render(ctx, { width: viewW, height: viewH }, sheet);
            } catch (error) {
                console.error("[RenderEngine] Search highlight render error:", error);
            }
        }

        this.scrollMgr.updateScrollbars(this.#viewW, this.#viewH);
        this.sheetTabBar.updateLayout(this.scrollMgr.hasHScrollbar);

        for (const cb of this.#afterRenderCallbacks) {
            try {
                cb();
            } catch (e) {
                console.error("[RenderEngine] onAfterRender callback error:", e);
            }
        }
    }

    /**
     * 注册渲染后回调（多订阅者模式，替代直接赋值 onAfterRender）
     *
     * @param callback - 渲染后回调函数
     * @returns 传入的 callback（便于用同一引用移除）
     */
    addAfterRenderCallback(callback: () => void): () => void {
        if (typeof callback === "function" && !this.#afterRenderCallbacks.includes(callback)) {
            this.#afterRenderCallbacks.push(callback);
        }
        return callback;
    }

    /**
     * 移除渲染后回调
     *
     * @param callback - 要移除的回调函数
     */
    removeAfterRenderCallback(callback: () => void): void {
        const idx = this.#afterRenderCallbacks.indexOf(callback);
        if (idx !== -1) this.#afterRenderCallbacks.splice(idx, 1);
    }

    /**
     * 设置搜索结果高亮渲染器
     *
     * 由 SearchPlugin.init() 调用，将高亮器实例注册到 RenderEngine。
     * 注册后，每帧渲染循环会自动调用 highlighter.render() 绘制高亮。
     *
     * @param highlighter - 高亮器实例，传 null 可清除
     */
    setSearchHighlighter(highlighter: any): void {
        this.#searchHighlighter = highlighter;
        this.requestRender();
    }

    /**
     * 获取当前注册的搜索高亮渲染器
     *
     * @returns 搜索高亮渲染器实例或 null
     */
    getSearchHighlighter(): any {
        return this.#searchHighlighter;
    }

    /**
     * @private 私有方法 - 获取视口变换对象（带缓存）
     *
     * 当 Sheet 的冻结/表头参数或滚动位置变化时重建 VT，
     * 否则返回缓存的实例以避免重复计算。
     *
     * @returns 视口变换对象或 null
     */
    #getViewportTransform(): ViewportTransform | null {
        const sheet = this.#currentSheet;
        if (!sheet) return null;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;
        const sheetKey = `${(sheet as any).name}:${(sheet as any).frozenColsWidth}:${(sheet as any).frozenRowsHeight}:${(sheet as any).getHeaderWidth()}:${(sheet as any).getHeaderHeight()}`;
        if (!this.#cachedVT || this.#cachedVTSheetKey !== sheetKey || this.#cachedVT.scrollX !== sx || this.#cachedVT.scrollY !== sy) {
            this.#cachedVT = new ViewportTransform(sheet, sx, sy);
            this.#cachedVTSheetKey = sheetKey;
        }
        return this.#cachedVT;
    }

    /**
     * 获取指定单元格在视口中的矩形区域
     *
     * @param row - 行索引
     * @param col - 列索引
     * @param mergeInfo - 合并单元格信息，有值时使用 mergeToViewRect
     * @returns 视口坐标矩形
     */
    getCellRect(row: number, col: number, mergeInfo: any = null): ViewRect {
        const sheet = this.#currentSheet;
        if (!sheet || !(sheet as any).rowColManager) return { x: 0, y: 0, w: 0, h: 0 };

        const vt = this.#getViewportTransform();

        if (mergeInfo) {
            return vt!.mergeToViewRect(mergeInfo);
        }

        return vt!.cellToViewRect(row, col);
    }

    /**
     * 命中测试：将客户端坐标转换为命中的区域类型和索引
     *
     * 检测顺序：
     * 1. 左上角全选区域
     * 2. 列表头区域
     * 3. 行表头区域
     * 4. 图表区域（优先于单元格）
     * 5. 单元格区域
     *
     * @param clientX - 客户端 X 坐标
     * @param clientY - 客户端 Y 坐标
     * @returns 命中结果，如 { type: HIT_TYPE.CELL, row, col }
     */
    hitTest(clientX: number, clientY: number): HitResult | null {
        const rect = this.canvas!.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const sheet = this.#currentSheet;
        if (!sheet) return null;
        const vt = this.#getViewportTransform();
        const rc = (sheet as any).rowColManager;
        const headerW = vt!.headerW;
        const headerH = vt!.headerH;

        if (px > this.#viewW || py > this.#viewH) return null;

        if (px >= 0 && px <= headerW && py >= 0 && py <= headerH) {
            return { type: HIT_TYPE.CORNER };
        }

        if (py >= 0 && py <= headerH && px > headerW) {
            const col = vt!.viewXToCol(px);
            if (col >= 0 && col < rc.colCount) {
                return { type: HIT_TYPE.COL_HEADER, index: col };
            }
        }

        if (px >= 0 && px <= headerW && py > headerH) {
            const row = vt!.viewYToRow(py);
            if (row >= 0 && row < rc.rowCount) {
                return { type: HIT_TYPE.ROW_HEADER, index: row };
            }
        }

        if (px > headerW && py > headerH) {
            const chartHit = this.chartLayer?.hitTest(px, py, sheet, vt!);
            if (chartHit && chartHit.type === CONTENT_TYPE.CHART) {
                return { ...chartHit, type: HIT_TYPE.CHART };
            }
            const col = vt!.viewXToCol(px);
            const row = vt!.viewYToRow(py);
            if (row >= 0 && row < rc.rowCount && col >= 0 && col < rc.colCount) {
                return { type: HIT_TYPE.CELL, row, col };
            }
        }

        return null;
    }

    /**
     * 表头调整大小命中测试
     *
     * 检测鼠标是否在行/列边界附近（可拖拽调整宽高的区域）。
     *
     * @param clientX - 客户端 X 坐标
     * @param clientY - 客户端 Y 坐标
     * @returns 命中结果，如 { type: HIT_TYPE.COL_RESIZE, index: col }
     */
    headerHitTest(clientX: number, clientY: number): HitResult | null {
        const rect = this.canvas!.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const sheet = this.#currentSheet;
        if (!sheet) return null;
        const rc = (sheet as any).rowColManager;
        const vt = this.#getViewportTransform();
        const headerW = vt!.headerW;
        const headerH = vt!.headerH;
        const hitArea = CONFIG.RESIZE_HIT_AREA;

        if (px > this.#viewW || py > this.#viewH) return null;

        if (py >= 0 && py <= headerH && px > headerW) {
            const dataX = vt!.viewXToDataX(px);
            const col = rc.colAt(dataX);
            const colRight = vt!.colRightToDataX(col);
            if (Math.abs(dataX - colRight) <= hitArea) {
                return { type: HIT_TYPE.COL_RESIZE, index: col };
            }
        }

        if (px >= 0 && px <= headerW && py > headerH) {
            const dataY = vt!.viewYToDataY(py);
            const row = rc.rowAt(dataY);
            const rowBottom = vt!.rowBottomToDataY(row);
            if (Math.abs(dataY - rowBottom) <= hitArea) {
                return { type: HIT_TYPE.ROW_RESIZE, index: row };
            }
        }

        return null;
    }

    /**
     * 填充柄命中测试
     *
     * 检测鼠标是否在当前选区右下角的填充柄区域内。
     *
     * @param clientX - 客户端 X 坐标
     * @param clientY - 客户端 Y 坐标
     * @returns 是否命中填充柄
     */
    fillHandleHitTest(clientX: number, clientY: number): boolean {
        if (!this.#currentSheet) return false;

        const rect = this.canvas!.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const sheet = this.#currentSheet;
        const range = (sheet as any).selection.getRange();

        const vt = this.#getViewportTransform();
        const x2 = vt!.colRightToViewX(range.bottomCol);
        const y2 = vt!.rowBottomToViewY(range.bottomRow);

        const handleSize = SELECTION_CONFIG.FILL_HANDLE_HIT_SIZE;
        return px >= x2 - handleSize && px <= x2 && py >= y2 - handleSize && py <= y2;
    }

    /**
     * 滚动到指定单元格位置
     *
     * @param row - 目标行索引
     * @param col - 目标列索引
     */
    scrollToCell(row: number, col: number): void {
        const sheet = this.#currentSheet;
        const rc = sheet ? (sheet as any).rowColManager : null;
        const frozenRowsH = sheet ? (sheet as any).frozenRowsHeight : 0;
        const frozenColsW = sheet ? (sheet as any).frozenColsWidth : 0;
        this.scrollMgr.scrollToCell(row, col, rc, frozenRowsH, frozenColsW);
    }

    /** 最大水平滚动偏移 */
    get maxScrollX(): number {
        return this.scrollMgr.maxScrollX;
    }
    /** 最大垂直滚动偏移 */
    get maxScrollY(): number {
        return this.scrollMgr.maxScrollY;
    }

    /**
     * 标记所有图层为脏，请求全量重绘
     *
     * 在数据结构发生重大变化（如切换 Sheet、批量修改）时调用。
     */
    invalidateAll(): void {
        this.tileLayer.markAllDirty();
        this.frozenLayer.markAllDirty();
        this.selectionLayer.markDirty();
        this.interactionLayer.markDirty();
        this.headerLayer.markDirty();
        this.chartLayer?.invalidateChartData();
        this.requestRender();
    }

    /**
     * 标记指定单元格为脏，请求局部重绘
     *
     * @param row - 行索引
     * @param col - 列索引
     */
    invalidateCell(row: number, col: number): void {
        const rc = this.#currentSheet ? (this.#currentSheet as any).rowColManager : null;
        this.tileLayer.markCellDirty(row, col, rc);
        this.frozenLayer.markCellDirty(row, col, rc);
        this.chartLayer?.invalidateChartData();
        this.requestRender();
    }

    /**
     * 销毁渲染引擎
     *
     * 取消待执行的 rAF，恢复 DOM 结构，销毁合成器和 Store。
     * @override
     */
    onDestroy(): void {
        if (this.#rafId != null) {
            cancelAnimationFrame(this.#rafId);
        }
        if (this.canvas && this.wrap && this.outerWrap) {
            this.outerWrap.insertBefore(this.canvas, this.wrap);
        }
        this.compositor.destroyAll();
        this.store.destroy();
        this.canvas = null;
        this.ctx = null;
    }
}
