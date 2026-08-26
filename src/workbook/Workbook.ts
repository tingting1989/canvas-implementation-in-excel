import { Sheet } from "./Sheet";
import { RenderEngine } from "../render/RenderEngine";
import { EditorManager } from "../editor/EditorManager";
import { EventHandler } from "../core/EventHandler";
import { isFunction, isObject } from "../utils/helper";
import { PluginManager } from "../plugins/index";
import { BasePlugin } from "../plugins/base/BasePlugin";
import { CONFIG } from "../constants/config";
import { SettingsApplier } from "./managers/SettingsApplier";
import { SHEET_EVENTS } from "../constants/sheetEvents";
import { HOOKS } from "../constants/hookNames";
import type { StyleObject, ISheet } from "./interfaces/ISheet";

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
    /**
     * @private 私有静态字段 - Workbook 实例自增计数器
     *
     * 每次构造 Workbook 时递增，用于生成唯一实例 ID。
     * ID 格式为 "cs-wb-{n}"（如 "cs-wb-0", "cs-wb-1"），
     * 作为 CSS 类名注入到 CellEditor DOM 元素上，
     * 供 InputDetector 在多实例共存时精确判断编辑器归属。
     */
    static #instanceCounter: number = 0;

    /**
     * @readonly Workbook 实例唯一标识
     *
     * 格式："cs-wb-{n}"（n 从 0 自增）
     *
     * 用途：
     * 1. **编辑器归属标记**：CellEditor.createEditor() 将此 ID 作为 CSS 类名
     *    添加到编辑器 DOM 元素，InputDetector 据此判断焦点编辑器属于哪个 Workbook
     * 2. **调试辅助**：DOM 中可直接看到编辑器归属（如 `class="cs-cell-editor cs-wb-0"`）
     * 3. **多实例管理**：日志、插件等可通过 ID 区分不同 Workbook 实例
     *
     * @example
     * const wb1 = new Workbook(container1, options);
     * console.log(wb1.id); // "cs-wb-0"
     *
     * const wb2 = new Workbook(container2, options);
     * console.log(wb2.id); // "cs-wb-1"
     */
    readonly id: string = `cs-wb-${Workbook.#instanceCounter++}`;

    /**
     * DOM 容器元素或选择器
     * 用于挂载渲染引擎的 Canvas 画布
     */
    #containerElement: HTMLElement | string;

    /**
     * 初始化选项配置
     * 保存用户传入的配置，用于延迟应用
     */
    #initOptions: Record<string, unknown>;

    /**
     * 待加载插件队列
     * 在 PluginManager 初始化前，loadPlugin 调用暂存于此
     */
    #pendingPlugins: PendingPlugin[] = [];

    /**
     * 早期钩子暂存区
     * 在 EventHandler 初始化前，addHook 调用暂存于此
     */
    #earlyHooks: Map<string, Function[]>;

    /**
     * 已绑定事件的工作表集合
     * 防止重复绑定同一工作表的事件监听器
     */
    #boundSheets: Set<Sheet> = new Set();

    /** 全局默认样式对象（应用到所有工作表） */
    #defaultStyle: StyleObject | null = null;

    /** 工作表集合（名称 → Sheet 实例） */
    sheets: Map<string, Sheet> = new Map();

    /** 当前活动工作表 */
    activeSheet: Sheet | null = null;

    /** 剪贴板对象（内置复制粘贴功能） */
    clipboard: unknown | null = null;

    /** 渲染引擎实例 */
    renderEngine: RenderEngine | null = null;

    /** 编辑器管理器实例 */
    editor: EditorManager | null = null;

    /** 事件处理器实例 */
    eventHandler: EventHandler | null = null;

    /** 插件管理器实例 */
    pluginManager: PluginManager | null = null;

    /** 公式引擎实例（可选，由公式插件注入） */
    formulaEngine: { astCache: Map<string, unknown> } | null = null;

    /** 公式栏 UI 实例（可选，由公式栏插件注入） */
    formulaBar: unknown | null = null;

    /**
     * 创建 Workbook 实例
     *
     * @param element - DOM 容器元素或 CSS 选择器
     * @param options - 初始化选项
     * @param options.autoInit - 是否自动初始化（默认 true）
     * @param options.sheets - 工作表配置数组
     * @param options.defaultStyle - 全局默认样式
     * @param options.plugins - 插件名称数组
     * @param options.hooks - 钩子映射表
     * @param options.afterInit - 初始化完成回调
     */
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

    /**
     * 卸载插件
     *
     * @param name - 插件名称
     */
    unloadPlugin(name: string): void {
        this.pluginManager?.unloadPlugin(name);
    }

    /**
     * 获取已加载的插件实例
     *
     * @param name - 插件名称
     * @returns 插件实例，未找到返回 null
     */
    getPlugin(name: string): unknown | null {
        return this.pluginManager?.getPlugin(name) ?? null;
    }

    /**
     * 启用已加载的插件
     *
     * @param name - 插件名称
     */
    enablePlugin(name: string): void {
        this.pluginManager?.enablePlugin(name);
    }

    /**
     * 禁用已加载的插件
     *
     * @param name - 插件名称
     */
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
        this.eventHandler.workbookId = this.id;
        this.eventHandler.setHookContext(this);
        this.editor.setViewport(this.eventHandler.viewport);
        this.editor.setCanvasContext(this.eventHandler.canvasContext);
        this.editor.setWorkbookId(this.id);
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

    /**
     * 将所有工作表的事件绑定到渲染引擎
     *
     * 遍历工作表集合，为每个工作表调用 #bindSheetEvents。
     */
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

    /**
     * 设置滚动回调
     *
     * 当用户滚动时，检查活动编辑器所在单元格是否仍在可视区域内：
     * - 可见 → 恢复编辑器位置
     * - 不可见 → 隐藏编辑器
     */
    #setupScrollCallback(): void {
        this.renderEngine!.onScrollCallback = () => {
            const activeEditor = this.editor?.getActiveEditor();
            if (!activeEditor || activeEditor.activeRow < 0) return;

            const { activeRow: row, activeCol: col } = activeEditor!;
            const dpr = window.devicePixelRatio || 1;
            const tabH = CONFIG.SHEET_TAB_HEIGHT;
            const canvasW = this.renderEngine!.canvas!.width / dpr;
            const canvasH = this.renderEngine!.canvas!.height / dpr;

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

    /**
     * 设置工作表标签栏
     *
     * 绑定标签栏的回调函数：
     * - onSwitch → 切换工作表并滚动到对应标签
     * - onAdd → 添加新工作表
     * - onRemove → 删除工作表
     * - onRename → 重命名工作表
     * - onCopy → 复制工作表
     * - onHide → 隐藏工作表
     * - onUnhide → 取消隐藏工作表
     */
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

        tabBar.onCopy = (name: string) => {
            this.copySheet(name);
            tabBar.refresh();
        };

        tabBar.onHide = (name: string) => {
            this.hideSheet(name);
            tabBar.refresh();
        };

        tabBar.onUnhide = (name: string) => {
            this.unhideSheet(name);
            tabBar.refresh();
        };

        tabBar.refresh();
    }

    /**
     * 生成唯一的工作表名称
     *
     * 格式：`SheetN`，N 从当前工作表数+1 开始递增，直到找到未使用的名称。
     *
     * @returns 唯一的工作表名称
     */
    #generateSheetName(): string {
        let idx = this.sheets.size + 1;
        while (this.sheets.has(`${CONFIG.DEFAULT_SHEET_NAME}${idx}`)) idx++;
        return `${CONFIG.DEFAULT_SHEET_NAME}${idx}`;
    }

    /**
     * 应用初始化选项
     *
     * 处理流程：
     * 1. 应用工作表配置（含默认样式）
     * 2. 加载初始化插件列表
     * 3. 注册初始化钩子
     * 4. 调用 afterInit 回调
     */
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

    /**
     * 应用工作表配置
     *
     * 为每个工作表配置项合并全局默认样式和工作表级默认样式，
     * 然后通过 SettingsApplier 应用到对应工作表。
     *
     * @param opts - 初始化选项
     */
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

    /**
     * 解析默认样式
     *
     * 合并全局默认样式和工作表级默认样式，工作表级优先。
     *
     * @param sheetDefaultStyle - 工作表级默认样式
     * @returns 合并后的样式对象，两者都无则返回 null
     */
    #resolveDefaultStyle(sheetDefaultStyle?: StyleObject): StyleObject | null {
        if (!this.#defaultStyle && !sheetDefaultStyle) return null;
        if (!this.#defaultStyle) return sheetDefaultStyle ?? null;
        if (!sheetDefaultStyle) return this.#defaultStyle;
        return { ...this.#defaultStyle, ...sheetDefaultStyle };
    }

    /**
     * 加载初始化插件列表
     *
     * 从 options.plugins 读取插件名称数组，
     * 从 options.pluginOptions 读取各插件的配置。
     *
     * @param opts - 初始化选项
     */
    #loadInitPlugins(opts: Record<string, unknown>): void {
        if (!Array.isArray(opts.plugins)) return;
        const pluginOptions = (opts.pluginOptions || {}) as Record<string, unknown>;
        for (const name of opts.plugins as string[]) {
            this.loadPlugin(name, (pluginOptions[name] || {}) as Record<string, unknown>);
        }
    }

    /**
     * 注册初始化钩子
     *
     * 从 options.hooks 读取钩子映射表，逐个注册到钩子系统。
     *
     * @param opts - 初始化选项
     */
    #loadInitHooks(opts: Record<string, unknown>): void {
        if (!opts.hooks || !isObject(opts.hooks)) return;
        for (const [hookName, callback] of Object.entries(opts.hooks as Record<string, unknown>)) {
            if (isFunction(callback)) {
                this.addHook(hookName, callback as (...args: unknown[]) => unknown);
            }
        }
    }

    /**
     * 刷新待加载插件队列
     *
     * 在 PluginManager 初始化后调用，将暂存的插件逐个加载。
     */
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
            this.switchTo(this.sheets.keys().next().value as string);
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

    copySheet(name: string): boolean {
        if (!this.sheets.has(name)) return false;

        const sourceSheet = this.sheets.get(name)!;
        const newName = this.#generateCopySheetName(name);

        const cancelled = this.runHooksUntil(HOOKS.BEFORE_SHEET_ADD, newName);
        if (cancelled === false) return false;

        const newSheet = new Sheet(newName);
        if (this.renderEngine) this.#bindSheetEvents(newSheet);

        newSheet.rowColManager.ensureSize(sourceSheet.rowColManager.rowCount, sourceSheet.rowColManager.colCount);

        for (let row = 0; row < sourceSheet.rowColManager.rowCount; row++) {
            for (let col = 0; col < sourceSheet.rowColManager.colCount; col++) {
                const cell = sourceSheet.cellDataAccessor?.get(row, col);
                if (cell && (cell.value !== undefined || cell.value !== null || cell.styleId !== undefined)) {
                    newSheet.setCell(row, col, cell.value, { styleId: cell.styleId });
                }
            }
        }

        if (this.#defaultStyle) {
            newSheet.setDefaultStyle(this.#defaultStyle);
        }

        this.sheets.set(newName, newSheet);
        this.#refreshTabBar();

        this.runHooks(HOOKS.AFTER_SHEET_ADD, newName, newSheet);

        this.switchTo(newName);
        return true;
    }

    hideSheet(name: string): boolean {
        if (!this.sheets.has(name)) return false;
        if (this.sheets.size <= 1) return false;

        const sheet = this.sheets.get(name)!;
        if (this.activeSheet === sheet) {
            const visibleSheets = [...this.sheets.entries()].filter(([, s]) => s.visible && s !== sheet);
            if (visibleSheets.length > 0) {
                this.switchTo(visibleSheets[0][0]);
            }
        }

        sheet.visible = false;
        this.#refreshTabBar();
        return true;
    }

    unhideSheet(name: string): boolean {
        if (!this.sheets.has(name)) return false;

        const sheet = this.sheets.get(name)!;
        if (sheet.visible) return false;

        sheet.visible = true;
        this.switchTo(name);
        this.#refreshTabBar();
        return true;
    }

    #generateCopySheetName(originalName: string): string {
        let idx = 1;
        let newName = `${originalName} (${idx})`;
        while (this.sheets.has(newName)) {
            idx++;
            newName = `${originalName} (${idx})`;
        }
        return newName;
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

    /**
     * 渲染当前活动工作表
     *
     * 将活动工作表的内容绘制到 Canvas 画布上。
     * 通常在数据变更后手动调用以刷新显示。
     */
    render(): void {
        if (this.renderEngine && this.activeSheet) {
            this.renderEngine.render(this.activeSheet);
        }
    }

    /**
     * 复制当前选中区域到剪贴板
     *
     * 优先使用 copyPaste 插件，回退到内置剪贴板对象。
     */
    copy(): void {
        const plugin = this.getPlugin("copyPaste") as { copy: () => void } | null;
        if (plugin) {
            plugin.copy();
        } else if (this.clipboard && this.activeSheet) {
            (this.clipboard as { copy: (s: Sheet) => void }).copy(this.activeSheet);
        }
    }

    /**
     * 从剪贴板粘贴到当前选中位置
     *
     * 优先使用 copyPaste 插件，回退到内置剪贴板对象。
     * 粘贴后自动触发重绘。
     */
    paste(): void {
        const plugin = this.getPlugin("copyPaste") as { paste: () => void } | null;
        if (plugin) {
            plugin.paste();
        } else if (this.clipboard && this.activeSheet) {
            (this.clipboard as { paste: (s: Sheet) => void }).paste(this.activeSheet);
            this.render();
        }
    }

    /**
     * 撤销上一步操作
     * 代理到活动工作表的 undo()，然后重绘
     */
    undo(): void {
        this.#withActiveSheet((s) => {
            s.undo();
            this.render();
        });
    }

    /**
     * 重做上一步撤销的操作
     * 代理到活动工作表的 redo()，然后重绘
     */
    redo(): void {
        this.#withActiveSheet((s) => {
            s.redo();
            this.render();
        });
    }

    /**
     * 禁用当前选中单元格（禁止编辑）
     * 操作后自动重绘
     */
    disableCell(): void {
        this.#withActiveSheet((s) => {
            s.disableCell(...s.selection.getActive());
            this.render();
        });
    }

    /**
     * 启用当前选中单元格（允许编辑）
     * 操作后自动重绘
     */
    enableCell(): void {
        this.#withActiveSheet((s) => {
            s.enableCell(...s.selection.getActive());
            this.render();
        });
    }

    /**
     * 合并指定区域的单元格
     *
     * @param topRow - 起始行
     * @param topCol - 起始列
     * @param bottomRow - 结束行
     * @param bottomCol - 结束列
     * @returns 是否合并成功
     */
    mergeCells(topRow: number, topCol: number, bottomRow: number, bottomCol: number): boolean {
        return this.#withActiveSheet((s) => {
            const ok = s.mergeCells(topRow, topCol, bottomRow, bottomCol);
            if (ok) this.render();
            return ok;
        }, false);
    }

    /**
     * 取消当前选中单元格的合并
     * @returns 是否取消合并成功
     */
    unmergeCells(): boolean {
        return this.#withActiveSheet((s) => {
            const ok = s.unmergeCells(...s.selection.getActive());
            if (ok) this.render();
            return ok;
        }, false);
    }

    /**
     * 在指定位置插入行
     *
     * @param atRow - 插入位置的行号，默认为当前选中行
     */
    insertRow(atRow?: number): void {
        this.#withActiveSheet((s) => {
            s.insertRow(atRow ?? s.selection.getActive()[0]);
            this.render();
        });
    }

    /**
     * 在指定位置插入列
     *
     * @param atCol - 插入位置的列号，默认为当前选中列
     */
    insertCol(atCol?: number): void {
        this.#withActiveSheet((s) => {
            s.insertCol(atCol ?? s.selection.getActive()[1]);
            this.render();
        });
    }

    /**
     * 删除指定行
     *
     * @param atRow - 要删除的行号，默认为当前选中行
     */
    deleteRow(atRow?: number): void {
        this.#withActiveSheet((s) => {
            s.deleteRow(atRow ?? s.selection.getActive()[0]);
            this.render();
        });
    }

    /**
     * 删除指定列
     *
     * @param atCol - 要删除的列号，默认为当前选中列
     */
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

    /**
     * 移除指定钩子回调
     *
     * @param hookName - 钩子名称
     * @param callback - 要移除的回调函数引用
     */
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

    /**
     * 清除指定钩子的所有回调
     *
     * @param hookName - 钩子名称
     */
    clearHook(hookName: string): void {
        if (this.eventHandler) {
            this.eventHandler.clearHook(hookName);
        } else {
            this.#earlyHooks.delete(hookName);
        }
    }

    /**
     * 检查指定钩子是否已注册
     *
     * @param hookName - 钩子名称
     * @returns 是否存在已注册的回调
     */
    hasHook(hookName: string): boolean {
        return this.eventHandler?.hasHook(hookName) || false;
    }

    /**
     * 触发指定钩子，执行所有已注册的回调
     *
     * @param hookName - 钩子名称
     * @param args - 传递给回调的参数
     * @returns 最后一个回调的返回值
     */
    runHooks(hookName: string, ...args: unknown[]): unknown {
        return this.eventHandler?.runHooks(hookName, ...args);
    }

    /**
     * 触发指定钩子，直到某个回调返回 false 时停止
     *
     * 用于实现可取消的操作（如 BEFORE_SHEET_ADD）。
     * 如果任何回调返回 false，整个操作应被取消。
     *
     * @param hookName - 钩子名称
     * @param args - 传递给回调的参数
     * @returns 第一个返回 false 的回调的返回值，或最后一个回调的返回值
     */
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

    /**
     * 设置单元格样式
     *
     * @param row - 行号
     * @param col - 列号
     * @param styleObj - 样式对象
     */
    setCellStyle(row: number, col: number, styleObj: StyleObject): void {
        this.#withActiveSheet((s) => {
            s.setCellStyle(row, col, styleObj);
            this.render();
        });
    }

    /**
     * 设置区域样式
     *
     * @param range - 单元格区域
     * @param styleObj - 样式对象
     */
    setRangeStyle(range: { topRow: number; topCol: number; bottomRow: number; bottomCol: number }, styleObj: StyleObject): void {
        this.#withActiveSheet((s) => {
            s.setRangeStyle(range, styleObj);
            this.render();
        });
    }

    /**
     * 获取单元格样式
     *
     * @param row - 行号
     * @param col - 列号
     * @returns 解析后的样式对象
     */
    getCellStyle(row: number, col: number): StyleObject {
        return this.#withActiveSheet((s) => s.getCellStyle(row, col), {} as StyleObject);
    }

    /**
     * 设置全局默认样式
     *
     * 应用到所有工作表的默认样式，并触发重绘。
     *
     * @param styleObj - 默认样式对象
     */
    setDefaultStyle(styleObj: StyleObject): void {
        this.#defaultStyle = styleObj;
        for (const sheet of this.sheets.values()) {
            sheet.setDefaultStyle(styleObj);
        }
        this.render();
    }

    /**
     * 获取全局默认样式
     *
     * @returns 默认样式对象
     */
    getDefaultStyle(): StyleObject {
        return this.#defaultStyle || this.#withActiveSheet((s) => s.getDefaultStyle(), {} as StyleObject);
    }

    /**
     * 设置行样式
     *
     * @param row - 行号
     * @param styleObj - 样式对象
     */
    setRowStyle(row: number, styleObj: StyleObject): void {
        this.#withActiveSheet((s) => {
            s.setRowStyle(row, styleObj);
            this.render();
        });
    }

    /**
     * 设置列样式
     *
     * @param col - 列号
     * @param styleObj - 样式对象
     */
    setColStyle(col: number, styleObj: StyleObject): void {
        this.#withActiveSheet((s) => {
            s.setColStyle(col, styleObj);
            this.render();
        });
    }

    /** 清除单元格样式 @param row - 行号 @param col - 列号 */
    clearCellStyle(row: number, col: number): void {
        this.#withActiveSheet((s) => {
            s.clearCellStyle(row, col);
            this.render();
        });
    }

    /** 清除行样式 @param row - 行号 */
    clearRowStyle(row: number): void {
        this.#withActiveSheet((s) => {
            s.clearRowStyle(row);
            this.render();
        });
    }

    /** 清除列样式 @param col - 列号 */
    clearColStyle(col: number): void {
        this.#withActiveSheet((s) => {
            s.clearColStyle(col);
            this.render();
        });
    }

    /**
     * 清除区域样式
     *
     * @param range - 单元格区域
     */
    clearRangeStyle(range: { topRow: number; topCol: number; bottomRow: number; bottomCol: number }): void {
        this.#withActiveSheet((s) => {
            s.clearRangeStyle(range);
            this.render();
        });
    }

    /**
     * 批量样式更新
     *
     * 在回调函数中批量执行样式操作，避免多次重绘。
     *
     * @param fn - 批量操作回调，接收 ISheet 接口
     */
    batchStyleUpdate(fn: (sheet: ISheet) => void): void {
        this.#withActiveSheet((s) => {
            s.batchStyleUpdate(fn);
            this.render();
        });
    }

    /**
     * 清除当前活动工作表的所有数据
     *
     * 触发 BEFORE_CLEAR_DATA / AFTER_CLEAR_DATA 钩子。
     *
     * @param options - 选项
     * @param options.skipHistory - 是否跳过历史记录（默认 false）
     * @returns 清除结果，被钩子取消返回 false
     */
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

    /**
     * 清除指定区域的数据
     *
     * 触发 BEFORE_CLEAR_DATA / AFTER_CLEAR_DATA 钩子。
     *
     * @param topRow - 起始行
     * @param topCol - 起始列
     * @param bottomRow - 结束行
     * @param bottomCol - 结束列
     * @param options - 选项
     * @param options.skipHistory - 是否跳过历史记录
     * @returns 清除结果，被钩子取消返回 false
     */
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

    /**
     * 清除所有工作表的数据
     *
     * 遍历每个工作表执行清除操作，支持钩子取消单个工作表的清除。
     *
     * @param options - 选项
     * @param options.skipHistory - 是否跳过历史记录
     * @returns 汇总结果，包含总清除数、各工作表结果、被阻止的工作表列表
     */
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

    /**
     * 导出为字符串
     *
     * 委托给 exportFile 插件处理。
     *
     * @param format - 导出格式（如 "csv", "tsv"）
     * @param options - 导出选项
     * @returns 导出的字符串内容
     */
    exportAsString(format: string, options?: unknown): string {
        return (
            (this.getPlugin("exportFile") as { exportAsString?: (f: string, o?: unknown) => string } | null)?.exportAsString?.(format, options) ?? ""
        );
    }

    /**
     * 导出为 Blob 对象
     *
     * 委托给 exportFile 插件处理。
     *
     * @param format - 导出格式（如 "xlsx", "csv"）
     * @param options - 导出选项
     * @returns Blob 对象，插件不可用时返回 null
     */
    exportAsBlob(format: string, options?: unknown): Blob | null {
        return (this.getPlugin("exportFile") as { exportAsBlob?: (f: string, o?: unknown) => Blob } | null)?.exportAsBlob?.(format, options) ?? null;
    }

    /**
     * 下载导出文件
     *
     * 委托给 exportFile 插件处理，触发浏览器文件下载。
     *
     * @param format - 导出格式
     * @param options - 导出选项
     */
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

    /**
     * 如果是第一个工作表，自动设为活动工作表
     *
     * @param sheet - 工作表实例
     */
    #activateIfFirst(sheet: Sheet): void {
        if (!this.activeSheet) {
            this.activeSheet = sheet;
            if (this.editor) this.editor.sheet = sheet;
            if (this.eventHandler) this.eventHandler.sheet = sheet;
        }
    }

    /**
     * 刷新工作表标签栏
     *
     * 通知标签栏组件重新读取工作表列表和活动状态，
     * 通常在工作表增删改后调用。
     */
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
    #withActiveSheet<T>(fn: (sheet: Sheet) => T, defaultValue?: T): T {
        if (!this.activeSheet) return defaultValue as T;
        return fn(this.activeSheet);
    }
}
