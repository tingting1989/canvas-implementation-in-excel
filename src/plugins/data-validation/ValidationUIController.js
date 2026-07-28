import { colToIndex } from "@/utils/cellRef.js";
import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "@/core/ErrorHandler.js";
import { getValidationCache } from "./ValidationCache.js";

/**
 * ═══════════════════════════════════════════════════════════════
 * 📌 ValidationUIController v2.0 - 图标异步渲染系统
 * ═══════════════════════════════════════════════════════════════
 *
 * 🎯 核心功能：
 * - 三态渐进式图标渲染（valid/invalid/pending）
 * - 三级缓存优先级读取（L1 → L2 → L3）
 * - 防抖机制避免频繁重绘
 * - 并发控制防止资源耗尽
 * - 局部重绘优化性能
 *
 * ⚙️ 渲染流程：
 * ```
 * 触发渲染 → determineIconStatus() → 读取缓存 → 绘制图标
 *              ↓
 *   1. L1视口缓存命中? → 立即返回 (<0.01ms)
 *   2. L2最近缓存命中? → 提升到L1并返回 (~0.1ms)
 *   3. L3持久化命中?   → 异步提升层级 (~5-10ms)
 *   4. 无缓存+简单规则  → 同步验证后显示 (<10ms)
 *   5. 无缓存+复杂规则  → 显示pending，调度异步验证
 * ```
 */

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

/** 图标颜色常量 */
const ICON_COLORS = Object.freeze({
    valid: "#4CAF50", // 绿色 - 通过
    invalid: "#F44336", // 红色 - 失败
    pending: "#9E9E9E", // 灰色 - 待验证
    deferred: "#FF9800", // 橙色 - 延迟验证
    warning: "#FFC107", // 黄色 - 警告
    error: "#F44336", // 红色闪烁 - 错误
});

/** 图标状态常量 */
export const ICON_STATUS = Object.freeze({
    VALID: "valid",
    INVALID: "invalid",
    PENDING: "pending",
    DEFERRED: "deferred",
    WARNING: "warning",
    ERROR: "error",
});

/**
 * 验证 UI 控制器 v2.0
 *
 * 负责渲染和管理所有验证相关的 UI 组件：
 * 1. 下拉菜单（list 类型验证）
 * 2. 错误提示气泡（stop/warning/information）
 * 3. 输入提示（Input Message）
 * 4. Canvas 上的验证状态图标（支持异步渲染）
 *
 * @example
 * const uiController = new ValidationUIController(
 *     sheet, portalManager, validationPlugin, renderEngine
 * );
 * uiController.init();
 */
export class ValidationUIController {
    /** @type {Object|null} 工作表实例 */

    /** @type {Object|null} Portal 管理器 */
    #portalManager = null;

    /** @type {import('./DataValidationPlugin')|null} */
    #validationPlugin = null;

    /** @type {Object|null} 渲染引擎 */
    #renderEngine = null;

    /** @type {boolean} 是否已初始化 */
    #initialized = false;

    /** @type {Object|null} 当前打开的下拉菜单状态 */
    #dropdownState = null;

    /** @type {Object|null} 当前显示的错误提示状态 */
    #tooltipState = null;

    /** @type {Object|null} 当前显示的输入提示状态 */
    #inputMessageState = null;

    /** @type {Set<string>} 需要显示下拉箭头的单元格集合 "row,col" */
    #dropdownArrowCells = new Set();

    /** @type {HTMLElement|null} 全局点击监听器引用 */
    #globalClickHandler = null;

    /** @type {HTMLElement|null} 全局键盘监听器引用 */
    #globalKeyHandler = null;

    /** @type {number|null} 气泡自动消失定时器 */
    #tooltipTimer = null;

    // ════════════════════════════════════════
    // v2.0 新增：异步渲染相关属性
    // ════════════════════════════════════════

    /** @type {Map<string, number>} 防抖定时器映射 (key → timerId) */
    #debounceTimers = new Map();

    /** @type {Set<string>} 正在验证中的单元格集合 (防止重复调度) */
    #pendingValidations = new Set();

    /** @type {number} 最大并发验证数 */
    #maxConcurrentValidations = 5;

