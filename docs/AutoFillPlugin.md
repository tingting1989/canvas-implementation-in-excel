# AutoFillPlugin — 自动填充插件

## 概述

`AutoFillPlugin` 是自动填充插件，继承自 `BasePlugin`。它实现了类似 Excel 的"拖拽填充"功能——用户按住选区右下角的填充手柄（绿色小方块）拖拽，即可将源选区的内容按规则自动填充到目标区域。

## 文件位置

```
src/plugins/AutoFillPlugin.js
src/editor/strategies/AutoFillStrategy.js
```

## 核心功能

| 功能 | 说明 |
|------|------|
| 拖拽填充手柄 | 按住选区右下角绿色小方块拖拽进行自动填充 |
| 数值序列递增 | 纯数值选区自动检测步长并递增（1,2,3 → 4,5,6） |
| 非数值复制 | 文本、空值等非数值内容直接复制 |
| 多行多列循环填充 | 多行多列选区按模式循环填充到目标区域 |
| 四方向填充 | 支持向下、向上、向右、向左四个方向拖拽填充 |
| 实时预览 | 拖拽过程中实时显示填充预览选区 |
| 光标反馈 | 悬停填充手柄时显示十字光标（crosshair） |

## 填充规则详解

### 步长检测

`AutoFillStrategy.#detectStep(values)` 分析源选区每行/列的数值序列，自动计算步长：

| 源数据 | 检测步长 | 填充结果（向下 3 格） |
|--------|---------|----------------------|
| `1, 2, 3` | `1` | `4, 5, 6` |
| `2, 4, 6` | `2` | `8, 10, 12` |
| `10, 20` | `10` | `30, 40, 50` |
| `5`（单值） | `1` | `6, 7, 8` |
| `"a", "b"` | `0`（含非数值） | `"a", "b", "a"` |
| `1, "x"` | `0`（含非数值） | `1, "x", 1` |

**检测逻辑**：
1. 过滤出数值类型值，若存在非数值 → 步长为 0（直接复制）
2. 单个数值 → 步长为 1（自动递增）
3. 多个数值 → 计算相邻差值的平均值作为步长

### 循环填充

当目标区域超过源选区长度时，按源模式循环填充：

```
源选区: [1, 2, 3]   步长: 1   源长度: 3

向下填充 6 格:
  第 1 轮: 4, 5, 6    (base + step × srcLen × 1)
  第 2 轮: 7, 8, 9    (base + step × srcLen × 2)
```

### 方向判定

拖拽时根据鼠标位置相对于源选区右下角的偏移判定方向：

| 偏移 | 方向 | 说明 |
|------|------|------|
| `dr > 0, dc === 0` | `down` | 向下填充 |
| `dr < 0, dc === 0` | `up` | 向上填充 |
| `dc > 0, dr === 0` | `right` | 向右填充 |
| `dc < 0, dr === 0` | `left` | 向左填充 |
| `dr ≠ 0, dc ≠ 0` | 以 `dr` 方向为主 | 对角拖拽按垂直方向填充 |

## 类结构

```
AutoFillPlugin extends BasePlugin
├── 静态属性
│   └── PLUGIN_NAME              → "autoFill"
├── 实例字段（私有）
│   └── #strategy                → AutoFillStrategy | null
├── 生命周期方法
│   ├── init(options?)
│   ├── destroy()
│   ├── enable()
│   └── disable()
└── 继承自 BasePlugin
    ├── workbook / sheet / eventHandler 等 getter
    ├── addHook / addStrategy / addDOMEvent
    └── render / getPlugin
```

## API 参考

### init(options)

初始化自动填充插件。创建 `AutoFillStrategy` 并注册到事件处理器。

```js
init(options = {})
```

**参数**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `options.enabled` | `boolean` | `true` | 是否默认启用 |

**初始化流程**：
1. 调用 `super.init(options)` 保存配置
2. 创建 `AutoFillStrategy` 实例
3. 通过 `addStrategy("autoFill", strategy)` 注册到 `EventHandler`（自动追踪，`destroy` 时自动清理）
4. 若 `options.enabled === false`，立即调用 `disable()`

### destroy()

销毁插件。清空策略引用，由基类 `removeOwnStrategies()` 自动移除已注册的策略。

```js
plugin.destroy();
```

**销毁流程**：
1. `this.#strategy = null` — 释放策略引用
2. `super.destroy()` — 自动清理钩子、策略、DOM 事件等资源

### enable()

启用自动填充。同步调用策略的 `enable()` 方法，恢复填充手柄交互。

```js
plugin.enable();
```

### disable()

禁用自动填充。同步调用策略的 `disable()` 方法，填充手柄不再响应拖拽。

```js
plugin.disable();
```

## 使用方式

### 方式 1：通过全局注册加载

```js
import { PluginManager } from './plugins/PluginManager.js';
import { AutoFillPlugin } from './plugins/AutoFillPlugin.js';

PluginManager.register('autoFill', AutoFillPlugin);
workbook.loadPlugin('autoFill');
```

### 方式 2：直接加载插件类

```js
workbook.loadPluginClass(AutoFillPlugin);
```

### 配置式加载

```js
const wb = new Workbook('grid', {
    plugins: ['autoFill'],
    pluginOptions: {
        autoFill: { enabled: true }
    }
});
```

### 运行时控制

```js
// 禁用自动填充
workbook.disablePlugin('autoFill');

// 重新启用
workbook.enablePlugin('autoFill');

// 卸载插件
workbook.unloadPlugin('autoFill');
```

## 交互流程

