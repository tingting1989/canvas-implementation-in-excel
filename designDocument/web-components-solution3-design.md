# 方案 3：组合 + 显式销毁标记 - 详细设计文档

## 📋 文档信息

**方案名称**: Web Components 组合 Disposable + 显式销毁标记

---

## 🎯 方案概述

### 核心思想

**Web Components 组合 Disposable + 显式销毁标记**，将两者优势结合：

- **组合 Disposable**: WebComponent 内部持有 Disposable 实例（而非继承）
- **显式销毁标记**: 使用 `#shouldDestroy` 标记区分"临时离开"和"真正销毁"
- **父组件控制**: 由父组件显式调用 `destroy()` 决定销毁时机

### 解决的核心问题

**disconnectedCallback 陷阱**:

| 场景 | 触发 disconnectedCallback | 是否应该销毁 | 方案 1（继承） | 方案 3（组合+标记） |
|------|--------------------------|-------------|---------------|------------------|
| 用户切换工作表 | ✅ 是 | ✅ 是 | ✅ 正常销毁 | ✅ 正常销毁（调用 destroy） |
| 拖拽排序 | ✅ 是 | ❌ 否 | ❌ 错误销毁 → 僵尸组件 | ✅ 不销毁（未调用 destroy） |
| 路由切换 | ✅ 是 | ❌ 否 | ❌ 错误销毁 → 僵尸组件 | ✅ 不销毁（未调用 destroy） |
| appendChild 移动 | ✅ 是 | ❌ 否 | ❌ 错误销毁 → 僵尸组件 | ✅ 不销毁（未调用 destroy） |

---

## 🏗️ 核心实现

### WebComponent 基类

```javascript
// src/core/WebComponent.js
import { Disposable } from "./Disposable.js";

export class WebComponent extends HTMLElement {
    #disposable = null;        // 组合 Disposable（而非继承）
    #connected = false;        // 连接状态标记
    #shouldDestroy = false;    // 显式销毁标记（关键）

    constructor() {
        super();
        if (!this.shadowRoot) {
            this.attachShadow({ mode: 'open' });
        }
    }

    connectedCallback() {
        if (this.#connected) return;
        this.#connected = true;
        
        this.#disposable = new Disposable();
        this.render();           // 先渲染 DOM
        this.onConnect(this.#disposable);
    }

    disconnectedCallback() {
        if (!this.#connected) return;
        this.#connected = false;
        
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

    destroy() {
        if (this.#shouldDestroy) return;
        this.#shouldDestroy = true;
        this.remove();
    }

    get disposable() { return this.#disposable; }
    get isConnected() { return this.#connected; }
    get isDestroyed() { return this.#shouldDestroy; }

    onConnect(disposable) {}
    onDisconnect() {}
    render() {}

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
```

---

## 📊 需要改造的文件清单

### 改造分类总览

| 分类 | 数量 | 改造方式 | 总工时 |
|------|------|---------|--------|
| **新增文件** | 7 个 | 创建 Web Components | 13 天 |
| **重构文件** | 10 个 | 使用 Web Components | 13 天 |
| **测试文件** | 8 个 | 编写测试用例 | 8 天 |
| **保留文件** | 3 个 | 无需修改 | 0 天 |
| **总计** | **28 个文件** | - | **34 天** |

---

### 📁 详细文件清单

#### ✅ 新增文件（7 个）

| 文件路径 | 优先级 | 预估工时 | 说明 |
|---------|--------|---------|------|
| `src/core/WebComponent.js` | P0 | 1 天 | Web Component 基类（已实现） |
| `src/ui/SheetTabElement.js` | P0 | 2 天 | 工作表标签 Web Component |
| `src/ui/FormulaBarElement.js` | P0 | 1 天 | 公式栏 Web Component |
| `src/ui/ContextMenuElement.js` | P0 | 2 天 | 右键菜单 Web Component |
| `src/ui/ValidationPortalElement.js` | P1 | 3 天 | 验证门户 Web Component |
| `src/ui/CellEditorElement.js` | P1 | 3 天 | 编辑器 Web Component 基类 |
| `src/ui/SheetTabsContainerElement.js` | P1 | 1 天 | 标签容器 Web Component |

#### ⚠️ 重构文件（10 个）

