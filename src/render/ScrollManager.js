import { EVENT_NAMES } from "../constants/eventNames.js";
import { CONFIG } from "../constants/config";

/**
 * 模块级标志位：确保滚动条 CSS 样式只注入一次
 * 即使页面上创建了多个 ScrollManager 实例，样式也只生成一份
 */
let scrollbarStyleInjected = false;

/**
 * 向 <head> 注入滚动条 CSS 样式
 *
 * 样式布局说明（以水平滚动条为例）：
 * ┌──────────────────────────────────────────────────────────────┐
 * │  cs-canvas-wrap (position: relative, 与 canvas 同尺寸)       │
 * │  ┌────────────────────────────────────────────────────────┐  │
 * │  │  canvas                                                │  │
 * │  └────────────────────────────────────────────────────────┘  │
 * │  ┌──────────────────────────────────────────────────┬───┐    │
 * │  │  cs-scrollbar-h (left=HEADER_WIDTH, right=14px)  │ C │    │
 * │  │  ┌─────────────────────┐                          │ O │    │
 * │  │  │  cs-scrollbar-h-thumb                         │ R │    │
 * │  │  └─────────────────────┘                          │ N │    │
 * │  └──────────────────────────────────────────────────┴───┘    │
 * └──────────────────────────────────────────────────────────────┘
 *
 * - 水平滚动条 left=HEADER_WIDTH：为行头区域留出空间
 * - 水平滚动条 right=SCROLLBAR_WIDTH：为右下角 corner 留出空间
 * - 垂直滚动条 top=HEADER_HEIGHT：为列头区域留出空间
 * - 垂直滚动条 bottom=SCROLLBAR_WIDTH：为右下角 corner 留出空间
 * - corner 位于右下角，宽高均为 SCROLLBAR_WIDTH
 */
function injectScrollbarStyles() {
    if (scrollbarStyleInjected) return;
    scrollbarStyleInjected = true;

    const style = document.createElement("style");
    style.textContent = `
.cs-scrollbar-h {
  position: absolute;
  bottom: 0;
  left: ${CONFIG.HEADER_WIDTH}px;
  right: ${CONFIG.SCROLLBAR_WIDTH}px;
  height: ${CONFIG.SCROLLBAR_WIDTH}px;
  background: #f1f1f1;
  border-top: 1px solid #ddd;
  z-index: 10;
}
.cs-scrollbar-h-thumb {
  position: absolute;
  top: 1px;
  height: ${CONFIG.SCROLLBAR_WIDTH - 2}px;
  min-width: ${CONFIG.SCROLLBAR_MIN_SIZE}px;
  background: #c1c1c1;
  border-radius: 6px;
  cursor: pointer;
}
.cs-scrollbar-h-thumb:hover {
  background: #a8a8a8;
}
.cs-scrollbar-v {
  position: absolute;
  top: ${CONFIG.HEADER_HEIGHT}px;
  right: 0;
  bottom: ${CONFIG.SCROLLBAR_WIDTH}px;
  width: ${CONFIG.SCROLLBAR_WIDTH}px;
  background: #f1f1f1;
  border-left: 1px solid #ddd;
  z-index: 10;
}
.cs-scrollbar-v-thumb {
  position: absolute;
  left: 1px;
  width: ${CONFIG.SCROLLBAR_WIDTH - 2}px;
  min-height: ${CONFIG.SCROLLBAR_MIN_SIZE}px;
  background: #c1c1c1;
  border-radius: 6px;
  cursor: pointer;
}
.cs-scrollbar-v-thumb:hover {
  background: #a8a8a8;
}
.cs-scrollbar-corner {
  position: absolute;
  right: 0;
  bottom: 0;
  width: ${CONFIG.SCROLLBAR_WIDTH}px;
  height: ${CONFIG.SCROLLBAR_WIDTH}px;
  background: #f1f1f1;
  border-top: 1px solid #ddd;
  border-left: 1px solid #ddd;
  z-index: 11;
}`;
    document.head.appendChild(style);
}

