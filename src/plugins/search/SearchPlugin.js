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
 */
import { BasePlugin } from "../BasePlugin.js";
import { SearchState } from "./SearchState.js";
import { SearchEngine } from "./SearchEngine.js";
import { SearchUIController } from "./SearchUIController.js";
import { SearchNavigator } from "./SearchNavigator.js";
import { SearchResultHighlighter } from "./SearchResultHighlighter.js";
import { SearchStrategy } from "./SearchStrategy.js";
import { HOOKS } from "../../constants/hookNames.js";
import { Cell } from "../../model/store/Cell.js";
import { SetCellCommand } from "../../model/command/SetCellCommand.js";
import { BatchCommand } from "../../model/command/BatchCommand.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

/**
 * @typedef {Object} SearchResult
 * @property {number} row - 行号
 * @property {number} col - 列号
 * @property {string} data - 单元格原始值
 * @property {number} matchIndex - 匹配起始位置
 * @property {number} matchLength - 匹配长度
 */

/**
 * @typedef {Object} SearchOptions
 * @property {boolean} [caseSensitive=false] - 是否区分大小写
 * @property {boolean} [wholeWord=false] - 是否全字匹配
 * @property {boolean} [useRegex=false] - 是否使用正则表达式
 * @property {string} [searchScope="all"] - 搜索范围: "all" | "selection" | "column" | "row"
 */

