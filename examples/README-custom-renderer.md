# 🎨 自定义渲染器教程 - TrafficLightType 实战案例

## 📁 创建的文件清单

### 1. **核心渲染器类**
- 📄 [TrafficLightType.js](../src/types/renderers/TrafficType.js)
  - 完整的生产级自定义渲染器实现
  - 540+ 行代码，包含完整的 JSDoc 注释
  - 支持：点击交互、悬停效果、键盘操作、平滑动画

### 2. **注册表集成**
- 📄 [index.js](../src/types/renderers/index.js) (已更新)
  - 已将 `TrafficLightType` 注册到内置渲染器注册表
  - 可通过名称 `'trafficLight'` 直接使用

### 3. **UMD 示例页面**
- 📄 [custom-renderer-umd.html](./custom-renderer-umd.html)
  - 完整的教学级 HTML 页面
  - 包含：概念介绍、API 文档、最佳实践、实时演示
  - 可直接在浏览器中打开运行

---

## 🚀 快速开始（3 步）

### 第一步：打开示例页面

```bash
# 方式 1：直接在浏览器中打开
双击 examples/custom-renderer-umd.html

# 方式 2：使用本地服务器（推荐）
npx http-server .
# 然后访问 http://localhost:8080/examples/custom-renderer-umd.html
```

### 第二步：体验交互功能

1. 点击 **"🔄 初始化示例数据"** 按钮
2. 观察第 2 列的 **交通灯指示器**
3. 尝试以下交互：

| 操作 | 效果 |
|------|------|
| **单击交通灯** | 循环切换：绿 → 黄 → 红 → 绿 |
| **方向键 (→↑↓)** | 切换到下一个状态 |
| **方向键 (←)** | 切换到上一个状态 |
| **数字键 (1/2/3)** | 直接设置：绿 / 黄 / 红 |
| **鼠标悬停** | 显示发光高亮效果 |
| **双击单元格** | 弹出下拉选择框 |

### 第三步：探索配置选项

点击 **"⚙️ 切换配置模式"** 按钮查看不同配置的效果：

#### 模式 0：默认配置（中文标签）
```javascript
{
    size: 0.35,           // 小图标
    showLabel: true,      // 显示中文标签
    colors: {             // 默认颜色
        green: '#4CAF50',
        yellow: '#FFC107',
        red: '#F44336'
    },
    labels: {             // 中文标签
        green: '正常',
        yellow: '警告',
        red: '危险'
    }
}
```

#### 模式 1：自定义配置（英文标签 + 大图标）
```javascript
{
    size: 0.5,            // 大图标
    showLabel: true,      // 显示英文标签
    colors: {             // 鲜艳色彩
        green: '#00E676',
        yellow: '#FFD700',
        red: '#FF1744'
    },
    labels: {             // 英文标签
        green: 'Running',
        yellow: 'Warning',
        red: 'Down'
    }
}
```

---

## 📖 核心概念详解

### 什么是自定义渲染器？

自定义渲染器是 Canvas Spreadsheet 的**核心扩展机制**，允许你：
- ✅ 将普通文本单元格转换为**可视化组件**
- ✅ 实现**丰富的用户交互**（点击、悬停、键盘）
- ✅ 添加**动画和过渡效果**
- ✅ 保持**高性能**（基于 Canvas 原生渲染）

### 架构设计

```
┌─────────────────────────────────────────────────────┐
│                  BaseColumnType                      │
│                   (基类)                              │
├─────────────────────────────────────────────────────┤
│  必须实现的接口：                                      │
│  • name          → 渲染器唯一标识                     │
│  • render()      → 自定义绘制逻辑 ⭐ 核心              │
├─────────────────────────────────────────────────────┤
│  可选实现的接口：                                      │
│  • editorType     → 编辑器类型                        │
│  • isInteractive  → 是否拦截键盘事件                 │
│  • format()       → 格式化显示值                     │
│  • validate()     → 数据验证                         │
│  • handleClick()  → 点击事件处理                    │
│  • handleHover()  → 悬停事件处理                    │
│  • handleKeydown()→ 键盘事件处理                    │
└─────────────────────────────────────────────────────┘
         ↓ 继承
┌─────────────────────────────────────────────────────┐
│              TrafficLightType                       │
│            (交通灯状态渲染器)                        │
└─────────────────────────────────────────────────────┘
```

---

## 🔧 API 参考手册

### 必须实现的接口

#### 1. `name` (getter)
返回渲染器的唯一标识符。

```javascript
get name() {
    return 'trafficLight';  // 唯一名称，用于列配置
}
```