/**
 * 滚动管理器
 * 管理表格的滚动偏移、自定义滚动条 UI、鼠标滚轮事件和滚动条拖拽交互
 *
 * 核心概念：
 * - scrollX / scrollY：数据区域当前的滚动偏移量（像素），不包括行头/列头的偏移
 * - maxScrollX / maxScrollY：最大可滚动距离 = 总内容尺寸 - 可视区域尺寸
 * - viewW / viewH：可视区域总尺寸（含行头/列头），用于计算滚动条轨道长度
 *
 * 滚动条 thumb 尺寸计算原理：
 *   thumbSize = trackSize × (viewSize / totalContentSize)
 * 即可视区域占总内容的比例越大，thumb 越长；内容越多，thumb 越短
 *
 * 滚动条 thumb 位置计算原理：
 *   thumbPosition = (scrollOffset / maxScroll) × (trackSize - thumbSize)
 * 即滚动比例映射到 thumb 在轨道中的可移动范围
 */
export class ScrollManager {
    /** @type {number} 当前水平滚动偏移量（数据区域像素） */
    #scrollX = 0;
    /** @type {number} 当前垂直滚动偏移量（数据区域像素） */
    #scrollY = 0;
    /** @type {number} 最大水平滚动偏移量 */
    #maxScrollX = 0;
    /** @type {number} 最大垂直滚动偏移量 */
    #maxScrollY = 0;
    /** @type {Function|null} 滚动回调（在滚动偏移更新后、渲染前触发） */
    #onScrollCallback = null;
    /** @type {Function|null} 滚动完成后回调（用于触发重新渲染） */
    #onAfterScroll = null;
    /** @type {Function|null} wheel 事件处理器引用，用于销毁时移除 */
    #wheelHandler = null;
    /** @type {Function|null} 拖拽 mousemove 处理器引用，用于销毁时移除 */
    #dragMoveHandler = null;
    /** @type {Function|null} 拖拽 mouseup 处理器引用，用于销毁时移除 */
    #dragEndHandler = null;
    /** @type {number} 可视区域总宽度（含行头） */
    #viewW = 0;
    /** @type {number} 可视区域总高度（含列头） */
    #viewH = 0;
    /** @type {HTMLElement|null} 水平滚动条 thumb 元素引用 */
    #hThumb = null;
    /** @type {HTMLElement|null} 垂直滚动条 thumb 元素引用 */
    #vThumb = null;
    /** @type {HTMLElement|null} 水平滚动条轨道元素引用 */
    #hBar = null;
    /** @type {HTMLElement|null} 垂直滚动条轨道元素引用 */
    #vBar = null;
    /** @type {HTMLElement|null} 右下角 corner 元素引用 */
    #corner = null;

    /**
     * 创建滚动管理器
     * @param {HTMLElement} wrap - 内层包裹容器（cs-canvas-wrap，与 canvas 同尺寸）
     * @param {HTMLCanvasElement} canvas - Canvas 元素
     */
    constructor(wrap, canvas) {
        this.wrap = wrap;
        this.canvas = canvas;
        this.#createScrollbarDOM();
        this.#bindThumbDrag();
    }

    /**
     * 创建滚动条 DOM 元素并挂载到 wrap 容器
     * 同时确保 CSS 样式已注入到文档
     *
     * 生成的 DOM 结构：
     *   wrap (cs-canvas-wrap)
     *   ├── canvas
     *   ├── .cs-scrollbar-h > .cs-scrollbar-h-thumb
     *   ├── .cs-scrollbar-v > .cs-scrollbar-v-thumb
     *   └── .cs-scrollbar-corner
     */
    #createScrollbarDOM() {
        injectScrollbarStyles();

        this.#hBar = document.createElement("div");
        this.#hBar.className = "cs-scrollbar-h";
        this.#hThumb = document.createElement("div");
        this.#hThumb.className = "cs-scrollbar-h-thumb";
        this.#hBar.appendChild(this.#hThumb);

        this.#vBar = document.createElement("div");
        this.#vBar.className = "cs-scrollbar-v";
        this.#vThumb = document.createElement("div");
        this.#vThumb.className = "cs-scrollbar-v-thumb";
        this.#vBar.appendChild(this.#vThumb);

        this.#corner = document.createElement("div");
        this.#corner.className = "cs-scrollbar-corner";

