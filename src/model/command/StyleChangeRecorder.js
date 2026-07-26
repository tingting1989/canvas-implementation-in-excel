/**
 * 样式变更记录器
 *
 * 在一次用户操作中（如批量设置字体、边框等），收集所有样式变更记录，
 * 最终通过 buildCommand() 将收集的变更打包为一个 StyleChangeCommand，
 * 以支持一次性撤销/重做整个样式变更操作。
 *
 * 典型使用流程：
 * 1. 创建 recorder 实例
 * 2. 每次样式变更调用 record() 记录旧/新样式ID
 * 3. 操作结束后调用 buildCommand() 生成可撤销命令
 * 4. 命令交由 HistoryStack 管理
 *
 * @example
 * const recorder = new StyleChangeRecorder();
 * recorder.record("cell", "0,0", oldStyleId, newStyleId);
 * recorder.record("cell", "0,1", oldStyleId2, newStyleId2);
 * const cmd = recorder.buildCommand(styleManager);
 * if (cmd) historyStack.push(cmd);
 */
export class StyleChangeRecorder {
    /** @type {{ type: string, key: string, oldStyleId: number, newStyleId: number }[]} 样式变更记录列表 */
    #changes = [];

    /**
     * 记录一次样式变更
     * @param {string} type - 样式目标类型，如 "cell"（单元格）、"row"（行）、"col"（列）
     * @param {string} key - 样式目标键，如单元格坐标 "0,0"、行号 "3"、列号 "5"
     * @param {number} oldStyleId - 变更前的样式ID
     * @param {number} newStyleId - 变更后的样式ID
     */
    record(type, key, oldStyleId, newStyleId) {
        this.#changes.push({ type, key, oldStyleId, newStyleId });
    }

    /**
     * 将已收集的变更记录构建为 StyleChangeCommand 命令
     * 构建后自动清空内部记录列表
     * @param {object} styleManager - 样式管理器实例，需提供 applyStyleId() 方法
     * @returns {StyleChangeCommand|null} 样式变更命令，若无变更记录则返回 null
     */
    buildCommand(styleManager) {
        if (this.#changes.length === 0) return null;
        const cmd = new StyleChangeCommand(styleManager, [...this.#changes]);
        this.#changes = [];
        return cmd;
    }

    /**
     * 清空所有已记录的变更，放弃本次操作的所有样式变更记录
     */
    reset() {
        this.#changes = [];
    }

    /**
     * 获取当前已记录的变更数量
     * @returns {number} 变更记录数
     */
    get size() {
        return this.#changes.length;
    }
}

/**
 * 样式变更命令
 *
 * 将多个样式变更打包为一个原子操作，遵循 Command 模式以支持撤销/重做。
 * - redo 时按正序依次应用新样式ID
 * - undo 时按逆序依次恢复旧样式ID，确保依赖关系正确还原
 *
 * @example
 * const cmd = new StyleChangeCommand(styleManager, [
 *     { type: "cell", key: "0,0", oldStyleId: 1, newStyleId: 5 },
 *     { type: "cell", key: "0,1", oldStyleId: 2, newStyleId: 5 },
 * ]);
 * cmd.redo(); // 将 (0,0) 和 (0,1) 的样式设为 5
 * cmd.undo(); // 逆序恢复，(0,1) 恢复为 2，(0,0) 恢复为 1
 */
export class StyleChangeCommand {
    /** @type {object} 样式管理器，提供 applyStyleId() 方法 */
    #styleManager;
    /** @type {{ type: string, key: string, oldStyleId: number, newStyleId: number }[]} 样式变更记录列表 */
    #changes;

    /**
     * @param {object} styleManager - 样式管理器实例，需提供 applyStyleId(type, key, styleId) 方法
     * @param {{ type: string, key: string, oldStyleId: number, newStyleId: number }[]} changes - 样式变更记录数组
     */
    constructor(styleManager, changes) {
        this.#styleManager = styleManager;
        this.#changes = changes;
    }

    /**
     * 正序执行所有样式变更，将每个目标应用新样式ID
     */
    redo() {
        for (const { type, key, newStyleId } of this.#changes) {
            this.#styleManager.applyStyleId(type, key, newStyleId);
        }
    }

    /**
     * 逆序撤销所有样式变更，将每个目标恢复旧样式ID
     * 逆序撤销确保样式依赖关系正确还原
     */
    undo() {
        for (let i = this.#changes.length - 1; i >= 0; i--) {
            const { type, key, oldStyleId } = this.#changes[i];
            this.#styleManager.applyStyleId(type, key, oldStyleId);
        }
    }
}
