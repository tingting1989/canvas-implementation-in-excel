# Web Components 生命周期陷阱分析与解决方案

## 🚨 问题分析：disconnectedCallback ≠ 销毁

### 核心陷阱

**Web Components 的 `disconnectedCallback` 不是"销毁"，而是"暂时离开 DOM"！**

### 触发场景分析

| 场景 | 是否触发 disconnectedCallback | 是否应该销毁 | 问题 |
|------|------------------------------|-------------|------|
| **用户切换工作表**<br>(SheetTab 被移除) | ✅ 是 | ✅ 是 | 无问题 |
| **用户拖拽排序**<br>(元素从 DOM 移除后重新插入) | ✅ 是 | ❌ 否 | ⚠️ **错误销毁** |
| **路由切换**<br>(SPA 导航离开再回来) | ✅ 是 | ❌ 否 | ⚠️ **错误销毁** |
| **appendChild 移动**<br>(元素从一个容器移到另一个) | ✅ 是 | ❌ 否 | ⚠️ **错误销毁** |
| **display: none** | ❌ 否 | ❌ 否 | 无问题 |
| **父元素隐藏** | ❌ 否 | ❌ 否 | 无问题 |

### 陷阱后果

```javascript
// ❌ 错误的继承方案
class SheetTabElement extends Disposable {
    disconnectedCallback() {
        this.destroy(); // 💀 陷阱！
    }
}

// 场景：拖拽排序
// 1. 用户拖拽 SheetTab
// 2. 元素从 DOM 移除 → disconnectedCallback → destroy() → 资源清理
// 3. 元素重新插入 DOM → connectedCallback
// 4. 但 this.#disposed === true
// 5. trackEvent() 不注册事件（因为已 disposed）
// 6. 组件变成"僵尸"——存在但不响应事件 💀
```

---

## 📊 方案对比

### 方案 1：继承 Disposable（❌ 错误方案）

```javascript
// ❌ 错误：继承 Disposable
export class WebComponent extends Disposable {
    disconnectedCallback() {
        this.destroy(); // 陷阱！
    }
}
```

**问题**：
- ❌ 无法区分"临时离开"和"真正销毁"
- ❌ 拖拽、路由切换会导致"僵尸组件"
- ❌ 组件重新插入后无法正常工作

---

### 方案 2：组合 Disposable（✅ 推荐方案）

```javascript
// ✅ 正确：组合 Disposable
export class WebComponent extends HTMLElement {
    #disposable = null;
    #connected = false;

    connectedCallback() {
        if (this.#connected) return; // 防止重复连接
        this.#connected = true;
        
        // 每次连接都创建新的 Disposable
        this.#disposable = new Disposable();
        this.onConnect(this.#disposable);
    }

    disconnectedCallback() {
        if (!this.#connected) return;
        this.#connected = false;
        
        // 清理当前 Disposable
        this.onDisconnect();
        this.#disposable?.destroy();
        this.#disposable = null;
    }

    // 子类覆写：接收 disposable 参数
    onConnect(disposable) {
        // 使用 disposable.trackEvent() 注册事件
    }

    onDisconnect() {
        // 清理特有资源
    }
}
```

**优点**：
- ✅ 每次连接都创建新的 Disposable，确保事件能正常注册
- ✅ 防止重复连接/断开
- ✅ 组合优于继承，更灵活
- ✅ 解决"僵尸组件"问题

**缺点**：
- ⚠️ 需要明确区分"临时离开"和"真正销毁"
- ⚠️ 需要处理多次连接/断开的场景
- ⚠️ 需要考虑性能（频繁创建/销毁 Disposable）

---

### 方案 3：显式销毁标记（✅ 最佳方案）

