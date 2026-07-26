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
 * 策略需要访问的 RenderEngine 特有功能（如 selectionLayer）
 * 仍通过 handler.renderEngine 直接访问，后续可逐步迁移。
 *
 * ## 与 CanvasContext 的分工
 *
 * - ViewportService：纯视口查询与操作（滚动位置、命中测试、单元格坐标等）
 * - CanvasContext：Canvas DOM 访问和渲染触发（canvas 元素、canvasParent、render）
 *
 * @see ViewportService 基类定义了所有视口相关的抽象接口
 * @see RenderEngineViewportService 本类，将接口委托给 RenderEngine 实现
 * @see RenderEngineCanvasContext Canvas DOM 访问和渲染控制的对应实现
 */
export class RenderEngineViewportService extends ViewportService {
    /** @type {import("./RenderEngine.js").RenderEngine} 被委托的渲染引擎实例 */
    #renderEngine;

    /**
     * @param {import("./RenderEngine.js").RenderEngine} renderEngine - 渲染引擎实例
     */
    constructor(renderEngine) {
        super();
        this.#renderEngine = renderEngine;
    }

    /** 当前水平滚动偏移（数据坐标） @override */
    get scrollX() {
        return this.#renderEngine.scrollX;
    }

    /** 当前垂直滚动偏移（数据坐标） @override */
    get scrollY() {
        return this.#renderEngine.scrollY;
    }

    /** 视口宽度（CSS 像素） @override */
    get viewW() {
        return this.#renderEngine.viewW;
    }

    /** 视口高度（CSS 像素） @override */
    get viewH() {
        return this.#renderEngine.viewH;
    }

    /** 最大水平滚动偏移 @override */
    get maxScrollX() {
        return this.#renderEngine.maxScrollX;
    }

    /** 最大垂直滚动偏移 @override */
    get maxScrollY() {
        return this.#renderEngine.maxScrollY;
    }

    /**
     * 获取指定单元格在视口中的矩形位置
     *
     * @param {number} row - 行索引
     * @param {number} col - 列索引
     * @param {Object|null} [mergeInfo=null] - 合并单元格信息，有值时返回整个合并区域的矩形
     * @returns {{ x: number, y: number, w: number, h: number }} 视口坐标矩形
     * @override
     */
    getCellRect(row, col, mergeInfo = null) {
        return this.#renderEngine.getCellRect(row, col, mergeInfo);
    }

    /**
     * 命中测试：将客户端坐标转换为命中的区域类型和索引
     *
     * @param {number} clientX - 客户端 X 坐标
     * @param {number} clientY - 客户端 Y 坐标
     * @returns {Object|null} 命中结果，如 { type: HIT_TYPE.CELL, row, col }
     * @override
     */
    hitTest(clientX, clientY) {
        return this.#renderEngine.hitTest(clientX, clientY);
    }

    /**
     * 表头命中测试：检测鼠标是否在行/列调整大小的区域
     *
     * @param {number} clientX - 客户端 X 坐标
     * @param {number} clientY - 客户端 Y 坐标
     * @returns {Object|null} 命中结果，如 { type: HIT_TYPE.COL_RESIZE, index }
     * @override
     */
    headerHitTest(clientX, clientY) {
        return this.#renderEngine.headerHitTest(clientX, clientY);
    }

    /**
     * 填充柄命中测试：检测鼠标是否在选区右下角的填充柄区域
     *
     * @param {number} clientX - 客户端 X 坐标
     * @param {number} clientY - 客户端 Y 坐标
     * @returns {boolean} 是否命中填充柄
     * @override
     */
    fillHandleHitTest(clientX, clientY) {
        return this.#renderEngine.fillHandleHitTest(clientX, clientY);
    }

    /**
     * 滚动到指定单元格位置使其可见
     *
     * @param {number} row - 目标行索引
     * @param {number} col - 目标列索引
     * @override
     */
    scrollToCell(row, col) {
        this.#renderEngine.scrollToCell(row, col);
    }

    /**
     * 判断单元格是否在可视区域内
     *
     * 创建 ViewportTransform 实例进行坐标计算，
     * 判断指定行列的单元格是否在给定的画布尺寸范围内可见。
     *
     * @param {number} row - 行索引
     * @param {number} col - 列索引
     * @param {number} canvasW - Canvas 逻辑宽度
     * @param {number} canvasH - Canvas 逻辑高度
     * @param {number} [tabH=0] - 标签栏高度
     * @returns {boolean} 单元格是否可见
     * @override
     */
    isCellVisible(row, col, canvasW, canvasH, tabH = 0) {
        const sheet = this.#renderEngine.currentSheet;
        if (!sheet) return false;
        // 创建临时 ViewportTransform 进行可见性判断
        const vt = new ViewportTransform(sheet, this.#renderEngine.scrollX, this.#renderEngine.scrollY);
        return vt.isCellVisible(row, col, canvasW, canvasH, tabH);
    }

    /**
     * 设置行列调整大小指示线
     *
     * @param {string} type - "row" 或 "col"
     * @param {number} index - 行/列索引
     * @param {number} position - 指示线位置（CSS 像素）
     * @override
     */
    setResizeLine(type, index, position) {
        this.#renderEngine.setResizeLine(type, index, position);
    }

    /**
     * 清除行列调整大小指示线
     * @override
     */
    clearResizeLine() {
        this.#renderEngine.clearResizeLine();
    }

    /**
     * 标记所有图层为脏，请求全量重绘
     *
     * 在数据结构发生重大变化时调用。
     * @override
     */
    invalidateAll() {
        this.#renderEngine.invalidateAll();
    }

    /**
     * 获取图表图层实例
     *
     * 提供对 ChartLayer 的访问，用于图表相关的操作（如命中测试、数据绑定）。
     * 此属性暂未纳入 ViewportService 接口，后续可考虑统一迁移。
     *
     * @returns {import("./layers/ChartLayer.js").ChartLayer}
     */
    get chartLayer() {
        return this.#renderEngine.chartLayer;
    }
}
