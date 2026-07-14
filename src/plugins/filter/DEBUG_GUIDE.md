# FilterPlugin 点击事件调试指南

## 🔍 问题诊断：点击筛选图标无反应

### ✅ 已完成的修复

#### 1. **FilterStrategy 事件处理架构修正**

```javascript
// ❌ 旧实现（不工作）
class FilterStrategy extends BaseStrategy {
    canHandle(eventType, hitInfo) { ... }
    handle(event, hitInfo) { ... }
}

// ✅ 新实现（符合项目规范）
class FilterStrategy extends EventStrategy {
    priority = 10; // 高优先级

    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEUP]: (e) => this.#handleCanvasClick(e)
        };
    }

    #handleCanvasClick(e) {
        const hitInfo = this.handler.getHitInfo(e);
        if (hitInfo.type === HIT_TYPE.COL_HEADER && this.#isFilterIconArea(hitInfo)) {
            this.#uiManager.openDropdown(col, position);
            return false; // 阻止冒泡
        }
    }
}
```

#### 2. **FilterPlugin 策略注册方式优化**

```javascript
// 使用 BasePlugin 标准方法（自动生命周期管理）
#registerStrategies() {
    this.#strategy = new FilterStrategy(this.#uiManager, this.eventHandler);
    this.addStrategy("filterClick", this.#strategy); // ✅ 正确
}
```

---

## 🛠️ 调试步骤

### Step 1: 检查插件是否正确加载

打开浏览器控制台 (F12)，运行：

```javascript
// 检查插件实例
const filterPlugin = wb.getPlugin("filter");
console.log("FilterPlugin 实例:", filterPlugin);
console.log("是否启用:", filterPlugin?.enabled);
console.log("UI Manager:", filterPlugin?.getFilterUIManager());
console.log("策略:", filterPlugin?._strategy || "无法访问私有属性");

// 预期输出：
// FilterPlugin 实例: FilterPlugin { ... }
// 是否启用: true
// UI Manager: FilterUIManager { ... }
// 策略: [EventStrategy 实例]
```

### Step 2: 检查事件处理器是否注册

```javascript
// 检查 EventHandler 中的策略列表
const eventHandler = wb.eventHandler;
console.log("已注册的策略:", eventHandler?._strategies);

// 查找 filterClick 策略
const filterStrategy = eventHandler?._strategies?.get("filterClick");
console.log("FilterStrategy:", filterStrategy);
console.log("事件处理器:", filterStrategy?.getEventHandlers());
```

### Step 3: 测试点击检测

在控制台手动触发测试：

```javascript
// 模拟列头点击
const canvas = document.querySelector("canvas");
if (canvas) {
    const rect = canvas.getBoundingClientRect();

    // 创建一个模拟的鼠标事件（点击 B 列头右侧区域）
    const mockEvent = new MouseEvent("mouseup", {
        clientX: rect.left + 200, // 调整这个值到 B 列头位置
        clientY: rect.top + 30, // 列头高度通常在 20-40px
        bubbles: true,
        cancelable: true,
    });

    console.log("触发模拟点击...");
    canvas.dispatchEvent(mockEvent);
    console.log("检查是否打开了下拉面板:", filterPlugin.isDropdownOpen());
}
```

### Step 4: 检查 Canvas 命中信息

```javascript
// 如果有 getHitInfo 方法，测试命中检测
if (wb.eventHandler?.getHitInfo) {
    const testEvent = new MouseEvent("mouseup", {
        clientX: window.innerWidth / 2,
        clientY: 50, // 列头区域
        bubbles: true,
    });

    const hitInfo = wb.eventHandler.getHitInfo(testEvent);
    console.log("命中信息:", hitInfo);
    console.log("命中类型:", hitInfo?.type);
    console.log("列号:", hitInfo?.col);
    console.log("矩形区域:", hitInfo?.rect);
    console.log("鼠标 X:", hitInfo?.mouseX);
}
```

---

## 🐛 常见问题与解决方案

### 问题 1: `getHitInfo` 未定义

**错误信息**: `Cannot read property 'getHitInfo' of undefined`

**原因**: EventHandler 可能没有暴露此方法

**解决方案**: 查看 EventHandler 的实际 API

```javascript
// 查看 EventHandler 可用方法
console.log(Object.getOwnPropertyNames(wb.eventHandler.__proto__));
```

### 问题 2: 策略优先级冲突

**现象**: 其他策略拦截了点击事件

**解决方案**: 提高 FilterStrategy 优先级

```javascript
// 在 FilterStrategy 中
priority = 100; // 设置为最高优先级
```

### 问题 3: 图标位置计算错误

**现象**: 点击了图标但没反应

**原因**: 图标坐标计算不准确

**调试方法**:

```javascript
// 在 #isFilterIconArea 中添加日志
#isFilterIconArea(hitInfo) {
    const iconRightEdge = hitInfo.rect.right - this.#iconPadding;
    const iconLeftEdge = iconRightEdge - (this.#iconSize + this.#iconPadding * 2);
    const mouseX = hitInfo.mouseX || 0;

    console.log("图标区域:", iconLeftEdge, "-", iconRightEdge);
    console.log("鼠标位置:", mouseX);
    console.log("是否命中:", mouseX >= iconLeftEdge && mouseX <= iconRightEdge);

    return mouseX >= iconLeftEdge && mouseX <= iconRightEdge;
}
```

### 问题 4: Canvas 渲染层问题

**现象**: 图标显示但点击无效

**可能原因**:

- Canvas 事件被其他元素遮挡
- z-index 层级问题

**解决方案**:

```css
/* 确保 Canvas 可以接收点击 */
canvas {
    pointer-events: auto;
    z-index: 10;
}

/* 移除可能的遮挡元素 */
.filter-dropdown-panel {
    z-index: 10001; /* 高于 Canvas */
}
```

---

## 📊 验证清单

在报告问题前，请确认以下所有项：

- [ ] `main.js` 的 `plugins` 数组包含 `"filter"`
- [ ] 控制台无红色错误信息
- [ ] `wb.getPlugin("filter")` 返回非 null 对象
- [ ] `filterPlugin.enabled === true`
- [ ] 列头显示了漏斗图标（灰色或蓝色）
- [ ] 点击图标时控制台无报错
- [ ] `filterPlugin.isDropdownOpen()` 在点击后返回 true

---

## 🚀 快速修复脚本

如果以上调试都失败，尝试这个快速修复：

```javascript
// 在 main.js 的 initApp 函数末尾添加
setTimeout(() => {
    const filterPlugin = wb.getPlugin("filter");
    if (!filterPlugin) {
        console.error("❌ FilterPlugin 未加载！");
        return;
    }

    console.log("✅ FilterPlugin 已加载");
    console.log("状态:", filterPlugin.enabled ? "启用" : "禁用");

    // 强制重新初始化
    filterPlugin.destroy();
    filterPlugin.init({ enabled: true });

    console.log("🔄 FilterPlugin 已重新初始化");
}, 1000); // 等待 1 秒确保所有组件就绪
```

---

## 📞 需要帮助？

如果问题仍未解决，请提供以下信息：

1. **浏览器控制台完整输出**（特别是红色错误）
2. **浏览器类型和版本**
3. **操作系统**
4. **点击筛选图标时的完整日志**

---

**最后更新**: 2026-07-14  
**版本**: v1.1 (事件处理修复版)
