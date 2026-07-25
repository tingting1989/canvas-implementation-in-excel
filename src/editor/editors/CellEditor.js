import { CONFIG } from "@/constants/config";
import { SHEET_EVENTS } from "@/constants/sheetEvents";
import { EVENT_NAMES } from "@/constants/eventNames";
import { isFunction } from "@/utils/helper";
import { DOMComponent } from "@/core/DOMComponent";
import { FONT_STYLE } from "@/constants/enums/FontStyle.js";
import "../editor.css";

/**
 * 单元格编辑器基类（CellEditor）
 *
 * 负责管理单元格的编辑生命周期，是所有特殊编辑器（如数字编辑器、选择编辑器）的基类。
 *
 * ## 设计模式：模板方法模式
 *
 * 基类提供完整的编辑生命周期框架，子类通过覆盖模板方法定制特定行为：
 * ```
 * createEditor → show → (用户编辑) → blur/keydown → commitAndHide
 * ```
 *
 * ## 核心职责
 * - 管理编辑器 DOM 元素的创建和销毁
 * - 处理编辑生命周期的状态管理
 * - 与 EventBus 集成，发射编辑相关事件
 * - 处理冻结区域和滚动时的编辑器位置约束
 * - 支持批量填充操作
 *
 * ## 模板方法（子类可覆盖）
 * | 方法 | 作用 | 默认实现 |
 * |------|------|----------|
 * | `getElementType()` | 返回 DOM 元素类型 | `"input"` |
 * | `getEditorCssClass()` | 返回编辑器 CSS 类名 | `""` |
 * | `getEditorAttributes()` | 返回额外 HTML 属性 | `{}` |
 * | `readCellValue(row, col)` | 读取单元格原始值 | 从 cellStore 读取 |
 * | `formatValueForEditor(rawValue)` | 格式化值用于显示 | `String(rawValue)` |
 * | `validateBeforeCommit(newValue)` | 提交前验证 | `true` |
 * | `areValuesEqual(oldValue, newValue)` | 值比较 | `===` |
 * | `getEditorValue()` | 获取编辑器当前值 | `editor.value` |
 * | `useBatchInBatchFill()` | 批量填充是否启用事务 | `false` |
 * | `bindEditorEvents()` | 绑定编辑器特有事件 | 空实现 |
 * | `afterCreateEditor()` | 创建后钩子 | 空实现 |
 * | `afterShow(row, col, cursorMode)` | 显示后钩子 | 空实现 |
 * | `setCursorMode(cursorMode)` | 设置光标模式 | 选择或定位到末尾 |
 *
 * ## 事件生命周期
 * 编辑过程中会通过 EventBus 发射以下事件：
 * - `EDITOR_BEFORE_BEGIN` → 编辑开始前
 * - `EDITOR_AFTER_BEGIN` → 编辑开始后
 * - `EDITOR_BEFORE_FINISH` → 编辑完成前
 * - `EDITOR_AFTER_FINISH` → 编辑完成后
 * - `BEFORE_CHANGE` → 值变更前
 * - `AFTER_CHANGE` → 值变更后
 *
 * @class CellEditor
 * @extends DOMComponent
 */
export class CellEditor extends DOMComponent {
    /** 是否因滚动而临时隐藏 */
    #scrollHiding = false;

    /**
     * 创建单元格编辑器实例
     *
     * @param {import("../../render/RenderEngine.js").RenderEngine} renderEngine - 渲染引擎
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表实例
     */
    constructor(renderEngine, sheet) {
        super();
        /** @type {import("../../render/RenderEngine.js").RenderEngine} 渲染引擎 */
        this.renderEngine = renderEngine;
        /** @type {import("../../workbook/Sheet.js").Sheet} 当前工作表 */
        this.sheet = sheet;
        /** @type {HTMLElement|null} 编辑器 DOM 元素 */
        this.editor = null;
        /** @type {number} 当前编辑的行号（-1 表示未编辑） */
        this.activeRow = -1;
        /** @type {number} 当前编辑的列号（-1 表示未编辑） */
        this.activeCol = -1;
        /** @type {boolean} 是否正在中文输入（IME 组合状态） */
        this.composing = false;
        /** @type {*} 编辑开始时的原始值（用于取消编辑时恢复） */
        this.originalValue = "";
    }

