import { TileCache } from "./TileCache.js";
import { ScrollManager } from "./ScrollManager.js";
import { TileRenderer } from "./TileRenderer.js";
import { OverlayRenderer } from "./OverlayRenderer.js";
import { HeaderRenderer } from "./HeaderRenderer.js";
import { EVENT_NAMES } from "../constants/eventNames.js";
import { CONFIG } from "../constants/config";
import { HIT_TYPE } from "../constants/hitType";

/**
 * 渲染引擎
 * 负责 Canvas 画布管理、瓦片渲染调度、滚动控制、命中检测等核心渲染逻辑
 *
 * 主要职责：
 * - 初始化并管理 Canvas 画布尺寸（支持用户自定义宽高或自适应容器）
 * - 协调 TileRenderer / OverlayRenderer / HeaderRenderer 完成分层渲染
 * - 通过 ScrollManager 管理滚动偏移与滚动条
 * - 提供命中检测（hitTest）用于判断鼠标点击位置对应的单元格/表头/调整手柄
 * - 使用 requestAnimationFrame 合并渲染请求，避免重复绘制
 */
export class RenderEngine {
    /** @type {Sheet|null} 当前正在渲染的工作表 */
    #currentSheet = null;
    /** @type {number|null} requestAnimationFrame 回调 ID，用于取消未执行的渲染帧 */
    #rafId = null;
    /** @type {boolean} 是否已有待执行的渲染请求（防止重复 rAF） */
    #pendingRender = false;
    /** @type {Function|null} 窗口 resize 事件处理器引用，用于销毁时移除监听 */
    #resizeHandler = null;
    /** @type {number} 设备像素比，用于高清屏适配 */
    #dpr = 1;
    /** @type {number} 视口逻辑宽度（CSS 像素） */
    #viewW = 0;
    /** @type {number} 视口逻辑高度（CSS 像素） */
    #viewH = 0;
    /** @type {number|null} 用户通过配置项指定的画布宽度，null 表示自适应容器 */
    #userWidth = null;
    /** @type {number|null} 用户通过配置项指定的画布高度，null 表示自适应容器 */
    #userHeight = null;

    /**
     * 创建渲染引擎
     * @param {string} canvasId - Canvas 元素的 DOM ID
     */
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext("2d");
        this.outerWrap = this.canvas.parentElement;
        this.#dpr = window.devicePixelRatio || 1;

        this.wrap = document.createElement("div");
        this.wrap.className = "cs-canvas-wrap";
        this.wrap.style.position = "relative";
        this.wrap.style.overflow = "hidden";
        this.outerWrap.insertBefore(this.wrap, this.canvas);
        this.wrap.appendChild(this.canvas);

        this.scrollMgr = new ScrollManager(this.wrap, this.canvas);
        this.tileRenderer = new TileRenderer(new TileCache(this.#dpr));
        this.overlayRenderer = new OverlayRenderer();
        this.headerRenderer = new HeaderRenderer();

        this.#initCanvasSize();
        this.#bindEvents();
    }

    /** @returns {number} 当前水平滚动偏移量 */
    get scrollX() {
        return this.scrollMgr.scrollX;
    }
    /** @returns {number} 当前垂直滚动偏移量 */
    get scrollY() {
        return this.scrollMgr.scrollY;
    }
    /** @returns {number} 视口逻辑宽度 */
    get viewW() {
        return this.#viewW;
    }
    /** @returns {number} 视口逻辑高度 */
    get viewH() {
        return this.#viewH;
    }
    /** @returns {number} 设备像素比 */
    get dpr() {
        return this.#dpr;
    }
    /** @returns {Sheet|null} 当前渲染的工作表 */
    get currentSheet() {
        return this.#currentSheet;
    }

    /** @returns {Function} 滚动回调函数 */
    get onScrollCallback() {
        return this.scrollMgr.onScrollCallback;
    }
    /**
     * 设置滚动回调函数
     * @param {Function} fn - 滚动时触发的回调
     */
    set onScrollCallback(fn) {
        this.scrollMgr.onScrollCallback = fn;
    }

    /**
     * 初始化 Canvas 画布尺寸
     * 优先使用用户指定的 width/height，未指定则回退到父容器的实际尺寸
     * 同时设置 Canvas 的物理像素尺寸（×dpr）和 CSS 显示尺寸，确保高清屏清晰渲染
     *
     * @param {number|null} [width=null] - 用户指定的画布宽度（CSS 像素），null 则自适应容器
     * @param {number|null} [height=null] - 用户指定的画布高度（CSS 像素），null 则自适应容器
     */
    #initCanvasSize(width, height) {
        const rect = this.outerWrap.getBoundingClientRect();
        const w = width ?? rect.width;
        const h = height ?? rect.height;
        this.#viewW = w;
        this.#viewH = h;
        this.canvas.width = w * this.#dpr;
        this.canvas.height = h * this.#dpr;
        this.canvas.style.width = w + "px";
        this.canvas.style.height = h + "px";
        this.wrap.style.width = w + "px";
        this.wrap.style.height = h + "px";
    }

