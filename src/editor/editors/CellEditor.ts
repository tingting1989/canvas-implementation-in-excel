import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";
import { isFunction } from "../../utils/helper.js";
import { DOMComponent } from "../../core/DOMComponent.js";
import { FONT_STYLE } from "../../constants/enums/FontStyle.js";
import type { Rect, CellRange } from "../../model/types";
import "../editor.css";

/** 单元格矩形区域信息（别名，语义化） */
type CellRect = Rect;

/** 合并单元格区域范围（别名，语义化） */
type MergeArea = CellRange;

/** 单元格变更数据项 */
interface ChangeDataItem {
    row: number;
    col: number;
    oldValue: unknown;
    newValue: unknown;
}

/** Canvas 上下文代理接口，提供画布和渲染能力 */
interface CanvasContextProxy {
    canvas: HTMLCanvasElement | null;
    canvasParent: HTMLElement | null;
    render: (sheet: unknown) => void;
}

/** 视口接口，提供单元格坐标计算和滚动能力 */
interface ViewportLike {
    getCellRect: (row: number, col: number, merge?: MergeArea | null) => CellRect;
    viewW: number;
    viewH: number;
    invalidateAll?: () => void;
    scrollToCell: (row: number, col: number) => void;
}

/** 工作表接口，提供单元格数据读写和样式解析能力 */
interface SheetLike {
    cellStore: { get: (row: number, col: number) => { value: unknown; formula?: string; styleId?: number } | null | undefined };
    isDisabled: (row: number, col: number) => boolean;
    getMerge: (row: number, col: number) => MergeArea | null;
    resolveStyle: (row: number, col: number) => Record<string, unknown>;
    parseCellValue: (row: number, col: number, value: string) => unknown;
    validateCellValue: (row: number, col: number, value: unknown) => boolean | string | undefined;
    setCell: (row: number, col: number, value: unknown, styleId?: number) => void;
    selection: {
        setActive: (row: number, col: number) => void;
        setRange: (topRow: number, topCol: number, bottomRow: number, bottomCol: number) => void;
        getRange: () => MergeArea;
    };
    rowColManager: { rowCount: number; realColCount: number };
    getCellTypeInstance: (
        row: number,
        col: number,
    ) => { getEditorOptions?: () => Record<string, unknown>; formatValueForEditor?: (rawValue: unknown) => string } | null;
    getHeaderWidth?: () => number;
    getHeaderHeight?: () => number;
    frozenColsWidth: number;
    frozenRowsHeight: number;
    fixedColumnsStart: number;
    fixedRowsTop: number;
    bus?: {
        emit: (event: string, args?: unknown[], options?: Record<string, unknown>) => unknown;
        on: (event: string, handler: (...args: unknown[]) => void) => void;
    };
    beginBatch: () => void;
    endBatch: () => void;
    _batchFillRange?: MergeArea | null;
}

/** 渲染引擎接口，提供画布渲染和坐标计算能力 */
interface RenderEngineLike {
    canvas: HTMLCanvasElement | null;
    canvasParent?: HTMLElement | null;
    render: (sheet: unknown) => void;
    getCellRect: (row: number, col: number, merge?: MergeArea | null) => CellRect;
    viewW: number;
    viewH: number;
    invalidateAll?: () => void;
    scrollToCell: (row: number, col: number) => void;
}

/**
 * 单元格编辑器基类
 *
 * 提供单元格编辑的完整生命周期管理，包括创建、显示、隐藏、提交和销毁。
 * 子类可通过覆写模板方法（如 getElementType、bindEditorEvents 等）自定义编辑器行为。
 * 支持输入法组合、批量填充、合并单元格、冻结行列等复杂场景。
 */
export class CellEditor extends DOMComponent {
    /**
     * @private 私有字段 - 滚动隐藏标记
     * 当编辑器因滚动被临时隐藏时为 true，防止 blur 事件误触发提交
     */
    #scrollHiding = false;