    /**
     * 设置视口服务
     * @param {import("../../render/ViewportService.js").ViewportService} viewport
     */
    set viewport(viewport) {
        this._viewport = viewport;
    }

    /**
     * 获取视口服务（优先使用显式设置的视口，否则回退到渲染引擎）
     * @returns {import("../../render/ViewportService.js").ViewportService}
     */
    get viewport() {
        return this._viewport ?? this.renderEngine;
    }

    /**
     * 设置画布上下文
     * @param {import("../../render/CanvasContext.js").CanvasContext} canvasContext
     */
    set canvasContext(canvasContext) {
        this._canvasContext = canvasContext;
    }

    /**
     * 获取画布上下文（优先使用显式设置，否则从渲染引擎创建代理）
     * @returns {import("../../render/CanvasContext.js").CanvasContext|null}
     */
    get canvasContext() {
        if (this._canvasContext) return this._canvasContext;
        const re = this.renderEngine;
        if (!re) return null;
        // 创建代理对象，保持接口一致性
        return {
            get canvas() {
                return re.canvas;
            },
            get canvasParent() {
                return re.canvas?.parentElement ?? null;
            },
            render(sheet) {
                re.render(sheet);
            },
        };
    }

    // ─── 模板方法（子类覆盖） ──────────────────────────────

    /**
     * 获取编辑器 DOM 元素类型
     * @returns {string} 元素类型名称（如 "input"、"textarea"、"select"）
     */
    getElementType() {
        return "input";
    }

    /**
     * 获取编辑器的 CSS 类名（用于样式定制）
     * @returns {string} CSS 类名，如 "cs-cell-editor--numeric"
     */
    getEditorCssClass() {
        return "";
    }

    /**
     * 获取编辑器的额外 HTML 属性
     * @returns {Object<string, string>} 属性键值对
     */
    getEditorAttributes() {
        return {};
    }

    /**
     * 读取单元格的原始值
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {*} 单元格的原始值
     */
    readCellValue(row, col) {
        const cell = this.sheet.cellStore.get(row, col);
        if (cell?.formula) return cell.formula;
        return cell?.value ?? "";
    }

    /**
     * 将单元格值格式化为编辑器可显示的格式
     * @param {*} rawValue - 原始单元格值
     * @returns {string} 格式化后的字符串
     */
    formatValueForEditor(rawValue) {
        return String(rawValue ?? "");
    }

    /**
     * 在提交前验证新值
     * @returns {boolean} 是否验证通过
     * @param newValue
     */
    validateBeforeCommit(newValue) {
        return true;
    }

    /**
     * 比较两个值是否相等（用于判断是否需要更新）
     * @param {*} oldValue - 旧值
     * @param {*} newValue - 新值
     * @returns {boolean} 是否相等
     */
    areValuesEqual(oldValue, newValue) {
        return oldValue === newValue;
    }

    /**
     * 获取编辑器当前的值
     * @returns {*} 编辑器的值
     */
    getEditorValue() {
        return this.editor?.value ?? "";
    }

    /**
     * 是否在批量填充时使用事务（beginBatch/endBatch）
     * @returns {boolean} 是否启用事务
     */
    useBatchInBatchFill() {
        return false;
    }

    /**
     * 绑定编辑器特有事件（由子类覆盖）
     */
    bindEditorEvents() {}

    /**
     * 创建编辑器后的钩子（由子类覆盖）
     */
    afterCreateEditor() {}

    /**
     * 显示编辑器后的钩子（由子类覆盖）
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {string} cursorMode - 光标模式
     */
    afterShow(row, col, cursorMode) {}

    /**
     * 设置编辑器光标模式
     * @param {string} cursorMode - 光标模式："select"（全选）或 "end"（定位到末尾）
     */
    setCursorMode(cursorMode) {
        if (!this.editor) return;
        if (cursorMode === "end") {
            const len = this.editor.value.length;
            this.editor.setSelectionRange(len, len);
        } else {
            this.editor.select();
        }
    }

    // ─── 通用实现 ──────────────────────────────────────────

