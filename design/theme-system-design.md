
# Canvas Sheet 主题系统设计文档

## 1. 需求分析

### 1.1 业务背景

Canvas Sheet 是基于 Canvas 的电子表格实现，当前样式管理存在以下问题：

| 问题类型 | 具体描述 | 影响 |
|---------|---------|------|
| 样式分散 | 样式配置分散在多个文件 | 维护困难 |
| 缺乏主题支持 | 不支持多主题切换 | 用户体验受限 |
| 扩展性差 | 新增样式类型需修改多处代码 | 开发效率低 |
| 品牌定制困难 | 无法快速定制专属样式 | 商业化受限 |

### 1.2 功能需求

| 需求编号 | 需求描述 |
|---------|---------|
| REQ-001 | 支持多主题切换（亮色/暗色） |
| REQ-002 | 支持自定义主题注册 |
| REQ-003 | 主题配置持久化 |
| REQ-004 | 保持与现有 stylePool 兼容性 |

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────┐
│              Application Layer              │
│           Workbook / Sheet                  │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│              Service Layer                  │
│           ThemeManager                      │
│  - getTheme / setTheme / registerTheme      │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│              Storage Layer                  │
│           stylePool                         │
│  - getStyleId / getStyle                   │
└─────────────────────────────────────────────┘
```

### 2.2 核心组件

| 组件 | 职责 | 文件路径 |
|------|------|---------|
| ThemeManager | 主题管理核心类 | `src/theme/ThemeManager.js` |
| config.js | 默认主题配置 | `src/theme/config.js` |
| ThemeStyleProvider | 主题样式提供者 | `src/model/styles/ThemeStyleProvider.js` |

### 2.3 主题配置结构

```javascript
{
  "name": "default",
  "displayName": "默认主题",
  "version": "1.0.0",
  "config": {
    "cell": {
      "default": { color: "#000", backgroundColor: "transparent" },
      "hyperlink": { color: "#1a73e8", cursor: "pointer" },
      "header": { color: "#fff", backgroundColor: "#4CAF50" }
    },
    "font": { "family": "Microsoft YaHei", "sizes": { small: 12 } },
    "colors": { "primary": "#1a73e8", "success": "#4CAF50" }
  }
}
```

---

## 3. API 设计

### 3.1 ThemeManager 方法

| 方法名 | 功能描述 | 参数 | 返回值 |
|-------|---------|------|-------|
| getTheme(name) | 获取主题配置 | name: string | object/null |
| setTheme(name) | 切换主题 | name: string | boolean |
| registerTheme(name, config) | 注册新主题 | name, config | void |
| getStyle(type) | 获取样式配置 | type: string | object |
| getStyleId(type) | 获取样式ID | type: string | string |
| getCurrentTheme() | 获取当前主题名 | 无 | string |
| getThemes() | 获取所有主题列表 | 无 | array |

---

## 4. 实现方案

### 4.1 ThemeManager 核心实现

```javascript
class ThemeManager {
  constructor(options = {}) {
    this.themes = {};
    this.styleIds = {};
    this.currentTheme = options.defaultTheme || 'default';
    this.persist = options.persist !== false;
    this.#loadFromStorage();
    this.#registerBuiltInThemes();
  }

  registerTheme(name, config) {
    if (this.themes[name]) throw new Error(`主题 "${name}" 已存在`);
    this.themes[name] = config;
    this.#preRegisterStyles(name, config);
    if (this.persist) this.#saveToStorage();
  }

  setTheme(name) {
    if (!this.themes[name]) throw new Error(`主题 "${name}" 不存在`);
    this.currentTheme = name;
    if (this.persist) localStorage.setItem('canvas-sheet-theme', name);
    this.#emitThemeChange(name);
    return true;
  }

  getStyle(type) {
    const theme = this.themes[this.currentTheme];
    return this.#getStyleFromConfig(theme, type);
  }

  getStyleId(type) {
    return this.styleIds[`${this.currentTheme}.${type}`];
  }
}
```

### 4.2 默认主题配置

```javascript
export const defaultThemeConfig = {
  displayName: '默认主题',
  version: '1.0.0',
  config: {
    cell: {
      default: { color: '#000', backgroundColor: 'transparent', fontSize: 14 },
      hyperlink: { color: '#1a73e8', cursor: 'pointer' },
      header: { color: '#fff', backgroundColor: '#4CAF50', fontWeight: 'bold' }
    },
    font: { family: 'Microsoft YaHei', sizes: { small: 12, medium: 14, large: 16 } },
    colors: { primary: '#1a73e8', success: '#4CAF50', warning: '#ff9800', error: '#f44336' }
  }
};