    /**
     * 所属 Workbook 的实例 ID
     *
     * 格式："cs-wb-{n}"，由 EditorManager.setWorkbookId() 注入。
     * createEditor() 时将此 ID 作为 CSS 类名添加到编辑器 DOM 元素，
     * 供 InputDetector 在多 Workbook 共存时精确判断编辑器归属。
     *
     * DOM 中的效果：
     * <input class="cs-cell-editor cs-wb-0 cs-numeric-editor" ...>
     *                  ↑ 通用标识    ↑ Workbook归属  ↑ 编辑器类型
     *
     * @see EditorManager.setWorkbookId
     * @see InputDetector.#isOurCellEditor
     */
    workbookId: string | null = null;

    /**
     * @private 私有字段 - 提交锁
     * 在 commitAndMoveNext 流程中为 true，防止 blur 事件重复提交
     */
    #commitLock = false;

    /** 渲染引擎实例，提供画布渲染和坐标计算能力 */
    renderEngine: RenderEngineLike | null;

    /** 工作表实例，提供单元格数据读写和样式解析能力 */
    sheet: SheetLike | null;

    /** 编辑器 DOM 元素 */
    editor: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;

    /** 当前编辑的行号 */
    activeRow: number;

    /** 当前编辑的列号 */
    activeCol: number;

    /** 是否正在输入法组合中 */
    composing: boolean;

    /** 编辑前的原始值，用于取消编辑时恢复 */
    originalValue: unknown;

    /**
     * @private 私有字段 - 视口实例
     * 优先使用外部注入的视口，未注入时回退到渲染引擎
     */
    private _viewport: ViewportLike | null = null;

    /**
     * @private 私有字段 - Canvas 上下文代理
     * 优先使用外部注入的上下文，未注入时从渲染引擎自动构建
     */
    private _canvasContext: CanvasContextProxy | null = null;

    /**
     * 构造单元格编辑器
     *
     * @param renderEngine - 渲染引擎实例
     * @param sheet - 工作表实例
     */
    constructor(renderEngine: RenderEngineLike, sheet: SheetLike) {
        super();
        this.renderEngine = renderEngine;
        this.sheet = sheet;
        this.editor = null;
        this.activeRow = -1;
        this.activeCol = -1;
        this.composing = false;
        this.originalValue = "";
    }

    /** 设置视口实例 */
    set viewport(viewport: ViewportLike | null) {
        this._viewport = viewport;
    }

    /**
     * 获取视口实例
     * 优先返回外部注入的视口，未注入时回退到渲染引擎作为视口
     */
    get viewport(): ViewportLike | null {
        return this._viewport ?? (this.renderEngine as ViewportLike | null);
    }

    /** 设置 Canvas 上下文代理 */
    set canvasContext(canvasContext: CanvasContextProxy | null) {
        this._canvasContext = canvasContext;
    }

    /**
     * 获取 Canvas 上下文代理
     * 优先返回外部注入的上下文，未注入时从渲染引擎自动构建代理对象
     */
    get canvasContext(): CanvasContextProxy | null {
        if (this._canvasContext) return this._canvasContext;
        const re = this.renderEngine;
        if (!re) return null;
        return {
            get canvas() {
                return re.canvas;
            },
            get canvasParent() {
                return re.canvas?.parentElement ?? null;
            },
            render(sheet: unknown) {
                re.render(sheet);
            },
        };
    }

    /**
     * 获取编辑器 DOM 元素类型
     * 子类可覆写以返回 "select"、"textarea" 等类型
     * @returns 元素类型标签名
     */
    getElementType(): string {
        return "input";
    }

    /**
     * 获取编辑器附加的 CSS 类名
     * 子类可覆写以添加特定样式类
     * @returns CSS 类名字符串
     */
    getEditorCssClass(): string {
        return "";
    }

    /**
     * 获取编辑器 DOM 元素的附加属性
     * 子类可覆写以设置 type、inputmode 等属性
     * @returns 属性键值对
     */
    getEditorAttributes(): Record<string, string | number> {
        return {};
    }

    /**
     * 读取指定单元格的原始值
     * 优先返回公式字符串，其次返回单元格值
     *
     * @param row - 行号
     * @param col - 列号
     * @returns 单元格原始值
     */
    readCellValue(row: number, col: number): unknown {
        const cell = this.sheet!.cellStore.get(row, col);
        if (cell?.formula) return cell.formula;
        return cell?.value ?? "";
    }