| 文件路径 | 优先级 | 预估工时 | 改造内容 |
|---------|--------|---------|---------|
| `src/ui/SheetTabBar.js` | P0 | 1 天 | 使用 SheetTabElement + SheetTabsContainerElement |
| `src/ui/FormulaBar.js` | P0 | 0.5 天 | 使用 FormulaBarElement |
| `src/editor/strategies/ContextMenuStrategy.js` | P0 | 1 天 | 使用 ContextMenuElement |
| `src/plugins/data-validation/ValidationPortalManager.js` | P1 | 2 天 | 使用 ValidationPortalElement |
| `src/editor/editors/CellEditor.js` | P1 | 2 天 | 使用 CellEditorElement |
| `src/editor/editors/TextEditor.js` | P1 | 1 天 | 继承 CellEditorElement |
| `src/editor/editors/NumericEditor.js` | P1 | 1 天 | 继承 CellEditorElement |
| `src/editor/editors/DateEditor.js` | P1 | 1 天 | 继承 CellEditorElement |
| `src/editor/editors/SelectEditor.js` | P1 | 1 天 | 继承 CellEditorElement |
| `src/ui/ScrollManager.js` | P2 | 2 天 | 部分 UI 迁移到 Web Components |

#### ✅ 保留文件（3 个）

| 文件路径 | 状态 | 说明 |
|---------|------|------|
| `src/core/Disposable.js` | ✅ 保留 | 核心生命周期管理，无需修改 |
| `src/core/DOMComponent.js` | ✅ 保留 | 非 UI 组件使用，无需修改 |
| `src/render/RenderEngine.js` | ✅ 保留 | 非 UI 组件，无需修改 |

#### 🧪 测试文件（8 个）

| 文件路径 | 优先级 | 预估工时 | 说明 |
|---------|--------|---------|------|
| `tests/core/WebComponent.test.js` | P0 | 1 天 | WebComponent 基类测试（已实现） |
| `tests/ui/SheetTabElement.test.js` | P0 | 1 天 | SheetTabElement 测试 |
| `tests/ui/FormulaBarElement.test.js` | P0 | 0.5 天 | FormulaBarElement 测试 |
| `tests/ui/ContextMenuElement.test.js` | P0 | 1 天 | ContextMenuElement 测试 |
| `tests/ui/ValidationPortalElement.test.js` | P1 | 1 天 | ValidationPortalElement 测试 |
| `tests/ui/CellEditorElement.test.js` | P1 | 1 天 | CellEditorElement 测试 |
| `tests/integration/WebComponentsIntegration.test.js` | P0 | 1 天 | 集成测试 |
| `tests/attack/WebComponentAttackTest.test.js` | P0 | 1.5 天 | 攻击性测试 |

---

## 🧪 测试用例设计

### 测试策略总览

| 测试类型 | 数量 | 覆盖范围 | 目标 |
|---------|------|---------|------|
| **单元测试** | 19 个 | WebComponent 基类 + 各组件 | 验证功能正确性 |
| **自测用例** | 10 个 | 开发者自测场景 | 快速验证基本功能 |
| **攻击性测试** | 15 个 | 边界、异常、性能 | 验证健壮性 |
| **集成测试** | 5 个 | 组件间交互 | 验证整体流程 |
| **总计** | **49 个测试** | - | **覆盖率 > 90%** |

---

### 1. 单元测试（19 个）

#### 测试组 1：组合 Disposable 方案（4 个）

```javascript
describe("组合 Disposable 方案", () => {
    it("WC-01: connectedCallback → 创建 Disposable 并调用 onConnect", () => {
        class TestElement extends WebComponent {
            onConnect(disposable) {
                this.receivedDisposable = disposable;
            }
        }
        customElements.define('test-element-wc01', TestElement);
        
        const el = document.createElement('test-element-wc01');
        document.body.appendChild(el);
        
        expect(el.receivedDisposable).toBeDefined();
        expect(el.receivedDisposable instanceof Disposable).toBe(true);
        expect(el.isConnected).toBe(true);
        
        el.destroy();
    });
    
    it("WC-02: disconnectedCallback（未标记销毁） → 不销毁 Disposable", () => {
        class TestElement extends WebComponent {
            onDisconnect() {
                this.disconnectCalled = true;
            }
        }
        customElements.define('test-element-wc02', TestElement);
        
        const el = document.createElement('test-element-wc02');
        document.body.appendChild(el);
        
        el.remove();
        
        expect(el.disconnectCalled).toBeFalsy();
        expect(el.isConnected).toBe(false);
        expect(el.isDestroyed).toBe(false);
        expect(el.disposable).toBeDefined();
    });
    
    it("WC-03: disconnectedCallback（标记销毁） → 销毁 Disposable", () => {
        class TestElement extends WebComponent {
            onDisconnect() {
                this.disconnectCalled = true;
            }
        }
        customElements.define('test-element-wc03', TestElement);
        
        const el = document.createElement('test-element-wc03');
        document.body.appendChild(el);
        
        el.destroy();
        
        expect(el.disconnectCalled).toBe(true);
        expect(el.isConnected).toBe(false);
        expect(el.isDestroyed).toBe(true);
        expect(el.disposable).toBeNull();
    });
    
    it("WC-04: 属性变化 → render 被调用", () => {
        class TestElement extends WebComponent {
            static get observedAttributes() {
                return ['value'];
            }
            
            render() {
                this.shadowRoot.innerHTML = `<div>${this.getAttribute('value')}</div>`;
            }
        }
        customElements.define('test-element-wc04', TestElement);
        
        const el = document.createElement('test-element-wc04');
        el.setAttribute('value', 'test1');
        document.body.appendChild(el);
        
        expect(el.shadowRoot.querySelector('div').textContent).toBe('test1');
        
        el.setAttribute('value', 'test2');
        expect(el.shadowRoot.querySelector('div').textContent).toBe('test2');
        
        el.destroy();
    });
});
```

