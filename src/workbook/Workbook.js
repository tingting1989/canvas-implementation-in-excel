import { Sheet } from "./Sheet.js";
import { RenderEngine } from "../render/RenderEngine.js";
import { EditorManager } from "../editor/EditorManager.js";
import { EventHandler } from "../editor/EventHandler.js";
import { ClipboardManager } from "../editor/ClipboardManager.js";
import { PluginManager } from "../plugins/PluginManager.js";
import { stylePool } from "../styles/index.js";
import { CONFIG } from "../constants/config";

/**
 * 工作簿
 * 顶层管理对象，协调 Sheet、RenderEngine、EventHandler、EditorManager、PluginManager
 *
 * 插件系统：
 * - Workbook.registerPlugin(name, PluginClass)  — 全局注册插件类
 * - workbook.loadPlugin(name, options)           — 加载已注册的插件
 * - workbook.loadPluginClass(PluginClass, opts)  — 直接加载插件类（无需全局注册）
 * - workbook.getPlugin(name)                     — 获取插件实例
 * - workbook.unloadPlugin(name)                  — 卸载插件
 * - workbook.enablePlugin(name)                  — 启用插件
 * - workbook.disablePlugin(name)                 — 禁用插件
 */
export class Workbook {
    static #pluginRegistry = new Map();

    #containerId;
    #initOptions;
    #pendingPlugins = [];

    /**
     * 创建工作簿
     * 对齐 Handsontable 的 new Handsontable(container, options) 模式
     *
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
     *   number: 统一行高；number[]: 逐行指定
     * @param {number|number[]} [options.colWidths] - 列宽配置
     *   number: 统一列宽；number[]: 逐列指定
     * @param {number} [options.startRows=100] - 初始行数
     * @param {number} [options.startCols=26] - 初始列数
     * @param {string[]} [options.plugins] - 要加载的插件名称列表
     * @param {object} [options.hooks] - 事件钩子映射 { hookName: callback }
     * @param {Array<{row:number,col:number,rowspan:number,colspan:number}>} [options.mergeCells] - 合并单元格配置
     * @param {Array<{range:object,condition:Function,style:object}>} [options.conditionalStyles] - 条件样式
     * @param {Function} [options.afterInit] - 初始化完成回调
     *
     * @example
     * const wb = new Workbook('grid', {
     *   data: [
     *     ['Name', 'Age', 'City'],
     *     ['Zhang San', 25, 'Beijing'],
     *     ['Li Si', 30, 'Shanghai'],
     *   ],
     *   colHeaders: ['Name', 'Age', 'City'],
     *   rowHeaders: true,
     *   colWidths: [120, 80, 100],
     *   plugins: ['autoFill', 'contextMenu'],
     *   hooks: {
     *     ON_CELL_CLICK: (row, col) => console.log(row, col),
     *   },
     * });
     */
    constructor(containerId, options = {}) {
        this.sheets = new Map();
        this.clipboard = new ClipboardManager();
        this.renderEngine = null;
        this.editor = null;
        this.eventHandler = null;
        this.pluginManager = null;

        this.#containerId = containerId || CONFIG.CANVAS_ID;
        this.#initOptions = options;
    }

    static registerPlugin(name, PluginClass) {
        Workbook.#pluginRegistry.set(name, PluginClass);
    }

    static unregisterPlugin(name) {
        Workbook.#pluginRegistry.delete(name);
    }

    loadPlugin(name, options = {}) {
        if (!this.pluginManager) {
            this.#pendingPlugins.push({ type: "name", name, options });
            return null;
        }
        return this.pluginManager.loadPlugin(name, options);
    }

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

    getPlugin(name) {
        return this.pluginManager?.getPlugin(name) || null;
    }

    enablePlugin(name) {
        this.pluginManager?.enablePlugin(name);
    }

    disablePlugin(name) {
        this.pluginManager?.disablePlugin(name);
    }

