import { ViewportService } from "./ViewportService.js";
import { ViewportTransform } from "./ViewportTransform.js";

/**
 * 基于 RenderEngine 的 ViewportService 实现
 *
 * 将所有视口操作委托给 RenderEngine，是生产环境的默认实现。
 * 策略和编辑器通过此服务访问视口功能，而非直接引用 RenderEngine。
 *
 * ## 职责边界
 *
 * ViewportService 只暴露视口查询与操作接口，
 * 不暴露 RenderEngine 的内部结构（图层系统、合成器等）。
 * 策略需要访问的 RenderEngine 特有功能（如 dragIndicatorLayer）
 * 仍通过 handler.renderEngine 直接访问，后续可逐步迁移。
 */
export class RenderEngineViewportService extends ViewportService {
    /** @type {import("./RenderEngine.js").RenderEngine} */
    #renderEngine;

    /**
     * @param {import("./RenderEngine.js").RenderEngine} renderEngine
     */
    constructor(renderEngine) {
        super();
        this.#renderEngine = renderEngine;
    }

    get scrollX() {
        return this.#renderEngine.scrollX;
    }

    get scrollY() {
        return this.#renderEngine.scrollY;
    }

    get viewW() {
        return this.#renderEngine.viewW;
    }

    get viewH() {
        return this.#renderEngine.viewH;
    }

    get maxScrollX() {
        return this.#renderEngine.maxScrollX;
    }

    get maxScrollY() {
        return this.#renderEngine.maxScrollY;
    }

    getCellRect(row, col, mergeInfo = null) {
        return this.#renderEngine.getCellRect(row, col, mergeInfo);
    }

    hitTest(clientX, clientY) {
        return this.#renderEngine.hitTest(clientX, clientY);
    }

    headerHitTest(clientX, clientY) {
        return this.#renderEngine.headerHitTest(clientX, clientY);
    }

    fillHandleHitTest(clientX, clientY) {
        return this.#renderEngine.fillHandleHitTest(clientX, clientY);
    }

    scrollToCell(row, col) {
        this.#renderEngine.scrollToCell(row, col);
    }

    /**
     * 判断单元格是否在可视区域内
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {number} canvasW - Canvas 逻辑宽度
     * @param {number} canvasH - Canvas 逻辑高度
     * @param {number} [tabH=0] - 标签栏高度
     * @returns {boolean}
     */
    // eslint-disable-next-line max-params
    isCellVisible(row, col, canvasW, canvasH, tabH = 0) {
        const sheet = this.#renderEngine.currentSheet;
        if (!sheet) return false;
        const vt = new ViewportTransform(sheet, this.#renderEngine.scrollX, this.#renderEngine.scrollY);
        return vt.isCellVisible(row, col, canvasW, canvasH, tabH);
    }

    setResizeLine(type, index, position) {
        this.#renderEngine.setResizeLine(type, index, position);
    }

    clearResizeLine() {
        this.#renderEngine.clearResizeLine();
    }

    invalidateAll() {
        this.#renderEngine.invalidateAll();
    }

    get canvasParent() {
        return this.#renderEngine.canvas?.parentElement ?? null;
    }

    get canvas() {
        return this.#renderEngine.canvas;
    }

    render(sheet) {
        this.#renderEngine.render(sheet);
    }
}