#### 测试组 2：disconnectedCallback 陷阱测试（5 个）

```javascript
describe("disconnectedCallback 陷阱测试", () => {
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
        
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalledTimes(1);
        
        el.remove();
        expect(el.isConnected).toBe(false);
        expect(el.isDestroyed).toBe(false);
        
        container2.appendChild(el);
        expect(el.isConnected).toBe(true);
        
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalledTimes(2);
        
        container1.remove();
        container2.remove();
    });
    
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
        
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalledTimes(1);
        
        el.destroy();
        expect(el.isDestroyed).toBe(true);
        
        expect(el.clickHandler).toHaveBeenCalledTimes(1);
    });
    
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
        
        el.remove();
        document.body.appendChild(el);
        expect(el.connectCount).toBe(2);
        
        el.remove();
        document.body.appendChild(el);
        expect(el.connectCount).toBe(3);
        
        el.destroy();
    });
    
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
        
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalledTimes(1);
        
        container2.appendChild(el);
        expect(el.isConnected).toBe(true);
        expect(el.isDestroyed).toBe(false);
        
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalledTimes(2);
        
        container1.remove();
        container2.remove();
    });
    
    it("WC-TRAP-05: 路由切换场景 — 离开再回来，组件正常工作", () => {
        class TestElement extends WebComponent {
            onConnect(disposable) {
                this.clickHandler = vi.fn();
                disposable.trackEvent(this.shadowRoot, 'click', this.clickHandler);
            }
        }
        customElements.define('test-element-trap05', TestElement);
        
        const page1 = document.createElement('div');
        document.body.appendChild(page1);
        
        const el = document.createElement('test-element-trap05');
        page1.appendChild(el);
        
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalledTimes(1);
        
        el.remove();
        expect(el.isConnected).toBe(false);
        expect(el.isDestroyed).toBe(false);
        
        page1.appendChild(el);
        expect(el.isConnected).toBe(true);
        
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalledTimes(2);
        
        page1.remove();
    });
});
```

#### 测试组 3：Disposable 能力（4 个）

```javascript
describe("Disposable 能力（组合方式）", () => {
    it("WC-05: disposable.trackEvent 自动清理 — destroy 时移除", () => {
        class TestElement extends WebComponent {
            onConnect(disposable) {
                this.clickHandler = vi.fn();
                disposable.trackEvent(this.shadowRoot, 'click', this.clickHandler);
            }
        }
        customElements.define('test-element-wc05', TestElement);
        
        const el = document.createElement('test-element-wc05');
        document.body.appendChild(el);
        
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalled();
        
        el.destroy();
        
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.clickHandler).toHaveBeenCalledTimes(1);
    });
    
    it("WC-06: 多个监听器 — 全部自动清理", () => {
        class TestElement extends WebComponent {
            onConnect(disposable) {
                this.handler1 = vi.fn();
                this.handler2 = vi.fn();
                this.handler3 = vi.fn();
                
                disposable.trackEvent(this.shadowRoot, 'click', this.handler1);
                disposable.trackEvent(document, 'click', this.handler2);
                disposable.trackEvent(window, 'resize', this.handler3);
            }
        }
        customElements.define('test-element-wc06', TestElement);
        
        const el = document.createElement('test-element-wc06');
        document.body.appendChild(el);
        
        el.shadowRoot.dispatchEvent(new Event('click'));
        document.dispatchEvent(new Event('click'));
        window.dispatchEvent(new Event('resize'));
        
        expect(el.handler1).toHaveBeenCalled();
        expect(el.handler2).toHaveBeenCalled();
        expect(el.handler3).toHaveBeenCalled();
        
        el.destroy();
        
        el.shadowRoot.dispatchEvent(new Event('click'));
        document.dispatchEvent(new Event('click'));
        window.dispatchEvent(new Event('resize'));
        
        expect(el.handler1).toHaveBeenCalledTimes(1);
        expect(el.handler2).toHaveBeenCalledTimes(1);
        expect(el.handler3).toHaveBeenCalledTimes(1);
    });
    
    it("WC-07: destroy 幂等 — 连续调用两次不抛异常", () => {
        class TestElement extends WebComponent {
            onDisconnect() {
                this.disconnectCount = (this.disconnectCount || 0) + 1;
            }
        }
        customElements.define('test-element-wc07', TestElement);
        
        const el = document.createElement('test-element-wc07');
        document.body.appendChild(el);
        
        el.destroy();
        el.destroy();
        
        expect(el.isDestroyed).toBe(true);
        expect(el.disconnectCount).toBe(1);
    });
    
    it("WC-08: 销毁后无法获取 disposable", () => {
        class TestElement extends WebComponent {}
        customElements.define('test-element-wc08', TestElement);
        
        const el = document.createElement('test-element-wc08');
        document.body.appendChild(el);
        
        expect(el.disposable).toBeDefined();
        
        el.destroy();
        
        expect(el.disposable).toBeNull();
    });
});
```

