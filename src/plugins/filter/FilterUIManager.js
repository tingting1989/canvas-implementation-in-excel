/**
 * 筛选 UI 控制器 (Filter UI Controller)
 *
 * 职责：管理筛选面板的显示/隐藏、位置计算、回调协调
 *
 * 设计原则：
 * 1. **PopupManager 规范**:
 *    - 使用 `PopupManager.getInstance().register/unregister` 注册/注销
 *    - 使用 `PopupPanelNew` 作为弹窗容器
 *    - 继承 FilterDropdown 作为内容组件注入容器
 *    - 支持 `closeAll(exceptId)` 协调关闭机制
 *
 * 2. **单一职责**:
 *    - 仅负责 UI 层面的控制逻辑
 *    - 业务逻辑委托给 FilterEngine / FilterState
 *    - 渲染细节封装在 FilterDropdown Web Component 中
 *
 * 3. **防御性编程**:
 *    - 所有可能失败的操作都包裹在 try-catch 中
 *    - 通过 errorHandler 统一记录错误日志
 *    - 提供优雅降级（如使用默认位置）
 *
 * 使用示例：
 * ```javascript
 * const uiController = new FilterUIManager(sheet, filterState, filterPlugin);
 * uiController.openDropdown(0, { x: 100, y: 200 });
 * uiController.closeDropdown();
 * ```
 *
 * @class FilterUIManager
 * @see {@link FilterPlugin} - 业务逻辑层
 * @see {@link FilterDropdown} - UI 渲染组件
 * @see {@link PopupPanelNew} - 弹窗容器
 * @see {@link PopupManager} - 弹窗管理器
 */
import { FilterDropdown } from "./FilterDropdown.js";
import { FilterEngine } from "./FilterEngine.js";
import { PopupPanelNew } from "../../ui/components/PopupPanelNew.js";
import { PopupManager } from "../../ui/components/PopupManager.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

export class FilterUIManager {
    /** @type {import("../../workbook/Sheet.js").Sheet} 工作表实例引用 */
    #sheet = null;

    /** @type {import("./FilterState.js").FilterState} 筛选状态管理器 */
    #filterState = null;

    /** @type {FilterEngine} 筛选引擎实例 */
    #filterEngine = null;

    /** @type {import("./FilterPlugin.js").FilterPlugin} 筛选插件实例引用 */
    #filterPlugin = null;

    /** @type {PopupPanelNew|null} 弹窗容器 */
    #popupPanel = null;

    /** @type {FilterDropdown|null} 筛选面板内容组件 */
    #dropdown = null;

    /** @type {Symbol|null} PopupManager 分配的唯一标识符 */
    #popupId = null;

    /**
     * @private 防重入标志 - 防止关闭时的无限递归
     *
     * 当用户按 Esc 键或点击外部时，可能同时触发：
     * 1. PopupPanelNew 的 onClose 回调调用 closeDropdown()
     * 2. 其他事件链再次调用 closeDropdown()
     *
     * 此标志位在 closeDropdown() 开始时设置为 true，结束时重置为 false。
     *
     * @type {boolean}
     */
    #isHiding = false;

    /**
     * 创建筛选 UI 控制器实例
     *
     * 初始化时创建 FilterEngine 实例，不立即创建 UI 组件。
     * 首次调用 `openDropdown()` 时才延迟创建 FilterDropdown 实例。
     *
     * @constructor
     * @param {import("../../workbook/Sheet.js").Sheet} sheet - 工作表实例
     * @param {import("./FilterState.js").FilterState} filterState - 筛选状态管理器
     * @param {import("./FilterPlugin.js").FilterPlugin} filterPlugin - 筛选插件实例（用于触发渲染）
     */
    constructor(sheet, filterState, filterPlugin) {
        this.#sheet = sheet;
        this.#filterState = filterState;
        this.#filterEngine = new FilterEngine(sheet, filterState);
        this.#filterPlugin = filterPlugin;
    }

