import { Sheet, SHEET_CHANGE_ALL, SHEET_CHANGE_CELL, SHEET_CHANGE_RENDER } from "./Sheet.js";
import { RenderEngine } from "../render/RenderEngine.js";
import { ViewportTransform } from "../render/ViewportTransform.js";
import { EditorManager } from "../editor/EditorManager.js";
import { EventHandler } from "../editor/EventHandler.js";
import { isFunction, isObject } from "lodash-es";
import { PluginManager } from "../plugins/PluginManager.js";
import { stylePool } from "../styles/index.js";
import { CONFIG } from "../constants/config";
import { SettingsApplier } from "./SettingsApplier.js";

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
    /** @type {string} */
    #containerId;
    /** @type {object} */
    #initOptions;
    /** @type {Array<{type:string, name?:string, PluginClass?:Function, options:object}>} */
    #pendingPlugins = [];

    // ============================================================
    // 构造函数
    // ============================================================

    /**
     * @param {string} containerId - Canvas 元素 ID
     * @param {object} [options={}] - 配置选项
     *
     * @param {Array<Array<*>>} [options.data] - 初始数据（二维数组）
     * @param {string} [options.sheetName='Sheet1'] - 初始工作表名称
     * @param {true|string[]|Function} [options.colHeaders=true] - 列头标签
     * @param {true|string[]|Function} [options.rowHeaders=true] - 行头标签
     * @param {number} [options.width] - 画布宽度（px），默认自适应容器
     * @param {number} [options.height] - 画布高度（px），默认自适应容器
     * @param {number|number[]} [options.rowHeights] - 行高配置
     * @param {number|number[]} [options.colWidths] - 列宽配置
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
     * @param {Array<{row:number,col:number,type:string,...}>} [options.cellTypes] - 单元格级别类型配置
     * @param {Function} [options.afterInit] - 初始化完成回调
     */
    constructor(containerId, options = {}) {
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

        this.#containerId = containerId || CONFIG.CANVAS_ID;
        this.#initOptions = options;

        /** @type {import("../formula/FormulaEngine.js").FormulaEngine|null} 公式引擎（由 FormulaPlugin 注入） */
        this.formulaEngine = null;
        /** @type {import("../ui/FormulaBar.js").FormulaBar|null} 公式栏（由 FormulaPlugin 注入） */
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
            this.addSheet(this.#initOptions?.sheetName || "Sheet1");
        }
    }

    #createRenderEngine() {
        this.renderEngine = new RenderEngine(this.#containerId);
        const opts = this.#initOptions;
        if (opts?.width != null || opts?.height != null) {
            this.renderEngine.setCanvasSize(opts.width, opts.height);
        }
    }

    #createSubSystems() {
        this.editor = new EditorManager(this.renderEngine, this.activeSheet);
        this.eventHandler = new EventHandler(this.activeSheet, this.renderEngine, this.editor, null);
        this.pluginManager = new PluginManager(this);
    }

    #linkSheetsToRenderEngine() {
        for (const sheet of this.sheets.values()) {
            this.#bindSheetOnChange(sheet);
        }
    }

    /**
     * 将 Sheet 的数据变更通知桥接到 RenderEngine
     * @param {import("./Sheet.js").Sheet} sheet
     */
    #bindSheetOnChange(sheet) {
        sheet.onChange = (event) => {
            switch (event.type) {
                case SHEET_CHANGE_ALL:
                    this.renderEngine?.invalidateAll();
                    break;
                case SHEET_CHANGE_CELL:
                    this.renderEngine?.invalidateCell(event.pageRow, event.c);
                    break;
                case SHEET_CHANGE_RENDER:
                    this.renderEngine?.render(event.sheet);
                    break;
            }
        };
    }

    // ============================================================
    // 滚动回调：编辑器视口裁剪
    // ============================================================

    #setupScrollCallback() {
        this.renderEngine.onScrollCallback = () => {
            const activeEditor = this.editor?.getActiveEditor();
            if (!activeEditor || activeEditor.activeRow < 0) return;

            const { activeRow: row, activeCol: col } = activeEditor;
            const sheet = this.activeSheet;
            const dpr = window.devicePixelRatio || 1;
            const tabH = CONFIG.SHEET_TAB_HEIGHT;
            const canvasW = this.renderEngine.canvas.width / dpr;
            const canvasH = this.renderEngine.canvas.height / dpr;

            const vt = new ViewportTransform(sheet, this.renderEngine.scrollX, this.renderEngine.scrollY);
            const visible = vt.isCellVisible(row, col, canvasW, canvasH, tabH);

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
            this.addSheet(newName);
            this.switchTo(newName);
            tabBar.refresh();
            tabBar.scrollToTab(newName);
        };

        tabBar.onRemove = (name) => {
            this.removeSheet(name);
            tabBar.refresh();
        };

        tabBar.onRename = (oldName, newName) => {
            this.renameSheet(oldName, newName);
            tabBar.refresh();
        };

        tabBar.refresh();
    }

    #generateSheetName() {
        let idx = this.sheets.size + 1;
        while (this.sheets.has(`Sheet${idx}`)) idx++;
        return `Sheet${idx}`;
    }

    // ============================================================
    // 初始配置应用
    // ============================================================

    #applyInitOptions() {
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
     */
    #applySheetsConfig(opts) {
        for (const sheetConfig of opts.sheets) {
            const name = sheetConfig.name || this.#generateSheetName();
            const sheet = this.sheets.get(name);
            if (!sheet) continue;
            const settings = { ...opts, ...sheetConfig };
            delete settings.sheets;
            SettingsApplier.apply({ sheet, renderEngine: this.renderEngine, settings });
        }
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
        const sheet = new Sheet(name);
        sheet.workbook = this;
        if (this.renderEngine) this.#bindSheetOnChange(sheet);

        const opts = this.#initOptions;
        sheet.rowColManager.ensureSize(opts?.startRows || 100, opts?.startCols || 26);

        this.sheets.set(name, sheet);
        this.#activateIfFirst(sheet);
        this.#refreshTabBar();
        return sheet;
    }

    /**
     * 删除工作表（至少保留一个）
     * @param {string} name
     * @returns {boolean}
     */
    removeSheet(name) {
        if (!this.sheets.has(name) || this.sheets.size <= 1) return false;

        const removed = this.sheets.get(name);
        this.sheets.delete(name);

        if (this.activeSheet === removed) {
            this.switchTo(this.sheets.keys().next().value);
        }

        this.#refreshTabBar();
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

        const sheet = this.sheets.get(oldName);
        this.sheets.delete(oldName);
        sheet.name = newName;
        this.sheets.set(newName, sheet);
        return true;
    }

    /**
     * 切换到指定工作表
     * @param {string} name
     */
    switchTo(name) {
        const sheet = this.sheets.get(name);
        if (!sheet || this.activeSheet === sheet) return;

        this.activeSheet = sheet;
        if (this.editor) this.editor.sheet = sheet;
        if (this.eventHandler) this.eventHandler.sheet = sheet;
        if (this.renderEngine) {
            this.#bindSheetOnChange(sheet);
            this.renderEngine.invalidateAll();
        }
        this.render();
        this.#refreshTabBar();
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
    // 钩子系统（委托到 EventHandler）
    // ============================================================

    addHook(hookName, callback) {
        this.eventHandler?.addHook(hookName, callback);
    }

    addHookOnce(hookName, callback) {
        this.eventHandler?.addHookOnce(hookName, callback);
    }

    removeHook(hookName, callback) {
        this.eventHandler?.removeHook(hookName, callback);
    }

    clearHook(hookName) {
        this.eventHandler?.clearHook(hookName);
    }

    /** @returns {boolean} */
    hasHook(hookName) {
        return this.eventHandler?.hasHook(hookName) || false;
    }

    runHooks(hookName, ...args) {
        return this.eventHandler?.runHooks(hookName, ...args);
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
        this.#withActiveSheet((s) => {
            s.setDefaultStyle(styleObj);
            this.render();
        });
    }

    /** @returns {object} */
    getDefaultStyle() {
        return this.#withActiveSheet((s) => s.getDefaultStyle(), {});
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
