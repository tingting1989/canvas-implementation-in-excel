import { colToIndex } from "../../utils/cellRef.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { getValidationCache } from "./ValidationCache.js";

const UI_EVENTS = Object.freeze({
    DROPDOWN_SHOW: "validation:ui:dropdown:show",
    DROPDOWN_HIDE: "validation:ui:dropdown:hide",
    DROPDOWN_SELECT: "validation:ui:dropdown:select",
    TOOLTIP_SHOW: "validation:ui:tooltip:show",
    TOOLTIP_HIDE: "validation:ui:tooltip:hide",
    INPUT_MESSAGE_SHOW: "validation:ui:inputMessage:show",
    INPUT_MESSAGE_HIDE: "validation:ui:inputMessage:hide",
});

const ERROR_STYLE_COLORS = Object.freeze({
    stop: { bg: "#FFCDD2", border: "#F44336", icon: "❌" },
    warning: { bg: "#FFF9C4", border: "#FF9800", icon: "⚠️" },
    information: { bg: "#E3F2FD", border: "#2196F3", icon: "ℹ️" },
});

const VALID_ICON = "✓";

const ICON_COLORS = Object.freeze({
    valid: "#4CAF50",
    invalid: "#F44336",
    pending: "#9E9E9E",
    deferred: "#FF9800",
    warning: "#FF9800",
    error: "#F44336",
});

export const ICON_STATUS = Object.freeze({
    VALID: "valid",
    INVALID: "invalid",
    PENDING: "pending",
    DEFERRED: "deferred",
    WARNING: "warning",
    ERROR: "error",
});

