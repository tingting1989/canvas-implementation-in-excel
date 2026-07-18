# 🎯 InteractionPlugin - 单元格交互插件

## ✨ **核心价值**

将 **200+ 行手动事件处理代码** 简化为 **3 行配置**，自动为支持交互的单元格类型提供完整的鼠标交互功能！

---

## 📋 **目录**

- [快速开始](#快速开始)
- [功能特性](#功能特性)
- [API 文档](#api-文档)
- [配置选项](#配置选项)
- [渲染器接口规范](#渲染器接口规范)
- [使用示例](#使用示例)
- [性能优化](#性能优化)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

---

## 🚀 **快速开始**

### **安装（无需额外步骤）**

InteractionPlugin 已包含在 Canvas-Sheet 核心库中，无需单独安装。

### **基本用法**

```javascript
import { Workbook, StarRatingType, InteractionPlugin } from 'canvas-sheet';

// 1. 创建工作簿
const workbook = new Workbook({ canvas: document.getElementById('sheet') });
const sheet = workbook.getActiveSheet();

// 2. 加载插件（一行搞定！）
workbook.loadPluginClass(InteractionPlugin, {
    debugMode: false,
    throttleMs: 16  // 可选：限制重绘频率 ~60fps
});

// 3. 定义支持交互的渲染器
sheet.setColumnType(2, new StarRatingType({
    maxStars: 5,
    color: '#FFD700',
    emptyColor: '#CCCCCC'
}));

// ✅ 完事！现在自动拥有：
// - 鼠标悬停预览 ⭐
// - 点击设置评分 🖱️
// - 移出清除高亮 🚪
// - 错误隔离处理 🛡️
```

### **对比：传统方式 vs 插件方式**

#### ❌ **传统方式（需要 200+ 行代码）**

```javascript
// star-rating-demo-umd.html 中的完整实现

let lastHoveredCell = null;

canvas.addEventListener('mousemove', (event) => {
    try {
        const hitInfo = workbook.renderEngine.hitTest(event.clientX, event.clientY);
        if (!hitInfo || hitInfo.type !== 'cell') {
            if (lastHoveredCell) {
                clearHoverState(sheet, lastHoveredCell);
                lastHoveredCell = null;
            }
            return;
        }

        const { row, col } = hitInfo;
        const cellType = sheet.getCellTypeInstance(row, col);

        if (!cellType || cellType.name !== 'starRating') {
            if (lastHoveredCell) {
                clearHoverState(sheet, lastHoveredCell);
                lastHoveredCell = null;
            }
            return;
        }

        const context = createSimpleRenderContext(sheet, row, col);

        if (typeof cellType.handleHover === 'function') {
            const needsRedraw = cellType.handleHover(context, event);

            if (needsRedraw) {
                lastHoveredCell = `${row},${col}`;
                workbook.render();
            } else if (!lastHoveredCell) {
                lastHoveredCell = `${row},${col}`;
            }
        }
    } catch (error) {
        console.error('❌ 悬停处理错误:', error);
    }
});

// ... 还需要处理 click、mouseleave、边界情况、错误处理等 ...
```

#### ✅ **插件方式（只需 3 行）**

```javascript
workbook.loadPluginClass(InteractionPlugin, { debugMode: true });
sheet.setColumnType(2, new StarRatingType({ maxStars: 5 }));
// 完事！所有交互逻辑由插件自动管理 🎉
```

---

## 🎯 **功能特性**

| 特性 | 说明 | 传统方式 | 插件方式 |
|------|------|---------|---------|
| **鼠标悬停预览** | 移入星星时实时高亮显示将要设置的值 | 手动实现 | ✅ 自动 |
| **点击交互** | 点击星星直接设置评分 | 手动实现 | ✅ 自动 |
| **移出清除** | 鼠标离开时恢复实际值 | 手动实现 | ✅ 自动 |
| **状态管理** | 跨实例共享悬停状态 | 手动实现 | ✅ 自动 |
| **性能节流** | 限制重绘频率避免卡顿 | 无 | ✅ 内置 |
| **错误隔离** | 单元格错误不影响其他单元格 | 无 | ✅ 内置 |
| **调试日志** | 输出详细的交互过程信息 | 手动添加 | ✅ 配置项 |
| **生命周期管理** | 启用/禁用/销毁 | 手动管理 | ✅ 自动 |
| **多实例支持** | 多个表格独立运行 | 困难 | ✅ 原生 |

---

## 📖 **API 文档**

### **类：InteractionPlugin**

继承自 `BasePlugin`，遵循标准的插件生命周期。

#### **静态属性**

```javascript
static get PLUGIN_NAME() {
    return "interaction";  // 插件唯一标识符
}
```

#### **实例属性**

| 属性 | 类型 | 说明 |
|------|------|------|
| `lastHoveredCell` | `string \| null` | 当前悬停的单元格位置（格式："行,列"） |
| `enabled` | `boolean` | 插件是否启用 |
| `initialized` | `boolean` | 插件是否已初始化 |
| `options` | `object` | 插件配置对象 |

#### **实例方法**

##### **`clearHoverAndRender()`**
手动清除当前悬停状态并触发重绘

```javascript
interactionPlugin.clearHoverAndRender();
```

**使用场景**：
- 外部代码修改了单元格数据后需要立即更新显示
- 切换工作表或滚动视图时清理残留状态

---

## ⚙️ **配置选项**

```javascript
workbook.loadPluginClass(InteractionPlugin, {
    // 调试模式（输出详细日志到控制台）
    debugMode: false,

    // 重绘节流时间（毫秒）
    // 0 = 不限制，16 ≈ 60fps，33 ≈ 30fps
    throttleMs: 16,

    // 是否在需要时自动调用 render()
    autoRender: true,

    // 仅处理指定类型的渲染器（空数组表示全部）
    supportedTypes: ['starRating']  // 可选：['starRating', 'slider', 'colorPicker']
});
```

### **详细说明**

#### **`debugMode`** 🔍
- **类型**: `boolean`
- **默认值**: `false`
- **作用**: 开启后在控制台输出详细的交互日志
- **适用场景**: 开发调试、问题排查

**日志示例**:
```
[InteractionPlugin] ✅ 插件初始化完成 { debugMode: true, throttleMs: 16, ... }
[InteractionPlugin] 🧹 清除悬停状态: 12,2
[InteractionPlugin] ⭐ 点击处理成功 [12, 2] = 4
```

#### **`throttleMs`** ⚡
- **类型**: `number`
- **默认值**: `0`（不限制）
- **作用**: 限制重绘调用的最小间隔时间
- **推荐值**:
  - `0`: 不限制（适合简单场景）
  - `16`: ~60fps（流畅动画）
  - `33`: ~30fps（平衡性能）

**原理**:
```javascript
// 如果 throttleMs = 16，则 16ms 内多次 needsRedraw 只触发一次 render()
if (now - lastRenderTime < 16) {
    setTimeout(() => render(), 16 - (now - lastRenderTime));
}
```

#### **`autoRender`** 🎨
- **类型**: `boolean`
- **默认值**: `true`
- **作用**: 是否在检测到需要重绘时自动调用 `render()`
- **关闭场景**: 外部需要完全控制渲染时机

**关闭后的用法**:
```javascript
workbook.loadPluginClass(InteractionPlugin, { autoRender: false });

// 手动监听变化并自行决定何时渲染
setInterval(() => {
    if (interactionPlugin.lastHoveredCell) {
        workbook.render();
    }
}, 100);
```

#### **`supportedTypes`** 🎯
- **类型**: `string[]`
- **默认值**: `[]`（处理所有类型）
- **作用**: 白名单过滤，仅处理指定名称的渲染器
- **使用场景**: 性能优化、避免不必要的检查

**示例**:
```javascript
// 只处理星级评分和滑块类型的单元格
supportedTypes: ['starRating', 'slider']

// 处理所有类型（默认行为）
supportedTypes: []
```

---

## 🔌 **渲染器接口规范**

要让自定义渲染器与 InteractionPlugin 配合工作，需要实现以下方法：

### **必需接口**

#### **`handleHover(context, event)` → boolean**
处理鼠标悬停事件

**参数**:
- `context`: 渲染上下文对象 `{ x, y, width, height, value, isEditing, row, col }`
- `event`: 原生 MouseEvent 对象

**返回值**:
- `true`: 悬停状态已更新，需要重绘
- `false`: 无变化，无需重绘

**示例（StarRatingType）**:
```javascript
handleHover(context, event) {
    const mouseX = event.offsetX - context.x;  // 单元格内相对坐标
    const mouseY = event.offsetY - context.y;

    for (let i = 0; i < this.options.maxStars; i++) {
        const starX = this.#getStarX(i);  // 计算第 i 颗星的 X 坐标
        if (mouseX >= starX && mouseX <= starX + this.starSize &&
            mouseY >= starY && mouseY <= starY + this.starSize) {

            const newHoverRating = i + 1;

            if (this.#hoverRating !== newHoverRating) {
                this.#hoverRating = newHoverRating;
                StarRatingType.hoverState(`${context.row},${context.col}`, newHoverRating);
                console.log(`✅ 悬停预览: ${newHoverRating} 星`);
                return true;  // 需要重绘！
            }

            return false;  // 状态未变
        }
    }

    // 鼠标不在任何星星上
    if (this.#hoverRating !== null) {
        this.#hoverRating = null;
        StarRatingType.hoverState(`${context.row},${context.col}`, null);
        return true;  // 需要重绘以清除高亮
    }

    return false;
}
```

#### **`handleClick(context, event)` → any**
处理点击事件

**参数**: 同 `handleHover`

**返回值**:
- 有效值: 表示操作成功（如新的评分值）
- `null/undefined`: 未处理或无效操作

**示例**:
```javascript
handleClick(context, event) {
    const mouseX = event.offsetX - context.x;
    const mouseY = event.offsetY - context.y;

    for (let i = 0; i < this.options.maxStars; i++) {
        if (this.#isInStar(mouseX, mouseY, i)) {
            const newRating = i + 1;
            console.log(`⭐ 设置评分: ${newRating}`);
            return newRating;  // 返回有效值表示成功
        }
    }

    return null;  // 未点击星星区域
}
```

#### **`handleMouseLeave()` → void**
处理鼠标离开事件（可选）

**用途**:
- 清理临时状态
- 取消正在进行的动画
- 重置 UI 到初始状态

**示例**:
```javascript
handleMouseLeave() {
    this.#hoverRating = null;
    this.#cancelAnimation();
    console.log('🚪 鼠标离开');
}
```

---

## 💡 **使用示例**

### **示例 1：基本星级评分**

```html
<canvas id="sheet"></canvas>
<script>
import { Workbook, StarRatingType, InteractionPlugin } from 'canvas-sheet';

const workbook = new Workbook({
    canvas: document.getElementById('sheet'),
    width: 800,
    height: 600
});

const sheet = workbook.getActiveSheet();

sheet.data = [
    ["产品", "评分"],
    ["产品A", 4],
    ["产品B", 5],
    ["产品C", 3]
];

sheet.setColumnType(1, new StarRatingType({ maxStars: 5 }));

workbook.loadPluginClass(InteractionPlugin);

workbook.render();
</script>
```

### **示例 2：带调试和性能优化**

```javascript
workbook.loadPluginClass(InteractionPlugin, {
    debugMode: true,          // 开发阶段开启
    throttleMs: 16,           // 限制 60fps
    autoRender: true,         // 自动重绘
    supportedTypes: []        // 处理所有交互类型
});
```

### **示例 3：动态启用/禁用**

```javascript
const plugin = workbook.loadPluginClass(InteractionPlugin);

// 禁用交互（例如在编辑模式下）
plugin.disable();

// 重新启用
plugin.enable();

// 完全销毁（释放资源）
plugin.destroy();
```

### **示例 4：多列不同配置**

```javascript
const sheet = workbook.getActiveSheet();

// 用户评分：5 颗星，金色
sheet.setColumnType(2, new StarRatingType({
    maxStars: 5,
    color: '#FFD700',
    emptyColor: '#E0E0E0'
}));

// 专家评分：10 颗星，蓝色
sheet.setColumnType(3, new StarRatingType({
    maxStars: 10,
    color: '#2196F3',
    emptyColor: '#BBDEFB'
}));

// 推荐指数：3 颗心形（假设有 HeartRatingType）
sheet.setColumnType(4, new HeartRatingType({
    maxHearts: 3,
    color: '#E91E63'
}));

// 所有这些渲染器的交互都由 InteractionPlugin 统一管理！
workbook.loadPluginClass(InteractionPlugin);
```

---

## ⚡ **性能优化**

### **内置优化机制**

#### **1. 事件节流（Throttling）**
```javascript
// 默认不限制，可配置
workbook.loadPluginClass(InteractionPlugin, { throttleMs: 16 });

// 效果：即使 mousemove 每秒触发 60+ 次，
//       render() 最多只调用 60 次（16ms 间隔）
```

#### **2. 智能重绘**
```javascript
// 只有当 handleHover/handleClick 返回 true 时才触发重绘
if (needsRedraw) {
    this.#scheduleRender();  // 带节流的重绘调度
}
```

#### **3. 类型过滤**
```javascript
// 如果页面只有星级评分需要交互，可以跳过其他类型
workbook.loadPluginClass(InteractionPlugin, {
    supportedTypes: ['starRating']
});

// 减少不必要的 getCellTypeInstance() 调用
```

#### **4. 批量状态清理**
```javascript
// mouseleave 时一次性清理所有状态
handleMouseLeave() {
    if (this.#lastHoveredCell) {
        // 通知渲染器清理
        cellType.handleMouseLeave();
        // 清除内部状态
        this.#clearHoverState();
        // 触发一次重绘
        this.#scheduleRender();
    }
}
```

### **性能对比**

| 场景 | 传统方式 | InteractionPlugin |
|------|---------|-------------------|
| **mousemove 事件数** | 全量处理 | 智能分发 |
| **render() 调用次数** | 可能频繁重复 | 节流控制 |
| **内存占用** | 每个页面独立闭包 | 共享插件实例 |
| **GC 压力** | 高（频繁创建临时对象） | 低（复用 context 对象） |

---

## 🏆 **最佳实践**

### **✅ 推荐**

1. **始终加载插件**
   ```javascript
   // 在应用启动时统一加载
   app.init(() => {
       workbook.loadPluginClass(InteractionPlugin);
   });
   ```

2. **开发时开启调试**
   ```javascript
   if (process.env.NODE_ENV === 'development') {
       workbook.loadPluginClass(InteractionPlugin, { debugMode: true });
   }
   ```

3. **生产环境关闭调试并开启节流**
   ```javascript
   workbook.loadPluginClass(InteractionPlugin, {
       debugMode: false,
       throttleMs: 16  // 平衡流畅度和性能
   });
   ```

4. **配合其他插件使用**
   ```javascript
   workbook.loadPluginClass(AutoFillPlugin);
   workbook.loadPluginClass(InteractionPlugin);
   workbook.loadPluginClass(ClipboardPlugin);
   // 插件之间互不干扰，协同工作
   ```

### **⚠️ 避免**

1. **不要重复注册事件**
   ```javascript
   // ❌ 错误：手动注册了 mousemove，又加载了插件
   canvas.addEventListener('mousemove', handler);
   workbook.loadPluginClass(InteractionPlugin);  // 会冲突！

   // ✅ 正确：只使用插件
   workbook.loadPluginClass(InteractionPlugin);
   ```

2. **不要忘记销毁**
   ```javascript
   // ❌ 错误：组件卸载时未清理
   componentWillUnmount() {
       // 忘记调用 plugin.destroy()
   }

   // ✅ 正确：完整清理
   componentWillUnmount() {
       interactionPlugin?.destroy();
   }
   ```

3. **不要在 handleHover 中执行耗时操作**
   ```javascript
   // ❌ 错误：同步执行复杂计算
   handleHover(context, event) {
       const result = heavyCalculation();  // 阻塞主线程！
       return true;
   }

   // ✅ 正确：缓存或异步处理
   handleHover(context, event) {
       if (!this.#cache[key]) {
           this.#cache[key] = heavyCalculation();
       }
       return true;
   }
   ```

---

## ❓ **常见问题**

### **Q1: 插件会影响不支持交互的渲染器吗？**

**A:** 不会。插件会先检查渲染器是否存在对应的方法：

```javascript
if (typeof cellType.handleHover === 'function') {
    cellType.handleHover(context, event);
}
// 没有 handleHover 的渲染器会被跳过
```

### **Q2: 可以同时使用多个交互插件吗？**

**A:** 可以，但需要注意事件冲突。建议只使用一个 InteractionPlugin，通过 `supportedTypes` 过滤需要的类型。

### **Q3: 如何自定义交互行为？**

**A:** 有两种方式：

1. **扩展渲染器**（推荐）：在自定义渲染器中实现 `handleHover/handleClick`
2. **继承插件**：创建 InteractionPlugin 子类覆盖 `#handleMouseMove` 方法

### **Q4: 插件的性能开销大吗？**

**A:** 很小。主要开销是：
- 每次 mousemove 调用 `hitTest()` （~0.1ms）
- 调用 `getCellTypeInstance()` （~0.05ms）

对于大多数应用可以忽略不计。如果确实遇到性能问题，可以使用 `throttleMs` 和 `supportedTypes` 优化。

### **Q5: 支持触屏设备吗？**

**A:** 当前版本仅支持鼠标事件。未来版本计划添加 touch 事件支持。

**临时解决方案**：
```javascript
// 将 touch 事件转换为 mouse 事件
canvas.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
});
```

---

## 🔄 **版本历史**

### **v1.0.0 (2026-07-18)**
- ✅ 初始版本发布
- ✅ 支持 mousemove/click/mouseleave 事件分发
- ✅ 内置性能节流和错误隔离
- ✅ 支持调试模式和详细日志
- ✅ 完整的生命周期管理

### **Roadmap (规划中)**
- 🔄 Touch 事件支持（移动端适配）
- 🔄 键盘导航增强
- 🔄 右键菜单集成
- 🔄 拖拽排序支持
- 🔄 无障碍访问（ARIA）增强

---

## 📞 **技术支持**

- **文档**: 见本文件及代码注释
- **示例**: `examples/star-rating-with-plugin.html`
- **源码**: `src/plugins/InteractionPlugin.js`
- **Issue**: 请在 GitHub Issues 中提交问题

---

## 📄 **许可证**

MIT License - 详见项目根目录 LICENSE 文件

---

## 🙏 **贡献指南**

欢迎提交 PR 和 Issue！开发流程：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

**🎉 感谢使用 InteractionPlugin！让复杂的交互变得简单优雅！**