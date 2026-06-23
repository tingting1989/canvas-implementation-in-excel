# UILayer — UI 层

## 概述

`UILayer` 是渲染引擎的 **最顶层图层**（zIndex=4），负责渲染辅助性的 UI 元素，包括冻结分割线和开发调试信息面板。

## 类结构

```
BaseLayer
  └── UILayer (zIndex: 4)
        ├── debugMode: boolean     // 调试开关
        ├── #renderFreezeLines()   // 冻结分割线
        └── #renderDebugInfo()     // 调试信息面板
```

## 渲染内容

### 1. 冻结分割线

当工作表配置了冻结行列时，在冻结区域边界绘制绿色分割线：

```
┌──────────┬─────────────────────┐
│  Header   │     Col Header       │
├══════════┼─────────────────────┤  ← 水平冻结线 (#217346)
│          │                      │
│ Frozen   │                      │
│ Cols     │                      │
│          │                      │
├──────────┤                      │  ← 垂直冻结线 (#217346)
│ Frozen   │                      │
│ Rows     │                      │
│          │                      │
└──────────┴─────────────────────┘
```

**样式规格：**
- 颜色：`#217346`（Excel 经典绿）
- 线宽：`2px`
- 位置：紧贴冻结区域的外边界

### 2. 调试信息面板

开启 `debugMode = true` 后，在画布左上角显示：

```
[UILayer Debug] Total Layers: 5
  tiles (z:1) CLEAN renders:42
  frozen (z:2.5) DIRTY renders:15
  headers (z:3) CLEAN renders:38
  ui (z:4) CLEAN renders:38
  overlay (z:4) CLEAN renders:20
```

**样式规格：**
- 字体：`12px monospace`
- 颜色：`rgba(255, 0, 0, 0.8)`（半透明红）
- 位置：`(10, 20)` 开始，每行间隔 `16px`

## 图层层级

```
zIndex 4: UILayer         ← 【本层】最顶层
zIndex 4: OverlayLayer    ← 同级
zIndex 3: HeaderLayer
zIndex 2.5: FrozenLayer
zIndex 1: TileLayer       ← 最底层
```

## 状态监听

| 键 | 触发场景 |
|----|----------|
| `frozenOffset` | 冻结偏移量变化，分割线位置更新 |
| `editor` | 编辑器状态变化，调试信息更新 |

## 使用示例

```js
const uiLayer = new UILayer();

// 开启调试模式（开发阶段）
uiLayer.debugMode = true;

// 绑定到 RenderEngine
engine.addLayer(uiLayer);

// RenderEngine 传递 layers 列表给调试面板
uiLayer.render(ctx, sheet, viewport, {
    viewW, viewH,
    layers: engine.compositor.layers,
});
```

## 注意事项

- UILayer 的内容是纯装饰性的，不参与点击检测
- `debugMode` 应仅在开发环境开启，生产环境关闭
- 冻结线的颜色和线宽遵循 Excel 的经典设计风格