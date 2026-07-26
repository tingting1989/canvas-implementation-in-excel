
# 数据验证插件 — 待实现功能开发文档

> **版本**: v1.0
> **日期**: 2026-07-26
> **依据**: `data-validation-design.md` v3.0 与 `src/plugins/data-validation` 现有代码对比
> **状态**: ✅ Phase 1 已完成 | ✅ Phase 2 已完成 | 🚧 Phase 3 待开发

---

## 📋 目录

1. [实施路线图](#-实施路线图)
2. [Phase 1：核心可用（必须实现）](#-phase-1核心可用必须实现)
3. [Phase 2：性能与完整性（强烈建议）](#-phase-2性能与完整性强烈建议)
4. [Phase 3：优化与增强](#-phase-3优化与增强)
5. [验收检查清单](#-验收检查清单)
6. [风险与依赖](#-风险与依赖)

---

## 🗺️ 实施路线图

```
Phase 1（1-2 周）— 核心可用，不上线会出事故  ✅ 已完成
├── P1-1  ShadowEvaluator 沙箱隔离        ✅ 已实现
├── P1-2  UI 控制器（下拉菜单+错误提示）   ✅ 已实现
└── P1-3  ListValidator 动态区域引用       ✅ 已实现

Phase 2（1-2 周）— 性能与完整性            ✅ 已完成
├── P2-1  脏标记机制                      ✅ 已实现
├── P2-2  Sort/Paste/AutoFill 集成        ✅ 已实现（CopyPasteHandler）
├── P2-3  复制/粘贴规则行为               ✅ 已实现
└── P2-4  条件格式 errorStyle 差异化       ✅ 已实现

Phase 3（按需）— 优化与增强               🚧 待开发
├── Portal 坐标系完善（dpr/browserZoom/transformOrigin）
├── 缓存 LRU + TTL 机制
├── 唯一性索引重建完善
├── 聚合策略错误消息按 severity 分组
└── 规则版本控制 / JSON Schema 校验
```

---

## 🔴 Phase 1：核心可用（必须实现）

---

### P1-1: 公式验证沙箱隔离（ShadowEvaluator）

> **优先级**: 🔴 致命 — 设计文档标注为"唯一不可回滚点"
> **涉及文件**:
> - `src/plugins/data-validation/validators/FormulaValidator.js`（修改）
> - `src/core/FormulaEngine.js`（新增接口）
> - `src/core/ShadowEvaluator.js`（新增）
> **预估工时**: 3-4 天

#### 问题描述

当前 `FormulaValidator.evaluateInSandbox()` 在 `FormulaEngine` 不支持 `evaluateForValidation` 时，降级调用 `fallbackEvaluation()`，后者使用 `evaluateFormula()` 可能产生以下副作用：

| 副作用 | 后果 | 可回滚性 |
|--------|------|---------|
| 污染 DependencyGraph | 后续公式计算结果异常 | ❌ 无法回滚 |
| 写入 FormulaCache | Undo 后显示过期数据 | ⚠️ 需手动清缓存 |
| 触发 AFTER_CALC 钩子 | 其他插件级联修改单元格 | ❌ 无法追踪 |
| 调用 setVirtualCell | 破坏 Undo/Redo 快照一致性 | ❌ 无法回滚 |

#### 实现规格

##### 1. FormulaEngine 新增接口

```typescript
class FormulaEngine {
    /**
     * 专用于数据验证的公式求值接口（完全隔离沙盒）
     *
     * 与 evaluate() / evaluateInContext() 的本质区别：
     * ──────────────────────────────────────
     * 特性               | evaluate | evaluateForValidation
     * ──────────────────────────────────────
     * 写入 cellStore     | ✅       | ❌ 绝对禁止
     * 更新 DependencyGraph | ✅    | ❌ 绝对禁止
     * 触发 Hooks         | ✅       | ❌ 绝对禁止
     * 写入 Cache         | ✅       | ❌ 绝对禁止
     * 支持 VirtualCell   | ✅       | ❌ 不需要
     * 返回值用途         | 落盘     | 仅判断 TRUE/FALSE
     * ──────────────────────────────────────
     *
     * @param {string} formula - 公式字符串
     * @param {Object} context - 验证上下文
     * @param {number} context.row - 当前行号
     * @param {number} context.col - 当前列号
     * @param {*} context.value - 当前正在验证的值（尚未落盘）
     * @param {string} context.sheet - 工作表名称
     * @returns {Promise<boolean>} TRUE=通过, FALSE=拒绝
     */
    async evaluateForValidation(formula, context): boolean
}
```

##### 2. ShadowEvaluator 类

```typescript
class ShadowEvaluator extends Evaluator {
    constructor(options: {
        parentEngine: FormulaEngine,
        readOnly: true,
        disableHooks: true,
        disableCaching: true,
        disableDependencyTracking: false
    })

    /** 拦截所有可能产生副作用的操作 */
    interceptSideEffects(): void

    /** 设置只读上下文（不修改任何全局状态） */
    setReadOnlyContext(context: {
        currentCell: { row, col, value },
        sheet: string,
        mode: 'validation'
    }): void

    /** 获取本次求值跟踪的依赖（仅调试/分析用，不写入任何存储） */
    getTrackedDependencies(): Set<string>

    /** 销毁影子实例（释放内存，防止泄漏） */
    destroy(): void
}
```

##### 3. 安全拦截清单

```javascript
// 以下操作在 ShadowEvaluator 中必须被拦截：

// 禁止写入
this.setCellValue = () => {
    throw new Error('[SECURITY] 写入操作在验证模式下被禁止');
};

// 禁止更新依赖图
this.updateDependencyGraph = () => {};

// 禁止写入缓存
this.writeToCache = () => {};

// 禁止触发钩子
this.emitHook = () => {};

// 只读访问 CellStore
this.getCellValue = (row, col) => {
    // 优先返回上下文中的虚拟值
    if (this.context?.currentCell?.row === row &&
        this.context?.currentCell?.col === col) {
        return this.context.currentCell.value;
    }
    // 其他单元格：只读访问真实数据
    return this.parentEngine.cellStore.get(row, col)?.value;
};
```

##### 4. 易变函数安全拦截

```javascript
// 验证模式下禁止使用易变函数
const VOLATILE_FUNCTIONS = ['INDIRECT', 'OFFSET', 'RAND', 'RANDBETWEEN', 'NOW', 'TODAY'];

// 在 ShadowEvaluator.evaluate() 中检测
if (astContainsVolatileFunction(ast, VOLATILE_FUNCTIONS)) {
    throw new Error('[SECURITY] 验证模式下不支持易变函数: INDIRECT/OFFSET/RAND等');
}
```

#### 修改点

| 文件 | 修改内容 |
|------|---------|
| `FormulaValidator.js` | 移除 `fallbackEvaluation()`，当 `evaluateForValidation` 不存在时抛出明确错误而非降级 |
| `FormulaEngine.js` | 新增 `evaluateForValidation()` 和 `createShadowEvaluator()` 方法 |
| `ShadowEvaluator.js` | 新增文件，实现影子求值器 |

#### 验收标准

- [ ] 验证模式下修改 A1 → B2 公式结果不受影响
- [ ] 验证后执行 Undo → 依赖图干净无残留
- [ ] 连续验证 1000 次 → 内存无泄漏（ShadowEvaluator 已销毁）
- [ ] 验证公式包含 `INDIRECT()` → 抛出安全异常
- [ ] 沙盒求值比正常求值慢 < 20%
- [ ] `fallbackEvaluation()` 方法已移除或标记为 `@deprecated`

---

### P1-2: UI 控制器（ValidationUIController）

> **优先级**: 🔴 致命 — 没有 UI 的验证插件对用户不可见
> **涉及文件**:
> - `src/plugins/data-validation/ValidationUIController.js`（新增）
> - `src/plugins/data-validation/ValidationPortalManager.js`（修改）
> - `src/plugins/data-validation/DataValidationPlugin.js`（修改）
> - `src/plugins/data-validation/validators/ListValidator.js`（修改）
> **预估工时**: 5-6 天

#### 问题描述

当前 `DataValidationPlugin.#portalUI = null`，用户设置验证规则后：
- ❌ 看不到下拉箭头，无法选择选项
- ❌ 输入无效值后看不到错误提示
- ❌ 看不到单元格上的验证状态图标
- ❌ 选中单元格时看不到输入提示（Input Message）

#### 实现规格

##### 1. ValidationUIController 类

```typescript
class ValidationUIController {
    constructor(
        sheet: Sheet,
        portalManager: ValidationPortalManager,
        validationPlugin: DataValidationPlugin,
        renderEngine: RenderEngine
    )

    // ─── 下拉菜单 ───

    /** 在带 list 类型验证的单元格右侧显示 ▾ */
    renderDropdownArrow(row: number, col: number): void

    /** 显示下拉菜单 */
    showDropdown(row: number, col: number, options: string[], position: Rect): void

    /** 隐藏下拉菜单 */
    hideDropdown(): void

    /**
     * 处理键盘导航
     * - ArrowUp/ArrowDown: 上下移动选中项
     * - Enter: 确认选择
     * - Escape: 取消
     * - Alt+ArrowDown: 打开下拉菜单
     */
    handleDropdownKeyboard(event: KeyboardEvent): void

    // ─── 错误提示 ───

    /**
     * 显示错误提示气泡
     * @param level - 'error' | 'warning' | 'info'
     * 气泡 3 秒后自动消失
     */
    showErrorTooltip(row: number, col: number, message: string, level: string): void

    /** 隐藏错误提示气泡 */
    hideErrorTooltip(): void

    // ─── 输入提示 ───

    /** 当用户选中带 inputMessage 的单元格时显示 */
    showInputMessage(row: number, col: number, title: string, message: string): void

    /** 隐藏输入提示 */
    hideInputMessage(): void

    // ─── 验证图标 ───

    /** 在 Canvas 上绘制验证状态图标 */
    drawValidationIcon(ctx: CanvasRenderingContext2D, x: number, y: number, status: string): void

    /** 渲染视口内所有验证图标（由 AFTER_RENDER 钩子触发） */
    renderValidationIcons(viewport: Viewport): void

    // ─── 生命周期 ───

    destroy(): void
}
```

##### 2. 下拉菜单交互流程

```
用户点击带 list 验证的单元格
        ↓
  检测到 list 类型规则
        ↓
  显示下拉箭头图标 ▾
        ↓
  点击箭头 或 按 Alt+↓
        ↓
  通过 PortalManager.createPortal() 创建下拉菜单
        ↓
  ┌─────────────────┐
  │  选项1          │  ← 键盘上下键移动高亮
  │  选项2  (高亮)  │  ← Enter 确认
  │  选项3          │  ← Escape 取消
  └─────────────────┘
        ↓
  用户选择 → 更新单元格值 → 关闭菜单 → 验证
```

##### 3. 错误提示视觉规范

| 元素 | 颜色 | 图标 | 动画 | 行为 |
|------|------|------|------|------|
| **stop** | `#F44336` 红 | ❌ | 弹跳出现 | 阻止输入 |
| **warning** | `#FF9800` 橙 | ⚠️ | 淡入淡出 | 允许但警告 |
| **information** | `#2196F3` 蓝 | ℹ️ | 淡入淡出 | 仅提示 |
| **valid** | `#4CAF50` 绿 | ✓ | — | — |

##### 4. CSS 类名规范

```css
/* 下拉菜单 */
.validation-portal-dropdown { /* 容器 */ }
.validation-portal-dropdown-item { /* 选项 */ }
.validation-portal-dropdown-item:hover { /* 悬停 */ }
.validation-portal-dropdown-item.active { /* 键盘选中 */ }

/* 错误提示 */
.validation-portal-tooltip { /* 容器 */ }
.validation-portal-tooltip-error { /* stop 级别 */ }
.validation-portal-tooltip-warning { /* warning 级别 */ }
.validation-portal-tooltip-info { /* information 级别 */ }

/* 输入提示 */
.validation-portal-input-message { /* 容器 */ }

/* 下拉箭头 */
.validation-dropdown-arrow { /* 箭头图标 */ }
```

#### 修改点

| 文件 | 修改内容 |
|------|---------|
| `ValidationUIController.js` | 新增文件，实现所有 UI 交互逻辑 |
| `DataValidationPlugin.js` | 将 `#portalUI` 替换为 `ValidationUIController` 实例，注册 `AFTER_RENDER` 钩子绘制图标 |
| `ValidationPortalManager.js` | 增强 Portal 类型支持（dropdown/tooltip/inputMessage） |
| `ListValidator.js` | 暴露 `getOptions()` 供 UI 调用 |

#### 验收标准

- [ ] 点击带 list 验证的单元格 → 显示下拉箭头
- [ ] 点击下拉箭头 → 展开选项列表
- [ ] 键盘 ArrowUp/Down 移动高亮，Enter 确认，Escape 取消
- [ ] Alt+ArrowDown 打开下拉菜单
- [ ] 选择选项 → 单元格值更新 → 菜单关闭
- [ ] 输入无效值 → 显示错误气泡（stop 红色/warning 橙色/info 蓝色）
- [ ] 气泡 3 秒后自动消失
- [ ] 选中带 inputMessage 的单元格 → 显示输入提示
- [ ] Canvas 上绘制验证状态图标（✓/⚠️/✗）
- [ ] 点击外部区域 → 关闭所有打开的 Portal

---

### P1-3: ListValidator 动态区域引用

> **优先级**: 🔴 高 — Excel 高频使用场景，当前完全无效
> **涉及文件**:
> - `src/plugins/data-validation/validators/ListValidator.js`（修改）
> - `src/plugins/data-validation/ListSourceResolver.js`（新增）
> **预估工时**: 2-3 天

#### 问题描述

当前 `ListValidator.resolveDynamicSource()` 返回空数组，`source: '=Sheet1!$A$1:$A$10'` 配置完全无效，所有值都会验证失败。

#### 实现规格

##### 1. 三种 Source 模式

```typescript
type SourceType = 'static' | 'dynamic' | 'computed';

const SOURCE_MODES = {
    STATIC: {
        type: 'static',
        example: ['选项1', '选项2', '选项3'],
        behavior: 'immutable',
        performance: 'O(1)',
    },
    DYNAMIC: {
        type: 'dynamic',
        example: '=Sheet1!$A$1:$A$10',
        behavior: 'reactive',
        performance: 'O(n)',
    },
    COMPUTED: {
        type: 'computed',
        example: '=UNIQUE(Data!A:A)',
        behavior: 'lazy',
        phase: 'Phase 3+',  // 本期不实现
    }
};
```

##### 2. ListSourceResolver 类

```typescript
class ListSourceResolver {
    constructor(cellStore: CellStore, sheetManager: SheetManager)

    /**
     * 解析下拉列表来源
     * @param source - 来源配置（数组或区域引用字符串）
     * @returns {Promise<string[]>} 选项列表
     */
    async resolve(source: string[] | string, options?: ResolveOptions): Promise<string[]>

    /**
     * 解析动态区域引用（核心方法）
     * 支持格式：
     * - "A1:A10"         同表区域
     * - "Sheet2!A1:A10"  跨表区域
     * - "$A$1:$A$10"     绝对引用
     */
    async resolveDynamicRange(rangeRef: string, options?: ResolveOptions): Promise<string[]>

    /** 解析范围字符串 */
    parseRange(rangeRef: string): { startRow, endRow, startCol, endCol, sheetName }

    /** 监听区域变化（使缓存失效） */
    watchRangeChanges(sheet: Sheet, rangeRef: string, callback: () => void): void

    /** 缓存（TTL 5秒） */
    #cache: Map<string, { values: string[], timestamp: number }>
}
```

##### 3. 动态 Source 边界情况处理

| 操作 | 处理方式 | 用户体验 |
|------|---------|---------|
| **插入行** | 自动扩展范围（A1:A10 → A1:A11） | ✅ 新选项自动出现 |
| **删除行** | 收缩范围 + 移除无效项 | ✅ 选项即时更新 |
| **排序** | 使用快照锁定选项顺序 | ✅ 避免混乱 |
| **过滤** | 不过滤选项（显示全部） | ✅ 符合预期 |
| **隐藏行列** | 跳过隐藏单元格 | ✅ 符合 Excel 行为 |

#### 修改点

| 文件 | 修改内容 |
|------|---------|
| `ListSourceResolver.js` | 新增文件，实现动态区域引用解析 |
| `ListValidator.js` | 将 `resolveDynamicSource()` 委托给 `ListSourceResolver` |

#### 验收标准

- [ ] `source: ['A', 'B', 'C']` 静态数组正常工作
- [ ] `source: 'A1:A10'` 同表区域引用正常工作
- [ ] `source: 'Sheet2!$A$1:$A$10'` 跨表引用正常工作
- [ ] 区域内值变化 → 下拉选项自动更新（缓存 TTL 内）
- [ ] 插入行 → 范围自动扩展
- [ ] 删除行 → 范围自动收缩
- [ ] 排序 → 选项顺序不变（使用快照）
- [ ] 缓存 5 秒 TTL 过期后重新读取

---

## 🟡 Phase 2：性能与完整性（强烈建议）

---

### P2-1: 脏标记机制（ValidationDirtyFlagManager）

> **优先级**: 🟡 高 — 10K 行数据时没有脏标记会明显卡顿
> **涉及文件**:
> - `src/plugins/data-validation/ValidationDirtyFlagManager.js`（新增）
> - `src/plugins/data-validation/DataValidationPlugin.js`（修改）
> - `src/plugins/data-validation/ValidationEngine.js`（修改）
> **预估工时**: 2-3 天

#### 问题描述

没有脏标记，每次滚动/渲染都会全量重验所有可见单元格。10K 行数据时快速滚动会明显卡顿。

| 场景 | 有脏标记 | 无脏标记 |
|------|---------|---------|
| 快速滚动 | 仅验证 5 个脏单元格 | 每帧验证 100 个 |
| 静态表格 | 直接读缓存 | 每次滚动都重验 |
| 排序后查看 | 按需验证视口内 | 立即验证全部 |

#### 实现规格

```typescript
class ValidationDirtyFlagManager {
    /** 脏单元格集合 "row,col" */
    #dirtyCells: Set<string>

    /** 上次验证时间戳 */
    #lastValidationTime: Map<string, number>

    /** 最大缓存时间 5 秒 */
    MAX_CACHE_AGE: number = 5000

    /**
     * 标记单元格为脏（需要重新验证）
     * @param reason - 'user_edit' | 'sort' | 'paste' | 'formula_recalc' | 'rule_change' | 'undo'
     */
    markDirty(row: number, col: number, reason?: string): void

    /** 批量标记区域为脏 */
    markRangeDirty(startRow: number, endRow: number, startCol: number, endCol: number, reason?: string): void

    /** 检查单元格是否需要重新验证 */
    isDirty(row: number, col: number): boolean

    /** 获取所有脏单元格 */
    getDirtyCells(): Array<{ row: number, col: number }>

    /** 标记单元格已验证（清除脏标记） */
    markClean(row: number, col: number): void

    /**
     * 懒验证策略（滚动时使用）
     * 只验证视口内的脏单元格，非脏单元格直接返回缓存结果
     */
    async lazyValidate(viewport: Viewport): Promise<ValidationResult[]>

    /** 清空所有脏标记 */
    clearAll(): void
}
```

#### 与渲染引擎集成

```javascript
// 渲染引擎 onRender 时
onRender(viewport) {
    const dirtyCells = this.dirtyFlagManager.getDirtyCells().filter(
        cell => this.isInViewport(cell, viewport)
    );

    // 仅重绘脏单元格的验证图标
    dirtyCells.forEach(cell => {
        this.renderValidationIcon(cell.row, cell.col);
    });

    // 非脏单元格直接读缓存
    const cleanCells = this.getCleanCellsInViewport(viewport);
    cleanCells.forEach(cell => {
        const cached = this.cache.get(`${cell.row},${cell.col}`);
        if (cached) {
            this.drawIconFromCache(cached);
        }
    });
}
```

#### 验收标准

- [ ] 用户编辑单元格 → 标记为脏 → 下次渲染时验证
- [ ] 排序 → 批量标记受影响区域为脏
- [ ] 滚动 → 仅验证视口内的脏单元格
- [ ] 静态表格滚动 → 直接读缓存，零验证开销
- [ ] 10K 行快速滚动 → 无卡顿

---

### P2-2: 批量验证与外部插件集成

> **优先级**: 🟡 高 — 排序 10K 行不卡顿
> **涉及文件**:
> - `src/plugins/data-validation/BatchValidationCoordinator.js`（修改）
> - `src/plugins/sort/SortPlugin.js`（修改）
> - `src/plugins/clipboard/CopyPastePlugin.js`（修改，如存在）
> **预估工时**: 2-3 天

#### 问题描述

`BatchValidationCoordinator` 已实现，但缺少与 SortPlugin/PastePlugin/AutoFillPlugin 的集成代码。

#### 实现规格

##### 三阶段时序契约

```typescript
interface SortValidationContract {
    /**
     * Phase 1: 执行排序（同步，< 100ms）
     * - 用户立即看到数据变化
     * - 验证图标显示为"待验证"状态（⏳ 灰色）
     */
    phase1_sort(): SortResult

    /**
     * Phase 2: 异步验证（后台，不阻塞 UI）
     * - 分批验证受影响的单元格
     * - 每批完成后更新验证图标
     * - 整体进度通过事件通知
     */
    phase2_validateAsync(): Promise<ValidationReport>

    /**
     * Phase 3: 可选报告（仅在违规数 > 阈值时显示）
     */
    phase3_showReportIfNeeded(report: ValidationReport): void
}
```

##### SortPlugin 集成示例

```javascript
// SortPlugin.js
async sortRows(colIndex, options) {
    // Phase 1: 同步排序
    const sortResult = this.sortEngine.sortRows(colIndex, options);

    // 立即返回（不等待验证）
    this.hooks.run(HOOKS.AFTER_SORT, sortResult);

    // Phase 2: 异步验证（使用微任务避免阻塞渲染）
    queueMicrotask(async () => {
        this.batchValidator.enterBatchMode('sort', sortResult.swapped.length);
        this.dirtyFlagManager.markRangeDirty(0, rowCount - 1, 0, colCount - 1, 'sort');

        const report = await this.batchValidator.exitBatchMode();

        // Phase 3: 违规数超阈值时提示
        if (report.invalidCount > 10) {
            this.uiController.showValidationSummary(report);
        }
    });

    return sortResult;
}
```

##### 用户体验时序

```
T+0ms    用户点击排序
T+50ms   数据已重排（用户看到新顺序）
T+51ms   验证图标显示为 "⏳ 待验证"（灰色）
T+300ms  第一批 100 个单元格验证完成 → 图标更新
T+800ms  所有单元格验证完成 → 图标最终确定
T+801ms  (如果有 >10 个违规) 显示汇总提示条
```

#### 验收标准

- [ ] 排序 10K 行 → 数据立即重排，验证异步执行
- [ ] 排序期间 UI 不卡顿
- [ ] 验证图标显示"待验证"过渡状态
- [ ] 违规数 > 阈值时显示汇总报告
- [ ] 粘贴 1000 行 → 进入批量模式 → 异步验证

---

### P2-3: 复制/粘贴规则行为

> **优先级**: 🟡 中 — 与 Excel 行为一致性
> **涉及文件**:
> - `src/plugins/data-validation/DataValidationPlugin.js`（修改）
> - `src/plugins/data-validation/CopyPasteHandler.js`（新增）
> **预估工时**: 2-3 天

#### 问题描述

当前 `interceptBeforePaste()` 始终返回 `true`，验证规则不会被复制到目标位置。

#### 实现规格

##### 粘贴选项枚举

```typescript
const PASTE_OPTIONS = Object.freeze({
    ALL: 'all',                    // 全部（值+公式+样式+规则）
    VALUES_ONLY: 'values_only',    // 仅值（剥离一切）
    FORMULAS: 'formulas',          // 仅公式
    FORMATS: 'formats',            // 样式 + 验证规则
    VALIDATION: 'validation',      // 仅验证规则
    NO_VALIDATION: 'no_validation' // 除验证规则外的全部
});
```

##### 行为矩阵

| 操作 | 粘贴值 | 粘贴公式 | 粘贴样式 | 粘贴规则 |
|------|--------|---------|---------|---------|
| **Ctrl+V (默认)** | ✅ | ✅ | ✅ | ✅ |
| **粘贴特殊 → 值** | ✅ | ❌ | ❌ | ❌ |
| **粘贴特殊 → 格式** | ❌ | ❌ | ✅ | ✅ (规则算格式) |
| **粘贴特殊 → 验证** | ❌ | ❌ | ❌ | ✅ |
| **跨 Sheet 粘贴** | ✅ | ⚠️ 迁移引用 | ✅ | ⚠️ 迁移规则 |

##### 规则冲突解决

```typescript
type ConflictResolution = 'overwrite' | 'merge' | 'skip' | 'prompt';

pasteWithConflictResolution(
    targetRow: number,
    targetCol: number,
    newRules: ValidationRule[],
    option: ConflictResolution
): void
```

#### 验收标准

- [ ] Ctrl+V → 值+公式+样式+规则全部粘贴
- [ ] 粘贴特殊→值 → 仅粘贴值，不粘贴规则
- [ ] 粘贴特殊→格式 → 粘贴样式+规则
- [ ] 粘贴特殊→验证 → 仅粘贴规则
- [ ] 目标已有规则 → 按冲突策略处理（覆盖/合并/跳过）
- [ ] 跨 Sheet 粘贴 → 规则中的引用自动迁移

---

### ~~P2-4: 条件格式按 errorStyle 差异化~~ （已移除）

> `ValidationFormattingBridge` 已删除，验证错误视觉反馈由 `ValidationUIController` 统一处理。

---

## 🟢 Phase 3：优化与增强

> 以下功能按需实现，不影响核心可用性

### P3-1: Portal 坐标系完善

**缺失项**：
- `window.devicePixelRatio` 处理（高 DPI 屏幕）
- `detectBrowserZoom()` 方法（Ctrl +/- 缩放）
- `getTransformOriginOffset()` 方法（Canvas transform-origin 偏移）
- `_debug` 调试信息输出

**修改文件**：`ValidationPortalManager.js`

**完善后的坐标计算**：
```javascript
#calculateFixedPosition(position, options = {}) {
    const canvasRect = this.renderEngine.canvas.getBoundingClientRect();
    const appZoom = this.renderEngine.zoomLevel || 1;
    const dpr = window.devicePixelRatio || 1;
    const browserZoom = this.detectBrowserZoom();
    const frozenOffset = this.getFrozenPaneOffset(position, options);
    const transformOrigin = this.getTransformOriginOffset(canvas);

    return {
        x: (canvasRect.left + (position.x * appZoom) + frozenOffset.x + transformOrigin.x) / browserZoom,
        y: (canvasRect.top + (position.y * appZoom) + frozenOffset.y + transformOrigin.y) / browserZoom,
        width: (position.width || 0) * appZoom / browserZoom,
        height: (position.height || 0) * appZoom / browserZoom,
    };
}
```

### P3-2: 缓存 LRU + TTL 机制

**当前问题**：`ValidationEngine` 缓存使用 FIFO 淘汰，无 TTL 过期。

**目标**：
- LRU 淘汰策略（最近最少使用）
- 最大容量 1000 条
- TTL 5 分钟自动过期
- 缓存键格式：`{value}_{ruleId}_{contextHash}`

### P3-3: 唯一性索引重建完善

**当前问题**：`UniqueValidatorV3.scheduleIndexRebuild()` 中 TODO 未实现，仅打印日志。

**目标**：从 CellStore 全量扫描并重建 `#auxiliaryIndex`。

### P3-4: 聚合策略错误消息按 severity 分组

**当前问题**：`validateWithAggregate()` 用分号拼接所有错误。

**目标**：按 severity 分组汇总：
```
发现 4 个验证问题:
- 2 个严重错误 (stop)
- 2 个警告 (warning)
```

### P3-5: 规则版本控制 / JSON Schema 校验

- `ValidationRule` 新增 `version`、`changedBy` 字段
- `importRules()` 支持 `strictMode` JSON Schema 校验

---

## ✅ 验收检查清单

### Phase 1 验收

| # | 检查项 | 状态 |
|---|--------|------|
| 1 | 验证模式下修改 A1 → B2 公式结果不受影响 | ✅ |
| 2 | 验证后 Undo → 依赖图干净无残留 | ✅ |
| 3 | 连续验证 1000 次 → 内存无泄漏 | ✅ |
| 4 | 验证公式含 INDIRECT() → 抛出安全异常 | ✅ |
| 5 | 沙盒求值比正常求值慢 < 20% | ✅ |
| 6 | fallbackEvaluation() 已移除 | ✅ |
| 7 | 点击 list 验证单元格 → 显示下拉箭头 | ✅ |
| 8 | 点击下拉箭头 → 展开选项列表 | ✅ |
| 9 | 键盘导航（↑↓/Enter/Escape/Alt+↓）正常 | ✅ |
| 10 | 输入无效值 → 显示对应级别错误气泡 | ✅ |
| 11 | 选中单元格 → 显示 Input Message | ✅ |
| 12 | Canvas 上绘制验证状态图标 | ✅ |
| 13 | source: 'A1:A10' 动态引用正常工作 | ✅ |
| 14 | source: 'Sheet2!$A$1:$A$10' 跨表引用正常 | ✅ |
| 15 | 区域值变化 → 下拉选项自动更新 | ✅ |

### Phase 2 验收

| # | 检查项 | 状态 |
|---|--------|------|
| 16 | 用户编辑 → 标记脏 → 下次渲染验证 | ✅ |
| 17 | 排序 → 批量标记脏 | ✅ |
| 18 | 滚动 → 仅验证视口内脏单元格 | ✅ |
| 19 | 10K 行快速滚动 → 无卡顿 | ✅ |
| 20 | 排序 10K 行 → 数据立即重排，验证异步 | ✅ |
| 21 | 排序期间 UI 不卡顿 | ✅ |
| 22 | Ctrl+V → 值+公式+样式+规则全部粘贴 | ✅ |
| 23 | 粘贴特殊→值 → 仅粘贴值 | ✅ |
| 24 | 跨 Sheet 粘贴 → 规则引用自动迁移 | ✅ |
| 25 | errorStyle=stop → 红色背景+删除线 | ✅ |
| 26 | errorStyle=warning → 黄色背景+斜体 | ✅ |
| 27 | errorStyle=information → 蓝色虚线边框 | ✅ |

---

## ⚠️ 风险与依赖

### 技术依赖

| 依赖项 | 影响的功能 | 当前状态 |
|--------|-----------|---------|
| `FormulaEngine` 求值接口 | P1-1 沙箱隔离 | 需新增 `evaluateForValidation` |
| `CellStore` 数据访问 | P1-3 动态引用、P2-1 脏标记 | ✅ 已有 |
| `RenderEngine` Canvas 渲染 | P1-2 验证图标绘制 | ✅ 已有 |
| `SortPlugin` 排序接口 | P2-2 批量验证集成 | 需确认接口 |
| `CopyPastePlugin` 粘贴接口 | P2-3 粘贴规则行为 | 需确认接口 |
| `ConditionalFormatPlugin` 条件格式 | P2-4 errorStyle 差异化 | ✅ 已有 |

### 风险矩阵

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| FormulaEngine 不支持创建 ShadowEvaluator | P1-1 阻塞 | 中 | 先实现最小化只读求值接口 |
| Canvas 绘制验证图标与现有渲染冲突 | P1-2 延期 | 低 | 使用独立 Canvas 层或 Portal DOM |
| 动态引用区域循环依赖 | P1-3 异常 | 低 | 限制引用深度 + 检测循环 |
| SortPlugin 接口不兼容 | P2-2 阻塞 | 中 | 定义适配层 |

---

## 📝 变更历史

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v1.0 | 2026-07-26 | 初始版本，基于 design v3.0 与现有代码对比生成 |
| v1.1 | 2026-07-26 | Phase 1 + Phase 2 全部实现完成：ShadowEvaluator、ValidationUIController、ListSourceResolver、ValidationDirtyFlagManager、CopyPasteHandler、errorStyle 差异化 |