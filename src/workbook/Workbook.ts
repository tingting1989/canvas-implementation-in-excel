import { Sheet } from "./Sheet";
import { RenderEngine } from "../render/RenderEngine";
import { EditorManager } from "../editor/EditorManager";
import { EventHandler } from "../core/EventHandler";
import { isFunction, isObject } from "../utils/helper";
import { PluginManager } from "../plugins/index";
import { BasePlugin } from "../plugins/BasePlugin";
import { CONFIG } from "../constants/config";
import { SettingsApplier } from "./managers/SettingsApplier";
import { SHEET_EVENTS } from "../constants/sheetEvents";
import { HOOKS } from "../constants/hookNames";
import type { StyleObject } from "./interfaces/ISheet";

/**
 * 待加载插件（按名称）
 */
interface PendingPluginByName {
    type: "name";
    name: string;
    options: Record<string, unknown>;
}

/**
 * 待加载插件（按类）
 */
interface PendingPluginByClass {
    type: "class";
    PluginClass: typeof BasePlugin;
    options: Record<string, unknown>;
}

/** 待加载插件联合类型 */
type PendingPlugin = PendingPluginByName | PendingPluginByClass;

/**
 * 工作簿（Workbook）
 *
 * 顶层管理对象，作为 Facade 协调 Sheet、RenderEngine、EventHandler、
 * EditorManager、PluginManager 等子系统。
 *
 * 核心职责：
 * - 工作表生命周期管理（addSheet / removeSheet / switchTo）
 * - 渲染引擎初始化与协调
 * - 插件系统管理（loadPlugin / unloadPlugin）
 * - 钩子系统（addHook / runHooks / runHooksUntil）
 * - 样式 API 代理（setCellStyle / setRangeStyle / setDefaultStyle 等）
 * - 操作 API 代理（undo / redo / copy / paste / mergeCells 等）
 * - 配置应用（updateSettings / SettingsApplier）
 *
 * @class Workbook
 */
export class Workbook {
    #containerElement: HTMLElement | string;
    #initOptions: Record<string, unknown>;
    #pendingPlugins: PendingPlugin[] = [];
    #earlyHooks: Map<string, Function[]>;
    #boundSheets: Set<Sheet> = new Set();
    #defaultStyle: StyleObject | null = null;

    sheets: Map<string, Sheet> = new Map();
    activeSheet: Sheet | null = null;
    clipboard: unknown | null = null;
    renderEngine: RenderEngine | null = null;
    editor: EditorManager | null = null;
    eventHandler: EventHandler | null = null;
    pluginManager: PluginManager | null = null;
    formulaEngine: { astCache: Map<string, unknown> } | null = null;
    formulaBar: unknown | null = null;

    constructor(element: HTMLElement | string, options: Record<string, unknown> = {}) {
        this.#earlyHooks = new Map();
        this.#containerElement = element;
        this.#initOptions = options;

        const autoInit = options.autoInit !== false;

        if (autoInit) {
            this.initRender();
            this.render();
        }
    }

    /**
     * 静态注册插件类（全局）
     * @param name - 插件名称
     * @param PluginClass - 插件类
     */
    static registerPlugin(name: string, PluginClass: typeof BasePlugin): void {
        PluginManager.register(name, PluginClass);
    }

    /** 静态反注册插件类（全局） @param name - 插件名称 */
    static unregisterPlugin(name: string): void {
        PluginManager.unregister(name);
    }

    /**
     * 按名称加载插件
     *
     * 若 PluginManager 尚未初始化，暂存到 pendingPlugins 队列。
     *
     * @param name - 插件名称
     * @param options - 插件选项
     * @returns 插件实例，暂存时返回 null
     */
    loadPlugin(name: string, options: Record<string, unknown> = {}): unknown | null {
        if (!this.pluginManager) {
            this.#pendingPlugins.push({ type: "name", name, options });
            return null;
        }
        return this.pluginManager.loadPlugin(name, options);
    }

    /**
     * 按类加载插件
     * @param PluginClass - 插件类
     * @param options - 插件选项
     * @returns 插件实例，暂存时返回 null
     */
    loadPluginClass(PluginClass: typeof BasePlugin, options: Record<string, unknown> = {}): unknown | null {
        if (!this.pluginManager) {
            this.#pendingPlugins.push({ type: "class", PluginClass, options });
            return null;
        }
        return this.pluginManager.loadPluginClass(PluginClass, options);
    }

