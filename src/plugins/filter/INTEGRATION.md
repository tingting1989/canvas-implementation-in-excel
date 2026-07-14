# FilterPlugin 集成指南

## 快速开始

### 1. 注册插件

```javascript
import { FilterPlugin } from "./plugins/FilterPlugin.js";

const workbook = new Workbook();
workbook.registerPlugin(FilterPlugin);
```

### 2. 初始化插件

```javascript
const filterPlugin = workbook.getPlugin("filter");
filterPlugin.init({
    enabled: true,
    dropdownWidth: 240,
    dropdownMaxHeight: 360
});
```

### 3. 使用示例

#### 打开筛选面板

```javascript
// 方法1：通过 UI Manager
const uiManager = filterPlugin.getFilterUIManager();
uiManager.openDropdown(0, { x: 100, y: 100 });

// 方法2：直接调用
filterPlugin.openDropdown(0, { x: 100, y: 100 });
```

#### 程序化设置筛选

```javascript
const filterState = sheet.filterState;

// 值列表筛选
filterState.setColumnFilter(0, {
    type: "values",
    uncheckedValues: new Set(["Alice", "Bob"])
});

// 条件筛选
filterState.setColumnFilter(1, {
    type: "condition",
    operator: "gt",
    value: "25"
});

// 应用隐藏行
const engine = filterPlugin.getFilterEngine();
const hiddenRows = engine.computeHiddenRows();
sheet.setHiddenRows(hiddenRows);
```

#### 清除筛选

```javascript
// 清除单列
filterState.removeColumnFilter(0);

// 清除所有
filterState.clearAll();

// 通过 UI Manager
uiManager.closeDropdown();
```

## 架构说明

### 组件关系

```
FilterPlugin (主插件)
├── FilterState (状态管理)
├── FilterUIManager (UI 管理)
│   ├── FilterEngine (筛选引擎)
│   └── FilterDropdown (下拉面板)
│       └── VirtualValueList (虚拟滚动)
└── FilterStrategy (事件处理)

PopupPanel (公共基类) ← FilterDropdown 继承此基类
```

### 数据流

```
用户点击 → FilterStrategy.handle()
         ↓
    FilterUIManager.openDropdown()
         ↓
    FilterEngine.extractUniqueValues() [提取唯一值]
         ↓
    FilterDropdown.show() [显示面板]
         ↓
用户操作（勾选/条件输入）
         ↓
    FilterUIManager.#onApply()
         ↓
    FilterState.setColumnFilter() [保存状态]
         ↓
    FilterEngine.computeHiddenRows() [计算隐藏行]
         ↓
    sheet.setHiddenRows() [应用到视图]
```

## 配置选项

### 完整配置项

```javascript
const options = {
    // 基础配置
    enabled: true,
    
    // 下拉面板尺寸
    dropdownWidth: 240,
    dropdownMaxHeight: 360,
    
    // 虚拟滚动阈值（超过此数量启用虚拟滚动）
    virtualScrollThreshold: 200,
    
    // 空值处理
    nullValueHandling: {
        displayAs: "(空白)",
        alwaysShowInList: true,
        sortToEnd: true,
        treatBlankAsNull: true,
        trimWhitespace: true
    },
    
    // 支持的条件操作符
    conditionOperators: [
        "eq", "neq",           // 等于、不等于
        "contains", "notContains", // 包含、不包含
        "startsWith", "endsWith",   // 开头、结尾
        "gt", "gte", "lt", "lte"   // 数值比较
    ]
};
```

## API 参考

### FilterPlugin

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `init(options?)` | 配置对象 | void | 初始化插件 |
| `destroy()` | - | void | 销毁插件 |
| `enable()` | - | void | 启用 |
| `disable()` | - | void | 禁用 |
| `openDropdown(col, position)` | 列号，位置 | void | 打开面板 |
| `closeDropdown()` | - | void | 关闭面板 |
| `isDropdownOpen()` | - | boolean | 是否打开 |
| `clearAllFilters()` | - | void | 清除所有筛选 |
| `getFilterUIManager()` | - | FilterUIManager | 获取管理器 |
| `getFilterEngine()` | - | FilterEngine | 获取引擎 |

### FilterEngine

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `extractUniqueValues(col)` | 列号 | string[] | 提取唯一值 |
| `computeHiddenRows()` | - | Set\<number\> | 计算隐藏行 |

### FilterState

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `setColumnFilter(col, filter)` | 列号，筛选器 | void | 设置筛选 |
| `removeColumnFilter(col)` | 列号 | void | 移除筛选 |
| `getColumnFilter(col)` | 列号 | object\|null | 获取筛选 |
| `getAllFilters()` | - | Map | 获取全部 |
| `clearAll()` | - | void | 清空 |

## 注意事项

1. **性能优化**：大数据量时自动启用虚拟滚动（>200条）
2. **内存管理**：组件销毁时会自动清理事件监听
3. **空值兼容**：完全兼容 Excel 的空值处理规范
4. **样式隔离**：使用 Shadow DOM 避免样式冲突

## 故障排查

### 常见问题

**Q: 筛选面板不显示？**
- 检查是否调用了 `init()` 方法
- 确认 `enabled` 为 `true`
- 查看浏览器控制台错误

**Q: 点击筛选图标无反应？**
- 检查策略是否注册成功
- 确认 HIT_TYPE 配置正确

**Q: 筛选结果不正确？**
- 检查数据源是否更新
- 尝试清除缓存：`filterState.invalidateColumnCache(col)`
