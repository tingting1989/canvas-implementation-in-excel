import { EventStrategy } from "./EventStrategy.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";

/**
 * 数据验证策略 (Data Validation Strategy)
 *
 * 处理Canvas表格中的数据验证逻辑，确保用户输入的数据符合预定义的规则。
 * 作为数据输入的"守门员"，在值写入单元格之前进行校验。
 *
 * 优先级：使用 STRATEGY_PRIORITY.DATA_VALIDATION
 * - 确保验证逻辑在数据处理流程中的正确位置执行
 *
 * 核心功能：
 * ┌────────────────────────┬─────────────────────────────────────┐
 * │ 验证时机                │ 功能                                │
 * ├────────────────────────┼─────────────────────────────────────┤
 * │ 设置值前（intercept）   │ 验证数据合法性，可阻止写入          │
 * │ 设置值后（handle）       │ 显示验证结果提示                    │
 * │ 粘贴前（interceptPaste）│ 批量验证剪贴板数据                  │
 * │ 选中单元格              │ 显示该单元格的验证状态和规则        │
 * └────────────────────────┴─────────────────────────────────────┘
 *
 * 支持的验证规则类型：
 * - **数值范围**：最小值、最大值、介于两值之间
 * - **列表选择**：下拉选项、多选列表
 * - **日期范围**：日期区间、相对日期（如"今天之前"）
 * - **文本长度**：最小/最大字符数
 * - **自定义公式**：使用公式引擎计算验证条件
 * - **正则表达式**：模式匹配验证
 * - **唯一性约束**：列内唯一或范围内唯一
 *
 * 设计特点：
 *
 * **1. 拦截器模式（Interceptor Pattern）**：
 * ```
 * 用户输入 → interceptBeforeSetValue() → 验证通过? → 写入CellStore
 *                                         ↓ 否
 *                                   显示错误 + 阻止写入
 * ```
 *
 * **2. 与插件系统集成**：
 * - 由 ValidationPlugin 创建和管理
 * - 通过 #plugin 引用访问验证规则和UI控制器
 * - 插件禁用时策略自动跳过验证逻辑
 *
 * **3. 事件驱动但非DOM事件**：
 * - 不监听DOM事件（getEventHandlers返回空对象）
 * - 通过方法调用触发（由其他策略或插件调用）
 * - 典型的AOP（面向切面编程）实现
 *
 * **4. 错误处理策略**：
 * - 阻止模式（阻止非法值写入）
 * - 警告模式（允许写入但显示警告）
 * - 仅记录模式（不干扰用户，仅记录日志）
 *
 * 视觉反馈：
 * - 单元格边框颜色变化（红色=错误，黄色=警告）
 * - 输入时实时显示验证提示
 * - 错误消息气泡（悬停或点击时显示）
 * - 无效数据高亮标记
 *
 * 性能优化：
 * - 缓存编译后的正则表达式和公式AST
 * - 批量操作时合并验证请求
 * - 异步验证复杂规则（不阻塞UI）
 * - 增量验证（仅验证变化的单元格）
 *
 * @class ValidationStrategy
 * @extends EventStrategy
 *
 * @see EventStrategy - 基类
 * @see ValidationPlugin - 数据验证插件（创建者）
 * @see KeyboardStrategy - 触发值设置的策略
 * @see CopyPasteStrategy - 触发粘贴操作的策略
 *
 * @example
 * // 配置示例（通过ValidationPlugin）
 * const validation = new ValidationPlugin({
 *   rules: [
 *     {
 *       range: "B2:B100",
 *       type: "number",
 *       min: 0,
 *       max: 100,
 *       errorMessage: "成绩必须在0-100之间"
 *     },
 *     {
 *       range: "C2:C100",
 *       type: "list",
 *       options: ["优秀", "良好", "及格", "不及格"],
 *       errorMessage: "请从下拉列表中选择"
 *     }
 *   ]
 * });
 *
 * sheet.addPlugin(validation);
 * // ValidationStrategy会自动注册并生效
 */
export class ValidationStrategy extends EventStrategy {
    /**
     * 策略名称标识符
     *
     * 在 EventHandler.strategies Map 中的键名。
     * 其他组件通过此名称获取策略实例：
     * ```javascript
     * const validation = eventHandler.strategies.get("validation");
     * ```
     *
     * @type {string}
     */
    name = "validation";

