import { BasePlugin } from "../BasePlugin.js";
import { SearchState } from "./SearchState.js";
import type { SearchResult, SearchOptions } from "./SearchState.js";
import { SearchEngine } from "./SearchEngine.js";
import { SearchUIManager } from "./SearchUIManager.js";
import { SearchNavigator } from "./SearchNavigator.js";
import { SearchResultHighlighter } from "./SearchResultHighlighter.js";
import { SearchStrategy } from "./SearchStrategy.js";
import { HOOKS } from "../../constants/hookNames.js";
import { Cell } from "../../model/store/Cell.js";
import { SetCellCommand } from "../../model/command/SetCellCommand.js";
import { BatchCommand } from "../../model/command/BatchCommand.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

/** 高亮样式配置 */
interface HighlightStyle {
    backgroundColor: string;
    currentBackgroundColor: string;
    borderColor: string;
    borderWidth: number;
}

/** 默认搜索选项 */
interface DefaultSearchOptions {
    caseSensitive: boolean;
    wholeWord: boolean;
    useRegex: boolean;
    searchScope: string;
}

/** 插件配置选项 */
interface SearchPluginOptions {
    enabled: boolean;
    shortcutKey: string;
    findNextKey: string;
    findPrevKey: string;
    maxResults: number;
    highlightStyle: HighlightStyle;
    defaultOptions: DefaultSearchOptions;
    draggable: boolean;
    mask: boolean;
    closeOnClickOutside: boolean;
    closeOnEscape: boolean;
    skipNonTopLeftMergedCells: boolean;
}

/**
 * 搜索插件
 *
 * 提供类似 Excel/Ctrl+F 的全局搜索功能：
 * - 文本搜索 / 正则表达式搜索
 * - 大小写敏感 / 全词匹配选项
 * - 结果高亮显示（Canvas 渲染）
 * - 键盘导航（F3/Shift+F3）
 * - 搜索替换功能（支持 Ctrl+Z 撤销！）
 *
 * 策略优先级：POPUP_UI (500)
 * - 弹出式 UI 组件，与 Filter 下拉同级
 * - 高于鼠标默认行为 (300)，确保面板交互优先
 * - 低于拖拽操作 (600+)，不干扰核心功能
 *
 * @extends BasePlugin
 * @module plugins/search/SearchPlugin
 */
export class SearchPlugin extends BasePlugin {
    /** @static 静态公共方法 - 获取插件唯一标识名称 */
    static get PLUGIN_NAME(): string {
        return "search";
    }

    /** @static 静态公共字段 - 默认配置项 */
    static DEFAULT_OPTIONS: SearchPluginOptions = {
        enabled: true,
        shortcutKey: "Control+f",
        findNextKey: "F3",
        findPrevKey: "Shift+F3",
        maxResults: 10000,
        highlightStyle: {
            backgroundColor: "rgba(255, 255, 0, 0.3)",
            currentBackgroundColor: "rgba(255, 165, 0, 0.5)",
            borderColor: "#ff9800",
            borderWidth: 2,
        },
        defaultOptions: {
            caseSensitive: false,
            wholeWord: false,
            useRegex: false,
            searchScope: "all",
        },
        draggable: true,
        mask: false,
        closeOnClickOutside: true,
        closeOnEscape: true,
        skipNonTopLeftMergedCells: false,
    };

    /** @private 私有字段 - 搜索状态管理器 */
    #state: SearchState | null = null;

    /** @private 私有字段 - 搜索引擎实例 */
    #engine: SearchEngine | null = null;

    /** @private 私有字段 - 搜索 UI 控制器 */
    #uiController: SearchUIManager | null = null;

    /** @private 私有字段 - 搜索结果导航器 */
    #navigator: SearchNavigator | null = null;

    /** @private 私有字段 - 搜索结果高亮渲染器 */
    #highlighter: SearchResultHighlighter | null = null;

    /** @private 私有字段 - 搜索策略实例（处理键盘快捷键） */
    #strategy: SearchStrategy | null = null;

    /** @private 私有字段 - 插件激活状态标志 */
    #active: boolean = false;

    constructor(workbook: any) {
        super(workbook);
    }

    /** 插件是否处于活跃状态（已启用且正在使用） */
    get active(): boolean {
        return this.#active;
    }

