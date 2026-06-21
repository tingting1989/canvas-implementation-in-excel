import { TileCache } from "./TileCache.js";
import { ScrollManager } from "../ui/ScrollManager.js";
import { SheetTabBar } from "../ui/SheetTabBar.js";
import { TileRenderer } from "./TileRenderer.js";
import { OverlayRenderer } from "./OverlayRenderer.js";
import { HeaderRenderer } from "./HeaderRenderer.js";
import { ViewportTransform } from "./ViewportTransform.js";
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
    /**
     * @type {Sheet|null} 当前正在渲染的工作表
     *
     * */

    #currentSheet = null;
    /** @type {number|null} requestAnimationFrame 回调 ID，用于取消未执行的渲染帧 */
    #rafId = null;
    /** @type {boolean} 是否已有待执行的渲染请求（防止重复 rAF） */
    #pendingRender = false;
    /** @type {Function|null} 窗口 resize 事件处理器引用，用于销毁时移除监听 */
    #resizeHandler = null;
    /** @type {number} 设备像素比，用于高清屏适配 */
    /** @type {number} 视口逻辑宽度（CSS 像素） */
    #viewW = 0;
    /** @type {number} 视口逻辑高度（CSS 像素） */
    #viewH = 0;
    /**
     * 缓存的 ViewportTransform 实例，避免 hitTest/getCellRect 等高频方法每次 new
     * 通过 #getViewportTransform() 获取，内部按需更新（sheet/scroll 变化时）
     * @type {ViewportTransform|null}
     */
    #cachedVT = null;
    /** @type {string} 缓存 VT 对应的 sheet 标识，用于判断是否需要重建 */
    #cachedVTSheetKey = "";
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

        /** @type {Function|null} 每次渲染完成后调用 */
        this.onAfterRender = null;

        this.wrap = document.createElement("div");
        this.wrap.className = "cs-canvas-wrap";
        this.wrap.style.position = "relative";
        this.wrap.style.overflow = "hidden";
        this.outerWrap.insertBefore(this.wrap, this.canvas);
        this.wrap.appendChild(this.canvas);

        this.scrollMgr = new ScrollManager(this.wrap, this.canvas);
        this.sheetTabBar = new SheetTabBar(this.wrap, null);
        this.tileRenderer = new TileRenderer(new TileCache());
        this.overlayRenderer = new OverlayRenderer();
        this.headerRenderer = new HeaderRenderer();

        // 图片异步加载完成后自动触发重绘
        this.tileRenderer.onContentReady = () => {
            this.requestRender();
        };

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
        const canvasW = w - CONFIG.SCROLLBAR_WIDTH;
        const canvasH = h - CONFIG.SHEET_TAB_HEIGHT;
        this.#viewW = canvasW;
        this.#viewH = canvasH;
        this.canvas.width = canvasW * CONFIG.DPR;
        this.canvas.height = canvasH * CONFIG.DPR;
        this.canvas.style.width = canvasW + "px";
        this.canvas.style.height = canvasH + "px";
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

        // 每帧开始时失效冻结缓存，确保行高/列宽变更后能重新计算
        sheet.invalidateFreezeCache();

        const rc = sheet.rowColManager;
        const headerH = sheet.getHeaderHeight();
        const headerW = sheet.getHeaderWidth();
        const frozenRowsH = sheet.frozenRowsHeight;
        const frozenColsW = sheet.frozenColsWidth;

        // 分页模式下，冻结行不在当前页数据范围内，
        // totalHeight 不包含冻结行高度，因此 dataViewH 也不应扣除 frozenRowsH
        const isPaginationActive = rc.pageStartRow >= 0;
        const effectiveFrozenRowsH = isPaginationActive ? 0 : frozenRowsH;
        this.scrollMgr.updateScrollBounds(
            rc.totalWidth,
            rc.totalHeight,
            this.#viewW,
            this.#viewH,
            headerH,
            headerW,
            effectiveFrozenRowsH,
            frozenColsW,
        );

        if (headerH !== CONFIG.HEADER_HEIGHT) {
            this.wrap.style.setProperty("--header-height", `${headerH}px`);
        }
        if (headerW !== CONFIG.HEADER_WIDTH) {
            this.wrap.style.setProperty("--header-width", `${headerW}px`);
        }

        const ctx = this.ctx;
        const viewW = this.#viewW;
        const viewH = this.#viewH;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;

        ctx.setTransform(CONFIG.DPR, 0, 0, CONFIG.DPR, 0, 0);
        ctx.clearRect(0, 0, viewW, viewH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        const mainViewW = viewW;
        const mainViewH = viewH;
        const vt = this.#getViewportTransform();

        this.tileRenderer.render(ctx, sheet, sx, sy, mainViewW, mainViewH);
        this.overlayRenderer.renderMerges(ctx, sheet, vt);
        this.overlayRenderer.renderSelection(ctx, sheet, vt, viewW, viewH);

        const freezeTileOptions = isPaginationActive ? { useRealRows: true } : undefined;

        if (frozenColsW > 0) {
            this.#renderClippedRegion(
                ctx,
                sheet,
                headerW,
                headerH,
                frozenColsW,
                viewH - headerH,
                0,
                sy,
                frozenColsW + headerW,
                viewH,
                vt,
                freezeTileOptions,
            );
        }

        if (frozenRowsH > 0) {
            this.#renderClippedRegion(
                ctx,
                sheet,
                headerW,
                headerH,
                viewW - headerW,
                frozenRowsH,
                sx,
                0,
                viewW,
                frozenRowsH + headerH,
                vt,
                freezeTileOptions,
            );
        }

        if (frozenRowsH > 0 && frozenColsW > 0) {
            this.#renderClippedRegion(
                ctx,
                sheet,
                headerW,
                headerH,
                frozenColsW,
                frozenRowsH,
                0,
                0,
                frozenColsW + headerW,
                frozenRowsH + headerH,
                vt,
                freezeTileOptions,
            );
        }

        this.headerRenderer.render(ctx, sheet, vt, viewW, viewH);

        if (frozenColsW > 0 || frozenRowsH > 0) {
            this.#renderFreezeLines(ctx, headerW, headerH, frozenColsW, frozenRowsH, viewW, viewH);
        }

        this.scrollMgr.updateScrollbars(this.#viewW, this.#viewH);

        if (this.onAfterRender) {
            this.onAfterRender();
        }
    }

    /**
     * 在指定裁剪区域内渲染内容（消除冻结区域 4 处重复的 clip 逻辑）
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Sheet} sheet
     * @param {number} clipX - 裁剪区域 X
     * @param {number} clipY - 裁剪区域 Y
     * @param {number} clipW - 裁剪区域宽度
     * @param {number} clipH - 裁剪区域高度
     * @param {number} scrollX - 水平滚动偏移
     * @param {number} scrollY - 垂直滚动偏移
     * @param {number} viewW - 视口宽度（用于 overlay）
     * @param {number} viewH - 视口高度（用于 overlay）
     * @param {object} [tileOptions] - 传递给 TileRenderer 的额外选项
     */
    #renderClippedRegion(ctx, sheet, clipX, clipY, clipW, clipH, scrollX, scrollY, viewW, viewH, vt, tileOptions) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(clipX, clipY, clipW, clipH);
        ctx.clip();
        this.tileRenderer.render(ctx, sheet, scrollX, scrollY, viewW, viewH, tileOptions);
        this.overlayRenderer.renderMerges(ctx, sheet, vt);
        this.overlayRenderer.renderSelection(ctx, sheet, vt, viewW, viewH);
        ctx.restore();
    }

    #renderFreezeLines(ctx, headerW, headerH, frozenColsW, frozenRowsH, viewW, viewH) {
        ctx.save();
        ctx.strokeStyle = "#217346";
        ctx.lineWidth = 2;

        if (frozenColsW > 0) {
            const x = headerW + frozenColsW;
            ctx.beginPath();
            ctx.moveTo(x, headerH);
            ctx.lineTo(x, viewH);
            ctx.stroke();
        }

        if (frozenRowsH > 0) {
            const y = headerH + frozenRowsH;
            ctx.beginPath();
            ctx.moveTo(headerW, y);
            ctx.lineTo(viewW, y);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * 获取缓存的 ViewportTransform 实例（带滚动偏移）
     * 内部按需更新：当 sheet 或滚动位置变化时重建，避免高频方法每次 new
     * @returns {ViewportTransform|null}
     */
    #getViewportTransform() {
        const sheet = this.#currentSheet;
        if (!sheet) return null;
        const sx = this.scrollMgr.scrollX;
        const sy = this.scrollMgr.scrollY;
        // 用冻结尺寸+表头尺寸+名称组合作为 sheet 状态标识，
        // 行高/列宽变化时这些值会变，确保缓存失效
        const sheetKey = `${sheet.name}:${sheet.frozenColsWidth}:${sheet.frozenRowsHeight}:${sheet.getHeaderWidth()}:${sheet.getHeaderHeight()}`;
        if (!this.#cachedVT || this.#cachedVTSheetKey !== sheetKey || this.#cachedVT.scrollX !== sx || this.#cachedVT.scrollY !== sy) {
            this.#cachedVT = new ViewportTransform(sheet, sx, sy);
            this.#cachedVTSheetKey = sheetKey;
        }
        return this.#cachedVT;
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
        if (!sheet || !sheet.rowColManager) return { x: 0, y: 0, w: 0, h: 0 };

        const vt = this.#getViewportTransform();

        if (mergeInfo) {
            // mergeInfo 的行号为实际行号，需转为页面行号后再做视口坐标转换
            const pageTopRow = sheet.toPageRow(mergeInfo.topRow);
            const pageBottomRow = sheet.toPageRow(mergeInfo.bottomRow);
            const pageMerge = { topRow: pageTopRow, topCol: mergeInfo.topCol, bottomRow: pageBottomRow, bottomCol: mergeInfo.bottomCol };
            return vt.mergeToViewRect(pageMerge);
        }

        return vt.cellToViewRect(row, col);
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
        const sheet = this.#currentSheet;
        if (!sheet) return null;
        const vt = this.#getViewportTransform();
        const rc = sheet.rowColManager;
        const headerW = vt.headerW;
        const headerH = vt.headerH;

        if (px > this.#viewW || py > this.#viewH) return null;

        if (px >= 0 && px <= headerW && py >= 0 && py <= headerH) {
            return { type: HIT_TYPE.CORNER };
        }

        if (py >= 0 && py <= headerH && px > headerW) {
            const col = vt.viewXToCol(px);
            if (col >= 0 && col < rc.colCount) {
                return { type: HIT_TYPE.COL_HEADER, index: col };
            }
        }

        if (px >= 0 && px <= headerW && py > headerH) {
            const row = vt.viewYToRow(py);
            if (row >= 0 && row < rc.rowCount) {
                return { type: HIT_TYPE.ROW_HEADER, index: row };
            }
        }

        if (px > headerW && py > headerH) {
            const col = vt.viewXToCol(px);
            const row = vt.viewYToRow(py);
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
        if (!sheet) return null;
        const rc = sheet.rowColManager;
        const vt = this.#getViewportTransform();
        const headerW = vt.headerW;
        const headerH = vt.headerH;
        const hitArea = CONFIG.RESIZE_HIT_AREA;
        if (px > this.#viewW || py > this.#viewH) return null;

        if (py >= 0 && py <= headerH && px > headerW) {
            const dataX = vt.viewXToDataX(px);
            const col = rc.colAt(dataX);
            const colRight = vt.colRightToDataX(col);
            if (Math.abs(dataX - colRight) <= hitArea) {
                return { type: HIT_TYPE.COL_RESIZE, index: col };
            }
        }

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
        const range = sheet.selection.getRange();

        const vt = this.#getViewportTransform();
        const x2 = vt.colRightToViewX(range.bottomCol);
        const y2 = vt.rowBottomToViewY(range.bottomRow);

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
        const frozenRowsH = sheet ? sheet.frozenRowsHeight : 0;
        const frozenColsW = sheet ? sheet.frozenColsWidth : 0;
        this.scrollMgr.scrollToCell(row, col, rc, frozenRowsH, frozenColsW);
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
        this.sheetTabBar.destroy();
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
