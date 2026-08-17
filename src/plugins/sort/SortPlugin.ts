import { BasePlugin } from "../BasePlugin.js";
import { HOOKS } from "../../constants/hookNames.js";
import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import { SortState } from "./SortState.js";
import { SortEngine } from "./SortEngine.js";
import { SortStrategy } from "../../editor/strategies/SortStrategy.js";
import { SortUIManager } from "./SortUIManager.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

/** 排序结果统计 */
interface SortResult {
    swapped: number;
    time: number;
    rowCount?: number;
    columns?: number;
}

/** 排序状态快照 */
interface SortStateSnapshot {
    col: number;
    order: string | null;
    isSorted: boolean;
}

/** 排序列配置 */
interface SortColumn {
    col: number;
    order: string;
    comparator?: ((a: any, b: any) => number) | null;
}

/** 排序选项 */
interface SortOptions {
    fixedRows?: number;
    hiddenRows?: number[];
    order?: string;
    comparator?: ((a: any, b: any) => number) | null;
    caseSensitive?: boolean;
    [key: string]: any;
}

/** 列头渲染回调函数签名 */
type HeaderRendererCallback = (ctx: CanvasRenderingContext2D, colIndex: number, x: number, y: number, width: number, height: number) => void;

/**
 * 排序插件（SortPlugin）
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
 * @module plugins/sort/SortPlugin
 */
export class SortPlugin extends BasePlugin {
    /**
     * 插件名称标识
     *
     * @returns "sort"
     */
    static get PLUGIN_NAME(): string {
        return "sort";
    }

    /** @private 私有字段 - 排序状态管理器 */
    #sortState: SortState;

    /** @private 私有字段 - 排序引擎 */
    #sortEngine: SortEngine | null;

    /** @private 私有字段 - 冻结行数 */
    #fixedRowsTop: number;

    /** @private 私有字段 - 排序事件策略 */
    #sortStrategy: SortStrategy | null;

    /** @private 私有字段 - 排序 UI 管理器 */
    #sortUIManager: SortUIManager | null;

    /** @private 私有字段 - 插件是否处于激活状态（已初始化且未禁用） */
    #active: boolean = false;

    /** @private 私有字段 - 允许排序的列索引集合（Set 用于 O(1) 查找），null 表示所有列都不允许排序 */
    #sortableColumns: Set<number> | null = null;

    /** @private 私有字段 - 列头渲染回调（用于绘制排序UI） */
    #headerRendererCallback: HeaderRendererCallback | null = null;

    /** @private 私有字段 - 工作表切换事件取消订阅函数 */
    #sheetSwitchUnsubscribe: (() => void) | null = null;

    /**
     * @param workbook - Workbook 实例
     */
    constructor(workbook: any) {
        super(workbook);

        this.#sortState = new SortState();
        this.#sortUIManager = new SortUIManager(this);
        this.#sortEngine = null;
        this.#sortStrategy = null;
        this.#fixedRowsTop = 0;
    }

