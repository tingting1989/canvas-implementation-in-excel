import { Disposable } from "./Disposable.js";

/**
 * DOMComponent — DOM 组件基类
 *
 * 继承 Disposable，扩展 DOM 相关的生命周期管理：
 * - createElement(): 创建 DOM 元素并自动跟踪，destroy 时自动从 DOM 树移除
 * - injectStyle(): 注入 <style> 到 <head>，带 ID 去重，destroy 时自动移除
 * - injectInstanceStyle(): 注入实例级 <style>，ID 自动带实例后缀
 *
 * 继承 Disposable 的 trackEvent() 和 trackChild() 能力
 */
export class DOMComponent extends Disposable {
    #trackedElements = []; // { el }  跟踪创建的 DOM 元素
    #injectedStyles = []; // <style>  跟踪注入到 <head> 的样式表

    /**
     * 创建 DOM 元素并自动跟踪
     * @param {string} tag - 标签名
     * @param {object} [attrs={}] - 属性映射
     * @param {HTMLElement} [parent] - 可选的父元素
     * @returns {HTMLElement}
     */
    createElement(tag, attrs = {}, parent) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === "className") el.className = v;
            else if (k === "textContent") el.textContent = v;
            else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
            else el.setAttribute(k, v);
        }
        if (parent) parent.appendChild(el);
        this.#trackedElements.push({ el });
        return el;
    }

    /**
     * 注入 <style> 到 <head>，带 ID 去重
     * destroy 时自动移除
     * @param {string} id - style 元素 ID（全局唯一）
     * @param {string} cssText - CSS 内容
     */
    injectStyle(id, cssText) {
        const existing = document.getElementById(id);
        if (existing) {
            this.#injectedStyles.push(existing);
            return;
        }
        const style = document.createElement("style");
        style.id = id;
        style.textContent = cssText;
        document.head.appendChild(style);
        this.#injectedStyles.push(style);
    }

    /**
     * 注入实例级 <style>，ID 自动带实例后缀
     * @param {string} ns - 样式命名空间（如 "cs-scrollbar"）
     * @param {string} cssText - CSS 内容
     */
    injectInstanceStyle(ns, cssText) {
        const id = `${ns}-${this.instanceId}`;
        this.injectStyle(id, cssText);
    }

    get instanceId() {
        if (!this._instanceId) {
            this._instanceId = `wb-${DOMComponent.#nextCounter()}`;
        }
        return this._instanceId;
    }

    static #counter = 0;
    static #nextCounter() {
        return ++DOMComponent.#counter;
    }

    onDestroy() {
        for (const { el } of this.#trackedElements) {
            el?.remove?.();
        }
        this.#trackedElements.length = 0;

        for (const style of this.#injectedStyles) {
            style?.remove?.();
        }
        this.#injectedStyles.length = 0;
    }
}
