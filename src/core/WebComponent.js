import { Disposable } from "./Disposable.js";

/**
 * WebComponent — Web Components 基类（组合 Disposable）
 *
 * 解决 disconnectedCallback 陷阱：
 * - disconnectedCallback ≠ 销毁，而是"暂时离开 DOM"
 * - 拖拽、路由切换、appendChild 移动都会触发 disconnectedCallback
 * - 使用显式销毁标记区分"临时离开"和"真正销毁"
 *
 * 生命周期：
 * 1. connectedCallback → 创建 Disposable → render() → onConnect(disposable)
 * 2. disconnectedCallback → 如果 #shouldDestroy，才真正销毁
 * 3. destroy() → 设置 #shouldDestroy = true → remove() → disconnectedCallback
 *
 * 使用方式：
 * class SheetTabElement extends WebComponent {
 *     onConnect(disposable) {
 *         disposable.trackEvent(this.shadowRoot, 'click', this.handleClick);
 *     }
 *
 *     onDisconnect() {
 *         console.log('SheetTab destroyed');
 *     }
 * }
 *
 * // 父组件显式销毁
 * tab.destroy();
 */
export class WebComponent extends HTMLElement {
    #disposable = null;
    #connected = false;
    #shouldDestroy = false;
    #needsRender = false;
    #connectPromise = null;

    constructor() {
        super();
        if (!this.shadowRoot) {
            this.attachShadow({ mode: "open" });
        }
    }

    // ==================== Web Components 生命周期 ====================

    connectedCallback() {
        if (this.#connected) return;
        this.#connected = true;

        // 每次连接创建新的 Disposable
        this.#disposable = new Disposable();

        // 处理延迟渲染标记
        if (this.#needsRender) {
            this.#needsRender = false;
        }

        // 先渲染模板（确保 Shadow DOM 元素存在）
        this.render();

        // 调用 onConnect，支持同步和异步
        const result = this.onConnect(this.#disposable);

        // 如果 onConnect 返回 Promise，等它完成后再渲染
        if (result && typeof result.then === 'function') {
            this.#connectPromise = result;
            result.then(() => {
                if (this.#connected && !this.#shouldDestroy) {
                    this.render();
                }
            });
        }
    }

    disconnectedCallback() {
        if (!this.#connected) return;
        this.#connected = false;

        // 只有标记为销毁时才真正销毁
        if (this.#shouldDestroy) {
            this.onDisconnect();
            this.#disposable?.destroy();
            this.#disposable = null;
        }
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            if (this.#connected) {
                // 已连接：等待 onConnect 完成后再渲染
                if (this.#connectPromise) {
                    this.#connectPromise.then(() => this.render());
                } else {
                    this.render();
                }
            } else {
                // 未连接：标记需要渲染（等待 connectedCallback）
                this.#needsRender = true;
            }
        }
    }

    // ==================== 显式销毁 ====================

    destroy() {
        if (this.#shouldDestroy) return;
        this.#shouldDestroy = true;

        if (this.isConnected) {
            this.remove(); // 在 DOM 中，走正常路径
        } else {
            // 不在 DOM 中，手动清理（防止 Disposable 泄漏）
            this.onDisconnect();
            this.#disposable?.destroy();
            this.#disposable = null;
            this.#connected = false;
        }
    }

    // ==================== 查询方法 ====================

    /** 是否已连接 */
    get isComponentConnected() {
        return this.#connected;
    }

    /** 是否已销毁 */
    get isDestroyed() {
        return this.#shouldDestroy;
    }

    // ==================== 子类覆写的钩子 ====================

    /**
     * 组件连接时调用
     * @param {Disposable} disposable - 用于注册事件和子对象
     * @returns {void|Promise<void>} 可以返回 Promise（异步初始化）
     */
    onConnect(disposable) {
        // 子类覆写：注册事件
        // disposable.trackEvent(target, type, handler)
    }

    /**
     * 组件销毁时调用（仅当 #shouldDestroy 为 true）
     * 用于清理子类特有的资源
     */
    onDisconnect() {
        // 子类覆写：清理特有资源
    }

    /**
     * 渲染模板（子类必须覆写）
     * 在 connectedCallback 中自动调用
     */
    render() {
        // 子类覆写：渲染模板
    }

    // ==================== 工具方法 ====================

    /**
     * HTML 转义（用于防止 XSS）
     * 注意：此方法只适用于文本内容，不适用于属性值
     */
    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
}