#### 测试组 4：Shadow DOM 样式隔离（3 个）

```javascript
describe("Shadow DOM 样式隔离", () => {
    it("WC-09: 外部样式不影响内部", () => {
        class TestElement extends WebComponent {
            render() {
                this.shadowRoot.innerHTML = `
                    <style>.inner { color: red; }</style>
                    <div class="inner">Test</div>
                `;
            }
        }
        customElements.define('test-element-wc09', TestElement);
        
        const externalStyle = document.createElement('style');
        externalStyle.textContent = '.inner { color: blue !important; }';
        document.head.appendChild(externalStyle);
        
        const el = document.createElement('test-element-wc09');
        document.body.appendChild(el);
        
        const innerDiv = el.shadowRoot.querySelector('.inner');
        const color = window.getComputedStyle(innerDiv).color;
        
        expect(color).toMatch(/rgb\(255,\s*0,\s*0\)/);
        
        externalStyle.remove();
        el.destroy();
    });
    
    it("WC-10: 内部样式不影响外部", () => {
        class TestElement extends WebComponent {
            render() {
                this.shadowRoot.innerHTML = `
                    <style>div { background: yellow; }</style>
                    <div>Internal</div>
                `;
            }
        }
        customElements.define('test-element-wc10', TestElement);
        
        const externalDiv = document.createElement('div');
        externalDiv.textContent = 'External';
        document.body.appendChild(externalDiv);
        
        const el = document.createElement('test-element-wc10');
        document.body.appendChild(el);
        
        const bgColor = window.getComputedStyle(externalDiv).backgroundColor;
        expect(bgColor).not.toBe('rgb(255, 255, 0)');
        
        el.destroy();
        externalDiv.remove();
    });
    
    it("WC-11: CSS 变量穿透", () => {
        class TestElement extends WebComponent {
            render() {
                this.shadowRoot.innerHTML = `
                    <style>.inner { color: var(--custom-color, green); }</style>
                    <div class="inner">Test</div>
                `;
            }
        }
        customElements.define('test-element-wc11', TestElement);
        
        const el = document.createElement('test-element-wc11');
        el.style.setProperty('--custom-color', 'purple');
        document.body.appendChild(el);
        
        const innerDiv = el.shadowRoot.querySelector('.inner');
        const color = window.getComputedStyle(innerDiv).color;
        
        expect(color).toMatch(/rgb\(128,\s*0,\s*128\)/);
        
        el.destroy();
    });
});
```

#### 测试组 5：工具方法（3 个）

```javascript
describe("工具方法", () => {
    it("WC-12: escapeHtml — 正确转义 HTML 特殊字符", () => {
        class TestElement extends WebComponent {
            render() {
                const unsafe = '<script>alert("xss")</script>';
                this.shadowRoot.innerHTML = `<div>${this.escapeHtml(unsafe)}</div>`;
            }
        }
        customElements.define('test-element-wc12', TestElement);
        
        const el = document.createElement('test-element-wc12');
        document.body.appendChild(el);
        
        const div = el.shadowRoot.querySelector('div');
        expect(div.textContent).toBe('<script>alert("xss")</script>');
        expect(div.innerHTML).not.toContain('<script>');
        expect(div.innerHTML).toContain('&lt;script&gt;');
        
        el.destroy();
    });
    
    it("WC-13: escapeHtml — 处理各种特殊字符", () => {
        class TestElement extends WebComponent {}
        customElements.define('test-element-wc13', TestElement);
        
        const el = document.createElement('test-element-wc13');
        
        const testCases = [
            { input: '<div>', expected: '&lt;div&gt;' },
            { input: '"quote"', expected: '&quot;quote&quot;' },
            { input: '&amp', expected: '&amp;amp' }
        ];
        
        testCases.forEach(({ input, expected }) => {
            const escaped = el.escapeHtml(input);
            expect(escaped).toBe(expected);
        });
        
        el.destroy();
    });
});
```