    /**
     * 创建编辑器 DOM 元素
     *
     * 创建流程：
     * 1. 根据 getElementType() 创建元素
     * 2. 设置 CSS 类名
     * 3. 应用额外属性
     * 4. 添加到 DOM
     * 5. 绑定通用事件
     * 6. 绑定子类特有事件
     * 7. 调用 afterCreateEditor 钩子
     */
    createEditor() {
        const className = `cs-cell-editor ${this.getEditorCssClass()}`.trim();
        this.editor = this.createElement(this.getElementType(), {
            className,
        });

        const attrs = this.getEditorAttributes();
        for (const [key, value] of Object.entries(attrs)) {
            if (value !== null && value !== undefined) {
                this.editor.setAttribute(key, value);
            }
        }

        this.canvasContext.canvasParent.appendChild(this.editor);
        this.#bindCommonEvents();
        this.bindEditorEvents();
        this.afterCreateEditor();
    }

    /**
     * 绑定编辑器的通用事件
     *
     * 绑定的事件：
     * - BLUR → 失去焦点时提交编辑
     * - KEYDOWN → 处理 Enter/Tab/Escape 键
     * - COMPOSITIONSTART/END → 处理中文输入状态
     */
    #bindCommonEvents() {
        this.trackEvent(this.editor, EVENT_NAMES.BLUR, () => this.#onBlur());
        this.trackEvent(this.editor, EVENT_NAMES.KEYDOWN, (e) => this.#onKeyDown(e));
        this.trackEvent(this.editor, EVENT_NAMES.COMPOSITIONSTART, () => {
            this.composing = true;
        });
        this.trackEvent(this.editor, EVENT_NAMES.COMPOSITIONEND, () => {
            this.composing = false;
        });
    }

    /**
     * 显示编辑器并开始编辑
     *
     * @param {number} row - 要编辑的行号
     * @param {number} col - 要编辑的列号
     * @param {string} [cursorMode="select"] - 光标模式："select"（全选）或 "end"（定位到末尾）
     */
    show(row, col, cursorMode = "select") {
        // 检查工作表是否可用及单元格是否被禁用
        if (!this.sheet || this.sheet.isDisabled(row, col)) return;
        if (!this.editor) return;

        // ✅ 通过 EventBus 发射"即将开始编辑"事件（指定 source 为 CellEditor）
        // EventHandler 会订阅此事件并触发 BEFORE_BEGIN_EDITING hook
        const canBegin = this.sheet.bus?.emit(SHEET_EVENTS.EDITOR_BEFORE_BEGIN, [row, col], { source: "CellEditor" });
        if (canBegin === false) return;

        // 初始化编辑状态
        this.activeRow = row;
        this.activeCol = col;
        this.#scrollHiding = false;
        this.composing = false;

        // 获取单元格位置和合并信息
        const merge = this.sheet.getMerge(row, col);
        const rect = this.viewport.getCellRect(row, col, merge);

        // 将编辑器约束在可视数据区域内，防止：
        // 1. 非冻结列滚动到冻结列后面时编辑器 DOM 覆盖冻结区域
        // 2. 边缘列的编辑器超出 canvas 可视区域
        //
        // 编辑器是 DOM 元素，渲染在 canvas 之上，不受 canvas clip 裁剪。
        // 关键区分：
        // - 冻结区域内的单元格：编辑器约束到表头边界（headerW/headerH），在冻结区域内正常显示
        // - 非冻结区域的单元格：编辑器约束到非冻结区域起点（headerW + frozenColsW），
        //   防止滚动时编辑器穿透冻结区域
        const headerW = this.sheet.getHeaderWidth?.() ?? 0;
        const headerH = this.sheet.getHeaderHeight?.() ?? 0;
        const frozenColsW = this.sheet.frozenColsWidth || 0;
        const frozenRowsH = this.sheet.frozenRowsHeight || 0;
        const viewW = this.viewport?.viewW ?? Infinity;
        const viewH = this.viewport?.viewH ?? Infinity;
        const fixedCols = this.sheet.fixedColumnsStart || 0;
        const fixedRows = this.sheet.fixedRowsTop || 0;

        // 冻结区域内的单元格使用表头边界，非冻结区域单元格使用冻结区域+表头边界
        const minX = col < fixedCols ? headerW : headerW + frozenColsW;
        const minY = row < fixedRows ? headerH : headerH + frozenRowsH;

        // 计算约束后的位置和尺寸
        const clampedX = Math.max(rect.x, minX);
        const clampedY = Math.max(rect.y, minY);
        const clampedRight = Math.min(rect.x + rect.w, viewW);
        const clampedBottom = Math.min(rect.y + rect.h, viewH);
        const clampedW = Math.max(0, clampedRight - clampedX);
        const clampedH = Math.max(0, clampedBottom - clampedY);

        // 设置编辑器位置和可见性
        this.editor.style.display = clampedW > 0 && clampedH > 0 ? "block" : "none";
        this.editor.style.left = clampedX + "px";
        this.editor.style.top = clampedY + "px";
        this.editor.style.width = clampedW + "px";
        this.editor.style.height = clampedH + "px";

        // 同步单元格字体样式到编辑器
        this.#syncFontStyle(row, col, rect.h);

        // 读取并格式化单元格值
        const rawValue = this.readCellValue(row, col);
        this.originalValue = rawValue;

        let formattedValue = this.formatValueForEditor(rawValue);
        // 尝试使用单元格类型的格式化方法（如 HyperlinkColumnType）
        try {
            const cellType = this.sheet.getCellTypeInstance(row, col);
            if (cellType && typeof cellType.formatValueForEditor === "function") {
                formattedValue = cellType.formatValueForEditor(rawValue);
            }
        } catch (e) {
            // 忽略错误，使用默认格式化
        }

        // 设置编辑器值并聚焦
        this.editor.value = formattedValue;
        this.editor.focus();

        // 设置光标模式
        this.setCursorMode(cursorMode);

        // ✅ 通过 EventBus 发射"已开始编辑"事件（指定 source 为 CellEditor）
        this.sheet.bus?.emit(SHEET_EVENTS.EDITOR_AFTER_BEGIN, [row, col], { source: "CellEditor" });

        // 调用子类钩子
        this.afterShow(row, col, cursorMode);
    }

    /**
     * 同步单元格字体样式到编辑器
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {number} cellH - 单元格高度（用于计算行高）
     */
    #syncFontStyle(row, col, cellH) {
        const style = this.sheet.resolveStyle(row, col);
        const fontStyle = style.fontStyle === FONT_STYLE.ITALIC ? FONT_STYLE.ITALIC : FONT_STYLE.NORMAL;
        const fontWeight = style.fontWeight || "normal";
        const fontSize = style.fontSize || 12;
        const fontFamily = style.fontFamily || "Segoe UI";
        const lineHeight = cellH || 28;

        this.editor.style.font = `${fontStyle} ${fontWeight} ${fontSize}px/${lineHeight}px ${fontFamily}`;
        this.editor.style.textAlign = style.textAlign || "left";
        this.editor.style.color = style.color || "#222";
        this.editor.style.backgroundColor = style.backgroundColor && style.backgroundColor !== "transparent" ? style.backgroundColor : "#fff";
    }