    /**
     * 策略优先级 - 数据验证优先级
     *
     * 使用 STRATEGY_PRIORITY.DATA_VALIDATION 常量。
     * 此策略不参与 DOM 事件分发（getEventHandlers 返回空对象），
     * 优先级主要用于日志记录和未来扩展。
     *
     * @type {number}
     */
    priority = STRATEGY_PRIORITY.DATA_VALIDATION;

    /**
     * @private 私有字段 - 数据验证插件的引用（核心依赖）
     *
     ** 🎯 核心目的：**
     * 持有创建此策略的 ValidationPlugin 实例，用于委托所有验证逻辑。
     * ValidationStrategy 本身是"薄代理层"，实际的验证规则存储、引擎执行、UI控制都由插件完成。
     *
     ** 为什么使用插件引用而非直接实现？**
     * - **职责分离**：策略负责"何时验证"，插件负责"如何验证"
     * - **可插拔性**：禁用/卸载插件时，策略自动失效（通过 active 标志检查）
     * - **生命周期管理**：插件可以动态启用/禁用，策略无需感知
     * - **测试友好**：可以 mock 插件进行单元测试
     *
     ** 提供的功能（通过 #plugin 访问）：**
     * | 功能 | 方法 | 说明 |
     * |------|------|------|
     * | 验证拦截 | `#plugin.interceptBeforeSetValue()` | 值设置前的合法性检查 |
     * | 验证后处理 | `#plugin.handleAfterSetValue()` | 显示验证结果提示 |
     * | 粘贴验证 | `#plugin.interceptBeforePaste()` | 批量数据粘贴前验证 |
     * | UI 控制 | `#plugin.uiController` | 显示验证状态、错误消息等 |
     * | 规则管理 | `#plugin.rules` / `#plugin.engine` | CRUD 操作验证规则 |
     *
     ** 安全访问模式：**
     * 所有方法都使用可选链操作符 `?.` 访问 #plugin 的属性，
     * 防止插件未初始化或已销毁时空指针异常。
     *
     ** 初始化时机：**
     * 由 DataValidationPlugin 构造函数中传入：
     * ```javascript
     * // DataValidationPlugin.js 第279行
     * const validationStrategy = new ValidationStrategy(this.eventHandler, this);
     * this.addStrategy("validation", validationStrategy);
     * ```
     *
     * @type {import("../../plugins/data-validation/DataValidationPlugin.js").DataValidationPlugin}
     * @see DataValidationPlugin - 数据验证插件类
     */
    #plugin;

    /**
     * 构造函数 - 初始化数据验证策略
     *
     ** 执行步骤：**
     * 1. 调用 `super(handler)` 注册到 EventHandler
     * 2. 保存插件引用到 `#plugin` 私有字段
     *
     ** 设计模式：依赖注入（Dependency Injection）**
     * 通过构造函数参数注入插件实例，而非在内部直接 import 或 new。
     * 这使得：
     * - 策略与插件解耦（可以通过接口抽象）
     * - 便于单元测试（传入 mock 对象）
     * - 支持多个插件实例共存（虽然当前仅一个）
     *
     * @param {import("../../core/EventHandler.js").EventHandler} handler - 事件处理器实例
     *   - 用于调用 runHooks() 触发钩子
     *   - 用于访问 sheet, editor, renderEngine 等上下文
     * @param {import("../../plugins/data-validation/DataValidationPlugin.js").DataValidationPlugin} plugin - 数据验证插件实例
     *   - 必须实现以下接口：
     *     - `active: boolean` - 插件是否处于激活状态
     *     - `interceptBeforeSetValue(row, col, value): boolean` - 值设置拦截器
     *     - `handleAfterSetValue(row, col, value): void` - 值设置后处理
     *     - `interceptBeforePaste(data): boolean` - 粘贴拦截器
     *     - `uiController?: object` - 可选的 UI 控制器
     *       - `onCellSelected(row, col): void` - 单元格选中回调
     */
    constructor(handler, plugin) {
        super(handler);
        this.#plugin = plugin;
    }

