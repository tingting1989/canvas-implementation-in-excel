import { BasePlugin } from "./BasePlugin.js";

/**
 * 隐藏行/列插件基类
 *
 * ## 设计目的
 * 消除 `HiddenRowsPlugin` 与 `HiddenColumnsPlugin` 之间的代码重复。
 * 两者唯一的区别是操作维度（行 vs 列），通过 `AXIS` 静态属性和动态
 * 方法调度实现统一的隐藏/显示逻辑。
 *
 * ## 核心原理：尺寸归零方案
 * 隐藏时将目标行/列的尺寸设为 0，显示时恢复原始尺寸。
 * 相比"双坐标体系"方案（维护物理坐标与可视坐标两套映射），
 * 此方案更简洁：所有坐标计算自然适配，无需额外的索引转换。
 *
 * ## 子类使用
 * 子类只需提供三个静态属性：
 * - `AXIS` — 维度类型（`"row"` 或 `"col"`）
 * - `AFTER_HIDE_HOOK` — 隐藏后触发的钩子常量
 * - `AFTER_SHOW_HOOK` — 显示后触发的钩子常量
 *
 * ## 维度抽象
 * 通过 `#isRow` 判断当前维度，所有 RowColManager 调用通过
 * 私有调度方法（`#rcHide`、`#rcShow` 等）动态分发到对应 API。
 *
 * ## 选区保护
 * 隐藏/显示操作后自动调整选区，确保选区始终落在可见区域。
 * `#adjustSelection()` 检查焦点及选区边界，若全部隐藏则寻找最近可见项。
 *
 * @extends BasePlugin
 */
export class BaseHidePlugin extends BasePlugin {
    // ═══════════════════════════════════════════════════════════════
    // 静态属性（子类必须覆盖）
    // ═══════════════════════════════════════════════════════════════

    /**
     * 隐藏维度类型
     * @abstract
     * @returns {"row" | "col"}
     * @throws {Error} 子类未覆盖时抛出
     */
    static get AXIS() {
        throw new Error("AXIS must be overridden in subclass");
    }

    /**
     * 隐藏后触发的钩子名称
     * @abstract
     * @returns {string}
     * @throws {Error} 子类未覆盖时抛出
     */
    static get AFTER_HIDE_HOOK() {
        throw new Error("AFTER_HIDE_HOOK must be overridden in subclass");
    }

    /**
     * 显示后触发的钩子名称
     * @abstract
     * @returns {string}
     * @throws {Error} 子类未覆盖时抛出
     */
    static get AFTER_SHOW_HOOK() {
        throw new Error("AFTER_SHOW_HOOK must be overridden in subclass");
    }

    // ═══════════════════════════════════════════════════════════════
    // 私有实例字段
    // ═══════════════════════════════════════════════════════════════

    /** 插件是否处于激活状态（已初始化且未禁用） */
    #active = false;

    // ═══════════════════════════════════════════════════════════════
    // 维度抽象（row ↔ col）
    // ═══════════════════════════════════════════════════════════════

