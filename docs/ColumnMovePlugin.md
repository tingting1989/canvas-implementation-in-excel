# ColumnMovePlugin — 列拖拽移动插件

## 概述

`ColumnMovePlugin` 是列拖拽移动插件，继承自 `BaseMovePlugin`。它实现了类似 Excel / Handsontable ManualColumnMove 的功能——用户拖拽列头即可移动整列数据到目标位置，拖拽过程中实时显示幽灵列和插入指示器。

## 与 Handsontable 的对应关系

| 本项目 | Handsontable | 说明 |
|--------|-------------|------|
| `ColumnMovePlugin` | `ManualColumnMove` | 列拖拽移动插件 |
| `beforeColumnMove` 钩子 | `beforeColumnMove` | 移动前拦截（可取消） |
| `afterColumnMove` 钩子 | `afterColumnMove` | 移动后通知 |
| `pluginOptions.columnMove.enabled` | `manualColumnMove: true/false` | 启用/禁用 |

## 文件位置

```
src/plugins/ColumnMovePlugin.js
src/editor/strategies/ColumnMoveStrategy.js
```

## 核心功能

| 功能 | 说明 |
|------|------|
| 拖拽列头移动 | 按住列头拖拽即可移动整列数据 |
| 拖拽阈值 | 鼠标移动超过 3px 才进入拖拽状态，避免误触 |
| 幽灵列渲染 | 拖拽过程中显示半透明的列预览（委托 DragRenderer） |
| 插入指示器 | 拖拽过程中在目标位置显示绿色插入指示线 |
| 光标反馈 | 悬停列头显示 `grab`，拖拽中显示 `grabbing` |
| 钩子拦截 | `beforeColumnMove` 可返回 `false` 取消移动 |
| 选区跟随 | 移动完成后选区自动调整到新位置 |

## 类结构

```
ColumnMovePlugin extends BaseMovePlugin extends BasePlugin
├── 静态属性
│   └── PLUGIN_NAME              → "columnMove"
├── 模板方法
│   └── _createStrategy()        → new ColumnMoveStrategy(eventHandler)
└── 继承自 BaseMovePlugin
    ├── init(options?)
    ├── destroy()
    ├── enable()
    └── disable()
```

## API 参考

### `_createStrategy()`

覆盖基类的模板方法，返回 `ColumnMoveStrategy` 实例。

```js
/** @override */
_createStrategy() {
    return new ColumnMoveStrategy(this.eventHandler);
}
```

### 继承的生命周期方法

以下方法由 `BaseMovePlugin` 提供，`ColumnMovePlugin` 无需覆盖：

#### `init(options?)`

初始化插件，创建 `ColumnMoveStrategy` 并注册到 `EventHandler`。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `options.enabled` | `boolean` | `true` | 是否初始启用 |

**执行流程**：
1. `super.init(options)` — 保存配置
2. `_createStrategy()` — 创建 `ColumnMoveStrategy` 实例
3. `addStrategy("columnMove", strategy)` — 注册到 `EventHandler`（自动追踪）
4. 若 `options.enabled === false`，立即调用 `disable()`

#### `destroy()`

销毁插件，清空策略引用后调用 `super.destroy()` 自动清理所有注册资源。

#### `enable()`

启用插件，同步启用 `ColumnMoveStrategy`，用户可拖拽列头移动列。

#### `disable()`

禁用插件，同步禁用 `ColumnMoveStrategy`，列头拖拽不响应。

## 使用方式

### 配置式加载

```js
const wb = new Workbook('grid', {
    plugins: ['columnMove'],
    pluginOptions: {
        columnMove: { enabled: true }
    }
});
```

### 同时加载行移动和列移动

```js
const wb = new Workbook('grid', {
    plugins: ['rowMove', 'columnMove'],
    pluginOptions: {
        rowMove: { enabled: true },
        columnMove: { enabled: true }
    }
});
```

### 运行时控制

```js
const colMove = wb.getPlugin('columnMove');

// 禁止拖拽移动列
colMove.disable();

// 恢复拖拽移动列
colMove.enable();

// 卸载插件
wb.unloadPlugin('columnMove');
```

## 交互流程