    /**
     * 隐藏编辑器并重置编辑状态
     */
    hide() {
        if (this.editor) {
            this.editor.style.display = "none";
        }
        this.activeRow = -1;
        this.activeCol = -1;
    }

    /**
     * 因滚动临时隐藏编辑器
     *
     * 在滚动过程中临时隐藏编辑器，避免编辑器在滚动时出现视觉闪烁。
     * 滚动结束后调用 restoreFromScroll() 恢复编辑器。
     */
    hideForScroll() {
        if (this.activeRow < 0 || !this.editor) return;
        this.#scrollHiding = true;
        this.editor.style.display = "none";
    }

    /**
     * 从滚动隐藏状态恢复编辑器
     *
     * 滚动结束后恢复编辑器的显示，并重新计算位置。
     */
    restoreFromScroll() {
        if (this.activeRow < 0 || !this.editor) return;
        this.#scrollHiding = false;

        const merge = this.sheet.getMerge(this.activeRow, this.activeCol);
        const rect = this.viewport.getCellRect(this.activeRow, this.activeCol, merge);

        // 与 show() 相同的约束逻辑，防止编辑器超出可视区域
        const headerW = this.sheet.getHeaderWidth?.() ?? 0;
        const headerH = this.sheet.getHeaderHeight?.() ?? 0;
        const frozenColsW = this.sheet.frozenColsWidth || 0;
        const frozenRowsH = this.sheet.frozenRowsHeight || 0;
        const viewW = this.viewport?.viewW ?? Infinity;
        const viewH = this.viewport?.viewH ?? Infinity;
        const fixedCols = this.sheet.fixedColumnsStart || 0;
        const fixedRows = this.sheet.fixedRowsTop || 0;

        const minX = this.activeCol < fixedCols ? headerW : headerW + frozenColsW;
        const minY = this.activeRow < fixedRows ? headerH : headerH + frozenRowsH;

        const clampedX = Math.max(rect.x, minX);
        const clampedY = Math.max(rect.y, minY);
        const clampedRight = Math.min(rect.x + rect.w, viewW);
        const clampedBottom = Math.min(rect.y + rect.h, viewH);
        const clampedW = Math.max(0, clampedRight - clampedX);
        const clampedH = Math.max(0, clampedBottom - clampedY);

        this.editor.style.display = clampedW > 0 && clampedH > 0 ? "block" : "none";
        this.editor.style.left = clampedX + "px";
        this.editor.style.top = clampedY + "px";
        this.editor.style.width = clampedW + "px";
        this.editor.style.height = clampedH + "px";
        this.editor.focus();
    }

