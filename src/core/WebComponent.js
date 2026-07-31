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
    /**
     * @private 私有字段 - 资源管理器实例（Disposable 组合模式）
     *
     ** 🎯 核心目的：**
     * 管理组件的所有可释放资源（事件监听器、子对象、定时器等）。
     * 通过 Disposable 的 trackEvent/trackObject 方法自动注册资源，
     * 在组件销毁时一次性清理所有资源，避免内存泄漏。
     *
     ** 生命周期：**
     * - **创建时机**：`connectedCallback()` 中每次连接都创建新实例
     *   （确保每次重新连接都是干净的状态）
     * - **销毁时机**：`disconnectedCallback()` 且 `#shouldDestroy === true` 时
     *   （仅真正销毁时才调用 disposable.destroy()）
     *
     ** 为什么每次 connectedCallback 都创建新 Disposable？**
     * 因为组件可能被多次移除和重新添加到 DOM（如拖拽排序），
     * 每次 re-connect 都应视为全新的生命周期，
     * 避免旧的事件监听器残留导致重复触发或内存泄漏。
     *
     ** 典型使用方式（在 onConnect 中）：**
     * ```javascript
     * onConnect(disposable) {
     *     // 注册 DOM 事件监听器
     *     disposable.trackEvent(this.shadowRoot, 'click', this.handleClick);
     *
     *     // 注册子对象（子对象必须实现 destroy() 方法）
     *     disposable.trackObject(this.childComponent);
     *
     *     // 注册定时器 ID
     *     const timerId = setInterval(this.updateData, 1000);
     *     disposable.trackInterval(timerId);
     * }
     * ```
     *
     ** 资源清理机制：**
     * 当 `disposable.destroy()` 被调用时：
     * - 自动 removeEventListener 所有通过 trackEvent 注册的监听器
     * - 自动调用所有 trackObject 对象的 destroy() 方法
     * - 自动 clearInterval/clearTimeout 所有注册的定时器
     * - 将内部存储清空，防止重复销毁
     *
     * @type {import("./Disposable.js").Disposable | null}
     *   - 组件已连接且未销毁: Disposable 实例
     *   - 组件未连接或已销毁: null
     *
     * @see Disposable - 资源管理器类
     * @see onConnect() - 接收此参数的钩子方法
     */
    #disposable = null;

    /**
     * @private 私有字段 - 组件是否当前处于"已连接到DOM"状态
     *
     ** 🎯 核心目的：**
     * 跟踪组件是否在 DOM 树中（即浏览器是否调用了 connectedCallback）。
     * 用于防止重复初始化和判断渲染时机。
     *
     ** 状态转换图：**
     * ```
     * 初始状态: false (未连接)
     *    ↓ connectedCallback()
     * true (已连接) ←→ false (临时断开)
     *    ↓               ↑
     * [拖拽/移动]      [重新插入DOM]
     *    ↓
     * destroy() → #shouldDestroy=true → remove()
     *    ↓
     * disconnectedCallback() + #shouldDestroy === true
     *    ↓
     * false (永久断开，即将销毁资源)
     * ```
     *
     ** 为什么不直接使用 isConnected 属性？**
     * HTMLElement.isConnected 是只读属性，但在某些边缘情况下可能不准确：
     * - 在 connectedCallback/disconnectedCallback 内部调用时可能有延迟
     * - 自定义逻辑需要在回调之外判断状态
     * - 需要区分"从未连接过"和"曾经连接但现在断开"
     *
     ** 使用场景：**
     * - `connectedCallback()`: 检查是否已经连接过（防止重复初始化）
     * - `attributeChangedCallback()`: 决定是立即渲染还是延迟渲染
     * - `destroy()`: 判断组件是否在 DOM 中以选择不同的清理路径
     *
     * @type {boolean}
     *   - true: 组件当前在 DOM 树中（connectedCallback 已调用，disconnectedCallback 未调用）
     *   - false: 组件不在 DOM 树中（尚未连接 或 已断开连接）
     *
     * @see isComponentConnected - 公共 getter 封装此字段
     */
    #connected = false;

    /**
     * @private 私有字段 - 是否标记为"应该销毁"（显式销毁标志）
     *
     ** 🎯 核心目的（关键设计）：**
     * 区分**"临时离开DOM"**和**"真正需要销毁"**两种情况。
     * 这是本类解决 Web Components disconnectedCallback 陷阱的核心机制。
     *
     ** 问题背景：**
     * 浏览器的 disconnectedCallback 会在多种场景下触发：
     * 1. ✅ **显式销毁**: `element.remove()` 或 `parent.removeChild(element)`
     * 2. ⚠️ **DOM操作**: `appendChild(element)` 移动元素到新位置
     * 3. ⚠️ **拖拽操作**: drag & drop 过程中暂时脱离 DOM
     * 4. ⚠️ **路由切换**: SPA 中组件被替换（可能后续还会复用）
     * 5. ⚠️ **虚拟DOM diff**: React/Vue 等框架的 DOM 更新
     *
     * 如果在情况2-5中也执行销毁逻辑（如移除事件监听器、清空状态），
     * 会导致组件功能异常。因此需要显式标志来区分这两种情况。
     *
     ** 设置时机：**
     * 仅在调用 `destroy()` 方法时设置为 true：
     * ```javascript
     * // 用户代码显式销毁
     * myComponent.destroy();  // ← 这里设置 #shouldDestroy = true
     * // 然后 destroy() 会调用 this.remove()
     * // 浏览器随后触发 disconnectedCallback()
     * // 此时检查 #shouldDestroy === true → 执行真正的销毁逻辑
     * ```
     *
     ** 未调用 destroy() 时的流程：**
     * ```
     * 元素被移动到新位置（非销毁）
     *    ↓
     * disconnectedCallback() 触发
     *    ↓
     * 检查 #shouldDestroy === false
     *    ↓
     * 跳过销毁逻辑（保留 Disposable、不清空状态）
     *    ↓
     * 后续 connectedCallback() 触发时重新初始化
     * ```
     *
     ** 一旦设置为 true 就不可逆？**
     * 当前实现中是的（单向状态转换）。一旦标记为销毁，
     * 即使元素被重新添加到 DOM 也不会恢复（因为 destroy() 有防重入检查）。
     * 这符合"销毁后不应再使用"的设计原则。
     *
     * @type {boolean}
     *   - false: 默认值，表示组件只是临时离开 DOM
     *   - true: 表示用户显式调用了 destroy()，应在 disconnectedCallback 中彻底销毁
     *
     * @see isDestroyed - 公共 getter 封装此字段
     * @see destroy() - 设置此标志的方法
     */
    #shouldDestroy = false;

    /**
     * @private 私有字段 - 是否需要延迟渲染标记
     *
     ** 🎯 核心目的：**
     * 处理一种特殊的边界情况：**属性变更发生在组件连接到DOM之前**。
     *
     ** 触发场景：**
     * ```javascript
     * // 场景1：JavaScript 创建元素并设置属性后再添加到 DOM
     * const el = document.createElement('my-component');
     * el.setAttribute('data-value', '123');  // 此时 #connected === false
     * document.body.appendChild(el);          // 此时才触发 connectedCallback
     *
     * // 场景2：HTML 字符串解析（innerHTML/template）
     * container.innerHTML = '<my-component data-value="456"></my-component>';
     * // 浏览器先设置属性，再调用 connectedCallback
     * ```
     *
     ** 处理流程：**
     * ```
     * attributeChangedCallback('data-value', null, '456')
     *    ↓
     * 检查 #connected === false?
     *   ├── 是 → 设置 #needsRender = true（记录"需要渲染"）
     *   └── 否 → 立即调用 this.render()
     *    ↓
     * 后续 connectedCallback() 触发时:
     *   检查 #needsRender === true?
     *   ├── 是 → 重置 #needsRender = false → 调用 render()
     *   └── 否 → 正常渲染流程
     * ```
     *
     ** 为什么不直接在 attributeChangedCallback 中缓存属性？**
     * 因为属性可能多次变化，如果缓存每个属性的旧值/新值会很复杂。
     * 采用"脏标记"策略（dirty flag），只需记住"需要重新渲染"即可，
     * 渲染时会从 DOM 读取最新的属性值（this.getAttribute()）。
     *
     ** 性能优化：**
     * - 避免在未连接状态下尝试访问 Shadow DOM（此时可能不存在）
     * - 合并多次属性变更为一次渲染（如果有多个属性同时变化）
     * - 减少不必要的 DOM 操作
     *
     * @type {boolean}
     *   - false: 不需要延迟渲染（默认值，或在 connectedCallback 中已处理）
     *   - true: 属性在未连接时发生变化，需在 connectedCallback 中补充渲染
     */
    #needsRender = false;

    /**
     * @private 私有字段 - 异步 onConnect 的 Promise 引用（用于等待异步初始化完成）
     *
     ** 🎯 核心目的：**
     * 支持子类的 `onConnect()` 方法返回 Promise（异步初始化模式）。
     * 当 onConnect 包含异步操作（如 API 调用、数据加载、动态 import）时，
     * 需要等待其完成后再进行二次渲染，确保异步数据可用。
     *
     ** 使用场景示例：**
     * ```javascript
     * class DataListComponent extends WebComponent {
     *     async onConnect(disposable) {
     *         // 异步加载远程数据
     *         this.data = await fetch('/api/data').then(r => r.json());
     *
     *         // 数据加载完成后，render() 会使用 this.data 渲染列表
     *     }
     *
     *     render() {
     *         if (!this.data) {
     *             this.shadowRoot.innerHTML = '<div>加载中...</div>';
     *             return;
     *         }
     *         this.shadowRoot.innerHTML = this.data.map(item =>
     *             `<div>${item.name}</div>`
     *         ).join('');
     *     }
     * }
     * ```
     *
     ** 执行时序：**
     * ```
     * connectedCallback()
     *    ↓
     * 创建 Disposable
     *    ↓
     * 第一次 render()  // 显示 loading 状态（数据还未加载）
     *    ↓
     * 调用 onConnect(disposable)
     *    ↓
     * onConnect 返回 Promise
     *    ↓
     * 保存引用: #connectPromise = promise
     *    ↓
     * (异步操作进行中...)
     *    ↓
     * Promise resolved
     *    ↓
     * 检查条件: #connected && !#shouldDestroy
     *   ├── 组件仍在DOM中 且 未销毁
     *   │   ↓
     *   │   第二次 render()  // 显示最终内容（数据已加载）
     *   └── 否则跳过（组件已被移除或销毁）
     * ```
     *
     ** 与 attributeChangedCallback 的交互：**
     * 如果在异步初始化期间属性发生变化：
     * ```javascript
     * attributeChangedCallback(name, oldValue, newValue) {
     *     if (this.#connectPromise) {
     *         // 等待异步初始化完成后再渲染
     *         this.#connectPromise.then(() => this.render(name));
     *     } else {
     *         this.render(name);  // 同步模式，立即渲染
     *     }
     * }
     * ```
     * 这确保了属性变化不会覆盖正在进行的异步初始化结果。
     *
     ** 内存管理：**
     * - Promise 完成后（无论成功失败），引用会自然失效
     * - 如果组件在 Promise 完成前销毁，`.then()` 回调中的条件检查会阻止渲染
     * - 无需手动取消 Promise（无法取消），但通过条件检查实现了等效效果
     *
     * @type {Promise<void> | null}
     *   - onConnect 返回 Promise 时: 该 Promise 的引用
     *   - onConnect 同步返回 或 未连接时: null
     *
     * @see onConnect() - 可能返回 Promise 的钩子方法
     */
    #connectPromise = null;

    /**
     * 构造函数 - 初始化 Web Component 基础设施
     *
     ** 执行步骤：**
     * 1. 调用 `super()` 完成 HTMLElement 的初始化
     * 2. 检查是否已存在 Shadow DOM（避免重复创建）
     * 3. 如果不存在，创建开放的 Shadow DOM（`mode: "open"`）
     *
     ** 为什么使用 open 模式的 Shadow DOM？**
     * - 允许外部 JavaScript 通过 `element.shadowRoot` 访问内部结构
     * - 便于调试（开发者工具可以检查 Shadow DOM 内容）
     * - 支持外部样式覆盖（虽然不推荐，但提供灵活性）
     * - 如果使用 closed 模式（`mode: "closed"`），则无法从外部访问 shadowRoot
     *
     ** 子类构造函数注意事项：**
     * - 必须调用 `super()` 作为第一条语句
     * - 不要在构造函数中访问 DOM（此时元素尚未插入文档流）
     * - 不要在构造函数中查询属性或子元素（可能尚未设置）
     * - 应将初始化逻辑放在 `onConnect()` 钩子中
     *
     ** 示例：**
     * ```javascript
     * class MyButton extends WebComponent {
     *     constructor() {
     *         super();
     *         // 此时 this.shadowRoot 已经存在
     *         // 但不建议在这里操作它
     *     }
     * }
     * ```
     */
    constructor() {
        super();
        if (!this.shadowRoot) {
            this.attachShadow({ mode: "open" });
        }
    }

    // ==================== Web Components 生命周期 ====================

    /**
     * Web Components 生命周期钩子 - 元素被插入到 DOM 时自动调用
     *
     ** 🎯 核心目的：**
     * 初始化组件的完整生命周期，包括创建资源管理器、首次渲染、注册事件监听器。
     * 这是组件"激活"的入口点，对应 React 的 componentDidMount 或 Vue 的 mounted。
     *
     ** 触发时机：**
     * 浏览器在以下情况会自动调用此方法：
     * 1. `document.body.appendChild(element)` - 首次插入DOM
     * 2. `element.style.display` 从 'none' 变为其他值（如果之前未连接）
     * 3. 从一个容器移动到另一个容器 `newParent.appendChild(element)`
     * 4. 使用 `insertBefore/replaceChild` 等API操作DOM树
     *
     ** 执行流程（6个步骤）：**
     *
     * **步骤1：防重入检查**
     * ```javascript
     * if (this.#connected) return;
     * this.#connected = true;
     * ```
     * 如果已经处于连接状态则直接返回，防止重复初始化。
     * 这可能发生在某些浏览器bug或框架的边缘情况下。
     *
     * **步骤2：创建 Disposable 资源管理器**
     * ```javascript
     * this.#disposable = new Disposable();
     * ```
     * 每次连接都创建**全新的**实例（不复用旧的），确保状态干净。
     * 此实例将传递给 onConnect() 供子类使用。
     *
     * **步骤3：处理延迟渲染标记**
     * ```javascript
     * if (this.#needsRender) {
     *     this.#needsRender = false;
     * }
     * ```
     * 如果属性在连接前就已变化（#needsRender === true），
     * 重置标记（稍后的 render() 会处理实际渲染）。
     *
     * **步骤4：首次渲染**
     * ```javascript
     * this.render();
     * ```
     * 在调用 onConnect **之前**先渲染一次，确保 Shadow DOM 结构存在。
     * 这样 onConnect 中可以通过 querySelector 等API查询到DOM元素。
     *
     * **步骤5：调用子类的初始化钩子**
     * ```javascript
     * const result = this.onConnect(this.#disposable);
     * ```
     * 将 disposable 传递给子类，子类在此注册事件、创建子对象、初始化数据等。
     * 支持同步和异步两种模式（详见下方说明）。
     *
     * **步骤6：处理异步初始化**
     * ```javascript
     * if (result && typeof result.then === "function") {
     *     this.#connectPromise = result;
     *     result.then(() => {
     *         if (this.#connected && !this.#shouldDestroy) {
     *             this.render();
     *         }
     *     });
     * }
     * ```
     * 如果 onConnect 返回 Promise（异步模式）：
     * - 保存 Promise 引用到 #connectPromise
     * - 等待 Promise 完成后进行二次渲染
     * - 二次渲染前检查组件是否仍在DOM中且未被销毁
     *
     ** 同步 vs 异步模式对比：**
     *
     * | 特性 | 同步模式 | 异步模式 |
     * |------|---------|---------|
     * | **onConnect返回值** | void / undefined | Promise\<void\> |
     * | **render() 调用次数** | 1次 | 2次（loading → 最终内容） |
     * | **适用场景** | 简单组件、数据已在props中 | 需要远程加载数据、动态import |
     * | **示例** | 按钮、输入框 | 数据列表、图表组件 |
     *
     ** 典型的同步模式示例：**
     * ```javascript
     * class SimpleButton extends WebComponent {
     *     onConnect(disposable) {
     *         disposable.trackEvent(this.shadowRoot, 'click', this.handleClick);
     *     }
     *
     *     render() {
     *         this.shadowRoot.innerHTML = `<button><slot></slot></button>`;
     *     }
     * }
     * ```
     *
     ** 典型的异步模式示例：**
     * ```javascript
     * class UserList extends WebComponent {
     *     async onConnect(disposable) {
     *         this.users = await fetch('/api/users').then(r => r.json());
     *     }
     *
     *     render() {
     *         if (!this.users) {
     *             this.shadowRoot.innerHTML = '<div>Loading...</div>';
     *             return;
     *         }
     *         this.shadowRoot.innerHTML = this.users.map(u =>
     *             `<div>${u.name}</div>`
     *         ).join('');
     *     }
     * }
     * ```
     *
     ** ⚠️ 注意事项：**
     * - 不要在此方法中手动设置 #connected（已在开头处理）
     * - 不要在此方法中调用 destroy()
     * - 不要假设此方法只会被调用一次（元素可能被反复移除/添加）
     * - onConnect 抛出的异常不会被自动捕获，建议子类自行 try-catch
     *
     * @returns {void}
     *
     * @see disconnectedCallback() - 配套的生命周期钩子（离开DOM时触发）
     * @see onConnect() - 子类覆写的初始化钩子
     * @see render() - 渲染方法
     */
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
        if (result && typeof result.then === "function") {
            this.#connectPromise = result;
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
     ** 🎯 核心目的：**
     * 根据 `#shouldDestroy` 标志决定是**真正销毁**还是**临时暂停**。
     * 这是本类解决 Web Components "disconnectedCallback ≠ 销毁"问题的关键实现。
     *
     ** 触发时机（5种场景）：**
     * 1. ✅ **显式销毁**: 用户调用 `destroy()` → `remove()` → 触发此回调
     * 2. ⚠️ **DOM操作**: `parent.appendChild(element)` 移动到新位置
     * 3. ⚠️ **拖拽排序**: drag & drop 过程中暂时脱离DOM
     * 4. ⚠️ **路由切换**: SPA 组件替换（可能后续复用）
     * 5. ⚠️ **虚拟DOM diff**: React/Vue 等框架更新真实DOM
     *
     ** 执行流程（条件分支）：**
     *
     * **前置检查：**
     * ```javascript
     * if (!this.#connected) return;
     * this.#connected = false;
     * ```
     * 如果尚未连接则直接返回（防止重复断开），
     * 否则标记为未连接状态。
     *
     **核心判断逻辑：**
     * ```javascript
     * if (this.#shouldDestroy) {
     *     // 场景1：真正的销毁
     *     this.onDisconnect();           // 通知子类清理特有资源
     *     this.#disposable?.destroy();   // 清理所有通过 disposable 注册的资源
     *     this.#disposable = null;       // 释放引用，帮助GC回收
     * } else {
     *     // 场景2-5：临时断开，保留所有状态
     *     // 不做任何事，等待后续可能的 re-connect
     * }
     * ```
     *
     ** 两种模式的详细对比：**
     *
     * **模式A：真正销毁（#shouldDestroy === true）**
     * ```
     * 用户代码: myComponent.destroy()
     *    ↓
     * destroy() 设置 #shouldDestroy = true
     *    ↓
     * destroy() 调用 this.remove()
     *    ↓
     * 浏览器将元素从DOM树移除
     *    ↓
     * 浏览器触发 disconnectedCallback()
     *    ↓
     * 检查 #shouldDestroy === true ✓
     *    ↓
     * 执行销毁流程:
     *   ① 调用 onDisconnect()
     *      └── 子类清理特有资源（如取消订阅外部服务）
     *   ② 调用 disposable.destroy()
     *      ├── 移除所有 trackEvent 注册的事件监听器
     *      ├── 调用所有 trackObject 对象的 destroy()
     *      └── 清除所有定时器 (setInterval/setTimeout)
     *   ③ 设置 #disposable = null
     *      └── 释放强引用，允许GC回收
     * ```
     *
     * **模式B：临时断开（#shouldDestroy === false）**
     * ```
     * 外部代码: parent.appendChild(element)  // 移动元素
     *    ↓
     * 浏览器先将元素从原位置移除
     *    ↓
     * 触发 disconnectedCallback()
     *    ↓
     * 检查 #shouldDestroy === false
     *    ↓
     * 跳过所有销毁逻辑！
     *    ↓
     * 保留:
     *   - #disposable 实例（及其内部注册的所有资源）
     *   - 所有事件监听器仍然有效
     *   - 组件内部状态完好无损
     *    ↓
     * 后续: 浏览器将元素插入新位置
     *    ↓
     * 触发 connectedCallback()
     *    ↓
     * 创建新的 #disposable（旧的将被GC回收，因为无引用）
     *    ↓
     * 重新初始化...
     * ```
     *
     ** 为什么不在模式B中也清理 disposable？**
     * 因为"临时断开"通常持续时间极短（毫秒级），
     * 清理再重建的开销反而更大。而且某些场景下
     * （如拖拽预览）需要在重新连接后保持状态一致。
     *
     ** 内存泄漏风险点：**
     * - 如果组件被永久移除但忘记调用 destroy()，#disposable 不会释放
     * - 解决方案：父组件应在移除子组件时显式调用 child.destroy()
     * - 或者使用 MutationObserver 监听元素的移除并自动销毁
     *
     * @returns {void}
     *
     * @see connectedCallback() - 配套的生命周期钩子（插入DOM时触发）
     * @see destroy() - 显式销毁方法（会设置 #shouldDestroy）
     * @see onDisconnect() - 子类覆写的清理钩子
     */
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

    /**
     * Web Components 生命周期钩子 - 被观察的属性发生变化时自动调用
     *
     ** 🎯 核心目的：**
     * 响应 HTML 属性的变化，触发组件重新渲染以反映最新的属性值。
     * 这是 Web Components 的"响应式"机制，类似 Vue 的 props 变化检测。
     *
     ** 前置条件：必须在子类中声明 static observedAttributes**
     * ```javascript
     * class MyComponent extends WebComponent {
     *     static observedAttributes = ['data-value', 'data-mode'];
     *     // 只有列在这个数组中的属性变化才会触发此回调
     * }
     * ```
     * 未声明的属性变化会被浏览器忽略，不会触发此回调。
     *
     ** 触发时机：**
     * 1. `element.setAttribute('data-value', '123')`
     * 2. `element.removeAttribute('data-value')` (newValue 为 null)
     * 3. `element.attributes['data-value'].value = '456'` (不推荐)
     * 4. HTML 解析器解析属性时（如 innerHTML 赋值）
     *
     ** 参数说明：**
     * @param {string} name - 发生变化的属性名（小写形式）
     *   - 示例：'data-value', 'disabled', 'title'
     *   - 始终是小写，即使 HTML 中写成 'data-Value'
     * @param {string|null} oldValue - 变化前的旧值
     *   - 首次设置时为 null（之前没有这个属性）
     *   - removeAttribute() 时为旧值，newValue 为 null
     * @param {string|null} newValue - 变化后的新值
     *   - setAttribute() 时为新字符串值
     *   - removeAttribute() 时为 null
     *
     ** 执行流程（3种情况）：**
     *
     * **情况A：值确实发生了变化（oldValue !== newValue）**
     *
     * **分支A1：组件当前已连接到DOM（#connected === true）**
     * ```
     * 检查是否有正在进行的异步初始化?
     *   ├── 是 (#connectPromise 存在)
     *   │   → 排队等待异步完成后渲染
     *   │   this.#connectPromise.then(() => this.render(name))
     *   │   → 传递 name 参数让 render() 知道哪个属性触发了更新
     *   │
     *   └── 否 (同步模式或已完成)
     *       → 立即渲染
     *       this.render(name)
     *       → 传递 name 参数用于增量更新优化
     * ```
     *
     * **分支A2：组件当前未连接到DOM（#connected === false）**
     * ```
     * 设置脏标记: #needsRender = true
     * → 不立即渲染（因为 Shadow DOM 可能不存在）
     * → 等待后续 connectedCallback() 处理此标记
     * ```
     *
     * **情况B：值未变化（oldValue === newValue）→ 直接返回（不做任何事）**
     *
     ** 为什么要传递 name 给 render()？**
     * 允许子类进行性能优化（选择性重渲染）：
     * ```javascript
     * render(changedAttr) {
     *     if (changedAttr === 'data-color') {
     *         // 只更新颜色相关的部分，不动其他DOM
     *         this.colorDiv.style.color = this.getAttribute('data-color');
     *         return;  // 提前退出，避免全量重渲染
     *     }
     *     // 其他属性变化或首次渲染，执行完整的重渲染
     *     this.fullRender();
     * }
     * ```
     *
     ** 与异步初始化的交互：**
     * 如果 onConnect 尚未完成（#connectPromise 仍 pending），
     * 属性变化的渲染会排队到 Promise 完成之后，
     * 避免覆盖异步加载的数据：
     * ```
     * 时间线:
     * t=0ms:  connectedCallback() → onConnect() 开始异步加载
     * t=50ms: setAttribute('x', '1') → 排队到 promise.then()
     * t=100ms: setAttribute('y', '2') → 也排队
     * t=200ms: 异步加载完成 → render('x') → render('y')
     *          最终显示的是包含 x='1', y='2' 的最新状态
     * ```
     *
     ** 性能考虑：**
     * - 多个属性同时变化时会多次触发此回调（每个属性一次）
     * - 可在子类中使用 debounce 合并多次快速连续的变化
     * - 对于复杂组件，可考虑使用 requestAnimationFrame 批量处理
     *
     ** ⚠️ 注意事项：**
     * - oldValue 和 newValue 都是**字符串**类型（HTML 属性始终是字符串）
     * - 如果需要数字/布尔值，需手动转换：Number(newValue), newValue !== 'null'
     * - 此回调可能在 connectedCallback 之前触发（见情况A2的处理）
     * - 不要在此方法中直接修改属性（可能导致无限循环）
     *
     * @param {string} name - 发生变化的属性名称
     * @param {string|null} oldValue - 变化前的属性值
     * @param {string|null} newValue - 变化后的属性值
     * @returns {void}
     *
     * @see render() - 实际执行渲染的方法
     * @see #needsRender - 延迟渲染标记
     * @see #connectPromise - 异步初始化的 Promise 引用
     */
    attributeChangedCallback(name, oldValue, newValue) {
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

    // ==================== 显式销毁 ====================

    /**
     * 公共方法 - 显式销毁组件（唯一正确的销毁方式）
     *
     ** 🎯 核心目的：**
     * 提供明确的、可控的组件销毁接口，区别于浏览器的 disconnectedCallback。
     * 通过设置 `#shouldDestroy` 标志，确保仅在用户主动要求时才彻底清理资源。
     *
     ** 为什么需要显式的 destroy() 方法？**
     * Web Components 的生命周期设计有一个缺陷：
     * - `connectedCallback/disconnectedCallback` 由浏览器自动调用
     * - 但浏览器无法区分"临时移除"和"永久销毁"
     * - 导致开发者无法安全地在 disconnectedCallback 中清理资源
     *
     * 本类通过引入 `#shouldDestroy` 标志解决了这个问题：
     * - 用户必须显式调用 `destroy()` 来标记"我要销毁它了"
     * - 然后 destroy() 内部调用 `this.remove()` 将元素从DOM移除
     * - 浏览器随后触发 `disconnectedCallback()`，此时检查标志并执行真正的销毁
     *
     ** 执行流程（2条路径）：**
     *
     * **路径A：组件当前在 DOM 中（isConnected === true）**
     * ```
     * 调用 destroy()
     *    ↓
     * 防重入检查: if (this.#shouldDestroy) return;
     *    ↓
     * 设置标志: #shouldDestroy = true
     *    ↓
     * 检查: this.isConnected === true?
     *    ↓ 是
     * 调用 this.remove()
     *    ↓
     * 浏览器将元素从DOM树移除
     *    ↓
     * 自动触发 disconnectedCallback()
     *    ↓
     * disconnectedCallback 发现 #shouldDestroy === true
     *    ↓
     * 执行完整销毁流程:
     *   ① onDisconnect() → 子类清理
     *   ② disposable.destroy() → 资源清理
     *   ③ #disposable = null → 释放引用
     * ```
     *
     * **路径B：组件当前不在 DOM 中（isConnected === false）**
     * ```
     * 调用 destroy()
     *    ↓
     * 防重入检查: if (this.#shouldDestroy) return;
     *    ↓
     * 设置标志: #shouldDestroy = true
     *    ↓
     * 检查: this.isConnected === false?
     *    ↓ 是（元素已被移除但未走正常销毁流程）
     * 手动执行销毁:
     *   ① this.onDisconnect()           // 通知子类
     *   ② this.#disposable?.destroy()   // 清理资源
     *   ③ this.#disposable = null       // 释放引用
     *   ④ this.#connected = false       // 更新状态
     * ```
     *
     ** 何时会走路径B？**
     * - 组件从未被添加到DOM就调用了destroy()
     * - 外部代码直接调用了 element.remove() 而非 component.destroy()
     * - 在 disconnectedCallback 之后又想补充销毁
     * - 单元测试中的特殊场景
     *
     ** 防重入机制：**
     * ```javascript
     * if (this.#shouldDestroy) return;
     * ```
     * 确保即使多次调用 destroy() 也只执行一次销毁操作。
     * 第二次及之后的调用会立即返回，不会产生副作用。
     *
     ** 与 DOM API 的关系：**
     * - `destroy()` 内部会调用 `this.remove()`（如果在DOM中）
     * - 但推荐始终使用 `component.destroy()` 而非 `element.remove()`
     * - 因为后者不会设置 `#shouldDestroy`，导致资源泄漏
     *
     ** 调用示例：**
     * ```javascript
     * // 推荐：显式销毁
     * myComponent.destroy();
     *
     * // 不推荐：直接移除（会导致资源泄漏！）
     * myComponent.remove();  // ❌ disconnectedCallback 不会清理资源
     *
     * // 正确的批量销毁
     * container.querySelectorAll('my-component').forEach(comp => comp.destroy());
     * ```
     *
     ** 销毁后的状态：**
     * - #shouldDestroy: true（不可逆）
     * - #connected: false
     * - #disposable: null（已释放）
     * - 事件监听器: 全部移除
     * - 定时器: 全部清除
     * - 子对象: 全部已 destroy()
     * - 元素本身: 已从DOM移除（但仍存在于内存中，直到JS释放引用）
     *
     ** ⚠️ 销毁后不应再：**
     * - 访问 shadowRoot（虽然仍存在但内容已清空）
     * - 调用任何公共方法（除了 isDestroyed 查询）
     * - 重新添加到DOM（行为未定义，可能导致错误）
     * - 保持对组件的引用（应置为 null 帮助 GC）
     *
     * @returns {void}
     *
     * @see disconnectedCallback() - 实际执行销毁逻辑的地方
     * @see #shouldDestroy - 控制销毁行为的标志
     * @see isDestroyed - 查询是否已销毁
     */
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

    /**
     * 公共 getter - 查询组件是否当前已连接到 DOM 树
     *
     ** 🎯 用途：**
     * 提供对外暴露的只读接口，用于判断组件的连接状态。
     * 外部代码可以使用此属性决定是否与组件交互。
     *
     ** 使用场景：**
     * ```javascript
     * if (myComponent.isComponentConnected) {
     *     // 安全地访问 shadowRoot 或调用方法
     *     myComponent.updateData(newData);
     * } else {
     *     console.warn('组件尚未挂载到DOM');
     * }
     * ```
     *
     * @type {boolean}
     *   - true: 组件当前在 DOM 树中（connectedCallback 已调用且未断开）
     *   - false: 组件不在 DOM 树中（尚未连接、已断开、或已销毁）
     *
     * @see #connected - 内部状态字段
     */
    get isComponentConnected() {
        return this.#connected;
    }

    /**
     * 公共 getter - 查询组件是否已经被显式销毁
     *
     ** 🎯 用途：**
     * 提供对外暴露的只读接口，用于判断组件是否还可用。
     * 销毁后的组件不应再被使用（除了查询此属性）。
     *
     ** 使用场景：**
     * ```javascript
     * if (!myComponent.isDestroyed) {
     *     myComponent.refresh();  // 安全调用
     * } else {
     *     console.error('组件已销毁，无法操作');
     *     // 应该创建新实例替代
     *     myComponent = new MyComponent();
     *     document.body.appendChild(myComponent);
     * }
     * ```
     *
     ** 与 isConnected 的区别：**
     * | 属性 | 含义 | 可逆性 |
     * |------|------|--------|
     * | **isConnected** | 元素是否在DOM中 | 可逆（可重新添加） |
     * | **isComponentConnected** | 是否经历过 connectedCallback | 可逆（re-connect） |
     * | **isDestroyed** | 是否调用了 destroy() | **不可逆** |
     *
     * @type {boolean}
     *   - false: 默认值，组件仍在使用中（无论是否连接到DOM）
     *   - true: 已经调用过 destroy()，组件应被视为不可用
     *
     * @see #shouldDestroy - 内部状态字段
     * @see destroy() - 设置此标志的方法
     */
    get isDestroyed() {
        return this.#shouldDestroy;
    }

    // ==================== 子类覆写的钩子 ====================

    /**
     * 子类钩子方法 - 组件连接到 DOM 时的初始化入口（必须由子类覆写）
     *
     ** 🎯 核心目的：**
     * 提供给子类的初始化钩子，在此方法中完成：
     * - 注册 DOM 事件监听器
     * - 创建和管理子对象
     * - 发起数据请求（同步或异步）
     * - 执行一次性初始化逻辑
     *
     ** 调用时机：**
     * 由 `connectedCallback()` 在首次渲染**之后**自动调用。
     * 此时 Shadow DOM 结构已经存在（因为 render() 先于本方法执行）。
     *
     ** 支持两种模式：**
     *
     * **模式1：同步初始化（默认）**
     * ```javascript
     * class MyButton extends WebComponent {
     *     onConnect(disposable) {
     *         // 注册点击事件
     *         disposable.trackEvent(this.shadowRoot, 'click', this.handleClick);
     *
     *         // 创建子对象（如工具提示）
     *         this.tooltip = new Tooltip(this.shadowRoot.querySelector('.btn'));
     *         disposable.trackObject(this.tooltip);
     *     }
     * }
     * ```
     *
     * **模式2：异步初始化（返回 Promise）**
     * ```javascript
     * class DataGrid extends WebComponent {
     *     async onConnect(disposable) {
     *         // 加载远程配置
     *         this.config = await fetch('/api/grid-config').then(r => r.json());
     *
     *         // 动态导入大型依赖
     *         const { ChartLibrary } = await import('./chart-lib.js');
     *         this.chart = new ChartLibrary(this.config);
     *         disposable.trackObject(this.chart);
     *     }
     * }
     * ```
     *
     ** @param disposable 参数详解：**
     *
     * 类型：{@link Disposable} 资源管理器实例
     *
     * 提供的核心方法：
     * - **trackEvent(target, type, handler)**: 注册事件监听器
     *   - target: 事件目标（Element, Document, Window 等）
     *   - type: 事件类型（'click', 'input', 'keydown' 等）
     *   - handler: 事件处理函数
     *   - 自动在组件销毁时 removeEventListener
     *
     * - **trackObject(obj)**: 注册可销毁的子对象
     *   - obj: 必须具有 destroy() 方法的对象
     *   - 自动在组件销毁时调用 obj.destroy()
     *
     * - **trackInterval(id)**: 注册定时器 ID
     *   - id: setInterval() 的返回值
     *   - 自动在组件销毁时 clearInterval()
     *
     * ** 最佳实践：**
     * 1. **所有资源都通过 disposable 注册**，不要手动管理
     * 2. **不要在此方法中修改 DOM 属性**（可能导致无限循环）
     * 3. **异步操作要考虑竞态条件**（组件可能在异步完成前就被销毁）
     * 4. **保持方法简洁**，复杂逻辑拆分为独立方法
     *
     * ** 错误处理：**
     * - 同步模式下抛出的异常会中断 connectedCallback 的执行
     * - 建议在子类中使用 try-catch 包裹可能失败的操作
     * - 异步模式下 Promise rejected 不会影响二次渲染（.then 不执行）
     *
     * @param {import("./Disposable.js").Disposable} disposable - 资源管理器实例
     *   - 必须通过此对象注册所有需要清理的资源
     *   - 不要缓存此引用到外部变量（会在销毁时被清空）
     * @returns {void|Promise<void>}
     *   - void: 同步初始化完成
     *   - Promise<void>: 异步初始化（resolved 表示完成，rejected 表示失败）
     *
     * @see connectedCallback() - 调用此钩子的地方
     * @see onDisconnect() - 配套的清理钩子
     * @see render() - 在此钩子之前执行的渲染方法
     * @see Disposable - 资源管理器的详细文档
     */
    onConnect(disposable) {
        // 子类覆写：注册事件
        // disposable.trackEvent(target, type, handler)
    }

    /**
     * 子类钩子方法 - 组件真正销毁时的清理入口（可选覆写）
     *
     ** 🎯 核心目的：**
     * 提供给子类的清理钩子，在此方法中释放无法通过 Disposable 管理的资源。
     * 仅当 `#shouldDestroy === true` 时才会被调用（即用户显式调用了 destroy()）。
     *
     ** 调用时机：**
     * 由 `discoveredCallback()` 在确认需要销毁时调用。
     * 调用顺序：onDisconnect() → disposable.destroy() → #disposable = null
     *
     ** 适用场景（需要在此清理的资源）：**
     *
     * **1. 外部服务的取消订阅：**
     * ```javascript
     * onDisconnect() {
     *     // 取消 WebSocket 连接
     *     if (this.ws) {
     *         this.ws.close();
     *         this.ws = null;
     *     }
     *
     *     // 取消 EventBus 全局事件监听
     *     eventBus.off('global-update', this.handleGlobalUpdate);
     * }
     * ```
     *
     * **2. 全局状态的清理：**
     * ```javascript
     * onDisconnect() {
     *     // 从全局注册表中移除自己
     *     componentRegistry.delete(this.id);
     *
     *     // 通知父组件自己即将销毁
     *     this.parentComponent?.notifyChildDestroyed(this);
     * }
     * ```
     *
     * **3. 大型数据的释放：**
     * ```javascript
     * onDisconnect() {
     *     // 释放大量缓存的计算结果
     *     this.computedData = null;
     *     this.cache.clear();
     *
     *     // 取消进行中的动画帧
     *     if (this.animationFrameId) {
     *         cancelAnimationFrame(this.animationFrameId);
     *     }
     * }
     * ```
     *
     ** 不需要在此清理的资源（已由 Disposable 管理）：**
     * - ✅ DOM 事件监听器（通过 trackEvent 注册）
     * - ✅ 具有 destroy() 方法的子对象（通过 trackObject 注册）
     * - ✅ setInterval/setTimeout 定时器（通过 trackInterval 注册）
     *
     ** 与 Disposable.destroy() 的关系：**
     * - onDisconnect(): 清理**子类特有的、非标准的**资源
     * - disposable.destroy(): 清理**通用的、可标准化的**资源
     * - 两者互补，共同完成完整的清理工作
     *
     ** 执行上下文：**
     * - 此时 #disposable 尚未被销毁（在本方法之后才销毁）
     * - 可以在最后时刻访问 disposable 管理的对象
     * - 但不建议在此修改 disposable 的内容（即将被销毁）
     *
     ** ⚠️ 注意事项：**
     * - 此方法**不一定被调用**（如果只是临时断开而非真正销毁）
     * - 不要在此方法中抛出异常（会影响后续的 disposable.destroy()）
     * - 不要在此方法中尝试恢复组件状态（销毁是不可逆的）
     * - 保持方法简洁快速（不要有耗时操作）
     *
     * @returns {void}
     *
     * @see disconnectedCallback() - 调用此钩子的地方
     * @see onConnect() - 配套的初始化钩子
     * @see destroy() - 触发销毁的方法
     */
    onDisconnect() {
        // 子类覆写：清理特有资源
    }

    /**
     * 子类钩子方法 - 渲染组件的 Shadow DOM 内容（必须由子类覆写）
     *
     ** 🎯 核心目的：**
     * 定义组件的 UI 结构和初始内容。这是 Web Components 的"模板"机制。
     * 类似 React 的 render() 或 Vue 的 template/render 函数。
     *
     ** 调用时机：**
     * 1. **connectedCallback() 中自动调用**（首次渲染）
     * 2. **attributeChangedCallback() 中调用**（属性变化时）
     * 3. **异步 onConnect 完成后再次调用**（二次渲染）
     *
     ** 基础实现（空函数）：**
     * 基类提供空实现，子类**必须覆写**此方法以提供实际的UI内容。
     *
     ** 常见的渲染方式：**
     *
     * **方式1：innerHTML（简单场景）**
     * ```javascript
     * render() {
     *     this.shadowRoot.innerHTML = `
     *         <style>
     *             :host { display: block; padding: 10px; }
     *             .header { font-weight: bold; color: blue; }
     *         </style>
     *         <div class="header">
     *             <slot name="header">Default Header</slot>
     *         </div>
     *         <div class="content">
     *             <slot>Default Content</slot>
     *         </div>
     *     `;
     * }
     * ```
     *
     * **方式2：document.createElement（高性能场景）**
     * ```javascript
     * render() {
     *     const fragment = document.createDocumentFragment();
     *
     *     const style = document.createElement('style');
     *     style.textContent = ':host { display: block; }';
     *     fragment.appendChild(style);
     *
     *     const container = document.createElement('div');
     *     container.className = 'container';
     *     fragment.appendChild(container);
     *
     *     this.shadowRoot.replaceChildren(fragment);
     * }
     * ```
     *
     * **方式3：Template Literal Tag（高级场景）**
     * ```javascript
     * import { html } from './html-helper.js';
     *
     * render() {
     *     this.shadowRoot.appendChild(html`
     *         <div class="card">
     *             <h2>${this.title}</h2>
     *             ${this.items.map(item => html`<p>${item}</p>`)}
     *         </div>
     *     `);
     * }
     * ```
     *
     * ** @param changedAttr 参数：**
     * 当由 `attributeChangedCallback` 调用时，传入变化的属性名：
     * ```javascript
     * render(changedAttr) {
     *     if (changedAttr === 'data-color') {
     *         // 增量更新：只改颜色相关部分
     *         this.colorBox.style.backgroundColor = this.getAttribute('data-color');
     *         return;  // 避免全量重渲染
     *     }
     *
     *     // 全量重渲染（首次渲染或其他属性变化）
     *     this.shadowRoot.innerHTML = this.getFullTemplate();
     * }
     * ```
     *
     * ** 性能优化技巧：**
     * 1. **脏检查**：比较新旧属性值，无变化则跳过渲染
     * 2. **增量更新**：根据 changedAttr 只更新受影响的 DOM 子树
     * 3. **虚拟 DOM diff**：使用 lit-html 等库进行高效差异比对
     * 4. **requestAnimationFrame**：合并多次快速连续的渲染请求
     * 5. **缓存模板**：对于静态部分，避免重复构建 DOM
     *
     * ** 样式隔离：**
     * Shadow DOM 天然提供样式作用域隔离：
     * - 外部 CSS 不会渗透进 Shadow DOM（除非使用 ::part() 选择器）
     * - Shadow DOM 内的样式不会泄露到外部
     * - 推荐使用 `<style>` 标签或 constructable stylesheets
     *
     * ** Slot 机制（内容分发）：**
     * 使用 `<slot>` 元素允许外部传入自定义内容：
     * ```html
     * <my-component>
     *     <span slot="header">Custom Header</span>  <!-- 命名插槽 -->
     *     Default content for unnamed slot          <!-- 默认插槽 -->
     * </my-component>
     * ```
     *
     * ** ⚠️ 注意事项：**
     * - **必须**操作 `this.shadowRoot`（不是 this 或 document）
     * - 首次调用时 shadowRoot 已存在（构造函数中 attachShadow）
     * - 避免在 render 中创建长期存在的闭包（可能导致内存泄漏）
     * - 复杂组件应考虑拆分为多个子 Web Component
     *
     * @param {string} [changedAttr] - 触发此次渲染的属性名（可选）
     *   - 由 attributeChangedCallback 传递
     *   - 首次渲染或手动调用时为 undefined
     *   - 可用于实现增量更新的性能优化
     * @returns {void}
     *
     * @see connectedCallback() - 首次调用的位置
     * @see attributeChangedCallback() - 属性变化时调用的位置
     * @see onConnect() - 在此方法之后执行的初始化
     */
    render() {
        // 子类覆写：渲染模板
    }

    // ==================== 工具方法 ====================

    /**
     * 公共工具方法 - HTML 实体转义（防止 XSS 攻击）
     *
     ** 🎯 核心目的：**
     * 将用户提供的文本中的特殊 HTML 字符转义为安全的实体表示，
     * 防止脚本注入攻击（XSS - Cross-Site Scripting）。
     *
     ** 转义的字符映射：**
     * | 原字符 | 转义后 | 名称 |
     * |--------|--------|------|
     * | `&` | `&amp;` | 和号 |
     * | `<` | `&lt;` | 小于号 |
     * | `>` | `&gt;` | 大于号 |
     * | `"` | `&quot;` | 双引号 |
     * | `'` | `&#39;` | 单引号（某些实现）|
     *
     ** 实现原理：**
     * 利用浏览器的内置文本编码机制：
     * 1. 创建临时的 `<div>` 元素
     * 2. 将原始文本设置为 textContent（纯文本，不解析HTML）
     * 3. 读取 innerHTML（浏览器自动转义特殊字符）
     * 4. 返回转义后的安全字符串
     *
     ** 使用示例：**
     * ```javascript
     * const userInput = '<script>alert("XSS")</script>';
     * const safeText = this.escapeHtml(userInput);
     * // safeText = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
     *
     * this.shadowRoot.innerHTML = `<div>${safeText}</div>`;
     * // 显示为纯文本：<script>alert("XSS")</script>
     * // 而非执行 JavaScript 代码
     * ```
     *
     ** 适用范围：**
     * ✅ **适用于：**
     * - 文本节点内容（textContent）
     * - HTML 注释内容
     * - 数据属性的值（如果需要显示原始值）
     *
     * ❌ **不适用于：**
     * - URL 属性（href, src 等）- 应使用 encodeURIComponent
     * - CSS 值（style, class 等）- 应使用 CSS 转义
     * - JavaScript 表达式（onclick 等）- 根本不应该动态拼接
     * - 已经过滤的白名单 HTML（如富文本编辑器）
     *
     ** 性能考虑：**
     * - 每次调用都会创建临时 DOM 元素（有少量开销）
     * - 高频调用场景（如大数据列表渲染）应考虑缓存或批量处理
     * - 对于已知安全的静态文本，可以跳过此方法
     *
     ** 替代方案：**
     * - **手动替换**：`text.replace(/[&<>"']/g, char => map[char])` - 更快但不完整
     * - **DOMPurify 库**：专业的 HTML 清理库（支持白名单过滤）
     * - **CSS escape()**：用于 CSS 上下文的转义
     * - **encodeURIComponent**：用于 URL 上下文的编码
     *
     * @param {string} text - 需要转义的原始文本
     *   - 可能包含恶意 HTML/JavaScript 代码
     *   - 通常来自用户输入、数据库、API 响应等不可信来源
     * @returns {string} 转义后的安全文本
     *   - 所有特殊 HTML 字符都已转换为实体表示
     *   - 可以安全地嵌入 innerHTML 而不担心 XSS
     *
     * @example
     * // 基础用法
     * this.escapeHtml('<div>Hello</div>')
     * // 返回: '&lt;div&gt;Hello&lt;/div&gt;'
     *
     * // 在渲染中使用
     * render() {
     *     const userName = this.escapeHtml(this.getAttribute('name'));
     *     this.shadowRoot.innerHTML = `<h1>Welcome, ${userName}!</h1>`;
     * }
     */
    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 公共工具方法 - 向外派发自定义 DOM 事件（组件通信机制）
     *
     ** 🎯 核心目的：**
     * 提供 Web Components 的标准化事件发射接口，
     * 实现子组件向父组件的数据传递和通知机制。
     * 类似 React 的 props.callback 或 Vue 的 $emit。
     *
     ** 事件特性（默认配置）：**
     * - **bubbles: true** - 事件会向上冒泡到祖先元素
     *   - 父组件可以通过 `addEventListener` 在自身上监听
     *   - 也可以在 document/window 上全局监听
     * - **composed: true** - 事件可以穿透 Shadow DOM 边界
     *   - Shadow DOM 内部发射的事件能被外部监听到
     *   - 这是 Web Components 通信的关键特性
     * - **cancelable: false** - 事件不能被 preventDefault()
     *   - 保持语义清晰：通知性质的事件不应被阻止
     *
     ** 事件数据传输（detail 对象）：**
     * 自定义事件通过 detail 属性携带数据：
     * ```javascript
     * // 发射事件
     * this.emit('item-selected', {
     *     itemId: 123,
     *     itemName: 'Widget',
     *     timestamp: Date.now()
     * });
     *
     * // 监听事件（在外部）
     * myComponent.addEventListener('item-selected', (e) => {
     *     console.log(e.detail.itemId);    // 123
     *     console.log(e.detail.itemName);  // 'Widget'
     *     console.log(e.detail.timestamp); // 当前时间戳
     * });
     * ```
     *
     ** 使用场景：**
     *
     * **1. 通知状态变更：**
     * ```javascript
     * // 子组件内
     * handleClick() {
     *     this.toggleExpanded();
     *     this.emit('expanded-changed', { expanded: this.isExpanded });
     * }
     *
     * // 父组件监听
     * accordion.addEventListener('expanded-changed', (e) => {
     *     if (e.detail.expanded) {
     *         console.log('面板展开');
     *     }
     * });
     * ```
     *
     * **2. 请求数据/操作（向上冒泡）：**
     * ```javascript
     * // 深层嵌套的按钮组件
     * submitBtn.addEventListener('click', () => {
     *     this.emit('form-submit', { formData: this.collectFormData() });
     * });
     *
     * // 外层表单组件捕获（利用 bubbles 特性）
     * form.addEventListener('form-submit', (e) => {
     *     this.submitToServer(e.detail.formData);
     * });
     * ```
     *
     * **3. 跨 Shadow DOM 通信：**
     * ```javascript
     * // Shadow DOM 内部的自定义元素
     * this.emit('custom-action', { payload: data });
     * // 即使监听器注册在外部，也能收到（composed: true）
     * ```
     *
     ** 命名规范建议：**
     * - 使用 kebab-case：`item-selected`, `value-change`, `load-complete`
     * - 避免使用浏览器保留字：`click`, `input`, `change`, `submit`
     * - 带组件名前缀防止冲突：`my-comp-item-selected`
     * - 使用动词或名词短语表示事件性质
     *
     ** options 参数详解：**
     * 可以覆盖默认的事件配置：
     * ```javascript
     * // 不可冒泡的本地事件
     * this.emit('internal-update', data, { bubbles: false });
     *
     * // 可取消的事件（罕见）
     * this.emit('before-close', data, { cancelable: true });
     * if (!event.defaultPrevented) {
     *     this.close();
     * }
     *
     * // 仅在 Shadow DOM 内传播
     * this.emit('private-event', data, { composed: false });
     * ```
     *
     ** 与原生事件的兼容性：**
     * - 此方法创建的是 CustomEvent（不是普通 Event）
     * - 可以与原生事件共存于同一事件系统
     * - 可以在同一个元素上同时监听原生和自定义事件
     * - 事件对象的 `event.isTrusted` 为 false（程序合成）
     *
     ** 性能考虑：**
     * - 事件对象创建开销很小（微秒级）
     * - 高频事件（如 mousemove）应考虑节流（throttle）
     * - 大量数据传输时应使用引用而非拷贝
     * - 避免在循环中频繁创建不必要的临时对象
     *
     * @param {string} name - 自定义事件的名称
     *   - 推荐使用 kebab-case 格式
     *   - 应具有描述性和唯一性
     *   - 示例：'value-change', 'item-clicked', 'async-complete'
     * @param {Object} [detail={}] - 事件携带的数据载荷
     *   - 可以是任意可序列化的 JavaScript 对象
     *   - 通过 `event.detail` 在监听器中访问
     *   - 示例：{ id: 123, value: 'hello', items: [] }
     * @param {Object} [options={}] - 事件配置选项（覆盖默认值）
     * @param {boolean} [options.bubbles=true] - 是否向上冒泡到祖先元素
     *   - true（默认）：父元素可以通过 addEventListener 监听
     *   - false：仅在当前元素触发，不向外传播
     * @param {boolean} [options.composed=true] - 是否穿透 Shadow DOM 边界
     *   - true（默认）：Shadow DOM 内发射的事件能被外部捕获
     *   - false：事件被限制在 Shadow DOM 内部
     * @param {boolean} [options.cancelable=false] - 事件是否可被取消
     *   - false（默认）：preventDefault() 无效
     *   - true：监听器可以调用 event.preventDefault() 取消事件
     * @returns {void}
     *
     * @example
     * // 基础用法
     * this.emit('status-changed', { status: 'active', id: 42 });
     *
     * // 自定义选项
     * this.emit('before-delete', { itemId: 7 }, {
     *     cancelable: true  // 允许监听者阻止删除
     * });
     *
     * // 监听示例（在外部代码中）
     * myComponent.addEventListener('status-changed', (e) => {
     *     console.log(`Status changed to: ${e.detail.status}`);
     * });
     */
    emit(name, detail = {}, options = {}) {
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