    /**
     * 公共方法 - 获取事件处理器映射表（空实现）
     *
     ** 🎯 为什么返回空对象？**
     * ValidationStrategy 是**非事件驱动型策略**，它不监听任何 DOM 事件。
     * 所有验证逻辑都通过**方法调用**触发（由其他策略或 EventHandler 内部调用）。
     *
     ** 典型的调用链：**
     * ```
     * 用户输入 "abc" 到数字单元格
     *    ↓
     * KeyboardStrategy.#handleDirectInput()
     *    ↓
     * EditorManager 提交值变更
     *    ↓
     * EventBus.emit(SHEET_EVENTS.BEFORE_CHANGE, changes)
     *    ↓
     * EventHandler.#subscribeEditorEvents() 监听器
     *    ↓
     * 调用 validationStrategy.interceptBeforeSetValue(row, col, "abc")
     *    ↓
     * ValidationStrategy 委托给 #plugin.interceptBeforeSetValue()
     * ```
     *
     ** 与事件驱动策略对比：**
     * | 特征 | MouseStrategy (事件驱动) | ValidationStrategy (非事件驱动) |
     * |------|------------------------|-------------------------------|
     * | getEventHandlers() | 返回4个事件处理器 | 返回空对象 {} |
     * | 触发方式 | DOM 事件自动触发 | 其他代码显式调用 |
     * | 优先级作用 | 决定事件处理顺序 | 仅用于标识（无实际排序） |
     * | 适用场景 | 用户交互 | 业务逻辑（AOP切面） |
     *
     * @returns {Object<string, Function>} 空的事件映射表
     */
    getEventHandlers() {
        return {};
    }