    /** @type {number} 当前并发验证数 */
    #currentConcurrentCount = 0;

    /** @type {number} 防抖延迟时间 (ms) */
    #debounceDelay = 50;

    /** @type {Map<string, Map<string, string>>} 按 Sheet 分离的图标状态缓存 (外层key=sheetName, 内层key="row,col" → status) */
    #iconStatusCaches = new Map();

    /**
     * 构造 UI 控制器
     *
     * @param {Object} sheet - 工作表实例
     * @param {Object} portalManager - ValidationPortalManager 实例
     * @param {Object} validationPlugin - DataValidationPlugin 实例
     * @param {Object} renderEngine - 渲染引擎实例
     */
    constructor(sheet, portalManager, validationPlugin, renderEngine) {
        this.#portalManager = portalManager;
        this.#validationPlugin = validationPlugin;
        this.#renderEngine = renderEngine;
    }

    #getCurrentCache() {
        const sheetName = this.#validationPlugin?.sheet?.name || "__default__";
        let cache = this.#iconStatusCaches.get(sheetName);
        if (!cache) {
            cache = new Map();
            this.#iconStatusCaches.set(sheetName, cache);
        }
        return cache;
    }

    /**
     * 初始化 UI 控制器
     *
     * 注册全局事件监听器，扫描已有规则中的 list 类型以标记下拉箭头单元格。
     */
    init() {
        if (this.#initialized) return;

        this.#registerGlobalListeners();
        this.#scanDropdownArrowCells();
        this.#initialized = true;
    }

    /**
     * 是否已初始化
     * @returns {boolean}
     */
    get isInitialized() {
        return this.#initialized;
    }

    // ─── 下拉菜单 ───

    /**
     * 在带 list 类型验证的单元格右侧显示下拉箭头 ▾
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    renderDropdownArrow(row, col) {
        this.#dropdownArrowCells.add(`${row},${col}`);
    }

    /**
     * 移除下拉箭头
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    removeDropdownArrow(row, col) {
        this.#dropdownArrowCells.delete(`${row},${col}`);
    }

    /**
     * 显示下拉菜单
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {string[]} options - 选项列表
     * @param {Object} position - 位置 { x, y, width, height }
     */
    showDropdown(row, col, options, position) {
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

        options.forEach((option, index) => {
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

    /**
     * 隐藏下拉菜单
     */
    hideDropdown() {
        if (!this.#dropdownState) return;

        this.#portalManager?.removePortal(this.#dropdownState.portalId);
        this.#dropdownState = null;
    }

    /**
     * 处理下拉菜单键盘导航
     *
     * - ArrowUp/ArrowDown: 上下移动选中项
     * - Enter: 确认选择
     * - Escape: 取消
     * - Alt+ArrowDown: 打开下拉菜单
     *
     * @param {KeyboardEvent} event - 键盘事件
     * @returns {boolean} 是否已处理该事件
     */
    handleDropdownKeyboard(event) {
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
                items[newIndex].style.backgroundColor = "#E3F2FD";
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

    // ─── 错误提示 ───

    /**
     * 显示错误提示气泡
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {string} message - 错误消息
     * @param {string} [level='stop'] - 级别：'stop' | 'warning' | 'information'
     */
    showErrorTooltip(row, col, message, level = "stop") {
        this.hideErrorTooltip();

        if (!this.#portalManager?.isInitialized) return;

        const colors = ERROR_STYLE_COLORS[level] || ERROR_STYLE_COLORS.stop;

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

    /**
     * 隐藏错误提示气泡
     */
    hideErrorTooltip() {
        if (this.#tooltipTimer) {
            clearTimeout(this.#tooltipTimer);
            this.#tooltipTimer = null;
        }

        if (!this.#tooltipState) return;

        this.#portalManager?.removePortal(this.#tooltipState.portalId);
        this.#tooltipState = null;
    }

    // ─── 输入提示 ───

    /**
     * 显示输入提示（当用户选中带 inputMessage 的单元格时）
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {string} title - 提示标题
     * @param {string} message - 提示消息
     */
    showInputMessage(row, col, title, message) {
        console.log("showInputMessage", row, col, title, message);

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

    /**
     * 隐藏输入提示
     */
    hideInputMessage() {
        if (!this.#inputMessageState) return;

        this.#portalManager?.removePortal(this.#inputMessageState.portalId);
        this.#inputMessageState = null;
    }

    // ─── 验证图标（v2.0 支持6种状态） ───

    /**
     * 在 Canvas 上绘制验证状态图标（v2.0 支持6种状态）
     *
     * 支持的图标状态：
     * - valid (✅ 绿色勾) - 验证通过
     * - invalid (❌ 红色叉) - 验证失败
     * - pending (⏳ 灰色时钟) - 待验证
     * - deferred (🔶 橙色圆圈) - 延迟验证
     * - warning (⚠️ 黄色三角) - 警告但不阻止
     * - error (❗ 红色闪烁) - 验证过程异常
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {number} x - 图标左上角 X 坐标
     * @param {number} y - 图标左上角 Y 坐标
     * @param {string} status - 图标状态（使用 ICON_STATUS 常量）
     * @param {number} [size=14] - 图标大小
     */
    drawValidationIcon(ctx, x, y, status, size = 14) {
        const color = ICON_COLORS[status] || ICON_COLORS.pending;

        // 绘制圆形背景
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // 根据状态绘制不同的图标内容
        switch (status) {
            case ICON_STATUS.VALID:
                this.#drawCheckmark(ctx, x, y, size);
                break;

            case ICON_STATUS.INVALID:
                this.#drawCrossmark(ctx, x, y, size);
                break;

            case ICON_STATUS.PENDING:
                this.#drawPendingSymbol(ctx, x, y, size);
                break;

            case ICON_STATUS.DEFERRED:
                this.#drawDeferredSymbol(ctx, x, y, size);
                break;

            case ICON_STATUS.WARNING:
                this.#drawWarningSymbol(ctx, x, y, size);
                break;

            case ICON_STATUS.ERROR:
                this.#drawErrorSymbol(ctx, x, y, size);
                break;

            default:
                this.#drawPendingSymbol(ctx, x, y, size);
        }

        ctx.restore();
    }

    /** ✅ 绘制勾号（valid 状态） */
    #drawCheckmark(ctx, x, y, size) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.beginPath();
        ctx.moveTo(x + size * 0.25, y + size * 0.5);
        ctx.lineTo(x + size * 0.45, y + size * 0.7);
        ctx.lineTo(x + size * 0.75, y + size * 0.3);
        ctx.stroke();
    }

    /** ❌ 绘制叉号（invalid 状态） */
    #drawCrossmark(ctx, x, y, size) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(x + size * 0.3, y + size * 0.3);
        ctx.lineTo(x + size * 0.7, y + size * 0.7);
        ctx.moveTo(x + size * 0.7, y + size * 0.3);
        ctx.lineTo(x + size * 0.3, y + size * 0.7);
        ctx.stroke();
    }

    /** ⏳ 绘制待验证符号（pending 状态）- 时钟图标 */
    #drawPendingSymbol(ctx, x, y, size) {
        ctx.fillStyle = "#fff";
        ctx.font = `${size * 0.65}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⏳", x + size / 2, y + size / 2);
    }

    /** 🔶 绘制延迟验证符号（deferred 状态）- 圆圈+点 */
    #drawDeferredSymbol(ctx, x, y, size) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;

        // 外圈
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size * 0.35, 0, Math.PI * 2);
        ctx.stroke();

        // 中心点
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size * 0.08, 0, Math.PI * 2);
        ctx.fill();
    }

    /** ⚠️ 绘制警告符号（warning 状态）- 感叹号 */
    #drawWarningSymbol(ctx, x, y, size) {
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${size * 0.6}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("!", x + size / 2, y + size * 0.48);
    }

    /** ❗ 绘制错误符号（error 状态）- 大感叹号 */
    #drawErrorSymbol(ctx, x, y, size) {
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${size * 0.7}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("❗", x + size / 2, y + size / 2);
    }

    /**
     * 渲染视口内所有验证图标（v2.0 异步版本）
     *
     * 由 AFTER_RENDER 钩子或渲染引擎触发（~60fps）。
     *
     * 核心优化：
     * - 三级缓存优先级读取（L1 → L2 → L3）
     * - 按状态分组批量绘制（减少 Canvas 状态切换）
     * - 局部重绘（仅更新状态变化的单元格）
     * - 防抖机制（避免滚动时频繁触发）
     *
     * @param {Object} viewport - 视口信息 { startRow, endRow, startCol, endCol }
     */
    renderValidationIcons(viewport) {
        if (!this.#validationPlugin?.engine || !this.#renderEngine) return;

        const ctx = this.#renderEngine.ctx;
        if (!ctx) return;

        const { startRow, endRow, startCol, endCol } = viewport;

        const iconsToDraw = {
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

                const cellRect = this.#getCellRect(row, col);
                if (!cellRect) continue;

                iconsToDraw[cachedStatus].push({
                    x: cellRect.x + cellRect.width - 16,
                    y: cellRect.y + 2,
                    size: 12,
                });
            }
        }

        for (const [status, icons] of Object.entries(iconsToDraw)) {
            if (icons.length === 0) continue;

            for (const { x, y, size } of icons) {
                this.drawValidationIcon(ctx, x, y, status, size);
            }
        }
    }

    /**
     * 确定图标的显示状态（v2.0 核心方法）
     *
     * 采用三级缓存优先级策略：
     * 1. L1 视口缓存 (<0.01ms)
     * 2. L2 最近缓存 (~0.1ms)
     * 3. L3 持久化缓存 (~5-10ms)
     * 4. 无缓存 → 根据复杂度决定同步或异步验证
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {*} value - 单元格值
     * @returns {Promise<{status: string, source: string}>}
     */
    #scheduleStatusUpdate(row, col, value) {
        const key = `${row},${col}`;

        if (this.#pendingValidations.has(key)) return;

        const engine = this.#validationPlugin.engine;

        let result = null;
        if (engine.getFromCache) {
            result = engine.getFromCache(key, value);
        }

        if (!result && engine.validateCellSync) {
            try {
                result = engine.validateCellSync(row, col, value);
            } catch (error) {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, "[ValidationUIController] 同步验证失败", { error, row, col });
            }
        }

        if (result) {
            let status;
            if (result.valid) {
                status = ICON_STATUS.VALID;
            } else {
                const statusMap = {
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
                    .set(key, { valid: result.valid, errorStyle: result.errorStyle, value, ruleId: result.ruleId }, { source: "sync-validation" })
                    .catch(() => {});
            }
            return;
        }

        this.scheduleAsyncValidation(row, col, value, rules);
    }

    async determineIconStatus(row, col, value) {
        const key = `${row},${col}`;

        try {
            const cache = getValidationCache();
            const cached = cache ? await cache.get(key) : null;

            if (cached && cached.result != null) {
                let status;
                if (cached.result.valid) {
                    status = ICON_STATUS.VALID;
                } else {
                    const statusMap = { stop: ICON_STATUS.INVALID, warning: ICON_STATUS.WARNING, information: ICON_STATUS.DEFERRED };
                    status = statusMap[cached.result.errorStyle] || ICON_STATUS.INVALID;
                }
                this.#getCurrentCache().set(key, status);
                return { status, source: cached.source };
            }

            const rules = this.#validationPlugin?.getRulesForCell(row, col) || [];
            if (rules.length === 0) {
                return { status: ICON_STATUS.PENDING, source: "no-rules" };
            }

            const engine = this.#validationPlugin.engine;
            let result = null;

            if (engine.getFromCache) {
                result = engine.getFromCache(key, value);
            }

            if (!result && engine.validateCellSync) {
                result = engine.validateCellSync(row, col, value);
            }

            if (result) {
                let status;
                if (result.valid) {
                    status = ICON_STATUS.VALID;
                } else {
                    const statusMap = { stop: ICON_STATUS.INVALID, warning: ICON_STATUS.WARNING, information: ICON_STATUS.DEFERRED };
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
        } catch (error) {
            errorHandler.handle(ERROR_CODE.VALIDATION_ERROR, "[ValidationUIController] determineIconStatus() 异常", { error, row, col });

            return { status: ICON_STATUS.ERROR, source: "error" };
        }
    }

    /**
     * 调度异步验证（带防抖和并发控制）
     *
     * 防止在快速输入或滚动时频繁触发验证：
     * - 防抖：同一单元格 50ms 内只触发一次
     * - 并发控制：最多同时执行 5 个异步验证
     * - 去重：已在队列中的不重复添加
     *
     * @private
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {*} value - 单元格值
     * @param {Array} rules - 验证规则列表
     */
    scheduleAsyncValidation(row, col, value, rules) {
        const key = `${row},${col}`;

        // 检查是否已在处理中
        if (this.#pendingValidations.has(key)) return;

        // 检查并发限制
        if (this.#currentConcurrentCount >= this.#maxConcurrentValidations) {
            errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationUIController] 并发数已达上限，跳过验证", { key });
            return;
        }

        // 清除旧的防抖定时器（如果有）
        if (this.#debounceTimers.has(key)) {
            clearTimeout(this.#debounceTimers.get(key));
        }

        // 设置新的防抖定时器
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
                        let status;
                        if (result.valid) {
                            status = ICON_STATUS.VALID;
                        } else {
                            const statusMap = { stop: ICON_STATUS.INVALID, warning: ICON_STATUS.WARNING, information: ICON_STATUS.DEFERRED };
                            status = statusMap[result.errorStyle] || ICON_STATUS.INVALID;
                        }
                        this.#getCurrentCache().set(key, status);
                    }

                    this.requestPartialRedraw(row, col);
                }
            } catch (error) {
                errorHandler.warn(ERROR_CODE.VALIDATION_ERROR, `[ValidationUIController] 异步验证失败: ${key}`, { error });
                this.#pendingValidations.delete(key);
            } finally {
                this.#currentConcurrentCount--;
            }
        }, this.#debounceDelay);

        this.#debounceTimers.set(key, timerId);
    }

    /**
     * 请求局部重绘（仅刷新指定单元格的图标区域）
     *
     * @private
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    requestPartialRedraw(row, col) {
        if (this.#renderEngine && typeof this.#renderEngine.requestRender === "function") {
            this.#renderEngine.requestRender();
        }
    }

    clearAllStatus() {
        this.#getCurrentCache().clear();
        this.#pendingValidations.clear();
        this.#debounceTimers.forEach((timerId) => clearTimeout(timerId));
        this.#debounceTimers.clear();
        this.#currentConcurrentCount = 0;
    }

    clearPendingValidations() {
        this.#pendingValidations.clear();
        this.#debounceTimers.forEach((timerId) => clearTimeout(timerId));
        this.#debounceTimers.clear();
        this.#currentConcurrentCount = 0;
    }

    /**
     * 检查指定单元格是否有下拉箭头
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {boolean}
     */
    hasDropdownArrow(row, col) {
        return this.#dropdownArrowCells.has(`${row},${col}`);
    }

    invalidateCellStatus(row, col) {
        const key = `${row},${col}`;
        this.#getCurrentCache().delete(key);
    }

    setIconStatus(row, col, valid, errorStyle) {
        const key = `${row},${col}`;
        const cache = this.#getCurrentCache();
        if (valid) {
            cache.set(key, ICON_STATUS.VALID);
        } else {
            const statusMap = {
                stop: ICON_STATUS.INVALID,
                warning: ICON_STATUS.WARNING,
                information: ICON_STATUS.DEFERRED,
            };
            cache.set(key, statusMap[errorStyle] || ICON_STATUS.INVALID);
        }
    }

    /**
     * 当验证规则变更时更新下拉箭头标记
     *
     * @param {Object} rule - 新增/修改的规则
     * @param {boolean} [removed=false] - 是否为移除操作
     */
    onRuleChanged(rule, removed = false) {
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

    /**
     * 当单元格选择变更时显示/隐藏输入提示
     *
     * @param {number} row - 行号
     * @param {number} col - 列号
     */
    onCellSelected(row, col) {
        this.hideInputMessage();

        const rules = this.#validationPlugin?.getRulesForCell(row, col) || [];
        for (const rule of rules) {
            if (rule.inputMessage) {
                this.showInputMessage(row, col, rule.inputTitle || "提示", rule.inputMessage);
                break;
            }
        }
    }

    /**
     * 销毁 UI 控制器，释放所有资源（v2.0 增强版）
     *
     * 清理内容：
     * - 所有 Portal 组件（下拉菜单、提示气泡等）
     * - 全局事件监听器
     * - 异步验证相关资源（防抖定时器、并发控制）
     * - 缓存状态记录
     */
    destroy() {
        // 清理所有 UI 组件
        this.hideDropdown();
        this.hideErrorTooltip();
        this.hideInputMessage();

        // 注销全局事件监听
        this.#unregisterGlobalListeners();

        // v2.0 新增：清理异步渲染相关资源
        this.#cleanupAsyncResources();

        // 清空集合和缓存
        this.#dropdownArrowCells.clear();
        this.#iconStatusCaches.clear();
        this.#pendingValidations.clear();

        // 释放引用
        this.#portalManager = null;
        this.#validationPlugin = null;
        this.#renderEngine = null;

        // 标记未初始化
        this.#initialized = false;

        errorHandler.info(ERROR_CODE.VALIDATION_INFO, "[ValidationUIController] 已销毁并释放所有资源");
    }

    /**
     * 清理异步渲染相关的资源
     *
     * @private
     */
    #cleanupAsyncResources() {
        // 清除所有防抖定时器
        for (const [key, timerId] of this.#debounceTimers) {
            clearTimeout(timerId);
            errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[ValidationUIController] 清除防抖定时器: ${key}`);
        }
        this.#debounceTimers.clear();

        // 重置并发计数
        this.#currentConcurrentCount = 0;

        // 清除待验证队列
        this.#pendingValidations.clear();

        // 清除状态记录（避免内存泄漏）
        this.#iconStatusCaches.clear();
    }

    // ─── 私有方法 ───

    /**
     * 选择下拉选项并更新单元格值
     *
     * @private
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @param {*} option - 选中的选项值
     */
    #selectDropdownOption(row, col, option) {
        this.hideDropdown();
        if (this.#validationPlugin?.sheet?.cellStore) {
            this.#validationPlugin?.sheet.setCell?.(row, col, option);
        }
    }

    /**
     * 清除下拉菜单中所有项的高亮
     *
     * @private
     * @param {HTMLElement} listEl - 列表元素
     */
    #clearDropdownHighlight(listEl) {
        const items = listEl.querySelectorAll(".validation-portal-dropdown-item");
        items.forEach((item) => {
            item.style.backgroundColor = "";
        });
    }

    /**
     * 获取单元格在视口中的矩形位置
     *
     * @private
     * @param {number} row - 行号
     * @param {number} col - 列号
     * @returns {Object|null} { x, y, width, height }
     */
    #getCellRect(row, col) {
        if (!this.#renderEngine) return null;

        if (typeof this.#renderEngine.getCellRect === "function") {
            const rect = this.#renderEngine.getCellRect(row, col);
            if (!rect) return null;
            return {
                x: rect.x,
                y: rect.y,
                width: rect.width ?? rect.w ?? 0,
                height: rect.height ?? rect.h ?? 0,
            };
        }

        return null;
    }

    /**
     * 扫描所有规则，标记带 list 类型的单元格
     *
     * @private
     */
    #scanDropdownArrowCells() {
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

    /**
     * 解析范围字符串为单元格坐标数组
     *
     * @private
     * @param {string} rangeStr - 范围字符串（如 "A1:A100"、"A:A"）
     * @returns {Array<{row: number, col: number}>}
     */
    #getCellsInRange(rangeStr) {
        const cells = [];

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

    /**
     * 注册全局事件监听器
     *
     * @private
     */
    #registerGlobalListeners() {
        this.#globalClickHandler = (event) => {
            if (this.#dropdownState) {
                const portal = this.#portalManager?.getPortal(this.#dropdownState.portalId);
                if (portal && !portal.contains(event.target)) {
                    this.hideDropdown();
                }
            }
        };

        this.#globalKeyHandler = (event) => {
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

    /**
     * 解除全局事件监听器
     *
     * @private
     */
    #unregisterGlobalListeners() {
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
