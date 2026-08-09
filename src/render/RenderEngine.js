import { ScrollManager } from "../ui/ScrollManager.js";
import { SheetTabManager } from "../ui/sheetTab/SheetTabManager.js";
import { ViewportTransform } from "./ViewportTransform.js";
import { EVENT_NAMES } from "../constants/eventNames.js";
import { CONFIG } from "../constants/config";
import { HIT_TYPE } from "../constants/hitType";
import { CONTENT_TYPE } from "../constants/enums/ContentType.js";
import { SELECTION_CONFIG } from "../constants/selectionConfig";
import { LayerCompositor } from "./LayerCompositor.js";
import { TileLayer } from "./layers/TileLayer.js";
import { SelectionLayer } from "./layers/SelectionLayer.js";
import { FrozenLayer } from "./layers/FrozenLayer.js";
import { InteractionLayer } from "./layers/InteractionLayer.js";
import { HeaderLayer } from "./layers/HeaderLayer.js";
import { ChartLayer } from "./layers/ChartLayer.js";
import { ReactiveStore } from "../state/ReactiveStore.js";
import { DOMComponent } from "../core/DOMComponent.js";

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
    /** @type {import('../sheet/Sheet').Sheet | null} 当前渲染的 Sheet 实例 */
    #currentSheet = null;

    /** @type {number | null} requestAnimationFrame 返回的 id，用于取消 */
    #rafId = null;

    /** @type {boolean} 是否已有待执行的渲染帧，防止重复调度 rAF */
    #pendingRender = false;

    /** @type {number} 画布可视区域宽度（CSS 像素） */
    #viewW = 0;

    /** @type {number} 画布可视区域高度（CSS 像素） */
    #viewH = 0;

    /** @type {ViewportTransform | null} 缓存的视口变换对象 */
    #cachedVT = null;

    /** @type {string} 缓存 VT 对应的 sheet 标识键，用于判断是否需要重建 */
    #cachedVTSheetKey = "";

    /** @type {number | null} 用户手动指定的宽度，null 表示自动取容器宽度 */
    #userWidth = null;

    /** @type {number | null} 用户手动指定的高度，null 表示自动取容器高度 */
    #userHeight = null;

    /** @type {Function[]} 每帧渲染完成后的回调列表（多订阅者） */
    #afterRenderCallbacks = [];

    /**
     * @param {HTMLElement | string} element - Canvas 元素、元素 id 或容器元素
     */
    constructor(element) {
        super();

        // 解析 Canvas 元素：支持传入 id 字符串、Canvas 元素或容器元素
        if (typeof element === "string") {
            this.canvas = document.getElementById(element);
        } else if (element.tagName === "CANVAS") {
            this.canvas = element;
        } else {
            this.canvas = element.querySelector("canvas") || document.createElement("canvas");
            if (!this.canvas.parentNode) {
                element.appendChild(this.canvas);
            }
        }
        this.ctx = this.canvas.getContext("2d");
        // 外层容器（Canvas 的原始父元素）
        this.outerWrap = this.canvas.parentElement;

        // 创建内部包裹层，用于定位滚动条和 Sheet 标签栏
        this.wrap = this.createElement("div", {
            className: "cs-canvas-wrap",
            style: { position: "relative", overflow: "hidden" },
        });
        // 将 wrap 插入 outerWrap 中，Canvas 移入 wrap 内部
        this.outerWrap.insertBefore(this.wrap, this.canvas);
        this.wrap.appendChild(this.canvas);

        // 滚动管理器：处理虚拟滚动和滚动条
        this.scrollMgr = new ScrollManager(this.wrap, this.canvas);
        this.trackChild(this.scrollMgr);

        // Sheet 标签栏管理器
        this.sheetTabBar = new SheetTabManager(this.wrap, null);
        this.trackChild(this.sheetTabBar);

        this.#initLayerSystem();
        this.#initCanvasSize();
        this.#bindEvents();
    }

    /**
     * 初始化图层系统
     *
     * 创建 ReactiveStore 管理渲染状态，实例化各图层并注册到合成器，
     * 最后将所有图层绑定到同一个 Store 实现响应式联动。
     */
    #initLayerSystem() {
        // 响应式状态：所有图层共享此 Store，状态变更自动触发图层重绘
        this.store = new ReactiveStore({
            scroll: { x: 0, y: 0 }, // 滚动偏移
            frozen: { rows: 0, cols: 0 }, // 冻结行列数
            frozenOffset: { colsWidth: 0, rowsHeight: 0 }, // 冻结区域像素尺寸
            selection: { ranges: [], activeRange: null, merges: [] }, // 选区信息
            editor: { visible: false, row: -1, col: -1, value: "" }, // 编辑器状态
            viewport: { width: 0, height: 0 }, // 视口尺寸
            tile: { size: 256, cacheMax: 512 }, // 瓦片参数
            charts: { version: 0 }, // 图表版本号（变更时触发重绘）
        });

        // 图层合成器：按顺序组合各图层的渲染结果
        this.compositor = new LayerCompositor();

        // 实例化各图层
        this.tileLayer = new TileLayer(); // 瓦片图层：渲染单元格内容
        this.selectionLayer = new SelectionLayer(); // 选区图层：渲染选区高亮
        this.frozenLayer = new FrozenLayer(); // 冻结图层：渲染冻结行列
        this.interactionLayer = new InteractionLayer(); // 交互图层：渲染调整大小指示线等
        this.headerLayer = new HeaderLayer(); // 表头图层：渲染行列号
        this.chartLayer = new ChartLayer(); // 图表图层：渲染图表

        // 瓦片/图表内容就绪时请求重绘
        this.tileLayer.onContentReady = () => {
            this.requestRender();
        };

        this.chartLayer.onContentReady = () => {
            this.requestRender();
        };

        // 按渲染顺序注册图层（先注册的先绘制，后注册的覆盖在上面）
        this.compositor.register(this.tileLayer);
        this.compositor.register(this.selectionLayer);
        this.compositor.register(this.frozenLayer);
        this.compositor.register(this.chartLayer);
        this.compositor.register(this.interactionLayer);
        this.compositor.register(this.headerLayer);

        // 将选区图层设置为表头图层的拖拽指示器依赖
        this.headerLayer.setDragIndicator(this.selectionLayer);

        // 将所有图层绑定到同一个 Store，使图层能响应状态变化
        this.compositor.bindAllLayers(this.store);
    }

    /** 当前水平滚动偏移（数据坐标） */
    get scrollX() {
        return this.scrollMgr.scrollX;
    }
    /** 当前垂直滚动偏移（数据坐标） */
    get scrollY() {
        return this.scrollMgr.scrollY;
    }
    /** 视口宽度（CSS 像素） */
    get viewW() {
        return this.#viewW;
    }
    /** 视口高度（CSS 像素） */
    get viewH() {
        return this.#viewH;
    }
    /** 当前渲染的 Sheet 实例 */
    get currentSheet() {
        return this.#currentSheet;
    }

    /** 表头渲染器（委托给 HeaderLayer） */
    get headerRenderer() {
        return this.headerLayer.headerRenderer;
    }

    /** 覆盖层渲染器（委托给 SelectionLayer） */
    get overlayRenderer() {
        return this.selectionLayer.overlayRenderer;
    }

    /**
     * 设置行列调整大小指示线
     *
     * @param {string} type - "row" 或 "col"
     * @param {number} index - 行/列索引
     * @param {number} position - 指示线位置（CSS 像素）
     */
    setResizeLine(type, index, position) {
        this.interactionLayer.setResizeLine(type, index, position);
    }

    /** 清除行列调整大小指示线 */
    clearResizeLine() {
        this.interactionLayer.clearResizeLine();
    }

    /** 滚动回调函数（由外部设置） */
    get onScrollCallback() {
        return this.scrollMgr.onScrollCallback;
    }
    set onScrollCallback(fn) {
        this.scrollMgr.onScrollCallback = fn;
    }

    /**
     * 初始化/重置 Canvas 尺寸
     *
     * 根据容器尺寸（或用户指定尺寸）设置 Canvas 的物理像素和 CSS 像素大小，
     * 考虑 DPR 缩放和滚动条/标签栏占用空间。
     *
     * @param {number} [width] - 指定宽度，null 时取容器宽度
     * @param {number} [height] - 指定高度，null 时取容器高度
     */
    #initCanvasSize(width, height) {
        const rect = this.outerWrap.getBoundingClientRect();
        const w = width ?? rect.width;
        const h = height ?? rect.height;
        // 减去滚动条宽度和标签栏高度，得到画布可用区域
        const canvasW = w - CONFIG.SCROLLBAR_WIDTH;
        const canvasH = h - CONFIG.SHEET_TAB_HEIGHT;
        this.#viewW = canvasW;
        this.#viewH = canvasH;
        // 物理像素 = CSS 像素 × DPR，确保高清渲染
        this.canvas.width = canvasW * CONFIG.DPR;
        this.canvas.height = canvasH * CONFIG.DPR;
        this.canvas.style.width = canvasW + "px";
        this.canvas.style.height = canvasH + "px";
        this.wrap.style.width = w + "px";
        this.wrap.style.height = h + "px";
    }

    /**
     * 外部设置画布尺寸
     *
     * @param {number} [width] - 指定宽度
     * @param {number} [height] - 指定高度
     */
    setCanvasSize(width, height) {
        if (width != null) this.#userWidth = width;
        if (height != null) this.#userHeight = height;
        this.#initCanvasSize(this.#userWidth, this.#userHeight);
        this.requestRender();
    }

    /**
     * 绑定事件监听
     * - 滚动事件：滚动后请求重绘
     * - 窗口 resize：重新计算画布尺寸并重绘
     */
    #bindEvents() {
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
    requestRender() {
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
     * 5. 批量更新 ReactiveStore 中的状态（scroll / frozen / selection / editor / viewport）
     * 6. 刷新 Store，触发各图层响应式更新
     * 7. 获取/创建 ViewportTransform
     * 8. 调用合成器 compose 绘制所有图层
     * 9. 更新滚动条和标签栏布局
     * 10. 触发 afterRender 回调列表
     *
     * @param {import('../sheet/Sheet').Sheet} sheet - 要渲染的 Sheet 实例
     */
    render(sheet) {
        if (!sheet || !sheet.visible) return;

        // 切换 Sheet 时绑定图表图层
        if (this.#currentSheet !== sheet) {
            this.chartLayer?.bindSheet(sheet);
        }
        this.#currentSheet = sheet;

        // 使 Sheet 的冻结缓存失效，确保重新计算
        sheet.invalidateFreezeCache();

        const rc = sheet.rowColManager;
        const headerH = sheet.getHeaderHeight();
        const headerW = sheet.getHeaderWidth();
        const frozenRowsH = sheet.frozenRowsHeight;
        const frozenColsW = sheet.frozenColsWidth;

        // 更新滚动管理器的边界参数
        this.scrollMgr.updateScrollBounds(rc.totalWidth, rc.totalHeight, this.#viewW, this.#viewH, headerH, headerW, frozenRowsH, frozenColsW);

        // 设置 CSS 变量，供滚动条等 DOM 组件定位使用
        this.wrap.style.setProperty("--header-height", `${headerH}px`);
        this.wrap.style.setProperty("--header-width", `${headerW}px`);

        const ctx = this.ctx;
        const viewW = this.#viewW;
        const viewH = this.#viewH;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;

        // 设置 DPR 缩放变换，清空画布
        ctx.setTransform(CONFIG.DPR, 0, 0, CONFIG.DPR, 0, 0);
        ctx.clearRect(0, 0, viewW, viewH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // 批量更新 Store 状态，避免多次触发 watcher
        this.store.batch(() => {
            this.store.state.scroll.x = sx;
            this.store.state.scroll.y = sy;
            this.store.state.frozen.rows = sheet.fixedRowsTop;
            this.store.state.frozen.cols = sheet.fixedColumnsStart;
            this.store.state.frozenOffset.colsWidth = frozenColsW;
            this.store.state.frozenOffset.rowsHeight = frozenRowsH;
            this.store.state.viewport.width = viewW;
            this.store.state.viewport.height = viewH;

            // 同步选区状态
            const range = sheet.selection.getRange();
            const [focusRow, focusCol] = sheet.selection.getFocus();
            this.store.state.selection.activeRange = range;
            this.store.state.selection.focusRow = focusRow;
            this.store.state.selection.focusCol = focusCol;

            // 同步编辑器状态
            this.store.state.editor.visible = this.editor?.isVisible ?? false;
            this.store.state.editor.row = this.editor?.activeRow ?? -1;
            this.store.state.editor.col = this.editor?.activeCol ?? -1;
        });

        // 立即刷新 Store，确保所有图层拿到最新状态
        this.store.flush();

        // 获取视口变换（带缓存）
        const vt = this.#getViewportTransform();

        const composeOptions = {
            scrollX: sx,
            scrollY: sy,
        };

        // 合成并绘制所有图层
        this.compositor.compose(ctx, sheet, vt, viewW, viewH, composeOptions);

        // 更新滚动条位置和标签栏布局
        this.scrollMgr.updateScrollbars(this.#viewW, this.#viewH);
        this.sheetTabBar.updateLayout(this.scrollMgr.hasHScrollbar);

        // 渲染后回调（多订阅者）
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
     * @param {Function} callback
     * @returns {Function} 传入的 callback（便于用同一引用移除）
     */
    addAfterRenderCallback(callback) {
        if (typeof callback === "function" && !this.#afterRenderCallbacks.includes(callback)) {
            this.#afterRenderCallbacks.push(callback);
        }
        return callback;
    }

    /**
     * 移除渲染后回调
     * @param {Function} callback
     */
    removeAfterRenderCallback(callback) {
        const idx = this.#afterRenderCallbacks.indexOf(callback);
        if (idx !== -1) this.#afterRenderCallbacks.splice(idx, 1);
    }

    /**
     * 获取视口变换对象（带缓存）
     *
     * 当 Sheet 的冻结/表头参数或滚动位置变化时重建 VT，
     * 否则返回缓存的实例以避免重复计算。
     *
     * @returns {ViewportTransform | null}
     */
    #getViewportTransform() {
        const sheet = this.#currentSheet;
        if (!sheet) return null;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;
        // 构建缓存键：包含影响 VT 的所有参数
        const sheetKey = `${sheet.name}:${sheet.frozenColsWidth}:${sheet.frozenRowsHeight}:${sheet.getHeaderWidth()}:${sheet.getHeaderHeight()}`;
        // 参数或滚动位置变化时重建 VT
        if (!this.#cachedVT || this.#cachedVTSheetKey !== sheetKey || this.#cachedVT.scrollX !== sx || this.#cachedVT.scrollY !== sy) {
            this.#cachedVT = new ViewportTransform(sheet, sx, sy);
            this.#cachedVTSheetKey = sheetKey;
        }
        return this.#cachedVT;
    }

    /**
     * 获取指定单元格在视口中的矩形区域
     *
     * @param {number} row - 行索引
     * @param {number} col - 列索引
     * @param {Object} [mergeInfo] - 合并单元格信息，有值时使用 mergeToViewRect
     * @returns {{ x: number, y: number, w: number, h: number }} 视口坐标矩形
     */
    getCellRect(row, col, mergeInfo = null) {
        const sheet = this.#currentSheet;
        if (!sheet || !sheet.rowColManager) return { x: 0, y: 0, w: 0, h: 0 };

        const vt = this.#getViewportTransform();

        if (mergeInfo) {
            return vt.mergeToViewRect(mergeInfo);
        }

        return vt.cellToViewRect(row, col);
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
     * @param {number} clientX - 客户端 X 坐标
     * @param {number} clientY - 客户端 Y 坐标
     * @returns {Object | null} 命中结果，如 { type: HIT_TYPE.CELL, row, col }
     */
    hitTest(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        // 转换为画布本地坐标
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const sheet = this.#currentSheet;
        if (!sheet) return null;
        const vt = this.#getViewportTransform();
        const rc = sheet.rowColManager;
        const headerW = vt.headerW;
        const headerH = vt.headerH;

        // 超出视口范围
        if (px > this.#viewW || py > this.#viewH) return null;

        // 左上角全选按钮区域
        if (px >= 0 && px <= headerW && py >= 0 && py <= headerH) {
            return { type: HIT_TYPE.CORNER };
        }

        // 列表头区域
        if (py >= 0 && py <= headerH && px > headerW) {
            const col = vt.viewXToCol(px);
            if (col >= 0 && col < rc.colCount) {
                return { type: HIT_TYPE.COL_HEADER, index: col };
            }
        }

        // 行表头区域
        if (px >= 0 && px <= headerW && py > headerH) {
            const row = vt.viewYToRow(py);
            if (row >= 0 && row < rc.rowCount) {
                return { type: HIT_TYPE.ROW_HEADER, index: row };
            }
        }

        // 单元格区域（先检测图表，图表优先于单元格）
        if (px > headerW && py > headerH) {
            const chartHit = this.chartLayer?.hitTest(px, py, sheet, vt);
            if (chartHit && chartHit.type === CONTENT_TYPE.CHART) {
                return { type: HIT_TYPE.CHART, ...chartHit };
            }
            const col = vt.viewXToCol(px);
            const row = vt.viewYToRow(py);
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
     * @param {number} clientX - 客户端 X 坐标
     * @param {number} clientY - 客户端 Y 坐标
     * @returns {Object | null} 命中结果，如 { type: HIT_TYPE.COL_RESIZE, index: col }
     */
    headerHitTest(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const sheet = this.#currentSheet;
        if (!sheet) return null;
        const rc = sheet.rowColManager;
        const vt = this.#getViewportTransform();
        const headerW = vt.headerW;
        const headerH = vt.headerH;
        const hitArea = CONFIG.RESIZE_HIT_AREA;

        if (px > this.#viewW || py > this.#viewH) return null;

        // 列表头区域：检测是否在列右边界附近
        if (py >= 0 && py <= headerH && px > headerW) {
            const dataX = vt.viewXToDataX(px);
            const col = rc.colAt(dataX);
            const colRight = vt.colRightToDataX(col);
            if (Math.abs(dataX - colRight) <= hitArea) {
                return { type: HIT_TYPE.COL_RESIZE, index: col };
            }
        }

        // 行表头区域：检测是否在行下边界附近
        if (px >= 0 && px <= headerW && py > headerH) {
            const dataY = vt.viewYToDataY(py);
            const row = rc.rowAt(dataY);
            const rowBottom = vt.rowBottomToDataY(row);
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
     * @param {number} clientX - 客户端 X 坐标
     * @param {number} clientY - 客户端 Y 坐标
     * @returns {boolean} 是否命中填充柄
     */
    fillHandleHitTest(clientX, clientY) {
        if (!this.#currentSheet) return false;

        const rect = this.canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const sheet = this.#currentSheet;
        const range = sheet.selection.getRange();

        const vt = this.#getViewportTransform();
        // 选区右下角的视口坐标
        const x2 = vt.colRightToViewX(range.bottomCol);
        const y2 = vt.rowBottomToViewY(range.bottomRow);

        const handleSize = SELECTION_CONFIG.FILL_HANDLE_HIT_SIZE;
        // 检测是否在填充柄方块内（右下角 handleSize × handleSize 区域）
        return px >= x2 - handleSize && px <= x2 && py >= y2 - handleSize && py <= y2;
    }

    /**
     * 滚动到指定单元格位置
     *
     * @param {number} row - 目标行索引
     * @param {number} col - 目标列索引
     */
    scrollToCell(row, col) {
        const sheet = this.#currentSheet;
        const rc = sheet ? sheet.rowColManager : null;
        const frozenRowsH = sheet ? sheet.frozenRowsHeight : 0;
        const frozenColsW = sheet ? sheet.frozenColsWidth : 0;
        this.scrollMgr.scrollToCell(row, col, rc, frozenRowsH, frozenColsW);
    }

    /** 最大水平滚动偏移 */
    get maxScrollX() {
        return this.scrollMgr.maxScrollX;
    }
    /** 最大垂直滚动偏移 */
    get maxScrollY() {
        return this.scrollMgr.maxScrollY;
    }

    /**
     * 标记所有图层为脏，请求全量重绘
     *
     * 在数据结构发生重大变化（如切换 Sheet、批量修改）时调用。
     */
    invalidateAll() {
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
     * @param {number} row - 行索引
     * @param {number} col - 列索引
     */
    invalidateCell(row, col) {
        const rc = this.#currentSheet ? this.#currentSheet.rowColManager : null;
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
    onDestroy() {
        if (this.#rafId != null) {
            cancelAnimationFrame(this.#rafId);
        }
        // 将 Canvas 从 wrap 移回 outerWrap，恢复原始 DOM 结构
        if (this.canvas && this.wrap && this.outerWrap) {
            this.outerWrap.insertBefore(this.canvas, this.wrap);
        }
        this.compositor.destroyAll();
        this.store.destroy();
        this.canvas = null;
        this.ctx = null;
    }
}
