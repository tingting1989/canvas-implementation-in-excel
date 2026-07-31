/**
 * Disposable — 基础生命周期资源管理类（组合模式的核心组件）
 *
 * 🎯 **核心设计目标：**
 * 提供统一的、自动化的资源生命周期管理机制，解决 JavaScript 中常见的**内存泄漏**问题。
 * 通过"注册-追踪-自动清理"模式，确保所有资源在对象销毁时被正确释放。
 *
 * **📚 解决的典型问题：**
 * - ❌ 忘记移除事件监听器 → DOM元素无法GC回收
 * - ❌ 忘记清除定时器 → 后台任务持续运行
 * - ❌ 忘记销毁子对象 → 引用链导致大量内存泄漏
 * - ❌ 手动管理复杂依赖关系 → 代码混乱且易出错
 *
 * **✅ 提供的能力：**
 * - `trackEvent()`: 注册事件监听器，destroy 时自动 removeEventListener
 * - `trackChild()`: 注册子对象（需实现destroy方法），父级destroy时级联销毁
 * - `destroy()`: 幂等销毁入口（多次调用安全）
 * - `onDestroy()`: 子类覆写钩子，释放特有资源（自动沿原型链调用）
 *
 * **🔄 销毁顺序（destroy内部执行流程）：**
 * ```
 * 调用 destroy()
 *   ↓
 * ① 设置 #disposed = true（标记已销毁，阻止后续注册）
 *   ↓
 * ② 遍历原型链，调用所有父类的 onDestroy()
 *   ├── 子类.onDestroy()     （最具体 → 最先执行）
 *   ├── 中间父类.onDestroy()（如有继承链）
 *   └── Disposable.onDestroy()（基类的空实现，最后执行）
 *   ↓
 * ③ 批量移除所有事件监听器
 *   └── 对每个 trackEvent 注册的条目调用 removeEventListener
 *   ↓
 * ④ 级联销毁所有子对象
 *   └── 对每个 trackChild 注册的对象调用 child.destroy()
 *   ↓
 * ⑤ 清空内部数组（#eventListeners 和 #children）
 *   └── 释放引用，帮助垃圾回收
 * ```
 *
 * **🏗️ 架构设计：**
 *
 * **组合模式（Composition over Inheritance）：**
 * Disposable 采用组合模式而非继承模式来管理资源。
 * 这意味着任何对象都可以通过"持有一个 Disposable 实例"来获得资源管理能力，
 * 而不需要继承自 Disposable 类。
 *
 * **典型使用场景：**
 * ```javascript
 * // 场景1: WebComponent 中的使用（见 WebComponent.js）
 * class MyComponent extends HTMLElement {
 *     constructor() {
 *         super();
 *         this.disposable = new Disposable();  // 组合使用
 *     }
 *
 *     connectedCallback() {
 *         this.disposable.trackEvent(window, 'resize', this.handleResize);
 *         this.disposable.trackChild(this.childObject);  // childObject 必须有 destroy()
 *     }
 *
 *     disconnectedCallback() {
 *         this.disposable.destroy();  // 一次性清理所有资源
 *     }
 * }
 * ```
 *
 * **与 WebComponent 的集成：**
 * 在本项目中，Disposable 主要作为 WebComponent 的内部资源管理器，
 * 由 WebComponent.connectedCallback() 创建并传递给 onConnect() 钩子。
 * 这种设计使得 WebComponent 本身不需要继承 Disposable，
 * 但仍然享受其提供的自动化资源管理能力。
 *
 * **💡 设计亮点：**
 *
 * 1. **幂等性（Idempotency）**: 多次调用 destroy() 安全无副作用
 * 2. **原型链遍历**: 自动调用整个继承链上的 onDestroy 方法
 * 3. **防御式编程**: 已销毁后拒绝新的 trackEvent/trackChild 注册
 * 4. **自动级联**: 父对象销毁时自动递归销毁所有子对象
 * 5. **零配置**: 无需手动维护清理代码，声明式注册即可
 *
 * **⚠️ 使用注意事项：**
 * - 不要直接 new Disposable() 后忘记调用 destroy()
 * - trackChild 要求子对象必须具有 destroy() 方法
 * - onDestroy 不应抛出异常（会影响后续清理步骤）
 * - 销毁后的对象不应再被使用（除了 isDisposed 查询）
 *
 * @example
 * // 基础用法
 * const disposable = new Disposable();
 *
 * // 注册事件监听器
 * disposable.trackEvent(document, 'click', handleClick);
 * disposable.trackEvent(window, 'resize', handleResize);
 *
 * // 注册定时器（通过包装成对象）
 * const timerWrapper = {
 *     id: setInterval(updateData, 1000),
 *     destroy() { clearInterval(this.id); }
 * };
 * disposable.trackChild(timerWrapper);
 *
 * // 使用完毕后一键销毁
 * disposable.destroy();
 * // 所有事件监听器和定时器都被自动清理
 *
 * @see WebComponent - 主要使用者，在 connectedCallback 中创建 Disposable
 */