```
用户操作                     AutoFillStrategy 处理
─────────                    ─────────────────────

鼠标悬停填充手柄      →     #onCursorCheck()
                             ├─ 命中 → 设置 crosshair 光标
                             └─ 未命中 → 恢复默认光标

鼠标按下填充手柄      →     #onMouseDown()
                             ├─ fillHandleHitTest 命中
                             ├─ 记录源选区 (#sourceRange)
                             ├─ 进入填充状态 (#filling = true)
                             └─ return false（阻止 MouseStrategy 处理）

拖拽移动              →     #onMouseMove()
                             ├─ 计算填充方向 (#fillDirection)
                             ├─ 计算目标终点 (#fillEndRow / #fillEndCol)
                             ├─ 更新选区显示预览
                             └─ return false（阻止 MouseStrategy 处理）

鼠标松开              →     #onMouseUp()
                             ├─ 计算目标范围 (#computeTargetRange)
                             ├─ 执行填充 (#executeFill)
                             │   ├─ 读取源选区值
                             │   ├─ 检测步长 (#detectStep)
                             │   ├─ 按列/行填充 (#fillColumn / #fillRow)
                             │   │   └─ 计算填充值 (#computeValue / #computeValueReverse)
                             │   └─ beginBatch / endBatch（批量操作，一次撤销）
                             ├─ 恢复选区到源+目标范围
                             ├─ 清空填充状态
                             └─ 失效缓存并重绘
```

## AutoFillStrategy 内部方法

| 方法 | 说明 |
|------|------|
| `#onCursorCheck(e)` | 光标样式检测，悬停填充手柄时切换为十字光标 |
| `#onMouseDown(e)` | 检测填充手柄点击，进入填充拖拽状态 |
| `#onMouseMove(e)` | 拖拽过程中计算填充方向和目标范围，实时预览 |
| `#onMouseUp(e)` | 松开鼠标时执行填充逻辑 |
| `#computeTargetRange(src)` | 根据方向计算目标填充范围 |
| `#executeFill(sheet, src, target)` | 执行填充：读取源值 → 检测步长 → 按方向填充 |
| `#detectStep(values)` | 检测数值序列步长 |
| `#fillColumn(sheet, src, target, colOffset, step, srcColValues, dir)` | 按列填充（向下/向上） |
| `#fillRow(sheet, src, target, rowOffset, step, srcRowValues, dir)` | 按行填充（向右/向左） |
| `#computeValue(srcValues, srcIdx, step, cycle, srcLen)` | 正向填充值计算 |
| `#computeValueReverse(srcValues, srcIdx, step, cycle, srcLen)` | 反向填充值计算（向上/向左） |

## 光标所有权机制

`AutoFillStrategy` 实现了光标所有权管理，避免与其他策略的光标冲突：

```
设置光标时:
  → canvas.style.cursor = "crosshair"
  → #cursorOwned = true
  → return false（阻止低优先级策略覆盖）

离开填充手柄时:
  → 仅在 #cursorOwned === true 时才清除光标
  → 避免误清其他策略设置的光标
```

## 策略优先级

`AutoFillStrategy` 的优先级为 **90**（较高），确保填充手柄事件优先于普通选区策略（`MouseStrategy`）处理。当填充手柄被点击时，`return false` 阻止低优先级策略处理同一事件。

## 生命周期

```
init(options)
    │
    ├── 创建 AutoFillStrategy
    ├── 注册到 EventHandler（addStrategy 自动追踪）
    └── 检查 enabled 状态
    │
    ▼
[启用状态]
    │
    ├── enable()   → strategy.enable()
    │                 填充手柄可交互
    │
    └── disable()  → strategy.disable()
                      填充手柄不响应
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
          └── AutoFillPlugin
                └── AutoFillStrategy        ← 拖拽交互逻辑
                      └── EventHandler
                            └── MouseStrategy（低优先级，被 return false 阻止）

RenderEngine
    ├── fillHandleHitTest(x, y)   ← 填充手柄命中检测
    └── hitTest(x, y)             ← 坐标→行列转换

Sheet
    ├── selection.getRange()       ← 获取当前选区
    ├── selection.setRange()       ← 设置选区（预览）
    ├── cellStore.get(r, c)        ← 读取单元格值
    ├── setCell(r, c, value)       ← 写入填充值
    ├── beginBatch() / endBatch()  ← 批量操作（一次撤销）
    └── render()                   ← 触发重绘
```

## 设计要点

1. **插件与策略解耦**：`AutoFillPlugin` 仅负责生命周期管理（创建、注册、启用/禁用、销毁），所有交互逻辑由 `AutoFillStrategy` 独立管理。策略的启用/禁用通过 `enable()`/`disable()` 同步。
2. **资源自动清理**：利用 `BasePlugin` 的 `addStrategy()` 追踪机制，`destroy()` 时自动移除策略，避免内存泄漏。
3. **光标所有权**：策略内部维护 `#cursorOwned` 标记，仅在自身曾设置光标时才清除，避免误清其他策略的光标状态。
4. **优先级隔离**：策略优先级 90 高于普通选区策略，填充手柄点击和拖拽事件通过 `return false` 阻止低优先级策略处理，确保交互互斥。
5. **批量操作**：填充写入使用 `beginBatch()`/`endBatch()` 包裹，所有填充单元格作为一次操作，用户一次撤销即可恢复。
6. **配置驱动**：通过 `options.enabled` 控制初始状态，支持声明式配置和命令式 API 两种控制方式。

## 相关文档

- [BasePlugin.md](./BasePlugin.md) — 插件基类详细文档
- [plugin-system.md](./plugin-system.md) — 插件系统完整架构