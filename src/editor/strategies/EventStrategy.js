/**
 * 事件策略基类
 * 它是一个抽象基类，为所有事件策略提供统一的接口规范和基础功能。
 */
export class EventStrategy {
    /**
     * @param {import("../EventHandler.js").EventHandler} handler
     */
    constructor(handler) {
        this.handler = handler;
        this.enabled = true;
    }

    /**
     * 初始化策略（绑定事件）
     */
    init() {
    }

    /**
     * 销毁策略（解绑事件）
     */
    destroy() {
    }

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
}