    /**
     * 将原始值格式化为编辑器显示的字符串
     * 子类可覆写以实现特定类型的格式化逻辑
     *
     * @param rawValue - 原始值
     * @returns 格式化后的字符串
     */
    formatValueForEditor(rawValue: unknown): string {
        return String(rawValue ?? "");
    }

    /**
     * 提交前验证新值是否合法
     * 子类可覆写以实现特定类型的验证逻辑
     *
     * @param _newValue - 待提交的新值
     * @returns 验证通过返回 true，否则返回 false
     */
    validateBeforeCommit(_newValue: unknown): boolean {
        return true;
    }

    /**
     * 判断旧值与新值是否相等
     * 子类可覆写以处理 Date、NaN 等特殊值的比较
     *
     * @param oldValue - 旧值
     * @param newValue - 新值
     * @returns 相等返回 true
     */
    areValuesEqual(oldValue: unknown, newValue: unknown): boolean {
        return oldValue === newValue;
    }

    /**
     * 获取编辑器当前输入的值
     * 子类可覆写以实现值的预处理（如 trim）
     * @returns 编辑器当前值
     */
    getEditorValue(): string {
        return (this.editor as HTMLInputElement)?.value ?? "";
    }

    /**
     * 批量填充时是否使用 beginBatch/endBatch 包裹
     * 子类可覆写以在批量填充时启用批处理优化
     * @returns 默认 false
     */
    useBatchInBatchFill(): boolean {
        return false;
    }

    /**
     * 绑定编辑器特有的事件监听器
     * 子类可覆写以注册 input、paste 等自定义事件
     */
    bindEditorEvents(): void {}

    /**
     * 编辑器 DOM 元素创建后的回调
     * 子类可覆写以设置 type、resize 等初始属性
     */
    afterCreateEditor(): void {}

    /**
     * 编辑器显示后的回调
     * 子类可覆写以在显示后执行额外初始化（如构建下拉选项）
     *
     * @param _row - 行号
     * @param _col - 列号
     * @param _cursorMode - 光标模式
     */
    afterShow(_row: number, _col: number, _cursorMode: string): void {}

    /**
     * 设置编辑器的光标模式
     * "end" 模式将光标移到末尾，其他模式全选文本
     *
     * @param cursorMode - 光标模式，"end" 表示末尾，其他表示全选
     */
    setCursorMode(cursorMode: string): void {
        if (!this.editor) return;
        if (cursorMode === "end") {
            const len = (this.editor as HTMLInputElement).value.length;
            (this.editor as HTMLInputElement).setSelectionRange(len, len);
        } else {
            (this.editor as HTMLInputElement).select();
        }
    }

    /**
     * 创建编辑器 DOM 元素并挂载到画布父容器
     * 依次执行：创建元素 → 设置属性 → 挂载 DOM → 绑定通用事件 → 绑定自定义事件 → 创建后回调
     */
    createEditor(): void {
        const className = `cs-cell-editor ${this.workbookId ?? ""} ${this.getEditorCssClass()}`.trim();
        this.editor = this.createElement(this.getElementType(), {
            className,
        }) as HTMLInputElement;

        const attrs = this.getEditorAttributes();
        for (const [key, value] of Object.entries(attrs)) {
            if (value !== null && value !== undefined) {
                this.editor.setAttribute(key, String(value));
            }
        }

        const parent = this.canvasContext?.canvasParent;
        if (parent) {
            parent.appendChild(this.editor);
        }
        this.#bindCommonEvents();
        this.bindEditorEvents();
        this.afterCreateEditor();
    }

