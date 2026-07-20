# 🚀 Workbook 自动初始化特性 (autoInit)

## 📋 概述

**版本**: v1.0.14+  
**状态**: ✅ 已发布  
**向后兼容**: ✅ 完全兼容

从 v1.0.14 开始，`Workbook` 构造函数支持 **自动初始化** 功能，默认会在构造时自动完成渲染引擎的初始化和首次渲染。

---

## 🎯 使用方式

### 1️⃣ **自动初始化（推荐）** - 默认行为

```javascript
import { Workbook } from '@canvas-sheet/core';

const workbook = new Workbook(document.getElementById('container'), {
    width: 1200,
    height: 800,
    
    sheets: [{
        name: 'Sheet1',
        data: [['Hello', 'World']]
    }]
});

// ✨ 完成！无需手动调用 initRender() 和 render()
// 工作簿已经可以正常使用了
```

**适用场景：**
- ✅ 大多数常规使用场景
- ✅ 快速原型开发
- ✅ 简单的单页应用
- ✅ 配置在构造时就已确定的情况

---

### 2️⃣ **延迟初始化（高级用法）**

```javascript
import { Workbook } from '@canvas-sheet/core';

const workbook = new Workbook(document.getElementById('container'), {
    autoInit: false,  // ❌ 禁用自动初始化
    width: 1200,
    height: 800
});

// ... 在这里进行额外的配置 ...

// 注册自定义插件
workbook.registerPlugin('myPlugin', MyPluginClass);

// 添加 hooks
workbook.addHook('afterSelection', (row, col) => {
    console.log(`Selected: ${row}, ${col}`);
});

// 动态加载数据
workbook.activeSheet.loadData(largeDataSet);

// ✅ 现在手动初始化
workbook.initRender();  // 初始化渲染引擎、编辑器、事件系统
workbook.render();      // 触发首次渲染
```

**适用场景：**
- ⚙️ 需要在初始化前进行复杂配置
- ⚙️ 动态加载插件或模块
- ⚙️ 条件性初始化（如用户登录后）
- ⚙️ 性能敏感的大型应用（延迟加载）
- ⚙️ 需要精确控制初始化时机

---

## 🔧 配置选项详解

### `autoInit` 选项

| 值 | 类型 | 默认值 | 说明 |
|---|------|--------|------|
| `true` | boolean | ✅ `true` | 构造函数自动调用 `initRender()` + `render()` |
| `false` | boolean | | 禁用自动初始化，需手动调用 |

### 完整配置示例

```javascript
const workbook = new Workbook(container, {
    // ... 其他配置 ...
    
    autoInit: true,              // 是否自动初始化（默认 true）
    
    afterInit: (wb) => {         // 初始化完成回调（在 initRender() 内部调用）
        console.log('Workbook ready!', wb);
        
        // 可以在这里执行初始化后的逻辑
        wb.addHook('afterChange', (changes) => {
            console.log('Cells changed:', changes);
        });
    }
});
```

---

## 📊 迁移指南

### 从旧版本升级

#### ✅ 无需修改（推荐）

如果你的代码已经是这样：

```javascript
const wb = new Workbook(container, options);
wb.initRender();
wb.render();
```

**升级后完全兼容！** 多余的 `initRender()` 和 `render()` 调用会被安全忽略（因为内部有防重复检查）。

#### 🔄 可选优化（简化代码）

可以选择移除手动调用：

```javascript
// 旧写法
const wb = new Workbook(container, options);
wb.initRender();
wb.render();

// 新写法（更简洁）
const wb = new Workbook(container, options);  // 自动完成所有初始化
```

---

## ⚙️ 技术细节

### 初始化流程对比

#### 自动初始化流程 (`autoInit: true`)

```
new Workbook(element, options)
    │
    ├─→ 1. 创建基础结构（sheets map、保存 options）
    │
    ├─→ 2. 检测 autoInit !== false
    │       │
    │       ▼
    │   this.initRender()
    │       │
    │       ├─→ 2.1 创建/初始化工作表（从 options.sheets）
    │       ├─→ 2.2 创建 RenderEngine
    │       ├─→ 2.3 创建 EditorManager
    │       ├─→ 2.4 创建 EventHandler（绑定事件）
    │       ├─→ 2.5 创建 PluginManager
    │       ├─→ 2.6 加载待处理的插件（loadPlugin 缓存）
    │       ├─→ 2.7 应用初始配置（options.columns, data 等）
    │       ├─→ 2.8 设置滚动回调
    │       ├─→ 2.9 设置工作表标签栏
    │       └─→ 2.10 触发 afterInit 回调 + WORKBOOK_INIT 事件
    │
    └─→ 3. this.render()
            │
            └─→ 触发首次 Canvas 渲染
            
✅ 工作簿就绪！
```

#### 手动初始化流程 (`autoInit: false`)

```
new Workbook(element, { autoInit: false })
    │
    └─→ 1. 仅创建基础结构（sheets map、保存 options）
        ✅ 渲染引擎等子系统尚未创建
    
    ... 用户可在此期间进行额外配置 ...
    
    wb.initRender()  ← 用户手动触发
    wb.render()      ← 用户手动触发
    
✅ 工作簿就绪！
```

---

## 💡 最佳实践

### 场景 1：简单应用（95% 的情况）

