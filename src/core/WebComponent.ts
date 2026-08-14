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
 * @example
 * class SheetTabElement extends WebComponent {
 *     onConnect(disposable) {
 *         disposable.trackEvent(this.shadowRoot, 'click', this.handleClick);
 *     }
 *     onDisconnect() { console.log('SheetTab destroyed'); }
 * }
 * tab.destroy(); // 父组件显式销毁
 */
export class WebComponent extends HTMLElement {
    /**
     * @private 私有字段 - 资源管理器实例（Disposable 组合模式）
     *
     * 管理组件的所有可释放资源（事件监听器、子对象、定时器等）。
     * 每次 connectedCallback 创建新实例，disconnectedCallback 且 #shouldDestroy 时销毁。
     */
    #disposable: Disposable | null = null;

    /**
     * @private 私有字段 - 组件是否当前处于"已连接到DOM"状态
     *
     * 用于防止重复初始化和判断渲染时机。
     */
    #connected = false;

    /**
     * @private 私有字段 - 是否标记为"应该销毁"（显式销毁标志）
     *
     * 区分"临时离开DOM"和"真正需要销毁"两种情况，
     * 仅在调用 destroy() 方法时设置为 true。
     */
    #shouldDestroy = false;

    /**
     * @private 私有字段 - 是否需要延迟渲染标记
     *
     * 处理属性变更发生在组件连接到DOM之前的边界情况。
     */
    #needsRender = false;

    /**
     * @private 私有字段 - 异步 onConnect 的 Promise 引用
     *
     * 支持子类的 onConnect() 方法返回 Promise（异步初始化模式），
     * 等待其完成后再进行二次渲染。
     */
    #connectPromise: Promise<void> | null = null;

    /**
     * 构造函数 - 初始化 Web Component 基础设施
     *
     * 创建开放的 Shadow DOM（mode: "open"），允许外部通过 shadowRoot 访问内部结构。
     * 子类构造函数必须调用 super() 作为第一条语句。
     */
    constructor() {
        super();
        if (!this.shadowRoot) {
            this.attachShadow({ mode: "open" });
        }
    }