    initRender() {
        if (this.renderEngine) return;

        if (this.sheets.size === 0) {
            this.addSheet(this.#initOptions?.sheetName || "Sheet1");
        }

        this.renderEngine = new RenderEngine(this.#containerId);

        if (this.#initOptions?.width != null || this.#initOptions?.height != null) {
            this.renderEngine.setCanvasSize(this.#initOptions?.width, this.#initOptions?.height);
        }

        this.editor = new EditorManager(this.renderEngine, this.activeSheet);
        this.eventHandler = new EventHandler(this.activeSheet, this.renderEngine, this.editor, this.clipboard);
        this.pluginManager = new PluginManager(this);

        for (const [name, PluginClass] of Workbook.#pluginRegistry) {
            PluginManager.register(name, PluginClass);
        }

        for (const sheet of this.sheets.values()) {
            sheet.renderEngine = this.renderEngine;
        }

        this.#applyInitOptions();
        this.#setupScrollCallback();
        this.#setupSheetTabBar();
        this.#flushPendingPlugins();
    }

    #setupScrollCallback() {
        this.renderEngine.onScrollCallback = () => {
            const textEditor = this.editor?.getEditor("text");
            if (!textEditor || textEditor.activeRow < 0) return;

            const rc = this.activeSheet.rowColManager;
            const { activeRow: row, activeCol: col } = textEditor;
            const headerW = CONFIG.HEADER_WIDTH;
            const headerH = CONFIG.HEADER_HEIGHT;
            const viewW = this.renderEngine.canvas.width / (window.devicePixelRatio || 1) - headerW;
            const viewH = this.renderEngine.canvas.height / (window.devicePixelRatio || 1) - headerH - CONFIG.SHEET_TAB_HEIGHT;

            const cellX = rc.getColX(col);
            const cellY = rc.getRowY(row);
            const cellW = rc.getColWidth(col);
            const cellH = rc.getRowHeight(row);
            const sx = this.renderEngine.scrollX;
            const sy = this.renderEngine.scrollY;

            const outOfView = cellX + cellW <= sx || cellX >= sx + viewW || cellY + cellH <= sy || cellY >= sy + viewH;

            if (outOfView) {
                textEditor.hideForScroll();
            } else {
                textEditor.restoreFromScroll();
            }
        };
    }

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
        let name = `Sheet${idx}`;
        while (this.sheets.has(name)) {
            idx++;
            name = `Sheet${idx}`;
        }
        return name;
    }

    #applyInitOptions() {
        const opts = this.#initOptions;
        if (!opts || Object.keys(opts).length === 0 || !this.activeSheet) return;

        this.#applySheetSettings(this.activeSheet, opts);

        if (opts.plugins && Array.isArray(opts.plugins)) {
            const pluginOptions = opts.pluginOptions || {};
            for (const name of opts.plugins) {
                const pluginOpts = pluginOptions[name] || {};
                this.loadPlugin(name, pluginOpts);
            }
        }

        if (opts.hooks && typeof opts.hooks === "object") {
            for (const [hookName, callback] of Object.entries(opts.hooks)) {
                if (typeof callback === "function") {
                    this.addHook(hookName, callback);
                }
            }
        }

        if (typeof opts.afterInit === "function") {
            opts.afterInit(this);
        }
    }

