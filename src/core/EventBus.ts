import { errorHandler } from "./ErrorHandler";
import { EVENT_FLOW_REGISTRY } from "../constants/sheetEvents";
import { ERROR_CODE } from "../constants/errorCodes";

/**
 * 事件信封结构
 *
 * 所有通过 EventBus 分发的事件都使用统一的信封格式，
 * 携带来源元数据，便于运行时追踪、调试和契约校验。
 *
 * @property {string} source    - 发射方模块标识（如 "Sheet"、"CellEditor"）
 * @property {string} sheetId   - 所属工作表实例标识（如 "Sheet1"）
 * @property {number} timestamp - 发射时间戳（Date.now()）
 * @property {string|symbol} type - 事件类型（字符串事件名或 Symbol 事件标识）
 * @property {unknown} payload  - 业务数据（纯数据，不含 Sheet 对象引用）
 */
export interface EventEnvelope {
    source: string;
    sheetId: string;
    timestamp: number;
    type: string | symbol;
    payload: unknown;
}

/**
 * EventBus 构造选项
 *
 * @property {boolean} [strict=false] - 是否启用契约校验模式
 */
interface EventBusOptions {
    strict?: boolean;
}

/**
 * 事件监听器回调函数类型
 *
 * 接收标准事件信封，返回值用于 emit 的结果收集。
 * 返回非 undefined 值会被 emit 作为最终返回值。
 *
 * @param {EventEnvelope} envelope - 事件信封（包含来源、时间戳、类型和载荷）
 * @returns {unknown} 监听器处理结果（非 undefined 值会被 emit 收集）
 */
type EventListener = (envelope: EventEnvelope) => unknown;

/**
 * EventBus — 事件总线（发布-订阅模式的核心通信基础设施）
 *
 * 提供类型安全的事件注册、分发和契约校验机制。
 * 所有事件通过标准信封（EventEnvelope）格式传递，携带来源元数据。
 *
 * 核心能力：
 * - `on()/once()`: 注册持久/一次性事件监听器（返回取消订阅函数）
 * - `off()`: 注销指定事件监听器
 * - `emit()`: 发射事件（自动包装信封，支持契约校验）
 * - `removeAll()/listenerCount()/eventNames()`: 管理和查询方法
 *
 * 契约校验（strict 模式）：
 * 启用后，emit 时会对照 EVENT_FLOW_REGISTRY 校验：
 * - 事件是否在注册表中声明
 * - 发射方 source 是否在合法 emitters 列表中
 * 注意：契约校验仅对字符串事件生效，Symbol 事件因注册表为字符串键而跳过校验。
 *
 * @example
 * const bus = new EventBus('SheetModule', 'Sheet1', { strict: true });
 * const unsub = bus.on('cell:select', (envelope) => { console.log(envelope.payload); });
 * bus.emit('cell:select', { row: 1, col: 1 });
 * unsub();
 */
export class EventBus {
    /**
     * @private 私有字段 - 事件监听器注册表
     *
     * 键为事件名（string）或事件标识（symbol），值为监听器回调数组。
     * 同一事件可注册多个监听器，按注册顺序执行。
     */
    #listeners = new Map<string | symbol, EventListener[]>();

    /**
     * @private 私有字段 - 默认发射方模块标识
     *
     * 作为 emit 时 envelope.source 的默认值，可通过 options.source 覆盖。
     */
    #source: string;

    /**
     * @private 私有字段 - 默认实例标识（如工作表名称）
     *
     * 作为 emit 时 envelope.sheetId 的默认值，可通过 options.sheetId 覆盖。
     */
    #instanceId: string;

    /**
     * @private 私有字段 - 是否启用契约校验模式
     *
     * 启用后，每次 emit 字符串事件时会对照 EVENT_FLOW_REGISTRY 校验合法性。
     * Symbol 事件因注册表为字符串键而跳过校验（这是对 JS 版本的改进）。
     */
    #strict: boolean;

    /**
     * 创建 EventBus 实例
     *
     * @param {string} [source=""] - 默认发射方模块标识
     * @param {string} [instanceId=""] - 默认实例标识（如工作表名称）
     * @param {EventBusOptions} [options={}] - 配置选项
     * @param {boolean} [options.strict=false] - 是否启用契约校验
     */
    constructor(source = "", instanceId = "", options: EventBusOptions = {}) {
        this.#source = source;
        this.#instanceId = instanceId;
        this.#strict = options.strict ?? false;
    }

