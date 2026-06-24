/**
 * 视口服务接口（ViewportService）
 *
 * 抽象视口查询与操作，将策略/编辑器与 RenderEngine 解耦。
 *
 * ## 设计动机
 *
 * 之前所有策略（MouseStrategy、KeyboardStrategy 等）和编辑器（CellEditor）
 * 都直接引用 RenderEngine 来执行视口操作：
 *   - this.handler.renderEngine.hitTest(...)
 *   - this.handler.renderEngine.getCellRect(...)
 *   - this.handler.renderEngine.scrollToCell(...)
 *   - this.renderEngine.scrollX / scrollY / viewW / viewH
 *
 * 这导致：
 * 1. 策略/编辑器与 RenderEngine 强耦合，无法独立测试
 * 2. Workbook 直接构造 ViewportTransform，违反解耦原则
 * 3. 无法替换视口实现（如测试替身、无头模式）
 *
 * ## 使用方式
 *
 * ViewportService 作为接口（抽象类），具体实现由 RenderEngineViewportService 提供。
 * 策略和编辑器通过注入的 ViewportService 实例访问视口功能：
 *
 * ```js
 * // 在 EventHandler 中注入
 * this.viewport = new RenderEngineViewportService(renderEngine);
 * strategy.viewport = this.viewport;
 *
 * // 在策略中使用
 * const hit = this.viewport.hitTest(clientX, clientY);
 * const rect = this.viewport.getCellRect(row, col);
 * this.viewport.scrollToCell(row, col);
 * ```
 *
 * @module render/ViewportService
 */

/* eslint-disable class-methods-use-this */
/* eslint-disable no-unused-vars */
/* eslint-disable max-params */

export class ViewportService {
    get scrollX() {
        throw new Error("ViewportService.scrollX must be implemented");
    }

    get scrollY() {
        throw new Error("ViewportService.scrollY must be implemented");
    }

    get viewW() {
        throw new Error("ViewportService.viewW must be implemented");
    }

    get viewH() {
        throw new Error("ViewportService.viewH must be implemented");
    }

    get maxScrollX() {
        throw new Error("ViewportService.maxScrollX must be implemented");
    }

    get maxScrollY() {
        throw new Error("ViewportService.maxScrollY must be implemented");
    }

    /**
     * 获取单元格在视口中的矩形位置
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {object|null} [mergeInfo] - 合并单元格信息
     * @returns {{ x: number, y: number, w: number, h: number }}
     */
    getCellRect(row, col, mergeInfo = null) {
        throw new Error("ViewportService.getCellRect must be implemented");
    }

    /**
     * 命中测试：将客户端坐标转换为表格元素类型
     * @param {number} clientX - 客户端 X 坐标
     * @param {number} clientY - 客户端 Y 坐标
     * @returns {object|null} 命中结果 { type, row?, col?, index? }
     */
    hitTest(clientX, clientY) {
        throw new Error("ViewportService.hitTest must be implemented");
    }

    /**
     * 表头命中测试：检测是否点击在行/列调整大小的区域
     * @param {number} clientX - 客户端 X 坐标
     * @param {number} clientY - 客户端 Y 坐标
     * @returns {object|null} 命中结果 { type, index }
     */
    headerHitTest(clientX, clientY) {
        throw new Error("ViewportService.headerHitTest must be implemented");
    }

    /**
     * 填充手柄命中测试
     * @param {number} clientX - 客户端 X 坐标
     * @param {number} clientY - 客户端 Y 坐标
     * @returns {boolean}
     */
    fillHandleHitTest(clientX, clientY) {
        throw new Error("ViewportService.fillHandleHitTest must be implemented");
    }

    /**
     * 滚动到指定单元格使其可见
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    scrollToCell(row, col) {
        throw new Error("ViewportService.scrollToCell must be implemented");
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
    isCellVisible(row, col, canvasW, canvasH, tabH = 0) {
        throw new Error("ViewportService.isCellVisible must be implemented");
    }

    /**
     * 设置调整大小参考线
     * @param {string} type - "row" 或 "col"
     * @param {number} index - 行/列索引
     * @param {number} position - 像素位置
     */
    setResizeLine(type, index, position) {
        throw new Error("ViewportService.setResizeLine must be implemented");
    }

    /**
     * 清除调整大小参考线
     */
    clearResizeLine() {
        throw new Error("ViewportService.clearResizeLine must be implemented");
    }

    /**
     * 标记全部内容为脏（需要重绘）
     */
    invalidateAll() {
        throw new Error("ViewportService.invalidateAll must be implemented");
    }

    /**
     * 获取 Canvas 的父元素（用于 DOM 操作如 appendChild）
     * @returns {HTMLElement|null}
     */
    get canvasParent() {
        throw new Error("ViewportService.canvasParent must be implemented");
    }

    /**
     * 获取 Canvas 元素引用
     * @returns {HTMLCanvasElement|null}
     */
    get canvas() {
        throw new Error("ViewportService.canvas must be implemented");
    }

    /**
     * 触发渲染
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     */
    render(sheet) {
        throw new Error("ViewportService.render must be implemented");
    }
}