#### 2. `render(context)` ⭐ 核心
自定义绘制逻辑，接收 CellRenderContext 对象。

**Context 对象属性：**

| 属性 | 类型 | 说明 |
|------|------|------|
| `ctx` | CanvasRenderingContext2D | Canvas 绑定上下文 |
| `x, y` | number | 单元格左上角坐标 |
| `width, height` | number | 单元格尺寸 |
| `value` | * | 原始数据值 |
| `displayValue` | string | 格式化后的显示文本 |
| `row, col` | number | 行列索引 |
| `isSelected` | boolean | 是否被选中 |
| `style` | object | 当前样式对象 |
| `sheet` | Sheet | 工作表实例 |

**Context 辅助方法：**

```javascript
context.getCenterY();           // 获取中心 Y 坐标
context.getPadding(sheet);      // 获取内边距
context.drawRoundedRect(...);   // 绘制圆角矩形
context.needsUpdate = true;     // 标记需要继续更新（动画）
```

**示例代码：**
```javascript
render(context) {
    const { ctx, x, y, width, height, value } = context;

    // 绘制背景
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(x, y, width, height);

    // 绘制内容
    ctx.fillStyle = '#333';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value || '', x + width/2, y + height/2);

    return undefined;
}
```

### 可选实现的接口

#### 3. `editorType` (getter)
指定编辑器类型。

| 值 | 说明 | 适用场景 |
|---|------|---------|
| `'text'` | 文本输入框 | 通用文本编辑 |
| `'numeric'` | 数字输入框 | 数值类型 |
| `'select'` | 下拉选择框 | 枚举值（如交通灯）|
| `'none'` | 无编辑器 | 纯展示或自定义交互 |

```javascript
get editorType() {
    return 'select';  // 使用下拉选择框
}
```

#### 4. `isInteractive` (getter)
标记是否为交互式类型。设为 `true` 时：
- KeyboardStrategy 会调用 `handleKeydown()` 而非默认导航
- 双击时不会弹出默认编辑器

```javascript
get isInteractive() {
    return true;  // 启用键盘支持
}
```

#### 5. `format(value)`
格式化原始值为显示文本（用于公式栏等）。

```javascript
format(value) {
    const map = { green: '正常', yellow: '警告', red: '危险' };
    return map[value] || String(value ?? '');
}
```

#### 6. `validate(value)`
验证数据有效性。

```javascript
validate(value) {
    if (value === '' || value == null) return true;
    if (!['green', 'yellow', 'red'].includes(value)) {
        return '必须是 green/yellow/red 之一';
    }
    return true;
}
```

#### 7. `handleClick(context, event)` 🖱️
处理鼠标点击事件。

```javascript
handleClick(context, event) {
    const { value } = context;

    // 计算新值
    const states = ['green', 'yellow', 'red'];
    const currentIndex = states.indexOf(value);
    const nextIndex = (currentIndex + 1) % states.length;
    const newValue = states[nextIndex];

    // 返回新值以更新单元格
    return newValue;  // 或返回 null 表示忽略
}
```

#### 8. `handleHover(context, event)` 🖱️
处理鼠标悬停事件。

```javascript
handleHover(context, event) {
    this._isHovered = true;
    return true;  // 需要重绘以显示悬停效果
}
```

#### 9. `handleMouseLeave()` 🖱️
处理鼠标移出事件。

```javascript
handleMouseLeave() {
    this._isHovered = false;
    return true;  // 需要重绘
}
```

#### 10. `handleKeydown(event, currentValue)` ⌨️
处理键盘事件（仅在 `isInteractive=true` 时生效）。

```javascript
handleKeydown(event, currentValue) {
    switch(event.key) {
        case 'ArrowRight':
            return 'nextState';  // 返回新值
        case '1':
            return 'green';      // 直接设置
        default:
            return null;         // 未处理，交由默认逻辑
    }
}
```

#### 11. `getDefaultStyle(baseStyle)`
获取默认样式。

```javascript
getDefaultStyle(baseStyle) {
    return {
        ...baseStyle,
        textAlign: 'left',
        cursor: 'pointer'  // 鼠标指针样式
    };
}
```

#### 12. `getEditorOptions()`
返回 select 编辑器的选项列表。

```javascript
getEditorOptions() {
    return [
        { value: 'green', label: '🟢 正常' },
        { value: 'yellow', label: '🟡 警告' },
        { value: 'red', label: '🔴 危险' }
    ];
}
```

---

## 🎬 进阶功能实现

### 1. 平滑动画系统

通过 `context.needsUpdate = true` 和时间戳计算实现：

