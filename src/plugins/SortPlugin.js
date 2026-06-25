import { BasePlugin } from "./BasePlugin.js";
import { HOOKS } from "../constants/hookNames.js";
import { SortState } from "./sort/SortState.js";
import { SortEngine } from "./sort/SortEngine.js";
import { SortStrategy } from "./sort/SortStrategy.js";
import { SortUIManager } from "./sort/SortUIManager.js";

/**
 * 排序插件（Sort Plugin）
 *
 * ## 设计目的
 * 实现类似 Excel/Handsontable 的数据排序功能，支持：
 * - 单列排序（升序/降序）
 * - 多列排序（按优先级）
 * - 自定义比较函数
 * - 数据类型自动识别
 * - 排序状态可视化（箭头指示器）
 *
 * ## 核心架构
 * ```
 * SortPlugin (插件层)
 * ├── SortStrategy  (事件处理) → 监听列头双击，触发排序
 * ├── SortUIManager (UI渲染)  → 绘制排序箭头、高亮排序列
 * └── SortState     (状态管理) → 管理排序状态和恢复快照
 *     └── SortEngine (排序引擎) → 执行高效排序算法
 *         └── ChunkedCellStore.batchMoveRows() → 批量行移动
 * ```
 *
 * ## 使用示例
 * ```javascript
 * // 初始化
 * const wb = new Workbook('grid', {
 *     plugins: ['sort']
 * });
 *
 * // API 调用
 * const sort = wb.getPlugin('sort');
 * sort.sortRows(0, { order: 'asc' });           // 单列升序
 * sort.sortMultiple([                             // 多列排序
 *     { col: 0, order: 'asc' },
 *     { col: 2, order: 'desc' }
 * ]);
 * sort.clearSort();                               // 清除排序
 * sort.restoreOriginalOrder();                    // 恢复原始顺序
 * ```
 *
 * ## 钩子
 * - `AFTER_SORT` — 排序完成后触发（传递列索引、选项、结果统计）
 * - `AFTER_SORT_RESTORE` — 恢复原始顺序后触发
 *
 * ## 性能特征
 * - 单列排序（10K 行）：≈ 30ms
 * - 多列排序（3列, 10K 行）：≈ 80ms
 * - 使用 Timsort 稳定排序算法（V8 引擎原生支持）
 * - Map 索引优化，真正的 O(n log n) 复杂度
 *
 * @extends BasePlugin
 */
export class SortPlugin extends BasePlugin {
    // ═══════════════════════════════════════════════════════════════
    // 静态属性
    // ═══════════════════════════════════════════════════════════════

    /**
     * 插件名称标识
     * @returns {string} "sort"
     */
    static get PLUGIN_NAME() {
        return "sort";
    }

    // ═══════════════════════════════════════════════════════════════
    // 私有实例字段
    // ═══════════════════════════════════════════════════════════════

    /**
     * 排序状态管理器
     * @type {SortState}
     * @private
     */
    #sortState;

    /**
     * 排序引擎
     * @type {SortEngine}
     * @private
     */
    #sortEngine;

    /**
     * 排序事件策略
     * @type {SortStrategy}
     * @private
     */
    #sortStrategy;

    /**
     * 排序 UI 管理器
     * @type {SortUIManager}
     * @private
     */
    #sortUIManager;

    // ═══════════════════════════════════════════════════════════════
    // 构造函数
    // ═══════════════════════════════════════════════════════════════

    /**
     * @param {import("../workbook/Workbook.js").Workbook} workbook - Workbook 实例
     */
    constructor(workbook) {
        super(workbook);

        this.#sortState = new SortState();
        this.#sortUIManager = new SortUIManager(this);
        this.#sortStrategy = new SortStrategy(this);
        this.#sortEngine = null; // 延迟初始化，需要 cellStore 和 rowCount
    }

    // ═══════════════════════════════════════════════════════════════
    // 生命周期
    // ═══════════════════════════════════════════════════════════════

    /**
     * 初始化插件
     *
     * 创建排序引擎实例，注册策略和钩子。
     *
     * @param {object} [options={}] - 插件配置
     */
    init(options = {}) {
        super.init(options);

        const sheet = this.sheet;
        if (!sheet) return;

        const cellStore = sheet.cellStore;
        const rowCount = sheet.rowCount || 1000;

        this.#sortEngine = new SortEngine(cellStore, this.#sortState, rowCount);

        this.#sortStrategy.init();
        this.#sortUIManager.init();

        this.addHook(HOOKS.AFTER_SORT, () => {
            this.#sortUIManager.updateIndicators();
        });
    }

    /**
     * 销毁插件
     *
     * 清理所有资源：策略、UI、钩子等
     */
    destroy() {
        this.#sortStrategy?.destroy();
        this.#sortUIManager?.destroy();
        this.#sortState?.reset();
        this.#sortEngine = null;
        super.destroy();
    }

