import { Disposable } from "./Disposable";

/**
 * DOM 元素属性配置接口
 *
 * 用于 createElement 方法的属性初始化，支持常见的 DOM 属性快捷设置。
 * 特殊属性处理规则：
 * - `className`: 映射到 el.className
 * - `textContent`: 映射到 el.textContent
 * - `style`: 通过 Object.assign 批量设置样式
 * - 其余属性: 通过 setAttribute 设置
 *
 * @property {string} [className] - CSS 类名
 * @property {string} [textContent] - 文本内容
 * @property {Partial<CSSStyleDeclaration>} [style] - 内联样式对象
 */
interface ElementAttrs {
    className?: string;
    textContent?: string;
    style?: Partial<CSSStyleDeclaration>;
    [key: string]: unknown;
}

/**
 * DOMComponent — DOM 操作封装类（继承 Disposable）
 *
 * 提供声明式的 DOM 元素创建和样式注入能力，所有创建的元素和注入的样式
 * 在组件销毁时自动清理（通过 Disposable 的 onDestroy 钩子）。
 *
 * 核心能力：
 * - `createElement()`: 创建 DOM 元素并自动追踪生命周期
 * - `injectStyle()`: 注入全局样式（幂等，相同 id 不重复注入）
 * - `injectInstanceStyle()`: 注入实例级样式（自动添加实例 ID 前缀）
 * - `instanceId`: 每个实例的唯一标识符（用于样式作用域隔离）
 *
 * @example
 * class MyComponent extends DOMComponent {
 *     render() {
 *         const container = this.createElement('div', { className: 'container' });
 *         this.injectInstanceStyle('my', '.container { color: red; }');
 *     }
 * }
 */
export class DOMComponent extends Disposable {
    /**
     * @private 私有字段 - 已创建并追踪的 DOM 元素列表
     *
     * 所有通过 createElement 创建的元素都会被追踪，
     * onDestroy 时自动从 DOM 中移除。
     */
    #trackedElements: { el: HTMLElement }[] = [];

    /**
     * @private 私有字段 - 已注入的样式元素列表
     *
     * 所有通过 injectStyle/injectInstanceStyle 注入的 <style> 元素，
     * onDestroy 时自动从 <head> 中移除。
     */
    #injectedStyles: HTMLStyleElement[] = [];

    /**
     * 创建 DOM 元素并追踪其生命周期
     *
     * 属性设置优先级：className > textContent > style > setAttribute
     * 创建的元素会在 onDestroy 时自动从 DOM 中移除。
     *
     * @param {string} tag - HTML 标签名（'div', 'span', 'canvas' 等）
     * @param {ElementAttrs} [attrs={}] - 元素属性配置
     * @param {HTMLElement} [parent] - 父元素（指定后自动 appendChild）
     * @returns {HTMLElement} 创建的 DOM 元素
     */
    createElement(tag: string, attrs: ElementAttrs = {}, parent?: HTMLElement): HTMLElement {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === "className") el.className = v as string;
            else if (k === "textContent") el.textContent = v as string;
            else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
            else el.setAttribute(k, v as string);
        }
        if (parent) parent.appendChild(el);
        this.#trackedElements.push({ el });
        return el;
    }

    /**
     * 注入全局样式（幂等操作）
     *
     * 如果指定 id 的 <style> 元素已存在，则复用而不重复创建。
     * 注入的样式会在 onDestroy 时自动从 <head> 中移除。
     *
     * @param {string} id - 样式元素的 ID（用于幂等判断）
     * @param {string} cssText - CSS 文本内容
     * @returns {void}
     */
    injectStyle(id: string, cssText: string): void {
        const existing = document.getElementById(id) as HTMLStyleElement | null;
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
     * 注入实例级样式（自动添加实例 ID 前缀实现作用域隔离）
     *
     * 生成的样式 ID 格式为 `{ns}-{instanceId}`，确保每个组件实例的样式互不干扰。
     *
     * @param {string} ns - 样式命名空间（如组件名称）
     * @param {string} cssText - CSS 文本内容
     * @returns {void}
     */
    injectInstanceStyle(ns: string, cssText: string): void {
        const id = `${ns}-${this.instanceId}`;
        this.injectStyle(id, cssText);
    }

    /**
     * 查询组件实例的唯一标识符（懒初始化）
     *
     * 格式为 `wb-{N}`，N 为全局递增计数器。
     * 用于样式作用域隔离和调试标识。
     *
     * @returns {string} 实例唯一 ID
     */
    get instanceId(): string {
        if (!this._instanceId) {
            this._instanceId = `wb-${DOMComponent.#nextCounter()}`;
        }
        return this._instanceId;
    }

    /**
     * @private 私有字段 - 实例 ID 的缓存存储
     */
    _instanceId: string | undefined;

    /**
     * @static @private 私有静态字段 - 全局实例计数器
     */
    static #counter = 0;

    /**
     * @static @private 私有静态方法 - 递增并返回计数器值
     *
     * @returns {number} 递增后的计数器值
     */
    static #nextCounter(): number {
        return ++DOMComponent.#counter;
    }

    /**
     * Disposable 钩子 - 销毁时自动清理所有追踪的 DOM 元素和样式
     *
     * 清理顺序：
     * 1. 移除所有通过 createElement 创建的 DOM 元素
     * 2. 移除所有通过 injectStyle 注入的 <style> 元素
     *
     * @returns {void}
     */
    onDestroy(): void {
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
