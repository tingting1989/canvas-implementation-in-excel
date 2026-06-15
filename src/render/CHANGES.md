# ScrollManager.js & SheetTabBar.js 优化说明

## 整体目标
实现类似 Excel 底部操作栏的完整交互体验，涵盖 Sheet 的新增、编辑、删除、切换，以及横/纵滚动条的高性能自定义实现。

---

## 一、ScrollManager.js 优化

### 1. 滚动条轨道点击跳转
**原实现**：仅支持拖拽滑块滚动。
**优化后**：点击轨道空白区域，滑块跳一整页（Excel 行为）。通过 `#onTrackClick` 方法实现，区分点击目标是轨道还是滑块自身。

### 2. Shift + 滚轮水平滚动
**原实现**：仅处理 `deltaX` / `deltaY`，未考虑 Shift 修饰键。
**优化后**：检测 `e.shiftKey`，当按住 Shift 时，将垂直滚轮事件转为水平滚动，与 Excel 操作习惯一致。

### 3. 暴露 `enable()` 方法
**优化后**：新增 `enable(val)` 公共方法，允许外部动态开启/关闭滚动响应，方便在模态框、编辑态等场景下临时禁用。

### 4. 代码健壮性
- 新增 `#clamp()` 工具方法，统一所有数值边界校验
- 滚动比率计算抽离为 `#getHScrollRatio()` / `#getVScrollRatio()`，消除重复逻辑
- 更新滚动边界时自动修正当前 `scrollX/Y`，防止出现"内容缩短了但滚动条回不来"的 bug
- 垂直滚动条 `trackH` 计算修正：减去了 `SHEET_TAB_HEIGHT`，避免与底部 Sheet 栏重叠

### 5. 样式微调
- 滑块 cursor 改为 `grab`，激活态加粗，视觉反馈更明确
- 滑块 hover/active 状态统一使用 `transition` 平滑过渡

---

## 二、SheetTabBar.js 优化

### 1. 新增 Sheet（+ 按钮）
**原实现**：已有 `+` 按钮和点击回调，但缺少 `title` 提示。
**优化后**：增加 `title` 属性，hover 时显示"新增工作表"提示。

### 2. 编辑 Sheet 名称（双击重命名）
**原实现**：单击 + 400ms 内再次单击触发重命名，容易误触。
**优化后**：保持双击逻辑（更贴合 Excel 的 Tab 重命名习惯），同时：
- 输入框增加边框高亮与 `box-shadow`，明确处于编辑态
- Enter 确认 / Esc 取消，逻辑清晰
- 点击外部自动提交（blur 事件）

### 3. 删除 Sheet（× 按钮）
**原实现**：仅当 `sheets.size > 1` 时显示关闭按钮，逻辑正确。
**优化后**：关闭按钮增加 `title="删除此工作表"` 提示；删除前可通过外部回调做二次确认（由 `#onRemove` 回调决定）。

### 4. Tab 横向滚动
**原实现**：滚轮事件直接修改 `scrollOffset`，没有考虑滚轮方向判断的健壮性。
**优化后**：
- 优先取 `deltaX`，其次取 `deltaY`，适配不同鼠标/触控板
- `scrollToTab()` 重构为 `#scrollTabIntoView()`，逻辑更清晰
- `refresh()` 后自动将激活 tab 滚动到可视区域

### 5. 代码结构
- 抽离 `#createTabElement()` 方法，tab 创建逻辑集中管理
- 事件处理器统一在构造时绑定、destroy 时移除，防止内存泄漏
- 所有 `#handle*` 引用在 destroy 时置 null，便于 GC

---

## 三、交互对照 Excel

| 操作 | Excel 行为 | 本实现 |
|---|---|---|
| 点击 Sheet tab | 切换到该 Sheet | ✅ 单击切换 |
| 双击 Sheet tab | 进入重命名模式 | ✅ 双击重命名 |
| 点击 × | 删除该 Sheet | ✅ 单击删除 |
| 点击 + | 新建 Sheet | ✅ 新建 |
| 滚轮横向滚动 tab 栏 | 支持 | ✅ 支持 |
| 点击滚动条轨道 | 翻一页 | ✅ 支持 |
| Shift + 滚轮 | 水平滚动 | ✅ 支持 |
| 只剩一个 Sheet | 不显示关闭按钮 | ✅ 自动隐藏 |