export class Disposable {
    /**
     * @private 私有字段 - 是否已销毁的状态标志（幂等性保障）
     *
     ** 🎯 核心目的：**
     * 跟踪对象的销毁状态，提供两个关键能力：
     * 1. **幂等性保证**：多次调用 destroy() 只执行一次实际销毁逻辑
     * 2. **防御性检查**：已销毁后拒绝新的资源注册（trackEvent/trackChild）
     *
     ** 状态转换：**
     * ```
     * 初始状态: false (未销毁，可正常使用)
     *    ↓ 第一次调用 destroy()
     * true (已销毁，后续操作将被拒绝)
     *    ↓ (不可逆)
     * true (保持 true，即使再次调用 destroy())
     * ```
     *
     ** 为什么需要此标志？**
     * - **防止重复销毁**：避免重复移除事件监听器或销毁子对象
     * - **防止泄漏注册**：销毁后如果允许新注册，这些新资源将永远不会被清理
     * - **快速失败**：外部代码可通过 isDisposed 快速判断对象是否可用
     *
     ** 使用场景：**
     * ```javascript
     * const d = new Disposable();
     * console.log(d.isDisposed);  // false
     *
     * d.destroy();
     * console.log(d.isDisposed);  // true
     *
     * // 尝试在销毁后注册（会被静默忽略）
     * d.trackEvent(el, 'click', handler);  // 无效，因为 #disposed === true
     *
     * // 再次销毁（安全，不会报错）
     * d.destroy();  // 立即返回，不执行任何操作
     * ```
     *
     * @type {boolean}
     *   - false: 对象处于活跃状态，可以注册资源和正常使用
     *   - true: 对象已被销毁，所有注册操作将被忽略
     *
     * @see isDisposed - 公共 getter 封装此字段
     * @see destroy() - 设置此标志的方法
     */
    #disposed = false;

    /**
     * @private 私有字段 - 已注册的事件监听器列表（自动清理的核心数据结构）
     *
     ** 🎯 核心目的：**
     * 存储所有通过 `trackEvent()` 注册的事件监听器的完整信息，
     * 以便在 `destroy()` 时能够精确地反向操作（removeEventListener）。
     *
     ** 数据结构：**
     * 类型：Array\<{target: EventTarget, type: string, handler: Function, options?: Object}\>
     *
     * 每个元素包含4个属性：
     * - **target**: 事件目标对象（Element, Document, Window 等）
     * - **type**: 事件类型字符串（'click', 'input', 'keydown' 等）
     * - **handler**: 事件处理函数引用（必须与 addEventListener 时相同）
     * - **options**: 可选的事件选项（capture, passive, once 等）
     *
     ** 数据流：**
     * ```
     * trackEvent(target, type, handler, options)
     *    ↓
     * target.addEventListener(type, handler, options)  // 注册到浏览器
     *    ↓
     * this.#eventListeners.push({target, type, handler, options})  // 记录到列表
     *    ↓
     * ... (对象正常使用中) ...
     *    ↓
     * destroy() 被调用
     *    ↓
     * 遍历 #eventListeners 数组:
     *   对于每个条目:
     *     target.removeEventListener(type, handler, options)  // 从浏览器移除
     *    ↓
     * this.#eventListeners.length = 0  // 清空数组，释放内存
     * ```
     *
     ** 为什么存储完整信息而非仅存储 handler？**
     * 因为 `removeEventListener` 要求参数与 `addEventListener` **完全一致**才能成功移除：
     * ```javascript
     * // ❌ 错误：只存 handler，丢失了 options 信息
     * target.removeEventListener('click', handler);  // 可能无法移除！
     *
     * // ✅ 正确：保存完整的调用参数
     * target.removeEventListener('click', handler, { capture: true });  // 成功移除
     * ```
     *
     ** 内存占用分析：**
     * - 每个条目约占用 ~100 bytes（4个引用 + 对象开销）
     * - 100个事件监听器 ≈ 10KB（可忽略不计）
     * - destroy() 后清空数组，内存立即释放
     *
     ** 典型内容示例：**
     * ```javascript
     * [
     *   { target: document,      type: 'click',   handler: fn1, options: undefined },
     *   { target: window,        type: 'resize',  handler: fn2, options: { passive: true } },
     *   { target: shadowRoot,    type: 'input',   handler: fn3, options: undefined },
     *   { target: element,       type: 'keydown', handler: fn4, options: { capture: true } }
     * ]
     * ```
     *
     * @type {Array<{target: EventTarget, type: string, handler: Function, options?: Object}>}
     *   - 空数组 []: 尚未注册任何事件监听器
     *   - 包含 N 个元素: 已注册 N 个事件监听器
     *   - destroy() 后重置为空数组 []
     *
     * @see trackEvent() - 向此数组添加条目的方法
     * @see destroy() - 遍历并清空此数组的方法
     */
    #eventListeners = [];