    /**
     * @private 私有方法 - 绑定编辑器通用事件
     * 注册 blur、keydown、输入法组合开始/结束等基础事件监听器
     */
    #bindCommonEvents(): void {
        this.trackEvent(this.editor!, EVENT_NAMES.BLUR, () => this.#onBlur());
        this.trackEvent(this.editor!, EVENT_NAMES.KEYDOWN, (e: Event) => this.#onKeyDown(e as KeyboardEvent));
        this.trackEvent(this.editor!, EVENT_NAMES.COMPOSITIONSTART, () => {
            this.composing = true;
        });
        this.trackEvent(this.editor!, EVENT_NAMES.COMPOSITIONEND, () => {
            this.composing = false;
        });
    }

    /**
     * 显示编辑器并定位到指定单元格
     *
     * 处理流程：
     * 1. 检查单元格是否可编辑
     * 2. 触发 EDITOR_BEFORE_BEGIN 钩子
     * 3. 计算编辑器位置（考虑冻结行列和视口裁剪）
     * 4. 同步字体样式
     * 5. 格式化并填入单元格值
     * 6. 设置光标模式
     * 7. 触发 EDITOR_AFTER_BEGIN 钩子
     *
     * @param row - 行号
     * @param col - 列号
     * @param cursorMode - 光标模式，默认 "select"（全选）
     */
    show(row: number, col: number, cursorMode: string = "select"): void {
        if (!this.sheet || this.sheet.isDisabled(row, col)) return;
        if (!this.editor) return;

        const canBegin = this.sheet.bus?.emit(SHEET_EVENTS.EDITOR_BEFORE_BEGIN, [row, col], { source: "CellEditor" });
        if (canBegin === false) return;

        this.activeRow = row;
        this.activeCol = col;
        this.#scrollHiding = false;
        this.composing = false;

        const merge = this.sheet.getMerge(row, col);
        const rect = this.viewport!.getCellRect(row, col, merge);

        const headerW = this.sheet.getHeaderWidth?.() ?? 0;
        const headerH = this.sheet.getHeaderHeight?.() ?? 0;
        const frozenColsW = this.sheet.frozenColsWidth || 0;
        const frozenRowsH = this.sheet.frozenRowsHeight || 0;
        const viewW = this.viewport?.viewW ?? Infinity;
        const viewH = this.viewport?.viewH ?? Infinity;
        const fixedCols = this.sheet.fixedColumnsStart || 0;
        const fixedRows = this.sheet.fixedRowsTop || 0;

        // 计算冻结区域的最小可视坐标
        const minX = col < fixedCols ? headerW : headerW + frozenColsW;
        const minY = row < fixedRows ? headerH : headerH + frozenRowsH;

        // 将编辑器位置裁剪到可视区域内
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

        this.#syncFontStyle(row, col, rect.h);

        const rawValue = this.readCellValue(row, col);
        this.originalValue = rawValue;

        // 优先使用单元格类型的格式化方法，失败时回退到默认格式化
        let formattedValue = this.formatValueForEditor(rawValue);
        try {
            const cellType = this.sheet.getCellTypeInstance(row, col);
            if (cellType && typeof cellType.formatValueForEditor === "function") {
                formattedValue = cellType.formatValueForEditor(rawValue);
            }
        } catch (_e) {
            // 忽略错误，使用默认格式化
        }

        (this.editor as HTMLInputElement).value = formattedValue;
        (this.editor as HTMLInputElement).focus();

        this.setCursorMode(cursorMode);

        this.sheet.bus?.emit(SHEET_EVENTS.EDITOR_AFTER_BEGIN, [row, col], { source: "CellEditor" });

        this.afterShow(row, col, cursorMode);
    }

    /**
     * @private 私有方法 - 同步编辑器字体样式到单元格样式
     * 从工作表解析样式并应用到编辑器 DOM 元素，确保编辑时视觉效果一致
     *
     * @param row - 行号
     * @param col - 列号
     * @param cellH - 单元格高度，用于计算行高
     */
    #syncFontStyle(row: number, col: number, cellH: number): void {
        const style = this.sheet!.resolveStyle(row, col) as Record<string, unknown>;
        const fontStyle = style.fontStyle === FONT_STYLE.ITALIC ? FONT_STYLE.ITALIC : FONT_STYLE.NORMAL;
        const fontWeight = (style.fontWeight as string) || "normal";
        const fontSize = (style.fontSize as number) || 12;
        const fontFamily = (style.fontFamily as string) || "Segoe UI";
        const lineHeight = cellH || 28;

        this.editor!.style.font = `${fontStyle} ${fontWeight} ${fontSize}px/${lineHeight}px ${fontFamily}`;
        this.editor!.style.textAlign = (style.textAlign as string) || "left";
        this.editor!.style.color = (style.color as string) || "#222";
        this.editor!.style.backgroundColor =
            style.backgroundColor && style.backgroundColor !== "transparent" ? (style.backgroundColor as string) : "#fff";
    }