```
用户操作                     ColumnMoveStrategy 处理
─────────                    ─────────────────────

鼠标悬停列头          →     #onHover()
                             ├─ 命中列头 → 设置 grab 光标
                             └─ 离开列头 → 恢复默认光标

鼠标按下列头          →     #onMouseDown()
                             ├─ 排除调整列宽区域（headerHitTest）
                             ├─ 记录源列 (#sourceCol)
                             ├─ 记录鼠标起始 X 坐标
                             └─ 进入 mousedown 状态 (#moving = true)

拖拽移动（< 3px）     →     #onMouseMove()
                             └─ 未超过阈值，不进入拖拽

拖拽移动（≥ 3px）     →     #onMouseMove()
                             ├─ 进入拖拽状态 (#dragStarted = true)
                             ├─ 光标切换为 grabbing
                             ├─ 计算目标列 (#targetCol)
                             ├─ 传递状态给 DragRenderer
                             │   └─ setColumnMoveState({ sourceCol, targetCol,
                             │       dragX, dragStartX, headerW, scrollX,
                             │       colX, colW })
                             ├─ 失效缓存并重绘
                             └─ return false（阻止低优先级策略）

鼠标松开              →     #onMouseUp()
                             ├─ 清除指示器
                             ├─ 触发 beforeColumnMove 钩子（可取消）
                             │   └─ 返回 false → 取消移动，重置状态
                             ├─ 执行 sheet.moveCol(sourceCol, targetCol)
                             ├─ 调整选区到新位置
                             ├─ 触发 afterColumnMove 钩子
                             ├─ 重置拖拽状态
                             └─ 失效缓存并重绘
```

## ColumnMoveStrategy 内部方法

| 方法 | 说明 |
|------|------|
| `#onMouseDown(e)` | 列头区域按下，记录源列和起始坐标 |
| `#onHover(e)` | 悬停列头时显示 `grab` 光标，管理光标所有权 |
| `#onMouseMove(e)` | 拖拽过程中更新目标列、传递渲染状态 |
| `#onMouseUp(e)` | 松开时执行移动、调整选区、触发钩子 |
| `#clearIndicator()` | 清除 DragRenderer 中的列移动指示器 |

## ColumnMoveStrategy 私有状态

| 字段 | 类型 | 说明 |
|------|------|------|
| `#moving` | `boolean` | 是否处于 mousedown 状态（尚未超过阈值） |
| `#dragStarted` | `boolean` | 是否已进入真正的拖拽状态（移动距离 ≥ 3px） |
| `#sourceCol` | `number` | 拖拽源列索引 |
| `#targetCol` | `number` | 拖拽目标列索引 |
| `#dragStartX` | `number` | 拖拽起始时鼠标在 canvas 内的 X 坐标 |
| `#mouseDownX` | `number` | mousedown 时鼠标在屏幕上的 X 坐标（用于阈值计算） |
| `#cursorOwned` | `boolean` | 是否由本策略设置了光标（光标所有权管理） |

## 策略优先级

`ColumnMoveStrategy` 的优先级为 **80**，高于 `RowMoveStrategy`（79）。当同时加载行移动和列移动插件时，列移动优先处理，避免冲突。

## 钩子事件

| 钩子名 | 常量 | 触发时机 | 参数 | 可拦截 |
|--------|------|---------|------|--------|
| `beforeColumnMove` | `HOOKS.BEFORE_COLUMN_MOVE` | 列移动前 | `(sourceCol, targetCol)` | 是（返回 `false` 取消） |
| `afterColumnMove` | `HOOKS.AFTER_COLUMN_MOVE` | 列移动后 | `(sourceCol, targetCol)` | 否 |

### 钩子使用示例

```js
// 拦截列移动
wb.hooks.addHook(HOOKS.BEFORE_COLUMN_MOVE, (sourceCol, targetCol) => {
    console.log(`即将移动: 第 ${sourceCol} 列 → 第 ${targetCol} 列`);
    // 返回 false 可取消移动
});

// 监听列移动完成
wb.hooks.addHook(HOOKS.AFTER_COLUMN_MOVE, (sourceCol, targetCol) => {
    console.log(`已完成移动: 第 ${sourceCol} 列 → 第 ${targetCol} 列`);
});
```

## 选区调整逻辑

列移动完成后，选区自动跟随移动方向调整：

```
向右移动（delta > 0）:
  新 topCol = 原 topCol + 1
  新 bottomCol = 原 bottomCol + 1

向左移动（delta < 0）:
  新 topCol = 原 topCol
  新 bottomCol = 原 bottomCol
  （源列移走后左侧列左移，选区起始不变）
```

