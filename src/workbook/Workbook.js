import { Sheet } from "./Sheet.js";
import { RenderEngine } from "@/render/RenderEngine";
import { EditorManager } from "@/editor/EditorManager";
import { EventHandler } from "@/core/EventHandler";
import { isFunction, isObject } from "@/utils/helper";
import { PluginManager } from "@/plugins";
import { CONFIG } from "@/constants/config";
import { SettingsApplier } from "./managers/SettingsApplier.js";
import { SHEET_EVENTS } from "@/constants/sheetEvents";
import { HOOKS } from "@/constants/hookNames";

/**
 * 工作簿（Workbook）
 *
 * 顶层管理对象，作为 Facade 协调 Sheet、RenderEngine、EventHandler、
 * EditorManager、PluginManager 等子系统。
 *
 * ## 核心职责
 *
 * 1. **工作表管理**：创建、删除、重命名、切换工作表
 * 2. **子系统协调**：初始化并关联渲染引擎、编辑器、事件处理器、插件管理器
 * 3. **插件系统**：提供插件注册、加载、卸载、启用、禁用接口
 * 4. **生命周期管理**：处理初始化、渲染、事件绑定、销毁等工作流
 * 5. **事件转发**：桥接工作表事件总线与全局钩子系统
 *
 * ## 插件系统
 *
 * | 方法                                    | 说明                       |
 * |-----------------------------------------|----------------------------|
 * | Workbook.registerPlugin(name, Class)    | 全局注册插件类             |
 * | Workbook.unregisterPlugin(name)         | 全局注销插件类             |
 * | workbook.loadPlugin(name, options)      | 加载已注册的插件           |
 * | workbook.loadPluginClass(Class, opts)   | 直接加载插件类             |
 * | workbook.getPlugin(name)                | 获取插件实例               |
 * | workbook.unloadPlugin(name)             | 卸载插件                   |
 * | workbook.enablePlugin(name)             | 启用插件                   |
 * | workbook.disablePlugin(name)            | 禁用插件                   |
 *
 * **延迟加载**：构造时若 PluginManager 尚未创建，loadPlugin / loadPluginClass
 * 会将请求推入 pending 队列，待 initRender() 完成后自动刷新。
 *
 * ## 工作表事件桥接（#bindSheetEvents）
 *
 * 将 Sheet 的事件总线事件转发到相关子系统：
 *
 * | 事件                | 目标子系统                | 说明                     |
 * |---------------------|---------------------------|--------------------------|
 * | INVALIDATE_ALL      | RenderEngine              | 标记全部瓦片需要重绘     |
 * | INVALIDATE_CELL     | RenderEngine              | 标记指定单元格需要重绘   |
 * | RENDER_REQUEST      | RenderEngine              | 请求立即渲染             |
 * | FORMULA_SET         | FormulaEngine             | 设置单元格公式           |
 * | FORMULA_REMOVE      | FormulaEngine             | 移除单元格公式           |
 * | CELL_CHANGED        | FormulaEngine             | 触发公式重计算           |
 * | DATA_CLEARED        | FormulaEngine             | 批量触发公式重计算       |
 * | UNDO / REDO         | FormulaEngine             | 撤销/重做后全量重算      |
 * | GET_CLIPBOARD       | ClipboardManager          | 获取剪贴板管理器引用     |
 * | GET_PLUGIN          | PluginManager             | 获取插件实例             |
 *
 * ## 钩子系统（Hooks）
 *
 * 支持 Early Hooks 机制：在 eventHandler 创建前通过 addHook() 注册的钩子
 * 会被缓存到 #earlyHooks，待 eventHandler 创建后自动应用。
 *
 * ## 设计模式
 *
 * 对齐 Handsontable 的 `new Handsontable(container, options)` 模式，
 * 构造时自动初始化（autoInit=true），也可手动控制初始化时机。
 *
 * @module workbook/Workbook
 * @see Sheet 工作表类，管理单个表格数据和状态
 * @see RenderEngine 渲染引擎，负责 Canvas 绘制
 * @see EditorManager 编辑器管理器，处理单元格编辑
 * @see EventHandler 事件处理器，管理用户交互
 * @see PluginManager 插件管理器，处理插件生命周期
 */
export class Workbook {
    /** @type {HTMLElement|string} 容器 DOM 元素或 Canvas 元素 ID */
    #containerElement;

    /** @type {object} 构造时传入的原始配置选项（供 initRender 延迟使用） */
    #initOptions;

    /**
     * 延迟加载插件队列
     *
     * 在 PluginManager 创建前调用 loadPlugin / loadPluginClass 时，
     * 请求会被推入此队列，待 initRender() 完成后由 #flushPendingPlugins() 统一加载。
     *
     * @type {Array<{type:"name"|"class", name?:string, PluginClass?:Function, options:object}>}
     */
    #pendingPlugins = [];

    /**
     * Early Hooks 缓存
     *
     * key: 钩子名称, value: 回调函数数组。
     * 在 eventHandler 创建前通过 addHook() 注册的钩子暂存于此，
     * 待 #createSubSystems() 完成后由 #flushEarlyHooks() 统一应用。
     *
     * @type {Map<string, Function[]>}
     */
    #earlyHooks;

    /**
     * 已绑定事件的 Sheet 集合
     *
     * 防止 switchTo() 重复调用 #bindSheetEvents() 导致事件监听器重复注册。
     *
     * @type {Set<import("./Sheet.js").Sheet>}
     */
    #boundSheets = new Set();