    /**
     * 更新编辑器位置（不改变可见性）
     *
     * 用于列宽/行高变化或冻结区域变化时更新编辑器位置。
     */
    updatePosition() {
        if (this.activeRow < 0 || !this.editor) return;

        const merge = this.sheet.getMerge(this.activeRow, this.activeCol);
        const rect = this.viewport.getCellRect(this.activeRow, this.activeCol, merge);

        const headerW = this.sheet.getHeaderWidth?.() ?? 0;
        const headerH = this.sheet.getHeaderHeight?.() ?? 0;
        const frozenColsW = this.sheet.frozenColsWidth || 0;
        const frozenRowsH = this.sheet.frozenRowsHeight || 0;
        const viewW = this.viewport?.viewW ?? Infinity;
        const viewH = this.viewport?.viewH ?? Infinity;
        const fixedCols = this.sheet.fixedColumnsStart || 0;
        const fixedRows = this.sheet.fixedRowsTop || 0;

        const minX = this.activeCol < fixedCols ? headerW : headerW + frozenColsW;
        const minY = this.activeRow < fixedRows ? headerH : headerH + frozenRowsH;

        const clampedX = Math.max(rect.x, minX);
        const clampedY = Math.max(rect.y, minY);
        const clampedRight = Math.min(rect.x + rect.w, viewW);
        const clampedBottom = Math.min(rect.y + rect.h, viewH);
        const clampedW = Math.max(0, clampedRight - clampedX);
        const clampedH = Math.max(0, clampedBottom - clampedY);

        this.editor.style.left = clampedX + "px";
        this.editor.style.top = clampedY + "px";
        this.editor.style.width = clampedW + "px";
        this.editor.style.height = clampedH + "px";
    }