```javascript
// ✅ 最佳：显式销毁标记
export class WebComponent extends HTMLElement {
    #disposable = null;
    #connected = false;
    #shouldDestroy = false; // 显式销毁标记

    connectedCallback() {
        if (this.#connected) return;
        this.#connected = true;
        
        // 每次连接都创建新的 Disposable
        this.#disposable = new Disposable();
        this.onConnect(this.#disposable);
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

    // 显式销毁方法（父组件调用）
    destroy() {
        this.#shouldDestroy = true;
        this.remove(); // 触发 disconnectedCallback
    }

    // 子类覆写
    onConnect(disposable) {}
    onDisconnect() {}
}
```

**优点**：
- ✅ 明确区分"临时离开"和"真正销毁"
- ✅ 拖拽、路由切换不会错误销毁
- ✅ 父组件显式控制销毁时机
- ✅ 最安全、最可控

---

## 🎯 推荐方案实现

### 最终方案：组合 + 显式销毁标记

```javascript
// src/core/WebComponent.js
import { Disposable } from "./Disposable.js";

/**
 * WebComponent — Web Components 基类（组合 Disposable）
 * 
 * 解决 disconnectedCallback 陷阱：
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
        
        // 每次连接都创建新的 Disposable
        this.#disposable = new Disposable();
        this.onConnect(this.#disposable);
        
        // 触发首次渲染
        this.render();
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
        if (oldValue !== newValue && this.#connected) {
            this.render();
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
```

---

## 📋 使用指南

### 1. 子类实现

```javascript
// src/ui/SheetTabElement.js
import { WebComponent } from "../core/WebComponent.js";

export class SheetTabElement extends WebComponent {
    static get observedAttributes() {
        return ['name', 'active', 'closable'];
    }

    // ✅ 接收 disposable 参数
    onConnect(disposable) {
        // 使用 disposable.trackEvent() 注册事件
        disposable.trackEvent(this.shadowRoot, 'click', this.#handleClick);
        
        // 注册其他事件
        disposable.trackEvent(this.shadowRoot, 'mouseenter', this.#handleMouseEnter);
        disposable.trackEvent(this.shadowRoot, 'mouseleave', this.#handleMouseLeave);
    }

    render() {
        const name = this.getAttribute('name') || '';
        const isActive = this.hasAttribute('active');
        
        this.shadowRoot.innerHTML = `
            <style>
                :host { /* 样式 */ }
            </style>
            <div class="tab ${isActive ? 'active' : ''}">
                ${this.escapeHtml(name)}
            </div>
        `;
    }

    #handleClick = (e) => {
        this.dispatchEvent(new CustomEvent('switch', {
            bubbles: true,
            detail: { name: this.getAttribute('name') }
        }));
    }

    #handleMouseEnter = () => {
        this.style.backgroundColor = '#ddd';
    }

    #handleMouseLeave = () => {
        this.style.backgroundColor = '';
    }

    onDisconnect() {
        console.log(`SheetTab [${this.getAttribute('name')}] destroyed`);
    }
}

customElements.define('sheet-tab', SheetTabElement);
```

### 2. 父组件使用

```javascript
// src/ui/SheetTabBar.js
import { DOMComponent } from "../core/DOMComponent.js";
import "./SheetTabElement.js";

export class SheetTabBar extends DOMComponent {
    #container = null;
    #tabs = new Map(); // 跟踪所有标签

    #createDOM(wrap) {
        this.#container = this.createElement('div', {
            className: 'cs-sheet-tab-bar'
        }, wrap);
    }

    refresh() {
        // ✅ 显式销毁旧标签
        for (const [name, tab] of this.#tabs) {
            tab.destroy(); // 触发 disconnectedCallback → 真正销毁
        }
        this.#tabs.clear();

        // 创建新标签
        for (const [name, sheet] of this.#workbook.sheets) {
            const tab = document.createElement('sheet-tab');
            tab.setAttribute('name', name);
            if (name === activeName) tab.setAttribute('active', '');
            
            this.#container.appendChild(tab);
            this.#tabs.set(name, tab);
        }
    }

    onDestroy() {
        // ✅ 显式销毁所有标签
        for (const [name, tab] of this.#tabs) {
            tab.destroy();
        }
        this.#tabs.clear();
        super.onDestroy();
    }
}
```