```javascript
// 定义动画状态
#animationStartTime = null;
#targetState = null;
#animationOpacity = 1;

// 启动动画
#startAnimation(targetState) {
    this.#targetState = targetState;
    this.#animationStartTime = performance.now();
    this.#animationOpacity = 0.5;  // 从半透明开始
}

// 更新动画（在 render() 中调用）
#updateAnimation() {
    if (this.#animationStartTime === null) return 1;

    const elapsed = performance.now() - this.#animationStartTime;
    const progress = Math.min(elapsed / 250, 1);  // 250ms 持续时间

    // easeOutCubic 缓动函数
    const eased = 1 - Math.pow(1 - progress, 3);
    this.#animationOpacity = 0.5 + 0.5 * eased;

    if (progress >= 1) {
        this.#animationOpacity = 1;
        this.#animationStartTime = null;
    }

    return this.#animationOpacity;
}

// 在 render() 中使用
render(context) {
    const opacity = this.#updateAnimation();
    ctx.globalAlpha = opacity;

    // ... 绑定内容 ...

    // 标记需要继续更新
    if (this.#animationStartTime !== null) {
        context.needsUpdate = true;
    }

    return undefined;
}
```

### 2. 悬停发光效果

使用径向渐变模拟发光：

```javascript
// 在 render() 中检测悬停
if (this._isHovered) {
    ctx.save();

    // 外圈光晕
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);

    const glowGradient = ctx.createRadialGradient(
        cx, cy, radius,      // 内圈
        cx, cy, radius + 8   // 外圈
    );
    glowGradient.addColorStop(0, fillColor + '40');  // 25% 透明度
    glowGradient.addColorStop(1, fillColor + '00');  // 完全透明

    ctx.fillStyle = glowGradient;
    ctx.fill();

    ctx.restore();
}
```

### 3. 立体感高光

使用径向渐变增强立体感：

```javascript
// 内部高光
ctx.save();
ctx.beginPath();
ctx.arc(cx, cy, radius, 0, Math.PI * 2);
ctx.clip();  // 裁剪到圆形区域

const highlightGradient = ctx.createRadialGradient(
    cx - radius * 0.3, cy - radius * 0.3, 0,  // 高光点（左上）
    cx, cy, radius                             // 边缘
);
highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
highlightGradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

ctx.fillStyle = highlightGradient;
ctx.fill();
ctx.restore();
```

---

## ✨ 最佳实践清单

### ✅ 推荐做法

- [ ] 使用 `Math.max/min` 确保数值在有效范围内
- [ ] 所有坐标使用 `Math.round()` 避免亚像素模糊
- [ ] 使用 `ctx.save()/restore()` 保护绑定状态
- [ ] 提供合理的默认配置和 fallback 值
- [ ] 实现完整的 `validate()` 方法进行数据校验
- [ ] 支持 `options` 参数实现高度可定制
- [ ] 添加 JSDoc 注释提升代码可读性
- [ ] 考虑响应式设计（根据单元格大小自适应）
- [ ] 处理边界情况（null/undefined/非法值）
- [ ] 性能优化：避免在 render() 中创建对象

### ❌ 应避免的问题

- [ ] 忘记重置 `ctx.globalAlpha` 导致后续元素透明
- [ ] 直接修改 `context` 的属性（应只读取）
- [ ] 在 render() 中执行耗时操作（如网络请求）
- [ ] 硬编码颜色、尺寸等常量（应使用 options）
- [ ] 忽略边界情况（null/undefined/非法值）
- [ ] 未实现 `format()` 导致显示异常
- [ ] 过度复杂的绘制逻辑影响性能

---

## 📊 性能优化建议

### 1. 减少重复计算

```javascript
// ❌ 差：每次 render 都重新计算
render(context) {
    const size = Math.min(width, height) * 0.35;
    // ...
}

// ✅ 好：缓存计算结果（如果可能）
constructor(options = {}) {
    super(options);
    this._cachedSize = null;
}

render(context) {
    if (!this._cachedSize) {
        this._cachedSize = Math.min(context.width, context.height) * (this.options?.size || 0.35);
    }
    // ...
}
```

### 2. 使用离屏 Canvas（复杂场景）

对于非常复杂的渲染器，考虑使用离屏 Canvas：

```javascript
constructor(options = {}) {
    super(options);
    this._offscreenCanvas = document.createElement('canvas');
    this._offCtx = this._offscreenCanvas.getContext('2d');
}

render(context) {
    // 在离屏 Canvas 上绘制
    this._offCtx.clearRect(0, 0, width, height);
    // ... 绑制到 _offCtx ...

    // 一次性绘制到主 Canvas
    context.ctx.drawImage(this._offscreenCanvas, x, y);
}
```

