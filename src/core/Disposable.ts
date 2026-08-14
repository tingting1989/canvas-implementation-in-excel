/**
 * 可销毁子对象接口
 *
 * 所有通过 trackChild 注册的子对象必须实现此接口，
 * 以支持级联销毁机制。
 */
export interface DisposableChild {
    destroy(): void;
}

/**
 * @private 私有接口 - 已注册事件监听器的完整信息
 *
 * 存储 addEventListener 的完整参数，确保 removeEventListener 时参数一致。
 */
interface TrackedEvent {
    target: EventTarget;
    type: string;
    handler: EventListenerOrEventListenerObject;
    options?: boolean | AddEventListenerOptions;
}

/**
 * Disposable — 基础生命周期资源管理类（组合模式的核心组件）
 *
 * 提供统一的、自动化的资源生命周期管理机制，解决 JavaScript 中常见的内存泄漏问题。
 * 通过"注册-追踪-自动清理"模式，确保所有资源在对象销毁时被正确释放。
 *
 * 核心能力：
 * - `trackEvent()`: 注册事件监听器，destroy 时自动 removeEventListener
 * - `trackChild()`: 注册子对象（需实现 destroy 方法），父级 destroy 时级联销毁
 * - `destroy()`: 幂等销毁入口（多次调用安全）
 * - `onDestroy()`: 子类覆写钩子，释放特有资源（自动沿原型链调用）
 *
 * 销毁顺序：标记 disposed → 沿原型链调用 onDestroy → 移除事件监听器 → 级联销毁子对象
 *
 * @example
 * const disposable = new Disposable();
 * disposable.trackEvent(document, 'click', handleClick);
 * disposable.trackChild({ destroy() { clearInterval(timerId); } });
 * disposable.destroy(); // 自动清理所有资源
 */
export class Disposable {
    /**
     * @private 私有字段 - 是否已销毁的状态标志（幂等性保障）
     *
     * - false: 对象处于活跃状态，可正常使用
     * - true: 对象已被销毁，后续操作将被拒绝（不可逆）
     */
    #disposed = false;

    /**
     * @private 私有字段 - 已注册的事件监听器列表
     *
     * 存储所有通过 trackEvent 注册的事件监听器完整信息，
     * 以便在 destroy 时精确调用 removeEventListener。
     */
    #eventListeners: TrackedEvent[] = [];

    /**
     * @private 私有字段 - 已注册的子对象列表（级联销毁的核心数据结构）
     *
     * 存储所有通过 trackChild 注册的子对象引用，
     * 在 destroy 时递归调用每个子对象的 destroy() 方法。
     */
    #children: DisposableChild[] = [];

    /**
     * 查询对象是否已经被销毁
     *
     * @returns {boolean} true 表示已销毁，false 表示仍可使用
     */
    get isDisposed(): boolean {
        return this.#disposed;
    }

    /**
     * 注册事件监听器并跟踪其生命周期
     *
     * 将 addEventListener 的调用记录到内部列表，destroy 时自动 removeEventListener。
     *
     * @param {EventTarget} target - 事件监听的目标对象（Element, Document, Window 等）
     * @param {string} type - 事件类型（'click', 'input', 'keydown' 等）
     * @param {EventListenerOrEventListenerObject} handler - 事件处理函数（必须是稳定引用）
     * @param {boolean|AddEventListenerOptions} [options] - 事件监听选项（capture, passive 等）
     * @returns {void}
     */
    trackEvent(target: EventTarget, type: string, handler: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
        if (this.#disposed) return;
        target.addEventListener(type, handler, options);
        this.#eventListeners.push({ target, type, handler, options });
    }

    /**
     * 注册子对象以实现级联销毁
     *
     * 建立父子拥有关系，父对象销毁时自动递归销毁所有子对象。
     *
     * @param {DisposableChild} disposable - 要注册的子对象（必须实现 destroy() 方法）
     * @returns {void}
     */
    trackChild(disposable: DisposableChild): void {
        if (this.#disposed) return;
        this.#children.push(disposable);
    }

    /**
     * 销毁对象及其所有管理的资源（幂等的最终清理入口）
     *
     * 执行流程：
     * 1. 设置 #disposed = true（防重入）
     * 2. 遍历原型链，调用所有父类的 onDestroy()
     * 3. 批量移除所有事件监听器
     * 4. 级联销毁所有子对象
     * 5. 清空内部数组
     *
     * 子类不应覆写此方法，应覆写 onDestroy() 钩子。
     *
     * @returns {void}
     */
    destroy(): void {
        if (this.#disposed) return;
        this.#disposed = true;

        // 沿原型链调用所有 onDestroy（子类 → 父类，无需手动 super.onDestroy()）
        let proto = Object.getPrototypeOf(this);
        while (proto && proto !== Disposable.prototype) {
            if (proto.hasOwnProperty("onDestroy")) {
                proto.onDestroy.call(this);
            }
            proto = Object.getPrototypeOf(proto);
        }

        // 批量移除事件监听器
        for (const { target, type, handler, options } of this.#eventListeners) {
            target.removeEventListener(type, handler, options);
        }
        this.#eventListeners.length = 0;

        // 级联销毁子对象
        for (const child of this.#children) {
            child.destroy();
        }
        this.#children.length = 0;
    }

    /**
     * 子类钩子方法 - 销毁时的自定义清理逻辑（可选覆写）
     *
     * 用于释放无法通过 trackEvent/trackChild 管理的特有资源，
     * 如 WebSocket 连接、全局状态、大型数据等。
     * 无需手动调用 super.onDestroy()，基类会沿原型链自动调用。
     *
     * @returns {void}
     */
    onDestroy(): void {}
}
