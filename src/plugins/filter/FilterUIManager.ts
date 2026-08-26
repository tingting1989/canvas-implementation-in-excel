import { FilterDropdown } from "./FilterDropdown.js";
import { FilterEngine } from "./FilterEngine.js";
import { PopupPanel } from "../../ui/components/PopupPanel.js";
import { PopupManager } from "../../ui/components/PopupManager.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import type { FilterState, FilterConfig } from "./FilterState.js";
import type { FilterPlugin } from "./FilterPlugin.js";

/**
 * 筛选 UI 控制器 (Filter UI Controller)
 *
 * 职责：管理筛选面板的显示/隐藏、位置计算、回调协调
 *
 * 设计原则：
 * 1. **PopupManager 规范**:
 *    - 使用 `PopupManager.getInstance().register/unregister` 注册/注销
 *    - 使用 `PopupPanel` 作为弹窗容器
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
 * @module plugins/filter/FilterUIManager
 */
export class FilterUIManager {
    /** @private 私有字段 - 工作表实例引用 */
    #sheet: any = null;

    /** @private 私有字段 - 筛选状态管理器 */
    #filterState: FilterState | null = null;

    /** @private 私有字段 - 筛选引擎实例 */
    #filterEngine: FilterEngine | null = null;

    /** @private 私有字段 - 筛选插件实例引用 */
    #filterPlugin: FilterPlugin | null = null;

    /** @private 私有字段 - 弹窗容器 */
    #popupPanel: any = null;

    /** @private 私有字段 - 筛选面板内容组件 */
    #dropdown: FilterDropdown | null = null;

    /** @private 私有字段 - PopupManager 分配的唯一标识符 */
    #popupId: symbol | null = null;

    /** @private 私有字段 - 防重入标志，防止关闭时的无限递归 */
    #isHiding: boolean = false;

    /** @private 私有字段 - Workbook 实例 ID，用于 PopupManager 隔离 */
    #workbookId: string | null = null;
    #workbookContainer: HTMLElement | null = null;

    setWorkbookId(id: string | null, container?: HTMLElement | null): void {
        this.#workbookId = id;
        if (container !== undefined) this.#workbookContainer = container;
    }

    /**
     * 创建筛选 UI 控制器实例
     *
     * 初始化时创建 FilterEngine 实例，不立即创建 UI 组件。
     * 首次调用 `openDropdown()` 时才延迟创建 FilterDropdown 实例。
     *
     * @param sheet - 工作表实例
     * @param filterState - 筛选状态管理器
     * @param filterPlugin - 筛选插件实例（用于触发渲染）
     */
    constructor(sheet: any, filterState: FilterState, filterPlugin: FilterPlugin) {
        this.#sheet = sheet;
        this.#filterState = filterState;
        this.#filterEngine = new FilterEngine(sheet, filterState);
        this.#filterPlugin = filterPlugin;
    }

    /** 获取筛选引擎实例 */
    get filterEngine(): FilterEngine | null {
        return this.#filterEngine;
    }

    /**
     * 打开指定列的筛选下拉面板
     *
     * 执行流程：
     * 1. 关闭已打开的面板（防重复创建）
     * 2. 通过 FilterEngine 提取唯一值
     * 3. 创建 PopupPanel 容器和 FilterDropdown 内容组件
     * 4. 初始化回调（onApply, onClear）
     * 5. 设置筛选数据（col, allValues, currentFilter, options）
     * 6. 显示容器并注册到 PopupManager
     * 7. 聚焦搜索输入框
     *
     * @param col - 列索引
     * @param position - 显示位置 { x, y }
     */
    openDropdown(col: number, position: { x: number; y: number }): void {
        this.closeDropdown();

        try {
            const uniqueValues = this.#filterEngine!.extractUniqueValues(col);
            const currentFilter = this.#filterState!.getColumnFilter(col);
            const columnType = (this.#filterPlugin as any).getColumnType(col);

            this.#popupPanel = new PopupPanel();

            this.#dropdown = new FilterDropdown();

            this.#dropdown.initCallbacks({
                onApply: (filter: FilterConfig) => this.#handleApply(filter, col),
                onClear: () => this.#handleClear(col),
            });

            const pluginOpts = (this.#filterPlugin as any)?.options || {};
            this.#dropdown.setData(col, uniqueValues, currentFilter, {
                dropdownWidth: pluginOpts.dropdownWidth,
                dropdownMaxHeight: pluginOpts.dropdownMaxHeight,
                virtualScrollThreshold: pluginOpts.virtualScrollThreshold,
                columnType,
            });