    /**
     * Workbook 级默认样式
     *
     * 作为所有 Sheet 的全局基础样式，Sheet 级 defaultStyle 在其上深度合并覆盖。
     * 由 options.defaultStyle 或 updateSettings({ defaultStyle }) 设置。
     *
     * @type {object|null}
     */
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
     * @param {number} [options.width] - 画布宽度（px），默认自适应容器
     * @param {number} [options.height] - 画布高度（px），默认自适应容器
     * @param {number|number[]} [options.rowHeights] - 行高配置
     * @param {number} [options.startRows=100] - 初始行数
     * @param {number} [options.startCols=26] - 初始列数
     * @param {string[]} [options.plugins] - 要加载的插件名称列表
     * @param {object} [options.pluginOptions] - 插件选项映射 { pluginName: options }
     * @param {object} [options.hooks] - 事件钩子映射 { hookName: callback }
     * @param {Array<{row:number,col:number,rowspan:number,colspan:number}>} [options.mergeCells] - 合并单元格配置
     * @param {Array<{range:object,condition:Function,style:object}>} [options.conditionalStyles] - 条件格式配置
     * @param {Array<{row:number,col:number,style?:object,disabled?:boolean,readOnly?:boolean,value?:*}>} [options.cell] - 单元格级配置
     * @param {Function} [options.cells] - 动态单元格属性函数 (row, col) => { style?, disabled?, ... }
     * @param {Array<object|Function>} [options.columns] - 列配置数组
     * @param {Function} [options.afterInit] - 初始化完成回调
     * @param {boolean} [options.autoInit=true] - 是否在构造时自动调用 initRender() 和 render()
     */
    constructor(element, options = {}) {
        /** @type {Map<string, Sheet>} 工作表映射（name → Sheet 实例） */
        this.sheets = new Map();

        /** @type {Sheet|null} 当前活动工作表 */
        this.activeSheet = null;

        /**
         * 剪贴板管理器引用
         * 由 CopyPastePlugin 在 init() 时注入，非插件模式下为 null。
         * 向后兼容：外部代码仍可通过 workbook.clipboard 访问。
         * @type {import("../editor/ClipboardManager.js").ClipboardManager|null}
         */
        this.clipboard = null;

        /** @type {RenderEngine|null} 渲染引擎实例 */
        this.renderEngine = null;

        /** @type {EditorManager|null} 编辑器管理器实例 */
        this.editor = null;

        /** @type {EventHandler|null} 事件处理器实例 */
        this.eventHandler = null;

        /** @type {PluginManager|null} 插件管理器实例 */
        this.pluginManager = null;

        /**
         * Early Hooks 缓存（eventHandler 创建前注册的 hooks）
         * key: hookName, value: callback[]
         * @type {Map<string, Function[]>}
         */
        this.#earlyHooks = new Map();

        this.#containerElement = element;
        this.#initOptions = options;

        const autoInit = options.autoInit !== false;

        /** @type {import("../formula/FormulaEngine.js").FormulaEngine|null} 公式引擎（由 FormulaPlugin 注入） */
        this.formulaEngine = null;

        /** @type {import("../ui/formulaBar/FormulaBarManager.js").FormulaBarManager|null} 公式栏管理器（由 FormulaPlugin 注入） */
        this.formulaBar = null;
        if (autoInit) {
            this.initRender();
            this.render();
        }
    }

    // ============================================================
    // 静态方法：全局插件注册
    // ============================================================

    /**
     * 全局注册插件类
     *
     * 将插件类注册到 PluginManager 的全局注册表中，之后可通过
     * workbook.loadPlugin(name, options) 按名称加载。
     * 直接委托给 PluginManager.register()，统一注册源。
     *
     * @param {string} name - 插件名称（全局唯一标识）
     * @param {typeof import("../plugins/BasePlugin.js").BasePlugin} PluginClass - 插件类（必须继承 BasePlugin）
     */
    static registerPlugin(name, PluginClass) {
        PluginManager.register(name, PluginClass);
    }

    /**
     * 全局注销插件类
     *
     * 从 PluginManager 的全局注册表中移除指定名称的插件类。
     * 已加载的插件实例不受影响，仅阻止后续通过名称加载。
     *
     * @param {string} name - 插件名称
     */
    static unregisterPlugin(name) {
        PluginManager.unregister(name);
    }

    // ============================================================
    // 插件委托方法
    // ============================================================

    /**
     * 按名称加载已注册的插件
     *
     * 若 PluginManager 尚未创建（initRender 未调用），将请求推入 pending 队列，
     * 待 initRender 完成后自动加载。
     *
     * @param {string} name - 插件名称（需先通过 Workbook.registerPlugin 注册）
     * @param {object} [options={}] - 插件初始化选项
     * @returns {?import("../plugins/BasePlugin.js").BasePlugin} 插件实例，PluginManager 未就绪时返回 null
     */
    loadPlugin(name, options = {}) {
        if (!this.pluginManager) {
            this.#pendingPlugins.push({ type: "name", name, options });
            return null;
        }
        return this.pluginManager.loadPlugin(name, options);
    }

