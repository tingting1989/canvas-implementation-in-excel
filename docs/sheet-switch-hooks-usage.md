# 工作表切换事件 - 双层事件系统使用指南

> **版本**: v1.0
> **日期**: 2026-06-25
> **状态**: 已实现

---

## 📋 概述

本项目采用 **双层事件系统** 来处理工作表切换事件：

| 层级 | 系统 | 目标用户 | 用途 |
|------|------|---------|------|
| **① 内部层** | EventBus | 插件开发者 | 模块间高效通信 |
| **② 外部层** | Hooks | 应用开发者 | 用户自定义扩展 |

---

## 🎯 使用场景

### 场景 1: 用户监听工作表切换（Hooks API）

```javascript
const workbook = new Workbook('grid', {
    plugins: ['sort', 'freeze'],
    // ... 其他配置
});

// ✅ 用户可以通过 Hooks 监听工作表切换
workbook.addHook(HOOKS.AFTER_SHEET_SWITCH, (previousSheet, currentSheet) => {
    console.log(`工作表已从 "${previousSheet.name}" 切换到 "${currentSheet.name}"`);

    // 用户可以在这里做自定义逻辑：
    // - 更新 UI 状态栏
    // - 记录日志到分析系统
    // - 同步数据到其他组件
    // - 触发业务逻辑

    document.getElementById('status-bar').textContent = `当前工作表: ${currentSheet.name}`;
});

// 用户点击 "+" 新增 sheet 并切换时，上面的回调会被触发
```

---

### 场景 2: 插件内部响应（EventBus - SortPlugin 示例）

```javascript
// src/plugins/SortPlugin.js (插件内部代码)

class SortPlugin extends BasePlugin {
    init(options) {
        super.init(options);

        const sheet = this.sheet;
        this.#initSortEngine(sheet);

        // ✅ 插件通过 EventBus 监听（内部模块通信）
        this.#bindSheetSwitchListener(sheet);
    }

    /**
     * 绑定工作表切换事件（使用 EventBus）
     *
     * 设计说明：
     * - 这是插件内部实现细节，不暴露给用户
     * - 使用 EventBus 而非 Hooks，因为：
     *   1. 不希望用户干预插件的内部逻辑
     *   2. EventBus 性能更优（无契约校验开销）
     *   3. 符合项目架构规范
     */
    #bindSheetSwitchListener(sheet) {
        if (!sheet?.bus) return;

        // 先移除旧监听器（防止重复绑定）
        this.#unbindSheetSwitchListener();

        // 监听工作表切换事件
        this.#sheetSwitchUnsubscribe = sheet.bus.on(
            SHEET_EVENTS.SHEET_SWITCHED,
            (envelope) => {
                console.log('[SortPlugin] 收到 sheet 切换事件:', envelope);

                const { currentSheet } = envelope.payload;
                const newSheet = this.workbook.sheets.get(currentSheet);
                if (newSheet) {
                    this.#onSheetSwitched(newSheet);
                }
            }
        );
    }

    #onSheetSwitched(newSheet) {
        // 重新绑定 SortEngine 到新 sheet 的数据存储
        this.#initSortEngine(newSheet);

        // 重新绑定事件监听到新 sheet
        this.#bindSheetSwitchListener(newSheet);

        // 清除旧的排序状态和 UI
        this.#sortState.clear();
        this.#sortUIManager.updateIndicators();

        // 触发重新渲染
        this.renderEngine?.invalidateAll();
        this.render();
    }
}
```

---

### 场景 3: 其他插件监听（FreezePlugin 示例）

```javascript
// src/plugins/FreezePlugin.js

class FreezePlugin extends BasePlugin {
    init(options) {
        super.init(options);

        const sheet = this.sheet;
        if (!sheet) return;

        // 监听工作表切换以更新冻结状态
        this.#sheetSwitchUnsubscribe = sheet.bus.on(
            SHEET_EVENTS.SHEET_SWITCHED,
            (envelope) => {
                const { currentSheet } = envelope.payload;
                const newSheet = this.workbook.sheets.get(currentSheet);
                if (newSheet) {
                    this.#onSheetSwitched(newSheet);
                }
            }
        );

        // 初始化冻结状态
        this.#initFrozenState(sheet);
    }

    #onSheetSwitched(newSheet) {
        // 每个工作表的冻结状态可能不同
        this.#frozenRowsTop = newSheet.frozenRowsTop || 0;
        this.#frozenColsStart = newSheet.frozenColsStart || 0;

        // 重新渲染冻结线
        this.renderFrozenLines(newSheet);

        // 更新 UI
        this.updateUI();
    }
}
```