export const darkThemeConfig = {
  displayName: '暗色主题',
  version: '1.0.0',
  config: {
    cell: {
      default: { color: '#fff', backgroundColor: '#333' },
      hyperlink: { color: '#64B5F6', cursor: 'pointer' },
      header: { color: '#fff', backgroundColor: '#2E7D32' }
    }
  }
};
```

### 4.3 与 stylePool 集成

```javascript
class ThemeStyleProvider {
  constructor() {
    this.themeManager = new ThemeManager();
  }

  getCellStyleId(row, col, cellType) {
    let styleType = 'cell.default';
    if (row === 0) styleType = 'cell.header';
    else if (cellType === 'hyperlink') styleType = 'cell.hyperlink';
    return this.themeManager.getStyleId(styleType);
  }

  getCellStyle(row, col, cellType) {
    const styleId = this.getCellStyleId(row, col, cellType);
    return stylePool.getStyle(styleId);
  }
}

export const themeStyleProvider = new ThemeStyleProvider();
```

---

## 5. 集成方案

### 5.1 SheetStyleManager 集成

```javascript
import { themeStyleProvider } from '../../model/styles/ThemeStyleProvider';

class SheetStyleManager {
  getCellStyle(row, col) {
    const cellType = this.#sheet.getCellTypeInstance(row, col);
    const themeStyle = themeStyleProvider.getCellStyle(row, col, cellType?.name);
    const customStyle = this.#getCustomStyle(row, col);
    return { ...themeStyle, ...customStyle };
  }
}
```

### 5.2 HyperlinkColumnType 集成

```javascript
import { themeStyleProvider } from '../model/styles/ThemeStyleProvider';

class HyperlinkColumnType extends BaseColumnType {
  getDefaultStyle(baseStyle) {
    const themeStyle = themeStyleProvider.getStyle('cell.hyperlink');
    return { ...baseStyle, ...themeStyle };
  }

  render(context) {
    const { ctx, x, y, height, displayValue, style } = context;
    ctx.fillStyle = style.color;
    ctx.fillText(displayValue, x + 8, y + height / 2);
    ctx.strokeStyle = style.color;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + height / 2 + 6 + 2);
    ctx.lineTo(x + 8 + ctx.measureText(displayValue).width, y + height / 2 + 6 + 2);
    ctx.stroke();
  }
}
```

---

## 6. 测试方案

### 6.1 单元测试

| 测试用例 | 测试描述 | 期望结果 |
|---------|---------|---------|
| TM-001 | 注册新主题 | 主题成功添加 |
| TM-002 | 注册已存在主题 | 抛出错误 |
| TM-003 | 切换不存在主题 | 抛出错误 |
| TM-004 | 获取当前主题 | 返回正确名称 |
| TM-005 | 获取样式ID | 返回正确ID |
| TM-006 | 持久化配置 | localStorage有数据 |

### 6.2 集成测试

| 测试用例 | 测试描述 | 期望结果 |
|---------|---------|---------|
| IT-001 | 主题切换后样式更新 | 单元格显示新样式 |
| IT-002 | 超链接使用主题颜色 | 显示主题配置颜色 |
| IT-003 | 主题切换不影响数据 | 数据保持不变 |

---

## 7. 部署方案

### 7.1 模块导出

```javascript
// src/theme/index.js
export { ThemeManager } from './ThemeManager';
export { defaultThemeConfig, darkThemeConfig } from './config';
```

### 7.2 使用示例

```javascript
import { ThemeManager } from './src/theme';

const themeManager = new ThemeManager({ defaultTheme: 'default', persist: true });
themeManager.registerTheme('custom', { displayName: '自定义', config: {} });
themeManager.setTheme('dark');
const style = themeManager.getStyle('cell.hyperlink');
```

---

## 8. 安全性

| 风险类型 | 解决方案 |
|---------|---------|
| XSS攻击 | JSON Schema验证，过滤危险属性 |
| 存储攻击 | 序列化时安全检查 |
| 资源耗尽 | 限制主题数量上限(100个) |
| 配置注入 | 白名单机制，仅允许预定义属性 |

---

## 9. 附录

### 9.1 样式类型枚举

| 样式类型 | 描述 |
|---------|------|
| cell.default | 默认单元格 |
| cell.hyperlink | 超链接单元格 |
| cell.header | 表头单元格 |
| cell.selected | 选中单元格 |

### 9.2 颜色格式支持

| 格式 | 示例 |
|------|------|
| 十六进制 | #1a73e8 |
| RGB | rgb(26, 115, 232) |
| RGBA | rgba(26, 115, 232, 0.5) |
| 颜色名称 | blue |