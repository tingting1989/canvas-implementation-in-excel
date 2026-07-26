import { errorHandler, ERROR_CODE } from "@/core/ErrorHandler.js";

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
});

/**
 * 验证 UI 控制器
 *
 * 负责渲染和管理所有验证相关的 UI 组件：
 * 1. 下拉菜单（list 类型验证）
 * 2. 错误提示气泡（stop/warning/information）
 * 3. 输入提示（Input Message）
 * 4. Canvas 上的验证状态图标
 *
 * @example
 * const uiController = new ValidationUIController(
 *     sheet, portalManager, validationPlugin, renderEngine
 * );
 * uiController.init();
 */
export class ValidationUIController {
    /** @type {Object|null} 工作表实例 */
    #sheet = null;

    /** @type {Object|null} Portal 管理器 */
    #portalManager = null;

    /** @type {Object|null} 验证插件 */
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

    /**
     * 构造 UI 控制器
     *
     * @param {Object} sheet - 工作表实例
     * @param {Object} portalManager - ValidationPortalManager 实例
     * @param {Object} validationPlugin - DataValidationPlugin 实例
     * @param {Object} renderEngine - 渲染引擎实例
     */
    constructor(sheet, portalManager, validationPlugin, renderEngine) {
        this.#sheet = sheet;
        this.#portalManager = portalManager;
        this.#validationPlugin = validationPlugin;
        this.#renderEngine = renderEngine;
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

        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationUIController] 初始化完成");
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
        const currentValue = this.#sheet?.cellStore?.get(row, col)?.value;

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

    // ─── 验证图标 ───

    /**
     * 在 Canvas 上绘制验证状态图标
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {number} x - 图标左上角 X 坐标
     * @param {number} y - 图标左上角 Y 坐标
     * @param {string} status - 状态：'valid' | 'invalid' | 'pending'
     * @param {number} [size=14] - 图标大小
     */
    drawValidationIcon(ctx, x, y, status, size = 14) {
        const color = ICON_COLORS[status] || ICON_COLORS.pending;

        ctx.save();
        ctx.beginPath();

        if (status === "valid") {
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x + size * 0.25, y + size * 0.5);
            ctx.lineTo(x + size * 0.45, y + size * 0.7);
            ctx.lineTo(x + size * 0.75, y + size * 0.3);
            ctx.stroke();
        } else if (status === "invalid") {
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x + size * 0.3, y + size * 0.3);
            ctx.lineTo(x + size * 0.7, y + size * 0.7);
            ctx.moveTo(x + size * 0.7, y + size * 0.3);
            ctx.lineTo(x + size * 0.3, y + size * 0.7);
            ctx.stroke();
        } else {
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.font = `${size * 0.7}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("⏳", x + size / 2, y + size / 2);
        }

        ctx.restore();
    }

    /**
     * 渲染视口内所有验证图标
     *
     * 由 AFTER_RENDER 钩子或渲染引擎触发。
     *
     * @param {Object} viewport - 视口信息 { startRow, endRow, startCol, endCol }
     */
    renderValidationIcons(viewport) {
        if (!this.#validationPlugin?.engine || !this.#renderEngine) return;

        const ctx = this.#renderEngine.overlayCtx || this.#renderEngine.ctx;
        if (!ctx) return;

        const { startRow, endRow, startCol, endCol } = viewport;

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const rules = this.#validationPlugin.getRulesForCell(row, col);
                if (rules.length === 0) continue;

                const cell = this.#sheet?.cellStore?.get(row, col);
                if (!cell) continue;

                const result = this.#validationPlugin.engine.getFromCache
                    ? this.#validationPlugin.engine.getFromCache(`${row},${col}`, cell.value)
                    : null;

                const cellRect = this.#getCellRect(row, col);
                if (!cellRect) continue;

                const status = result ? (result.valid ? "valid" : "invalid") : "pending";
                const iconX = cellRect.x + cellRect.width - 16;
                const iconY = cellRect.y + 2;

                this.drawValidationIcon(ctx, iconX, iconY, status, 12);
            }
        }
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
     * 销毁 UI 控制器，释放所有资源
     */
    destroy() {
        this.hideDropdown();
        this.hideErrorTooltip();
        this.hideInputMessage();

        this.#unregisterGlobalListeners();

        this.#dropdownArrowCells.clear();
        this.#sheet = null;
        this.#portalManager = null;
        this.#validationPlugin = null;
        this.#renderEngine = null;
        this.#initialized = false;

        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationUIController] 已销毁");
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

        if (this.#sheet?.cellStore) {
            this.#sheet.setCellValue?.(row, col, option);
        }

        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, `[ValidationUIController] 选择下拉选项: (${row},${col}) = ${option}`);
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
            return this.#renderEngine.getCellRect(row, col);
        }

        if (typeof this.#renderEngine.getCellPosition === "function") {
            const pos = this.#renderEngine.getCellPosition(row, col);
            const rowHeight = this.#renderEngine.getRowHeight?.(row) || 25;
            const colWidth = this.#renderEngine.getColWidth?.(col) || 100;
            return { x: pos.x, y: pos.y, width: colWidth, height: rowHeight };
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

        const colToNum = (colStr) => {
            let num = 0;
            for (let i = 0; i < colStr.length; i++) {
                num = num * 26 + (colStr.charCodeAt(i) - 64);
            }
            return num - 1;
        };

        const fullColMatch = rangeStr.match(/^([A-Z]+):([A-Z]+)$/);
        if (fullColMatch) {
            const startCol = colToNum(fullColMatch[1]);
            const endCol = colToNum(fullColMatch[2]);
            const maxRow = Math.min(this.#sheet?.rowCount || 1000, 1000);
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
            const startCol = colToNum(rangeMatch[1]);
            const endRow = parseInt(rangeMatch[4]) - 1;
            const endCol = colToNum(rangeMatch[3]);
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