    /**
     * 隐藏编辑器并重置活动行列号
     * 仅控制 DOM 显示状态，不触发值提交
     */
    hide(): void {
        if (this.editor) {
            this.editor.style.display = "none";
        }
        this.activeRow = -1;
        this.activeCol = -1;
    }

    /**
     * 滚动时临时隐藏编辑器
     * 设置 scrollHiding 标记防止 blur 事件误触发提交
     */
    hideForScroll(): void {
        if (this.activeRow < 0 || !this.editor) return;
        this.#scrollHiding = true;
        this.editor.style.display = "none";
    }

    /**
     * 滚动结束后恢复编辑器显示
     * 重新计算位置并聚焦编辑器
     */
    restoreFromScroll(): void {
        if (this.activeRow < 0 || !this.editor) return;
        this.#scrollHiding = false;

        const merge = this.sheet!.getMerge(this.activeRow, this.activeCol);
        const rect = this.viewport!.getCellRect(this.activeRow, this.activeCol, merge);

        const headerW = this.sheet!.getHeaderWidth?.() ?? 0;
        const headerH = this.sheet!.getHeaderHeight?.() ?? 0;
        const frozenColsW = this.sheet!.frozenColsWidth || 0;
        const frozenRowsH = this.sheet!.frozenRowsHeight || 0;
        const viewW = this.viewport?.viewW ?? Infinity;
        const viewH = this.viewport?.viewH ?? Infinity;
        const fixedCols = this.sheet!.fixedColumnsStart || 0;
        const fixedRows = this.sheet!.fixedRowsTop || 0;

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
        (this.editor as HTMLInputElement).focus();
    }