    init(options: Partial<SearchPluginOptions> = {}): void {
        super.init({ ...SearchPlugin.DEFAULT_OPTIONS, ...options });
        this.#state = new SearchState();
        this.#engine = new SearchEngine();
        this.#uiController = new SearchUIManager(this as any);
        const renderEngine = (this as any).workbook.renderEngine || null;
        this.#navigator = new SearchNavigator(this.#state, (this as any).workbook.activeSheet?.selection || null, renderEngine);
        this.#highlighter = new SearchResultHighlighter(renderEngine, (this as any).options.highlightStyle);

        if (renderEngine?.setSearchHighlighter) {
            renderEngine.setSearchHighlighter(this.#highlighter);
        }
        this.#registerSearchStrategy();
        if ((this as any).options.enabled) {
            this.enable();
        }
    }

    /**
     * @private 私有方法 - 注册搜索策略（处理键盘快捷键）
     */
    #registerSearchStrategy(): void {
        if (!(this as any).eventHandler) return;

        this.#strategy = new SearchStrategy((this as any).eventHandler, this as any);
        (this as any).addStrategy("searchShortcut", this.#strategy);
    }

    /**
     * 执行搜索查询
     *
     * @param queryStr - 搜索关键词或正则表达式
     * @param searchOptions - 搜索选项覆盖
     * @returns 搜索结果数组
     */
    async query(queryStr: string, searchOptions: SearchOptions = {}): Promise<SearchResult[]> {
        const options = { ...(this as any).options.defaultOptions, ...searchOptions };

        this.#state!.setQuery(queryStr, options);
        this.#state!.setSearching(true);
        this.#uiController!.updateUI(this.#state!);

        const canProceed = (this as any).hooks.runHooksUntil(HOOKS.BEFORE_SEARCH, {
            query: queryStr,
            options: options,
        });

        if (canProceed === false) {
            this.#state!.setSearching(false);
            return [];
        }

        try {
            if (!queryStr || queryStr.trim().length === 0) {
                this.#state!.setResults([]);
                return [];
            }

            const cellData = this.#getCellData(options.searchScope);

            if (cellData.length === 0) {
                errorHandler.warn(ERROR_CODE.SEARCH_EMPTY_RANGE, "搜索范围为空或无数据");
                this.#uiController!.showWarning("搜索范围内无可用数据");
                return [];
            }

            const results = await this.#engine!.executeQuery(cellData, queryStr, options);

            this.#state!.setResults(results.slice(0, (this as any).options.maxResults));

            if ((this as any).workbook?.renderEngine?.setSearchHighlighter && this.#highlighter) {
                (this as any).workbook.renderEngine.setSearchHighlighter(this.#highlighter);
            }

            this.#highlighter!.updateHighlights(this.#state!.getResults());

            this.#updateNavigatorDependencies();
            this.#navigator!.goToFirst();

            (this as any).hooks.runHooks(HOOKS.AFTER_SEARCH, {
                query: queryStr,
                count: results.length,
                results: results,
            });

            return results;
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.SEARCH_EXECUTION_ERROR, "搜索出错", { originalError: error });
            this.#state!.setError(error);

            let userMessage = "搜索过程中发生未知错误";

            if (error instanceof SyntaxError && options.useRegex) {
                userMessage = `正则表达式语法错误: ${error.message}`;
                errorHandler.warn(ERROR_CODE.SEARCH_INVALID_REGEX, `无效的正则表达式: "${queryStr}"`);
            } else if (error instanceof RangeError) {
                userMessage = "正则表达式过于复杂或递归深度超限";
            } else if (error.message?.includes("memory") || error.message?.includes("stack")) {
                userMessage = "内存不足，请缩小搜索范围";
            }

            if (this.#uiController?.showError) {
                this.#uiController.showError(userMessage);
            }

            return [];
        } finally {
            this.#state!.setSearching(false);
            this.#uiController!.updateUI(this.#state!);
        }
    }

    /**
     * 导航到下一个搜索结果
     */
    findNext(): SearchResult | null {
        this.#updateNavigatorDependencies();

        const canProceed = (this as any).hooks.runHooksUntil(HOOKS.BEFORE_SEARCH_NAVIGATE, {
            direction: "next",
            currentIndex: this.#state!.getCurrentIndex(),
        });

        if (canProceed === false) return null;

        const result = this.#navigator!.goToNext();

        if (result) {
            this.#updateCurrentHighlight(result);

            (this as any).hooks.runHooks(HOOKS.AFTER_SEARCH_NAVIGATE, {
                direction: "next",
                result: result,
            });
        }

        this.#uiController!.updateUI(this.#state!);
        return result;
    }

    /**
     * 导航到上一个搜索结果
     */
    findPrevious(): SearchResult | null {
        this.#updateNavigatorDependencies();

        const canProceed = (this as any).hooks.runHooksUntil(HOOKS.BEFORE_SEARCH_NAVIGATE, {
            direction: "prev",
            currentIndex: this.#state!.getCurrentIndex(),
        });

        if (canProceed === false) return null;

        const result = this.#navigator!.goToPrevious();

        if (result) {
            this.#updateCurrentHighlight(result);

            (this as any).hooks.runHooks(HOOKS.AFTER_SEARCH_NAVIGATE, {
                direction: "prev",
                result: result,
            });
        }

        this.#uiController!.updateUI(this.#state!);
        return result;
    }

    /**
     * 替换当前选中结果（支持 Ctrl+Z 撤销！）
     *
     * @param replaceStr - 替换文本
     * @returns 是否成功替换
     */
    replace(replaceStr: string): boolean {
        const current = this.#state!.getCurrentResult();
        if (!current) return false;

        const sheet = (this as any).sheet;
        if (!sheet) return false;

        const canReplace = (this as any).hooks.runHooksUntil(HOOKS.BEFORE_SEARCH_REPLACE, {
            row: current.row,
            col: current.col,
            oldValue: current.data,
            newValue: replaceStr,
        });

        if (canReplace === false) return false;

        try {
            const oldCell = sheet.cellDataAccessor.get(current.row, current.col);

            const newCell = new Cell(replaceStr, oldCell?.styleId || 0, oldCell?.disabled || false, null);

            const cmd = new SetCellCommand(sheet.cellStore, current.row, current.col, oldCell, newCell);

            if (sheet.batchOp && sheet.history) {
                sheet.batchOp.pushCommand(cmd, sheet.history);
            }

            if (sheet.setCell) {
                sheet.setCell(current.row, current.col, replaceStr);
            }

            current.data = replaceStr;

            (this as any).hooks.runHooks(HOOKS.AFTER_SEARCH_REPLACE, {
                row: current.row,
                col: current.col,
                oldValue: current.data,
                newValue: replaceStr,
            });

            return true;
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_REPLACE_ERROR, "替换失败", { originalError: error });
            return false;
        }
    }