    /**
     * 外部接口：设置 Canvas 画布大小
     * 会将用户指定的宽高缓存到 #userWidth / #userHeight，
     * 以便窗口 resize 时仍然保持用户设定的大小而非回退到容器大小
     *
     * @param {number|null} width - 画布宽度（CSS 像素），null 表示保持当前值
     * @param {number|null} height - 画布高度（CSS 像素），null 表示保持当前值
     */
    setCanvasSize(width, height) {
        if (width != null) this.#userWidth = width;
        if (height != null) this.#userHeight = height;
        this.#initCanvasSize(this.#userWidth, this.#userHeight);
        this.requestRender();
    }

    /**
     * 绑定事件监听
     * - ScrollManager 的滚动事件绑定
     * - 窗口 resize 事件，重新计算画布尺寸并触发渲染
     */
    #bindEvents() {
        this.scrollMgr.bind();
        this.scrollMgr.onAfterScroll = () => {
            this.requestRender();
        };

        this.#resizeHandler = () => {
            this.#initCanvasSize(this.#userWidth, this.#userHeight);
            this.requestRender();
        };
        window.addEventListener(EVENT_NAMES.RESIZE, this.#resizeHandler);
    }

    /**
     * 请求渲染（合并多次请求）
     * 使用 requestAnimationFrame 确保同一帧内只执行一次渲染，
     * 避免短时间内多次调用 render 导致性能浪费
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
     * 执行完整渲染流程
     * 按层级依次绘制：瓦片内容 → 合并单元格 → 选区 → 行列头 → 滚动条
     *
     * @param {Sheet} sheet - 要渲染的工作表
     */
    render(sheet) {
        if (!sheet || !sheet.visible) return;
        this.#currentSheet = sheet;

        const rc = sheet.rowColManager;
        this.scrollMgr.updateScrollBounds(rc.totalWidth, rc.totalHeight, this.#viewW, this.#viewH);

        const ctx = this.ctx;
        const viewW = this.#viewW;
        const viewH = this.#viewH;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;

        ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
        ctx.clearRect(0, 0, viewW, viewH);

        this.tileRenderer.render(ctx, sheet, sx, sy, viewW, viewH);
        this.overlayRenderer.renderMerges(ctx, sheet, sx, sy);
        this.overlayRenderer.renderSelection(ctx, sheet, sx, sy, viewW, viewH);
        this.headerRenderer.render(ctx, sheet, sx, sy, viewW, viewH);

        this.scrollMgr.updateScrollbars(this.#viewW, this.#viewH);
    }

    /**
     * 获取单元格在视口中的矩形位置
     * 返回的坐标是相对于 Canvas 左上角的 CSS 像素坐标，已扣除滚动偏移
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {object|null} [mergeInfo=null] - 合并单元格信息，包含 topRow/topCol/bottomRow/bottomCol
     * @returns {{ x: number, y: number, w: number, h: number }} 单元格矩形 { x, y, w, h }
     */
    getCellRect(row, col, mergeInfo = null) {
        const sheet = this.#currentSheet;
        const rc = sheet ? sheet.rowColManager : null;
        if (!rc) return { x: 0, y: 0, w: 0, h: 0 };

        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;

        if (mergeInfo) {
            const pageTopRow = sheet ? sheet.toPageRow(mergeInfo.topRow) : mergeInfo.topRow;
            const pageBottomRow = sheet ? sheet.toPageRow(mergeInfo.bottomRow) : mergeInfo.bottomRow;

            const x = headerW + rc.getColX(mergeInfo.topCol) - sx;
            const y = headerH + rc.getRowY(pageTopRow) - sy;
            const w = rc.getColX(mergeInfo.bottomCol) + rc.getColWidth(mergeInfo.bottomCol) - rc.getColX(mergeInfo.topCol);
            const h = rc.getRowY(pageBottomRow) + rc.getRowHeight(pageBottomRow) - rc.getRowY(pageTopRow);
            return { x, y, w, h };
        }

        const x = headerW + rc.getColX(col) - sx;
        const y = headerH + rc.getRowY(row) - sy;
        const w = rc.getColWidth(col);
        const h = rc.getRowHeight(row);
        return { x, y, w, h };
    }

    /**
     * 命中检测：根据客户端坐标判断鼠标点击了哪个区域
     * 支持检测：左上角全选区域、列头、行头、数据单元格
     *
     * @param {number} clientX - 鼠标客户端 X 坐标
     * @param {number} clientY - 鼠标客户端 Y 坐标
     * @returns {object|null} 命中结果，如 { type: HIT_TYPE.CELL, row, col }，未命中返回 null
     */
    hitTest(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;
        const sheet = this.#currentSheet;

        if (px >= 0 && px <= headerW && py >= 0 && py <= headerH) {
            return { type: HIT_TYPE.CORNER };
        }

        if (py >= 0 && py <= headerH && px > headerW) {
            const rc = sheet ? sheet.rowColManager : null;
            if (!rc) return null;
            const dataX = px - headerW + this.scrollMgr.scrollX;
            const col = rc.colAt(dataX);
            if (col >= 0 && col < rc.colCount) {
                return { type: HIT_TYPE.COL_HEADER, index: col };
            }
        }

        if (px >= 0 && px <= headerW && py > headerH) {
            const rc = sheet ? sheet.rowColManager : null;
            if (!rc) return null;
            const dataY = py - headerH + this.scrollMgr.scrollY;
            const row = rc.rowAt(dataY);
            if (row >= 0 && row < rc.rowCount) {
                return { type: HIT_TYPE.ROW_HEADER, index: row };
            }
        }

        if (px > headerW && py > headerH) {
            const rc = sheet ? sheet.rowColManager : null;
            if (!rc) return null;
            const dataX = px - headerW + this.scrollMgr.scrollX;
            const dataY = py - headerH + this.scrollMgr.scrollY;
            const col = rc.colAt(dataX);
            const row = rc.rowAt(dataY);
            if (row >= 0 && row < rc.rowCount && col >= 0 && col < rc.colCount) {
                return { type: HIT_TYPE.CELL, row, col };
            }
        }

        return null;
    }

    /**
     * 表头调整大小手柄的命中检测
     * 判断鼠标是否位于列头右侧或行头下方的调整手柄区域（用于拖拽调整列宽/行高）
     *
     * @param {number} clientX - 鼠标客户端 X 坐标
     * @param {number} clientY - 鼠标客户端 Y 坐标
     * @returns {object|null} 命中结果，如 { type: HIT_TYPE.COL_RESIZE, index }，未命中返回 null
     */
    headerHitTest(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const sheet = this.#currentSheet;
        const rc = sheet ? sheet.rowColManager : null;
        if (!rc) return null;

        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;
        const hitArea = CONFIG.RESIZE_HIT_AREA;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;

        if (py >= 0 && py <= headerH && px > headerW) {
            const dataX = px - headerW + sx;
            const col = rc.colAt(dataX);
            const colRight = rc.getColX(col) + rc.getColWidth(col);
            if (Math.abs(dataX - colRight) <= hitArea) {
                return { type: HIT_TYPE.COL_RESIZE, index: col };
            }
        }

        if (px >= 0 && px <= headerW && py > headerH) {
            const dataY = py - headerH + sy;
            const row = rc.rowAt(dataY);
            const rowBottom = rc.getRowY(row) + rc.getRowHeight(row);
            if (Math.abs(dataY - rowBottom) <= hitArea) {
                return { type: HIT_TYPE.ROW_RESIZE, index: row };
            }
        }

        return null;
    }

    /**
     * 自动填充手柄的命中检测
     * 判断鼠标是否位于当前选区右下角的小方块（填充手柄）区域内
     *
     * @param {number} clientX - 鼠标客户端 X 坐标
     * @param {number} clientY - 鼠标客户端 Y 坐标
     * @returns {boolean} 是否命中填充手柄
     */
    fillHandleHitTest(clientX, clientY) {
        if (!this.#currentSheet) return false;

        const rect = this.canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const sheet = this.#currentSheet;
        const rc = sheet.rowColManager;
        const range = sheet.selection.getRange();

        const headerW = CONFIG.HEADER_WIDTH;
        const headerH = CONFIG.HEADER_HEIGHT;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;

        const x2 = headerW + rc.getColX(range.bottomCol) + rc.getColWidth(range.bottomCol) - sx;
        const y2 = headerH + rc.getRowY(range.bottomRow) + rc.getRowHeight(range.bottomRow) - sy;

        const handleSize = 6;
        return px >= x2 - handleSize && px <= x2 && py >= y2 - handleSize && py <= y2;
    }

    /**
     * 滚动到指定单元格位置，使其可见
     * @param {number} row - 目标行号
     * @param {number} col - 目标列号
     */
    scrollToCell(row, col) {
        const sheet = this.#currentSheet;
        const rc = sheet ? sheet.rowColManager : null;
        this.scrollMgr.scrollToCell(row, col, rc);
    }

    /** @returns {number} 最大水平滚动偏移量 */
    get maxScrollX() {
        return this.scrollMgr.maxScrollX;
    }
    /** @returns {number} 最大垂直滚动偏移量 */
    get maxScrollY() {
        return this.scrollMgr.maxScrollY;
    }

    /**
     * 设置滚动位置并触发渲染
     * @param {number} x - 水平滚动偏移量
     * @param {number} y - 垂直滚动偏移量
     */
    setScrollPosition(x, y) {
        this.scrollMgr.setScrollPosition(x, y);
        this.requestRender();
    }

    /**
     * 使指定单元格的瓦片缓存失效
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    invalidateCell(row, col) {
        const rc = this.#currentSheet ? this.#currentSheet.rowColManager : null;
        this.tileRenderer.invalidateCell(row, col, rc);
    }

    /**
     * 使所有瓦片缓存失效，下次渲染时全部重绘
     */
    invalidateAll() {
        this.tileRenderer.invalidateAll();
    }

    /**
     * 销毁渲染引擎，释放资源
     * 取消未执行的渲染帧、销毁滚动管理器和瓦片渲染器、移除 resize 事件监听
     */
    destroy() {
        if (this.#rafId) {
            cancelAnimationFrame(this.#rafId);
        }
        this.scrollMgr.destroy();
        this.tileRenderer.destroy();
        window.removeEventListener(EVENT_NAMES.RESIZE, this.#resizeHandler);
        if (this.wrap && this.outerWrap) {
            if (this.canvas && this.wrap.contains(this.canvas)) {
                this.wrap.removeChild(this.canvas);
            }
            if (this.outerWrap.contains(this.wrap)) {
                this.outerWrap.removeChild(this.wrap);
            }
        }
    }
}