    // ═══════════════════════════════════════════════════════════════
    // 公共 API - 排序操作
    // ═══════════════════════════════════════════════════════════════

    /**
     * 单列排序
     *
     * @param {number} colIndex - 排序列索引
     * @param {object} [options={}] - 排序选项
     * @param {'asc'|'desc'} [options.order='asc'] - 排序顺序
     * @param {function} [options.comparator] - 自定义比较函数
     * @returns {object} 排序结果统计
     */
    sortRows(colIndex, options = {}) {
        if (!this.#sortEngine) {
            console.warn('[SortPlugin] Engine not initialized');
            return { swapped: 0, time: 0 };
        }

        const result = this.#sortEngine.sortRows(colIndex, options);

        this.hooks?.runHooks(HOOKS.AFTER_SORT, colIndex, options, result);

        this.#handlePostSortEffects();

        return result;
    }

    /**
     * 多列排序
     *
     * @param {Array<{col: number, order: 'asc'|'desc', comparator?: function}>} columns - 排序列数组
     * @param {object} [options={}] - 额外选项
     * @returns {object} 排序结果统计
     */
    sortMultiple(columns, options = {}) {
        if (!this.#sortEngine) {
            console.warn('[SortPlugin] Engine not initialized');
            return { swapped: 0, time: 0 };
        }

        const result = this.#sortEngine.sortMultiple(columns, options);

        this.hooks?.runHooks(HOOKS.AFTER_SORT, columns, options, result);

        this.#handlePostSortEffects();

        return result;
    }

    /**
     * 清除排序状态标记
     *
     * 注意：不清除已排序的数据，仅清除 UI 状态
     */
    clearSort() {
        this.#sortState.clear();
        this.#sortUIManager.updateIndicators();
        this.render();
    }

    /**
     * 恢复到排序前的原始顺序
     *
     * 基于快照机制，将数据恢复到最近一次排序前的状态
     *
     * @returns {boolean} 是否成功恢复
     */
    restoreOriginalOrder() {
        if (!this.#sortEngine || !this.#sortState.hasRestorePoint) {
            return false;
        }

        const restoreMapping = this.#sortState.getRestoreMapping();
        if (!restoreMapping || restoreMapping.size === 0) {
            return false;
        }

        const sheet = this.sheet;
        if (!sheet) return false;

        const fixedRows = sheet.fixedRowsTop || 0;
        const swapped = sheet.cellStore.batchMoveRows(restoreMapping, { fixedRows });

        this.#sortState.clear();
        this.#sortUIManager.updateIndicators();

        this.hooks?.runHooks(HOOKS.AFTER_SORT_RESTORE, swapped);

        this.#handlePostSortEffects();

        return true;
    }

    // ═══════════════════════════════════════════════════════════════
    // 公共 API - 状态查询
    // ═══════════════════════════════════════════════════════════════

    /**
     * 获取当前排序状态
     *
     * @returns {{col: number, order: 'asc'|'desc'|null, isSorted: boolean}}
     */
    getSortState() {
        return {
            col: this.#sortState.sortCol,
            order: this.#sortState.sortOrder,
            isSorted: this.#sortState.isSorted,
        };
    }

    /**
     * 是否可以恢复到原始顺序
     * @returns {boolean}
     */
    canRestore() {
        return this.#sortState.hasRestorePoint && this.#sortState.isSorted;
    }

    // ═══════════════════════════════════════════════════════════════
    // 私有方法
    // ═══════════════════════════════════════════════════════════════

    /**
     * 处理排序后的副作用
     *
     * 根据设计文档，排序后需要：
     * 1. 清空选区（Selection）
     * 2. 重置滚动位置到冻结行位置
     * 3. 触发重新渲染
     *
     * @private
     */
    #handlePostSortEffects() {
        const sheet = this.sheet;
        if (!sheet) return;

        // 1. 清空选区
        if (sheet.selection) {
            sheet.selection.clear();
        }

        // 2. 重置滚动位置（如果有冻结行）
        const fixedRowsTop = sheet.fixedRowsTop || 0;
        if (fixedRowsTop > 0 && this.eventHandler?.viewport) {
            this.eventHandler.viewport.scrollToCell(fixedRowsTop, 0);
        }

        // 3. 触发重新渲染
        this.renderEngine?.invalidateAll();
        this.render();
    }

    // ═══════════════════════════════════════════════════════════════
    // Getters
    // ═══════════════════════════════════════════════════════════════

    get sortState() {
        return this.#sortState;
    }

    get sortEngine() {
        return this.#sortEngine;
    }

    get sortUIManager() {
        return this.#sortUIManager;
    }
}