    /**
     * 公共方法 - 值设置前拦截验证（核心拦截器）
     *
     ** 🎯 核心目的：**
     * 在值写入 CellStore 之前进行合法性校验，充当"守门员"角色。
     * 如果验证失败，可以阻止写入操作，防止非法数据进入系统。
     *
     ** 执行流程：**
     * ```
     * 接收待写入的值 (row, col, value)
     *    ↓
     * 前置条件检查:
     *   ├── 策略是否启用? (!this.enabled)
     *   │   ├── 否 → 返回 true（跳过验证，允许写入）
     *   │   └── 是 ↓
     *   └── 插件是否激活? (!this.#plugin?.active)
     *       ├── 否 → 返回 true（插件未激活，跳过验证）
     *       └── 是 ↓
     * 委托给插件执行实际验证:
     *   #plugin.interceptBeforeSetValue(row, col, value)
     *      ↓
     * 返回验证结果:
     *   ├── true → 验证通过（允许写入）
     *   └── false → 验证失败（阻止写入）
     * ```
     *
     ** 调用时机（由 EventHandler 触发）：**
     * - **BEFORE_CHANGE EventBus 事件** (EventHandler.js 第119-125行)
     *   - KeyboardStrategy 直接输入字符时
     *   - CopyPasteStrategy 粘贴数据时
     *   - API 调用 sheet.setCell() 时
     *   - 公式计算结果写入时
     *
     ** 验证失败时的行为：**
     * 根据 ValidationPlugin 的配置决定：
     * 1. **阻止模式（默认）**：返回 false → EventHandler 取消写入 → 显示错误提示
     * 2. **警告模式**：返回 true 但标记警告 → 允许写入但显示黄色边框
     * 3. **静默模式**：返回 true → 不显示任何提示（仅用于批量导入等场景）
     *
     ** 性能考虑：**
     * - 快速路径：前置条件检查避免不必要的插件调用
     * - 缓存命中：ValidationEngine 内部缓存编译后的正则/公式
     * - 异步选项：复杂规则可异步验证（需配置）
     *
     ** 示例场景：**
     * ```javascript
     * // 场景1：数字范围验证
     * interceptBeforeSetValue(5, 2, 150)
     * // 单元格 C6 配置了 min=0, max=100
     * // → 返回 false（150 超出范围）
     *
     * // 场景2：列表选择验证
     * interceptBeforeSetValue(3, 2, "未知等级")
     * // 单元格 C4 配置了 options=["优秀","良好","及格","不及格"]
     * // → 返回 false（"未知等级" 不在列表中）
     *
     * // 场景3：无验证规则
     * interceptBeforeSetValue(10, 10, "任意值")
     * // 单元格 K11 未配置任何验证规则
     * // → 返回 true（无条件通过）
     * ```
     *
     * @param {number} row - 目标单元格的行号（0-based 索引）
     *   - 范围：0 ~ MAX_ROWS-1（通常为 1048575）
     *   - 用于查找该单元格配置的验证规则
     * @param {number} col - 目标单元格的列号（0-based 索引）
     *   - 范围：0 ~ MAX_COLS-1（通常为 16383）
     *   - 与 row 组合定位唯一单元格
     * @param {*} value - 待写入的新值
     *   - 类型可以是：string, number, boolean, Date, null, undefined
     *   - 对于公式单元格，value 可能是公式字符串（以 "=" 开头）
     *   - 对于空值清除，value 通常为 "" 或 null
     * @returns {boolean}
     *   - **true**: 验证通过（或未启用验证），允许值被写入
     *   - **false**: 验证失败，应阻止值写入并显示错误提示
     *
     * @see EventHandler.js#subscribeEditorEvents() - 调用此方法的入口点
     * @see #handleAfterSetValue() - 配套的后置处理方法
     * @see DataValidationPlugin.interceptBeforeSetValue() - 实际执行验证的方法
     */
    interceptBeforeSetValue(row, col, value) {
        if (!this.enabled || !this.#plugin?.active) return true;

        return this.#plugin.interceptBeforeSetValue(row, col, value);
    }

    /**
     * 公共方法 - 值设置后的验证结果处理（后置通知）
     *
     ** 🎯 核心目的：**
     * 在值成功写入 CellStore 后，执行验证结果的视觉反馈和后续处理。
     * 与 `interceptBeforeSetValue()` 形成完整的"前后置拦截器对"。
     *
     ** 执行流程：**
     * ```
     * 值已成功写入 CellStore
     *    ↓
     * 前置条件检查（同 interceptBeforeSetValue）:
     *   ├── 策略未启用 → 直接返回
     *   └── 插件未激活 → 直接返回
     *    ↓
     * 委托给插件处理:
     *   #plugin.handleAfterSetValue(row, col, value)
     *      ↓
     * 执行的操作（由插件内部决定）:
     *   ├── 更新 UI 反馈（边框颜色、图标等）
     *   ├── 记录验证日志（用于审计追踪）
     *   ├── 触发联动效果（如级联下拉列表更新）
     *   └── 发送通知（邮件、WebSocket 等，如果配置了）
     * ```
     *
     ** 调用时机（由 EventHandler 触发）：**
     * - **AFTER_CHANGE EventBus 事件** (EventHandler.js 第143-147行)
     *   - 在 runHooks(HOOKS.AFTER_CHANGE) 之前调用
     *   - 确保验证 UI 更新在钩子通知之前完成
     *
     ** 与 interceptBeforeSetValue 的区别：**
     * | 特性 | interceptBeforeSetValue | handleAfterSetValue |
     * |------|------------------------|---------------------|
     * | **时机** | 值写入**之前** | 值写入**之后** |
     * | **返回值** | boolean（能否写入） | void（无返回值） |
     * | **能力** | 可**阻止**写入 | 仅**反馈**结果 |
     * | **用途** | 数据守卫 | UI 更新/日志记录 |
     *
     ** 典型的后置处理场景：**
     * 1. **视觉反馈**：
     *    - 验证通过：绿色勾选图标（短暂显示后消失）
     *    - 验证警告：黄色边框 + 气泡提示
     *    - 验证错误：红色边框 + 错误消息 + 禁止图标
     *
     * 2. **数据质量监控**：
     *    - 统计验证失败率（用于仪表盘展示）
     *    - 记录违规详情到审计日志
     *    - 触发告警（当错误率超过阈值时）
     *
     * 3. **业务流程集成**：
     *    - 自动修正（将 "1.23" 格式化为 "$1.23"）
     *    - 级联更新（修改父节点后刷新子节点下拉列表）
     *    - 工作流触发（验证通过后进入审批流程）
     *
     ** 性能优化：**
     * - 无返回值检查（不像前置方法需要判断布尔值）
     * - 可异步执行 UI 更新（不阻塞主线程）
     * - 批量操作时可合并多个调用（debounce）
     *
     * @param {number} row - 已写入值的单元格行号（0-based 索引）
     *   - 应与 interceptBeforeSetValue 调用时一致
     * @param {number} col - 已写入值的单元格列号（0-based 索引）
     *   - 应与 interceptBeforeSetValue 调用时一致
     * @param {*} value - 已成功写入 CellStore 的值
     *   - 注意：这可能是经过格式化或转换后的最终值
     *   - 例如：用户输入 "123" → 存储为 number 类型的 123
     * @returns {void}
     *
     * @see #interceptBeforeSetValue() - 配套的前置拦截方法
     * @see EventHandler.js#subscribeEditorEvents() - AFTER_CHANGE 事件中的调用位置
     * @see DataValidationPlugin.handleAfterSetValue() - 实际处理后置逻辑的方法
     */
    handleAfterSetValue(row, col, value) {
        if (!this.enabled || !this.#plugin?.active) return;

        this.#plugin.handleAfterSetValue(row, col, value);
    }

    /**
     * 公共方法 - 粘贴操作前的批量验证拦截
     *
     ** 🎯 核心目的：**
     * 在用户从剪贴板粘贴大量数据之前，一次性验证所有待粘贴的数据。
     * 相比逐个调用 `interceptBeforeSetValue()`，批量验证更高效且能提供整体视图。
     *
     ** 执行流程：**
     * ```
     * 用户按下 Ctrl+V 或右键粘贴
     *    ↓
     * CopyPasteStrategy 解析剪贴板数据
     *    ↓
     * 构建待粘贴的数据结构:
     *   data = {
     *     values: [[row1_data], [row2_data], ...],
     *     startRow: number,
     *     startCol: number,
     *     sourceRange: { topRow, topCol, bottomRow, bottomCol }
     *   }
     *    ↓
     * 调用 interceptBeforePaste(data)
     *    ↓
     * 前置条件检查（同其他方法）
     *    ↓
     * 委托给插件批量验证:
     *   #plugin.interceptBeforePaste(data)
     *      ↓
     * 返回验证结果:
     *   ├── true → 全部通过（或部分通过，取决于容错策略）
     *   └── false → 全部拒绝（或存在严重错误）
     * ```
     *
     ** 与逐个验证的区别：**
     *
     * | 维度 | 逐个验证 (interceptBeforeSetValue) | 批量验证 (interceptBeforePaste) |
     * |------|----------------------------------|-------------------------------|
     * | **粒度** | 单元格级别 | 区域级别 |
     * | **性能** | O(n) 次 Plugin 调用 | O(1) 次 Plugin 调用 |
     * | **用户体验** | 逐个报错（可能很烦人） | 汇总报告（一次性展示） |
     * | **适用场景** | 键盘输入、API调用 | Ctrl+V 粘贴、拖拽填充 |
     * | **回滚能力** | 无法回滚（单个值） | 可全部回滚（事务性） |
     *
     ** 批量验证的策略选项：**
     *
     * **1. 全有或全无（All-or-Nothing）：**
     * - 只要有一个单元格验证失败就拒绝整个粘贴
     * - 适用于：严格数据质量控制场景
     * - 优点：保证数据一致性
     * - 缺点：用户体验差（因一个错误丢失所有数据）
     *
     * **2. 部分接受（Partial Accept）：**
     * - 验证通过的单元格正常写入，失败的跳过或标记
     * - 适用于：宽松的数据导入场景
     * - 优点：最大化保留有效数据
     * - 缺点：可能导致数据不完整
     *
     * **3. 最佳努力（Best Effort）：**
     * - 尝试自动修复可修复的错误（如格式转换）
     * - 无法修复的才拒绝
     * - 适用于：智能数据清洗场景
     *
     ** 数据结构说明：**
     * @param {Object} data - 待粘贴的数据包
     * @param {Array<Array<*>>} data.values - 二维数组，包含所有待粘贴的单元格值
     *   - 外层数组表示行（从上到下）
     *   - 内层数组表示列（从左到右）
     *   - 空单元格用 null 或 "" 表示
     *   - 示例：`[["A1", "B1"], ["A2", "B2"]]`
     * @param {number} [data.startRow] - 粘贴起始行的行号（0-based）
     *   - 通常是当前活动单元格的行号
     *   - 如果用户选择了区域，则是选中区域的左上角行号
     * @param {number} [data.startCol] - 粘贴起始列的列号（0-based）
     *   - 通常是当前活动单元格的列号
     *   - 如果用户选择了区域，则是选中区域的左上角列号
     * @param {Object} [data.sourceRange] - 原始数据的来源范围（复制时记录）
     * @param {number} data.sourceRange.topRow - 来源区域起始行
     * @param {number} data.sourceRange.topCol - 来源区域起始列
     * @param {number} data.sourceRange.bottomRow - 来源区域结束行
     * @param {number} data.sourceRange.bottomCol - 来源区域结束列
     *
     * @returns {boolean}
     *   - **true**: 验证通过（或部分通过），允许粘贴操作继续
     *   - **false**: 验证失败（严重错误），应取消整个粘贴操作
     *
     * @see CopyPasteStrategy - 触发粘贴操作的策略
     * @see #interceptBeforeSetValue() - 单个单元格的验证方法
     * @see DataValidationPlugin.interceptBeforePaste() - 实际执行批量验证的方法
     */
    interceptBeforePaste(data) {
        if (!this.enabled || !this.#plugin?.active) return true;

        return this.#plugin.interceptBeforePaste(data);
    }

    /**
     * 公共方法 - 处理单元格选中事件（显示验证状态）
     *
     ** 🎯 核心目的：**
     * 当用户选中某个单元格时，显示该单元格的验证状态和相关规则信息。
     * 这是**被动式验证反馈**（与主动式的拦截验证互补）。
     *
     ** 执行流程：**
     * ```
     * 用户点击或导航到某个单元格
     *    ↓
     * MouseStrategy/KeyboardStrategy 更新选区
     *    ↓
     * 触发 AFTER_SELECTION hook
     *    ↓
     * （此处可能有其他监听器调用本方法）
     * 或者由 Selection.onChange 直接调用
     *    ↓
     * 调用 handleCellSelected(row, col)
     *    ↓
     * 前置条件检查:
     *   ├── 策略未启用 → 返回
     *   ├── 插件未激活 → 返回
     *   └── uiController 不存在 → 返回（无法显示UI）
     *    ↓
     * 委托给 UI 控制器:
     *   #plugin.uiController.onCellSelected(row, col)
     *      ↓
     * UI 控制器执行:
     *   ├── 查询该单元格的验证规则
     *   ├── 检查当前值是否符合规则
     *   ├── 更新输入提示（input prompt）
     *   ├── 显示/隐藏验证图标
     *   └── 更新公式栏的验证状态指示器
     * ```
     *
     ** 触发时机：**
     * - 鼠标单击单元格（MouseStrategy）
     * - 方向键导航（KeyboardStrategy）
     * - Tab/Shift+Tab 切换
     * - Enter 确认编辑后移动
     * - API 调用 selection.setActive()
     *
     ** UI 反馈内容：**
     *
     * **1. 输入提示（Input Message）：**
     * ```
     * ┌─────────────────────────────┐
     * │ 📋 输入提示                  │
     * ├─────────────────────────────┤
     * │ 标题: 成绩录入               │
     * │ 内容: 请输入 0-100 之间的数值 │
     * └─────────────────────────────┘
     * ```
     * - 在单元格附近显示（类似 tooltip）
     * - 选中时自动显示，离开时消失
     * - 可配置是否始终显示
     *
     * **2. 验证状态指示器：**
     * - ✅ 绿色勾选：值符合所有规则
     * - ⚠️ 黄色感叹号：值符合但有警告（如即将超出范围）
     * - ❌ 红色叉号：值违反规则
     * - 🔵 蓝色圆圈：有验证规则但值为空
     * - ⚪ 灰色圆圈：无验证规则
     *
     * **3. 下拉列表展开（对于 list 类型）：**
     * - 如果验证类型是 "list"，自动显示下拉箭头
     * - 点击箭头展开选项列表
     * - 支持搜索过滤（选项多时）
     *
     * **4. 公式栏集成：**
     * - 显示单元格的验证规则摘要
     * - 提供快速编辑规则的入口
     * - 显示验证历史（最近5次验证结果）
     *
     ** 为什么需要额外的 uiController 检查？**
     * ValidationPlugin 可能处于"无头模式"（headless mode），
     * 即仅执行验证逻辑但不提供 UI 反馈（常用于服务端渲染或自动化测试）。
     * 此时 `#plugin.uiController` 为 undefined/null，
     * 本方法应安全退出而不报错。
     *
     * ** 性能优化：**
     * - 防抖（debounce）：快速连续切换单元格时合并更新
     * - 懒加载：仅在首次选中时查询验证规则，后续缓存
     * - 虚拟滚动：大量单元格时只渲染可见区域的 UI
     *
     * @param {number} row - 当前选中的单元格行号（0-based 索引）
     *   - 来自 selection.getFocus()[0]
     * @param {number} col - 当前选中的单元格列号（0-based 索引）
     *   - 来自 selection.getFocus()[1]
     * @returns {void}
     *
     * @see #interceptBeforeSetValue() - 主动式验证（写入前拦截）
     * @see #handleAfterSetValue() - 写入后的反馈
     * @see DataValidationPlugin.uiController - UI 控制器实例
     */
    handleCellSelected(row, col) {
        if (!this.enabled || !this.#plugin?.active || !this.#plugin?.uiController) return;

        this.#plugin.uiController.onCellSelected(row, col);
    }
}
