# Canvas Sheet


## 发布

### 1.版本设置

```shell
npm version patch # 1.0.0 → 1.0.1

npm version minor # 1.0.0 → 1.1.0


npm version major # 1.0.0 → 2.0.0
```


### 2.执行发布

```shell
npm publish
```


### 3.删除私服中的npm 包

```shell
npm unpublish zmxa-web-handsontable-6.2.2 --registry=http://10.124.26.35:4873/ --force
```


## 检查发布包体积

```shell
npm pack
```


## 项目中使用
```shell
npm install @canvas-sheet/core
```

## npm 镜像源

### 镜像源管理

通过 nrm 包来管理

#### 安装
```shell
npm install -g nrm
```

#### 查看可用镜像源
```shell
nrm ls
```

#### 输出示例：

    npm ---------- https://registry.npmjs.org/

    yarn --------- https://registry.yarnpkg.com/

    tencent ------ https://mirrors.cloud.tencent.com/npm/

    cnpm --------- https://r.cnpmjs.org/

    taobao ------- https://registry.npmmirror.com/

    npmMirror ---- https://skimdb.npmjs.com/registry/

### 测试镜像源速度
```shell
nrm test
```

### 切换镜像源
```shell
nrm use tencent
```

### 添加自定义镜像源
```shell
nrm add zmxa http://10.124.26.35:4873/
```

### 删除镜像源
```shell
nrm del my-registry
```

### 查看镜像源
```shell
npm config get registry
``` 

### 切换到淘宝镜像
```shell
npm config set registry https://registry.npmmirror.com/ 
```

### 切换回官方源

```shell
npm config set registry https://registry.npmjs.org/
```

### 切换私有镜像源
```shell
npm config set registry http://10.124.26.35:4873/
```


node 版本为 22.21.0




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

| 功能                       | 状态 |
|--------------------------|----|
| 虚拟滚动（双向）                 | ✅  |
| Chunk 二维分块稀疏存储           | ✅  |
| 浮动 Input 编辑器（Excel 体验）   | ✅  |
| 双击 / Enter / F2 编辑       | ✅  |
| 方向键 / Tab 导航             | ✅  |
| 行号 / 列头                  | ✅  |
| 合并单元格（基础）                | ✅  |
| 复制 / 粘贴（Sheet 间）         | ✅  |
| Undo / Redo (Command 模式) | ✅  |
| 禁用单元格                    | ✅  |
| 行 / 列样式                  | ✅  |
| 条件格式（rule-based）         | ✅  |
| 数据绑定样式                   | ✅  |
| StylePool Flyweight      | ✅  |
| 多 Sheet（Workbook）        | ✅  |

## 快捷键

| 快捷键             | 功能      |
|-----------------|---------|
| 方向键             | 移动选区    |
| Enter           | 编辑 / 确认 |
| F2              | 编辑      |
| Tab / Shift+Tab | 横向跳转    |
| Ctrl+Z          | 撤销      |
| Ctrl+Y          | 重做      |
| 双击              | 编辑      |
| 单击              | 选中      |

## 运行

```bash
npm install
npx webpack
# 在浏览器中打开 index.html
```

## 项目插件系统
项目参考了 Handsontable 的插件设计，提供了一套完整的插件体系，包含三层架构：
```text


┌─────────────────────────────────────────────────────┐
│                    Workbook (顶层)                    │
│  registerPlugin / loadPlugin / getPlugin / unload    │
├─────────────────────────────────────────────────────┤
│                 PluginManager (管理器)                │
│  全局注册表 + 实例管理 + 生命周期                      │
├─────────────────────────────────────────────────────┤
│                  BasePlugin (基类)                    │
│  addHook / addStrategy / addDOMEvent + 自动清理      │
├─────────────────────────────────────────────────────┤
│              EventStrategy (策略层)                   │
│  getEventHandlers + priority + enable/disable        │
└─────────────────────────────────────────────────────┘

```