    /**
     * 初始化插件
     *
     * 创建排序引擎实例，注册策略和钩子。
     *
     * @param options - 插件配置
     */
    init(options: any = {}): void {
        super.init(options);

        const sheet = this.sheet;
        if (!sheet) return;

        this.#initSortEngine(sheet);

        this.#parseSortableColumns(options.sortableColumns);

        this.#sortStrategy = new SortStrategy(this.eventHandler, this);
        this.addStrategy("sort", this.#sortStrategy);

        (this.#sortUIManager as SortUIManager).init();

        (this.#sortUIManager as SortUIManager).setShowSortableIndicators(true, this.#sortableColumns);

        this.#registerHeaderRenderer();

        this.#bindSheetSwitchListener(sheet);

        this.#active = true;
        this.renderEngine?.invalidateAll();
        this.render();
    }

    /**
     * @private 私有方法 - 初始化/重新初始化排序引擎
     *
     * @param sheet - 目标工作表
     */
    #initSortEngine(sheet: any): void {
        if (!sheet) return;

        const cellStore = sheet.cellStore;
        const rowCount = sheet.rowColManager?.rowCount || 1000;

        this.#sortEngine = new SortEngine(cellStore, this.#sortState, rowCount);
        this.#fixedRowsTop = sheet.fixedRowsTop || 0;
    }

    /**
     * @private 私有方法 - 解析可排序列配置
     *
     * 配置规则：
     * - 如果未配置（undefined/null）或为空数组 → 所有列都不可排序
     * - 如果配置了数组 → 只有数组中的列索引可以排序
     *
     * @param sortableColumns - 可排序列索引数组
     */
    #parseSortableColumns(sortableColumns: number[] | undefined | null): void {
        if (!sortableColumns || !Array.isArray(sortableColumns) || sortableColumns.length === 0) {
            this.#sortableColumns = null;
            return;
        }

        this.#sortableColumns = new Set(sortableColumns.map((col) => Number(col)));
    }

    /**
     * 检查指定列是否允许排序
     *
     * @param colIndex - 列索引
     * @returns 是否可排序
     */
    isColumnSortable(colIndex: number): boolean {
        if (this.#sortableColumns === null) {
            return false;
        }

        if (this.#sortableColumns.size === 0) {
            return false;
        }

        return this.#sortableColumns.has(colIndex);
    }

    /**
     * @private 私有方法 - 绑定工作表切换事件监听器
     *
     * 使用 EventBus（内部模块通信）而非 Hooks（用户扩展接口）
     *
     * @param sheet - 当前工作表
     */
    #bindSheetSwitchListener(sheet: any): void {
        if (!sheet?.bus) return;

        this.#unbindSheetSwitchListener();

        this.#sheetSwitchUnsubscribe = sheet.bus.on(SHEET_EVENTS.SHEET_SWITCHED, (envelope: any) => {
            const { currentSheet } = envelope.payload;
            const newSheet = this.workbook!.sheets.get(currentSheet);
            if (newSheet) {
                this.#onSheetSwitched(newSheet);
            }
        });
    }

    /**
     * @private 私有方法 - 解绑工作表切换事件监听器
     */
    #unbindSheetSwitchListener(): void {
        if (this.#sheetSwitchUnsubscribe) {
            this.#sheetSwitchUnsubscribe();
            this.#sheetSwitchUnsubscribe = null;
        }
    }

    /**
     * @private 私有方法 - 工作表切换时的回调处理
     *
     * @param newSheet - 新的工作表
     */
    #onSheetSwitched(newSheet: any): void {
        if (!newSheet) return;

        this.#initSortEngine(newSheet);

        this.#bindSheetSwitchListener(newSheet);

        this.#sortState.clear();
        (this.#sortUIManager as SortUIManager).updateIndicators();

        this.renderEngine?.invalidateAll();
        this.render();
    }

    /**
     * @private 私有方法 - 注册列头扩展渲染器
     */
    #registerHeaderRenderer(): void {
        if (!this.renderEngine?.headerRenderer) return;

        this.#headerRendererCallback = (ctx: CanvasRenderingContext2D, colIndex: number, x: number, y: number, width: number, height: number) => {
            if (!this.active) return;

            (this.#sortUIManager as SortUIManager).drawSortIndicator(ctx, colIndex, x, y, width, height);
            (this.#sortUIManager as SortUIManager).highlightSortedColumn(ctx, colIndex, x, y, width, height);
        };

        this.renderEngine.headerRenderer.registerColumnHeaderRenderer(this.#headerRendererCallback);
    }

    /**
     * @private 私有方法 - 注销列头扩展渲染器
     */
    #unregisterHeaderRenderer(): void {
        if (this.renderEngine?.headerRenderer && this.#headerRendererCallback) {
            this.renderEngine.headerRenderer.unregisterColumnHeaderRenderer(this.#headerRendererCallback);
            this.#headerRendererCallback = null;
        }
    }

    /** 插件是否处于激活状态 */
    get active(): boolean {
        return this.#active;
    }

    /** 获取冻结行数 */
    get fixedRowsTop(): number {
        return this.#fixedRowsTop || 0;
    }

    /**
     * 启用插件
     *
     * 恢复激活状态。注意：不会自动恢复之前的排序状态，
     * 需要手动调用 sortRows() 或 restoreOriginalOrder() 等方法。
     */
    enable(): void {
        super.enable();
        this.#active = true;
        if (this.#sortStrategy) {
            this.#sortStrategy.enable();
        }
    }

    /**
     * 禁用插件
     *
     * 清除排序状态和 UI 指示器，失效缓存并重新渲染。
     * 禁用后用户无法看到任何排序效果（箭头、高亮等）。
     */
    disable(): void {
        super.disable();
        this.#active = false;
        this.clearSort();
        this.renderEngine?.invalidateAll();
        this.render();
    }

    /**
     * 销毁插件
     *
     * 先禁用（清除排序状态），再调用父类销毁清理所有注册资源。
     * 策略会由基类 removeOwnStrategies() 自动清理。
     */
    destroy(): void {
        this.disable();
        this.#unregisterHeaderRenderer();
        this.#unbindSheetSwitchListener();
        this.#sortState?.reset();
        this.#sortEngine = null;
        this.#sortUIManager = null;
        this.#sortStrategy = null;
        super.destroy();
    }

    /**
     * 单列排序
     *
     * @param colIndex - 排序列索引
     * @param options - 排序选项
     * @returns 排序结果统计
     */
    sortRows(colIndex: number, options: SortOptions = {}): SortResult {
        if (!this.#sortEngine) {
            errorHandler.warn(ERROR_CODE.SORT_ENGINE_NOT_INITIALIZED, "Sort engine not initialized");
            return { swapped: 0, time: 0 };
        }

        const sortOptions = {
            ...options,
            fixedRows: options.fixedRows ?? this.#fixedRowsTop,
        };

        const result = this.#sortEngine.sortRows(colIndex, sortOptions);

        this.hooks?.runHooks(HOOKS.AFTER_SORT, colIndex, options, result);

        this.#handlePostSortEffects();

        return result;
    }

    /**
     * 多列排序
     *
     * @param columns - 排序列数组
     * @param options - 额外选项
     * @returns 排序结果统计
     */
    sortMultiple(columns: SortColumn[], options: SortOptions = {}): SortResult {
        if (!this.#sortEngine) {
            errorHandler.warn(ERROR_CODE.SORT_ENGINE_NOT_INITIALIZED, "Sort engine not initialized");
            return { swapped: 0, time: 0 };
        }

        const sortOptions = {
            ...options,
            fixedRows: options.fixedRows ?? this.#fixedRowsTop,
        };

        const result = this.#sortEngine.sortMultiple(columns, sortOptions);

        this.hooks?.runHooks(HOOKS.AFTER_SORT, columns, options, result);

        this.#handlePostSortEffects();

        return result;
    }

    /**
     * 清除排序状态标记
     *
     * 注意：不清除已排序的数据，仅清除 UI 状态
     */
    clearSort(): void {
        this.#sortState.clear();
        (this.#sortUIManager as SortUIManager).updateIndicators();
        this.render();
    }

    /**
     * 恢复到排序前的原始顺序
     *
     * 基于快照机制，将数据恢复到最近一次排序前的状态
     *
     * @returns 是否成功恢复
     */
    restoreOriginalOrder(): boolean {
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
        (this.#sortUIManager as SortUIManager).updateIndicators();

        this.hooks?.runHooks(HOOKS.AFTER_SORT_RESTORE, swapped);

        this.#handlePostSortEffects();

        return true;
    }

    /**
     * 获取当前排序状态
     *
     * @returns 排序状态快照
     */
    getSortState(): SortStateSnapshot {
        return {
            col: this.#sortState.sortCol,
            order: this.#sortState.sortOrder,
            isSorted: this.#sortState.isSorted,
        };
    }

    /**
     * 是否可以恢复到原始顺序
     */
    canRestore(): boolean {
        return this.#sortState.hasRestorePoint && this.#sortState.isSorted;
    }

    /**
     * @private 私有方法 - 处理排序后的副作用
     *
     * 根据设计文档，排序后需要：
     * 1. 清空选区（Selection）
     * 2. 重置滚动位置到冻结行位置
     * 3. 触发重新渲染
     */
    #handlePostSortEffects(): void {
        const sheet = this.sheet;
        if (!sheet) return;

        (this.#sortUIManager as SortUIManager).updateIndicators();

        if (sheet.selection && typeof sheet.selection.setActive === "function") {
            sheet.selection.setActive(0, 0);
        }

        const fixedRowsTop = sheet.fixedRowsTop || 0;
        if (fixedRowsTop > 0 && this.eventHandler?.viewport) {
            (this.eventHandler.viewport as any).scrollToCell(fixedRowsTop, 0);
        }

        this.renderEngine?.invalidateAll();
        this.render();
    }

    /** 获取排序状态管理器 */
    get sortState(): SortState {
        return this.#sortState;
    }

    /** 获取排序引擎 */
    get sortEngine(): SortEngine | null {
        return this.#sortEngine;
    }

    /** 获取排序策略 */
    get sortStrategy(): SortStrategy | null {
        return this.#sortStrategy;
    }

    /** 获取排序 UI 管理器 */
    get sortUIManager(): SortUIManager | null {
        return this.#sortUIManager;
    }

    /**
     * 获取可排序列配置
     *
     * @returns 可排序列索引数组，null 表示不允许任何列排序
     */
    get sortableColumns(): number[] | null {
        if (this.#sortableColumns === null) {
            return null;
        }
        return [...this.#sortableColumns];
    }

    /**
     * 设置可排序列配置
     *
     * @param columns - 可排序列索引数组，null 或空数组表示不允许任何列排序
     */
    set sortableColumns(columns: number[] | null) {
        this.#parseSortableColumns(columns);
        if (this.#sortUIManager) {
            this.#sortUIManager.setShowSortableIndicators(this.#sortableColumns !== null && this.#sortableColumns.size > 0, this.#sortableColumns);
            this.#sortUIManager.updateIndicators();
        }
    }
}