    unloadPlugin(name: string): void {
        this.pluginManager?.unloadPlugin(name);
    }

    getPlugin(name: string): unknown | null {
        return this.pluginManager?.getPlugin(name) ?? null;
    }

    enablePlugin(name: string): void {
        this.pluginManager?.enablePlugin(name);
    }

    disablePlugin(name: string): void {
        this.pluginManager?.disablePlugin(name);
    }

    /**
     * 初始化渲染引擎及所有子系统
     *
     * 处理流程：
     * 1. 创建工作表（从配置或默认）
     * 2. 创建 RenderEngine
     * 3. 创建 EditorManager / EventHandler / PluginManager
     * 4. 绑定工作表事件到渲染引擎
     * 5. 刷新待加载插件
     * 6. 应用初始化选项
     * 7. 设置滚动回调
     * 8. 设置工作表标签栏
     * 9. 触发 WORKBOOK_INIT 事件
     */
    initRender(): void {
        if (this.renderEngine) return;

        const opts = this.#initOptions;
        if (Array.isArray(opts?.sheets) && (opts.sheets as unknown[]).length > 0) {
            this.#initSheetsFromConfig(opts.sheets as Record<string, unknown>[]);
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

        this.activeSheet?.bus?.emit(SHEET_EVENTS.WORKBOOK_INIT, [this], { source: "Workbook" });
    }

    #initSheetsFromConfig(sheetsConfig: Record<string, unknown>[]): void {
        for (const config of sheetsConfig) {
            const name = (config.name as string) || this.#generateSheetName();
            this.addSheet(name);
        }
    }

    #ensureDefaultSheet(): void {
        if (this.sheets.size === 0) {
            this.addSheet((this.#initOptions?.sheetName as string) || `${CONFIG.DEFAULT_SHEET_NAME}1`);
        }
    }

    #createRenderEngine(): void {
        this.renderEngine = new RenderEngine(this.#containerElement);
        const opts = this.#initOptions;
        if (opts?.width != null || opts?.height != null) {
            this.renderEngine.setCanvasSize(opts.width as number, opts.height as number);
        }
    }

    #createSubSystems(): void {
        this.editor = new EditorManager(this.renderEngine!, this.activeSheet!);
        this.eventHandler = new EventHandler(this.activeSheet!, this.renderEngine!, this.editor, null);
        this.eventHandler.setHookContext(this);
        this.editor.setViewport(this.eventHandler.viewport);
        this.editor.setCanvasContext(this.eventHandler.canvasContext);
        this.pluginManager = new PluginManager(this);

        this.#flushEarlyHooks();
    }

    #flushEarlyHooks(): void {
        if (!this.eventHandler || this.#earlyHooks.size === 0) return;

        for (const [hookName, callbacks] of this.#earlyHooks) {
            for (const callback of callbacks) {
                this.eventHandler.addHook(hookName, callback as (...args: unknown[]) => unknown);
            }
        }

        this.#earlyHooks.clear();
    }

