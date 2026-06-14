# Canvas Sheet

基于 Canvas 的在线表格编辑器（Handsontable/Excel 级架构）

## 工程结构

```
src/
├── api/                    # 公共 API（新增）
│   └── index.js            # 统一对外导出
├── core/
│   ├── constants.js        # 常量配置
│   └── utils.js            # 工具函数（新增）
├── editor/
│   ├── InputEditor.js      # 编辑器管理器
│   ├── EventHandler.js     # 事件处理器
│   ├── ClipboardManager.js # 剪贴板管理
│   ├── editors/            # 编辑器类型
│   │   ├── CellEditor.js
│   │   ├── TextEditor.js
│   │   └── index.js
│   └── strategies/         # 事件策略
│       ├── EventStrategy.js
│       ├── MouseStrategy.js
│       ├── KeyboardStrategy.js
│       ├── ScrollStrategy.js
│       └── index.js
├── model/
│   ├── Cell.js
│   ├── Chunk.js
│   ├── ChunkedCellStore.js
│   ├── Command.js
│   ├── SetCellCommand.js
│   ├── ToggleDisableCommand.js
│   ├── HistoryStack.js
│   ├── MergeManager.js
│   ├── SelectionManager.js
│   ├── ConditionalRule.js
│   └── index.js
├── render/
│   ├── RenderEngine.js
│   └── RenderUtils.js      # 渲染工具（新增）
├── types/                  # 类型定义（新增）
│   └── index.js
├── workbook/
│   ├── Workbook.js
│   └── Sheet.js
└── main.js
```

## 功能清单

| 功能 | 状态 |
|---|---|
| 虚拟滚动（双向） | ✅ |
| Chunk 二维分块稀疏存储 | ✅ |
| 浮动 Input 编辑器（Excel 体验） | ✅ |
| 双击 / Enter / F2 编辑 | ✅ |
| 方向键 / Tab 导航 | ✅ |
| 行号 / 列头 | ✅ |
| 合并单元格（基础） | ✅ |
| 复制 / 粘贴（Sheet 间） | ✅ |
| Undo / Redo (Command 模式) | ✅ |
| 禁用单元格 | ✅ |
| 行 / 列样式 | ✅ |
| 条件格式（rule-based） | ✅ |
| 数据绑定样式 | ✅ |
| StylePool Flyweight | ✅ |
| 多 Sheet（Workbook） | ✅ |

## 快捷键

| 快捷键 | 功能 |
|---|---|
| 方向键 | 移动选区 |
| Enter | 编辑 / 确认 |
| F2 | 编辑 |
| Tab / Shift+Tab | 横向跳转 |
| Ctrl+Z | 撤销 |
| Ctrl+Y | 重做 |
| 双击 | 编辑 |
| 单击 | 选中 |

## 运行

```bash
npm install
npx webpack
# 在浏览器中打开 index.html
```
