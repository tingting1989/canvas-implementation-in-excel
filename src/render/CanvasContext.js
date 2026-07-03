/**
 * Canvas 宿主与渲染控制接口（CanvasContext）
 *
 * 封装 Canvas 元素访问和渲染触发，与 ViewportService（纯视口计算）解耦。
 *
 * ## 设计动机
 *
 * 之前 canvas、canvasParent、render() 被放在 ViewportService 中，
 * 但它们不属于"视口计算"的语义：
 * - canvas / canvasParent → DOM 宿主访问
 * - render(sheet) → 渲染控制
 *
 * 将它们拆分到 CanvasContext，使 ViewportService 回归纯粹的视口查询语义，
 * 同时让需要 DOM 访问的模块（策略设置光标、编辑器挂载 DOM）和
 * 需要触发渲染的模块（编辑器提交后重绘）通过独立接口获取能力。
 *
 * ## 使用方式
 *
 * ```js
 * // 在 EventHandler 中注入
 * this.canvasContext = new RenderEngineCanvasContext(renderEngine);
 *
 * // 在策略中访问 Canvas DOM
 * const canvas = this.handler.canvasContext.canvas;
 * canvas.style.cursor = "grab";
 *
 * // 在编辑器中挂载 DOM
 * this.canvasContext.canvasParent.appendChild(this.editor);
 *
 * // 在编辑器中触发渲染
 * this.canvasContext.render(this.sheet);
 * ```
 *
 * @module render/CanvasContext
 */

/* eslint-disable class-methods-use-this */
/* eslint-disable no-unused-vars */

import {errorHandler} from "@/core/ErrorHandler";

export class CanvasContext {
    /**
     * 获取 Canvas 元素引用
     * @returns {HTMLCanvasElement|null}
     */
    get canvas() {
        // errorHandler.throw(ERROR_CODE.PLUGIN_ABSTRACT_METHOD, "CanvasContext.canvas must be implemented")
        throw new Error("CanvasContext.canvas must be implemented");
    }

    /**
     * 获取 Canvas 的父元素（用于 DOM 操作如 appendChild）
     * @returns {HTMLElement|null}
     */
    get canvasParent() {
        throw new Error("CanvasContext.canvasParent must be implemented");
    }

    /**
     * 触发渲染
     * @param {import("../workbook/Sheet.js").Sheet} sheet
     */
    render(sheet) {
        throw new Error("CanvasContext.render must be implemented");
    }
}
