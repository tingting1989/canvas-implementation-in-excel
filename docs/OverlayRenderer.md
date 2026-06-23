# OverlayRenderer — 叠加层渲染器

## 概述

`OverlayRenderer` 是一个 **纯渲染工具类**（不是 Layer 子类），负责绘制所有叠加在单元格数据之上的视觉效果。它被 `FrozenLayer` 和 `OverlayLayer` 共同复用，避免代码重复。

## 设计定位

```
┌─────────────────────────────────────────┐
│              OverlayRenderer             │
│  （工具类，无 Layer 生命周期）            │
│                                         │
│  ├─ renderMerges()     合并单元格边框    │
│  └─ renderSelection()  完整选区效果      │
│      ├─ 范围高亮                        │
│      ├─ 行列头高亮                      │
│      ├─ 活动单元格高亮                  │
│      ├─ 选区边框                        │
│      ├─ 填充手柄                        │
│      └─ 拖拽参考线（可选）               │
└─────────────────────────────────────────┘
```

## 为什么不是 Layer？

| 特征 | Layer 子类 | OverlayRenderer |
|------|-----------|-----------------|
| 生命周期管理 | ✅ init/destroy | ❌ 无需 |
| 独立 Canvas | ✅ 可选 | ❌ 共享父级 ctx |
| zIndex 排序 | ✅ 参与 | ❌ 不参与 |
| 状态监听 | ✅ watch() | ❌ 无需 |
| 复用需求 | ❌ 独占 | ✅ 多处复用 |

## 公共 API

### `setResizeLine(type, position)`
设置拖拽参考线状态。

- **type**: `HIT_TYPE.COL_RESIZE` 或 `HIT_TYPE.ROW_RESIZE`
- **position**: 相对于表头边缘的像素位置

### `clearResizeLine()`
清除拖拽参考线。

### `getResizeLine()`
获取当前参考线状态。

### `renderMerges(ctx, sheet, vt)`
渲染所有可见合并单元格的 2px 蓝色边框。

### `renderSelection(ctx, sheet, vt, viewW, viewH)`
渲染完整选区叠加效果（6 个步骤）。

## 视觉层次

```
第6层: 拖拽参考线（蓝色虚线 [4,3]）
第5层: 填充手柄（5×5 蓝色方块）
第4层: 选区边框（2px 蓝色实线）
第3层: 活动单元格高亮（rgba 0.12）
第2层: 行列头高亮（rgba 0.18）
第1层: 范围高亮（rgba 0.08）
```

## 颜色规范

| 元素 | 颜色值 | 用途 |
|------|--------|------|
| 范围高亮 | `rgba(76,139,245,0.08)` | 最底层背景 |
| 行列头高亮 | `rgba(76,139,245,0.18)` | 中层背景 |
| 活动单元格 | `rgba(76,139,245,0.12)` | 焦点单元格 |
| 边框/手柄 | `CONFIG.SELECTION_COLOR` | `#4c8bf5` |
| 拖拽参考线 | `#4c8bf5` | 虚线模式 |

## 使用示例

```js
// 在 FrozenLayer 中使用
class FrozenLayer extends BaseLayer {
    constructor() {
        this.overlayRenderer = new OverlayRenderer();
    }

    render(ctx, sheet, viewport, options) {
        // ... clip 区域 ...
        this.overlayRenderer.renderMerges(ctx, sheet, viewport);
        this.overlayRenderer.renderSelection(ctx, sheet, viewport, viewW, viewH);
    }
}

// 在 RenderEngine 中控制拖拽参考线
engine.setResizeLine(HIT_TYPE.COL_RESIZE, 100);
// ... 渲染 ...
engine.clearResizeLine();
```