export class ValidationUIController {
    #portalManager: any = null;
    #validationPlugin: any = null;
    #renderEngine: any = null;
    #initialized: boolean = false;
    #dropdownState: {
        row: number;
        col: number;
        options: string[];
        activeIndex: number;
        listEl: HTMLElement;
        portalId: string;
    } | null = null;
    #tooltipState: { row: number; col: number; portalId: string } | null = null;
    #inputMessageState: { row: number; col: number; portalId: string } | null = null;
    #dropdownArrowCells: Set<string> = new Set();
    #globalClickHandler: ((event: MouseEvent) => void) | null = null;
    #globalKeyHandler: ((event: KeyboardEvent) => void) | null = null;
    #tooltipTimer: ReturnType<typeof setTimeout> | null = null;
    #debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    #pendingValidations: Set<string> = new Set();
    #maxConcurrentValidations: number = 5;
    #currentConcurrentCount: number = 0;
    #debounceDelay: number = 50;
    #iconStatusCaches: Map<string, Map<string, string>> = new Map();

    constructor(sheet: any, portalManager: any, validationPlugin: any, renderEngine: any) {
        this.#portalManager = portalManager;
        this.#validationPlugin = validationPlugin;
        this.#renderEngine = renderEngine;
    }

    #getCurrentCache(): Map<string, string> {
        const sheetName = this.#validationPlugin?.sheet?.name || "__default__";
        let cache = this.#iconStatusCaches.get(sheetName);
        if (!cache) {
            cache = new Map();
            this.#iconStatusCaches.set(sheetName, cache);
        }
        return cache;
    }

    init(): void {
        if (this.#initialized) return;

        this.#registerGlobalListeners();
        this.#scanDropdownArrowCells();
        this.#initialized = true;
    }

    get isInitialized(): boolean {
        return this.#initialized;
    }

    renderDropdownArrow(row: number, col: number): void {
        this.#dropdownArrowCells.add(`${row},${col}`);
    }

    removeDropdownArrow(row: number, col: number): void {
        this.#dropdownArrowCells.delete(`${row},${col}`);
    }

    showDropdown(row: number, col: number, options: string[], position: Record<string, any>): void {
        this.hideDropdown();

        if (!this.#portalManager?.isInitialized) return;

        const portalEl = this.#portalManager.createPortal(
            `dropdown_${row}_${col}`,
            "dropdown",
            { x: position.x, y: position.y + position.height, width: position.width || 150 },
            { autoRemove: false },
        );

        const listEl = document.createElement("ul");
        listEl.className = "validation-portal-dropdown";
        Object.assign(listEl.style, {
            listStyle: "none",
            margin: "0",
            padding: "4px 0",
            backgroundColor: "#fff",
            border: "1px solid #ddd",
            borderRadius: "4px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            maxHeight: "200px",
            overflowY: "auto",
            fontSize: "13px",
            fontFamily: "inherit",
        });

        let activeIndex = -1;
        const currentValue = this.#validationPlugin?.sheet?.cellStore?.get(row, col)?.value;

        options.forEach((option: string, index: number) => {
            const itemEl = document.createElement("li");
            itemEl.className = "validation-portal-dropdown-item";
            itemEl.textContent = String(option);
            Object.assign(itemEl.style, {
                padding: "6px 12px",
                cursor: "pointer",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
            });

            if (String(option) === String(currentValue)) {
                activeIndex = index;
                itemEl.style.backgroundColor = "#E3F2FD";
                itemEl.style.fontWeight = "bold";
            }

            itemEl.addEventListener("mouseenter", () => {
                this.#clearDropdownHighlight(listEl);
                itemEl.style.backgroundColor = "#E3F2FD";
                activeIndex = index;
            });

            itemEl.addEventListener("mouseleave", () => {
                itemEl.style.backgroundColor = "";
            });

            itemEl.addEventListener("click", () => {
                this.#selectDropdownOption(row, col, option);
            });

            listEl.appendChild(itemEl);
        });

        portalEl.appendChild(listEl);

        this.#dropdownState = {
            row,
            col,
            options,
            activeIndex,
            listEl,
            portalId: `dropdown_${row}_${col}`,
        };
    }

    hideDropdown(): void {
        if (!this.#dropdownState) return;

        this.#portalManager?.removePortal(this.#dropdownState.portalId);
        this.#dropdownState = null;
    }

    handleDropdownKeyboard(event: KeyboardEvent): boolean {
        if (!this.#dropdownState) return false;

        const { key } = event;
        const { options, listEl, activeIndex } = this.#dropdownState;

        if (key === "ArrowDown" || key === "ArrowUp") {
            event.preventDefault();
            const direction = key === "ArrowDown" ? 1 : -1;
            let newIndex = (this.#dropdownState.activeIndex ?? -1) + direction;

            if (newIndex < 0) newIndex = options.length - 1;
            if (newIndex >= options.length) newIndex = 0;

            this.#dropdownState.activeIndex = newIndex;
            this.#clearDropdownHighlight(listEl);

            const items = listEl.querySelectorAll(".validation-portal-dropdown-item");
            if (items[newIndex]) {
                (items[newIndex] as HTMLElement).style.backgroundColor = "#E3F2FD";
                items[newIndex].scrollIntoView({ block: "nearest" });
            }
            return true;
        }

        if (key === "Enter") {
            event.preventDefault();
            const idx = this.#dropdownState.activeIndex;
            if (idx >= 0 && idx < options.length) {
                this.#selectDropdownOption(this.#dropdownState.row, this.#dropdownState.col, options[idx]);
            }
            return true;
        }

        if (key === "Escape") {
            event.preventDefault();
            this.hideDropdown();
            return true;
        }

        return false;
    }

    showErrorTooltip(row: number, col: number, message: string, level: string = "stop"): void {
        this.hideErrorTooltip();

        if (!this.#portalManager?.isInitialized) return;

        const colors: any = ERROR_STYLE_COLORS[level as keyof typeof ERROR_STYLE_COLORS] || ERROR_STYLE_COLORS.stop;

        const cellRect = this.#getCellRect(row, col);
        if (!cellRect) return;

        const portalEl = this.#portalManager.createPortal(
            `tooltip_${row}_${col}`,
            "tooltip",
            { x: cellRect.x + cellRect.width + 4, y: cellRect.y },
            { autoRemove: true, autoRemoveDelay: 3000 },
        );

        portalEl.className = `validation-portal-tooltip validation-portal-tooltip-${level}`;

        const contentEl = document.createElement("div");
        Object.assign(contentEl.style, {
            backgroundColor: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: "4px",
            padding: "8px 12px",
            fontSize: "12px",
            fontFamily: "inherit",
            maxWidth: "250px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            lineHeight: "1.4",
        });

        const iconSpan = document.createElement("span");
        iconSpan.textContent = colors.icon + " ";
        contentEl.appendChild(iconSpan);

        const msgSpan = document.createElement("span");
        msgSpan.textContent = message;
        contentEl.appendChild(msgSpan);

        portalEl.appendChild(contentEl);

        this.#tooltipState = { row, col, portalId: `tooltip_${row}_${col}` };

        this.#tooltipTimer = setTimeout(() => {
            this.hideErrorTooltip();
        }, 3000);
    }

    hideErrorTooltip(): void {
        if (this.#tooltipTimer) {
            clearTimeout(this.#tooltipTimer);
            this.#tooltipTimer = null;
        }

        if (!this.#tooltipState) return;

        this.#portalManager?.removePortal(this.#tooltipState.portalId);
        this.#tooltipState = null;
    }

    showInputMessage(row: number, col: number, title: string, message: string): void {
        this.hideInputMessage();

        if (!this.#portalManager?.isInitialized) return;

        const cellRect = this.#getCellRect(row, col);
        if (!cellRect) return;

        const portalEl = this.#portalManager.createPortal(
            `inputMsg_${row}_${col}`,
            "inputMessage",
            { x: cellRect.x + cellRect.width + 4, y: cellRect.y },
            { autoRemove: false },
        );

        portalEl.className = "validation-portal-input-message";

        const containerEl = document.createElement("div");
        Object.assign(containerEl.style, {
            backgroundColor: "#FFFDE7",
            border: "1px solid #F9A825",
            borderRadius: "4px",
            padding: "8px 12px",
            fontSize: "12px",
            fontFamily: "inherit",
            maxWidth: "250px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        });

        if (title) {
            const titleEl = document.createElement("div");
            titleEl.textContent = title;
            Object.assign(titleEl.style, {
                fontWeight: "bold",
                marginBottom: "4px",
                color: "#333",
            });
            containerEl.appendChild(titleEl);
        }

        const msgEl = document.createElement("div");
        msgEl.textContent = message;
        Object.assign(msgEl.style, { color: "#555", lineHeight: "1.4" });
        containerEl.appendChild(msgEl);

        portalEl.appendChild(containerEl);

        this.#inputMessageState = { row, col, portalId: `inputMsg_${row}_${col}` };
    }

    hideInputMessage(): void {
        if (!this.#inputMessageState) return;

        this.#portalManager?.removePortal(this.#inputMessageState.portalId);
        this.#inputMessageState = null;
    }

    drawValidationIcon(ctx: CanvasRenderingContext2D, x: number, y: number, status: string, size: number = 14): void {
        const color = (ICON_COLORS as any)[status] || ICON_COLORS.pending;

        ctx.save();

        switch (status) {
            case ICON_STATUS.VALID:
                this.#drawCheckmark(ctx, x, y, size, color);
                break;
            case ICON_STATUS.INVALID:
                this.#drawCrossmark(ctx, x, y, size, color);
                break;
            case ICON_STATUS.PENDING:
                this.#drawPendingSymbol(ctx, x, y, size, color);
                break;
            case ICON_STATUS.DEFERRED:
                this.#drawDeferredSymbol(ctx, x, y, size, color);
                break;
            case ICON_STATUS.WARNING:
                this.#drawWarningSymbol(ctx, x, y, size, color);
                break;
            case ICON_STATUS.ERROR:
                this.#drawErrorSymbol(ctx, x, y, size, color);
                break;
            default:
                this.#drawPendingSymbol(ctx, x, y, size, color);
        }

        ctx.restore();
    }

    #drawCheckmark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.beginPath();
        ctx.moveTo(x + size * 0.15, y + size * 0.5);
        ctx.lineTo(x + size * 0.4, y + size * 0.75);
        ctx.lineTo(x + size * 0.85, y + size * 0.25);
        ctx.stroke();
    }

    #drawCrossmark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(x + size * 0.2, y + size * 0.2);
        ctx.lineTo(x + size * 0.8, y + size * 0.8);
        ctx.moveTo(x + size * 0.8, y + size * 0.2);
        ctx.lineTo(x + size * 0.2, y + size * 0.8);
        ctx.stroke();
    }

    #drawPendingSymbol(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size * 0.4, 0, Math.PI * 2);
        ctx.stroke();
    }

    #drawDeferredSymbol(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
        const cx = x + size / 2;
        const cy = y + size / 2;
        const r = size * 0.4;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI * 0.5, Math.PI * 1.5);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
    }

    #drawWarningSymbol(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
        const cx = x + size / 2;
        const topY = y + size * 0.05;
        const bottomY = y + size * 0.9;
        const leftX = x + size * 0.05;
        const rightX = x + size * 0.95;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx, topY);
        ctx.lineTo(rightX, bottomY);
        ctx.lineTo(leftX, bottomY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#fff";
        ctx.font = `bold ${size * 0.5}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("!", cx, y + size * 0.6);
    }

    #drawErrorSymbol(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
        const cx = x + size / 2;
        const cy = y + size / 2;
        const r = size * 0.45;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(cx - r * 0.5, cy - r * 0.5);
        ctx.lineTo(cx + r * 0.5, cy + r * 0.5);
        ctx.moveTo(cx + r * 0.5, cy - r * 0.5);
        ctx.lineTo(cx - r * 0.5, cy + r * 0.5);
        ctx.stroke();
    }

    renderValidationIcons(viewport: {
        startRow: number;
        endRow: number;
        startCol: number;
        endCol: number;
        scrollX?: number;
        scrollY?: number;
        headerH?: number;
        headerW?: number;
        frozenColsW?: number;
        frozenRowsH?: number;
        viewW?: number;
        viewH?: number;
    }): void {
        if (!this.#validationPlugin?.engine || !this.#renderEngine) return;

        const ctx = this.#renderEngine.ctx;
        if (!ctx) return;

        const { startRow, endRow, startCol, endCol } = viewport;
        const scrollX = viewport.scrollX ?? 0;
        const scrollY = viewport.scrollY ?? 0;
        const headerH = viewport.headerH ?? 0;
        const headerW = viewport.headerW ?? 0;
        const frozenColsW = viewport.frozenColsW ?? 0;
        const frozenRowsH = viewport.frozenRowsH ?? 0;
        const viewW = viewport.viewW ?? 0;
        const viewH = viewport.viewH ?? 0;

        const sheet = this.#validationPlugin.sheet;
        const fixedCols = (sheet as any).fixedColumnsStart ?? 0;
        const fixedRows = (sheet as any).fixedRowsTop ?? 0;

        const iconsToDraw: Record<string, Array<{ x: number; y: number; size: number }>> = {
            [ICON_STATUS.VALID]: [],
            [ICON_STATUS.INVALID]: [],
            [ICON_STATUS.PENDING]: [],
            [ICON_STATUS.DEFERRED]: [],
            [ICON_STATUS.WARNING]: [],
            [ICON_STATUS.ERROR]: [],
        };

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const rules = this.#validationPlugin.getRulesForCell(row, col);
                if (rules.length === 0) continue;

                const key = `${row},${col}`;
                const cachedStatus = this.#getCurrentCache().get(key);

                if (!cachedStatus) {
                    const cell = this.#validationPlugin?.sheet?.cellDataAccessor?.get(row, col);
                    if (!cell) continue;

                    this.#scheduleStatusUpdate(row, col, cell.value, rules);
                    continue;
                }

                const cellRect = this.#getCellRectWithViewport(row, col, scrollX, scrollY, headerH, headerW);
                if (!cellRect) continue;

                const iconX = cellRect.x + cellRect.width - 14;
                const iconY = cellRect.y;

                const isFrozenCol = col < fixedCols;
                const isFrozenRow = row < fixedRows;

                let validPosition = false;

                if (isFrozenCol && isFrozenRow) {
                    validPosition = iconX >= headerW && iconX < headerW + frozenColsW && iconY >= headerH && iconY < headerH + frozenRowsH;
                } else if (isFrozenCol && !isFrozenRow) {
                    validPosition = iconX >= headerW && iconX < headerW + frozenColsW && iconY >= headerH + frozenRowsH && iconY <= viewH;
                } else if (!isFrozenCol && isFrozenRow) {
                    validPosition = iconX >= headerW + frozenColsW && iconX <= viewW && iconY >= headerH && iconY < headerH + frozenRowsH;
                } else {
                    validPosition = iconX >= headerW + frozenColsW && iconX <= viewW && iconY >= headerH + frozenRowsH && iconY <= viewH;
                }

                if (!validPosition) continue;

                if (iconsToDraw[cachedStatus]) {
                    iconsToDraw[cachedStatus].push({
                        x: iconX,
                        y: iconY,
                        size: 12,
                    });
                }
            }
        }

        for (const [status, icons] of Object.entries(iconsToDraw)) {
            if (icons.length === 0) continue;

            for (const { x, y, size } of icons) {
                this.drawValidationIcon(ctx, x, y, status, size);
            }
        }
    }

    #getCellRectWithViewport(
        row: number,
        col: number,
        scrollX: number,
        scrollY: number,
        headerH: number,
        headerW: number,
    ): {
        x: number;
        y: number;
        width: number;
        height: number;
    } | null {
        if (!this.#renderEngine || !this.#validationPlugin?.sheet) return null;

        const sheet = this.#validationPlugin.sheet;
        const rc = (sheet as any).rowColManager;
        if (!rc) return null;

        try {
            const fixedCols = (sheet as any).fixedColumnsStart ?? 0;
            const fixedRows = (sheet as any).fixedRowsTop ?? 0;

            const isFrozenCol = col < fixedCols;
            const isFrozenRow = row < fixedRows;

            const effectiveSx = isFrozenCol ? 0 : scrollX;
            const effectiveSy = isFrozenRow ? 0 : scrollY;

            let x: number, y: number, width: number, height: number;

            x = headerW + rc.getColX(col) - effectiveSx;

            y = headerH + rc.getRowY(row) - effectiveSy;

            width = rc.getColWidth(col);
            height = rc.getRowHeight(row);

            return { x, y, width, height };
        } catch (e) {
            return this.#getCellRect(row, col);
        }
    }

    #scheduleStatusUpdate(row: number, col: number, value: any, rules?: any[]): void {
        const key = `${row},${col}`;

        if (this.#pendingValidations.has(key)) return;

        const engine = this.#validationPlugin.engine;

        let result: any = null;
        if (engine.getFromCache) {
            result = engine.getFromCache(key, value);
        }

        if (!result && engine.validateCellSync) {
            try {
                result = engine.validateCellSync(row, col, value);
            } catch (error: any) {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationUIController] 同步验证失败", {
                    error,
                    row,
                    col,
                });
            }
        }

        if (result) {
            let status: string;
            if (result.valid) {
                status = ICON_STATUS.VALID;
            } else {
                const statusMap: Record<string, string> = {
                    stop: ICON_STATUS.INVALID,
                    warning: ICON_STATUS.WARNING,
                    information: ICON_STATUS.DEFERRED,
                };
                status = statusMap[result.errorStyle] || ICON_STATUS.INVALID;
            }
            this.#getCurrentCache().set(key, status);

            const cache = getValidationCache();
            if (cache) {
                cache
                    .set(
                        key,
                        {
                            valid: result.valid,
                            errorStyle: result.errorStyle,
                            value,
                            ruleId: result.ruleId,
                        },
                        { source: "sync-validation" },
                    )
                    .catch(() => {});
            }
            return;
        }

        this.scheduleAsyncValidation(row, col, value, rules);
    }

    async determineIconStatus(row: number, col: number, value: any): Promise<{ status: string; source: string }> {
        const key = `${row},${col}`;

        try {
            const cache = getValidationCache();
            const cached = cache ? await cache.get(key) : null;

            if (cached && cached.result != null) {
                let status: string;
                if (cached.result.valid) {
                    status = ICON_STATUS.VALID;
                } else {
                    const statusMap: Record<string, string> = {
                        stop: ICON_STATUS.INVALID,
                        warning: ICON_STATUS.WARNING,
                        information: ICON_STATUS.DEFERRED,
                    };
                    status = statusMap[cached.result.errorStyle] || ICON_STATUS.INVALID;
                }
                this.#getCurrentCache().set(key, status);
                return { status, source: cached.source || "cache" };
            }

            const rules = this.#validationPlugin?.getRulesForCell(row, col) || [];
            if (rules.length === 0) {
                return { status: ICON_STATUS.PENDING, source: "no-rules" };
            }

            const engine = this.#validationPlugin.engine;
            let result: any = null;

            if (engine.getFromCache) {
                result = engine.getFromCache(key, value);
            }

            if (!result && engine.validateCellSync) {
                result = engine.validateCellSync(row, col, value);
            }

            if (result) {
                let status: string;
                if (result.valid) {
                    status = ICON_STATUS.VALID;
                } else {
                    const statusMap: Record<string, string> = {
                        stop: ICON_STATUS.INVALID,
                        warning: ICON_STATUS.WARNING,
                        information: ICON_STATUS.DEFERRED,
                    };
                    status = statusMap[result.errorStyle] || ICON_STATUS.INVALID;
                }
                this.#getCurrentCache().set(key, status);

                const advCache = getValidationCache();
                if (advCache) {
                    await advCache.set(
                        key,
                        { valid: result.valid, errorStyle: result.errorStyle, value, ruleId: result.ruleId },
                        { source: "sync-validation" },
                    );
                }

                return { status, source: "sync-validation" };
            }

            this.scheduleAsyncValidation(row, col, value, rules);

            return { status: ICON_STATUS.PENDING, source: "async-scheduled" };
        } catch (error: any) {
            errorHandler.error(ERROR_CODE.VALIDATION_ERROR, "[ValidationUIController] determineIconStatus() 异常", {
                error,
                row,
                col,
            });

            return { status: ICON_STATUS.ERROR, source: "error" };
        }
    }

    scheduleAsyncValidation(row: number, col: number, value: any, rules?: any[]): void {
        const key = `${row},${col}`;

        if (this.#pendingValidations.has(key)) return;

        if (this.#currentConcurrentCount >= this.#maxConcurrentValidations) {
            errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationUIController] 并发数已达上限，跳过验证", { key });
            return;
        }

        if (this.#debounceTimers.has(key)) {
            clearTimeout(this.#debounceTimers.get(key)!);
        }

        const timerId = setTimeout(async () => {
            this.#debounceTimers.delete(key);
            this.#pendingValidations.add(key);
            this.#currentConcurrentCount++;

            try {
                const engine = this.#validationPlugin.engine;
                if (engine.validateCell) {
                    const result = await engine.validateCell(row, col, value, rules);

                    this.#pendingValidations.delete(key);

                    if (result) {
                        let status: string;
                        if (result.valid) {
                            status = ICON_STATUS.VALID;
                        } else {
                            const statusMap: Record<string, string> = {
                                stop: ICON_STATUS.INVALID,
                                warning: ICON_STATUS.WARNING,
                                information: ICON_STATUS.DEFERRED,
                            };
                            status = statusMap[result.errorStyle] || ICON_STATUS.INVALID;
                        }
                        this.#getCurrentCache().set(key, status);
                    }

                    this.requestPartialRedraw(row, col);
                }
            } catch (error: any) {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[ValidationUIController] 异步验证失败: ${key}`, { error });
                this.#pendingValidations.delete(key);
            } finally {
                this.#currentConcurrentCount--;
            }
        }, this.#debounceDelay);

        this.#debounceTimers.set(key, timerId);
    }

    requestPartialRedraw(row: number, col: number): void {
        if (this.#renderEngine && typeof this.#renderEngine.requestRender === "function") {
            this.#renderEngine.requestRender();
        }
    }

    clearAllStatus(): void {
        this.#getCurrentCache().clear();
        this.#pendingValidations.clear();
        this.#debounceTimers.forEach((timerId) => clearTimeout(timerId));
        this.#debounceTimers.clear();
        this.#currentConcurrentCount = 0;
    }

    clearPendingValidations(): void {
        this.#pendingValidations.clear();
        this.#debounceTimers.forEach((timerId) => clearTimeout(timerId));
        this.#debounceTimers.clear();
        this.#currentConcurrentCount = 0;
    }

    hasDropdownArrow(row: number, col: number): boolean {
        return this.#dropdownArrowCells.has(`${row},${col}`);
    }

    invalidateCellStatus(row: number, col: number): void {
        const key = `${row},${col}`;
        this.#getCurrentCache().delete(key);
    }

    setIconStatus(row: number, col: number, valid: boolean, errorStyle: string): void {
        const key = `${row},${col}`;
        const cache = this.#getCurrentCache();
        if (valid) {
            cache.set(key, ICON_STATUS.VALID);
        } else {
            const statusMap: Record<string, string> = {
                stop: ICON_STATUS.INVALID,
                warning: ICON_STATUS.WARNING,
                information: ICON_STATUS.DEFERRED,
            };
            cache.set(key, statusMap[errorStyle] || ICON_STATUS.INVALID);
        }
    }

    onRuleChanged(rule: any, removed: boolean = false): void {
        if (rule.type !== "list") return;

        if (removed) {
            this.#scanDropdownArrowCells();
        } else {
            const cells = this.#getCellsInRange(rule.range);
            cells.forEach(({ row, col }) => {
                this.renderDropdownArrow(row, col);
            });
        }
    }

    onCellSelected(row: number, col: number): void {
        this.hideInputMessage();

        const rules = this.#validationPlugin?.getRulesForCell(row, col) || [];
        for (const rule of rules) {
            if (rule.inputMessage) {
                this.showInputMessage(row, col, rule.inputTitle || "提示", rule.inputMessage);
                break;
            }
        }
    }

    destroy(): void {
        this.hideDropdown();
        this.hideErrorTooltip();
        this.hideInputMessage();

        this.#unregisterGlobalListeners();

        this.#cleanupAsyncResources();

        this.#dropdownArrowCells.clear();
        this.#iconStatusCaches.clear();
        this.#pendingValidations.clear();

        this.#portalManager = null;
        this.#validationPlugin = null;
        this.#renderEngine = null;

        this.#initialized = false;
    }

    #cleanupAsyncResources(): void {
        for (const [key, timerId] of this.#debounceTimers) {
            clearTimeout(timerId);
        }
        this.#debounceTimers.clear();

        this.#currentConcurrentCount = 0;

        this.#pendingValidations.clear();

        this.#iconStatusCaches.clear();
    }

    #selectDropdownOption(row: number, col: number, option: any): void {
        this.hideDropdown();
        if (this.#validationPlugin?.sheet?.cellStore) {
            this.#validationPlugin?.sheet.setCell?.(row, col, option);
        }
    }

    #clearDropdownHighlight(listEl: HTMLElement): void {
        const items = listEl.querySelectorAll(".validation-portal-dropdown-item");
        items.forEach((item) => {
            (item as HTMLElement).style.backgroundColor = "";
        });
    }

    #getCellRect(row: number, col: number): { x: number; y: number; width: number; height: number } | null {
        if (!this.#renderEngine) return null;
        const rect = this.#renderEngine.getCellRect(row, col);
        if (!rect) return null;
        return {
            x: rect.x,
            y: rect.y,
            width: rect.width ?? rect.w ?? 0,
            height: rect.height ?? rect.h ?? 0,
        };
    }

    #scanDropdownArrowCells(): void {
        this.#dropdownArrowCells.clear();

        if (!this.#validationPlugin?.engine) return;

        const rules = this.#validationPlugin.getAllRules();
        for (const rule of rules) {
            if (rule.type === "list" && rule.showDropdown !== false) {
                const cells = this.#getCellsInRange(rule.range);
                cells.forEach(({ row, col }) => {
                    this.#dropdownArrowCells.add(`${row},${col}`);
                });
            }
        }
    }

    #getCellsInRange(rangeStr: string): Array<{ row: number; col: number }> {
        const cells: Array<{ row: number; col: number }> = [];

        const fullColMatch = rangeStr.match(/^([A-Z]+):([A-Z]+)$/);
        if (fullColMatch) {
            const startCol = colToIndex(fullColMatch[1]);
            const endCol = colToIndex(fullColMatch[2]);
            const maxRow = Math.min(this.#validationPlugin?.sheet?.rowCount || 1000, 1000);
            for (let col = startCol; col <= endCol; col++) {
                for (let row = 0; row < maxRow; row++) {
                    cells.push({ row, col });
                }
            }
            return cells;
        }

        const rangeMatch = rangeStr.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
        if (rangeMatch) {
            const startRow = parseInt(rangeMatch[2]) - 1;
            const startCol = colToIndex(rangeMatch[1]);
            const endRow = parseInt(rangeMatch[4]) - 1;
            const endCol = colToIndex(rangeMatch[3]);
            for (let row = startRow; row <= endRow; row++) {
                for (let col = startCol; col <= endCol; col++) {
                    cells.push({ row, col });
                }
            }
        }

        return cells;
    }

    #registerGlobalListeners(): void {
        this.#globalClickHandler = (event: MouseEvent) => {
            if (this.#dropdownState) {
                const portal = this.#portalManager?.getPortal(this.#dropdownState.portalId);
                if (portal && !portal.contains(event.target as Node)) {
                    this.hideDropdown();
                }
            }
        };

        this.#globalKeyHandler = (event: KeyboardEvent) => {
            if (this.handleDropdownKeyboard(event)) {
                return;
            }

            if (event.key === "Escape") {
                this.hideErrorTooltip();
                this.hideInputMessage();
            }
        };

        document.addEventListener("mousedown", this.#globalClickHandler, true);
        document.addEventListener("keydown", this.#globalKeyHandler, true);
    }

    #unregisterGlobalListeners(): void {
        if (this.#globalClickHandler) {
            document.removeEventListener("mousedown", this.#globalClickHandler, true);
            this.#globalClickHandler = null;
        }

        if (this.#globalKeyHandler) {
            document.removeEventListener("keydown", this.#globalKeyHandler, true);
            this.#globalKeyHandler = null;
        }
    }
}

export { UI_EVENTS, ERROR_STYLE_COLORS, ICON_COLORS };