    #flushPendingPlugins() {
        for (const pending of this.#pendingPlugins) {
            if (pending.type === "name") {
                this.pluginManager.loadPlugin(pending.name, pending.options);
            } else if (pending.type === "class") {
                this.pluginManager.loadPluginClass(pending.PluginClass, pending.options);
            }
        }
        this.#pendingPlugins = [];
    }

    addSheet(name) {
        const engine = this.renderEngine || { canvas: { width: 0, height: 0 } };
        const sheet = new Sheet(name, engine);
        sheet.workbook = this;

        const opts = this.#initOptions;
        sheet.rowColManager.ensureSize(opts?.startRows || 100, opts?.startCols || 26);

        this.sheets.set(name, sheet);

        if (!this.activeSheet) {
            this.activeSheet = sheet;
            if (this.editor) this.editor.sheet = sheet;
            if (this.eventHandler) this.eventHandler.sheet = sheet;
        }

        if (this.renderEngine?.sheetTabBar) {
            this.renderEngine.sheetTabBar.refresh();
        }

        return sheet;
    }

    removeSheet(name) {
        if (!this.sheets.has(name)) return false;
        if (this.sheets.size <= 1) return false;

        const removed = this.sheets.get(name);
        this.sheets.delete(name);

        if (this.activeSheet === removed) {
            const firstKey = this.sheets.keys().next().value;
            this.switchTo(firstKey);
        }

        if (this.renderEngine?.sheetTabBar) {
            this.renderEngine.sheetTabBar.refresh();
        }

        return true;
    }

    renameSheet(oldName, newName) {
        if (!this.sheets.has(oldName)) return false;
        if (!newName || !newName.trim()) return false;
        newName = newName.trim();
        if (oldName === newName) return false;
        if (this.sheets.has(newName)) return false;

        const sheet = this.sheets.get(oldName);
        this.sheets.delete(oldName);
        sheet.name = newName;
        this.sheets.set(newName, sheet);

        return true;
    }

    switchTo(name) {
        if (!this.sheets.has(name)) return;
        if (this.activeSheet === this.sheets.get(name)) return;
        this.activeSheet = this.sheets.get(name);
        if (this.editor) this.editor.sheet = this.activeSheet;
        if (this.eventHandler) this.eventHandler.sheet = this.activeSheet;
        if (this.renderEngine) {
            this.activeSheet.renderEngine = this.renderEngine;
            this.renderEngine.invalidateAll();
        }
        this.render();

        if (this.renderEngine?.sheetTabBar) {
            this.renderEngine.sheetTabBar.refresh();
        }
    }

    getActiveSheet() {
        return this.activeSheet;
    }

    render() {
        if (!this.renderEngine || !this.activeSheet) return;
        this.renderEngine.render(this.activeSheet);
    }

    copy() {
        if (!this.activeSheet) return;
        this.clipboard.copy(this.activeSheet);
    }

    paste() {
        if (!this.activeSheet) return;
        this.clipboard.paste(this.activeSheet);
        this.render();
    }

    undo() {
        if (!this.activeSheet) return;
        this.activeSheet.undo();
        this.render();
    }

    redo() {
        if (!this.activeSheet) return;
        this.activeSheet.redo();
        this.render();
    }

    disableCell() {
        if (!this.activeSheet) return;
        const [r, c] = this.activeSheet.selection.getActive();
        this.activeSheet.disableCell(r, c);
        this.render();
    }

    enableCell() {
        if (!this.activeSheet) return;
        const [r, c] = this.activeSheet.selection.getActive();
        this.activeSheet.enableCell(r, c);
        this.render();
    }

    mergeCells(topRow, topCol, bottomRow, bottomCol) {
        if (!this.activeSheet) return false;
        const result = this.activeSheet.mergeCells(topRow, topCol, bottomRow, bottomCol);
        if (result) this.render();
        return result;
    }

    unmergeCells() {
        if (!this.activeSheet) return false;
        const [r, c] = this.activeSheet.selection.getActive();
        const result = this.activeSheet.unmergeCells(r, c);
        if (result) this.render();
        return result;
    }

    insertRow(atRow) {
        if (!this.activeSheet) return;
        if (atRow === undefined) atRow = this.activeSheet.selection.getActive()[0];
        this.activeSheet.insertRow(atRow);
        this.render();
    }

    insertCol(atCol) {
        if (!this.activeSheet) return;
        if (atCol === undefined) atCol = this.activeSheet.selection.getActive()[1];
        this.activeSheet.insertCol(atCol);
        this.render();
    }

    deleteRow(atRow) {
        if (!this.activeSheet) return;
        if (atRow === undefined) atRow = this.activeSheet.selection.getActive()[0];
        this.activeSheet.deleteRow(atRow);
        this.render();
    }

    deleteCol(atCol) {
        if (!this.activeSheet) return;
        if (atCol === undefined) atCol = this.activeSheet.selection.getActive()[1];
        this.activeSheet.deleteCol(atCol);
        this.render();
    }

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

    hasHook(hookName) {
        return this.eventHandler?.hasHook(hookName) || false;
    }

    runHooks(hookName, ...args) {
        return this.eventHandler?.runHooks(hookName, ...args);
    }

    /**
     * 更新配置（对齐 Handsontable 的 updateSettings API）
     *
     * @param {object} settings - 配置项（同构造函数 options）
     */
    updateSettings(settings = {}) {
        if (!this.activeSheet) return;
        this.#applySheetSettings(this.activeSheet, settings);
        this.render();
    }

    /**
     * 设置单元格样式
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {object} styleObj - 样式对象，如 { fontSize: 16, fontWeight: "bold", color: "#ff0000" }
     */
    setCellStyle(row, col, styleObj) {
        if (!this.activeSheet) return;
        this.activeSheet.setCellStyle(row, col, styleObj);
        this.render();
    }

    /**
     * 批量设置选区样式
     * @param {{ topRow: number, topCol: number, bottomRow: number, bottomCol: number }} range - 选区范围
     * @param {object} styleObj - 样式对象
     */
    setRangeStyle(range, styleObj) {
        if (!this.activeSheet) return;
        this.activeSheet.setRangeStyle(range, styleObj);
        this.render();
    }

    /**
     * 获取单元格最终解析样式
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {object} 合并后的样式对象
     */
    getCellStyle(row, col) {
        if (!this.activeSheet) return {};
        return this.activeSheet.getCellStyle(row, col);
    }

    /**
     * 设置当前工作表默认样式
     * 影响所有未单独设置样式的单元格
     * @param {object} styleObj - 样式对象，如 { fontSize: 14, fontFamily: "Arial" }
     */
    setDefaultStyle(styleObj) {
        if (!this.activeSheet) return;
        this.activeSheet.setDefaultStyle(styleObj);
        this.render();
    }

    /**
     * 获取当前工作表默认样式
     * @returns {object} 默认样式对象
     */
    getDefaultStyle() {
        if (!this.activeSheet) return {};
        return this.activeSheet.getDefaultStyle();
    }

    /**
     * 统一的 Sheet 配置应用方法
     * 被 #applyInitOptions 和 updateSettings 共用，消除重复代码
     */
    #applySheetSettings(sheet, settings) {
        if (settings.colHeaders !== undefined) {
            sheet.colHeaders = settings.colHeaders;
        }
        if (settings.rowHeaders !== undefined) {
            sheet.rowHeaders = settings.rowHeaders;
        }
        if (settings.data) {
            sheet.loadData(settings.data);
        }
        if (settings.defaultStyle) {
            sheet.setDefaultStyle(settings.defaultStyle);
        }
        if (settings.rowHeights !== undefined) {
            this.#applyRowHeights(sheet, settings.rowHeights);
        }
        if (settings.colWidths !== undefined) {
            this.#applyColWidths(sheet, settings.colWidths);
        }
        if (Array.isArray(settings.mergeCells)) {
            this.#applyMergeCells(sheet, settings.mergeCells);
        }
        if (Array.isArray(settings.conditionalStyles)) {
            this.#applyConditionalStyles(sheet, settings.conditionalStyles);
        }
        if (settings.width != null || settings.height != null) {
            this.renderEngine?.setCanvasSize(settings.width, settings.height);
        }
    }

    #applyRowHeights(sheet, rowHeights) {
        if (typeof rowHeights === "number") {
            const count = sheet.rowColManager.allocatedRowCount || 100;
            sheet.rowColManager.ensureSize(count, 0);
            for (let r = 0; r < count; r++) {
                sheet.rowColManager.setRowHeight(r, rowHeights);
            }
        } else if (Array.isArray(rowHeights)) {
            sheet.rowColManager.ensureSize(rowHeights.length, 0);
            for (let r = 0; r < rowHeights.length; r++) {
                sheet.rowColManager.setRowHeight(r, rowHeights[r]);
            }
        }
    }

    #applyColWidths(sheet, colWidths) {
        if (typeof colWidths === "number") {
            const count = sheet.rowColManager.allocatedColCount || 26;
            sheet.rowColManager.ensureSize(0, count);
            for (let c = 0; c < count; c++) {
                sheet.rowColManager.setColWidth(c, colWidths);
            }
        } else if (Array.isArray(colWidths)) {
            sheet.rowColManager.ensureSize(0, colWidths.length);
            for (let c = 0; c < colWidths.length; c++) {
                sheet.rowColManager.setColWidth(c, colWidths[c]);
            }
        }
    }

    #applyMergeCells(sheet, mergeCells) {
        for (const m of mergeCells) {
            if (m.row !== undefined && m.col !== undefined && m.rowspan !== undefined && m.colspan !== undefined) {
                sheet.mergeCells(m.row, m.col, m.row + m.rowspan - 1, m.col + m.colspan - 1);
            }
        }
    }

    #applyConditionalStyles(sheet, conditionalStyles) {
        for (const cs of conditionalStyles) {
            if (cs.range && cs.condition && cs.style) {
                const styleId = stylePool.getStyleId(cs.style);
                sheet.addConditionalRule(cs.range, cs.condition, styleId);
            }
        }
    }

    #getExportPlugin() {
        return this.getPlugin("exportFile");
    }

    exportAsString(format, options) {
        return this.#getExportPlugin()?.exportAsString(format, options) ?? "";
    }

    exportAsBlob(format, options) {
        return this.#getExportPlugin()?.exportAsBlob(format, options) ?? null;
    }

    downloadFile(format, options) {
        this.#getExportPlugin()?.downloadFile(format, options);
    }

    destroy() {
        this.pluginManager?.destroyAll();
        this.pluginManager = null;
        this.eventHandler?.destroy();
        this.editor?.destroy();
        this.renderEngine?.destroy();
        this.renderEngine = null;
        this.editor = null;
        this.eventHandler = null;
        this.sheets.clear();
        this.activeSheet = null;
    }
}