    /**
     * @private 私有字段 - 已注册的子对象列表（级联销毁的核心数据结构）
     *
     ** 🎯 核心目的：**
     * 存储所有通过 `trackChild()` 注册的子对象引用，
     * 以便在 `destroy()` 时能够递归销毁它们，形成**父子级联销毁链**。
     *
     ** 数据结构：**
     * 类型：Array\<Disposable\> 或 Array\<{destroy(): void}\>
     *
     * ** 接口要求：**
     * 每个子对象**必须**具有 `destroy()` 方法（无参数、无返回值）。
     * 通常这些子对象也是 Disposable 实例，或者实现了相同接口的自定义对象。
     *
     ** 级联销毁机制：**
     * ```
     * Parent Disposable
     *   ├── trackChild(childA)  ← 注册子对象A
     *   ├── trackChild(childB)  ← 注册子对象B
     *   │   └── childB 内部可能也持有自己的 children
     *   │       └── 形成树状结构
     *   └── trackChild(childC)  ← 注册子对象C
     *
     * parent.destroy() 调用时:
     *   ① childA.destroy()  → 清理 A 及其所有后代
     *   ② childB.destroy()  → 清理 B 及其所有后代（递归）
     *   ③ childC.destroy()  → 清理 C 及其所有后代
     *   ④ parent.#children = []  → 清空引用
     * ```
     *
     ** 与 #eventListeners 的区别：**
     * | 特征 | #eventListeners | #children |
     * |------|----------------|----------|
     * | **存储内容** | 事件监听器信息 | 子对象引用 |
     * | **销毁方式** | removeEventListener | child.destroy() |
     * | **层级深度** | 扁平（无嵌套） | 可嵌套（树状结构）|
     * | **接口要求** | 浏览器原生 API | 自定义 destroy() 方法 |
     *
     ** 典型使用场景：**
     *
     * **场景1：WebComponent 中的子组件**
     * ```javascript
     * class Panel extends WebComponent {
     *     onConnect(disposable) {
     *         // 创建并注册子组件
     *         this.header = new Header();
     *         this.content = new Content();
     *         this.footer = new Footer();
     *
     *         disposable.trackChild(this.header);
     *         disposable.trackChild(this.content);
     *         disposable.trackChild(this.footer);
     *         // 当 Panel 销毁时，三个子组件也会自动销毁
     *     }
     * }
     * ```
     *
     * **场景2：第三方库的封装**
     * ```javascript
     * class ChartWrapper extends Disposable {
     *     constructor() {
     *         super();
     *         this.chart = new ChartLibrary();  // 假设有 destroy() 方法
     *         this.tracker = new AnalyticsTracker();
     *
     *         this.trackChild(this.chart);
     *         this.trackChild(this.tracker);
     *     }
     * }
     * ```
     *
     * **场景3：定时器封装**
     * ```javascript
     * function createInterval(callback, ms) {
     *     const id = setInterval(callback, ms);
     *     return {
     *         destroy() { clearInterval(id); }
     *     };
     * }
     *
     * // 使用
     * disposable.trackChild(createInterval(updateData, 1000));
     * ```
     *
     ** 循环引用检测（当前未实现）：**
     * ⚠️ 如果 A.trackChild(B) 且 B.trackChild(A)，会导致无限递归销毁。
     * 当前实现假设用户不会创建循环引用。未来可考虑添加检测机制。
     *
     * @type {Array<{destroy(): void}>}
     *   - 空数组 []: 尚未注册任何子对象
     *   - 包含 N 个元素: 已注册 N 个子对象
     *   - destroy() 后重置为空数组 []
     *
     * @see trackChild() - 向此数组添加元素的方法
     * @see destroy() - 遍历并清空此数组的方法
     */
    #children = [];

    /**
     * 公共 getter - 查询对象是否已经被销毁
     *
     ** 🎯 用途：**
     * 提供对外暴露的只读接口，用于判断 Disposable 实例是否仍可使用。
     * 外部代码可以在尝试注册资源前检查此属性，避免无效操作。
     *
     ** 使用场景：**
     * ```javascript
     * if (!disposable.isDisposed) {
     *     // 安全地注册新资源
     *     disposable.trackEvent(el, 'click', handler);
     * } else {
     *     console.warn('Disposable 已销毁，无法注册资源');
     *     // 应该创建新的 Disposable 实例
     * }
     * ```
     *
     ** 返回值的含义：**
     * - **false**: 对象处于活跃状态，可以正常使用所有功能
     * - **true**: 对象已被销毁，不应再使用（除了查询此属性）
     *
     ** 性能特点：**
     * - O(1) 时间复杂度（直接读取私有字段）
     * - 无计算开销
     * - 可频繁调用（如在循环中检查）
     *
     * @type {boolean}
     *   - false: 对象未被销毁（默认初始状态）
     *   - true: 对象已被 destroy() 销毁（不可逆）
     *
     * @see #disposed - 内部状态字段
     * @see destroy() - 设置此标志的方法
     */
    get isDisposed() {
        return this.#disposed;
    }