### 3. 批量绘制

尽量减少 `ctx.beginPath()` 和 `ctx.fill()` 的调用次数：

```javascript
// ❌ 差：多次绑定
for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.arc(x[i], y[i], r, 0, Math.PI * 2);
    ctx.fillStyle = color[i];
    ctx.fill();
}

// ✅ 好：合并路径
ctx.beginPath();
for (let i = 0; i < 10; i++) {
    ctx.moveTo(x[i] + r, y[i]);
    ctx.arc(x[i], y[i], r, 0, Math.PI * 2);
}
ctx.fillStyle = commonColor;
ctx.fill();
```

---

## 🔍 调试技巧

### 1. 控制台日志

```javascript
render(context) {
    console.log('[TrafficLight] render:', {
        row: context.row,
        col: context.col,
        value: context.value,
        size: `${context.width}x${context.height}`
    });

    // ... 正常绑定逻辑 ...
}
```

### 2. 可视化调试边界

```javascript
render(context) {
    const { ctx, x, y, width, height } = context;

    // 调试用：绘制单元格边框
    if (process.env.NODE_ENV === 'development') {
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);

        // 绘制中心点
        ctx.fillStyle = 'blue';
        ctx.fillRect(x + width/2 - 2, y + height/2 - 2, 4, 4);
    }

    // ... 正常绑定逻辑 ...
}
```

### 3. 性能分析

```javascript
render(context) {
    const startTime = performance.now();

    // ... 绑制逻辑 ...

    const duration = performance.now() - startTime;
    if (duration > 16) {  // 超过一帧的时间（60fps）
        console.warn(`[TrafficLight] 渲染耗时过长: ${duration.toFixed(2)}ms`);
    }
}
```

---

## 📚 扩展阅读

### 相关文档
- [BaseColumnType API 文档](../src/types/BaseColumnType.js)
- [CellRenderContext 接口定义](../src/types/CellRenderContext.js)
- [内置渲染器源码](../src/types/renderers/)
- [KeyboardStrategy 键盘处理机制](../src/editor/strategies/KeyboardStrategy.js)

### 其他示例
- [StarRatingType 星级评分](../src/types/renderers/StarRatingType.js)
- [ProgressBarType 进度条](../src/types/renderers/ProgressBarType.js)
- [BooleanCheckboxType 复选框](../src/types/renderers/BooleanCheckboxType.js)

---

## ❓ 常见问题 FAQ

### Q1: 如何让我的渲染器支持撤销/重做？
A: 通过 `handleClick/handleKeydown` 返回的新值会自动经过 undo/redo 系统，无需额外处理。

### Q2: 如何在多个工作表间共享渲染器实例？
A: 渲染器类是无状态的（除了动画相关），可以安全地在多个工作表中复用同一个实例。

### Q3: render() 方法被调用的频率是多少？
A: 通常每秒 60 次（60fps），但在滚动、调整大小、动画期间会更频繁。确保你的渲染逻辑足够高效！

### Q4: 如何支持暗色主题？
A: 通过读取 `context.style` 或全局主题配置来动态调整颜色：

```javascript
render(context) {
    const isDarkTheme = context.sheet.options.theme === 'dark';
    const bgColor = isDarkTheme ? '#333' : '#fff';
    const textColor = isDarkTheme ? '#fff' : '#000';

    ctx.fillStyle = bgColor;
    // ...
}
```

### Q5: 可以在渲染器中使用异步操作吗？
A: ❌ 不建议！`render()` 方法应该是同步的。如需加载数据，请在初始化时预加载，或在 `handleClick` 中异步更新后触发重绘。

---

## 🎉 总结

通过本教程，你已经学会了：

✅ **基础概念**：理解自定义渲染器的架构和设计理念
✅ **核心接口**：掌握 12 个关键 API 的用法
✅ **实战案例**：完成了一个生产级的 TrafficLightType 渲染器
✅ **进阶技巧**：实现了动画、悬停效果、键盘支持
✅ **最佳实践**：了解了性能优化和调试技巧

现在你可以：
- 🚀 创建任何想象中的自定义渲染器
- 🎨 为你的应用添加独特的可视化组件
- 💡 提升用户体验和界面美观度

**下一步行动：**
1. 基于 TrafficLightType 创建你自己的渲染器变体
2. 尝试组合多个内置渲染器（如进度条 + 交通灯）
3. 将你的渲染器分享给社区！

---

## 📞 获取帮助

- 📖 查看完整 API 文档
- 💬 提交 Issue 或讨论
- 🌟 给项目点个 Star 支持一下！

---

**祝你编码愉快！** 🎨✨