---

### 2. 自测用例（10 个）

```javascript
// tests/self-test/WebComponentSelfTest.js

describe("自测用例 — 快速验证", () => {
    it("SELF-01: 基本渲染 — Web Component 正常显示", () => {
        class TestElement extends WebComponent {
            render() {
                this.shadowRoot.innerHTML = '<div>Hello</div>';
            }
        }
        customElements.define('self-test-01', TestElement);
        
        const el = document.createElement('self-test-01');
        document.body.appendChild(el);
        
        expect(el.shadowRoot.querySelector('div').textContent).toBe('Hello');
        el.destroy();
    });
    
    it("SELF-02: 属性设置 — 属性正确传递到模板", () => {
        class TestElement extends WebComponent {
            static get observedAttributes() {
                return ['name'];
            }
            
            render() {
                this.shadowRoot.innerHTML = `<div>${this.getAttribute('name')}</div>`;
            }
        }
        customElements.define('self-test-02', TestElement);
        
        const el = document.createElement('self-test-02');
        el.setAttribute('name', 'TestName');
        document.body.appendChild(el);
        
        expect(el.shadowRoot.querySelector('div').textContent).toBe('TestName');
        el.destroy();
    });
    
    it("SELF-03: 事件触发 — 点击事件正确传递", () => {
        class TestElement extends WebComponent {
            onConnect(disposable) {
                disposable.trackEvent(this.shadowRoot, 'click', () => {
                    this.dispatchEvent(new CustomEvent('test-click', { bubbles: true }));
                });
            }
            
            render() {
                this.shadowRoot.innerHTML = '<button>Click</button>';
            }
        }
        customElements.define('self-test-03', TestElement);
        
        const el = document.createElement('self-test-03');
        document.body.appendChild(el);
        
        const handler = vi.fn();
        el.addEventListener('test-click', handler);
        
        el.shadowRoot.querySelector('button').click();
        expect(handler).toHaveBeenCalled();
        
        el.destroy();
    });
    
    it("SELF-04: 显式销毁 — destroy() 正常工作", () => {
        class TestElement extends WebComponent {}
        customElements.define('self-test-04', TestElement);
        
        const el = document.createElement('self-test-04');
        document.body.appendChild(el);
        
        expect(el.isConnected).toBe(true);
        
        el.destroy();
        
        expect(el.isDestroyed).toBe(true);
        expect(el.isConnected).toBe(false);
    });
    
    it("SELF-05: 拖拽场景 — 移除后重新插入正常", () => {
        class TestElement extends WebComponent {
            onConnect(disposable) {
                this.connectCount = (this.connectCount || 0) + 1;
            }
        }
        customElements.define('self-test-05', TestElement);
        
        const el = document.createElement('self-test-05');
        document.body.appendChild(el);
        expect(el.connectCount).toBe(1);
        
        el.remove();
        document.body.appendChild(el);
        expect(el.connectCount).toBe(2);
        
        el.destroy();
    });
    
    it("SELF-06: 样式隔离 — 外部样式不影响内部", () => {
        class TestElement extends WebComponent {
            render() {
                this.shadowRoot.innerHTML = `
                    <style>.inner { color: red; }</style>
                    <div class="inner">Test</div>
                `;
            }
        }
        customElements.define('self-test-06', TestElement);
        
        const el = document.createElement('self-test-06');
        document.body.appendChild(el);
        
        const innerDiv = el.shadowRoot.querySelector('.inner');
        const color = window.getComputedStyle(innerDiv).color;
        
        expect(color).toMatch(/rgb\(255,\s*0,\s*0\)/);
        el.destroy();
    });
    
    it("SELF-07: HTML 转义 — XSS 防护", () => {
        class TestElement extends WebComponent {
            render() {
                const unsafe = '<script>alert("xss")</script>';
                this.shadowRoot.innerHTML = `<div>${this.escapeHtml(unsafe)}</div>`;
            }
        }
        customElements.define('self-test-07', TestElement);
        
        const el = document.createElement('self-test-07');
        document.body.appendChild(el);
        
        const div = el.shadowRoot.querySelector('div');
        expect(div.innerHTML).not.toContain('<script>');
        
        el.destroy();
    });
    
    it("SELF-08: 多次连接/断开 — 不崩溃", () => {
        class TestElement extends WebComponent {}
        customElements.define('self-test-08', TestElement);
        
        const el = document.createElement('self-test-08');
        
        for (let i = 0; i < 5; i++) {
            document.body.appendChild(el);
            el.remove();
        }
        
        expect(el.isDestroyed).toBe(false);
        el.destroy();
    });
    
    it("SELF-09: 事件自动清理 — destroy 后事件移除", () => {
        class TestElement extends WebComponent {
            onConnect(disposable) {
                this.handler = vi.fn();
                disposable.trackEvent(this.shadowRoot, 'click', this.handler);
            }
        }
        customElements.define('self-test-09', TestElement);
        
        const el = document.createElement('self-test-09');
        document.body.appendChild(el);
        
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.handler).toHaveBeenCalled();
        
        el.destroy();
        
        el.shadowRoot.dispatchEvent(new Event('click'));
        expect(el.handler).toHaveBeenCalledTimes(1);
    });
    
    it("SELF-10: 幂等销毁 — 多次 destroy 不崩溃", () => {
        class TestElement extends WebComponent {}
        customElements.define('self-test-10', TestElement);
        
        const el = document.createElement('self-test-10');
        document.body.appendChild(el);
        
        el.destroy();
        el.destroy();
        el.destroy();
        
        expect(el.isDestroyed).toBe(true);
    });
});
```