### 3. 拖拽场景处理

```javascript
// 拖拽排序场景
class DragDropManager {
    handleDragStart(tab) {
        // ✅ 不调用 destroy()，只是移除 DOM
        // disconnectedCallback 触发，但 shouldDestroy === false
        // 所以不会销毁 Disposable
        tab.remove();
    }

    handleDragEnd(tab, newContainer) {
        // ✅ 重新插入 DOM
        // connectedCallback 触发，创建新的 Disposable
        // 事件重新注册，组件正常工作
        newContainer.appendChild(tab);
    }
}
```

---

## 🧪 测试用例

```javascript
// tests/core/WebComponent.test.js
import { describe, it, expect, vi } from "vitest";
import { WebComponent } from "@/core/WebComponent.js";

describe("WebComponent 生命周期陷阱测试", () => {
    // 测试 WC-TRAP-01：拖拽场景
    it("WC-TRAP-01: 拖拽场景 — 移除后重新插入，组件正常工作", () => {
        class TestElement extends WebComponent {
            onConnect(disposable) {
                this.clickHandler = vi.fn();
                disposable.trackEvent(this.shadowRoot, 'click', this.clickHandler);
            }
        }
        customElements.define('test-element-trap01', TestElement);

        const container1 = document.createElement('div');
        const container2 = document.createElement('div');
        document.body.appendChild(container1);
        document.body.appendChild(container2);

        const el = document.createElement('test-element-trap01');
        container1.appendChild(el);

        // 第一次点击（正常）
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalledTimes(1);

        // 拖拽：移除 DOM（不调用 destroy）
        el.remove();
        expect(el.isConnected).toBe(false);
        expect(el.isDestroyed).toBe(false);

        // 重新插入 DOM
        container2.appendChild(el);
        expect(el.isConnected).toBe(true);

        // 第二次点击（应该正常工作）
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalledTimes(2); // ✅ 正常工作

        container1.remove();
        container2.remove();
    });

    // 测试 WC-TRAP-02：显式销毁
    it("WC-TRAP-02: 显式销毁 — destroy() 后组件不工作", () => {
        class TestElement extends WebComponent {
            onConnect(disposable) {
                this.clickHandler = vi.fn();
                disposable.trackEvent(this.shadowRoot, 'click', this.clickHandler);
            }
        }
        customElements.define('test-element-trap02', TestElement);

        const el = document.createElement('test-element-trap02');
        document.body.appendChild(el);

        // 第一次点击（正常）
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalledTimes(1);

        // 显式销毁
        el.destroy();
        expect(el.isDestroyed).toBe(true);

        // 尝试再次点击（不应该响应）
        // 注意：元素已从 DOM 移除，无法触发事件
        expect(el.clickHandler).toHaveBeenCalledTimes(1); // 只调用一次
    });

    // 测试 WC-TRAP-03：重复连接/断开
    it("WC-TRAP-03: 重复连接/断开 — 防止重复创建 Disposable", () => {
        class TestElement extends WebComponent {
            onConnect(disposable) {
                this.connectCount = (this.connectCount || 0) + 1;
            }
        }
        customElements.define('test-element-trap03', TestElement);

        const el = document.createElement('test-element-trap03');
        document.body.appendChild(el);
        expect(el.connectCount).toBe(1);

        // 移除后重新插入（不调用 destroy）
        el.remove();
        document.body.appendChild(el);
        expect(el.connectCount).toBe(2); // ✅ 重新连接

        // 再次移除后重新插入
        el.remove();
        document.body.appendChild(el);
        expect(el.connectCount).toBe(3); // ✅ 再次重新连接

        el.destroy();
    });

    // 测试 WC-TRAP-04：appendChild 移动
    it("WC-TRAP-04: appendChild 移动 — 不销毁 Disposable", () => {
        class TestElement extends WebComponent {
            onConnect(disposable) {
                this.clickHandler = vi.fn();
                disposable.trackEvent(this.shadowRoot, 'click', this.clickHandler);
            }
        }
        customElements.define('test-element-trap04', TestElement);

        const container1 = document.createElement('div');
        const container2 = document.createElement('div');
        document.body.appendChild(container1);
        document.body.appendChild(container2);

        const el = document.createElement('test-element-trap04');
        container1.appendChild(el);

        // 第一次点击（正常）
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalledTimes(1);

        // appendChild 移动（触发 disconnectedCallback + connectedCallback）
        container2.appendChild(el);
        expect(el.isConnected).toBe(true);
        expect(el.isDestroyed).toBe(false);

        // 第二次点击（应该正常工作）
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalledTimes(2); // ✅ 正常工作

        container1.remove();
        container2.remove();
    });

    // 测试 WC-TRAP-05：路由切换场景
    it("WC-TRAP-05: 路由切换 — 离开再回来，组件正常工作", () => {
        class TestElement extends WebComponent {
            onConnect(disposable) {
                this.clickHandler = vi.fn();
                disposable.trackEvent(this.shadowRoot, 'click', this.clickHandler);
            }
        }
        customElements.define('test-element-trap05', TestElement);

        const page1 = document.createElement('div');
        const page2 = document.createElement('div');
        document.body.appendChild(page1);
        document.body.appendChild(page2);

        const el = document.createElement('test-element-trap05');
        page1.appendChild(el);

        // 第一次点击（正常）
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalledTimes(1);

        // 路由切换：离开 page1（移除元素，不销毁）
        el.remove();
        expect(el.isConnected).toBe(false);
        expect(el.isDestroyed).toBe(false);

        // 路由切换：回到 page1（重新插入）
        page1.appendChild(el);
        expect(el.isConnected).toBe(true);

        // 第二次点击（应该正常工作）
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalledTimes(2); // ✅ 正常工作

        page1.remove();
        page2.remove();
    });
});
```

