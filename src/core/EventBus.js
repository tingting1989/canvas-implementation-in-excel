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

export class EventBus {
    #listeners = new Map();
    #source;
    #instanceId;

    /**
     * @param {string} source     - 默认发射方模块标识
     * @param {string} instanceId - 默认实例标识（如工作表名称）
     */
    constructor(source = "", instanceId = "") {
        this.#source = source;
        this.#instanceId = instanceId;
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
     * @param {string} event    - 事件类型（SHEET_EVENTS 常量）
     * @param {*}      payload  - 业务数据
     * @param {Object}  [options]             - 覆盖默认元数据
     * @param {string}  [options.source]      - 覆盖默认 source
     * @param {string}  [options.sheetId]     - 覆盖默认 sheetId
     * @returns {*} 最后一个监听器的非 undefined 返回值
     */
    emit(event, payload, options = {}) {
        const envelope = {
            source: options.source ?? this.#source,
            sheetId: options.sheetId ?? this.#instanceId,
            timestamp: Date.now(),
            type: event,
            payload: payload === undefined ? {} : payload,
        };

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