    /**
     * 直接加载插件类（无需预先注册）
     *
     * 若 PluginManager 尚未创建，将请求推入 pending 队列。
     * 适用于运行时动态创建的插件类。
     *
     * @param {typeof import("../plugins/BasePlugin.js").BasePlugin} PluginClass - 插件类
     * @param {object} [options={}] - 插件初始化选项
     * @returns {?import("../plugins/BasePlugin.js").BasePlugin} 插件实例，PluginManager 未就绪时返回 null
     */
    loadPluginClass(PluginClass, options = {}) {
        if (!this.pluginManager) {
            this.#pendingPlugins.push({ type: "class", PluginClass, options });
            return null;
        }
        return this.pluginManager.loadPluginClass(PluginClass, options);
    }

    /**
     * 卸载指定名称的插件
     *
     * 调用插件的 destroy() 方法并从 PluginManager 中移除。
     *
     * @param {string} name - 插件名称
     */
    unloadPlugin(name) {
        this.pluginManager?.unloadPlugin(name);
    }

    /**
     * 获取指定名称的插件实例
     *
     * @param {string} name - 插件名称
     * @returns {?import("../plugins/BasePlugin.js").BasePlugin} 插件实例，未找到时返回 null
     */
    getPlugin(name) {
        return this.pluginManager?.getPlugin(name) ?? null;
    }

    /**
     * 启用指定名称的插件
     *
     * @param {string} name - 插件名称
     */
    enablePlugin(name) {
        this.pluginManager?.enablePlugin(name);
    }

    /**
     * 禁用指定名称的插件
     *
     * 禁用后插件仍驻留在内存中，但不再响应事件和执行逻辑。
     *
     * @param {string} name - 插件名称
     */
    disablePlugin(name) {
        this.pluginManager?.disablePlugin(name);
    }

    // ============================================================
    // 初始化
    // ============================================================