---

## 🎯 关键要点总结

### ✅ 正确理解 disconnectedCallback

| 触发场景 | 是否销毁 | 处理方式 |
|---------|---------|---------|
| **用户切换工作表** | ✅ 是 | 调用 `el.destroy()` |
| **拖拽排序** | ❌ 否 | 不调用 `destroy()`，只移除 DOM |
| **路由切换** | ❌ 否 | 不调用 `destroy()`，只移除 DOM |
| **appendChild 移动** | ❌ 否 | 自动处理，不销毁 |

### ✅ 使用组合而非继承

```javascript
// ❌ 错误：继承 Disposable
class WebComponent extends Disposable {
    disconnectedCallback() {
        this.destroy(); // 陷阱！
    }
}

// ✅ 正确：组合 Disposable
class WebComponent extends HTMLElement {
    #disposable = null;
    
    connectedCallback() {
        this.#disposable = new Disposable();
        this.onConnect(this.#disposable);
    }
    
    disconnectedCallback() {
        if (this.#shouldDestroy) {
            this.#disposable?.destroy();
        }
    }
}
```

### ✅ 显式销毁控制

```javascript
// 父组件显式销毁
tab.destroy(); // 触发 disconnectedCallback → 真正销毁

// 拖拽、路由切换只移除 DOM
tab.remove(); // 触发 disconnectedCallback → 不销毁
```

---

## 📚 参考资料

- [Web Components Lifecycle](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements#using_the_lifecycle_callbacks)
- [disconnectedCallback 陷阱讨论](https://github.com/WICG/webcomponents/issues/551)
- [组合优于继承](https://en.wikipedia.org/wiki/Composition_over_inheritance)

---

**文档版本**: v2.0  
**创建日期**: 2026-07-01  
**作者**: jiangsuiting 
**状态**: 已修正陷阱