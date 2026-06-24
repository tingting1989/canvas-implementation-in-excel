/**
 * 事件信封结构
 *
 * 所有通过 EventBus 分发的事件都使用统一的信封格式，
 * 携带来源元数据，便于运行时追踪、调试和契约校验。
 *
 * @typedef {Object} EventEnvelope
 * @property {string} source    - 发射方模块标识（如 "Sheet"、"CellEditor"）
 * @property {string} sheetId   - 所属工作表实例标识（如 "Sheet1"）
 * @property {number} timestamp - 发射时间戳（Date.now()）
 * @property {string} type      - 事件类型（对应 SHEET_EVENTS 常量值）
 * @property {*}      payload   - 业务数据（纯数据，不含 Sheet 对象引用）
 */

import { EVENT_FLOW_REGISTRY } from "../constants/sheetEvents.js";

export class EventBus {
    #listeners = new Map();
    #source;
    #instanceId;
    #strict;

    /**
     * @param {string} source     - 默认发射方模块标识
     * @param {string} instanceId - 默认实例标识（如工作表名称）
     * @param {Object} [options]
     * @param {boolean} [options.strict=false] - 是否启用契约校验
     */
    constructor(source = "", instanceId = "", options = {}) {
        this.#source = source;
        this.#instanceId = instanceId;
        this.#strict = options.strict ?? false;
    }

    on(event, listener) {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, []);
        }
        this.#listeners.get(event).push(listener);
        return () => this.off(event, listener);
    }

    once(event, listener) {
        const unsubscribe = this.on(event, (envelope) => {
            listener(envelope);
            unsubscribe();
        });
        return unsubscribe;
    }

    off(event, listener) {
        const list = this.#listeners.get(event);
        if (!list) return;
        const idx = list.indexOf(listener);
        if (idx > -1) list.splice(idx, 1);
    }

    /**
     * 发射事件，自动将 payload 包装为标准信封
     *
     * 当 strict 模式启用时，会对照 EVENT_FLOW_REGISTRY 校验：
     * - 事件是否在注册表中声明
     * - 发射方 source 是否在合法 emitters 列表中
     *
     * @param {string} event    - 事件类型（SHEET_EVENTS 常量）
     * @param {*}      payload  - 业务数据
     * @param {Object}  [options]             - 覆盖默认元数据
     * @param {string}  [options.source]      - 覆盖默认 source
     * @param {string}  [options.sheetId]     - 覆盖默认 sheetId
     * @returns {*} 最后一个监听器的非 undefined 返回值
     */
    emit(event, payload, options = {}) {
        const source = options.source ?? this.#source;
        const envelope = {
            source,
            sheetId: options.sheetId ?? this.#instanceId,
            timestamp: Date.now(),
            type: event,
            payload: payload === undefined ? {} : payload,
        };

        if (this.#strict) {
            this.#validateContract(event, source);
        }

        const list = this.#listeners.get(event);
        if (!list) return undefined;
        const snapshot = [...list];
        let result;
        for (const fn of snapshot) {
            const ret = fn(envelope);
            if (ret !== undefined) result = ret;
        }
        return result;
    }

    /**
     * 契约校验：对照 EVENT_FLOW_REGISTRY 验证事件发射合法性
     *
     * @param {string} event  - 事件类型
     * @param {string} source - 发射方模块标识
     */
    #validateContract(event, source) {
        const entry = EVENT_FLOW_REGISTRY[event];
        if (!entry) {
            console.warn(
                `[EventBus] 契约校验: 事件 "${event}" 未在 EVENT_FLOW_REGISTRY 中声明`
            );
            return;
        }
        if (entry.emitters.length > 0 && !entry.emitters.includes(source)) {
            const msg =
                `[EventBus] 契约校验: 事件 "${event}" 的发射方 "${source}" 不在合法列表 [${entry.emitters.join(", ")}] 中`;
            console.error(msg);
            throw new Error(msg);
        }
    }

    removeAll() {
        this.#listeners.clear();
    }

    listenerCount(event) {
        return this.#listeners.get(event)?.length ?? 0;
    }

    eventNames() {
        return [...this.#listeners.keys()];
    }
}