/** 样式变更记录条目 */
interface StyleChangeEntry {
    type: string;
    key: string;
    oldStyleId: number;
    newStyleId: number;
}

/** 样式管理器最小接口 */
interface StyleManager {
    applyStyleId(type: string, key: string, styleId: number): void;
}

/**
 * 样式变更记录器 (Style Change Recorder)
 *
 * 在一次用户操作中收集所有样式变更记录，
 * 最终通过 buildCommand() 将收集的变更打包为一个 StyleChangeCommand。
 *
 * @class StyleChangeRecorder
 */
export class StyleChangeRecorder {
    /** 样式变更记录列表 */
    #changes: StyleChangeEntry[] = [];

    /**
     * 记录一次样式变更
     * @param type - 样式目标类型，如 "cell"、"row"、"col"
     * @param key - 样式目标键，如 "0,0"、"3"、"5"
     * @param oldStyleId - 变更前的样式ID
     * @param newStyleId - 变更后的样式ID
     */
    record(type: string, key: string, oldStyleId: number, newStyleId: number): void {
        this.#changes.push({ type, key, oldStyleId, newStyleId });
    }

    /**
     * 将已收集的变更记录构建为 StyleChangeCommand 命令
     * 构建后自动清空内部记录列表
     * @param styleManager - 样式管理器实例
     * @returns 样式变更命令，若无变更记录则返回 null
     */
    buildCommand(styleManager: StyleManager): StyleChangeCommand | null {
        if (this.#changes.length === 0) return null;
        const cmd = new StyleChangeCommand(styleManager, [...this.#changes]);
        this.#changes = [];
        return cmd;
    }

    /** 清空所有已记录的变更 */
    reset(): void {
        this.#changes = [];
    }

    /** 获取当前已记录的变更数量 */
    get size(): number {
        return this.#changes.length;
    }
}

/**
 * 样式变更命令 (Style Change Command)
 *
 * 将多个样式变更打包为一个原子操作，遵循 Command 模式以支持撤销/重做。
 *
 * @class StyleChangeCommand
 */
export class StyleChangeCommand {
    /** 样式管理器 */
    #styleManager: StyleManager;
    /** 样式变更记录列表 */
    #changes: StyleChangeEntry[];

    /**
     * @param styleManager - 样式管理器实例
     * @param changes - 样式变更记录数组
     */
    constructor(styleManager: StyleManager, changes: StyleChangeEntry[]) {
        this.#styleManager = styleManager;
        this.#changes = changes;
    }

    /** 正序执行所有样式变更 */
    redo(): void {
        for (const { type, key, newStyleId } of this.#changes) {
            this.#styleManager.applyStyleId(type, key, newStyleId);
        }
    }

    /** 逆序撤销所有样式变更 */
    undo(): void {
        for (let i = this.#changes.length - 1; i >= 0; i--) {
            const { type, key, oldStyleId } = this.#changes[i];
            this.#styleManager.applyStyleId(type, key, oldStyleId);
        }
    }
}

export type { StyleChangeEntry, StyleManager };