## 光标所有权机制

`ColumnMoveStrategy` 实现了光标所有权管理，避免与其他策略的光标冲突：

```
悬停列头时:
  → canvas.style.cursor = "grab"
  → #cursorOwned = true
  → return false（阻止低优先级策略覆盖）

离开列头时:
  → 仅在 #cursorOwned === true 时才清除光标
  → 避免误清其他策略设置的光标
```

## 生命周期

```
init(options)
    │
    ├── _createStrategy() → new ColumnMoveStrategy(eventHandler)
    ├── addStrategy("columnMove", strategy)
    └── 检查 enabled 状态
    │
    ▼
[启用状态]
    │
    ├── enable()   → strategy.enable()
    │                 列头可拖拽移动
    │
    └── disable()  → strategy.disable()
                      列头拖拽不响应
    │
    ▼
destroy()
    ├── #strategy = null
    └── super.destroy() → 自动移除策略
```

## 与相关模块的关系

```
Workbook
    └── PluginManager
          └── ColumnMovePlugin
                └── ColumnMoveStrategy         ← 拖拽交互逻辑
                      └── EventHandler

RenderEngine
    ├── hitTest(x, y)                        ← 坐标→命中类型+索引
    ├── headerHitTest(x, y)                  ← 调整列宽区域检测
    └── headerRenderer.dragRenderer
          └── setColumnMoveState(state)       ← 幽灵列+插入指示器渲染

Sheet
    ├── moveCol(sourceCol, targetCol)         ← 执行列数据移动
    ├── selection.getRange() / setRange()     ← 选区调整
    ├── getHeaderWidth()                      ← 列头区域宽度
    └── rowColManager
          ├── getColX(col)                    ← 源列 X 坐标
          └── getColWidth(col)                ← 源列宽度
```

## 行移动 vs 列移动对比

| 特性 | RowMoveStrategy | ColumnMoveStrategy |
|------|----------------|-------------------|
| 优先级 | 79 | 80 |
| 操作区域 | 行头 | 列头 |
| 命中类型 | `HIT_TYPE.ROW_HEADER` | `HIT_TYPE.COL_HEADER` |
| 拖拽轴 | Y 轴 | X 轴 |
| 数据移动 | `sheet.moveRow()` | `sheet.moveCol()` |
| 渲染委托 | `setRowMoveState()` | `setColumnMoveState()` |
| 前置钩子 | `BEFORE_ROW_MOVE` | `BEFORE_COLUMN_MOVE` |
| 后置钩子 | `AFTER_ROW_MOVE` | `AFTER_COLUMN_MOVE` |
| 选区调整 | topRow / bottomRow | topCol / bottomCol |

## 设计要点

1. **模板方法模式**：`ColumnMovePlugin` 仅覆盖 `_createStrategy()` 注入 `ColumnMoveStrategy`，所有生命周期逻辑由 `BaseMovePlugin` 统一管理，逻辑零重复。
2. **策略与插件解耦**：策略独立管理拖拽交互逻辑，插件仅负责生命周期。策略的启用/禁用通过 `enable()`/`disable()` 同步。
3. **拖拽阈值**：3px 的移动阈值避免单击列头时误触发拖拽，只有明确拖拽意图才进入拖拽状态。
4. **渲染委托**：幽灵列和插入指示器的渲染委托给 `DragRenderer.setColumnMoveState()`，策略只负责交互逻辑和状态传递，职责清晰。
5. **钩子拦截**：`beforeColumnMove` 钩子通过 `runHooksUntil` 执行，任一回调返回 `false` 即可取消移动，支持外部业务逻辑控制。
6. **光标所有权**：`#cursorOwned` 标记确保仅在自身曾设置光标时才清除，避免误清其他策略的光标状态。
7. **优先级设计**：列移动优先级 80 高于行移动 79，同时拖拽时列移动优先处理。

## 相关文档

- [BaseMovePlugin.md](./BaseMovePlugin.md) — 行/列移动基类详细文档
- [RowMovePlugin.md](./RowMovePlugin.md) — 行拖拽移动插件文档
- [BasePlugin.md](./BasePlugin.md) — 插件基类详细文档
- [DragIndicatorLayer.md](./DragIndicatorLayer.md) — 拖拽指示器渲染文档
- [plugin-system.md](./plugin-system.md) — 插件系统完整架构