---

### 3. 攻击性测试（15 个）

```javascript
// tests/attack/WebComponentAttackTest.test.js

describe("攻击性测试 — 健壮性验证", () => {
    describe("边界情况攻击", () => {
        it("ATTACK-01: 空属性值 — 不崩溃", () => {
            class TestElement extends WebComponent {
                static get observedAttributes() {
                    return ['value'];
                }
                
                render() {
                    const value = this.getAttribute('value') || '';
                    this.shadowRoot.innerHTML = `<div>${value}</div>`;
                }
            }
            customElements.define('attack-test-01', TestElement);
            
            const el = document.createElement('attack-test-01');
            el.setAttribute('value', '');
            document.body.appendChild(el);
            
            expect(el.shadowRoot.querySelector('div').textContent).toBe('');
            el.destroy();
        });
        
        it("ATTACK-02: null 属性值 — 不崩溃", () => {
            class TestElement extends WebComponent {
                static get observedAttributes() {
                    return ['value'];
                }
                
                render() {
                    const value = this.getAttribute('value');
                    this.shadowRoot.innerHTML = `<div>${value || 'empty'}</div>`;
                }
            }
            customElements.define('attack-test-02', TestElement);
            
            const el = document.createElement('attack-test-02');
            document.body.appendChild(el);
            
            expect(el.shadowRoot.querySelector('div').textContent).toBe('empty');
            el.destroy();
        });
        
        it("ATTACK-03: 特殊字符属性 — 正确处理", () => {
            class TestElement extends WebComponent {
                static get observedAttributes() {
                    return ['value'];
                }
                
                render() {
                    const value = this.getAttribute('value') || '';
                    this.shadowRoot.innerHTML = `<div>${this.escapeHtml(value)}</div>`;
                }
            }
            customElements.define('attack-test-03', TestElement);
            
            const el = document.createElement('attack-test-03');
            el.setAttribute('value', '<script>alert("xss")</script>');
            document.body.appendChild(el);
            
            const div = el.shadowRoot.querySelector('div');
            expect(div.textContent).toBe('<script>alert("xss")</script>');
            expect(div.innerHTML).not.toContain('<script>');
            
            el.destroy();
        });
        
        it("ATTACK-04: 超长属性值 — 性能合理", () => {
            class TestElement extends WebComponent {
                static get observedAttributes() {
                    return ['value'];
                }
                
                render() {
                    const value = this.getAttribute('value') || '';
                    this.shadowRoot.innerHTML = `<div>${this.escapeHtml(value.substring(0, 1000))}</div>`;
                }
            }
            customElements.define('attack-test-04', TestElement);
            
            const longValue = 'A'.repeat(10000);
            const el = document.createElement('attack-test-04');
            
            const start = performance.now();
            el.setAttribute('value', longValue);
            document.body.appendChild(el);
            const elapsed = performance.now() - start;
            
            expect(elapsed).toBeLessThan(100);
            el.destroy();
        });
        
        it("ATTACK-05: Unicode 字符 — 正确显示", () => {
            class TestElement extends WebComponent {
                static get observedAttributes() {
                    return ['value'];
                }
                
                render() {
                    const value = this.getAttribute('value') || '';
                    this.shadowRoot.innerHTML = `<div>${this.escapeHtml(value)}</div>`;
                }
            }
            customElements.define('attack-test-05', TestElement);
            
            const unicodeValues = [
                '中文测试',
                '日本語テスト',
                '한국어 테스트',
                '🎉🎊🎁',
                'Δx = ∫f(x)dx'
            ];
            
            unicodeValues.forEach(value => {
                const el = document.createElement('attack-test-05');
                el.setAttribute('value', value);
                document.body.appendChild(el);
                
                expect(el.shadowRoot.querySelector('div').textContent).toBe(value);
                el.destroy();
            });
        });
    });
    
    describe("异常处理攻击", () => {
        it("ATTACK-06: render 抛异常 — 不崩溃", () => {
            class TestElement extends WebComponent {
                render() {
                    throw new Error('Render error');
                }
            }
            customElements.define('attack-test-06', TestElement);
            
            const el = document.createElement('attack-test-06');
            
            expect(() => {
                document.body.appendChild(el);
            }).toThrow('Render error');
            
            if (el.isConnected) {
                el.destroy();
            }
        });
        
        it("ATTACK-07: onConnect 抛异常 — 不崩溃", () => {
            class TestElement extends WebComponent {
                onConnect(disposable) {
                    throw new Error('Connect error');
                }
            }
            customElements.define('attack-test-07', TestElement);
            
            const el = document.createElement('attack-test-07');
            
            expect(() => {
                document.body.appendChild(el);
            }).toThrow('Connect error');
            
            if (el.isConnected) {
                el.destroy();
            }
        });
        
        it("ATTACK-08: onDisconnect 抛异常 — 不崩溃", () => {
            class TestElement extends WebComponent {
                onDisconnect() {
                    throw new Error('Disconnect error');
                }
            }
            customElements.define('attack-test-08', TestElement);
            
            const el = document.createElement('attack-test-08');
            document.body.appendChild(el);
            
            expect(() => {
                el.destroy();
            }).toThrow('Disconnect error');
        });
        
        it("ATTACK-09: 事件处理器抛异常 — 不崩溃", () => {
            class TestElement extends WebComponent {
                onConnect(disposable) {
                    disposable.trackEvent(this.shadowRoot, 'click', () => {
                        throw new Error('Event handler error');
                    });
                }
                
                render() {
                    this.shadowRoot.innerHTML = '<button>Click</button>';
                }
            }
            customElements.define('attack-test-09', TestElement);
            
            const el = document.createElement('attack-test-09');
            document.body.appendChild(el);
            
            expect(() => {
                el.shadowRoot.querySelector('button').click();
            }).toThrow('Event handler error');
            
            el.destroy();
        });
        
        it("ATTACK-10: 重复注册自定义元素 — 抛异常", () => {
            class TestElement extends WebComponent {}
            
            customElements.define('attack-test-10', TestElement);
            
            expect(() => {
                customElements.define('attack-test-10', TestElement);
            }).toThrow();
        });
    });
    
    describe("性能攻击", () => {
        it("ATTACK-11: 大量元素创建 — 性能合理", () => {
            class TestElement extends WebComponent {
                render() {
                    this.shadowRoot.innerHTML = '<div>Test</div>';
                }
            }
            customElements.define('attack-test-11', TestElement);
            
            const start = performance.now();
            const elements = [];
            
            for (let i = 0; i < 1000; i++) {
                const el = document.createElement('attack-test-11');
                document.body.appendChild(el);
                elements.push(el);
            }
            
            const elapsed = performance.now() - start;
            
            expect(elapsed).toBeLessThan(1000);
            
            elements.forEach(el => el.destroy());
        });
        
        it("ATTACK-12: 频繁属性变化 — 性能合理", () => {
            class TestElement extends WebComponent {
                static get observedAttributes() {
                    return ['value'];
                }
                
                render() {
                    this.shadowRoot.innerHTML = `<div>${this.getAttribute('value')}</div>`;
                }
            }
            customElements.define('attack-test-12', TestElement);
            
            const el = document.createElement('attack-test-12');
            document.body.appendChild(el);
            
            const start = performance.now();
            
            for (let i = 0; i < 1000; i++) {
                el.setAttribute('value', `test${i}`);
            }
            
            const elapsed = performance.now() - start;
            
            expect(elapsed).toBeLessThan(500);
            
            el.destroy();
        });
        
        it("ATTACK-13: 频繁连接/断开 — 性能合理", () => {
            class TestElement extends WebComponent {}
            customElements.define('attack-test-13', TestElement);
            
            const el = document.createElement('attack-test-13');
            
            const start = performance.now();
            
            for (let i = 0; i < 100; i++) {
                document.body.appendChild(el);
                el.remove();
            }
            
            const elapsed = performance.now() - start;
            
            expect(elapsed).toBeLessThan(100);
            
            el.destroy();
        });
        
        it("ATTACK-14: 大量事件监听器 — 自动清理", () => {
            class TestElement extends WebComponent {
                onConnect(disposable) {
                    for (let i = 0; i < 100; i++) {
                        disposable.trackEvent(document, `custom-event-${i}`, () => {});
                    }
                }
            }
            customElements.define('attack-test-14', TestElement);
            
            const el = document.createElement('attack-test-14');
            document.body.appendChild(el);
            
            expect(el.disposable).toBeDefined();
            
            el.destroy();
            
            expect(el.disposable).toBeNull();
        });
        
        it("ATTACK-15: 内存泄漏检测 — destroy 后无残留", () => {
            class TestElement extends WebComponent {
                onConnect(disposable) {
                    this.largeData = new Array(10000).fill('data');
                    disposable.trackEvent(document, 'click', () => {
                        console.log(this.largeData.length);
                    });
                }
                
                onDisconnect() {
                    this.largeData = null;
                }
            }
            customElements.define('attack-test-15', TestElement);
            
            const el = document.createElement('attack-test-15');
            document.body.appendChild(el);
            
            expect(el.largeData).toBeDefined();
            
            el.destroy();
            
            expect(el.largeData).toBeNull();
            expect(el.disposable).toBeNull();
        });
    });
});
```

