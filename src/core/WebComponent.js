import { Disposable } from "./Disposable.js";

/**
 * WebComponent — Web Components 基类（组合 Disposable）
 * 
 * ⚠️ 解决 disconnectedCallback 陷阱：
 * - disconnectedCallback ≠ 销毁，而是"暂时离开 DOM"
 * - 拖拽、路由切换、appendChild 移动都会触发 disconnectedCallback
 * - 使用显式销毁标记区分"临时离开"和"真正销毁"
 * 
 * 使用方式：
 * 1. 子类覆写 onConnect(disposable) 注册事件
 * 2. 子类覆写 onDisconnect() 清理特有资源
 * 3. 父组件调用 el.destroy() 显式销毁
 * 
 * @example
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
 * tab.destroy(); // 触发 disconnectedCallback → 真正销毁
 */
export class WebComponent extends HTMLElement {
    #disposable = null;
    #connected = false;
    #shouldDestroy = false;
    #needsRender = false;  // ✅ 新增：延迟渲染标记（解决竞态 Bug）

    constructor() {
        super();
        if (!this.shadowRoot) {
            this.attachShadow({ mode: 'open' });
        }
    }

    // Web Components 生命周期
    connectedCallback() {
        if (this.#connected) return; // 防止重复连接
        this.#connected = true;
        
        // ✅ 每次连接都创建新的 Disposable
        this.#disposable = new Disposable();
        
        // ✅ 修正顺序：先注册事件，后渲染模板
        // 原因：
        // 1. onConnect 中注册事件监听器
        // 2. render 中渲染模板
        // 3. 如果 render() 在 onConnect() 之前调用，事件监听器还未注册
        // 4. 用户交互时，事件监听器还没有准备好
        this.onConnect(this.#disposable);
        
        // ✅ 修正竞态 Bug：使用延迟渲染机制
        // 原因：
        // 1. attributeChangedCallback 可能在 connectedCallback 之前被调用
        // 2. 确保属性变化在首次渲染时正确显示
        if (this.#needsRender) {
            this.#needsRender = false;
            this.render();
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
            // ✅ 修正竞态 Bug：区分"已连接"和"未连接"两种情况
            if (this.#connected) {
                // 已连接：直接渲染
                this.render();
            } else {
                // 未连接：标记需要渲染（等待 connectedCallback）
                this.#needsRender = true;
            }
        }
    }

    // 显式销毁方法（父组件调用）
    destroy() {
        if (this.#shouldDestroy) return; // 防止重复销毁
        this.#shouldDestroy = true;
        this.remove(); // 触发 disconnectedCallback
    }

    // 获取当前 Disposable（用于 trackEvent）
    get disposable() {
        return this.#disposable;
    }

    // 是否已连接
    get isConnected() {
        return this.#connected;
    }

    // 是否已销毁
    get isDestroyed() {
        return this.#shouldDestroy;
    }

    // 子类覆写的钩子
    onConnect(disposable) {
        // 子类覆写：注册事件
        // disposable.trackEvent(target, type, handler)
    }

    onDisconnect() {
        // 子类覆写：清理特有资源
    }

    render() {
        // 子类覆写：渲染模板
    }

    // 工具方法
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}