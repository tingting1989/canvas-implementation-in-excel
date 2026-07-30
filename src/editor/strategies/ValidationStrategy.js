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
    name = "validation";

    priority = STRATEGY_PRIORITY.DATA_VALIDATION;

    #plugin;

    constructor(handler, plugin) {
        super(handler);
        this.#plugin = plugin;
    }

    getEventHandlers() {
        return {};
    }

    interceptBeforeSetValue(row, col, value) {
        if (!this.enabled || !this.#plugin?.active) return true;

        return this.#plugin.interceptBeforeSetValue(row, col, value);
    }

    handleAfterSetValue(row, col, value) {
        if (!this.enabled || !this.#plugin?.active) return;

        this.#plugin.handleAfterSetValue(row, col, value);
    }

    interceptBeforePaste(data) {
        if (!this.enabled || !this.#plugin?.active) return true;

        return this.#plugin.interceptBeforePaste(data);
    }

    handleCellSelected(row, col) {
        if (!this.enabled || !this.#plugin?.active || !this.#plugin?.uiController) return;

        this.#plugin.uiController.onCellSelected(row, col);
    }
}