    /**
     * 获取筛选引擎实例
     *
     * @public
     * @returns {FilterEngine}
     */
    get filterEngine() {
        return this.#filterEngine;
    }

    /**
     * 打开指定列的筛选下拉面板
     *
     * 执行流程：
     * 1. 关闭已打开的面板（防重复创建）
     * 2. 通过 FilterEngine 提取唯一值
     * 3. 创建 PopupPanelNew 容器和 FilterDropdown 内容组件
     * 4. 初始化回调（onApply, onClear）
     * 5. 设置筛选数据（col, allValues, currentFilter, options）
     * 6. 显示容器并注册到 PopupManager
     * 7. 聚焦搜索输入框
     *
     * @public
     * @param {number} col - 列索引
     * @param {Object} position - 显示位置 { x, y }
     * @returns {void}
     */
    openDropdown(col, position) {
        this.closeDropdown();

        try {
            const uniqueValues = this.#filterEngine.extractUniqueValues(col);
            const currentFilter = this.#filterState.getColumnFilter(col);
            const columnType = this.#filterPlugin.getColumnType(col);

            // 1. 创建弹窗容器
            this.#popupPanel = new PopupPanelNew();

            // 2. 创建筛选面板内容组件
            this.#dropdown = new FilterDropdown();

            // 3. 初始化回调
            this.#dropdown.initCallbacks({
                onApply: (filter) => this.#handleApply(filter, col),
                onClear: () => this.#handleClear(col),
            });

