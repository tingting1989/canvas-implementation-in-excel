import {Sheet} from "./Sheet.js";
import {RenderEngine} from "../render/RenderEngine.js";
import {EditorManager} from "../editor/EditorManager.js";
import {EventHandler} from "../editor/EventHandler.js";
import {ClipboardManager} from "../editor/ClipboardManager.js";
import {PluginManager} from "../plugins/PluginManager.js";
import {stylePool} from "../styles/index.js";
import {CONFIG} from "../constants/config";

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
    /** 全局插件注册表（静态，所有 Workbook 实例共享） */
    static #pluginRegistry = new Map();

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
        this.#pendingPlugins = [];

        this.#containerId = containerId || CONFIG.CANVAS_ID;
        this.#initOptions = options;
    }

    /** Canvas 元素 ID */
    #containerId;
    /** 初始化配置 */
    #initOptions;

    /**
     * 全局注册插件类
     * 注册后所有 Workbook 实例均可通过 loadPlugin 加载该插件
     *
     * @param {string} name - 插件名称
     * @param {typeof import("../plugins/BasePlugin.js").BasePlugin} PluginClass - 插件类
     */
    static registerPlugin(name, PluginClass) {
        Workbook.#pluginRegistry.set(name, PluginClass);
    }

    /**
     * 全局注销插件类
     *
     * @param {string} name - 插件名称
     */
    static unregisterPlugin(name) {
        Workbook.#pluginRegistry.delete(name);
    }

    /**
     * 加载插件
     * 如果 renderEngine 尚未初始化，插件会被放入待加载队列
     *
     * @param {string} name - 插件名称（需先通过 Workbook.registerPlugin 注册）
     * @param {object} [options={}] - 插件配置
     * @returns {import("../plugins/BasePlugin.js").BasePlugin|null}
     */
    loadPlugin(name, options = {}) {
        if (!this.pluginManager) {
            this.#pendingPlugins.push({ type: 'name', name, options });
            return null;
        }
        return this.pluginManager.loadPlugin(name, options);
    }

    /**
     * 直接加载插件类（无需全局注册）
     *
     * @param {typeof import("../plugins/BasePlugin.js").BasePlugin} PluginClass - 插件类
     * @param {object} [options={}] - 插件配置
     * @returns {import("../plugins/BasePlugin.js").BasePlugin}
     */
    loadPluginClass(PluginClass, options = {}) {
        if (!this.pluginManager) {
            this.#pendingPlugins.push({ type: 'class', PluginClass, options });
            return null;
        }
        return this.pluginManager.loadPluginClass(PluginClass, options);
    }

    /**
     * 卸载插件
     *
     * @param {string} name - 插件名称
     */
    unloadPlugin(name) {
        this.pluginManager?.unloadPlugin(name);
    }

    /**
     * 获取已加载的插件实例
     *
     * @param {string} name - 插件名称
     * @returns {import("../plugins/BasePlugin.js").BasePlugin|null}
     */
    getPlugin(name) {
        return this.pluginManager?.getPlugin(name) || null;
    }

    /**
     * 启用插件
     *
     * @param {string} name - 插件名称
     */
    enablePlugin(name) {
        this.pluginManager?.enablePlugin(name);
    }

    /**
     * 禁用插件
     *
     * @param {string} name - 插件名称
     */
    disablePlugin(name) {
        this.pluginManager?.disablePlugin(name);
    }

    /** 待加载的插件队列 */
    #pendingPlugins = [];

    initRender() {
        if (this.renderEngine) return;

        if (this.sheets.size === 0) {
            const sheetName = this.#initOptions?.sheetName || 'Sheet1';
            this.addSheet(sheetName);
        }

        this.renderEngine = new RenderEngine(this.#containerId);
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

        this.renderEngine.onScrollCallback = () => {
            const textEditor = this.editor?.getEditor('text');
            if (!textEditor || textEditor.activeRow < 0) return;

            const rc = this.activeSheet.rowColManager;
            const row = textEditor.activeRow;
            const col = textEditor.activeCol;
            const headerW = CONFIG.HEADER_WIDTH;
            const headerH = CONFIG.HEADER_HEIGHT;
            const viewW = this.renderEngine.canvas.width - headerW;
            const viewH = this.renderEngine.canvas.height - headerH;

            const cellX = rc.getColX(col);
            const cellY = rc.getRowY(row);
            const cellW = rc.getColWidth(col);
            const cellH = rc.getRowHeight(row);

            const sx = this.renderEngine.scrollX;
            const sy = this.renderEngine.scrollY;

            const outOfView = cellX + cellW <= sx || cellX >= sx + viewW ||
                cellY + cellH <= sy || cellY >= sy + viewH;

            if (outOfView) {
                textEditor.hideForScroll();
            } else {
                textEditor.restoreFromScroll();
            }
        };

        this.#flushPendingPlugins();
    }

    /**
     * 应用构造函数传入的初始化配置
     * 在 initRender 中调用，此时 renderEngine 和 eventHandler 已就绪
     */
    #applyInitOptions() {
        const opts = this.#initOptions;
        if (!opts || Object.keys(opts).length === 0) return;

        if (!this.activeSheet) return;
        const sheet = this.activeSheet;

        if (opts.colHeaders !== undefined) {
            sheet.colHeaders = opts.colHeaders;
        }
        if (opts.rowHeaders !== undefined) {
            sheet.rowHeaders = opts.rowHeaders;
        }

        if (opts.data) {
            sheet.loadData(opts.data);
        }

        if (opts.rowHeights !== undefined) {
            if (typeof opts.rowHeights === 'number') {
                const count = opts.startRows || 100;
                sheet.rowColManager.ensureSize(count, 0);
                for (let r = 0; r < count; r++) {
                    sheet.rowColManager.setRowHeight(r, opts.rowHeights);
                }
            } else if (Array.isArray(opts.rowHeights)) {
                sheet.rowColManager.ensureSize(opts.rowHeights.length, 0);
                for (let r = 0; r < opts.rowHeights.length; r++) {
                    sheet.rowColManager.setRowHeight(r, opts.rowHeights[r]);
                }
            }
        }

        if (opts.colWidths !== undefined) {
            if (typeof opts.colWidths === 'number') {
                const count = opts.startCols || 26;
                sheet.rowColManager.ensureSize(0, count);
                for (let c = 0; c < count; c++) {
                    sheet.rowColManager.setColWidth(c, opts.colWidths);
                }
            } else if (Array.isArray(opts.colWidths)) {
                sheet.rowColManager.ensureSize(0, opts.colWidths.length);
                for (let c = 0; c < opts.colWidths.length; c++) {
                    sheet.rowColManager.setColWidth(c, opts.colWidths[c]);
                }
            }
        }

        if (opts.mergeCells && Array.isArray(opts.mergeCells)) {
            for (const m of opts.mergeCells) {
                if (m.row !== undefined && m.col !== undefined &&
                    m.rowspan !== undefined && m.colspan !== undefined) {
                    sheet.mergeCells(m.row, m.col, m.row + m.rowspan - 1, m.col + m.colspan - 1);
                }
            }
        }

        if (opts.conditionalStyles && Array.isArray(opts.conditionalStyles)) {
            for (const cs of opts.conditionalStyles) {
                if (cs.range && cs.condition && cs.style) {
                    const styleId = stylePool.getStyleId(cs.style);
                    sheet.addConditionalRule(cs.range, cs.condition, styleId);
                }
            }
        }

        if (opts.plugins && Array.isArray(opts.plugins)) {
            for (const name of opts.plugins) {
                this.loadPlugin(name);
            }
        }

        if (opts.hooks && typeof opts.hooks === 'object') {
            for (const [hookName, callback] of Object.entries(opts.hooks)) {
                if (typeof callback === 'function') {
                    this.addHook(hookName, callback);
                }
            }
        }

        if (typeof opts.afterInit === 'function') {
            opts.afterInit(this);
        }
    }

    /** 加载待加载队列中的插件 */
    #flushPendingPlugins() {
        for (const pending of this.#pendingPlugins) {
            if (pending.type === 'name') {
                this.pluginManager.loadPlugin(pending.name, pending.options);
            } else if (pending.type === 'class') {
                this.pluginManager.loadPluginClass(pending.PluginClass, pending.options);
            }
        }
        this.#pendingPlugins = [];
    }

    addSheet(name) {
        const engine = this.renderEngine || {canvas: {width: 0, height: 0}};
        const sheet = new Sheet(name, engine);
        sheet.workbook = this;

        const opts = this.#initOptions;
        const startRows = opts?.startRows || 100;
        const startCols = opts?.startCols || 26;
        sheet.rowColManager.ensureSize(startRows, startCols);

        this.sheets.set(name, sheet);

        if (!this.activeSheet) {
            this.activeSheet = sheet;
            if (this.editor) this.editor.sheet = sheet;
            if (this.eventHandler) this.eventHandler.sheet = sheet;
        }
        return sheet;
    }

    switchTo(name) {
        if (!this.sheets.has(name)) return;
        this.activeSheet = this.sheets.get(name);
        if (this.editor) this.editor.sheet = this.activeSheet;
        if (this.eventHandler) this.eventHandler.sheet = this.activeSheet;
        if (this.renderEngine) {
            this.activeSheet.renderEngine = this.renderEngine;
            this.renderEngine.invalidateAll();
        }
        this.render();
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

    /**
     * 插入行
     * 在指定行号处插入一个空行，该行及以下所有数据下移一行
     *
     * @param {number} [atRow] - 插入位置的行号（默认为当前活动单元格所在行）
     */
    insertRow(atRow) {
        if (!this.activeSheet) return;
        if (atRow === undefined) {
            atRow = this.activeSheet.selection.getActive()[0];
        }
        this.activeSheet.insertRow(atRow);
        this.render();
    }

    /**
     * 插入列
     * 在指定列号处插入一个空列，该列及右侧所有数据右移一列
     *
     * @param {number} [atCol] - 插入位置的列号（默认为当前活动单元格所在列）
     */
    insertCol(atCol) {
        if (!this.activeSheet) return;
        if (atCol === undefined) {
            atCol = this.activeSheet.selection.getActive()[1];
        }
        this.activeSheet.insertCol(atCol);
        this.render();
    }

    /**
     * 删除行
     * 删除指定行号处的行，该行以下所有数据上移一行
     *
     * @param {number} [atRow] - 要删除的行号（默认为当前活动单元格所在行）
     */
    deleteRow(atRow) {
        if (!this.activeSheet) return;
        if (atRow === undefined) {
            atRow = this.activeSheet.selection.getActive()[0];
        }
        this.activeSheet.deleteRow(atRow);
        this.render();
    }

    /**
     * 删除列
     * 删除指定列号处的列，该列右侧所有数据左移一列
     *
     * @param {number} [atCol] - 要删除的列号（默认为当前活动单元格所在列）
     */
    deleteCol(atCol) {
        if (!this.activeSheet) return;
        if (atCol === undefined) {
            atCol = this.activeSheet.selection.getActive()[1];
        }
        this.activeSheet.deleteCol(atCol);
        this.render();
    }

    /**
     * 注册钩子回调
     * 参考 Handsontable: hot.addHook('afterChange', (changes) => {})
     *
     * @param {string} hookName - 钩子名称
     * @param {Function} callback - 回调函数
     */
    addHook(hookName, callback) {
        this.eventHandler?.addHook(hookName, callback);
    }

    /**
     * 注册一次性钩子回调（触发一次后自动移除）
     *
     * @param {string} hookName - 钩子名称
     * @param {Function} callback - 回调函数
     */
    addHookOnce(hookName, callback) {
        this.eventHandler?.addHookOnce(hookName, callback);
    }

    /**
     * 移除指定钩子回调
     *
     * @param {string} hookName - 钩子名称
     * @param {Function} callback - 回调函数
     */
    removeHook(hookName, callback) {
        this.eventHandler?.removeHook(hookName, callback);
    }

    /**
     * 清空指定钩子的所有回调
     *
     * @param {string} hookName - 钩子名称
     */
    clearHook(hookName) {
        this.eventHandler?.clearHook(hookName);
    }

    /**
     * 检查指定钩子是否有回调
     *
     * @param {string} hookName - 钩子名称
     * @returns {boolean}
     */
    hasHook(hookName) {
        return this.eventHandler?.hasHook(hookName) || false;
    }

    /**
     * 执行指定钩子的所有回调（一般由内部调用）
     *
     * @param {string} hookName - 钩子名称
     * @param {...*} args - 传递给回调的参数
     * @returns {*}
     */
    runHooks(hookName, ...args) {
        return this.eventHandler?.runHooks(hookName, ...args);
    }

    /**
     * 更新配置（对齐 Handsontable 的 updateSettings API）
     * 支持运行时修改工作表配置，修改后自动重新渲染
     *
     * 支持的配置项：
     * - data: Array<Array<*>> — 重新加载数据
     * - colHeaders: true | string[] | Function — 自定义列头标签
     * - rowHeaders: true | string[] | Function — 自定义行头标签
     * - rowHeights: number | number[] — 行高配置
     * - colWidths: number | number[] — 列宽配置
     * - mergeCells: Array<{row,col,rowspan,colspan}> — 合并单元格
     * - conditionalStyles: Array<{range,condition,style}> — 条件样式
     *
     * @param {object} settings - 配置项
     *
     * @example
     * wb.updateSettings({ colHeaders: ['Name', 'Age', 'City'] });
     * wb.updateSettings({ colWidths: [120, 80, 100] });
     * wb.updateSettings({ rowHeights: 30 });
     */
    updateSettings(settings = {}) {
        if (!this.activeSheet) return;
        const sheet = this.activeSheet;

        if ('colHeaders' in settings) {
            sheet.colHeaders = settings.colHeaders;
        }
        if ('rowHeaders' in settings) {
            sheet.rowHeaders = settings.rowHeaders;
        }
        if (settings.data) {
            sheet.loadData(settings.data);
        }
        if (settings.rowHeights !== undefined) {
            if (typeof settings.rowHeights === 'number') {
                const count = sheet.rowColManager.allocatedRowCount || 100;
                sheet.rowColManager.ensureSize(count, 0);
                for (let r = 0; r < count; r++) {
                    sheet.rowColManager.setRowHeight(r, settings.rowHeights);
                }
            } else if (Array.isArray(settings.rowHeights)) {
                sheet.rowColManager.ensureSize(settings.rowHeights.length, 0);
                for (let r = 0; r < settings.rowHeights.length; r++) {
                    sheet.rowColManager.setRowHeight(r, settings.rowHeights[r]);
                }
            }
        }
        if (settings.colWidths !== undefined) {
            if (typeof settings.colWidths === 'number') {
                const count = sheet.rowColManager.allocatedColCount || 26;
                sheet.rowColManager.ensureSize(0, count);
                for (let c = 0; c < count; c++) {
                    sheet.rowColManager.setColWidth(c, settings.colWidths);
                }
            } else if (Array.isArray(settings.colWidths)) {
                sheet.rowColManager.ensureSize(0, settings.colWidths.length);
                for (let c = 0; c < settings.colWidths.length; c++) {
                    sheet.rowColManager.setColWidth(c, settings.colWidths[c]);
                }
            }
        }
        if (settings.mergeCells && Array.isArray(settings.mergeCells)) {
            for (const m of settings.mergeCells) {
                if (m.row !== undefined && m.col !== undefined &&
                    m.rowspan !== undefined && m.colspan !== undefined) {
                    sheet.mergeCells(m.row, m.col, m.row + m.rowspan - 1, m.col + m.colspan - 1);
                }
            }
        }
        if (settings.conditionalStyles && Array.isArray(settings.conditionalStyles)) {
            for (const cs of settings.conditionalStyles) {
                if (cs.range && cs.condition && cs.style) {
                    const styleId = stylePool.getStyleId(cs.style);
                    sheet.addConditionalRule(cs.range, cs.condition, styleId);
                }
            }
        }

        this.render();
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