---

## 📊 架构对比

### ❌ 错误做法：混用职责

```javascript
// 🚫 不要这样做！
// SortPlugin 监听用户的 Hook 来做内部逻辑
this.addHook(HOOKS.AFTER_SHEET_SWITCH, () => {
    this.#rebindSortEngine();  // 这是内部实现细节！
});
// 问题：
// 1. 用户可能移除这个 Hook 导致插件失效
// 2. 无法区分用户逻辑和插件逻辑
// 3. 违反了架构设计原则
```

```javascript
// 🚫 也不要这样做！
// 让用户监听 EventBus（私有API）
workbook.activeSheet.bus.on(SHEET_EVENTS.SHEET_SWITCHED, handler);
// 问题：
// 1. 用户不知道有这个事件存在
// 2. 没有文档说明这个 API
// 3. 可能随版本变化而改变
```

---

### ✅ 正确做法：分层清晰

```
┌─────────────────────────────────────────────┐
│              用户层 (Application)             │
│                                              │
│   workbook.addHook(AFTER_SHEET_SWITCH, fn)   │ ← 公开 API
│   ↓                                          │
│   用户可以安全地监听和响应                     │
│   文档完善、类型安全、版本稳定                 │
└─────────────────────────────────────────────┘
         ↕ 双向独立运行
┌─────────────────────────────────────────────┐
│              插件层 (Plugins)                  │
│                                              │
│   SortPlugin → bus.on(SHEET_SWITCHED, fn)    │ ← 私有实现
│   FreezePlugin → bus.on(SHEET_SWITCHED, fn)  │
│   PaginationPlugin → bus.on(...)             │
│   ↓                                          │
│   插件间高效协作，不受用户干扰                 │
│   可随时重构内部实现                          │
└─────────────────────────────────────────────┘
         ↑ 触发源
┌─────────────────────────────────────────────┐
│              核心层 (Core)                     │
│                                              │
│   Workbook.switchTo(name) {                  │
│       // ① 内部通知                           │
│       previousSheet.bus.emit(                │
│           SHEET_EVENTS.SHEET_SWITCHED, ...   │
│       );                                     │
│                                              │
│       // ② 用户通知                           │
│       this.runHooks(                         │
│           HOOKS.AFTER_SHEET_SWITCH, ...      │
│       );                                     │
│   }                                          │
└─────────────────────────────────────────────┘
```

---

## 🔧 实现细节

### 1️⃣ 钩子定义

**文件**: [src/constants/hookNames.js](src/constants/hookNames.js)

```javascript
export const HOOKS = Object.freeze({
    // ... 其他钩子

    /** 工作表切换相关 */
    AFTER_SHEET_SWITCH: "afterSheetSwitch",
    // 参数: (previousSheet: Sheet, currentSheet: Sheet)
});
```

### 2️⃣ 事件定义

**文件**: [src/constants/sheetEvents.js](src/constants/sheetEvents.js)

```javascript
export const SHEET_EVENTS = Object.freeze({
    // ... 其他事件

    // 工作表切换（Workbook 内部事件）
    SHEET_SWITCHED: "workbook:sheet-switched",
    // Payload: { previousSheet: string, currentSheet: string }
});
```

### 3️⃣ Workbook 触发点

**文件**: [src/workbook/Workbook.js](src/workbook/Workbook.js)

```javascript
switchTo(name) {
    const sheet = this.sheets.get(name);
    if (!sheet || this.activeSheet === sheet) return;

    const previousSheet = this.activeSheet;
    this.activeSheet = sheet;
    // ... 更新引用 ...

    this.render();
    this.#refreshTabBar();

    // ① 通过 EventBus 通知内部模块（插件间通信）
    if (previousSheet) {
        previousSheet.bus.emit(SHEET_EVENTS.SHEET_SWITCHED, {
            previousSheet: previousSheet.name,
            currentSheet: sheet.name,
        }, { source: "Workbook" });
    }

    // ② 通过 Hooks 通知用户扩展代码（公开 API）
    this.runHooks(HOOKS.AFTER_SHEET_SWITCH, previousSheet, sheet);
}
```

---

## 📝 最佳实践

### 对于应用开发者

```javascript
// ✅ 推荐：使用 Hooks API
workbook.addHook(HOOKS.AFTER_SHEET_SWITCH, (prev, curr) => {
    // 安全、稳定、有类型提示
});

// ❌ 避免：直接操作 EventBus
workbook.activeSheet.bus.on('workbook:sheet-switched', handler);
// 原因：这是私有 API，可能在未来版本中变更
```