            // 4. 设置筛选数据（从插件配置读取面板宽高、虚拟滚动阈值等）
            const pluginOpts = this.#filterPlugin?.options || {};
            this.#dropdown.setData(col, uniqueValues, currentFilter, {
                dropdownWidth: pluginOpts.dropdownWidth,
                dropdownMaxHeight: pluginOpts.dropdownMaxHeight,
                virtualScrollThreshold: pluginOpts.virtualScrollThreshold,
                columnType,
            });

            // 5. 注册到 PopupManager
            this.#popupId = PopupManager.getInstance().register(this.#popupPanel);

            // 6. 显示容器（带位置和回调）
            const columnName = this.#getColumnName(col);
            this.#popupPanel.show({
                position,
                placement: "bottom",
                zIndex: 10001,
                title: columnName ? `筛选 - ${columnName}` : "筛选",
                closeOnClickOutside: true,
                closeOnEscape: true,
                content: this.#dropdown,
                onClose: () => this.closeDropdown(),
            });

            // 7. 聚焦搜索输入框
            setTimeout(() => {
                this.#dropdown?.focusSearchInput();
            }, 100);
        } catch (error) {
            errorHandler.error(ERROR_CODE.FILTER_UI_OPEN_ERROR, "打开筛选面板失败", { originalError: error, col });
        }
    }

    /**
     * 获取列名（表头单元格的值）
     *
     * 从工作表第 0 行（表头行）读取指定列的单元格值作为列名。
     * 若单元格为空或读取失败，返回空字符串。
     *
     * @private
     * @param {number} col - 列索引
     * @returns {string} 列名，无值时返回空字符串
     */
    #getColumnName(col) {
        try {
            const cell = this.#sheet?.data?.cellStore?.get(0, col);
            const value = cell?.value;
            return value !== undefined && value !== null ? String(value) : "";
        } catch {
            return "";
        }
    }

    /**
     * 关闭当前打开的筛选下拉面板
     *
     * 执行流程：
     * 1. 检查防重入标志，避免无限递归
     * 2. 调用 popupPanel.hide() 触发动画隐藏
     * 3. 从 PopupManager 注销此弹窗标识
     * 4. 清空内部引用（#dropdown, #popupPanel, #popupId）
     *
     * 安全性保证：
     * - 即使注销失败也不会抛出异常（通过 errorHandler 记录警告）
     * - 支持重复调用（幂等操作）
     *
     * @public
     * @returns {void}
     */
    closeDropdown() {
        if (this.#isHiding || !this.#popupPanel) return;

        this.#isHiding = true;

        try {
            this.#popupPanel.hide();

            if (this.#popupId) {
                try {
                    PopupManager.getInstance().unregister(this.#popupId);
                } catch (error) {
                    errorHandler.warn(ERROR_CODE.FILTER_UI_POPUP_UNREGISTER_ERROR, "注销 PopupManager 失败", {
                        originalError: error,
                    });
                }
            }

            this.#dropdown = null;
            this.#popupPanel = null;
            this.#popupId = null;
        } finally {
            this.#isHiding = false;
        }
    }

    /**
     * 检查筛选下拉面板是否处于打开状态
     *
     * @public
     * @returns {boolean} 是否打开
     */
    isDropdownOpen() {
        return this.#popupPanel !== null && this.#popupPanel.visible;
    }

    /**
     * 处理筛选应用回调
     *
     * 由 FilterDropdown 的"确定"按钮触发。
     * 将筛选配置写入 FilterState，并重新计算隐藏行。
     *
     * @private
     * @param {Object} filter - 筛选配置
     * @param {number} col - 列索引
     * @returns {void}
     */
    #handleApply(filter, col) {
        try {
            if (this.#isFilterEmpty(filter)) {
                // 全选（无实际筛选效果）时，清除该列已有的筛选，恢复显示所有行
                this.#filterState.removeColumnFilter(col);
                this.#applyHiddenRows();
                return;
            }

            this.#filterState.setColumnFilter(col, filter);
            this.#applyHiddenRows();
        } catch (error) {
            errorHandler.error(ERROR_CODE.FILTER_UI_APPLY_ERROR, "应用筛选失败", { originalError: error, col });
        }
    }

    /**
     * 处理筛选清除回调
     *
     * 由 FilterDropdown 的"清除筛选"按钮触发。
     * 移除该列的筛选配置，并重新计算隐藏行。
     *
     * @private
     * @param {number} col - 列索引
     * @returns {void}
     */
    #handleClear(col) {
        try {
            this.#filterState.removeColumnFilter(col);
            this.#applyHiddenRows();
        } catch (error) {
            errorHandler.error(ERROR_CODE.FILTER_UI_CLEAR_ERROR, "清除筛选失败", { originalError: error, col });
        }
    }

    /**
     * 判断筛选是否为空（无实际效果）
     *
     * @private
     * @param {Object} filter - 筛选配置
     * @returns {boolean} 是否为空
     */
    #isFilterEmpty(filter) {
        if (!filter) return true;

        if (filter.type === "values") {
            return filter.uncheckedValues.size === 0;
        }

        if (filter.type === "condition") {
            return !filter.operator || !filter.value;
        }

        return true;
    }

    /**
     * 应用隐藏行
     *
     * 根据筛选条件计算需要隐藏的行，并更新到 rowColManager
     *
     * @private
     * @returns {void}
     */
    #applyHiddenRows() {
        const hiddenRows = this.#filterEngine.computeHiddenRows();

        const rc = this.#sheet.rowColManager;

        rc.clearHiddenRows();

        for (const row of hiddenRows) {
            rc.hideRow(row);
        }

        this.#filterPlugin?.renderEngine?.invalidateAll();
        this.#filterPlugin?.renderEngine?.render();
    }

    /**
     * 销毁控制器实例
     *
     * 完整清理流程：
     * 1. 调用 closeDropdown() 关闭并注销面板
     * 2. 清空所有引用（断开循环依赖）
     *
     * 注意：销毁后此实例不可再使用！
     *
     * @public
     * @returns {void}
     */
    destroy() {
        this.closeDropdown();
        this.#sheet = null;
        this.#filterState = null;
        this.#filterEngine = null;
        this.#filterPlugin = null;
    }
}