    /**
     * 注册持久事件监听器
     *
     * 返回取消订阅函数，调用后移除该监听器（无需保存 listener 引用）。
     *
     * @param {string|symbol} event - 事件名或事件标识
     * @param {EventListener} listener - 事件监听回调函数
     * @returns {Function} 取消订阅函数（调用后移除此监听器）
     */
    on(event: string | symbol, listener: EventListener): () => void {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, []);
        }
        this.#listeners.get(event)!.push(listener);
        return () => this.off(event, listener);
    }

    /**
     * 注册一次性事件监听器（触发后自动移除）
     *
     * 内部通过 on + 自动 unsubscribe 实现，首次触发后立即取消订阅。
     *
     * @param {string|symbol} event - 事件名或事件标识
     * @param {EventListener} listener - 事件监听回调函数（仅执行一次）
     * @returns {Function} 取消订阅函数
     */
    once(event: string | symbol, listener: EventListener): () => void {
        const unsubscribe = this.on(event, (envelope) => {
            listener(envelope);
            unsubscribe();
        });
        return unsubscribe;
    }

    /**
     * 注销指定事件的特定监听器
     *
     * 通过引用匹配移除监听器（使用 indexOf 查找）。
     * 推荐使用 on() 返回的取消订阅函数代替手动 off()。
     *
     * @param {string|symbol} event - 事件名或事件标识
     * @param {EventListener} listener - 要移除的监听器回调引用
     * @returns {void}
     */
    off(event: string | symbol, listener: EventListener): void {
        const list = this.#listeners.get(event);
        if (!list) return;
        const idx = list.indexOf(listener);
        if (idx > -1) list.splice(idx, 1);
    }

    /**
     * 发射事件（自动包装为标准信封格式）
     *
     * 执行流程：
     * 1. 构建事件信封（source, sheetId, timestamp, type, payload）
     * 2. strict 模式下校验字符串事件的契约合法性
     * 3. 快照当前监听器列表（防止执行中修改）
     * 4. 顺序执行所有监听器，收集最后一个非 undefined 返回值
     *
     * @param {string|symbol} event - 事件名或事件标识
     * @param {unknown} [payload] - 业务数据载荷（undefined 时自动替换为空对象 {}）
     * @param {Object} [options={}] - 覆盖默认元数据
     * @param {string} [options.source] - 覆盖默认 source
     * @param {string} [options.sheetId] - 覆盖默认 sheetId
     * @returns {unknown} 最后一个监听器的非 undefined 返回值（无监听器时返回 undefined）
     */
    emit(event: string | symbol, payload?: unknown, options: { source?: string; sheetId?: string } = {}): unknown {
        const source = options.source ?? this.#source;
        const envelope: EventEnvelope = {
            source,
            sheetId: options.sheetId ?? this.#instanceId,
            timestamp: Date.now(),
            type: event,
            payload: payload === undefined ? {} : payload,
        };

        // 仅对字符串事件执行契约校验（Symbol 事件因注册表为字符串键而跳过）
        if (this.#strict && typeof event === "string") {
            this.#validateContract(event, source);
        }

        const list = this.#listeners.get(event);
        if (!list) return undefined;
        const snapshot = [...list];
        let result: unknown;
        for (const fn of snapshot) {
            const ret = fn(envelope);
            if (ret !== undefined) result = ret;
        }
        return result;
    }

    /**
     * @private 私有方法 - 契约校验：对照 EVENT_FLOW_REGISTRY 验证事件发射合法性
     *
     * 校验规则：
     * 1. 事件必须在 EVENT_FLOW_REGISTRY 中声明（未声明则发出 WARN）
     * 2. 如果声明了 emitters 列表，发射方 source 必须在列表中（否则抛出异常）
     *
     * @param {string} event - 事件类型（仅字符串事件会进入此方法）
     * @param {string} source - 发射方模块标识
     * @returns {void}
     * @throws {Error} 当发射方不在合法 emitters 列表中时抛出
     */
    #validateContract(event: string, source: string): void {
        const entry = (EVENT_FLOW_REGISTRY as unknown as Record<string, { emitters: readonly string[] }>)[event];
        if (!entry) {
            errorHandler.warn(ERROR_CODE.GENERIC_WARN, `[EventBus] 契约校验: 事件 "${event}" 未在 EVENT_FLOW_REGISTRY 中声明`);
            return;
        }
        if (entry.emitters.length > 0 && !entry.emitters.includes(source)) {
            const msg = `[EventBus] 契约校验: 事件 "${event}" 的发射方 "${source}" 不在合法列表 [${entry.emitters.join(", ")}] 中`;
            errorHandler.error(ERROR_CODE.GENERIC_ERROR, msg);
            throw new Error(msg);
        }
    }

    /**
     * 移除所有事件监听器（重置事件总线）
     *
     * @returns {void}
     */
    removeAll(): void {
        this.#listeners.clear();
    }

    /**
     * 查询指定事件的监听器数量
     *
     * @param {string|symbol} event - 事件名或事件标识
     * @returns {number} 监听器数量（无监听器时返回 0）
     */
    listenerCount(event: string | symbol): number {
        return this.#listeners.get(event)?.length ?? 0;
    }

    /**
     * 获取所有已注册的事件名称列表
     *
     * @returns {(string|symbol)[]} 事件名称/标识数组
     */
    eventNames(): (string | symbol)[] {
        return [...this.#listeners.keys()];
    }
}
