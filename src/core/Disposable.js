/**
 * Disposable — 基础生命周期基类
 *
 * 提供统一的 destroy() 生命周期管理：
 * - trackEvent(): 注册事件监听器，destroy 时自动移除
 * - trackChild(): 注册子 Disposable，父级 destroy 时级联销毁
 * - destroy(): 幂等销毁入口（final 模式，子类不应覆写）
 * - onDestroy(): 子类覆写钩子，释放特有资源
 */
export class Disposable {
    #disposed = false;
    #eventListeners = []; // { target, type, handler, options? }
    #children = []; // 子 Disposable（级联销毁）

    get isDisposed() {
        return this.#disposed;
    }

    /**
     * 注册事件监听器，destroy 时自动移除
     * 替代直接调用 target.addEventListener()
     * @param {EventTarget} target - 事件目标
     * @param {string} type - 事件类型
     * @param {Function} handler - 事件处理器
     * @param {boolean|object} [options] - addEventListener 选项
     */
    trackEvent(target, type, handler, options) {
        if (this.#disposed) return;
        target.addEventListener(type, handler, options);
        this.#eventListeners.push({ target, type, handler, options });
    }

    /**
     * 注册子 Disposable，父级 destroy 时级联销毁
     * 用于建立父子关系，如 RenderEngine → ScrollManager
     * @param {Disposable} disposable - 子对象
     */
    trackChild(disposable) {
        if (this.#disposed) return;
        this.#children.push(disposable);
    }

    /**
     * 统一的销毁入口（final 模式，子类不应覆写）
     * 幂等设计：重复调用安全
     */
    destroy() {
        if (this.#disposed) return;
        this.#disposed = true;

        // 子类钩子：在事件清理和子对象销毁之前调用
        this.onDestroy();

        // 移除所有跟踪的事件监听器
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
     * 子类覆写：释放特有资源
     * 类似 React 的 componentWillUnmount
     * 在事件监听器移除和子对象销毁之前调用
     */
    onDestroy() {}
}