export class SearchPlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "search";
    }

    /**
     * 默认配置项
     * @type {Object}
     */
    static DEFAULT_OPTIONS = {
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
    };

    /** @type {SearchState} */
    #state = null;

    /** @type {SearchEngine} */
    #engine = null;

    /** @type {SearchUIController} */
    #uiController = null;

    /** @type {SearchNavigator} */
    #navigator = null;

    /** @type {SearchResultHighlighter} */
    #highlighter = null;

    /** @type {SearchStrategy} */
    #strategy = null; // ✅ 新增：搜索策略实例

    /** @type {boolean} */
    #active = false; // 插件激活状态

    constructor(workbook) {
        super(workbook);
    }

    /**
     * 插件是否处于活跃状态（已启用且正在使用）
     * @returns {boolean}
     */
    get active() {
        return this.#active;
    }

    init(options = {}) {
        super.init({ ...SearchPlugin.DEFAULT_OPTIONS, ...options });
        this.#state = new SearchState();
        this.#engine = new SearchEngine();
        this.#uiController = new SearchUIController(this);
        const renderEngine = this.workbook.renderEngine || null;
        this.#navigator = new SearchNavigator(this.#state, this.workbook.activeSheet?.selection || null, renderEngine);
        this.#highlighter = new SearchResultHighlighter(renderEngine, this.options.highlightStyle);

        // ✅ 注册搜索高亮器到 RenderEngine（使其参与渲染循环）
        if (renderEngine?.setSearchHighlighter) {
            renderEngine.setSearchHighlighter(this.#highlighter);
        }
        this.#registerSearchStrategy();
        if (this.options.enabled) {
            this.enable();
        }
    }

    /**
     * 注册搜索策略（处理键盘快捷键）
     * @private
     */
    #registerSearchStrategy() {
        if (!this.eventHandler) return;

        this.#strategy = new SearchStrategy(this.eventHandler, this);
        this.addStrategy("searchShortcut", this.#strategy);
    }

    // ─── 公共 API ──────────────────────────────

    /**
     * 执行搜索查询
     *
     * @param {string} queryStr - 搜索关键词或正则表达式
     * @param {SearchOptions} [searchOptions={}] - 搜索选项覆盖
     * @returns {Promise<SearchResult[]>} 搜索结果数组
     *
     * @example
     * const results = await searchPlugin.query("hello");
     * console.log(`找到 ${results.length} 个匹配`);
     */
    async query(queryStr, searchOptions = {}) {
        const options = { ...this.options.defaultOptions, ...searchOptions };

        this.#state.setQuery(queryStr, options);
        this.#state.setSearching(true);
        this.#uiController.updateUI(this.#state);

        // 触发 beforeSearch 钩子（可取消，同步调用）
        const canProceed = this.hooks.runHooksUntil(HOOKS.BEFORE_SEARCH, {
            query: queryStr,
            options: options,
        });

        if (canProceed === false) {
            this.#state.setSearching(false);
            return [];
        }

        try {
            // ✅ 新增：空查询字符串快速返回
            if (!queryStr || queryStr.trim().length === 0) {
                this.#state.setResults([]);
                return [];
            }

            const cellData = this.#getCellData(options.searchScope);

            if (cellData.length === 0) {
                errorHandler.warn(ERROR_CODE.SEARCH_EMPTY_RANGE, "搜索范围为空或无数据");
                this.#uiController.showWarning("搜索范围内无可用数据");
                return [];
            }

            const results = await this.#engine.executeQuery(cellData, queryStr, options);

            this.#state.setResults(results.slice(0, this.options.maxResults));
            this.#highlighter.updateHighlights(this.#state.getResults());

            // ✅ 动态更新依赖（确保 goToFirst 能正确同步选区）
            this.#updateNavigatorDependencies();
            this.#navigator.goToFirst();

            // 触发 afterSearch 钩子（同步调用）
            this.hooks.runHooks(HOOKS.AFTER_SEARCH, {
                query: queryStr,
                count: results.length,
                results: results,
            });

            return results;
        } catch (error) {
            errorHandler.handle(ERROR_CODE.SEARCH_EXECUTION_ERROR, "搜索出错", { originalError: error });
            this.#state.setError(error);

            let userMessage = "搜索过程中发生未知错误";

            if (error instanceof SyntaxError && options.useRegex) {
                userMessage = `正则表达式语法错误: ${error.message}`;
                errorHandler.warn(ERROR_CODE.SEARCH_INVALID_REGEX, `无效的正则表达式: "${queryStr}"`);
            } else if (error instanceof RangeError) {
                userMessage = "正则表达式过于复杂或递归深度超限";
            } else if (error.message?.includes("memory") || error.message?.includes("stack")) {
                userMessage = "内存不足，请缩小搜索范围";
            }

            // ✅ 向 UI 显示错误信息
            if (this.#uiController?.showError) {
                this.#uiController.showError(userMessage);
            }

            return [];
        } finally {
            this.#state.setSearching(false);
            this.#uiController.updateUI(this.#state);
        }
    }

    /**
     * 导航到下一个搜索结果
     * 快捷键：F3 或 Enter
     *
     * @returns {Promise<SearchResult|null>}
     */
    async findNext() {
        // ✅ 动态更新 SelectionManager（解决初始化时 selection 为 null 的问题）
        this.#updateNavigatorDependencies();

        // 触发 beforeNavigate 钩子（可取消，同步调用）
        const canProceed = this.hooks.runHooksUntil(HOOKS.BEFORE_SEARCH_NAVIGATE, {
            direction: "next",
            currentIndex: this.#state.getCurrentIndex(),
        });

        if (canProceed === false) return null;

        const result = this.#navigator.goToNext();

        if (result) {
            this.#updateCurrentHighlight(result);

            // 触发 afterNavigate 钩子（同步调用）
            this.hooks.runHooks(HOOKS.AFTER_SEARCH_NAVIGATE, {
                direction: "next",
                result: result,
            });
        }

        this.#uiController.updateUI(this.#state);
        return result;
    }

    /**
     * 导航到上一个搜索结果
     * 快捷键：Shift+F3 或 Shift+Enter
     *
     * @returns {Promise<SearchResult|null>}
     */
    async findPrevious() {
        // ✅ 动态更新 SelectionManager（解决初始化时 selection 为 null 的问题）
        this.#updateNavigatorDependencies();

        // 触发 beforeNavigate 钩子（可取消，同步调用）
        const canProceed = this.hooks.runHooksUntil(HOOKS.BEFORE_SEARCH_NAVIGATE, {
            direction: "prev",
            currentIndex: this.#state.getCurrentIndex(),
        });

        if (canProceed === false) return null;

        const result = this.#navigator.goToPrevious();

        if (result) {
            this.#updateCurrentHighlight(result);

            // 触发 afterNavigate 钩子（同步调用）
            this.hooks.runHooks(HOOKS.AFTER_SEARCH_NAVIGATE, {
                direction: "prev",
                result: result,
            });
        }

        this.#uiController.updateUI(this.#state);
        return result;
    }

    /**
     * 替换当前选中结果（支持 Ctrl+Z 撤销！）
     *
     * 使用 SetCellCommand 记录旧值/新值，推入 HistoryStack，
     * 用户按 Ctrl+Z 可恢复原始数据。
     *
     * @param {string} replaceStr - 替换文本
     * @returns {Promise<boolean>} 是否成功替换
     */
    async replace(replaceStr) {
        const current = this.#state.getCurrentResult();
        if (!current) return false;

        const sheet = this.sheet;
        if (!sheet) return false;

        // 触发 beforeReplace 钩子（可取消，同步调用）
        const canReplace = this.hooks.runHooksUntil(HOOKS.BEFORE_SEARCH_REPLACE, {
            row: current.row,
            col: current.col,
            oldValue: current.data,
            newValue: replaceStr,
        });

        if (canReplace === false) return false;

        try {
            // ✅ 获取旧值快照（使用 cellDataAccessor 统一访问接口）
            const oldCell = sheet.cellDataAccessor.get(current.row, current.col);

            // ✅ 创建新 Cell 对象
            const newCell = new Cell(
                replaceStr,
                oldCell?.styleId || 0,
                oldCell?.disabled || false,
                null, // 替换操作清除公式
            );

            // ✅ 创建 SetCellCommand（记录完整状态用于撤销，使用 sheet 的 cellStore 属性）
            const cmd = new SetCellCommand(sheet.cellStore, current.row, current.col, oldCell, newCell);

            // ✅ 推入历史栈（关键步骤！支持 Ctrl+Z）
            if (sheet.batchOp && sheet.history) {
                sheet.batchOp.pushCommand(cmd, sheet.history);
            }

            // ✅ 执行实际赋值（使用 setCell 统一接口，支持事件、公式、缓存失效等）
            if (sheet.setCell) {
                sheet.setCell(current.row, current.col, replaceStr);
            }

            // 更新当前结果的数据引用
            current.data = replaceStr;

            // 触发 afterReplace 钩子（同步调用）
            this.hooks.runHooks(HOOKS.AFTER_SEARCH_REPLACE, {
                row: current.row,
                col: current.col,
                oldValue: current.data,
                newValue: replaceStr,
            });

            return true;
        } catch (error) {
            errorHandler.handle(ERROR_CODE.SEARCH_REPLACE_ERROR, "替换失败", { originalError: error });
            return false;
        }
    }

    /**
     * 替换所有匹配结果（支持一键 Ctrl+Z 撤销全部！）
     *
     * 使用 BatchCommand 将 N 个 SetCellCommand 组合为原子操作，
     * 整批推入 historyStack，仅占 1 个 undo 栈位置。
     * 撤销时逆序执行所有子命令的 undo()，确保状态一致性。
     *
     * @param {string} replaceStr - 替换文本
     * @returns {Promise<number>} 替换的数量
     */
    async replaceAll(replaceStr) {
        const results = this.#state.getResults();
        if (results.length === 0) return 0;

        const sheet = this.sheet;
        if (!sheet) return 0;

        // 触发 beforeReplaceAll 钩子（可取消，同步调用）
        const canReplaceAll = this.hooks.runHooksUntil(HOOKS.BEFORE_SEARCH_REPLACE_ALL, { count: results.length, replaceValue: replaceStr });

        if (canReplaceAll === false) return 0;

        try {
            // ✅ 收集所有替换命令（跳过不可编辑的单元格）
            const commands = [];
            let skippedCount = 0;

            for (const result of results) {
                // ✅ 新增：跳过只读单元格（使用统一接口 isDisabled）
                if (sheet.isDisabled?.(result.row, result.col)) {
                    skippedCount++;
                    continue;
                }

                // ✅ 跳过合并单元格的非主单元格（使用 isTopLeft 判断是否为左上角）
                if (sheet.mergeManager && !sheet.mergeManager.isTopLeft?.(result.row, result.col)) {
                    skippedCount++;
                    continue;
                }

                // ✅ 获取旧值快照（使用 cellDataAccessor 统一接口）
                const oldCell = sheet.cellDataAccessor.get(result.row, result.col);

                const newCell = new Cell(replaceStr, oldCell?.styleId || 0, oldCell?.disabled || false, null);

                commands.push(new SetCellCommand(sheet.cellStore, result.row, result.col, oldCell, newCell));
            }

            // ✅ 创建 BatchCommand（原子批量操作）
            const batchCmd = new BatchCommand(commands);

            // ✅ 整批推入历史栈（仅占 1 个位置！）
            if (sheet.batchOp && sheet.history) {
                sheet.batchOp.pushCommand(batchCmd, sheet.history);
            }

            // ✅ 执行所有替换（正序 redo）
            batchCmd.redo();

            // 更新所有结果的数据引用
            for (const result of results) {
                result.data = replaceStr;
            }

            // 触发 afterReplaceAll 钩子（同步调用）
            this.hooks.runHooks(HOOKS.AFTER_SEARCH_REPLACE_ALL, {
                count: commands.length,
                skipped: skippedCount,
                replaceValue: replaceStr,
                details: results.map((r) => ({
                    row: r.row,
                    col: r.col,
                    oldValue: r.data,
                    newValue: replaceStr,
                })),
            });

            // 记录跳过的单元格数量
            if (skippedCount > 0) {
                errorHandler.warn(ERROR_CODE.SEARCH_CELLS_SKIPPED, `已跳过 ${skippedCount} 个不可编辑单元格（只读/合并/数据冲突）`);
            }

            return commands.length;
        } catch (error) {
            errorHandler.handle(ERROR_CODE.SEARCH_REPLACE_ALL_ERROR, "全部替换失败", { originalError: error });
            return 0;
        }
    }

    /**
     * 显示搜索 UI
     */
    show() {
        this.#uiController.show();

        // ✅ 重新注册高亮器到 RenderEngine（确保渲染循环能绘制高亮）
        if (this.workbook?.renderEngine?.setSearchHighlighter && this.#highlighter) {
            this.workbook.renderEngine.setSearchHighlighter(this.#highlighter);
        }
    }

    /**
     * 隐藏搜索 UI 并清除高亮
     */
    hide() {
        this.#uiController.hide();
        this.#clearHighlight();
        this.#state.clear();

        // ✅ 从 RenderEngine 注销高亮器（停止渲染高亮）
        if (this.workbook?.renderEngine?.setSearchHighlighter) {
            this.workbook.renderEngine.setSearchHighlighter(null);
        }
    }

    /**
     * 获取当前搜索状态（只读）
     *
     * @returns {Readonly<SearchState>}
     */
    getState() {
        return this.#state;
    }

    // ═══════════════════════════════════════════════════════════════
    // 启用 / 禁用 / 销毁（遵循 SortPlugin 模式）
    // ═══════════════════════════════════════════════════════════════

    /**
     * 启用插件
     *
     * 恢复激活状态并启用搜索策略。
     * 启用后用户可以使用 Ctrl+F、F3 等快捷键进行搜索。
     *
     * @override
     */
    enable() {
        super.enable(); // 基类设置 #enabled = true
        this.#active = true;

        // ✅ 启用搜索策略（允许响应键盘快捷键）
        if (this.#strategy) {
            this.#strategy.enable();
        }
    }

    /**
     * 禁用插件
     *
     * 关闭搜索面板、清除高亮、禁用策略。
     * 禁用后所有搜索功能不可用（快捷键无响应）。
     *
     * @override
     */
    disable() {
        super.disable(); // 基类设置 #enabled = false
        this.#active = false;

        // ✅ 关闭搜索面板（如果正在显示）
        this.hide();

        // ✅ 清除所有高亮标记
        if (this.#highlighter) {
            this.#highlighter.clearHighlights();
        }

        // ✅ 禁用搜索策略（不再响应键盘事件）
        if (this.#strategy) {
            this.#strategy.disable();
        }

        // ✅ 失效渲染引擎（清除残留的高亮绘制）
        this.renderEngine?.invalidateAll?.();
    }

    /**
     * 销毁插件
     *
     * 先禁用（关闭面板、清除高亮、禁用策略），
     * 再调用父类销毁，父类会自动清理所有注册的策略、钩子和事件监听。
     */
    destroy() {
        this.hide(); // hide() 已包含注销高亮器的逻辑

        // 清理插件特有的引用（策略对象）
        this.#strategy = null;

        // ✅ 确保从 RenderEngine 清除高亮器引用（双重保险）
        if (this.workbook?.renderEngine?.setSearchHighlighter) {
            this.workbook.renderEngine.setSearchHighlighter(null);
        }

        super.destroy();
    }

    /**
     * 获取上一次的搜索查询（供 SearchStrategy 使用）
     *
     * @returns {string|null} 上次的搜索关键词，如果没有则返回 null
     */
    getLastQuery() {
        return this.#state?.getQuery?.() || null;
    }

    /**
     * 获取 UI 控制器实例（用于外部访问面板组件）
     *
     * @public
     * @returns {SearchUIController}
     */
    get uiController() {
        return this.#uiController;
    }

    /**
     * 获取需要搜索的单元格数据
     *
     * @private
     * @param {string} scope - 搜索范围
     * @returns {Array<{row: number, col: number, value: string}>}
     */
    #getCellData(scope) {
        const sheet = this.sheet;
        if (!sheet) return [];

        const accessor = sheet.cellDataAccessor;
        if (!accessor) return [];

        const data = [];

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
     * 动态更新 SearchNavigator 的依赖项
     *
     * 解决问题：
     * - 插件初始化时 activeSheet 可能未就绪，导致 selectionManager 为 null
     * - 工作表切换后，旧的 selectionManager 引用失效
     * - 每次导航前重新获取最新的依赖，确保功能正常
     *
     * 更新时机：
     * - findNext() 调用前
     * - findPrevious() 调用前
     * - query() 首次搜索后（goToFirst）
     *
     * @private
     * @returns {void}
     */
    #updateNavigatorDependencies() {
        if (!this.#navigator) return;

        const currentSelection = this.workbook?.activeSheet?.selection || null;
        const currentRenderEngine = this.workbook?.renderEngine || null;

        this.#navigator.updateDependencies(currentSelection, currentRenderEngine);
    }

    /**
     * 更新当前高亮位置
     *
     * @private
     * @param {SearchResult} result - 当前结果
     */
    #updateCurrentHighlight(result) {
        if (result) {
            this.#highlighter.setCurrentHighlight(result.row, result.col);
        }
    }

    /**
     * 清除所有高亮
     *
     * @private
     */
    #clearHighlight() {
        this.#highlighter.clearHighlights();
    }
}