            this.#popupId = PopupManager.getInstance(this.#workbookId || undefined).register(this.#popupPanel);

            const columnName = this.#getColumnName(col);
            this.#popupPanel.show({
                position,
                placement: "bottom",
                zIndex: 10001,
                title: "筛选",
                closeOnClickOutside: true,
                closeOnEscape: true,
                content: this.#dropdown,
                onClose: () => this.closeDropdown(),
                workbookContainer: this.#workbookContainer || undefined,
            });

            setTimeout(() => {
                this.#dropdown?.focusSearchInput();
            }, 100);
        } catch (error) {
            errorHandler.error(ERROR_CODE.FILTER_UI_OPEN_ERROR, "打开筛选面板失败", { originalError: error, col });
        }
    }

    /**
     * @private 私有方法 - 获取列名（表头单元格的值）
     *
     * 从工作表第 0 行（表头行）读取指定列的单元格值作为列名。
     * 若单元格为空或读取失败，返回空字符串。
     *
     * @param col - 列索引
     * @returns 列名，无值时返回空字符串
     */
    #getColumnName(col: number): string {
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
     * 安全性保证：
     * - 即使注销失败也不会抛出异常（通过 errorHandler 记录警告）
     * - 支持重复调用（幂等操作）
     * - 防止 Esc 关闭时的双重调用导致的无限循环
     */
    closeDropdown(): void {
        if (this.#isHiding || !this.#popupPanel) return;

        this.#isHiding = true;

        try {
            this.#popupPanel.hide();

            if (this.#popupId) {
                try {
                    PopupManager.getInstance(this.#workbookId || undefined).unregister(this.#popupId);
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
     * @returns 是否打开
     */
    isDropdownOpen(): boolean {
        return this.#popupPanel !== null && this.#popupPanel.visible;
    }

    /**
     * @private 私有方法 - 处理筛选应用回调
     *
     * 由 FilterDropdown 的"确定"按钮触发。
     * 将筛选配置写入 FilterState，并重新计算隐藏行。
     *
     * @param filter - 筛选配置
     * @param col - 列索引
     */
    #handleApply(filter: FilterConfig, col: number): void {
        try {
            if (this.#isFilterEmpty(filter)) {
                this.#filterState!.removeColumnFilter(col);
                this.#applyHiddenRows();
                return;
            }

            this.#filterState!.setColumnFilter(col, filter);
            this.#applyHiddenRows();
        } catch (error) {
            errorHandler.error(ERROR_CODE.FILTER_UI_APPLY_ERROR, "应用筛选失败", { originalError: error, col });
        }
    }

    /**
     * @private 私有方法 - 处理筛选清除回调
     *
     * 由 FilterDropdown 的"清除筛选"按钮触发。
     * 移除该列的筛选配置，并重新计算隐藏行。
     *
     * @param col - 列索引
     */
    #handleClear(col: number): void {
        try {
            this.#filterState!.removeColumnFilter(col);
            this.#applyHiddenRows();
        } catch (error) {
            errorHandler.error(ERROR_CODE.FILTER_UI_CLEAR_ERROR, "清除筛选失败", { originalError: error, col });
        }
    }

    /**
     * @private 私有方法 - 判断筛选是否为空（无实际效果）
     *
     * @param filter - 筛选配置
     * @returns 是否为空
     */
    #isFilterEmpty(filter: FilterConfig | null): boolean {
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
     * @private 私有方法 - 应用隐藏行
     *
     * 根据筛选条件计算需要隐藏的行，并更新到 rowColManager
     */
    #applyHiddenRows(): void {
        const hiddenRows = this.#filterEngine!.computeHiddenRows();

        const rc = this.#sheet.rowColManager;

        rc.clearHiddenRows();

        for (const row of hiddenRows) {
            rc.hideRow(row);
        }

        (this.#filterPlugin as any)?.renderEngine?.invalidateAll();
        (this.#filterPlugin as any)?.renderEngine?.render();
    }

    /**
     * 销毁控制器实例
     *
     * 完整清理流程：
     * 1. 调用 closeDropdown() 关闭并注销面板
     * 2. 清空所有引用（断开循环依赖）
     *
     * 注意：销毁后此实例不可再使用！
     */
    destroy(): void {
        this.closeDropdown();
        this.#sheet = null;
        this.#filterState = null;
        this.#filterEngine = null;
        this.#filterPlugin = null;
    }
}