        this.wrap.appendChild(this.#hBar);
        this.wrap.appendChild(this.#vBar);
        this.wrap.appendChild(this.#corner);
    }

    /**
     * 绑定滚动条 thumb 的拖拽交互
     *
     * 拖拽原理：
     * 1. mousedown 时记录起始鼠标位置和当前滚动偏移
     * 2. mousemove 时计算鼠标位移 dx/dy
     * 3. 将鼠标位移转换为滚动偏移：
     *    - trackSize 是滚动条轨道的像素长度
     *    - totalContentSize 是内容的总像素长度（maxScroll + viewSize）
     *    - ratio = trackSize / totalContentSize，表示轨道与内容的缩放比
     *    - newScroll = startScroll + mouseDelta / ratio
     *    即鼠标在轨道上移动 1px，内容滚动 (1/ratio) px
     * 4. mouseup 时结束拖拽，移除 document 级别的 mousemove/mouseup 监听
     *
     * 注意：mousemove/mouseup 绑定在 document 上而非 thumb 上，
     * 因为鼠标可能移出 thumb 区域仍在拖拽
     */
    #bindThumbDrag() {
        let dragging = null;
        let startMouse = 0;
        let startScroll = 0;

        const onHThumbDown = (e) => {
            e.preventDefault();
            dragging = "h";
            startMouse = e.clientX;
            startScroll = this.#scrollX;
            document.addEventListener("mousemove", onDragMove);
            document.addEventListener("mouseup", onDragEnd);
        };

        const onVThumbDown = (e) => {
            e.preventDefault();
            dragging = "v";
            startMouse = e.clientY;
            startScroll = this.#scrollY;
            document.addEventListener("mousemove", onDragMove);
            document.addEventListener("mouseup", onDragEnd);
        };

        const onDragMove = (e) => {
            if (dragging === "h") {
                const dx = e.clientX - startMouse;
                const trackW = this.#viewW - CONFIG.HEADER_WIDTH - CONFIG.SCROLLBAR_WIDTH;
                const viewW = this.#viewW - CONFIG.HEADER_WIDTH;
                const totalContent = this.#maxScrollX + viewW;
                const ratio = totalContent > 0 ? trackW / totalContent : 1;
                const newX = Math.max(0, Math.min(this.#maxScrollX, startScroll + dx / ratio));
                this.setScrollPosition(newX, this.#scrollY);
            } else if (dragging === "v") {
                const dy = e.clientY - startMouse;
                const trackH = this.#viewH - CONFIG.HEADER_HEIGHT - CONFIG.SCROLLBAR_WIDTH;
                const viewH = this.#viewH - CONFIG.HEADER_HEIGHT;
                const totalContent = this.#maxScrollY + viewH;
                const ratio = totalContent > 0 ? trackH / totalContent : 1;
                const newY = Math.max(0, Math.min(this.#maxScrollY, startScroll + dy / ratio));
                this.setScrollPosition(this.#scrollX, newY);
            }
        };

        const onDragEnd = () => {
            dragging = null;
            document.removeEventListener("mousemove", onDragMove);
            document.removeEventListener("mouseup", onDragEnd);
        };

        this.#hThumb.addEventListener("mousedown", onHThumbDown);
        this.#vThumb.addEventListener("mousedown", onVThumbDown);

        this.#dragMoveHandler = onDragMove;
        this.#dragEndHandler = onDragEnd;
    }

    /** @returns {number} 当前水平滚动偏移量 */
    get scrollX() {
        return this.#scrollX;
    }

    /** @returns {number} 当前垂直滚动偏移量 */
    get scrollY() {
        return this.#scrollY;
    }

    /** @returns {number} 最大水平滚动偏移量 */
    get maxScrollX() {
        return this.#maxScrollX;
    }

    /** @returns {number} 最大垂直滚动偏移量 */
    get maxScrollY() {
        return this.#maxScrollY;
    }

    /** @returns {Function|null} 滚动回调 */
    get onScrollCallback() {
        return this.#onScrollCallback;
    }

    /** @param {Function|null} fn - 滚动回调 */
    set onScrollCallback(fn) {
        this.#onScrollCallback = fn;
    }

    /** @returns {Function|null} 滚动完成后回调 */
    get onAfterScroll() {
        return this.#onAfterScroll;
    }

    /** @param {Function|null} fn - 滚动完成后回调 */
    set onAfterScroll(fn) {
        this.#onAfterScroll = fn;
    }

    /**
     * 设置可视区域尺寸
     * @param {number} w - 宽度
     * @param {number} h - 高度
     */
    setViewSize(w, h) {
        this.#viewW = w;
        this.#viewH = h;
    }

    /**
     * 绑定鼠标滚轮事件
     * 监听 wrap 容器的 wheel 事件，根据 deltaX/deltaY 更新滚动偏移
     * 使用 { passive: false } 以便 e.preventDefault() 阻止页面滚动
     */
    bind() {
        this.#wheelHandler = (e) => {
            e.preventDefault();
            const dx = e.deltaX || 0;
            const dy = e.deltaY || 0;
            this.#scrollX = Math.max(0, Math.min(this.#maxScrollX, this.#scrollX + dx));
            this.#scrollY = Math.max(0, Math.min(this.#maxScrollY, this.#scrollY + dy));
            if (this.#onScrollCallback) {
                this.#onScrollCallback();
            }
            if (this.#onAfterScroll) {
                this.#onAfterScroll();
            }
        };
        this.wrap.addEventListener(EVENT_NAMES.WHEEL, this.#wheelHandler, { passive: false });
    }

    /**
     * 更新滚动边界
     * 根据内容总尺寸和可视区域尺寸计算最大可滚动距离
     * 同时将当前滚动偏移钳制到合法范围内（防止内容缩小后偏移越界）
     *
     * @param {number} totalW - 数据区域总宽度（不含行头）
     * @param {number} totalH - 数据区域总高度（不含列头）
     * @param {number} viewW  - 可视区域总宽度（含行头）
     * @param {number} viewH  - 可视区域总高度（含列头）
     */
    updateScrollBounds(totalW, totalH, viewW, viewH) {
        this.#viewW = viewW;
        this.#viewH = viewH;
        this.#maxScrollX = Math.max(0, totalW - viewW + CONFIG.HEADER_WIDTH);
        this.#maxScrollY = Math.max(0, totalH - viewH + CONFIG.HEADER_HEIGHT);
        this.#scrollX = Math.min(this.#scrollX, this.#maxScrollX);
        this.#scrollY = Math.min(this.#scrollY, this.#maxScrollY);
    }

    /**
     * 设置滚动位置
     * 值会被钳制到 [0, maxScroll] 范围内，然后触发 onScrollCallback 和 onAfterScroll
     *
     * @param {number} x - 目标水平滚动偏移
     * @param {number} y - 目标垂直滚动偏移
     */
    setScrollPosition(x, y) {
        this.#scrollX = Math.max(0, Math.min(this.#maxScrollX, x));
        this.#scrollY = Math.max(0, Math.min(this.#maxScrollY, y));
        if (this.#onScrollCallback) this.#onScrollCallback();
        if (this.#onAfterScroll) this.#onAfterScroll();
    }

    /**
     * 更新滚动条 thumb 的尺寸和位置
     * 在每次渲染时调用，确保 thumb 反映当前滚动状态
     *
     * 计算示例（垂直方向）：
     *
     *   trackH = viewH - HEADER_HEIGHT - SCROLLBAR_WIDTH   (轨道可用长度)
     *   viewH2 = viewH - HEADER_HEIGHT                      (数据区可视高度)
     *   totalH = maxScrollY + viewH2                         (内容总高度)
     *
     *   thumbH = trackH × (viewH2 / totalH)                 (thumb 高度 = 可视占比 × 轨道长度)
     *   thumbTop = (scrollY / maxScrollY) × (trackH - thumbH) (thumb 位置 = 滚动比例 × 可移动范围)
     *
     * @param {number} [viewW] - 可视区域宽度（可选，不传则保持上次值）
     * @param {number} [viewH] - 可视区域高度（可选，不传则保持上次值）
     */
    updateScrollbars(viewW, viewH) {
        this.#viewW = viewW || this.#viewW;
        this.#viewH = viewH || this.#viewH;

        if (this.#vThumb && this.#maxScrollY > 0) {
            const trackH = this.#viewH - CONFIG.HEADER_HEIGHT - CONFIG.SCROLLBAR_WIDTH;
            const viewH2 = this.#viewH - CONFIG.HEADER_HEIGHT;
            const totalH = this.#maxScrollY + viewH2;
            const thumbH = Math.max(CONFIG.SCROLLBAR_MIN_SIZE, Math.floor(trackH * (viewH2 / totalH)));
            this.#vThumb.style.height = thumbH + "px";
            const ratio = this.#scrollY / this.#maxScrollY;
            this.#vThumb.style.top = ratio * (trackH - thumbH) + "px";
        }

        if (this.#hThumb && this.#maxScrollX > 0) {
            const trackW = this.#viewW - CONFIG.HEADER_WIDTH - CONFIG.SCROLLBAR_WIDTH;
            const viewW2 = this.#viewW - CONFIG.HEADER_WIDTH;
            const totalW = this.#maxScrollX + viewW2;
            const thumbW = Math.max(CONFIG.SCROLLBAR_MIN_SIZE, Math.floor(trackW * (viewW2 / totalW)));
            this.#hThumb.style.width = thumbW + "px";
            const ratio = this.#scrollX / this.#maxScrollX;
            this.#hThumb.style.left = ratio * (trackW - thumbW) + "px";
        }
    }

    /**
     * 滚动到指定单元格位置，使其可见
     * 如果单元格已在可视区域内则不滚动，否则最小化滚动使其刚好可见
     *
     * 逻辑：
     * - cellX < scrollX → 单元格在可视区左侧，滚动到 cellX
     * - cellX + cellW > scrollX + viewW → 单元格在可视区右侧，滚动到 cellX + cellW - viewW
     * - 垂直方向同理
     *
     * @param {number} row - 目标行号
     * @param {number} col - 目标列号
     * @param {object|null} rc - RowColManager 实例，用于查询单元格位置和尺寸
     */
    scrollToCell(row, col, rc) {
        if (!rc) return;

        const cellX = rc.getColX(col);
        const cellY = rc.getRowY(row);
        const cellW = rc.getColWidth(col);
        const cellH = rc.getRowHeight(row);
        const viewW = this.#viewW - CONFIG.HEADER_WIDTH;
        const viewH = this.#viewH - CONFIG.HEADER_HEIGHT;

        if (cellX < this.#scrollX) {
            this.#scrollX = cellX;
        } else if (cellX + cellW > this.#scrollX + viewW) {
            this.#scrollX = cellX + cellW - viewW;
        }

        if (cellY < this.#scrollY) {
            this.#scrollY = cellY;
        } else if (cellY + cellH > this.#scrollY + viewH) {
            this.#scrollY = cellY + cellH - viewH;
        }

        this.#scrollX = Math.max(0, Math.min(this.#maxScrollX, this.#scrollX));
        this.#scrollY = Math.max(0, Math.min(this.#maxScrollY, this.#scrollY));
    }

    /**
     * 销毁滚动管理器，释放所有资源
     * - 移除 wheel 事件监听
     * - 移除拖拽相关的 document 级别 mousemove/mouseup 监听
     * - 从 DOM 中移除滚动条元素
     * - 清空所有引用
     */
    destroy() {
        if (this.#wheelHandler) {
            this.wrap.removeEventListener(EVENT_NAMES.WHEEL, this.#wheelHandler);
            this.#wheelHandler = null;
        }
        if (this.#dragMoveHandler) {
            document.removeEventListener("mousemove", this.#dragMoveHandler);
            this.#dragMoveHandler = null;
        }
        if (this.#dragEndHandler) {
            document.removeEventListener("mouseup", this.#dragEndHandler);
            this.#dragEndHandler = null;
        }
        if (this.#hBar && this.#hBar.parentElement) {
            this.#hBar.parentElement.removeChild(this.#hBar);
        }
        if (this.#vBar && this.#vBar.parentElement) {
            this.#vBar.parentElement.removeChild(this.#vBar);
        }
        if (this.#corner && this.#corner.parentElement) {
            this.#corner.parentElement.removeChild(this.#corner);
        }
        this.#hBar = null;
        this.#vBar = null;
        this.#corner = null;
        this.#hThumb = null;
        this.#vThumb = null;
        this.wrap = null;
        this.canvas = null;
    }
}