### 对于插件开发者

```javascript
// ✅ 推荐：使用 EventBus 进行模块间通信
sheet.bus.on(SHEET_EVENTS.SHEET_SWITCHED, handler);

// ❌ 避免：在插件中使用 Hooks 做内部逻辑
this.addHook(HOOKS.AFTER_SHEET_SWITCH, internalHandler);
// 原因：用户可能覆盖或移除这个 Hook
```

---

## 🧪 测试用例

### 测试用户钩子

```javascript
describe('AFTER_SHEET_SWITCH 钩子', () => {
    it('应该在工作表切换后触发用户回调', () => {
        const workbook = createMockWorkbook();
        let hookCalled = false;
        let receivedPrev, receivedCurr;

        // 用户注册钩子
        workbook.addHook(HOOKS.AFTER_SHEET_SWITCH, (prev, curr) => {
            hookCalled = true;
            receivedPrev = prev;
            receivedCurr = curr;
        });

        // 创建并切换到新 sheet
        workbook.createSheet('Sheet2');
        workbook.switchTo('Sheet2');

        expect(hookCalled).toBe(true);
        expect(receivedPrev.name).toBe('Sheet1');
        expect(receivedCurr.name).toBe('Sheet2');
    });

    it('多个钩子应该都能被触发', () => {
        const workbook = createMockWorkbook();
        const calls = [];

        workbook.addHook(HOOKS.AFTER_SHEET_SWITCH, () => calls.push('hook1'));
        workbook.addHook(HOOKS.AFTER_SHEET_SWITCH, () => calls.push('hook2'));
        workbook.addHook(HOOKS.AFTER_SHEET_SWITCH, () => calls.push('hook3'));

        workbook.switchTo('Sheet2');

        expect(calls).toEqual(['hook1', 'hook2', 'hook3']);
    });
});
```

### 测试插件 EventBus

```javascript
describe('SHEET_SWITCHED 事件 (EventBus)', () => {
    it('SortPlugin 应该正确响应工作表切换', async () => {
        const workbook = createMockWorkbookWithSheets(['Sheet1', 'Sheet2']);
        const plugin = new SortPlugin(workbook);
        plugin.init();

        // 在 Sheet1 上排序
        plugin.sortRows(0, { order: 'desc' });
        expect(workbook.getCellValue(0, 0)).toBe(5); // 最大值

        // 切换到 Sheet2
        workbook.switchTo('Sheet2');

        // 在 Sheet2 上排序（验证引擎已重新绑定）
        plugin.sortRows(0, { order: 'desc' });

        // Sheet2 的数据也应该被排序
        const sheet2 = workbook.sheets.get('Sheet2');
        expect(sheet2.cellStore.get(0, 0)?.value).toBe(5);
    });
});
```

---

## 🚀 进阶用法

### 组合使用 Hooks 和 EventBus

```javascript
class CustomAnalyticsPlugin extends BasePlugin {
    init() {
        // ① 通过 EventBus 接收内部事件（高性能）
        this.sheet.bus.on(SHEET_EVENTS.SHEET_SWITCHED, (envelope) => {
            this.#trackInternalMetrics(envelope);
        });

        // ② 通过 Hooks 提供用户可配置的回调
        // （如果用户想自定义分析逻辑）
    }

    // 公开方法供用户调用
    onSheetSwitch(callback) {
        return this.workbook.addHook(HOOKS.AFTER_SHEET_SWITCH, callback);
    }
}

// 用户使用方式
const analytics = workbook.getPlugin('analytics');

// 方式 1: 使用默认行为（自动追踪）
// 无需额外代码

// 方式 2: 自定义回调
analytics.onSheetSwitch((prev, curr) => {
    sendToAnalyticsService({
        event: 'sheet_switch',
        from: prev.name,
        to: curr.name,
        timestamp: Date.now()
    });
});
```

---

## 📚 相关文档

- [EventBus 系统设计](./eventbus-design.md)
- [Hooks 系统设计](./hooks-design.md)
- [插件开发指南](./plugin-development-guide.md)
- [SortPlugin 实现](../src/plugins/SortPlugin.js)
- [FreezePlugin 实现](../src/plugins/FreezePlugin.js)

---

## 🔄 版本历史

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v1.0 | 2026-06-25 | 初始版本，实现双层事件系统 |