    /**
     * 更新编辑器位置（不改变显示状态）
     * 在列宽/行高调整等场景下调用
     */
    updatePosition(): void {
        if (this.activeRow < 0 || !this.editor) return;

        const merge = this.sheet!.getMerge(this.activeRow, this.activeCol);
        const rect = this.viewport!.getCellRect(this.activeRow, this.activeCol, merge);

        const headerW = this.sheet!.getHeaderWidth?.() ?? 0;
        const headerH = this.sheet!.getHeaderHeight?.() ?? 0;
        const frozenColsW = this.sheet!.frozenColsWidth || 0;
        const frozenRowsH = this.sheet!.frozenRowsHeight || 0;
        const viewW = this.viewport?.viewW ?? Infinity;
        const viewH = this.viewport?.viewH ?? Infinity;
        const fixedCols = this.sheet!.fixedColumnsStart || 0;
        const fixedRows = this.sheet!.fixedRowsTop || 0;

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
     * @private 私有方法 - 编辑器失焦处理
     *
     * 处理流程：
     * 1. 跳过滚动隐藏和输入法组合中的失焦
     * 2. 触发 EDITOR_BEFORE_FINISH 钩子
     * 3. 批量填充或单值提交
     * 4. 触发 EDITOR_AFTER_FINISH 钩子
     * 5. 刷新视口和画布
     */
    #onBlur(): void {
        if (this.#scrollHiding) return;
        if (this.composing) return;
        if (this.activeRow < 0 || !this.sheet) return;

        if (this.#commitLock) {
            this.hide();
            return;
        }

        const canFinish = this.sheet.bus?.emit(SHEET_EVENTS.EDITOR_BEFORE_FINISH, [this.activeRow, this.activeCol], { source: "CellEditor" });
        if (canFinish === false) {
            this.hide();
            this.#render();
            return;
        }

        let newValue: unknown = this.getEditorValue();
        const batchRange = this.sheet._batchFillRange;

        if (batchRange) {
            this.#batchFill(batchRange, newValue as string);
            delete this.sheet._batchFillRange;
        } else {
            newValue = this.sheet.parseCellValue(this.activeRow, this.activeCol, newValue as string);

            if (!this.validateBeforeCommit(newValue)) {
                (this.editor as HTMLInputElement).value = this.formatValueForEditor(this.originalValue);
                this.hide();
                this.#render();
                return;
            }

            let targetRow = this.activeRow;
            let targetCol = this.activeCol;
            const merge = this.sheet.getMerge(this.activeRow, this.activeCol);
            if (merge) {
                // 合并单元格的值存储在左上角
                targetRow = merge.topRow;
                targetCol = merge.topCol;
            }

            const oldCell = this.sheet.cellStore.get(targetRow, targetCol);
            if (this.areValuesEqual(oldCell?.value, newValue)) {
                this.hide();
                this.#render();
                return;
            }

            const changeData: ChangeDataItem[] = [{ row: targetRow, col: targetCol, oldValue: oldCell?.value, newValue }];
            const canChange = this.sheet.bus?.emit(SHEET_EVENTS.BEFORE_CHANGE, [changeData], { source: "CellEditor" });
            if (canChange === false) {
                (this.editor as HTMLInputElement).value = this.formatValueForEditor(this.originalValue);
                this.hide();
                this.#render();
                return;
            }

            this.sheet.setCell(targetRow, targetCol, newValue, oldCell?.styleId || 0);
            this.sheet.bus?.emit(SHEET_EVENTS.AFTER_CHANGE, [changeData], { source: "CellEditor" });
        }

        this.hide();

        this.sheet.bus?.emit(SHEET_EVENTS.EDITOR_AFTER_FINISH, [this.activeRow, this.activeCol, this.originalValue, newValue], {
            source: "CellEditor",
        });

        if (this.viewport && isFunction(this.viewport.invalidateAll)) {
            this.viewport.invalidateAll!();
        }
        this.#render();
    }

    /**
     * @private 私有方法 - 批量填充指定区域的单元格
     *
     * 遍历区域内的所有单元格，跳过禁用单元格和已处理的合并单元格，
     * 收集变更数据后统一触发 BEFORE_CHANGE/AFTER_CHANGE 事件。
     *
     * @param range - 填充区域范围
     * @param value - 填充值的字符串表示
     */
    #batchFill(range: MergeArea, value: string): void {
        const parsedValue = this.sheet!.parseCellValue(range.topRow, range.topCol, value);

        const changes: ChangeDataItem[] = [];
        const processedMerges = new Set<string>();

        for (let r = range.topRow; r <= range.bottomRow; r++) {
            for (let c = range.topCol; c <= range.bottomCol; c++) {
                if (this.sheet!.isDisabled(r, c)) continue;

                const merge = this.sheet!.getMerge(r, c);
                if (merge) {
                    // 合并单元格只处理左上角，避免重复写入
                    const mergeKey = `${merge.topRow},${merge.topCol}`;
                    if (processedMerges.has(mergeKey)) continue;
                    processedMerges.add(mergeKey);

                    const mergeR = merge.topRow;
                    const mergeC = merge.topCol;
                    const oldCell = this.sheet!.cellStore.get(mergeR, mergeC);
                    const oldValue = oldCell?.value ?? "";
                    if (oldValue !== parsedValue) {
                        changes.push({ row: mergeR, col: mergeC, oldValue, newValue: parsedValue });
                    }
                } else {
                    const oldCell = this.sheet!.cellStore.get(r, c);
                    const oldValue = oldCell?.value ?? "";
                    if (oldValue !== parsedValue) {
                        changes.push({ row: r, col: c, oldValue, newValue: parsedValue });
                    }
                }
            }
        }

        if (changes.length === 0) return;

        this.sheet!.bus!.emit(SHEET_EVENTS.BEFORE_CHANGE, [changes], { source: "CellEditor" });

        if (this.useBatchInBatchFill()) {
            this.sheet!.beginBatch();
        }
        for (const { row, col, newValue } of changes) {
            const oldCell = this.sheet!.cellStore.get(row, col);
            this.sheet!.setCell(row, col, newValue, oldCell?.styleId || 0);
        }
        if (this.useBatchInBatchFill()) {
            this.sheet!.endBatch();
        }

        this.sheet!.bus!.emit(SHEET_EVENTS.AFTER_CHANGE, [changes], { source: "CellEditor" });
    }

    /**
     * @private 私有方法 - 键盘按键处理
     *
     * 处理 Enter（提交并移动/填充）、Escape（取消编辑）、Tab（提交并水平移动）按键
     *
     * @param e - 键盘事件
     */
    #onKeyDown(e: KeyboardEvent): void {
        if (!this.sheet) return;
        if (this.composing) return;

        const isTextareaEditor = this.getElementType() === "textarea";