    #linkSheetsToRenderEngine(): void {
        for (const sheet of this.sheets.values()) {
            this.#bindSheetEvents(sheet);
        }
    }

    #bindSheetEvents(sheet: Sheet): void {
        if (this.#boundSheets.has(sheet)) return;
        this.#boundSheets.add(sheet);

        const bus = sheet.bus;

        bus.on(SHEET_EVENTS.INVALIDATE_ALL, () => {
            this.renderEngine?.invalidateAll();
        });

        bus.on(SHEET_EVENTS.INVALIDATE_CELL, (envelope) => {
            const { r, c } = envelope.payload as { r: number; c: number };
            this.renderEngine?.invalidateCell(r, c);
        });

        bus.on(SHEET_EVENTS.RENDER_REQUEST, () => {
            this.renderEngine?.render(sheet);
        });

        bus.on(SHEET_EVENTS.FORMULA_SET, (envelope) => {
            if (this.formulaEngine) {
                const { r, c, formula } = envelope.payload as { r: number; c: number; formula: string };
                return (this.formulaEngine as unknown as { setFormula: (s: Sheet, r: number, c: number, f: string) => unknown }).setFormula(
                    sheet,
                    r,
                    c,
                    formula,
                );
            }
            return undefined;
        });

        bus.on(SHEET_EVENTS.FORMULA_REMOVE, (envelope) => {
            const { r, c } = envelope.payload as { r: number; c: number };
            (this.formulaEngine as unknown as { removeFormula: (s: Sheet, r: number, c: number) => void } | null)?.removeFormula(sheet, r, c);
        });

        bus.on(SHEET_EVENTS.CELL_CHANGED, (envelope) => {
            const { r, c } = envelope.payload as { r: number; c: number };
            (this.formulaEngine as unknown as { onCellChanged: (s: Sheet, r: number, c: number) => void } | null)?.onCellChanged(sheet, r, c);
        });

        bus.on(SHEET_EVENTS.DATA_CLEARED, (envelope) => {
            const { changes } = envelope.payload as { changes: Array<{ row: number; col: number }> };

            if (this.formulaEngine && changes.length > 0) {
                const fe = this.formulaEngine as unknown as { onCellChanged: (s: Sheet, r: number, c: number) => void };
                for (const { row, col } of changes) {
                    fe.onCellChanged(sheet, row, col);
                }
            }
        });

        bus.on(SHEET_EVENTS.UNDO, () => {
            (this.formulaEngine as unknown as { recalculateAll: (s: Sheet) => void } | null)?.recalculateAll(sheet);
        });

        bus.on(SHEET_EVENTS.REDO, () => {
            (this.formulaEngine as unknown as { recalculateAll: (s: Sheet) => void } | null)?.recalculateAll(sheet);
        });

        bus.on(SHEET_EVENTS.GET_CLIPBOARD, () => {
            return this.clipboard;
        });

        bus.on(SHEET_EVENTS.GET_PLUGIN, (envelope) => {
            const { name } = envelope.payload as { name: string };
            return this.getPlugin(name);
        });
    }

    #setupScrollCallback(): void {
        this.renderEngine!.onScrollCallback = () => {
            const activeEditor = this.editor?.getActiveEditor();
            if (!activeEditor || activeEditor.activeRow < 0) return;

            const { activeRow: row, activeCol: col } = activeEditor;
            const dpr = window.devicePixelRatio || 1;
            const tabH = CONFIG.SHEET_TAB_HEIGHT;
            const canvasW = this.renderEngine!.canvas.width / dpr;
            const canvasH = this.renderEngine!.canvas.height / dpr;

            const viewport = this.eventHandler?.viewport as {
                isCellVisible: (r: number, c: number, w: number, h: number, t: number) => boolean;
            } | null;
            const visible = viewport ? viewport.isCellVisible(row, col, canvasW, canvasH, tabH) : true;

            if (visible) {
                (activeEditor as unknown as { restoreFromScroll: () => void }).restoreFromScroll();
            } else {
                (activeEditor as unknown as { hideForScroll: () => void }).hideForScroll();
            }
        };
    }

    #setupSheetTabBar(): void {
        const tabBar = this.renderEngine!.sheetTabBar;
        tabBar.workbook = this;

        tabBar.onSwitch = (name: string) => {
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

        tabBar.onRemove = (name: string) => {
            this.removeSheet(name);
            tabBar.refresh();
        };

        tabBar.onRename = (oldName: string, newName: string) => {
            const success = this.renameSheet(oldName, newName);
            tabBar.refresh();
            return success;
        };

        tabBar.refresh();
    }

    #generateSheetName(): string {
        let idx = this.sheets.size + 1;
        while (this.sheets.has(`${CONFIG.DEFAULT_SHEET_NAME}${idx}`)) idx++;
        return `${CONFIG.DEFAULT_SHEET_NAME}${idx}`;
    }

    #applyInitOptions(): void {
        const opts = this.#initOptions;
        if (!opts || Object.keys(opts).length === 0) return;

        if (Array.isArray(opts.sheets) && (opts.sheets as unknown[]).length > 0) {
            this.#applySheetsConfig(opts);
        }

        this.#loadInitPlugins(opts);
        this.#loadInitHooks(opts);

        if (isFunction(opts.afterInit)) {
            (opts.afterInit as (wb: Workbook) => void)(this);
        }
    }

    #applySheetsConfig(opts: Record<string, unknown>): void {
        if (opts.defaultStyle) {
            this.#defaultStyle = opts.defaultStyle as StyleObject;
        }

        for (const sheetConfig of opts.sheets as Record<string, unknown>[]) {
            const name = (sheetConfig.name as string) || this.#generateSheetName();
            const sheet = this.sheets.get(name);
            if (!sheet) continue;

            const effectiveDefaultStyle = this.#resolveDefaultStyle(sheetConfig.defaultStyle as StyleObject | undefined);

            const settings = { ...opts, ...sheetConfig };
            if (effectiveDefaultStyle) {
                settings.defaultStyle = effectiveDefaultStyle;
            }
            delete settings.sheets;
            SettingsApplier.apply({ sheet, renderEngine: this.renderEngine, settings });
        }
    }

    #resolveDefaultStyle(sheetDefaultStyle?: StyleObject): StyleObject | null {
        if (!this.#defaultStyle && !sheetDefaultStyle) return null;
        if (!this.#defaultStyle) return sheetDefaultStyle ?? null;
        if (!sheetDefaultStyle) return this.#defaultStyle;
        return { ...this.#defaultStyle, ...sheetDefaultStyle };
    }

    #loadInitPlugins(opts: Record<string, unknown>): void {
        if (!Array.isArray(opts.plugins)) return;
        const pluginOptions = (opts.pluginOptions || {}) as Record<string, unknown>;
        for (const name of opts.plugins as string[]) {
            this.loadPlugin(name, (pluginOptions[name] || {}) as Record<string, unknown>);
        }
    }

    #loadInitHooks(opts: Record<string, unknown>): void {
        if (!opts.hooks || !isObject(opts.hooks)) return;
        for (const [hookName, callback] of Object.entries(opts.hooks as Record<string, unknown>)) {
            if (isFunction(callback)) {
                this.addHook(hookName, callback as (...args: unknown[]) => unknown);
            }
        }
    }

    #flushPendingPlugins(): void {
        for (const pending of this.#pendingPlugins) {
            if (pending.type === "name") {
                this.pluginManager!.loadPlugin(pending.name, pending.options);
            } else {
                this.pluginManager!.loadPluginClass(pending.PluginClass, pending.options);
            }
        }
        this.#pendingPlugins = [];
    }

    /**
     * 添加工作表
     *
     * 触发 BEFORE_SHEET_ADD / AFTER_SHEET_ADD 钩子。
     *
     * @param name - 工作表名称
     * @returns 新工作表，被钩子取消返回 null
     */
    addSheet(name: string): Sheet | null {
        const cancelled = this.runHooksUntil(HOOKS.BEFORE_SHEET_ADD, name);
        if (cancelled === false) return null;

        const sheet = new Sheet(name);
        if (this.renderEngine) this.#bindSheetEvents(sheet);

        const opts = this.#initOptions;

        sheet.rowColManager.ensureSize(
            (opts?.startRows as number) || CONFIG.DEFAULT_START_ROWS,
            (opts?.startCols as number) || CONFIG.DEFAULT_START_COLS,
        );

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
     * 删除工作表
     *
     * 至少保留一个工作表。触发 BEFORE_SHEET_REMOVE / AFTER_SHEET_REMOVE 钩子。
     *
     * @param name - 工作表名称
     * @returns 是否删除成功
     */
    removeSheet(name: string): boolean {
        if (!this.sheets.has(name) || this.sheets.size <= 1) return false;

        const cancelled = this.runHooksUntil(HOOKS.BEFORE_SHEET_REMOVE, name);
        if (cancelled === false) return false;

        const removed = this.sheets.get(name)!;
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
     *
     * @param oldName - 原名称
     * @param newName - 新名称
     * @returns 是否重命名成功
     */
    renameSheet(oldName: string, newName: string): boolean {
        if (!this.sheets.has(oldName)) return false;
        newName = (newName || "").trim();
        if (!newName || oldName === newName || this.sheets.has(newName)) return false;

        const cancelled = this.runHooksUntil(HOOKS.BEFORE_SHEET_RENAME, oldName, newName);
        if (cancelled === false) return false;

        const sheet = this.sheets.get(oldName)!;
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
     *
     * 触发 BEFORE_SHEET_SWITCH / AFTER_SHEET_SWITCH 钩子，
     * 并在原工作表上触发 SHEET_SWITCHED 事件。
     *
     * @param name - 工作表名称
     */
    switchTo(name: string): void {
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

            this.renderEngine.scrollMgr?.setScrollPosition(0, 0);
            this.renderEngine.invalidateAll();
        }
        this.render();
        this.#refreshTabBar();

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

        this.runHooks(HOOKS.AFTER_SHEET_SWITCH, previousSheet, sheet);
    }

    /** 获取当前活动工作表 @returns 活动工作表或 null */
    getActiveSheet(): Sheet | null {
        return this.activeSheet;
    }

    /** 渲染当前活动工作表 */
    render(): void {
        if (this.renderEngine && this.activeSheet) {
            this.renderEngine.render(this.activeSheet);
        }
    }

    copy(): void {
        const plugin = this.getPlugin("copyPaste") as { copy: () => void } | null;
        if (plugin) {
            plugin.copy();
        } else if (this.clipboard && this.activeSheet) {
            (this.clipboard as { copy: (s: Sheet) => void }).copy(this.activeSheet);
        }
    }

    paste(): void {
        const plugin = this.getPlugin("copyPaste") as { paste: () => void } | null;
        if (plugin) {
            plugin.paste();
        } else if (this.clipboard && this.activeSheet) {
            (this.clipboard as { paste: (s: Sheet) => void }).paste(this.activeSheet);
            this.render();
        }
    }

    undo(): void {
        this.#withActiveSheet((s) => {
            s.undo();
            this.render();
        });
    }

    redo(): void {
        this.#withActiveSheet((s) => {
            s.redo();
            this.render();
        });
    }

    disableCell(): void {
        this.#withActiveSheet((s) => {
            s.disableCell(...s.selection.getActive());
            this.render();
        });
    }

    enableCell(): void {
        this.#withActiveSheet((s) => {
            s.enableCell(...s.selection.getActive());
            this.render();
        });
    }

    mergeCells(topRow: number, topCol: number, bottomRow: number, bottomCol: number): boolean {
        return this.#withActiveSheet((s) => {
            const ok = s.mergeCells(topRow, topCol, bottomRow, bottomCol);
            if (ok) this.render();
            return ok;
        }, false);
    }

    unmergeCells(): boolean {
        return this.#withActiveSheet((s) => {
            const ok = s.unmergeCells(...s.selection.getActive());
            if (ok) this.render();
            return ok;
        }, false);
    }

    insertRow(atRow?: number): void {
        this.#withActiveSheet((s) => {
            s.insertRow(atRow ?? s.selection.getActive()[0]);
            this.render();
        });
    }

    insertCol(atCol?: number): void {
        this.#withActiveSheet((s) => {
            s.insertCol(atCol ?? s.selection.getActive()[1]);
            this.render();
        });
    }

    deleteRow(atRow?: number): void {
        this.#withActiveSheet((s) => {
            s.deleteRow(atRow ?? s.selection.getActive()[0]);
            this.render();
        });
    }

    deleteCol(atCol?: number): void {
        this.#withActiveSheet((s) => {
            s.deleteCol(atCol ?? s.selection.getActive()[1]);
            this.render();
        });
    }

    /**
     * 添加钩子
     *
     * 若 EventHandler 尚未初始化，暂存到 earlyHooks。
     *
     * @param hookName - 钩子名称
     * @param callback - 回调函数
     */
    addHook(hookName: string, callback: (...args: unknown[]) => unknown): void {
        if (this.eventHandler) {
            this.eventHandler.addHook(hookName, callback);
        } else {
            if (!this.#earlyHooks.has(hookName)) {
                this.#earlyHooks.set(hookName, []);
            }
            this.#earlyHooks.get(hookName)!.push(callback);
        }
    }

    /**
     * 添加一次性钩子（触发一次后自动移除）
     * @param hookName - 钩子名称
     * @param callback - 回调函数
     */
    addHookOnce(hookName: string, callback: (...args: unknown[]) => unknown): void {
        if (this.eventHandler) {
            this.eventHandler.addHookOnce(hookName, callback);
        } else {
            const onceCallback = (...args: unknown[]) => {
                callback(...args);
                this.removeHook(hookName, onceCallback);
            };
            this.addHook(hookName, onceCallback);
        }
    }

    removeHook(hookName: string, callback: (...args: unknown[]) => unknown): void {
        if (this.eventHandler) {
            this.eventHandler.removeHook(hookName, callback);
        } else {
            const callbacks = this.#earlyHooks.get(hookName);
            if (callbacks) {
                const index = callbacks.indexOf(callback);
                if (index > -1) {
                    callbacks.splice(index, 1);
                }
            }
        }
    }

    clearHook(hookName: string): void {
        if (this.eventHandler) {
            this.eventHandler.clearHook(hookName);
        } else {
            this.#earlyHooks.delete(hookName);
        }
    }

    hasHook(hookName: string): boolean {
        return this.eventHandler?.hasHook(hookName) || false;
    }

    runHooks(hookName: string, ...args: unknown[]): unknown {
        return this.eventHandler?.runHooks(hookName, ...args);
    }

    runHooksUntil(hookName: string, ...args: unknown[]): unknown {
        if (!this.eventHandler) return undefined;
        return this.eventHandler.runHooksUntil(hookName, ...args);
    }

    /**
     * 更新配置（应用到当前活动工作表）
     * @param settings - 配置对象
     */
    updateSettings(settings: Record<string, unknown> = {}): void {
        this.#withActiveSheet((s) => {
            if (settings.defaultStyle) {
                this.#defaultStyle = settings.defaultStyle as StyleObject;
            }
            SettingsApplier.apply({ sheet: s, renderEngine: this.renderEngine, settings });
            this.render();
        });
    }

    setCellStyle(row: number, col: number, styleObj: StyleObject): void {
        this.#withActiveSheet((s) => {
            s.setCellStyle(row, col, styleObj);
            this.render();
        });
    }

    setRangeStyle(range: { topRow: number; topCol: number; bottomRow: number; bottomCol: number }, styleObj: StyleObject): void {
        this.#withActiveSheet((s) => {
            s.setRangeStyle(range, styleObj);
            this.render();
        });
    }

    getCellStyle(row: number, col: number): StyleObject {
        return this.#withActiveSheet((s) => s.getCellStyle(row, col), {} as StyleObject);
    }

    setDefaultStyle(styleObj: StyleObject): void {
        this.#defaultStyle = styleObj;
        for (const sheet of this.sheets.values()) {
            sheet.setDefaultStyle(styleObj);
        }
        this.render();
    }

    getDefaultStyle(): StyleObject {
        return this.#defaultStyle || this.#withActiveSheet((s) => s.getDefaultStyle(), {} as StyleObject);
    }

    setRowStyle(row: number, styleObj: StyleObject): void {
        this.#withActiveSheet((s) => {
            s.setRowStyle(row, styleObj);
            this.render();
        });
    }

    setColStyle(col: number, styleObj: StyleObject): void {
        this.#withActiveSheet((s) => {
            s.setColStyle(col, styleObj);
            this.render();
        });
    }

    clearCellStyle(row: number, col: number): void {
        this.#withActiveSheet((s) => {
            s.clearCellStyle(row, col);
            this.render();
        });
    }

    clearRowStyle(row: number): void {
        this.#withActiveSheet((s) => {
            s.clearRowStyle(row);
            this.render();
        });
    }

    clearColStyle(col: number): void {
        this.#withActiveSheet((s) => {
            s.clearColStyle(col);
            this.render();
        });
    }

    clearRangeStyle(range: { topRow: number; topCol: number; bottomRow: number; bottomCol: number }): void {
        this.#withActiveSheet((s) => {
            s.clearRangeStyle(range);
            this.render();
        });
    }

    batchStyleUpdate(fn: (sheet: Sheet) => void): void {
        this.#withActiveSheet((s) => {
            s.batchStyleUpdate(fn);
            this.render();
        });
    }

    clearActiveSheetData(options: { skipHistory?: boolean } = {}): { changes: unknown[]; clearedCount: number } | false | undefined {
        return this.#withActiveSheet((sheet) => {
            const cancelled = this.runHooksUntil(HOOKS.BEFORE_CLEAR_DATA, { sheet });
            if (cancelled === false) {
                return false;
            }

            const result = sheet.clearData(options);

            this.runHooks(HOOKS.AFTER_CLEAR_DATA, {
                sheet,
                changes: result.changes,
                clearedCount: result.clearedCount,
            });

            this.render();

            return result;
        });
    }

    clearRangeData(
        topRow: number,
        topCol: number,
        bottomRow: number,
        bottomCol: number,
        options: { skipHistory?: boolean } = {},
    ): { changes: unknown[]; clearedCount: number } | false | undefined {
        return this.#withActiveSheet((sheet) => {
            const range = { topRow, topCol, bottomRow, bottomCol };

            const cancelled = this.runHooksUntil(HOOKS.BEFORE_CLEAR_DATA, { sheet, range });
            if (cancelled === false) {
                return false;
            }

            const result = sheet.clearRange(topRow, topCol, bottomRow, bottomCol, options);

            this.runHooks(HOOKS.AFTER_CLEAR_DATA, {
                sheet,
                range,
                changes: result.changes,
                clearedCount: result.clearedCount,
            });

            this.render();

            return result;
        });
    }

    clearAllSheetsData(options: { skipHistory?: boolean } = {}): {
        totalCleared: number;
        results: Array<{ sheetName: string; clearedCount: number; success: boolean }>;
        blockedSheets: string[];
    } {
        const results: Array<{ sheetName: string; clearedCount: number; success: boolean }> = [];
        let totalCleared = 0;
        const blockedSheets: string[] = [];

        for (const [name, sheet] of this.sheets) {
            const cancelled = this.runHooksUntil(HOOKS.BEFORE_CLEAR_DATA, { sheet });

            if (cancelled === false) {
                results.push({
                    sheetName: name,
                    clearedCount: 0,
                    success: false,
                });
                blockedSheets.push(name);
                continue;
            }

            const { clearedCount } = sheet.clearData(options);

            this.runHooks(HOOKS.AFTER_CLEAR_DATA, {
                sheet,
                changes: [],
                clearedCount,
            });

            results.push({
                sheetName: name,
                clearedCount,
                success: true,
            });
            totalCleared += clearedCount;
        }

        this.render();

        return {
            totalCleared,
            results,
            blockedSheets,
        };
    }

    exportAsString(format: string, options?: unknown): string {
        return (
            (this.getPlugin("exportFile") as { exportAsString?: (f: string, o?: unknown) => string } | null)?.exportAsString?.(format, options) ?? ""
        );
    }

    exportAsBlob(format: string, options?: unknown): Blob | null {
        return (this.getPlugin("exportFile") as { exportAsBlob?: (f: string, o?: unknown) => Blob } | null)?.exportAsBlob?.(format, options) ?? null;
    }

    downloadFile(format: string, options?: unknown): void {
        (this.getPlugin("exportFile") as { downloadFile?: (f: string, o?: unknown) => void } | null)?.downloadFile?.(format, options);
    }

    /**
     * 销毁工作簿
     *
     * 依次销毁：插件管理器 → 事件处理器 → 编辑器 → 渲染引擎，
     * 并清空工作表集合。
     */
    destroy(): void {
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

    #activateIfFirst(sheet: Sheet): void {
        if (!this.activeSheet) {
            this.activeSheet = sheet;
            if (this.editor) this.editor.sheet = sheet;
            if (this.eventHandler) this.eventHandler.sheet = sheet;
        }
    }

    #refreshTabBar(): void {
        this.renderEngine?.sheetTabBar?.refresh();
    }

    /**
     * 以当前活动工作表为上下文执行回调
     *
     * @param fn - 回调函数
     * @param defaultValue - 无活动工作表时的默认返回值
     * @returns 回调返回值或 defaultValue
     */
    #withActiveSheet<T>(fn: (sheet: Sheet) => T, defaultValue?: T): T | undefined {
        if (!this.activeSheet) return defaultValue;
        return fn(this.activeSheet);
    }
}
