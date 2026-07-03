import { Sheet } from "./Sheet.js";
import { RenderEngine } from "@/render/RenderEngine";
import { EditorManager } from "@/editor/EditorManager";
import { EventHandler } from "@/core/EventHandler";
import { isFunction, isObject } from "@/utils/utils";
import { PluginManager } from "@/plugins";
import { CONFIG } from "@/constants/config";
import { SettingsApplier } from "./managers/SettingsApplier.js";
import { SHEET_EVENTS } from "@/constants/sheetEvents";
import { HOOKS } from "@/constants/hookNames";

/**
 * 工作簿
 *
 * 顶层管理对象，作为 Facade 协调 Sheet、RenderEngine、EventHandler、
 * EditorManager、PluginManager 等子系统。
 *
 * 插件系统：
 * - Workbook.registerPlugin(name, PluginClass)  — 全局注册插件类
 * - workbook.loadPlugin(name, options)           — 加载已注册的插件
 * - workbook.loadPluginClass(PluginClass, opts)  — 直接加载插件类
 * - workbook.getPlugin(name)                     — 获取插件实例
 * - workbook.unloadPlugin(name)                  — 卸载插件
 * - workbook.enablePlugin(name)                  — 启用插件
 * - workbook.disablePlugin(name)                 — 禁用插件
 *
 * 对齐 Handsontable 的 new Handsontable(container, options) 模式
 */
export class Workbook {
    /** @type {HTMLElement|string} */
    #containerElement;

    /** @type {object} */
    #initOptions;

    /** @type {Array<{type:string, name?:string, PluginClass?:Function, options:object}>} */
    #pendingPlugins = [];

    /** @type {Map<string, Function[]>} Early Hooks 缓存 */
    #earlyHooks;

    /** @type {Set<import("./Sheet.js").Sheet>} 已绑定事件的 Sheet 集合（防止 switchTo 重复绑定） */
    #boundSheets = new Set();

    /** @type {object|null} Workbook 级默认样式（所有 Sheet 的全局基础） */
    #defaultStyle = null;

    // ============================================================
    // 构造函数
    // ============================================================

    /**
     * @param {HTMLElement|string} element - 容器元素或 Canvas 元素 ID
     * @param {object} [options={}] - 配置选项
     *
     * @param {Array<Array<*>>} [options.data] - 初始数据（二维数组）
     * @param {string} [options.sheetName='Sheet1'] - 初始工作表名称
     * @param {true|string[]|Function} [options.colHeaders=true] - 列头标签
     * @param {true|string[]|Function} [options.rowHeaders=true] - 行头标签
     * @param {number} [options.width] - 画布宽
     * 度（px），默认自适应容器
     * @param {number} [options.height] - 画布高度（px），默认自适应容器
     * @param {number|number[]} [options.rowHeights] - 行高配置
     * @param {number} [options.startRows=100] - 初始行数
     * @param {number} [options.startCols=26] - 初始列数
     * @param {string[]} [options.plugins] - 要加载的插件名称列表
     * @param {object} [options.pluginOptions] - 插件选项映射 { pluginName: options }
     * @param {object} [options.hooks] - 事件钩子映射 { hookName: callback }
     * @param {Array<{row:number,col:number,rowspan:number,colspan:number}>} [options.mergeCells]
     * @param {Array<{range:object,condition:Function,style:object}>} [options.conditionalStyles]
     * @param {Array<{row:number,col:number,style?:object,disabled?:boolean,readOnly?:boolean,value?:*}>} [options.cell]
     * @param {Function} [options.cells] - 动态单元格属性函数 (row, col) => { style?, disabled?, ... }
     * @param {Array<object|Function>} [options.columns] - 列配置数组
     * @param {Function} [options.afterInit] - 初始化完成回调
     */
    constructor(element, options = {}) {
        /** @type {Map<string, Sheet>} */
        this.sheets = new Map();

        /** @type {Sheet|null} */
        this.activeSheet = null;

        /**
         * 剪贴板管理器引用
         * 由 CopyPastePlugin 在 init() 时注入，非插件模式下为 null。
         * 向后兼容：外部代码仍可通过 workbook.clipboard 访问。
         * @type {import("../editor/ClipboardManager.js").ClipboardManager|null}
         */
        this.clipboard = null;

        /** @type {RenderEngine|null} */
        this.renderEngine = null;

        /** @type {EditorManager|null} */
        this.editor = null;

        /** @type {EventHandler|null} */
        this.eventHandler = null;

        /** @type {PluginManager|null} */
        this.pluginManager = null;

        /**
         * Early Hooks 缓存（eventHandler 创建前注册的 hooks）
         * key: hookName, value: callback[]
         * @type {Map<string, Function[]>}
         */
        this.#earlyHooks = new Map();

        this.#containerElement = element || CONFIG.CANVAS_ID;
        this.#initOptions = options;

        /** @type {import("../formula/FormulaEngine.js").FormulaEngine|null} 公式引擎（由 FormulaPlugin 注入） */
        this.formulaEngine = null;

        /** @type {import("../ui/formulaBar/FormulaBarManager.js").FormulaBarManager|null} 公式栏管理器（由 FormulaPlugin 注入） */
        this.formulaBar = null;
    }