    /**
     * 处理编辑器失去焦点事件
     *
     * 提交流程：
     * 1. 检查状态（滚动隐藏、中文输入）
     * 2. 发射 EDITOR_BEFORE_FINISH 事件
     * 3. 如果是批量填充模式，执行批量填充
     * 4. 否则解析、验证、比较值，然后保存
     * 5. 发射 EDITOR_AFTER_FINISH 事件
     * 6. 触发重绘
     */
    #onBlur() {
        // 忽略滚动隐藏状态和中文输入状态
        if (this.#scrollHiding) return;
        if (this.composing) return;
        if (this.activeRow < 0 || !this.sheet) return;

        // ✅ 通过 EventBus 发射"即将提交编辑"事件（指定 source 为 CellEditor）
        // EventHandler 会订阅此事件并触发 BEFORE_FINISH_EDITING hook
        const canFinish = this.sheet.bus?.emit(SHEET_EVENTS.EDITOR_BEFORE_FINISH, [this.activeRow, this.activeCol], { source: "CellEditor" });
        if (canFinish === false) return;

        let newValue = this.getEditorValue();
        const batchRange = this.sheet._batchFillRange;

        // 批量填充模式
        if (batchRange) {
            this.#batchFill(batchRange, newValue);
            delete this.sheet._batchFillRange;
        } else {
            // 普通编辑模式
            // 解析用户输入
            newValue = this.sheet.parseCellValue(this.activeRow, this.activeCol, newValue);

            // 验证新值
            if (!this.validateBeforeCommit(newValue)) {
                this.editor.value = this.formatValueForEditor(this.originalValue);
                this.editor.focus();
                return;
            }

            // 处理合并单元格（值只存储在合并区域的左上角）
            let targetRow = this.activeRow;
            let targetCol = this.activeCol;
            const merge = this.sheet.getMerge(this.activeRow, this.activeCol);
            if (merge) {
                targetRow = merge.topRow;
                targetCol = merge.topCol;
            }

            // 比较新旧值
            const oldCell = this.sheet.cellStore.get(targetRow, targetCol);
            if (this.areValuesEqual(oldCell?.value, newValue)) {
                this.hide();
                this.#render();
                return;
            }

            // ✅ 通过 EventBus 发射 BEFORE_CHANGE 事件（值变更前，指定 source 为 CellEditor）
            const changeData = [{ row: targetRow, col: targetCol, oldValue: oldCell?.value, newValue }];
            const canChange = this.sheet.bus?.emit(SHEET_EVENTS.BEFORE_CHANGE, [changeData], { source: "CellEditor" });
            if (canChange === false) {
                this.editor.value = this.formatValueForEditor(this.originalValue);
                this.editor.focus();
                return;
            }

            // 保存新值
            this.sheet.setCell(targetRow, targetCol, newValue, oldCell?.styleId || 0);

            // ✅ 通过 EventBus 发射 AFTER_CHANGE 事件（值变更后，指定 source 为 CellEditor）
            this.sheet.bus?.emit(SHEET_EVENTS.AFTER_CHANGE, [changeData], { source: "CellEditor" });
        }

        // 隐藏编辑器
        this.hide();

        // ✅ 通过 EventBus 发射"已完成编辑"事件（指定 source 为 CellEditor）
        this.sheet.bus?.emit(SHEET_EVENTS.EDITOR_AFTER_FINISH, [this.activeRow, this.activeCol, this.originalValue, newValue], {
            source: "CellEditor",
        });

        // 触发重绘
        if (this.viewport && isFunction(this.viewport.invalidateAll)) {
            this.viewport.invalidateAll();
        }
        this.#render();
    }

    /**
     * 批量填充选择区域
     *
     * @param {object} range - 填充范围 {topRow, topCol, bottomRow, bottomCol}
     * @param {*} value - 要填充的值
     */
    #batchFill(range, value) {
        const parsedValue = this.sheet.parseCellValue(range.topRow, range.topCol, value);

        const changes = [];
        const processedMerges = new Set();

        // 遍历选择区域
        for (let r = range.topRow; r <= range.bottomRow; r++) {
            for (let c = range.topCol; c <= range.bottomCol; c++) {
                // 跳过禁用的单元格
                if (this.sheet.isDisabled(r, c)) continue;

                // 处理合并单元格（只处理合并区域的左上角）
                const merge = this.sheet.getMerge(r, c);
                if (merge) {
                    const mergeKey = `${merge.topRow},${merge.topCol}`;
                    if (processedMerges.has(mergeKey)) continue;
                    processedMerges.add(mergeKey);

                    const mergeR = merge.topRow;
                    const mergeC = merge.topCol;
                    const oldCell = this.sheet.cellStore.get(mergeR, mergeC);
                    const oldValue = oldCell?.value ?? "";
                    if (oldValue !== parsedValue) {
                        changes.push({ row: mergeR, col: mergeC, oldValue, newValue: parsedValue });
                    }
                } else {
                    // 普通单元格
                    const oldCell = this.sheet.cellStore.get(r, c);
                    const oldValue = oldCell?.value ?? "";
                    if (oldValue !== parsedValue) {
                        changes.push({ row: r, col: c, oldValue, newValue: parsedValue });
                    }
                }
            }
        }

        // 没有变化则直接返回
        if (changes.length === 0) return;

        // 发射变更前事件
        this.sheet.bus.emit(SHEET_EVENTS.BEFORE_CHANGE, [changes], { source: "CellEditor" });

        // 执行批量更新
        if (this.useBatchInBatchFill()) {
            this.sheet.beginBatch();
        }
        for (const { row, col, newValue } of changes) {
            const oldCell = this.sheet.cellStore.get(row, col);
            this.sheet.setCell(row, col, newValue, oldCell?.styleId || 0);
        }
        if (this.useBatchInBatchFill()) {
            this.sheet.endBatch();
        }

