/**
 * 事件策略基类
 * 所有交互策略的抽象基类，提供统一接口规范和基础功能
 *
 * 事件委托模式：
 * - 策略通过 getEventHandlers() 声明需要监听的事件
 * - EventHandler 统一绑定 DOM 事件，策略无需自行操作 DOM
 * - 策略通过 priority 属性声明优先级（数值越大越先处理事件）
 * - 事件处理器返回 false 可阻止后续低优先级策略接收同一事件
 */
export class EventStrategy {
    /** 策略优先级（数值越大越先处理事件），子类可覆盖 */
    priority = 0;

    /**
     * @param {import("../../core/EventHandler.js").EventHandler} handler
     */
    constructor(handler) {
        this.handler = handler;
        this.enabled = true;
    }

    /**
     * 初始化策略（子类可覆盖，用于非事件相关的初始化）
     */
    init() {}

    /**
     * 销毁策略（子类可覆盖，用于清理非事件资源）
     */
    destroy() {}

    /**
     * 启用策略
     */
    enable() {
        this.enabled = true;
    }

    /**
     * 禁用策略
     */
    disable() {
        this.enabled = false;
    }

    /**
     * 声明此策略需要监听的事件处理器
     * 由 EventHandler 统一绑定，策略无需自行操作 DOM
     *
     * @returns {Object<string, Function>} 事件处理器映射
     * 键格式: "target:eventType"（如 "canvas:mousedown"、"document:mousemove"）
     * 值: 事件处理函数，返回 false 可阻止后续策略接收同一事件
     */
    getEventHandlers() {
        return {};
    }
}