    // ============================================================
    // 静态方法：全局插件注册
    // ============================================================

    /**
     * 全局注册插件类（直接委托给 PluginManager，统一注册源）
     * @param {string} name - 插件名称
     * @param {typeof import("../plugins/BasePlugin.js").BasePlugin} PluginClass - 插件类
     */
    static registerPlugin(name, PluginClass) {
        PluginManager.register(name, PluginClass);
    }

    /**
     * 全局注销插件类
     * @param {string} name - 插件名称
     */
    static unregisterPlugin(name) {
        PluginManager.unregister(name);
    }

    // ============================================================
    // 插件委托方法
    // ============================================================

    /** @returns {?import("../plugins/BasePlugin.js").BasePlugin} */
    loadPlugin(name, options = {}) {
        if (!this.pluginManager) {
            this.#pendingPlugins.push({ type: "name", name, options });
            return null;
        }
        return this.pluginManager.loadPlugin(name, options);
    }

    /** @returns {?import("../plugins/BasePlugin.js").BasePlugin} */
    loadPluginClass(PluginClass, options = {}) {
        if (!this.pluginManager) {
            this.#pendingPlugins.push({ type: "class", PluginClass, options });
            return null;
        }
        return this.pluginManager.loadPluginClass(PluginClass, options);
    }

    unloadPlugin(name) {
        this.pluginManager?.unloadPlugin(name);
    }

    /** @returns {?import("../plugins/BasePlugin.js").BasePlugin} */
    getPlugin(name) {
        return this.pluginManager?.getPlugin(name) ?? null;
    }

    enablePlugin(name) {
        this.pluginManager?.enablePlugin(name);
    }

    disablePlugin(name) {
        this.pluginManager?.disablePlugin(name);
    }

    // ============================================================
    // 初始化
    // ============================================================

    /**
     * 初始化渲染引擎、编辑器、事件处理、插件系统。
     * 延迟初始化，在构造后显式调用。
     */
    initRender() {
        if (this.renderEngine) return;

        const opts = this.#initOptions;
        if (Array.isArray(opts?.sheets) && opts.sheets.length > 0) {
            this.#initSheetsFromConfig(opts.sheets);
        } else {
            this.#ensureDefaultSheet();
        }

        this.#createRenderEngine();
        this.#createSubSystems();
        this.#linkSheetsToRenderEngine();
        this.#flushPendingPlugins();
        this.#applyInitOptions();
        this.#setupScrollCallback();
        this.#setupSheetTabBar();

        // 通过 EventBus 发射工作簿初始化完成事件（指定 source 为 Workbook）
        // EventHandler 会订阅此事件并触发 INIT hook
        this.activeSheet?.bus?.emit(SHEET_EVENTS.WORKBOOK_INIT, [this], { source: "Workbook" });
    }