        // 发射变更后事件
        this.sheet.bus.emit(SHEET_EVENTS.AFTER_CHANGE, [changes], { source: "CellEditor" });
    }

    #onKeyDown(e) {
        if (!this.sheet) return;
        if (this.composing) return;

        switch (e.key) {
            case "Enter":
                e.preventDefault();
                if (e.ctrlKey || e.metaKey) {
                    this.#commitAndFillSelection();
                } else {
                    this.#commitAndMoveNext("enter");
                }
                break;
            case "Escape":
                e.preventDefault();
                this.editor.value = this.formatValueForEditor(this.originalValue);
                delete this.sheet._batchFillRange;
                this.editor.blur();
                break;
            case "Tab":
                e.preventDefault();
                this.#commitAndMoveNext("tab", e.shiftKey);
                break;
        }
    }

    #commitAndFillSelection() {
        if (this.activeRow < 0 || !this.sheet) return;

        const newValue = this.getEditorValue();
        const range = this.sheet.selection.getRange();

        this.#batchFill(range, newValue);

        this.hide();
        if (this.viewport && isFunction(this.viewport.invalidateAll)) {
            this.viewport.invalidateAll();
        }
        this.#render();
    }

    #commitAndMoveNext(direction, shiftKey = false) {
        const currentRow = this.activeRow;
        const currentCol = this.activeCol;
        this.editor.blur();

        if (direction === "enter") {
            let nextRow = currentRow + 1;
            const merge = this.sheet.getMerge(currentRow, currentCol);
            if (merge && nextRow <= merge.bottomRow) {
                nextRow = merge.bottomRow + 1;
            }
            nextRow = Math.min(this.sheet.rowColManager.rowCount - 1, Math.max(0, nextRow));
            const { row: targetRow } = this.#getTopLeft(nextRow, currentCol);
            const targetMerge = this.sheet.getMerge(targetRow, currentCol);
            if (targetMerge) {
                this.sheet.selection.setRange(targetMerge.topRow, targetMerge.topCol, targetMerge.bottomRow, targetMerge.bottomCol);
            } else {
                this.sheet.selection.setActive(targetRow, currentCol);
            }
            this.viewport.scrollToCell(targetRow, currentCol);
        } else if (direction === "tab") {
            const nextCol = shiftKey ? currentCol - 1 : currentCol + 1;
            const colMerge = this.sheet.getMerge(currentRow, currentCol);
            let targetCol = nextCol;
            if (colMerge) {
                if (shiftKey && nextCol >= colMerge.topCol) {
                    targetCol = colMerge.topCol - 1;
                } else if (!shiftKey && nextCol <= colMerge.bottomCol) {
                    targetCol = colMerge.bottomCol + 1;
                }
            }
            targetCol = Math.min(this.sheet.rowColManager.realColCount - 1, Math.max(0, targetCol));
            const { col: finalCol } = this.#getTopLeft(currentRow, targetCol);
            const tabTargetMerge = this.sheet.getMerge(currentRow, finalCol);
            if (tabTargetMerge) {
                this.sheet.selection.setRange(tabTargetMerge.topRow, tabTargetMerge.topCol, tabTargetMerge.bottomRow, tabTargetMerge.bottomCol);
            } else {
                this.sheet.selection.setActive(currentRow, finalCol);
            }
            this.viewport.scrollToCell(currentRow, finalCol);
        }

        this.#render();
    }

    #getTopLeft(row, col) {
        const merge = this.sheet?.getMerge(row, col);
        if (merge) {
            return { row: merge.topRow, col: merge.topCol };
        }
        return { row, col };
    }

    #render() {
        if (this.sheet && this.canvasContext && isFunction(this.canvasContext.render)) {
            this.canvasContext.render(this.sheet);
        }
    }

    getValue() {
        return this.editor?.value ?? "";
    }

    setValue(value) {
        if (this.editor) {
            this.editor.value = String(value);
        }
    }

    focus() {
        this.editor?.focus();
    }

    /** @override */
    onDestroy() {
        this.renderEngine = null;
        this.sheet = null;
        this.editor = null;
        this.activeRow = -1;
        this.activeCol = -1;
        this.composing = false;
        this.originalValue = "";
    }
}