    /**
     * 初始化渲染引擎、编辑器、事件处理、插件系统
     *
     * 延迟初始化入口，在构造后显式调用（autoInit=true 时构造函数自动调用）。
     * 幂等方法：若 renderEngine 已存在则直接返回，避免重复初始化。
     *
     * 初始化流程：
     * 1. 从配置创建工作表（或默认工作表）
     * 2. 创建 RenderEngine 实例并设置画布尺寸
     * 3. 创建 EditorManager、EventHandler、PluginManager 子系统
     * 4. 应用缓存的 Early Hooks
     * 5. 绑定所有工作表事件到各子系统
     * 6. 刷新 pending 队列中的插件
     * 7. 应用初始配置（数据、样式、插件、钩子等）
     * 8. 设置滚动回调（编辑器视口裁剪）
     * 9. 设置工作表标签栏事件
     * 10. 发射 WORKBOOK_INIT 事件
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
     *
     * 遍历配置数组，为每项调用 addSheet() 创建工作表。
     * 若配置项未指定 name，则自动生成名称（Sheet1, Sheet2, ...）。
     *
     * @param {Array<{name?: string, [key: string]: any}>} sheetsConfig - 工作表配置数组
     */
    #initSheetsFromConfig(sheetsConfig) {
        for (const config of sheetsConfig) {
            const name = config.name || this.#generateSheetName();
            this.addSheet(name);
        }
    }

    /**
     * 确保至少存在一个默认工作表
     *
     * 若 sheets 为空，则使用配置中的 sheetName 或默认名称创建一个工作表。
     */
    #ensureDefaultSheet() {
        if (this.sheets.size === 0) {
            this.addSheet(this.#initOptions?.sheetName || `${CONFIG.DEFAULT_SHEET_NAME}1`);
        }
    }

    /**
     * 创建渲染引擎实例
     *
     * 初始化 RenderEngine 并根据配置设置画布尺寸。
     * 若 options 中指定了 width 或 height，调用 setCanvasSize 覆盖默认自适应尺寸。
     */
    #createRenderEngine() {
        this.renderEngine = new RenderEngine(this.#containerElement);
        const opts = this.#initOptions;
        if (opts?.width != null || opts?.height != null) {
            this.renderEngine.setCanvasSize(opts.width, opts.height);
        }
    }

    /**
     * 创建并关联 EditorManager、EventHandler、PluginManager 子系统
     *
     * 创建顺序：
     * 1. EditorManager（依赖 renderEngine + activeSheet）
     * 2. EventHandler（依赖 activeSheet + renderEngine + editor）
     * 3. PluginManager（依赖 workbook 实例）
     *
     * 创建后完成以下关联：
     * - EventHandler 设置钩子上下文为 Workbook
     * - EditorManager 设置视口和画布上下文（来自 EventHandler）
     * - 应用缓存的 Early Hooks
     */
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
     * 将缓存的 Early Hooks 应用到 EventHandler
     *
     * 遍历 #earlyHooks 中的所有钩子，逐个添加到 eventHandler，
     * 完成后清空缓存。仅在 eventHandler 已创建且有缓存时执行。
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

    /**
     * 将所有已创建的工作表绑定到渲染引擎
     *
     * 遍历 sheets Map，对每个 Sheet 调用 #bindSheetEvents() 建立事件桥接。
     */
    #linkSheetsToRenderEngine() {
        for (const sheet of this.sheets.values()) {
            this.#bindSheetEvents(sheet);
        }
    }

    /**
     * 将 Sheet 的事件总线桥接到各子系统
     *
     * 为指定 Sheet 的事件总线注册监听器，将事件转发到 RenderEngine、
     * FormulaEngine、ClipboardManager、PluginManager 等子系统。
     * 使用 #boundSheets 集合防止重复绑定。
     *
     * 事件转发映射：
     * - INVALIDATE_ALL → RenderEngine.invalidateAll()
     * - INVALIDATE_CELL → RenderEngine.invalidateCell(pageRow, c)
     * - RENDER_REQUEST → RenderEngine.render(sheet)
     * - FORMULA_SET → FormulaEngine.setFormula(sheet, r, c, formula)
     * - FORMULA_REMOVE → FormulaEngine.removeFormula(sheet, r, c)
     * - CELL_CHANGED → FormulaEngine.onCellChanged(sheet, r, c)
     * - DATA_CLEARED → FormulaEngine.onCellChanged(sheet, row, col) × N
     * - UNDO / REDO → FormulaEngine.recalculateAll(sheet)
     * - GET_CLIPBOARD → 返回 this.clipboard 引用
     * - GET_PLUGIN → 返回指定名称的插件实例
     *
     * 注意：BEFORE_CHANGE / AFTER_CHANGE 的钩子桥接由
     * EventHandler.#subscribeEditorEvents 统一处理，此处不重复订阅。
     *
     * @param {import("./Sheet.js").Sheet} sheet - 需要绑定事件的工作表实例
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

        bus.on(SHEET_EVENTS.DATA_CLEARED, (envelope) => {
            const { changes } = envelope.payload;

            if (this.formulaEngine && changes.length > 0) {
                for (const { row, col } of changes) {
                    this.formulaEngine.onCellChanged(sheet, row, col);
                }
            }
        });

        bus.on(SHEET_EVENTS.UNDO, () => {
            this.formulaEngine?.recalculateAll(sheet);
        });

        bus.on(SHEET_EVENTS.REDO, () => {
            this.formulaEngine?.recalculateAll(sheet);
        });

        // BEFORE_CHANGE / AFTER_CHANGE 的 Hooks 桥接由 EventHandler.#subscribeEditorEvents 统一处理，
        // 此处不再重复订阅，避免钩子被触发两次。

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

    /**
     * 设置滚动回调：编辑器视口裁剪
     *
     * 当用户滚动画布时，检查当前活跃编辑器对应的单元格是否仍在可见区域内：
     * - 可见：调用 restoreFromScroll() 恢复编辑器位置
     * - 不可见：调用 hideForScroll() 隐藏编辑器（避免编辑器悬浮在错误位置）
     *
     * 使用 viewport.isCellVisible() 判断可见性，需考虑标签栏高度和 DPR 缩放。
     */
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

    /**
     * 设置工作表标签栏事件绑定
     *
     * 将 SheetTabBar 的用户交互事件连接到 Workbook 的对应方法：
     * - onSwitch：切换到指定工作表并滚动标签栏到可见位置
     * - onAdd：创建新工作表、切换到新表并滚动标签栏
     * - onRemove：删除指定工作表
     * - onRename：重命名工作表
     *
     * 同时设置 tabBar.workbook 引用，使标签栏可以访问工作簿数据。
     * 最后调用 tabBar.refresh() 初始化标签栏显示。
     */
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

    /**
     * 生成不重复的工作表名称
     *
     * 格式为 "SheetN"（N 从当前 sheets.size + 1 开始递增），
     * 若名称已存在则继续递增直到找到可用名称。
     *
     * @returns {string} 未使用的工作表名称
     */
    #generateSheetName() {
        let idx = this.sheets.size + 1;
        while (this.sheets.has(`${CONFIG.DEFAULT_SHEET_NAME}${idx}`)) idx++;
        return `${CONFIG.DEFAULT_SHEET_NAME}${idx}`;
    }

    // ============================================================
    // 初始配置应用
    // ============================================================

    /**
     * 应用初始配置选项
     *
     * 将构造时传入的 options 应用到工作簿和工作表：
     * 1. 若有 sheets 数组配置，应用每个工作表的独立配置
     * 2. 加载配置中指定的插件
     * 3. 注册配置中的钩子
     * 4. 调用 afterInit 回调
     *
     * 仅在 initRender() 中调用一次。
     */
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
     *
     * 每个 sheet 配置项与顶层 opts 合并后独立应用。
     * 支持 Workbook 级 defaultStyle 继承链：
     * - 顶层 defaultStyle 作为全局基础
     * - Sheet 级 defaultStyle 在其基础上浅合并覆盖
     *
     * @param {object} opts - 完整的初始化选项
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

    /**
     * 解析 Sheet 级有效默认样式
     *
     * 合并策略：Workbook 级 defaultStyle 为基础，Sheet 级 defaultStyle 浅合并覆盖。
     * - 两者都存在：浅合并（Sheet 级覆盖 Workbook 级同名属性）
     * - 仅 Workbook 级存在：返回 Workbook 级
     * - 仅 Sheet 级存在：返回 Sheet 级
     * - 都不存在：返回 null
     *
     * @param {object} [sheetDefaultStyle] - Sheet 级默认样式
     * @returns {object|null} 合并后的有效默认样式
     */
    #resolveDefaultStyle(sheetDefaultStyle) {
        if (!this.#defaultStyle && !sheetDefaultStyle) return null;
        if (!this.#defaultStyle) return sheetDefaultStyle;
        if (!sheetDefaultStyle) return this.#defaultStyle;
        return { ...this.#defaultStyle, ...sheetDefaultStyle };
    }

    /**
     * 加载配置中指定的插件
     *
     * 从 options.plugins 数组读取插件名称列表，逐个调用 loadPlugin()。
     * 插件选项从 options.pluginOptions[name] 读取。
     *
     * @param {object} opts - 初始化选项
     */
    #loadInitPlugins(opts) {
        if (!Array.isArray(opts.plugins)) return;
        const pluginOptions = opts.pluginOptions || {};
        for (const name of opts.plugins) {
            this.loadPlugin(name, pluginOptions[name] || {});
        }
    }

    /**
     * 注册配置中的钩子
     *
     * 从 options.hooks 对象读取钩子映射，逐个调用 addHook()。
     * 支持 Early Hooks 机制（eventHandler 未创建时自动缓存）。
     *
     * @param {object} opts - 初始化选项
     */
    #loadInitHooks(opts) {
        if (!opts.hooks || !isObject(opts.hooks)) return;
        for (const [hookName, callback] of Object.entries(opts.hooks)) {
            if (isFunction(callback)) {
                this.addHook(hookName, callback);
            }
        }
    }

    /**
     * 刷新 pending 队列中的插件
     *
     * 遍历 #pendingPlugins 队列，根据 type 字段分别调用
     * pluginManager.loadPlugin() 或 pluginManager.loadPluginClass()。
     * 完成后清空队列。
     */
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
     *
     * 创建新的 Sheet 实例并添加到工作簿。流程：
     * 1. 触发 BEFORE_SHEET_ADD 钩子（可返回 false 阻止）
     * 2. 创建 Sheet 实例
     * 3. 若渲染引擎已就绪，绑定事件桥接
     * 4. 确保行列尺寸（使用配置或默认值）
     * 5. 应用 Workbook 级默认样式
     * 6. 注册到 sheets Map
     * 7. 若为首个工作表，自动设为活动表
     * 8. 刷新标签栏
     * 9. 触发 AFTER_SHEET_ADD 钩子
     *
     * @param {string} name - 工作表名称
     * @returns {Sheet|null} 创建的工作表实例，若被 BEFORE_SHEET_ADD 钩子取消则返回 null
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
     * 删除工作表
     *
     * 从工作簿中移除指定工作表。至少保留一个工作表，不允许全部删除。
     * 若删除的是当前活动工作表，自动切换到剩余的第一个工作表。
     *
     * 流程：
     * 1. 检查工作表是否存在且不是最后一个
     * 2. 触发 BEFORE_SHEET_REMOVE 钩子（可返回 false 阻止）
     * 3. 从 sheets Map 和 #boundSheets 集合中移除
     * 4. 若删除的是活动表，自动切换
     * 5. 刷新标签栏
     * 6. 触发 AFTER_SHEET_REMOVE 钩子
     *
     * @param {string} name - 工作表名称
     * @returns {boolean} 是否删除成功
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
     *
     * 修改工作表名称，同时保持 Map 中的插入顺序。
     * 通过重建 entries 数组并替换对应项来实现 Map 键的更新。
     *
     * 验证规则：
     * - 旧名称必须存在
     * - 新名称不能为空（trim 后）
     * - 新名称不能与旧名称相同
     * - 新名称不能与已有工作表重名
     *
     * @param {string} oldName - 当前工作表名称
     * @param {string} newName - 新工作表名称
     * @returns {boolean} 是否重命名成功
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
     *
     * 将活动工作表切换到指定名称的工作表。流程：
     * 1. 检查目标工作表是否存在且不是当前活动表
     * 2. 触发 BEFORE_SHEET_SWITCH 钩子（可返回 false 阻止）
     * 3. 更新活动工作表引用
     * 4. 同步 editor 和 eventHandler 的 sheet 引用
     * 5. 绑定目标工作表的事件桥接
     * 6. 重置滚动位置到左上角
     * 7. 标记渲染引擎需要重绘
     * 8. 执行渲染
     * 9. 刷新标签栏
     * 10. 通过 EventBus 通知内部模块（SHEET_SWITCHED 事件）
     * 11. 通过 Hooks 通知用户扩展代码（AFTER_SHEET_SWITCH）
     *
     * @param {string} name - 目标工作表名称
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

    /**
     * 获取当前活动工作表
     *
     * @returns {Sheet|null} 活动工作表实例，未初始化时返回 null
     */
    getActiveSheet() {
        return this.activeSheet;
    }

    // ============================================================
    // 渲染
    // ============================================================

    /**
     * 渲染当前活动工作表
     *
     * 委托给 RenderEngine.render()，将活动工作表绘制到 Canvas。
     * 仅在 renderEngine 和 activeSheet 都就绪时执行。
     */
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

    /**
     * 撤销当前活动工作表的最近一次操作
     *
     * 委托给 Sheet.undo()，撤销后自动刷新视图。
     */
    undo() {
        this.#withActiveSheet((s) => {
            s.undo();
            this.render();
        });
    }

    /**
     * 重做当前活动工作表的最近一次撤销操作
     *
     * 委托给 Sheet.redo()，重做后自动刷新视图。
     */
    redo() {
        this.#withActiveSheet((s) => {
            s.redo();
            this.render();
        });
    }

    // ============================================================
    // 单元格操作
    // ============================================================

    /**
     * 禁用当前选中的单元格
     *
     * 将当前活动选区的单元格设为禁用状态（不可编辑）。
     */
    disableCell() {
        this.#withActiveSheet((s) => {
            s.disableCell(...s.selection.getActive());
            this.render();
        });
    }

    /**
     * 启用当前选中的单元格
     *
     * 将当前活动选区的单元格设为启用状态（可编辑）。
     */
    enableCell() {
        this.#withActiveSheet((s) => {
            s.enableCell(...s.selection.getActive());
            this.render();
        });
    }

    /**
     * 合并指定区域的单元格
     *
     * @param {number} topRow - 左上角行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角行号
     * @param {number} bottomCol - 右下角列号
     * @returns {boolean} 是否合并成功
     */
    mergeCells(topRow, topCol, bottomRow, bottomCol) {
        return this.#withActiveSheet((s) => {
            const ok = s.mergeCells(topRow, topCol, bottomRow, bottomCol);
            if (ok) this.render();
            return ok;
        }, false);
    }

    /**
     * 取消当前选中单元格的合并
     *
     * @returns {boolean} 是否取消合并成功
     */
    unmergeCells() {
        return this.#withActiveSheet((s) => {
            const ok = s.unmergeCells(...s.selection.getActive());
            if (ok) this.render();
            return ok;
        }, false);
    }

    /**
     * 在指定行位置插入新行
     *
     * @param {number} [atRow] - 插入位置行号，默认为当前活动选区行号
     */
    insertRow(atRow) {
        this.#withActiveSheet((s) => {
            s.insertRow(atRow ?? s.selection.getActive()[0]);
            this.render();
        });
    }

    /**
     * 在指定列位置插入新列
     *
     * @param {number} [atCol] - 插入位置列号，默认为当前活动选区列号
     */
    insertCol(atCol) {
        this.#withActiveSheet((s) => {
            s.insertCol(atCol ?? s.selection.getActive()[1]);
            this.render();
        });
    }

    /**
     * 删除指定行
     *
     * @param {number} [atRow] - 要删除的行号，默认为当前活动选区行号
     */
    deleteRow(atRow) {
        this.#withActiveSheet((s) => {
            s.deleteRow(atRow ?? s.selection.getActive()[0]);
            this.render();
        });
    }

    /**
     * 删除指定列
     *
     * @param {number} [atCol] - 要删除的列号，默认为当前活动选区列号
     */
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

    /**
     * 移除指定钩子的某个回调函数
     *
     * 若 eventHandler 未创建，则从 #earlyHooks 缓存中移除。
     *
     * @param {string} hookName - 钩子名称
     * @param {Function} callback - 要移除的回调函数引用
     */
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

    /**
     * 清除指定钩子的所有回调函数
     *
     * 若 eventHandler 未创建，则从 #earlyHooks 缓存中删除该钩子。
     *
     * @param {string} hookName - 钩子名称
     */
    clearHook(hookName) {
        if (this.eventHandler) {
            this.eventHandler.clearHook(hookName);
        } else {
            this.#earlyHooks.delete(hookName);
        }
    }

    /**
     * 检查指定钩子是否有注册的回调
     *
     * @param {string} hookName - 钩子名称
     * @returns {boolean} 是否存在该钩子的回调
     */
    hasHook(hookName) {
        return this.eventHandler?.hasHook(hookName) || false;
    }

    /**
     * 执行指定钩子的所有回调（不检查返回值）
     *
     * @param {string} hookName - 钩子名称
     * @param {...*} args - 传递给回调的参数
     * @returns {*} 最后一个回调的返回值
     */
    runHooks(hookName, ...args) {
        return this.eventHandler?.runHooks(hookName, ...args);
    }

    /**
     * 执行指定钩子的所有回调，直到某个回调返回 false 为止
     *
     * 用于"Before"类钩子，允许回调通过返回 false 阻止操作。
     * 若 eventHandler 未创建，返回 undefined（不阻止操作）。
     *
     * @param {string} hookName - 钩子名称
     * @param {...*} args - 传递给回调的参数
     * @returns {false|undefined} false 表示操作被阻止，undefined 表示允许
     */
    runHooksUntil(hookName, ...args) {
        if (!this.eventHandler) return undefined;
        return this.eventHandler.runHooksUntil(hookName, ...args);
    }

    // ============================================================
    // 样式操作
    // ============================================================

    /**
     * 更新配置（对齐 Handsontable 的 updateSettings API）
     *
     * 将新的配置选项应用到当前活动工作表。
     * 若 settings 中包含 defaultStyle，同步更新 Workbook 级默认样式。
     *
     * @param {object} [settings={}] - 新的配置选项
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

    /**
     * 设置指定单元格的样式
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {object} styleObj - 样式对象（如 { bold: "weight", color: "red" }）
     */
    setCellStyle(row, col, styleObj) {
        this.#withActiveSheet((s) => {
            s.setCellStyle(row, col, styleObj);
            this.render();
        });
    }

    /**
     * 设置指定范围内所有单元格的样式
     *
     * @param {object} range - 范围对象 { topRow, topCol, bottomRow, bottomCol }
     * @param {object} styleObj - 样式对象
     */
    setRangeStyle(range, styleObj) {
        this.#withActiveSheet((s) => {
            s.setRangeStyle(range, styleObj);
            this.render();
        });
    }

    /**
     * 获取指定单元格的样式
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {object} 样式对象，无活动表时返回空对象
     */
    getCellStyle(row, col) {
        return this.#withActiveSheet((s) => s.getCellStyle(row, col), {});
    }

    /**
     * 设置 Workbook 级默认样式
     *
     * 更新 #defaultStyle 并同步到所有工作表，然后刷新视图。
     *
     * @param {object} styleObj - 默认样式对象
     */
    setDefaultStyle(styleObj) {
        this.#defaultStyle = styleObj;
        for (const sheet of this.sheets.values()) {
            sheet.setDefaultStyle(styleObj);
        }
        this.render();
    }

    /**
     * 获取 Workbook 级默认样式
     *
     * 优先返回 Workbook 级 #defaultStyle，若未设置则从活动工作表获取。
     *
     * @returns {object} 默认样式对象，均未设置时返回空对象
     */
    getDefaultStyle() {
        return this.#defaultStyle || this.#withActiveSheet((s) => s.getDefaultStyle(), {});
    }

    /**
     * 设置整行样式
     *
     * @param {number} row - 行号
     * @param {object} styleObj - 样式对象
     */
    setRowStyle(row, styleObj) {
        this.#withActiveSheet((s) => {
            s.setRowStyle(row, styleObj);
            this.render();
        });
    }

    /**
     * 设置整列样式
     *
     * @param {number} col - 列号
     * @param {object} styleObj - 样式对象
     */
    setColStyle(col, styleObj) {
        this.#withActiveSheet((s) => {
            s.setColStyle(col, styleObj);
            this.render();
        });
    }

    /**
     * 清除指定单元格的样式
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    clearCellStyle(row, col) {
        this.#withActiveSheet((s) => {
            s.clearCellStyle(row, col);
            this.render();
        });
    }

    /**
     * 清除整行样式
     *
     * @param {number} row - 行号
     */
    clearRowStyle(row) {
        this.#withActiveSheet((s) => {
            s.clearRowStyle(row);
            this.render();
        });
    }

    /**
     * 清除整列样式
     *
     * @param {number} col - 列号
     */
    clearColStyle(col) {
        this.#withActiveSheet((s) => {
            s.clearColStyle(col);
            this.render();
        });
    }

    /**
     * 清除指定范围内所有单元格的样式
     *
     * @param {object} range - 范围对象 { topRow, topCol, bottomRow, bottomCol }
     */
    clearRangeStyle(range) {
        this.#withActiveSheet((s) => {
            s.clearRangeStyle(range);
            this.render();
        });
    }

    /**
     * 批量样式更新
     *
     * 在回调函数中执行多次样式操作，Sheet 会收集变更，
     * 回调结束后统一触发一次渲染，避免多次 render() 导致性能问题。
     *
     * @param {Function} fn - 批量操作回调，接收 Sheet 实例作为参数
     */
    batchStyleUpdate(fn) {
        this.#withActiveSheet((s) => {
            s.batchStyleUpdate(fn);
            this.render();
        });
    }

    /**
     * 清空当前活动工作表的所有数据（Clear Active Sheet Data）
     *
     * 完整的生命周期：
     * 1. 触发 BEFORE_CLEAR_DATA hook（可返回 false 阻止操作）✅ 新增
     * 2. 调用 Sheet.clearData() 执行纯数据操作
     * 3. 触发 AFTER_CLEAR_DATA hook（通知完成）✅ 新增
     * 4. 自动刷新视图
     *
     * 适用场景：
     * - 用户点击"清空"按钮
     * - 数据导入前清理旧数据
     * - 工作表重置
     *
     * ⚠️ 安全性：
     * - 默认支持 Hook 阻止（权限控制、二次确认等）
     * - 支持撤销（除非设置 skipHistory）
     * - 审计友好（AFTER_CLEAR_DATA 提供详细变更信息）
     *
     * @param {object} [options={}] - 配置选项
     * @param {boolean} [options.skipHistory=false] - 跳过撤销记录（性能优化）
     * @returns {{ changes: Array, clearedCount: number }|false|undefined}
     *   - 成功：返回操作结果
     *   - 被阻止：返回 false（Hook 返回了 false）
     *   - 无活动表：返回 undefined
     */
    clearActiveSheetData(options = {}) {
        return this.#withActiveSheet((sheet) => {
            // ✅ 阶段1：Before Hook（可阻止操作）
            const cancelled = this.runHooksUntil(HOOKS.BEFORE_CLEAR_DATA, { sheet });
            if (cancelled === false) {
                return false; // ❌ Hook 返回 false，操作被阻止
            }

            // ✅ 阶段2：执行纯数据操作（Sheet 层负责）
            const result = sheet.clearData(options);

            // ✅ 阶段3：After Hook（通知完成，不检查返回值）
            this.runHooks(HOOKS.AFTER_CLEAR_DATA, {
                sheet,
                changes: result.changes,
                clearedCount: result.clearedCount,
            });

            // ✅ 阶段4：刷新视图
            this.render();

            return result;
        });
    }

    /**
     * 清空指定范围的数据（Clear Range Data via Workbook）
     *
     * 与 clearActiveSheetData() 类似，但仅处理指定的矩形范围。
     * 同样包含完整的 Hook 生命周期。
     *
     * @param {number} topRow - 左上角行号
     * @param {number} topCol - 左上角列号
     * @param {number} bottomRow - 右下角行号
     * @param {number} bottomCol - 右下角列号
     * @param {object} [options={}] - 配置选项（同 clearActiveSheetData）
     * @returns {{ changes: Array, clearedCount: number }|false|undefined}
     */
    clearRangeData(topRow, topCol, bottomRow, bottomCol, options = {}) {
        return this.#withActiveSheet((sheet) => {
            const range = { topRow, topCol, bottomRow, bottomCol };

            // ✅ Before Hook
            const cancelled = this.runHooksUntil(HOOKS.BEFORE_CLEAR_DATA, { sheet, range });
            if (cancelled === false) {
                return false;
            }

            // ✅ 执行清除
            const result = sheet.clearRange(topRow, topCol, bottomRow, bottomCol, options);

            // ✅ After Hook
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
     * 清空所有工作表的数据（Clear All Sheets Data）
     *
     * 遍历所有工作表并逐个清空数据。
     * 适用于"新建工作簿"或"重置全部"场景。
     *
     * ⚠️ 性能提示：
     * - 多工作表时可能耗时较长，建议显示加载指示器
     * - 最后统一 render() 避免多次渲染
     * - 每个 Sheet 都会独立触发 Before/After Hooks
     *
     * @param {object} [options={}] - 配置选项（同 clearActiveSheetData）
     * @returns {{
     *   totalCleared: number,
     *   results: Array<{sheetName: string, clearedCount: number, success: boolean}>,
     *   blockedSheets: Array<string>  // 被 Hook 阻止的工作表名列表
     * }}
     */
    clearAllSheetsData(options = {}) {
        const results = [];
        let totalCleared = 0;
        const blockedSheets = [];

        for (const [name, sheet] of this.sheets) {
            // ✅ 每个独立的 Sheet 都有完整的 Hook 生命周期
            const cancelled = this.runHooksUntil(HOOKS.BEFORE_CLEAR_DATA, { sheet });

            if (cancelled === false) {
                results.push({
                    sheetName: name,
                    clearedCount: 0,
                    success: false,
                });
                blockedSheets.push(name);
                continue; // ❌ 该工作表被阻止，跳过
            }

            const { clearedCount } = sheet.clearData(options);

            this.runHooks(HOOKS.AFTER_CLEAR_DATA, {
                sheet,
                changes: [], // 简化：不传递完整变更信息以节省内存
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

    // ============================================================
    // 导出（委托到 exportFile 插件）
    // ============================================================

    /**
     * 将工作簿导出为字符串
     *
     * 委托到 exportFile 插件，支持 CSV、TSV 等文本格式。
     * 若插件未加载，返回空字符串。
     *
     * @param {string} format - 导出格式（如 "csv", "tsv"）
     * @param {object} [options] - 导出选项
     * @returns {string} 导出的字符串内容
     */
    exportAsString(format, options) {
        return this.getPlugin("exportFile")?.exportAsString(format, options) ?? "";
    }

    /**
     * 将工作簿导出为 Blob 对象
     *
     * 委托到 exportFile 插件，支持 Excel (xlsx) 等二进制格式。
     * 若插件未加载，返回 null。
     *
     * @param {string} format - 导出格式（如 "xlsx"）
     * @param {object} [options] - 导出选项
     * @returns {?Blob} 导出的 Blob 对象，插件未加载时返回 null
     */
    exportAsBlob(format, options) {
        return this.getPlugin("exportFile")?.exportAsBlob(format, options) ?? null;
    }

    /**
     * 导出并下载工作簿文件
     *
     * 委托到 exportFile 插件，自动触发浏览器下载。
     *
     * @param {string} format - 导出格式
     * @param {object} [options] - 导出选项
     */
    downloadFile(format, options) {
        this.getPlugin("exportFile")?.downloadFile(format, options);
    }

    // ============================================================
    // 生命周期
    // ============================================================

    /**
     * 销毁工作簿，释放所有资源
     *
     * 销毁顺序：
     * 1. 通过 EventBus 发射 WORKBOOK_DESTROY 事件（触发 DESTROY 钩子）
     * 2. 销毁所有插件并置空 PluginManager
     * 3. 销毁 EventHandler 并置空
     * 4. 销毁 EditorManager 并置空
     * 5. 销毁 RenderEngine 并置空
     * 6. 清空工作表集合和活动工作表引用
     *
     * 销毁后工作簿实例不可再用，应丢弃引用。
     */
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
     * 若尚未有活动工作表，将传入 sheet 设为活动
     *
     * 仅在首个工作表添加时调用。同时同步 editor / eventHandler 的 sheet 引用，
     * 确保子系统与活动工作表保持一致。
     *
     * @param {Sheet} sheet - 待激活的工作表
     */
    #activateIfFirst(sheet) {
        if (!this.activeSheet) {
            this.activeSheet = sheet;
            if (this.editor) this.editor.sheet = sheet;
            if (this.eventHandler) this.eventHandler.sheet = sheet;
        }
    }

    /**
     * 安全刷新工作表标签栏
     *
     * 使用可选链避免 renderEngine 或 sheetTabBar 未初始化时报错。
     */
    #refreshTabBar() {
        this.renderEngine?.sheetTabBar?.refresh();
    }

    /**
     * 统一的"有活动工作表时执行"封装
     *
     * 消除所有方法中重复的 `if (!this.activeSheet) return` 守卫。
     * 若活动工作表不存在，返回 defaultValue（默认 undefined）；
     * 否则执行回调并返回其结果。
     *
     * @template T
     * @param {(sheet: Sheet) => T} fn - 操作回调，接收活动工作表
     * @param {T} [defaultValue] - 无活动表时的默认返回值
     * @returns {T|undefined} 回调返回值或默认值
     */
    #withActiveSheet(fn, defaultValue) {
        if (!this.activeSheet) return defaultValue;
        return fn(this.activeSheet);
    }
}
