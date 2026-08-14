import { EventStrategy } from "./EventStrategy.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";

/**
 * 数据验证策略 (Data Validation Strategy)
 *
 * 处理Canvas表格中的数据验证逻辑，确保用户输入的数据符合预定义的规则。
 * 作为数据输入的"守门员"，在值写入单元格之前进行校验。
 *
 * 优先级：STRATEGY_PRIORITY.DATA_VALIDATION
 *
 * 核心功能：
 * 1. **前置拦截**：interceptBeforeSetValue 在值写入前校验，返回false阻止写入
 * 2. **后置处理**：handleAfterSetValue 在值写入后执行附加逻辑（如显示提示）
 * 3. **粘贴拦截**：interceptBeforePaste 在粘贴操作前校验数据
 * 4. **选中通知**：handleCellSelected 在单元格选中时显示验证UI（如下拉列表）
 *
 * 验证流程：
 * ┌──────────┐    ┌──────────────────┐    ┌──────────┐
 * │ 用户输入  │ →  │ interceptBefore  │ →  │ 允许/拒绝 │
 * └──────────┘    └──────────────────┘    └──────────┘
 * ┌──────────┐    ┌──────────────────┐
 * │ 写入完成  │ →  │ handleAfter      │ →  │ 显示提示  │
 * └──────────┘    └──────────────────┘
 *
 * 注意：本策略不声明任何DOM事件处理器，通过公共方法被其他组件调用。
 *
 * @class ValidationStrategy
 * @extends EventStrategy
 */
export class ValidationStrategy extends EventStrategy {
    /** 策略名称标识 */
    name: string = "validation";
    /** 策略优先级：数据验证 */
    priority: number = STRATEGY_PRIORITY.DATA_VALIDATION;

    /** 验证插件实例 */
    #plugin: any;

    constructor(handler: any, plugin: any) {
        super(handler);
        this.#plugin = plugin;
    }

    /** 本策略不监听任何DOM事件，通过公共方法被调用 */
    getEventHandlers(): Record<string, (e: Event) => boolean | void> {
        return {};
    }

    /**
     * 前置拦截：在值写入单元格前校验
     * @param row - 行号
     * @param col - 列号
     * @param value - 待写入的值
     * @returns true允许写入，false阻止写入
     */
    interceptBeforeSetValue(row: number, col: number, value: unknown): boolean {
        if (!this.enabled || !this.#plugin?.active) return true;

        return this.#plugin.interceptBeforeSetValue(row, col, value);
    }

    /**
     * 后置处理：值写入单元格后执行附加逻辑
     * @param row - 行号
     * @param col - 列号
     * @param value - 已写入的值
     */
    handleAfterSetValue(row: number, col: number, value: unknown): void {
        if (!this.enabled || !this.#plugin?.active) return;

        this.#plugin.handleAfterSetValue(row, col, value);
    }

    /**
     * 粘贴拦截：在粘贴操作前校验数据
     * @param data - 待粘贴的数据
     * @returns true允许粘贴，false阻止粘贴
     */
    interceptBeforePaste(data: unknown): boolean {
        if (!this.enabled || !this.#plugin?.active) return true;

        return this.#plugin.interceptBeforePaste(data);
    }

    /**
     * 单元格选中通知：显示验证UI（如下拉列表、输入提示等）
     * @param row - 行号
     * @param col - 列号
     */
    handleCellSelected(row: number, col: number): void {
        if (!this.enabled || !this.#plugin?.active || !this.#plugin?.uiController) return;

        this.#plugin.uiController.onCellSelected(row, col);
    }
}