    /**
     * 替换所有匹配结果（支持一键 Ctrl+Z 撤销全部！）
     *
     * @param replaceStr - 替换文本
     * @returns 替换的数量
     */
    replaceAll(replaceStr: string): number {
        const results = this.#state!.getResults();
        if (results.length === 0) {
            errorHandler.warn(ERROR_CODE.SEARCH_NO_RESULTS, "没有可替换的搜索结果，请先执行查找操作");
            return 0;
        }

        const sheet = (this as any).sheet;
        if (!sheet) {
            return 0;
        }

        const canReplaceAll = (this as any).hooks.runHooksUntil(HOOKS.BEFORE_SEARCH_REPLACE_ALL, {
            count: results.length,
            replaceValue: replaceStr,
        });

        if (canReplaceAll === false) {
            return 0;
        }

        try {
            const commands: any[] = [];
            let skippedCount = 0;
            const skippedDetails = { readonly: 0, merged: 0 };

            for (const result of results) {
                if (sheet.isDisabled?.(result.row, result.col)) {
                    skippedCount++;
                    skippedDetails.readonly++;
                    continue;
                }

                const skipMergedCells = (this as any).options.skipNonTopLeftMergedCells;
                if (skipMergedCells && sheet.mergeManager && typeof sheet.mergeManager.isTopLeft === "function") {
                    const isTopLeft = sheet.mergeManager.isTopLeft(result.row, result.col);

                    if (isTopLeft === false) {
                        skippedCount++;
                        skippedDetails.merged++;
                        continue;
                    }
                }

                const oldCell = sheet.cellDataAccessor.get(result.row, result.col);
                const newCell = new Cell(replaceStr, oldCell?.styleId || 0, oldCell?.disabled || false, null);
                commands.push(new SetCellCommand(sheet.cellStore, result.row, result.col, oldCell, newCell));
            }

            const batchCmd = new BatchCommand(commands);

            if (sheet.batchOp && sheet.history) {
                sheet.batchOp.pushCommand(batchCmd, sheet.history);
            }

            batchCmd.redo();

            const renderEngine = (this as any).workbook?.renderEngine;
            if (renderEngine) {
                renderEngine.invalidateAll();
            }

            if (this.#highlighter) {
                this.#highlighter.updateHighlights([]);
            }

            if (this.#uiController) {
                this.#state!.clear();
                this.#uiController.updateUI(this.#state!);
            }

            for (const result of results) {
                result.data = replaceStr;
            }

            (this as any).hooks.runHooks(HOOKS.AFTER_SEARCH_REPLACE_ALL, {
                count: commands.length,
                skipped: skippedCount,
                replaceValue: replaceStr,
                details: results.map((r: SearchResult) => ({
                    row: r.row,
                    col: r.col,
                    oldValue: r.data,
                    newValue: replaceStr,
                })),
            });
            return commands.length;
        } catch (error) {
            errorHandler.error(ERROR_CODE.SEARCH_REPLACE_ALL_ERROR, "全部替换失败", { originalError: error });
            return 0;
        }
    }