```javascript
function initSpreadsheet() {
    const container = document.getElementById('spreadsheet');
    
    const workbook = new Workbook(container, {
        width: window.innerWidth - 40,
        height: window.innerHeight - 100,
        
        sheets: [{
            name: '数据表',
            startRows: 100,
            startCols: 26,
            
            columns: [
                { type: 'text', width: 150 },
                { type: 'numeric', width: 100 },
                { type: 'starRating', width: 200, options: { maxStars: 5 } }
            ]
        }]
    });
    
    // ✅ 直接使用，无需额外初始化
    return workbook;
}
```

### 场景 2：需要条件初始化

```javascript
async function initApp() {
    const container = document.getElementById('app');
    
    // 先创建但不初始化
    const workbook = new Workbook(container, {
        autoInit: false
    });
    
    // 等待用户登录
    const user = await authenticateUser();
    
    if (user.hasPermission('spreadsheet')) {
        // 根据权限动态配置
        workbook.activeSheet.loadData(user.data);
        workbook.loadPlugin('advancedFeatures');
        
        // 现在才初始化
        workbook.initRender();
        workbook.render();
    } else {
        showAccessDeniedMessage();
    }
}
```

### 场景 3：性能优化（大型数据集）

```javascript
function loadLargeDataset(dataset) {
    const container = document.getElementById('grid');
    
    const workbook = new Workbook(container, {
        autoInit: false  // 延迟初始化以提升感知性能
    });
    
    // 显示加载指示器
    showLoadingIndicator('正在准备数据...');
    
    // 使用 requestIdleCallback 在浏览器空闲时初始化
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
            workbook.activeSheet.loadData(dataset);
            workbook.initRender();
            workbook.render();
            hideLoadingIndicator();
        }, { timeout: 2000 });
    } else {
        setTimeout(() => {
            workbook.activeSheet.loadData(dataset);
            workbook.initRender();
            workbook.render();
            hideLoadingIndicator();
        }, 100);
    }
}
```

---

## ⚠️ 注意事项

### 1. **防重复调用机制**

`initRender()` 内部有防重复检查：

```javascript
initRender() {
    if (this.renderEngine) return;  // 避免重复初始化
    // ... 初始化逻辑
}
```

所以即使多次调用也是安全的：
```javascript
wb.initRender();  // ✅ 正常执行
wb.initRender();  // ⚠️ 安全跳过（不会报错）
```

### 2. **afterInit 回调时机**

无论使用哪种方式，`afterInit` 回调都在 `initRender()` **内部**最后执行：

```javascript
const wb = new Workbook(container, {
    afterInit(wb) {
        console.log(wb.renderEngine);      // ✅ 已创建
        console.log(wb.editor);             // ✅ 已创建
        console.log(wb.eventHandler);       // ✅ 已创建
        console.log(wb.pluginManager);      // ✅ 已创建
        
        // 此时可以安全地使用所有子系统
        wb.addHook('afterChange', handler);
    }
});
```

### 3. **插件加载顺序**

对于需要在 `initRender()` 前注册的插件：

```javascript
const wb = new Workbook(container, {
    autoInit: false  // 必须先禁用自动初始化
});

// 注册全局插件类
Workbook.registerPlugin('myPlugin', MyPlugin);

// 或通过实例加载
wb.loadPluginClass(AnotherPlugin);

// 现在可以安全初始化了
wb.initRender();
wb.render();
```

或者使用配置方式（推荐）：

```javascript
const wb = new Workbook(container, {
    plugins: ['copyPaste', 'contextMenu'],  // ✅ 这些会在 initRender() 内部自动加载
    pluginOptions: {
        contextMenu: { enabled: true }
    }
});
// autoInit=true 时，插件会按预期加载和初始化
```

---

## 🐛 常见问题

### Q1: 升级后我的代码会报错吗？

**A:** 不会！完全向后兼容。旧的调用方式仍然有效：

```javascript
// 这些代码在 v1.0.14+ 中仍然正常工作
const wb = new Workbook(container, opts);
wb.initRender();  // 安全跳过（已自动执行）
wb.render();      // 安全执行（触发重新渲染）
```

### Q2: 什么时候应该使用 `autoInit: false`？

**A:** 当你需要满足以下任一条件时：
- 在初始化前动态注册插件或 hooks
- 需要等待异步操作完成（如用户认证、数据加载）
- 实现懒加载或代码分割
- 精确控制初始化时机以优化性能

### Q3: `autoInit` 会影响性能吗？

**A:** 几乎没有影响。差异仅在于：
- `autoInit: true`: 初始化发生在构造函数同步执行期间
- `autoInit: false`: 初始化推迟到你显式调用 `initRender()` 时

总初始化时间和资源消耗完全相同。

### Q4: 可以在 `autoInit: false` 后切换回自动模式吗？

**A:** 不行。`autoInit` 只在构造函数读取一次。但你可以随时手动调用：

```javascript
const wb = new Workbook({ autoInit: false });
// ... 配置 ...
wb.initRender();  // 手动初始化
```

---

## 📝 更新日志

### v1.0.14 (2026-07-19)
- ✅ 新增 `autoInit` 选项（默认 `true`）
- ✅ Workbook 构造函数支持自动初始化
- ✅ 完全向后兼容，无需修改现有代码
- ✅ 更新文档和示例

---

## 🔗 相关文档

- [API 参考 - Workbook](./api-docs/workbook_Workbook.js.html)
- [快速开始指南](../README.md)
- [插件系统文档](./plugins/README.md)
- [迁移指南](./Migration-Guide.md)

---

**维护者**: @jiangsuiting  
**最后更新**: 2026-07-19  
**许可证**: Apache-2.0