    /**
     * 公共方法 - 注册事件监听器并跟踪其生命周期（自动化管理的核心API）
     *
     ** 🎯 核心目的：**
     * 将 `addEventListener` 的调用记录到内部列表中，
     * 使得在 `destroy()` 时能够**自动**调用对应的 `removeEventListener`。
     * 这是 Disposable 最常用、最核心的功能。
     *
     ** 执行流程：**
     * ```
     * 接收参数 (target, type, handler, options)
     *    ↓
     * 前置条件检查:
     *   this.#disposed === true?
     *   ├── 是 → 直接返回（静默忽略，防止泄漏注册）
     *   └── 否 ↓
     * 步骤1: 注册到浏览器
     *   target.addEventListener(type, handler, options)
     *    ↓
     * 步骤2: 记录到内部列表
     *   this.#eventListeners.push({ target, type, handler, options })
     *    ↓
     * 完成（等待未来 destroy() 时自动清理）
     * ```
     *
     ** 参数详解：**
     *
     * @param {EventTarget} target - 事件监听的目标对象
     *   可以是以下类型之一：
     *   - **Element**: DOM 元素（div, button, input 等）
     *   - **Document**: document 全局对象
     *   - **Window**: window 全局对象
     *   - **EventTarget**: 其他实现了 EventTarget 接口的对象
     *   - **ShadowRoot**: Shadow DOM 的根节点
     *
     *   示例：
     *   ```javascript
     *   disposable.trackEvent(element, 'click', handler);           // DOM 元素
     *   disposable.trackEvent(document, 'keydown', handleKey);      // 文档级别
     *   disposable.trackEvent(window, 'resize', handleResize);      // 窗口事件
     *   disposable.trackEvent(shadowRoot, 'slotchange', handleSlot); // Shadow DOM
     *   ```
     *
     * @param {string} type - 要监听的事件类型
     *   - DOM 事件名称：'click', 'input', 'change', 'keydown', 'keyup' 等
     *   - 自定义事件名称：'my-custom-event'（需配合 CustomEvent 使用）
     *   - 注意：不要带 'on' 前缀（是 'click' 不是 'onclick'）
     *
     * @param {Function|EventListener} handler - 事件处理函数
     *   - 普通函数：`function handleClick(e) { ... }`
     *   - 箭头函数：`(e) => { ... }`
     *   - 对象形式：`{ handleEvent(e) { ... } }`（较少用）
     *   - 重要：必须是**同一个函数引用**才能正确移除
     *
     * @param {boolean|AddEventListenerOptions} [options] - 可选的事件监听选项
     *   - **undefined/false**: 默认行为（冒泡阶段触发）
     *   - **true / { capture: true }: 在捕获阶段触发
     *   - **{ passive: true }**: 声明不会调用 preventDefault()（性能优化）
     *   - **{ once: true }: 只触发一次后自动移除
     *   - **{ signal: abortSignal }: 通过 AbortController 取消监听
     *
     *   示例：
     *   ```javascript
     *   // 滚动性能优化
     *   disposable.trackEvent(element, 'scroll', handleScroll, { passive: true });
     *
     *   // 捕获阶段监听
     *   disposable.trackEvent(parent, 'click', handleClick, true);
     *
     *   // 只触发一次
     *   disposable.trackEvent(button, 'click', showTooltip, { once: true });
     *   ```
     *
     ** 使用示例（完整流程）：**
     * ```javascript
     * class MyWidget {
     *     constructor(container) {
     *         this.disposable = new Disposable();
     *         this.element = container.querySelector('.widget');
     *
     *         // 注册多个事件监听器
     *         this.disposable.trackEvent(this.element, 'click', this.handleClick);
     *         this.disposable.trackEvent(this.element, 'mouseenter', this.handleHover);
     *         this.disposable.trackEvent(window, 'resize', this.handleResize);
     *         this.disposable.trackEvent(document, 'keydown', this.handleKeydown,
     *             { capture: true }  // 捕获阶段
     *         );
     *     }
     *
     *     destroy() {
     *         // 一行代码清理所有事件监听器
     *         this.disposable.destroy();
     *         // 此时所有上面注册的事件监听器都已被移除
     *     }
     * }
     * ```
     *
     ** 与手动管理的对比：**
     * ```javascript
     * // ❌ 传统方式（容易遗漏）
     * class BadWidget {
     *     constructor() {
     *         this.handleClick = () => { ... };
     *         this.element.addEventListener('click', this.handleClick);
     *         // 如果忘记在 destroy 中移除 → 内存泄漏！
     *     }
     *     destroy() {
     *         // 容易漏掉某个 removeEventListener
     *         this.element.removeEventListener('click', this.handleClick);
     *     }
     * }
     *
     * // ✅ Disposable 方式（自动管理）
     * class GoodWidget {
     *     constructor() {
     *         this.disposable = new Disposable();
     *         this.disposable.trackEvent(this.element, 'click', this.handleClick);
     *         // 无需手动记住要移除什么
     *     }
     *     destroy() {
     *         this.disposable.destroy();  // 自动清理所有
     *     }
     * }
     * ```
     *
     ** ⚠️ 注意事项：**
     * - handler 必须是稳定的引用（避免每次创建新箭头函数）
     * - 如果使用 once: true，事件触发后会自动移除，但 destroy() 再次移除也不会报错
     * - 已销毁后调用此方法会静默忽略（不会抛出异常）
     * - 不要混用手动的 addEventListener 和 trackEvent（可能导致重复移除错误）
     *
     * @returns {void}
     *
     * @see destroy() - 自动移除所有已注册监听器的方法
     * @see #eventListeners - 存储监听器信息的内部数组
     */
    trackEvent(target, type, handler, options) {
        if (this.#disposed) return;
        target.addEventListener(type, handler, options);
        this.#eventListeners.push({ target, type, handler, options });
    }

    /**
     * 公共方法 - 注册子对象以实现级联销毁（父子关系管理）
     *
     ** 🎯 核心目的：**
     * 建立**父子拥有关系**，使得当父对象被销毁时，
     * 所有注册的子对象也会**自动递归销毁**。
     * 用于管理复杂的对象依赖图，确保没有孤立的资源残留。
     *
     ** 执行流程：**
     * ```
     * 接收参数 (disposable)
     *    ↓
     * 前置条件检查:
     *   this.#disposed === true?
     *   ├── 是 → 直接返回（静默忽略）
     *   └── 否 ↓
     * 添加到子对象列表:
     *   this.#children.push(disposable)
     *    ↓
     * 完成（等待未来 destroy() 时自动调用 disposable.destroy()）
     * ```
     *
     * @param {{destroy(): void}} disposable - 要注册的子对象
     *
     **接口要求（Duck Typing）：**
     * 子对象**必须**实现 `destroy()` 方法：
     * ```javascript
     * {
     *     destroy(): void  // 无参数，无返回值（或返回值被忽略）
     * }
     * ```
     *
     **典型的子对象类型：**
     * 1. **Disposable 实例**（最常见）
     * 2. **WebComponent 实例**（如果实现了 destroy()）
     * 3. **第三方库的对象**（如 Chart.js, Three.js 等的实例）
     * 4. **自定义包装对象**（如定时器包装器）
     *
     **使用示例：**
     *
     * **示例1：管理多个 Disposable 子对象**
     * ```javascript
     * class Container {
     *     constructor() {
     *         this.parent = new Disposable();
     *
     *         // 创建并注册多个子对象
     *         this.child1 = new Disposable();
     *         this.child2 = new Disposable();
     *         this.child3 = new Disposable();
     *
     *         this.parent.trackChild(this.child1);
     *         this.parent.trackChild(this.child2);
     *         this.parent.trackChild(this.child3);
     *
     *         // 子对象也可以有自己的子对象（形成树形结构）
     *         this.grandchild = new Disposable();
     *         this.child2.trackChild(this.grandchild);
     *     }
     *
     *     cleanup() {
     *         this.parent.destroy();
     *         // 自动销毁:
     *         //   → child1.destroy()
     *         //   → child2.destroy() → grandchild.destroy()（递归）
     *         //   → child3.destroy()
     *     }
     * }
     * ```
     *
     * **示例2：管理第三方库的资源**
     * ```javascript
     * class Visualization {
     *     constructor(canvasElement) {
     *         this.disposable = new Disposable();
     *
     *         // 创建图表实例（假设有 destroy 方法）
     *         this.chart = new Chart(canvasElement, config);
     *
     *         // 创建动画控制器
     *         this.animation = new AnimationController();
     *
     *         // 注册到 Disposable
     *         this.disposable.trackChild(this.chart);
     *         this.disposable.trackChild(this.animation);
     *     }
     *
     *     destroy() {
     *         this.disposable.destroy();
     *         // chart.destroy() 和 animation.destroy() 都会被自动调用
     *     }
     * }
     * ```
     *
     * **示例3：定时器的优雅封装**
     * ```javascript
     * function createTrackedTimer(disposable, callback, interval) {
     *     const timerId = setInterval(callback, interval);
     *
     *     // 创建符合 Disposable 接口的包装对象
     *     const timerWrapper = {
     *         get id() { return timerId; },
     *         destroy() {
     *             clearInterval(timerId);
     *             console.log('Timer destroyed:', timerId);
     *         }
     *     };
     *
     *     // 注册到 Disposable
     *     disposable.trackChild(timerWrapper);
     *
     *     return timerWrapper;  // 返回以便后续可能的操作
     * }
     *
     * // 使用
     * const disposable = new Disposable();
     * const timer = createTrackedTimer(disposable, updateData, 1000);
     *
     * // 销毁时自动清除定时器
     * disposable.destroy();  // → timer.destroy() → clearInterval(id)
     * ```
     *
     ** 与 trackEvent 的区别：**
     * | 特征 | trackEvent | trackChild |
     * |------|-----------|------------|
     * | **管理对象** | 事件监听器 | 具有 destroy() 方法的对象 |
     * | **清理方式** | removeEventListener | 调用对象的 destroy() |
     * | **层级支持** | 扁平（单层） | 支持嵌套（树状） |
     * | **典型用途** | DOM 交互 | 组件/模块/资源管理 |
     *
     ** ⚠️ 注意事项：**
     * - 子对象的 destroy() 方法不应抛出异常（会中断后续的销毁流程）
     * - 避免循环引用（A.trackChild(B) + B.trackChild(A)）→ 导致无限递归
     * - 已销毁后调用此方法会静默忽略
     * - 同一个子对象可以被注册多次（但通常没必要）
     *
     * @returns {void}
     *
     * @see destroy() - 自动销毁所有已注册子对象的方法
     * @see #children - 存储子对象引用的内部数组
     */
    trackChild(disposable) {
        if (this.#disposed) return;
        this.#children.push(disposable);
    }

    /**
     * 公共方法 - 销毁对象及其所有管理的资源（幂等的最终清理入口）
     *
     ** 🎯 核心目的：**
     * 作为对象生命周期的终点，一次性清理所有通过 trackEvent/trackChild 注册的资源。
     * 这是 Disposable 类最关键的方法，提供了**自动化、安全、完整**的资源释放机制。
     *
     ** 设计原则：**
     * - **幂等性（Idempotent）**: 多次调用结果相同，不会产生副作用
     * - **原子性（Atomic）**: 要么全部清理成功，要么全部失败（当前实现简化版）
     * - **完整性（Complete）**: 清理所有类型的资源（事件 + 子对象 + 特有资源）
     * - **安全性（Safe）**: 即使清理过程中出错也尽量继续（try-catch 未实现但建议）
     *
     ** 执行流程（5个阶段）：**
     *
     * **阶段1：状态标记（防重入）**
     * ```javascript
     * if (this.#disposed) return;  // 幂等检查
     * this.#disposed = true;       // 标记为已销毁
     * ```
     * - 立即设置标志，阻止后续的 trackEvent/trackChild 调用
     * - 后续的 destroy() 调用会在第一行就返回
     *
     * **阶段2：原型链遍历（调用所有 onDestroy 钩子）**
     * ```javascript
     * let proto = Object.getPrototypeOf(this);
     * while (proto && proto !== Disposable.prototype) {
     *     if (proto.hasOwnProperty("onDestroy")) {
     *         proto.onDestroy.call(this);  // 调用每个层级定义的 onDestroy
     *     }
     *     proto = Object.getPrototypeOf(proto);  // 向上遍历原型链
     * }
     * ```
     * - 从子类开始，向上到父类，最后到 Disposable 基类
     * - 确保每一层继承都有机会清理自己的特有资源
     * - **注意**：不会调用 Disposable.prototype.onDestroy（基类的空实现）
     *
     * **为什么使用原型链遍历而非简单的 super.onDestroy()？**
     * 因为 JavaScript 的多层级继承中，super 只能调用直接父类。
     * 如果有 A → B → C → Disposable 的继承链：
     * - C.onDestroy() 中 super.onDestroy() 只能调用 B.onDestroy()
     * - B.onDestroy() 中 super.onDestroy() 调用 A.onDestroy()
     * - A.onDestroy() 中 super.onDestroy() 调用 Disposable.onDestroy()
     * - 这样虽然也能工作，但要求每层都必须正确调用 super
     * - 原型链遍历更健壮：即使某层忘记调 super，上层仍会被调用
     *
     * **阶段3：批量移除事件监听器**
     * ```javascript
     * for (const { target, type, handler, options } of this.#eventListeners) {
     *     target.removeEventListener(type, handler, options);
     * }
     * this.#eventListeners.length = 0;  // 清空数组
     * ```
     * - 遍历 #eventListeners 数组中的每个条目
     * - 使用保存的完整参数调用 removeEventListener
     * - 最后清空数组释放内存
     *
     * **阶段4：级联销毁子对象**
     * ```javascript
     * for (const child of this.#children) {
     *     child.destroy();  // 递归调用每个子对象的 destroy()
     * }
     * this.#children.length = 0;  // 清空数组
     * ```
     * - 遍历 #children 数组中的每个子对象
     * - 调用子对象的 destroy()（可能触发子对象的子对象销毁...）
     * - 形成递归的树状销毁过程
     * - 最后清空数组释放内存
     *
     * **阶段5：完成**
     * - 所有资源已释放
     * - 内部数组已清空
     * - 对象标记为已销毁
     * - 不应再被使用（除 isDisposed 查询外）
     *
     ** 销毁顺序的重要性：**
     * ```
     * 正确顺序（当前实现）:
     *   ① 先调用 onDestroy()（子类清理特有资源）
     *   ② 再移除事件监听器（停止接收外部输入）
     *   ③ 最后销毁子对象（清理依赖关系）
     *
     * 为什么是这个顺序？
     * - onDestroy 可能需要访问某些状态来决定如何清理
     * - 事件监听器可能在清理过程中触发回调（应先移除）
     * - 子对象可能依赖于父对象的某些服务（应最后销毁）
     * ```
     *
     ** 完整的使用示例：**
     * ```javascript
     * class DataService extends Disposable {
     *     #ws = null;          // WebSocket 连接
     *     #timer = null;      // 心跳定时器
     *     #cache = new Map(); // 数据缓存
     *
     *     constructor(url) {
     *         super();
     *         this.#ws = new WebSocket(url);
     *         this.#timer = setInterval(() => this.#heartbeat(), 30000);
     *
     *         // 注册事件监听器
     *         this.trackEvent(this.#ws, 'message', this.#handleMessage);
     *         this.trackEvent(this.#ws, 'close', this.#handleClose);
     *         this.trackEvent(this.#ws, 'error', this.#handleError);
     *
     *         // 注册定时器（包装成对象）
     *         this.trackChild({
     *             destroy: () => {
     *                 clearInterval(this.#timer);
     *                 this.#timer = null;
     *             }
     *         });
     *     }
     *
     *     // 子类特有的清理逻辑
     *     onDestroy() {
     *         // 关闭 WebSocket 连接
     *         if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
     *             this.#ws.close(1000, 'Service shutting down');
     *         }
     *         this.#ws = null;
     *
     *         // 清理缓存数据
     *         this.#cache.clear();
     *         console.log('DataService resources cleaned up');
     *     }
     * }
     *
     * // 使用
     * const service = new DataService('wss://api.example.com');
     * // ... 使用 service ...
     *
     * // 销毁时自动执行:
     * // 1. service.onDestroy() → 关闭 WebSocket + 清理缓存
     * // 2. 移除 ws 的 message/close/error 事件监听器
     * // 3. 销毁定时器包装对象 → clearInterval
     * service.destroy();
     * ```
     *
     ** 错误处理策略（当前实现）：**
     * - **未使用 try-catch**：如果某个 onDestroy 或 child.destroy() 抛出异常，
     *   会中断后续的清理步骤。这是为了简化实现和保持性能。
     * - **建议改进**：未来可考虑添加 try-catch 并收集错误，
     *   在所有清理完成后统一报告，确保"尽力而为"的清理。
     *
     ** 性能特征：**
     * - 时间复杂度：O(N + M)，N=事件监听器数量，M=子对象数量
     * - 内存占用：销毁后释放所有内部数组的内存（~0 bytes）
     * - 执行速度：通常 < 1ms（除非有大量资源或子对象销毁很慢）
     *
     ** ⚠️ 注意事项：**
     * - 此方法是**最终入口**，子类不应覆写它（应覆写 onDestroy）
     * - 销毁后对象处于不稳定状态，不应再访问任何属性或方法
     * - 如果需要在销毁前做些准备，应在其他方法中调用 destroy()
     * - 循环引用的子对象会导致无限递归（栈溢出），应避免
     *
     * @returns {void}
     *
     * @see isDisposed - 查询是否已销毁
     * @see onDestroy() - 子类覆写的清理钩子
     * @see trackEvent() - 注册事件监听器
     * @see trackChild() - 注册子对象
     */
    destroy() {
        if (this.#disposed) return;
        this.#disposed = true;

        let proto = Object.getPrototypeOf(this);
        while (proto && proto !== Disposable.prototype) {
            if (proto.hasOwnProperty("onDestroy")) {
                proto.onDestroy.call(this);
            }
            proto = Object.getPrototypeOf(proto);
        }

        for (const { target, type, handler, options } of this.#eventListeners) {
            target.removeEventListener(type, handler, options);
        }
        this.#eventListeners.length = 0;

        for (const child of this.#children) {
            child.destroy();
        }
        this.#children.length = 0;
    }

    /**
     * 子类钩子方法 - 销毁时的自定义清理逻辑（可选覆写）
     *
     ** 🎯 核心目的：**
     * 提供给子类的扩展点，用于释放**无法通过 trackEvent/trackChild 管理的特有资源**。
     * 这是 Disposable 的"模板方法模式"（Template Method Pattern）实现。
     *
     ** 调用时机：**
     * 由 `destroy()` 在**阶段2**（移除事件监听器和子对象之前）自动调用。
     * 调用顺序遵循原型链从子类到父类（详见 destroy() 文档的阶段2说明）。
     *
     ** 适用场景（需要在此清理的资源）：**
     *
     * **1. 原生 API 的清理：**
     * ```javascript
     * class WebSocketService extends Disposable {
     *     #ws = null;
     *
     *     constructor(url) {
     *         super();
     *         this.#ws = new WebSocket(url);
     *         this.trackEvent(this.#ws, 'message', this.handleMessage);
     *     }
     *
     *     onDestroy() {
     *         // 关闭 WebSocket 连接（无法通过 trackEvent 管理）
     *         if (this.#ws) {
     *             this.#ws.close(1000, 'Service shutdown');
     *             this.#ws = null;
     *         }
     *     }
     * }
     * ```
     *
     * **2. 全局状态的清理：**
     * ```javascript
     * class GlobalEventManager extends Disposable {
     *     static #instances = new Set();
     *
     *     constructor() {
     *         super();
     *         GlobalEventManager.#instances.add(this);
     *     }
     *
     *     onDestroy() {
     *         // 从全局注册表中移除自己
     *         GlobalEventManager.#instances.delete(this);
     *     }
     * }
     * ```
     *
     * **3. 大量数据的释放：**
     * ```javascript
     * class DataCache extends Disposable {
     *     #data = null;
     *     #index = null;
     *
     *     constructor() {
     *         super();
     *         this.#data = new Array(1000000).fill(0);  // 大数组
     *         this.#index = new Map();                   // 大索引
     *     }
     *
     *     onDestroy() {
     *         // 释放大块内存
     *         this.#data = null;
     *         this.#index = null;
     *         // 这些赋值帮助 GC 更快回收内存
     *     }
     * }
     * ```
     *
     * **4. 取消异步操作：**
     * ```javascript
     * class DataLoader extends Disposable {
     *     #abortController = null;
     *
     *     async load(url) {
     *         this.#abortController = new AbortController();
     *         try {
     *             const response = await fetch(url, {
     *                 signal: this.#abortController.signal
     *             });
     *             return await response.json();
     *         } catch (e) {
     *             if (e.name === 'AbortError') {
     *                 console.log('Request cancelled');
     *             }
     *         }
     *     }
     *
     *     onDestroy() {
     *         // 取消进行中的网络请求
     *         if (this.#abortController) {
     *             this.#abortController.abort();
     *             this.#abortController = null;
     *         }
     *     }
     * }
     * ```
     *
     * **5. 通知观察者/依赖者：**
     * ```javascript
     * class Subject extends Disposable {
     *     #observers = new Set();
     *
     *     subscribe(observer) {
     *         this.#observers.add(observer);
     *     }
     *
     *     onDestroy() {
     *         // 通知所有观察者自己即将销毁
     *         for (const observer of this.#observers) {
     *             observer.onSubjectDestroyed?.(this);
     *         }
     *         this.#observers.clear();
     *     }
     * }
     * ```
     *
     ** 与 trackEvent/trackChild 的分工：**
     * | 资源类型 | 使用方式 |
     * |---------|---------|
     * | DOM 事件监听器 | trackEvent()（自动管理）|
     * | 具有 destroy() 的子对象 | trackChild()（自动管理）|
     * | WebSocket/IndexedDB/FileReader | onDestroy()（手动清理）|
     * | 全局变量/单例引用 | onDestroy()（手动清理）|
     * | 大块内存/缓存数据 | onDestroy()（手动释放）|
     * | 异步操作（fetch/Animation） | onDestroy()（手动取消）|
     *
     ** ⚠️ 重要注意事项：**
     * - **不要在此方法中抛出异常**！会中断 destroy() 的后续清理步骤
     * - **不要在此方法中调用 destroy()**！会导致无限递归
     * - **不要假设此方法只会被调用一次**（虽然通常如此）
     * - **不要依赖 this 的某些属性**（它们可能已被部分清理）
     * - **保持方法简洁快速**（不要有耗时操作如网络请求）
     *
     ** 错误处理建议：**
     * 如果清理逻辑可能失败，应该自行 try-catch：
     * ```javascript
     * onDestroy() {
     *     try {
     *         // 可能失败的操作
     *         this.riskyResource.cleanup();
     *     } catch (error) {
     *         console.error('Cleanup failed:', error);
     *         // 不要 rethrow，让 destroy() 继续执行
     *     }
     * }
     * ```
     *
     ** 默认实现（基类）：**
     * Disposable.prototype.onDestroy 是空函数（no-op），
     * 如果子类没有特有资源需要清理，可以不覆写此方法。
     *
     * @returns {void}
     *
     * @see destroy() - 调用此钩子的地方
     * @see trackEvent() - 用于标准事件监听器的注册
     * @see trackChild() - 用于标准子对象的注册
     */
    onDestroy() {}
}