    /**
     * Web Components 生命周期钩子 - 元素被插入到 DOM 时自动调用
     *
     * 执行流程：
     * 1. 防重入检查（#connected）
     * 2. 创建 Disposable 资源管理器
     * 3. 处理延迟渲染标记
     * 4. 首次渲染 render()
     * 5. 调用子类 onConnect(disposable)
     * 6. 处理异步初始化（如果 onConnect 返回 Promise）
     *
     * @returns {void}
     */
    connectedCallback(): void {
        if (this.#connected) return;
        this.#connected = true;

        this.#disposable = new Disposable();

        if (this.#needsRender) {
            this.#needsRender = false;
        }

        this.render();

        const result = this.onConnect(this.#disposable);

        if (result && typeof result.then === "function") {
            this.#connectPromise = result as Promise<void>;
            result.then(() => {
                if (this.#connected && !this.#shouldDestroy) {
                    this.render();
                }
            });
        }
    }

    /**
     * Web Components 生命周期钩子 - 元素从 DOM 中移除时自动调用
     *
     * 根据 #shouldDestroy 标志决定是真正销毁还是临时暂停：
     * - #shouldDestroy === true: 执行完整销毁（onDisconnect + disposable.destroy）
     * - #shouldDestroy === false: 保留所有状态（临时断开，如拖拽移动）
     *
     * @returns {void}
     */
    disconnectedCallback(): void {
        if (!this.#connected) return;
        this.#connected = false;

        if (this.#shouldDestroy) {
            this.onDisconnect();
            this.#disposable?.destroy();
            this.#disposable = null;
        }
    }

    /**
     * Web Components 生命周期钩子 - 被观察的属性发生变化时自动调用
     *
     * 子类必须声明 static observedAttributes 才能触发此回调。
     * 支持异步初始化期间属性变化的排队渲染。
     *
     * @param {string} name - 发生变化的属性名称
     * @param {string|null} oldValue - 变化前的属性值
     * @param {string|null} newValue - 变化后的属性值
     * @returns {void}
     */
    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
        if (oldValue !== newValue) {
            if (this.#connected) {
                if (this.#connectPromise) {
                    this.#connectPromise.then(() => this.render(name));
                } else {
                    this.render(name);
                }
            } else {
                this.#needsRender = true;
            }
        }
    }

    /**
     * 公共方法 - 显式销毁组件（唯一正确的销毁方式）
     *
     * 路径A（组件在DOM中）: 设置标志 → remove() → disconnectedCallback 执行销毁
     * 路径B（组件不在DOM中）: 设置标志 → 手动执行销毁逻辑
     * 防重入：多次调用 destroy() 只执行一次。
     *
     * @returns {void}
     */
    destroy(): void {
        if (this.#shouldDestroy) return;
        this.#shouldDestroy = true;

        if (this.isConnected) {
            this.remove();
        } else {
            this.onDisconnect();
            this.#disposable?.destroy();
            this.#disposable = null;
            this.#connected = false;
        }
    }

    /**
     * 查询组件是否当前已连接到 DOM 树
     *
     * @returns {boolean} true 表示已连接，false 表示未连接或已断开
     */
    get isComponentConnected(): boolean {
        return this.#connected;
    }

    /**
     * 查询组件是否已经被显式销毁
     *
     * @returns {boolean} true 表示已销毁（不可逆），false 表示仍在使用中
     */
    get isDestroyed(): boolean {
        return this.#shouldDestroy;
    }

    /**
     * 子类钩子方法 - 组件连接到 DOM 时的初始化入口
     *
     * 支持同步和异步两种模式：
     * - 同步: 返回 void
     * - 异步: 返回 Promise<void>（完成后自动二次渲染）
     *
     * @param {Disposable} _disposable - 资源管理器实例，通过它注册所有需要清理的资源
     * @returns {void|Promise<void>}
     */
    onConnect(_disposable: Disposable): void | Promise<void> {}

    /**
     * 子类钩子方法 - 组件真正销毁时的清理入口（可选覆写）
     *
     * 仅当 #shouldDestroy === true 时被调用。
     * 用于释放无法通过 Disposable 管理的特有资源。
     *
     * @returns {void}
     */
    onDisconnect(): void {}

    /**
     * 子类钩子方法 - 渲染组件的 Shadow DOM 内容
     *
     * 调用时机：
     * 1. connectedCallback 中自动调用（首次渲染）
     * 2. attributeChangedCallback 中调用（属性变化时）
     * 3. 异步 onConnect 完成后再次调用（二次渲染）
     *
     * @param {string} [_changedAttr] - 触发此次渲染的属性名（可选，用于增量更新）
     * @returns {void}
     */
    render(_changedAttr?: string): void {}

    /**
     * 公共工具方法 - HTML 实体转义（防止 XSS 攻击）
     *
     * 利用浏览器内置文本编码机制：创建临时 div → 设置 textContent → 读取 innerHTML。
     *
     * @param {string} text - 需要转义的原始文本
     * @returns {string} 转义后的安全文本
     */
    escapeHtml(text: string): string {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 公共工具方法 - 向外派发自定义 DOM 事件（组件通信机制）
     *
     * 默认配置：bubbles: true, composed: true, cancelable: false
     * - bubbles: 事件向上冒泡到祖先元素
     * - composed: 事件穿透 Shadow DOM 边界
     * - cancelable: 事件不可被 preventDefault()
     *
     * @param {string} name - 自定义事件名称（推荐 kebab-case）
     * @param {Record<string, unknown>} [detail={}] - 事件携带的数据载荷
     * @param {CustomEventInit} [options={}] - 事件配置选项（可覆盖默认值）
     * @returns {void}
     */
    emit(name: string, detail: Record<string, unknown> = {}, options: CustomEventInit = {}): void {
        this.dispatchEvent(
            new CustomEvent(name, {
                bubbles: true,
                composed: true,
                cancelable: false,
                ...options,
                detail,
            }),
        );
    }
}