    /**
     * 从 sheets 配置数组批量创建工作表
     * @param {Array<{name?: string, [key: string]: any}>} sheetsConfig
     */
    #initSheetsFromConfig(sheetsConfig) {
        for (const config of sheetsConfig) {
            const name = config.name || this.#generateSheetName();
            this.addSheet(name);
        }
    }

    #ensureDefaultSheet() {
        if (this.sheets.size === 0) {
            this.addSheet(this.#initOptions?.sheetName || `${CONFIG.DEFAULT_SHEET_NAME}1`);
        }
    }

    #createRenderEngine() {
        this.renderEngine = new RenderEngine(this.#containerElement);
        const opts = this.#initOptions;
        if (opts?.width != null || opts?.height != null) {
            this.renderEngine.setCanvasSize(opts.width, opts.height);
        }
    }

    #createSubSystems() {
        this.editor = new EditorManager(this.renderEngine, this.activeSheet);
        this.eventHandler = new EventHandler(this.activeSheet, this.renderEngine, this.editor, null);
        this.eventHandler.setHookContext(this);
        this.editor.setViewport(this.eventHandler.viewport);
        this.editor.setCanvasContext(this.eventHandler.canvasContext);
        this.pluginManager = new PluginManager(this);

        // 应用 Early Hooks 缓存（eventHandler 创建前注册的 hooks）
        this.#flushEarlyHooks();
    }

    /**
     * 将缓存的 early hooks 应用到 eventHandler
     */
    #flushEarlyHooks() {
        if (!this.eventHandler || this.#earlyHooks.size === 0) return;

        for (const [hookName, callbacks] of this.#earlyHooks) {
            for (const callback of callbacks) {
                this.eventHandler.addHook(hookName, callback);
            }
        }

        // 清空缓存
        this.#earlyHooks.clear();
    }

    #linkSheetsToRenderEngine() {
        for (const sheet of this.sheets.values()) {
            this.#bindSheetEvents(sheet);
        }
    }

    /**
     * 将 Sheet 的事件总线桥接到各子系统
     * @param {import("./Sheet.js").Sheet} sheet
     */
    #bindSheetEvents(sheet) {
        if (this.#boundSheets.has(sheet)) return;
        this.#boundSheets.add(sheet);

        const bus = sheet.bus;

        bus.on(SHEET_EVENTS.INVALIDATE_ALL, () => {
            this.renderEngine?.invalidateAll();
        });

        bus.on(SHEET_EVENTS.INVALIDATE_CELL, (envelope) => {
            const { pageRow, c } = envelope.payload;
            this.renderEngine?.invalidateCell(pageRow, c);
        });

        bus.on(SHEET_EVENTS.RENDER_REQUEST, () => {
            this.renderEngine?.render(sheet);
        });

        bus.on(SHEET_EVENTS.FORMULA_SET, (envelope) => {
            if (this.formulaEngine) {
                const { r, c, formula } = envelope.payload;
                return this.formulaEngine.setFormula(sheet, r, c, formula);
            }
            return undefined;
        });

        bus.on(SHEET_EVENTS.FORMULA_REMOVE, (envelope) => {
            const { r, c } = envelope.payload;
            this.formulaEngine?.removeFormula(sheet, r, c);
        });

        bus.on(SHEET_EVENTS.CELL_CHANGED, (envelope) => {
            const { r, c } = envelope.payload;
            this.formulaEngine?.onCellChanged(sheet, r, c);
        });

        bus.on(SHEET_EVENTS.UNDO, () => {
            this.formulaEngine?.recalculateAll(sheet);
        });

        bus.on(SHEET_EVENTS.REDO, () => {
            this.formulaEngine?.recalculateAll(sheet);
        });

        // BEFORE_CHANGE / AFTER_CHANGE 的 Hooks 桥接由 EventHandler.#subscribeEditorEvents 统一处理，
        // 此处不再重复订阅，避免钩子被触发两次。

        bus.on(SHEET_EVENTS.PAGINATION_REFRESH, () => {
            const pg = this.getPlugin("pagination");
            if (pg?.active) pg.refresh();
        });

        bus.on(SHEET_EVENTS.ROW_COL_RESIZE, () => {
            const pg = this.getPlugin("pagination");
            if (!pg || !pg.active) return;
            sheet.rowColManager.clearPaginationBounds();
            pg.refresh();
        });

        bus.on(SHEET_EVENTS.GET_CLIPBOARD, () => {
            return this.clipboard;
        });

        bus.on(SHEET_EVENTS.GET_PLUGIN, (envelope) => {
            return this.getPlugin(envelope.payload.name);
        });
    }

    // ============================================================
    // 滚动回调：编辑器视口裁剪
    // ============================================================

    #setupScrollCallback() {
        this.renderEngine.onScrollCallback = () => {
            const activeEditor = this.editor?.getActiveEditor();
            if (!activeEditor || activeEditor.activeRow < 0) return;

            const { activeRow: row, activeCol: col } = activeEditor;
            const dpr = window.devicePixelRatio || 1;
            const tabH = CONFIG.SHEET_TAB_HEIGHT;
            const canvasW = this.renderEngine.canvas.width / dpr;
            const canvasH = this.renderEngine.canvas.height / dpr;

            const viewport = this.eventHandler?.viewport;
            const visible = viewport ? viewport.isCellVisible(row, col, canvasW, canvasH, tabH) : true;

            if (visible) {
                activeEditor.restoreFromScroll();
            } else {
                activeEditor.hideForScroll();
            }
        };
    }

    // ============================================================
    // Sheet Tab Bar 事件绑定
    // ============================================================

    #setupSheetTabBar() {
        const tabBar = this.renderEngine.sheetTabBar;
        tabBar.workbook = this;

        tabBar.onSwitch = (name) => {
            this.switchTo(name);
            tabBar.scrollToTab(name);
        };

        tabBar.onAdd = () => {
            const newName = this.#generateSheetName();

            const sheet = this.addSheet(newName);
            if (sheet) {
                this.switchTo(newName);
                tabBar.scrollToTab(newName);
            }
            tabBar.refresh();
        };

        tabBar.onRemove = (name) => {
            this.removeSheet(name);
            tabBar.refresh();
        };

        tabBar.onRename = (oldName, newName) => {
            const success = this.renameSheet(oldName, newName);
            tabBar.refresh();
            return success;
        };

        tabBar.refresh();
    }

    #generateSheetName() {
        let idx = this.sheets.size + 1;
        while (this.sheets.has(`${CONFIG.DEFAULT_SHEET_NAME}${idx}`)) idx++;
        return `${CONFIG.DEFAULT_SHEET_NAME}${idx}`;
    }

    // ============================================================
    // 初始配置应用
    // ============================================================

    #applyInitOptions() {
        console.log(123);
        const opts = this.#initOptions;
        if (!opts || Object.keys(opts).length === 0) return;

        if (Array.isArray(opts.sheets) && opts.sheets.length > 0) {
            this.#applySheetsConfig(opts);
        }

        this.#loadInitPlugins(opts);
        this.#loadInitHooks(opts);

        if (isFunction(opts.afterInit)) {
            opts.afterInit(this);
        }
    }

    /**
     * 应用 sheets 数组配置
     * 每个 sheet 配置项与顶层 opts 合并后独立应用
     * 支持 Workbook 级 defaultStyle 继承链：
     * - 顶层 defaultStyle 作为全局基础
     * - Sheet 级 defaultStyle 在其基础上深度合并覆盖
     */
    #applySheetsConfig(opts) {
        if (opts.defaultStyle) {
            this.#defaultStyle = opts.defaultStyle;
        }

        for (const sheetConfig of opts.sheets) {
            const name = sheetConfig.name || this.#generateSheetName();
            const sheet = this.sheets.get(name);
            if (!sheet) continue;

            const effectiveDefaultStyle = this.#resolveDefaultStyle(sheetConfig.defaultStyle);

            const settings = { ...opts, ...sheetConfig };
            if (effectiveDefaultStyle) {
                settings.defaultStyle = effectiveDefaultStyle;
            }
            delete settings.sheets;
            SettingsApplier.apply({ sheet, renderEngine: this.renderEngine, settings });
        }
    }

    #resolveDefaultStyle(sheetDefaultStyle) {
        if (!this.#defaultStyle && !sheetDefaultStyle) return null;
        if (!this.#defaultStyle) return sheetDefaultStyle;
        if (!sheetDefaultStyle) return this.#defaultStyle;
        return { ...this.#defaultStyle, ...sheetDefaultStyle };
    }

    #loadInitPlugins(opts) {
        if (!Array.isArray(opts.plugins)) return;
        const pluginOptions = opts.pluginOptions || {};
        for (const name of opts.plugins) {
            this.loadPlugin(name, pluginOptions[name] || {});
        }
    }

    #loadInitHooks(opts) {
        if (!opts.hooks || !isObject(opts.hooks)) return;
        for (const [hookName, callback] of Object.entries(opts.hooks)) {
            if (isFunction(callback)) {
                this.addHook(hookName, callback);
            }
        }
    }

    #flushPendingPlugins() {
        for (const pending of this.#pendingPlugins) {
            if (pending.type === "name") {
                this.pluginManager.loadPlugin(pending.name, pending.options);
            } else {
                this.pluginManager.loadPluginClass(pending.PluginClass, pending.options);
            }
        }
        this.#pendingPlugins = [];
    }

    // ============================================================
    // 工作表管理
    // ============================================================

    /**
     * 添加工作表
     * @param {string} name
     * @returns {Sheet}
     */
    addSheet(name) {
        const cancelled = this.runHooksUntil(HOOKS.BEFORE_SHEET_ADD, name);
        if (cancelled === false) return null;

        const sheet = new Sheet(name);
        if (this.renderEngine) this.#bindSheetEvents(sheet);

        const opts = this.#initOptions;

        sheet.rowColManager.ensureSize(opts?.startRows || CONFIG.DEFAULT_START_ROWS, opts?.startCols || CONFIG.DEFAULT_START_COLS);

        if (this.#defaultStyle) {
            sheet.setDefaultStyle(this.#defaultStyle);
        }

        this.sheets.set(name, sheet);
        this.#activateIfFirst(sheet);
        this.#refreshTabBar();

        this.runHooks(HOOKS.AFTER_SHEET_ADD, name, sheet);
        return sheet;
    }

    /**
     * 删除工作表（至少保留一个）
     * @param {string} name
     * @returns {boolean}
     */
    removeSheet(name) {
        if (!this.sheets.has(name) || this.sheets.size <= 1) return false;

        const cancelled = this.runHooksUntil(HOOKS.BEFORE_SHEET_REMOVE, name);
        if (cancelled === false) return false;

        const removed = this.sheets.get(name);
        this.sheets.delete(name);
        this.#boundSheets.delete(removed);

        if (this.activeSheet === removed) {
            this.switchTo(this.sheets.keys().next().value);
        }

        this.#refreshTabBar();
        this.runHooks(HOOKS.AFTER_SHEET_REMOVE, name, removed);
        return true;
    }

    /**
     * 重命名工作表
     * @param {string} oldName
     * @param {string} newName
     * @returns {boolean}
     */
    renameSheet(oldName, newName) {
        if (!this.sheets.has(oldName)) return false;
        newName = (newName || "").trim();
        if (!newName || oldName === newName || this.sheets.has(newName)) return false;

        const cancelled = this.runHooksUntil(HOOKS.BEFORE_SHEET_RENAME, oldName, newName);
        if (cancelled === false) return false;

        const sheet = this.sheets.get(oldName);
        const entries = [...this.sheets];
        const index = entries.findIndex(([key]) => key === oldName);
        entries[index] = [newName, sheet];
        sheet.name = newName;
        this.sheets = new Map(entries);

        this.runHooks(HOOKS.AFTER_SHEET_RENAME, oldName, newName);
        return true;
    }

    /**
     * 切换到指定工作表
     * @param {string} name
     */
    switchTo(name) {
        const sheet = this.sheets.get(name);
        if (!sheet || this.activeSheet === sheet) return;

        const cancelled = this.runHooksUntil(HOOKS.BEFORE_SHEET_SWITCH, this.activeSheet, sheet);
        if (cancelled === false) return;

        const previousSheet = this.activeSheet;
        this.activeSheet = sheet;
        if (this.editor) this.editor.sheet = sheet;
        if (this.eventHandler) this.eventHandler.sheet = sheet;
        if (this.renderEngine) {
            this.#bindSheetEvents(sheet);

            // 切换 Sheet 时重置滚动位置到顶部左侧
            this.renderEngine.scrollMgr?.setScrollPosition(0, 0);
            this.renderEngine.invalidateAll();
        }
        this.render();
        this.#refreshTabBar();

        // ① 通过 EventBus 通知内部模块（插件间通信）
        if (previousSheet) {
            previousSheet.bus.emit(
                SHEET_EVENTS.SHEET_SWITCHED,
                {
                    previousSheet: previousSheet.name,
                    currentSheet: sheet.name,
                },
                { source: "Workbook" },
            );
        }

        // ② 通过 Hooks 通知用户扩展代码（公开 API）
        this.runHooks(HOOKS.AFTER_SHEET_SWITCH, previousSheet, sheet);
    }

    /** @returns {Sheet|null} */
    getActiveSheet() {
        return this.activeSheet;
    }

    // ============================================================
    // 渲染
    // ============================================================

    render() {
        if (this.renderEngine && this.activeSheet) {
            this.renderEngine.render(this.activeSheet);
        }
    }

    // ============================================================
    // 剪贴板（委托到 CopyPastePlugin）
    // ============================================================

    /**
     * 复制当前选区
     * 委托到 CopyPastePlugin，若插件未加载则回退到直接调用 ClipboardManager
     */
    copy() {
        const plugin = this.getPlugin("copyPaste");
        if (plugin) {
            plugin.copy();
        } else if (this.clipboard && this.activeSheet) {
            this.clipboard.copy(this.activeSheet);
        }
    }

    /**
     * 粘贴到当前选区
     * 委托到 CopyPastePlugin，若插件未加载则回退到直接调用 ClipboardManager
     */
    paste() {
        const plugin = this.getPlugin("copyPaste");
        if (plugin) {
            plugin.paste();
        } else if (this.clipboard && this.activeSheet) {
            this.clipboard.paste(this.activeSheet);
            this.render();
        }
    }

    // ============================================================
    // 撤销 / 重做
    // ============================================================

    undo() {
        this.#withActiveSheet((s) => {
            s.undo();
            this.render();
        });
    }

    redo() {
        this.#withActiveSheet((s) => {
            s.redo();
            this.render();
        });
    }

    // ============================================================
    // 单元格操作
    // ============================================================

    disableCell() {
        this.#withActiveSheet((s) => {
            s.disableCell(...s.selection.getActive());
            this.render();
        });
    }

    enableCell() {
        this.#withActiveSheet((s) => {
            s.enableCell(...s.selection.getActive());
            this.render();
        });
    }

    /** @returns {boolean} */
    mergeCells(topRow, topCol, bottomRow, bottomCol) {
        return this.#withActiveSheet((s) => {
            const ok = s.mergeCells(topRow, topCol, bottomRow, bottomCol);
            if (ok) this.render();
            return ok;
        }, false);
    }

    /** @returns {boolean} */
    unmergeCells() {
        return this.#withActiveSheet((s) => {
            const ok = s.unmergeCells(...s.selection.getActive());
            if (ok) this.render();
            return ok;
        }, false);
    }

    insertRow(atRow) {
        this.#withActiveSheet((s) => {
            s.insertRow(atRow ?? s.selection.getActive()[0]);
            this.render();
        });
    }

    insertCol(atCol) {
        this.#withActiveSheet((s) => {
            s.insertCol(atCol ?? s.selection.getActive()[1]);
            this.render();
        });
    }

    deleteRow(atRow) {
        this.#withActiveSheet((s) => {
            s.deleteRow(atRow ?? s.selection.getActive()[0]);
            this.render();
        });
    }

    deleteCol(atCol) {
        this.#withActiveSheet((s) => {
            s.deleteCol(atCol ?? s.selection.getActive()[1]);
            this.render();
        });
    }

    // ============================================================
    // 钩子系统（委托到 EventHandler，支持 Early Hooks 缓存）
    // ============================================================

    /**
     * 添加钩子监听器
     * 如果 eventHandler 尚未创建，会缓存到 #earlyHooks 中，待 eventHandler 创建后自动应用
     *
     * @param {string} hookName - 钩子名称
     * @param {Function} callback - 回调函数
     */
    addHook(hookName, callback) {
        if (this.eventHandler) {
            // eventHandler 已存在，直接添加
            this.eventHandler.addHook(hookName, callback);
        } else {
            // eventHandler 未创建，缓存到 earlyHooks
            if (!this.#earlyHooks.has(hookName)) {
                this.#earlyHooks.set(hookName, []);
            }
            this.#earlyHooks.get(hookName).push(callback);
        }
    }

    /**
     * 添加一次性钩子监听器
     * @param {string} hookName - 钩子名称
     * @param {Function} callback - 回调函数
     */
    addHookOnce(hookName, callback) {
        if (this.eventHandler) {
            this.eventHandler.addHookOnce(hookName, callback);
        } else {
            // 对于 early hooks，使用包装函数实现一次性逻辑
            const onceCallback = (...args) => {
                callback(...args);
                this.removeHook(hookName, onceCallback);
            };
            this.addHook(hookName, onceCallback);
        }
    }

    removeHook(hookName, callback) {
        if (this.eventHandler) {
            this.eventHandler.removeHook(hookName, callback);
        } else {
            // 从 earlyHooks 中移除
            const callbacks = this.#earlyHooks.get(hookName);
            if (callbacks) {
                const index = callbacks.indexOf(callback);
                if (index > -1) {
                    callbacks.splice(index, 1);
                }
            }
        }
    }

    clearHook(hookName) {
        if (this.eventHandler) {
            this.eventHandler.clearHook(hookName);
        } else {
            this.#earlyHooks.delete(hookName);
        }
    }

    /** @returns {boolean} */
    hasHook(hookName) {
        return this.eventHandler?.hasHook(hookName) || false;
    }

    runHooks(hookName, ...args) {
        return this.eventHandler?.runHooks(hookName, ...args);
    }

    runHooksUntil(hookName, ...args) {
        if (!this.eventHandler) return undefined;
        return this.eventHandler.runHooksUntil(hookName, ...args);
    }

    // ============================================================
    // 样式操作
    // ============================================================

    /**
     * 更新配置（对齐 Handsontable 的 updateSettings API）
     * @param {object} settings
     */
    updateSettings(settings = {}) {
        this.#withActiveSheet((s) => {
            if (settings.defaultStyle) {
                this.#defaultStyle = settings.defaultStyle;
            }
            SettingsApplier.apply({ sheet: s, renderEngine: this.renderEngine, settings });
            this.render();
        });
    }

    setCellStyle(row, col, styleObj) {
        this.#withActiveSheet((s) => {
            s.setCellStyle(row, col, styleObj);
            this.render();
        });
    }

    setRangeStyle(range, styleObj) {
        this.#withActiveSheet((s) => {
            s.setRangeStyle(range, styleObj);
            this.render();
        });
    }

    /** @returns {object} */
    getCellStyle(row, col) {
        return this.#withActiveSheet((s) => s.getCellStyle(row, col), {});
    }

    setDefaultStyle(styleObj) {
        this.#defaultStyle = styleObj;
        for (const sheet of this.sheets.values()) {
            sheet.setDefaultStyle(styleObj);
        }
        this.render();
    }

    /** @returns {object} */
    getDefaultStyle() {
        return this.#defaultStyle || this.#withActiveSheet((s) => s.getDefaultStyle(), {});
    }

    setRowStyle(row, styleObj) {
        this.#withActiveSheet((s) => {
            s.setRowStyle(row, styleObj);
            this.render();
        });
    }

    setColStyle(col, styleObj) {
        this.#withActiveSheet((s) => {
            s.setColStyle(col, styleObj);
            this.render();
        });
    }

    clearCellStyle(row, col) {
        this.#withActiveSheet((s) => {
            s.clearCellStyle(row, col);
            this.render();
        });
    }

    clearRowStyle(row) {
        this.#withActiveSheet((s) => {
            s.clearRowStyle(row);
            this.render();
        });
    }

    clearColStyle(col) {
        this.#withActiveSheet((s) => {
            s.clearColStyle(col);
            this.render();
        });
    }

    clearRangeStyle(range) {
        this.#withActiveSheet((s) => {
            s.clearRangeStyle(range);
            this.render();
        });
    }

    batchStyleUpdate(fn) {
        this.#withActiveSheet((s) => {
            s.batchStyleUpdate(fn);
            this.render();
        });
    }

    // ============================================================
    // 导出（委托到 exportFile 插件）
    // ============================================================

    /** @returns {string} */
    exportAsString(format, options) {
        return this.getPlugin("exportFile")?.exportAsString(format, options) ?? "";
    }

    /** @returns {?Blob} */
    exportAsBlob(format, options) {
        return this.getPlugin("exportFile")?.exportAsBlob(format, options) ?? null;
    }

    downloadFile(format, options) {
        this.getPlugin("exportFile")?.downloadFile(format, options);
    }

    // ============================================================
    // 生命周期
    // ============================================================

    destroy() {
        // ✅ 通过 EventBus 发射工作簿即将销毁事件（指定 source 为 Workbook）
        // EventHandler 会订阅此事件并触发 DESTROY hook
        this.activeSheet?.bus?.emit(SHEET_EVENTS.WORKBOOK_DESTROY, [this], { source: "Workbook" });

        this.pluginManager?.destroyAll();
        this.pluginManager = null;

        this.eventHandler?.destroy();
        this.eventHandler = null;

        this.editor?.destroy();
        this.editor = null;

        this.renderEngine?.destroy();
        this.renderEngine = null;

        this.sheets.clear();
        this.activeSheet = null;
    }

    // ============================================================
    // 私有辅助
    // ============================================================

    /**
     * 如果尚未有活动工作表，将传入 sheet 设为活动。
     * 同时同步 editor / eventHandler 的 sheet 引用。
     */
    #activateIfFirst(sheet) {
        if (!this.activeSheet) {
            this.activeSheet = sheet;
            if (this.editor) this.editor.sheet = sheet;
            if (this.eventHandler) this.eventHandler.sheet = sheet;
        }
    }

    /** 安全刷新 SheetTabBar */
    #refreshTabBar() {
        this.renderEngine?.sheetTabBar?.refresh();
    }

    /**
     * 统一的"有活动工作表时执行"封装。
     * 消除所有方法中重复的 `if (!this.activeSheet) return` 守卫。
     *
     * @template T
     * @param {(sheet: Sheet) => T} fn
     * @param {T} [defaultValue]
     * @returns {T|undefined}
     */
    #withActiveSheet(fn, defaultValue) {
        if (!this.activeSheet) return defaultValue;
        return fn(this.activeSheet);
    }
}