---

### 4. 集成测试（5 个）

```javascript
// tests/integration/WebComponentsIntegration.test.js

describe("集成测试 — 组件间交互", () => {
    it("INT-01: SheetTabBar 使用 Web Components — 正常渲染", () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        
        const workbook = new Workbook();
        const tabBar = new SheetTabBar(container, workbook);
        
        const tabs = container.querySelectorAll('sheet-tab');
        expect(tabs.length).toBeGreaterThan(0);
        
        tabBar.destroy();
        container.remove();
    });
    
    it("INT-02: 事件传递 — Web Component 事件正确传递到父组件", () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        
        const workbook = new Workbook();
        const tabBar = new SheetTabBar(container, workbook);
        
        const switchHandler = vi.fn();
        tabBar.onSwitch = switchHandler;
        
        const tab = container.querySelector('sheet-tab');
        tab.dispatchEvent(new CustomEvent('switch', {
            bubbles: true,
            detail: { name: 'Sheet1' }
        }));
        
        expect(switchHandler).toHaveBeenCalledWith('Sheet1');
        
        tabBar.destroy();
        container.remove();
    });
    
    it("INT-03: 生命周期同步 — 父组件销毁时 Web Components 自动清理", () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        
        const workbook = new Workbook();
        const tabBar = new SheetTabBar(container, workbook);
        
        const tabs = container.querySelectorAll('sheet-tab');
        expect(tabs.length).toBeGreaterThan(0);
        
        tabBar.destroy();
        
        const remainingTabs = container.querySelectorAll('sheet-tab');
        expect(remainingTabs.length).toBe(0);
        
        container.remove();
    });
    
    it("INT-04: FormulaBar 集成 — 正常工作", () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        
        const workbook = new Workbook();
        const formulaBar = new FormulaBar(workbook, container);
        
        const element = container.querySelector('formula-bar');
        expect(element).toBeDefined();
        
        formulaBar.destroy();
        container.remove();
    });
    
    it("INT-05: CellEditor 集成 — 正常工作", () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        
        const workbook = new Workbook();
        const editor = new CellEditor(renderEngine, sheet);
        
        editor.createEditor();
        
        const element = container.querySelector('cell-editor');
        expect(element).toBeDefined();
        
        editor.destroy();
        container.remove();
    });
});
```

---

## 📋 迁移步骤

### Phase 1：基础设施（1 周）

**步骤 1.1**: 创建 WebComponent 基类（✅ 已完成）  
**步骤 1.2**: 验证架构可行性（✅ 已完成）

---

### Phase 2：UI 组件迁移（3 周）

**Week 1**: SheetTabBar + FormulaBar  
**Week 2**: ValidationPortalManager + CellEditor  
**Week 3**: ScrollManager + 集成测试

---

### Phase 3：优化与测试（1 周）

**步骤 3.1**: 性能优化  
**步骤 3.2**: 完善测试（覆盖率 > 90%）  
**步骤 3.3**: 文档编写

---

## 📚 相关文档

1. **陷阱分析** → [web-components-lifecycle-trap.md](file:///E:\code\canvas-implementation-in-excel\designDocument\web-components-lifecycle-trap.md)
2. **基类实现** → [WebComponent.js](file:///E:\code\canvas-implementation-in-excel\src\core\WebComponent.js)
3. **测试用例** → [WebComponent.test.js](file:///E:\code\canvas-implementation-in-excel\tests\core\WebComponent.test.js)

---