        switch (e.key) {
            case "Enter":
                if (isTextareaEditor) return;
                e.preventDefault();

                if (e.ctrlKey || e.metaKey) {
                    // Ctrl+Enter：提交并填充整个选区
                    this.#commitAndFillSelection();
                } else {
                    this.#commitAndMoveNext("enter");
                }

                break;
            case "Escape":
                e.preventDefault();
                // 恢复原始值并退出编辑
                (this.editor as HTMLInputElement).value = this.formatValueForEditor(this.originalValue);
                delete this.sheet._batchFillRange;
                (this.editor as HTMLInputElement).blur();
                break;
            case "Tab":
                if (isTextareaEditor) return;
                e.preventDefault();
                this.#commitAndMoveNext("tab", e.shiftKey);
                break;
        }
    }

    /**
     * @private 私有方法 - 提交当前值并填充整个选区
     * Ctrl+Enter 触发，将编辑值填充到选区内的所有单元格
     */
    #commitAndFillSelection(): void {
        if (this.activeRow < 0 || !this.sheet) return;

        const newValue = this.getEditorValue();
        const range = this.sheet.selection.getRange();

        this.#batchFill(range, newValue);

        this.hide();
        if (this.viewport && isFunction(this.viewport.invalidateAll)) {
            this.viewport.invalidateAll!();
        }
        this.#render();
    }

    /**
     * @private 私有方法 - 提交当前值并移动到下一个单元格
     *
     * Enter 向下移动，Tab 向右移动（Shift+Tab 向左移动）。
     * 自动处理合并单元格的跳转逻辑。
     *
     * @param direction - 移动方向，"enter" 或 "tab"
     * @param shiftKey - 是否按下 Shift 键（仅 Tab 方向有效）
     */
    #commitAndMoveNext(direction: string, shiftKey: boolean = false): void {
        const currentRow = this.activeRow;
        const currentCol = this.activeCol;

        // 加锁防止 blur 事件重复提交
        this.#commitLock = true;

        this.#commitWithoutBlur();

        this.hide();

        if (direction === "enter") {
            // 向下移动，跳过当前合并单元格
            let nextRow = currentRow + 1;
            const merge = this.sheet!.getMerge(currentRow, currentCol);
            if (merge && nextRow <= merge.bottomRow) {
                nextRow = merge.bottomRow + 1;
            }
            nextRow = Math.min(this.sheet!.rowColManager.rowCount - 1, Math.max(0, nextRow));
            const { row: targetRow } = this.#getTopLeft(nextRow, currentCol);
            const targetMerge = this.sheet!.getMerge(targetRow, currentCol);
            if (targetMerge) {
                this.sheet!.selection.setRange(targetMerge.topRow, targetMerge.topCol, targetMerge.bottomRow, targetMerge.bottomCol);
            } else {
                this.sheet!.selection.setActive(targetRow, currentCol);
            }
            this.viewport!.scrollToCell(targetRow, currentCol);
        } else if (direction === "tab") {
            // 水平移动，跳过当前合并单元格
            const nextCol = shiftKey ? currentCol - 1 : currentCol + 1;
            const colMerge = this.sheet!.getMerge(currentRow, currentCol);
            let targetCol = nextCol;
            if (colMerge) {
                if (shiftKey && nextCol >= colMerge.topCol) {
                    targetCol = colMerge.topCol - 1;
                } else if (!shiftKey && nextCol <= colMerge.bottomCol) {
                    targetCol = colMerge.bottomCol + 1;
                }
            }
            targetCol = Math.min(this.sheet!.rowColManager.realColCount - 1, Math.max(0, targetCol));
            const { col: finalCol } = this.#getTopLeft(currentRow, targetCol);
            const tabTargetMerge = this.sheet!.getMerge(currentRow, finalCol);
            if (tabTargetMerge) {
                this.sheet!.selection.setRange(tabTargetMerge.topRow, tabTargetMerge.topCol, tabTargetMerge.bottomRow, tabTargetMerge.bottomCol);
            } else {
                this.sheet!.selection.setActive(currentRow, finalCol);
            }
            this.viewport!.scrollToCell(currentRow, finalCol);
        }

        this.#render();

        if (this.editor) {
            (this.editor as HTMLInputElement).blur();
        }

        this.hide();

        this.#commitLock = false;
    }

    /**
     * @private 私有方法 - 获取单元格的左上角坐标
     * 如果是合并单元格，返回合并区域的左上角行列号
     *
     * @param row - 行号
     * @param col - 列号
     * @returns 左上角坐标
     */
    #getTopLeft(row: number, col: number): { row: number; col: number } {
        const merge = this.sheet?.getMerge(row, col);
        if (merge) {
            return { row: merge.topRow, col: merge.topCol };
        }
        return { row, col };
    }

    /**
     * @private 私有方法 - 提交编辑值但不触发 blur
     *
     * 在 commitAndMoveNext 流程中使用，先提交值再移动选区，
     * 避免 blur 事件干扰移动逻辑。流程与 #onBlur 类似但跳过渲染。
     */
    #commitWithoutBlur(): void {
        if (this.activeRow < 0 || !this.sheet) return;

        const canFinish = this.sheet.bus?.emit(SHEET_EVENTS.EDITOR_BEFORE_FINISH, [this.activeRow, this.activeCol], { source: "CellEditor" });
        if (canFinish === false) {
            this.hide();
            return;
        }

        let newValue: unknown = this.getEditorValue();
        const batchRange = this.sheet._batchFillRange;

        if (batchRange) {
            this.#batchFill(batchRange, newValue as string);
            delete this.sheet._batchFillRange;
        } else {
            newValue = this.sheet.parseCellValue(this.activeRow, this.activeCol, newValue as string);

            if (!this.validateBeforeCommit(newValue)) {
                (this.editor as HTMLInputElement).value = this.formatValueForEditor(this.originalValue);
                this.hide();
                return;
            }

            let targetRow = this.activeRow;
            let targetCol = this.activeCol;
            const merge = this.sheet.getMerge(this.activeRow, this.activeCol);
            if (merge) {
                targetRow = merge.topRow;
                targetCol = merge.topCol;
            }

            const oldCell = this.sheet.cellStore.get(targetRow, targetCol);
            if (this.areValuesEqual(oldCell?.value, newValue)) {
                this.hide();
                return;
            }

            const changeData: ChangeDataItem[] = [{ row: targetRow, col: targetCol, oldValue: oldCell?.value, newValue }];
            const canChange = this.sheet.bus?.emit(SHEET_EVENTS.BEFORE_CHANGE, [changeData], { source: "CellEditor" });
            if (canChange === false) {
                (this.editor as HTMLInputElement).value = this.formatValueForEditor(this.originalValue);
                this.hide();
                return;
            }

            this.sheet.setCell(targetRow, targetCol, newValue, oldCell?.styleId || 0);
            this.sheet.bus?.emit(SHEET_EVENTS.AFTER_CHANGE, [changeData], { source: "CellEditor" });
        }

        this.hide();

        this.sheet.bus?.emit(SHEET_EVENTS.EDITOR_AFTER_FINISH, [this.activeRow, this.activeCol, this.originalValue, newValue], {
            source: "CellEditor",
        });

        if (this.viewport && isFunction(this.viewport.invalidateAll)) {
            this.viewport.invalidateAll!();
        }
    }

    /**
     * @private 私有方法 - 触发画布重新渲染
     */
    #render(): void {
        if (this.sheet && this.canvasContext && isFunction(this.canvasContext.render)) {
            this.canvasContext.render(this.sheet);
        }
    }

    /**
     * 获取编辑器当前值
     * @returns 编辑器输入值，编辑器不存在时返回空字符串
     */
    getValue(): string {
        return (this.editor as HTMLInputElement)?.value ?? "";
    }

    /**
     * 设置编辑器的值
     *
     * @param value - 要设置的值
     */
    setValue(value: unknown): void {
        if (this.editor) {
            (this.editor as HTMLInputElement).value = String(value);
        }
    }

    /** 聚焦编辑器 */
    focus(): void {
        (this.editor as HTMLInputElement)?.focus();
    }

    /**
     * 销毁编辑器，释放所有引用
     * 清空渲染引擎、工作表、编辑器 DOM 等引用，防止内存泄漏
     */
    onDestroy(): void {
        this.renderEngine = null;
        this.sheet = null;
        this.editor = null;
        this.activeRow = -1;
        this.activeCol = -1;
        this.composing = false;
        this.originalValue = "";
    }
}