    /**
     * 当前操作维度
     * @returns {"row"|"col"}
     */
    get #axis() {
        return this.constructor.AXIS;
    }

    /**
     * 是否为行维度
     * @returns {boolean}
     */
    get #isRow() {
        return this.#axis === "row";
    }

    /**
     * 维度名称首字母大写形式，用于拼接 RowColManager API 后缀
     * @returns {string} "Row" 或 "Column"
     */
    get #dimCapitalized() {
        return this.#isRow ? "Row" : "Column";
    }

    // ─── RowColManager 方法动态调度 ───────────────────────────────
    // 根据 #isRow 将调用分发到 row 或 column 版本的 API

    /**
     * 隐藏指定项（分发到 hideRow / hideColumn）
     * @param {number} index - 行或列索引
     * @returns {boolean} 是否隐藏成功
     */
    #rcHide(index) {
        return this.#isRow
            ? this.sheet.rowColManager.hideRow(index)
            : this.sheet.rowColManager.hideColumn(index);
    }

    /**
     * 显示指定项（分发到 showRow / showColumn）
     * @param {number} index - 行或列索引
     * @returns {boolean} 是否显示成功
     */
    #rcShow(index) {
        return this.#isRow
            ? this.sheet.rowColManager.showRow(index)
            : this.sheet.rowColManager.showColumn(index);
    }

    /**
     * 判断指定项是否已隐藏（分发到 isRowHidden / isColumnHidden）
     * @param {number} index - 行或列索引
     * @returns {boolean}
     */
    #rcIsHidden(index) {
        return this.#isRow
            ? this.sheet.rowColManager.isRowHidden(index)
            : this.sheet.rowColManager.isColumnHidden(index);
    }

    /**
     * 获取所有隐藏项索引（分发到 getHiddenRows / getHiddenColumns）
     * @returns {number[]}
     */
    #rcGetHidden() {
        return this.#isRow
            ? this.sheet.rowColManager.getHiddenRows()
            : this.sheet.rowColManager.getHiddenColumns();
    }

    /**
     * 清除所有隐藏项（分发到 clearHiddenRows / clearHiddenColumns）
     */
    #rcClearHidden() {
        return this.#isRow
            ? this.sheet.rowColManager.clearHiddenRows()
            : this.sheet.rowColManager.clearHiddenColumns();
    }

    /**
     * 获取可见项数量（分发到 visibleRowCount / visibleColCount）
     * @returns {number}
     */
    #rcVisibleCount() {
        return this.#isRow
            ? this.sheet.rowColManager.visibleRowCount
            : this.sheet.rowColManager.visibleColCount;
    }

    // ═══════════════════════════════════════════════════════════════
    // 公共 API
    // ═══════════════════════════════════════════════════════════════

    /**
     * 初始化插件
     *
     * 从 options 中读取预隐藏项列表并执行隐藏。
     * 对于行维度读取 `options.rows`，对于列维度读取 `options.columns`。
     *
     * @param {object} [options={}] - 插件配置
     * @param {number[]} [options.rows] - 初始隐藏的行索引（仅 HiddenRowsPlugin）
     * @param {number[]} [options.columns] - 初始隐藏的列索引（仅 HiddenColumnsPlugin）
     */
    init(options = {}) {
        super.init(options);

        // 根据维度读取对应的配置键
        const itemsKey = this.#isRow ? "rows" : "columns";
        if (Array.isArray(options[itemsKey])) {
            for (const idx of options[itemsKey]) {
                if (idx >= 0) this.#rcHide(idx);
            }
        }

        this.#active = true;
        this.#adjustSelection();
        this.renderEngine?.invalidateAll();
        this.render();
    }

    /**
     * 插件是否处于激活状态
     * @returns {boolean}
     */
    get active() {
        return this.#active;
    }

    /**
     * 获取所有已隐藏项的索引
     * @returns {number[]}
     */
    get hiddenItems() {
        return this.sheet ? this.#rcGetHidden() : [];
    }

    /**
     * 获取已隐藏项的数量
     * @returns {number}
     */
    get hiddenCount() {
        return this.sheet ? this.#rcGetHidden().length : 0;
    }

    /**
     * 隐藏单个行/列
     *
     * 操作流程：调用 RowColManager 隐藏 → 调整选区 → 失效缓存 → 重新渲染 → 触发钩子
     *
     * @param {number} index - 要隐藏的行/列索引
     */
    hideOne(index) {
        if (index < 0 || this.isHidden(index)) return;

        this.#rcHide(index);
        this.#adjustSelection();
        this.renderEngine?.invalidateAll();
        this.render();
        this.hooks?.runHooks(this.constructor.AFTER_HIDE_HOOK, index, true);
    }

    /**
     * 批量隐藏多个行/列
     *
     * 与逐个调用 `hideOne` 的区别：渲染和选区调整只执行一次，减少重绘开销。
     *
     * @param {number[]} items - 要隐藏的行/列索引数组
     */
    hideMultiple(items) {
        if (!Array.isArray(items) || items.length === 0) return;

        let changed = false;
        for (const idx of items) {
            if (idx >= 0 && !this.isHidden(idx)) {
                this.#rcHide(idx);
                changed = true;
            }
        }
        if (changed) {
            this.#adjustSelection();
            this.renderEngine?.invalidateAll();
            this.render();
            for (const idx of items) {
                this.hooks?.runHooks(this.constructor.AFTER_HIDE_HOOK, idx, true);
            }
        }
    }

    /**
     * 显示单个行/列
     *
     * 恢复原始尺寸并触发重绘。
     *
     * @param {number} index - 要显示的行/列索引
     */
    showOne(index) {
        if (!this.isHidden(index)) return;

        this.#rcShow(index);
        this.renderEngine?.invalidateAll();
        this.render();
        this.hooks?.runHooks(this.constructor.AFTER_SHOW_HOOK, index, false);
    }

    /**
     * 批量显示多个行/列
     *
     * @param {number[]} items - 要显示的行/列索引数组
     */
    showMultiple(items) {
        if (!Array.isArray(items) || items.length === 0) return;

        let changed = false;
        for (const idx of items) {
            if (this.isHidden(idx)) {
                this.#rcShow(idx);
                changed = true;
            }
        }
        if (changed) {
            this.renderEngine?.invalidateAll();
            this.render();
            for (const idx of items) {
                this.hooks?.runHooks(this.constructor.AFTER_SHOW_HOOK, idx, false);
            }
        }
    }

    /**
     * 判断指定索引是否已隐藏
     * @param {number} index - 行/列索引
     * @returns {boolean}
     */
    isHidden(index) {
        return this.sheet ? this.#rcIsHidden(index) : false;
    }

    /**
     * 获取所有隐藏项索引（同 hiddenItems）
     * @returns {number[]}
     */
    getHiddenItems() {
        return this.hiddenItems;
    }

    /**
     * 当前维度的可见项数量
     * @returns {number}
     */
    get visibleCount() {
        return this.sheet ? this.#rcVisibleCount() : 0;
    }

    // ═══════════════════════════════════════════════════════════════
    // 选区调整（内部方法）
    // ═══════════════════════════════════════════════════════════════

    /**
     * 隐藏/显示后调整选区，确保选区始终落在可见区域
     *
     * 检查焦点行/列、选区起始行/列、选区结束行/列是否被隐藏：
     * - 若全部可见 → 无需调整
     * - 若任意被隐藏 → 寻找最近可见项替代
     *
     * 搜索策略：先向正方向（index + 1），再向负方向（index - 1），
     * 最多搜索 100 个位置，均找不到则放弃。
     *
     * @private
     */
    #adjustSelection() {
        const sheet = this.sheet;
        if (!sheet) return;

        const rc = sheet.rowColManager;
        const selection = sheet.selection;
        const range = selection.getRange();
        const [focusRow, focusCol] = selection.getFocus();

        // 根据维度提取对应的索引
        const focusIdx = this.#isRow ? focusRow : focusCol;
        const topIdx = this.#isRow ? range.topRow : range.topCol;
        const bottomIdx = this.#isRow ? range.bottomRow : range.bottomCol;

        // 三者均可见则无需调整
        if (!this.#rcIsHidden(focusIdx) && !this.#rcIsHidden(topIdx) && !this.#rcIsHidden(bottomIdx)) {
            return;
        }

        // 寻找最近可见项
        const newIdx = this.#findNearestVisible(focusIdx);
        if (newIdx < 0) return;

        const newTop = this.#findNearestVisible(topIdx);
        const newBottom = this.#findNearestVisible(bottomIdx);

        if (this.#isRow) {
            if (newTop >= 0 && newBottom >= 0) {
                selection.setRange(newTop, range.topCol, newBottom, range.bottomCol);
            }
            selection.setActive(newIdx, focusCol);
        } else {
            if (newTop >= 0 && newBottom >= 0) {
                selection.setRange(range.topRow, newTop, range.bottomRow, newBottom);
            }
            selection.setActive(focusRow, newIdx);
        }
    }

    /**
     * 寻找距离给定索引最近的可见项
     *
     * 搜索策略：
     * 1. 如果当前索引本身可见 → 直接返回
     * 2. 向右（index + 1）搜索，最多 100 步
     * 3. 向左（index - 1）搜索，直到 0
     * 4. 均找不到 → 返回 -1
     *
     * @param {number} idx - 起始索引
     * @returns {number} 最近可见项索引，找不到返回 -1
     * @private
     */
    #findNearestVisible(idx) {
        const rc = this.sheet.rowColManager;
        if (!this.#rcIsHidden(idx)) return idx;

        // 优先向正方向搜索
        for (let i = idx + 1; i < idx + 100; i++) {
            if (!this.#rcIsHidden(i)) return i;
        }
        // 再向负方向搜索
        for (let i = idx - 1; i >= 0; i--) {
            if (!this.#rcIsHidden(i)) return i;
        }
        return -1;
    }

    // ═══════════════════════════════════════════════════════════════
    // 生命周期
    // ═══════════════════════════════════════════════════════════════

    /**
     * 启用插件
     *
     * 恢复激活状态，重新应用隐藏配置。
     */
    enable() {
        super.enable();
        this.#active = true;
    }

    /**
     * 禁用插件
     *
     * 清除所有隐藏状态（恢复所有行/列），失效缓存并重新渲染。
     */
    disable() {
        super.disable();
        this.#active = false;

        const sheet = this.sheet;
        if (sheet) {
            this.#rcClearHidden();
        }
        this.renderEngine?.invalidateAll();
        this.render();
    }

    /**
     * 销毁插件
     *
     * 先禁用（恢复所有隐藏），再调用父类销毁清理资源。
     */
    destroy() {
        this.disable();
        super.destroy();
    }
}
