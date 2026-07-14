# FilterPlugin 使用指南 - 列头筛选图标

## 🎯 快速开始

### 1. 注册插件（在应用启动时）

```javascript
import { FilterPlugin } from "./plugins/FilterPlugin.js";

// 在 Workbook 创建后注册
const workbook = new Workbook();
workbook.registerPlugin(FilterPlugin);

// 获取插件实例并初始化
const filterPlugin = workbook.getPlugin("filter");
filterPlugin.init({
    enabled: true,
    dropdownWidth: 240,
    dropdownMaxHeight: 360,
    iconRenderer: {
        iconSize: 12,
        iconPadding: 6
    }
});
```

### 2. 自动显示筛选图标

**✅ 无需额外代码！**

FilterPlugin 会自动：
- ✅ 在每个列头右侧绘制漏斗图标
- ✅ 有筛选时显示蓝色 (#1890ff)
- ✅ 无筛选时显示灰色 (#999)
- ✅ 点击图标打开筛选面板

## 🔍 视觉效果

```
┌─────────────────────────────────────┐
│    A     │  B ▼  │  C ▼  │  D ▼  │   ← 列头 + 漏斗图标
├──────────┼───────┼───────┼───────┤
│          │       │       │       │
│  数据...  │ 数据..│ 数据..│ 数据..│
│          │       │       │       │
└─────────────────────────────────────┘

图例:
  ▼ = 灰色漏斗 (无筛选)
  🔵 = 蓝色漏斗 (有活跃筛选)
```

## 🎨 图标样式配置

```javascript
filterPlugin.init({
    iconRenderer: {
        iconSize: 14,      // 图标大小 (默认: 12)
        iconPadding: 8,    // 内边距 (默认: 6)
        activeColor: "#1890ff",  // 活跃颜色 (默认: #1890ff)
        inactiveColor: "#999"    // 非活跃颜色 (默认: #999)
    }
});
```

## 🖱️ 交互流程

1. **鼠标悬停**: 图标高亮（可选增强）
2. **点击图标**: 
   - 打开 FilterDropdown 面板
   - 显示该列的唯一值列表
3. **勾选/取消勾选**: 选择要显示的值
4. **点击确定**: 应用筛选
5. **图标变蓝**: 表示该列有活跃筛选

## ⚙️ 高级用法

### 手动刷新图标状态

```javascript
// 刷新特定列的图标
filterPlugin.refreshHeaderIcon(0); // 刷新 A 列

// 强制重绘所有图标
filterPlugin.clearAllFilters(); // 这会触发全部刷新
```

### 禁用/启用图标渲染

```javascript
// 禁用筛选功能（图标消失）
filterPlugin.disable();

// 重新启用（图标重新出现）
filterPlugin.enable();
```

### 自定义 Canvas 绘制（高级）

如果你想完全自定义绘制逻辑：

```javascript
// 扩展 FilterPlugin
class CustomFilterPlugin extends FilterPlugin {
    #drawCustomIcon(ctx, colIndex, x, y, width, height) {
        // 自定义绘制代码...
        // 例如：绘制下拉箭头而不是漏斗
        
        ctx.save();
        ctx.fillStyle = this.#getIconColor(colIndex);
        
        // 绘制三角形箭头
        const size = 10;
        const iconX = x + width - size - 6;
        const iconY = y + (height - size) / 2;
        
        ctx.beginPath();
        ctx.moveTo(iconX, iconY);
        ctx.lineTo(iconX + size, iconY);
        ctx.lineTo(iconX + size / 2, iconY + size);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }
}
```

## 🐛 故障排查

### 问题：图标不显示

**检查清单：**
1. ✅ 插件已注册: `workbook.registerPlugin(FilterPlugin)`
2. ✅ 插件已初始化: `filterPlugin.init({ enabled: true })`
3. ✅ 插件已启用: `filterPlugin.enable()`
4. ✅ renderEngine 存在: `console.log(filterPlugin.renderEngine)`
5. ✅ headerRenderer 可用: `console.log(filterPlugin.renderEngine?.headerRenderer)`

**调试代码：**
```javascript
console.log("FilterPlugin enabled:", filterPlugin.enabled);
console.log("Render engine:", filterPlugin.renderEngine);
console.log("Header renderer:", filterPlugin.renderEngine?.headerRenderer);
console.log("Sheet filter state:", sheet.filterState);
```

### 问题：图标颜色不变

**可能原因：**
- 筛选状态未正确更新
- 表头层未强制重绘

**解决方案：**
```javascript
// 手动触发重绘
filterPlugin.refreshHeaderIcon(0); // 刷新特定列

// 或者
filterPlugin.getFilterUIManager()?.closeDropdown();
```

### 问题：点击图标无反应

**检查项：**
1. FilterStrategy 是否注册成功
2. EventHandler 是否正常工作
3. 控制台是否有错误信息

## 📊 性能优化建议

### 大量列时的优化

如果表格有大量列（>50），可以考虑：

```javascript
filterPlugin.init({
    iconRenderer: {
        iconSize: 10,  // 减小图标尺寸
        iconPadding: 4 // 减小内边距
    },
    // 只在可见列绘制图标（需要自定义实现）
});
```

### 缓存策略

FilterPlugin 已经内置了缓存机制：
- 筛选状态缓存
- 唯一值缓存
- 图标状态缓存

无需额外优化。

## 🔗 相关文档

- [完整设计文档](./design/FilterPlugin-Design.md)
- [集成指南](./src/plugins/filter/INTEGRATION.md)
- [API 参考](./src/plugins/filter/CODE_REVIEW.md)

---

**最后更新**: 2026-07-14  
**版本**: v1.0.0 (Canvas Icon Integration)
