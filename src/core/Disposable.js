/**
 * Disposable — 基础生命周期基类
 *
 * 提供统一的 destroy() 生命周期管理：
 * - trackEvent(): 注册事件监听器，destroy 时自动移除
 * - trackChild(): 注册子 Disposable，父级 destroy 时级联销毁
 * - destroy(): 幂等销毁入口（final 模式，子类不应覆写）
 * - onDestroy(): 子类覆写钩子，释放特有资源（无需手动 super.onDestroy()）
 *
 * 销毁顺序（destroy 内部）：
 * 1. 标记 #disposed = true
 * 2. 调用子类 onDestroy()（子类释放特有资源）
 * 3. 沿原型链自动调用所有父类的 onDestroy()
 * 4. 移除所有跟踪的事件监听器
 * 5. 级联销毁子对象
 */
export class Disposable {
    #disposed = false;
    #eventListeners = [];
    #children = [];

    get isDisposed() {
        return this.#disposed;
    }

    trackEvent(target, type, handler, options) {
        if (this.#disposed) return;
        target.addEventListener(type, handler, options);
        this.#eventListeners.push({ target, type, handler, options });
    }

    trackChild(disposable) {
        if (this.#disposed) return;
        this.#children.push(disposable);
    }

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

    onDestroy() {}
}