    /** 显示搜索 UI */
    show(): void {
        this.#uiController!.show();

        if ((this as any).workbook?.renderEngine?.setSearchHighlighter && this.#highlighter) {
            (this as any).workbook.renderEngine.setSearchHighlighter(this.#highlighter);
        }
    }

    /** 隐藏搜索 UI 并清除高亮 */
    hide(): void {
        this.#uiController!.hide();
        this.#clearHighlight();
        this.#state!.clear();

        if ((this as any).workbook?.renderEngine?.setSearchHighlighter) {
            (this as any).workbook.renderEngine.setSearchHighlighter(null);
        }
    }

    /** 获取当前搜索状态（只读） */
    getState(): SearchState {
        return this.#state!;
    }

    /** @override 启用插件 */
    enable(): void {
        super.enable();
        this.#active = true;

        if (this.#strategy) {
            this.#strategy.enable();
        }
    }

    /** @override 禁用插件 */
    disable(): void {
        super.disable();
        this.#active = false;

        this.hide();

        if (this.#highlighter) {
            this.#highlighter.clearHighlights();
        }

        if (this.#strategy) {
            this.#strategy.disable();
        }

        (this as any).renderEngine?.invalidateAll?.();
    }

    /** 销毁插件 */
    destroy(): void {
        this.hide();

        this.#strategy = null;

        if ((this as any).workbook?.renderEngine?.setSearchHighlighter) {
            (this as any).workbook.renderEngine.setSearchHighlighter(null);
        }

        super.destroy();
    }

    /**
     * 获取上一次的搜索查询
     */
    getLastQuery(): string | null {
        return this.#state?.getQuery?.() || null;
    }

    /** 获取 UI 控制器实例 */
    get uiController(): SearchUIManager | null {
        return this.#uiController;
    }

    /**
     * @private 私有方法 - 获取需要搜索的单元格数据
     *
     * @param scope - 搜索范围
     */
    #getCellData(scope: string): { row: number; col: number; value: string }[] {
        const sheet = (this as any).sheet;
        if (!sheet) return [];

        const accessor = sheet.cellDataAccessor;
        if (!accessor) return [];

        const data: { row: number; col: number; value: string }[] = [];

        switch (scope) {
            case "selection": {
                const selection = sheet.selection;
                if (!selection) break;

                const range = selection.getRange();
                if (!range) break;

                const nonEmptyCells = accessor.getNonEmptyCells(range.topRow, range.topCol, range.bottomRow, range.bottomCol);

                for (const { row, col, cell } of nonEmptyCells) {
                    data.push({ row, col, value: String(cell.value) });
                }
                break;
            }

            default: {
                const rc = sheet.rowColManager;
                if (!rc) break;

                const totalRows = rc.rowCount;
                const totalCols = rc.colCount;

                if (totalRows > 0 && totalCols > 0) {
                    const nonEmptyCells = accessor.getNonEmptyCells(0, 0, totalRows - 1, totalCols - 1);

                    for (const { row, col, cell } of nonEmptyCells) {
                        data.push({ row, col, value: String(cell.value) });
                    }
                }
            }
        }

        return data;
    }

    /**
     * @private 私有方法 - 动态更新 SearchNavigator 的依赖项
     */
    #updateNavigatorDependencies(): void {
        if (!this.#navigator) return;

        const currentSelection = (this as any).workbook?.activeSheet?.selection || null;
        const currentRenderEngine = (this as any).workbook?.renderEngine || null;

        this.#navigator.updateDependencies(currentSelection, currentRenderEngine);
    }

    /**
     * @private 私有方法 - 更新当前高亮位置
     */
    #updateCurrentHighlight(result: SearchResult): void {
        if (result) {
            this.#highlighter!.setCurrentHighlight(result.row, result.col);
        }
    }

    /**
     * @private 私有方法 - 清除所有搜索高亮
     */
    #clearHighlight(): void {
        this.#highlighter!.clearHighlights();
    }
}
