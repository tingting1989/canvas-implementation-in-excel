import { BasePlugin } from "./BasePlugin.js";
import { HOOKS } from "../constants/hookNames.js";
import { isNumber } from "../core/utils.js";

/**
 * 冻结行列插件
 *
 * ## 设计目的
 * 实现类似 Excel 的"冻结窗格"功能，使指定行/列在滚动时保持固定不动。
 * 冻结行固定在视口顶部，冻结列固定在视口左侧。
 *
 * ## 核心原理
 * 冻结状态存储在 Sheet 实例的 `fixedRowsTop` / `fixedColumnsStart` 属性中，
 * 渲染引擎（RenderEngine）和表头渲染器（HeaderRenderer）根据这些属性
 * 将视口拆分为多个裁剪区域分别渲染：
 *
 * ```
 * ┌──────────┬────────────────────────┐
 * │  左上角   │     冻结行×可滚动列     │
 * ├──────────┼────────────────────────┤
 * │ 冻结列×  │                        │
 * │ 可滚动行  │     可滚动区域          │
 * └──────────┴────────────────────────┘
 * ```
 *
 * 四个区域的渲染策略：
 * - 冻结行×冻结列：scrollX=0, scrollY=0，始终固定
 * - 冻结行×可滚动列：scrollY=0，仅水平滚动
 * - 可滚动行×冻结列：scrollX=0，仅垂直滚动
 * - 可滚动区域：正常滚动
 *
 * ## 与 Handsontable 的对应关系
 * - `fixedRowsTop`    ↔ Handsontable `fixedRowsTop`
 * - `fixedColumnsStart` ↔ Handsontable `fixedColumnsStart`
 * - `freeze(rows, cols)` ↔ Handsontable 无直接对应，为便捷方法
 * - `unfreeze()`       ↔ Handsontable 无直接对应，一键取消所有冻结
 *
 * ## 钩子
 * - `AFTER_FREEZE`   — 冻结变更后触发（含行数、列数参数）
 * - `AFTER_UNFREEZE` — 取消所有冻结后触发
 *
 * ## 资源管理
 * - `init()` → 读取配置，应用冻结，触发首次渲染
 * - `enable()/disable()` → 同步冻结状态，disable 时清除冻结
 * - `destroy()` → 先 disable（恢复冻结），再调用 super.destroy()
 *
 * @extends BasePlugin
 *
 * @example
 * // 通过配置初始化
 * const wb = new Workbook('grid', {
 *     plugins: ['freeze'],
 *     pluginOptions: {
 *         freeze: { fixedRowsTop: 1, fixedColumnsStart: 2 }
 *     }
 * });
 *
 * @example
 * // 运行时 API 调用
 * const freeze = workbook.getPlugin('freeze');
 * freeze.freeze(2, 1);          // 冻结前 2 行 + 前 1 列
 * freeze.setFixedRowsTop(3);    // 修改冻结行数为 3
 * freeze.unfreeze();            // 取消所有冻结
 * freeze.isFrozen();            // false
 */
export class FreezePlugin extends BasePlugin {
    // ═══════════════════════════════════════════════════════════════
    // 静态属性
    // ═══════════════════════════════════════════════════════════════

    /**
     * 插件名称标识
     * @returns {string} "freeze"
     */
    static get PLUGIN_NAME() {
        return "freeze";
    }

    // ═══════════════════════════════════════════════════════════════
    // 私有实例字段
    // ═══════════════════════════════════════════════════════════════

    /**
     * 插件是否处于激活状态（已初始化且未禁用）
     * @type {boolean}
     * @private
     */
    #active = false;

    // ═══════════════════════════════════════════════════════════════
    // 生命周期
    // ═══════════════════════════════════════════════════════════════

    /**
     * 初始化插件
     *
     * 从 options 中读取冻结配置并应用到 Sheet：
     * - `options.fixedRowsTop` — 顶部冻结行数
     * - `options.fixedColumnsStart` — 左侧冻结列数
     *
     * 仅接受正整数，0 或负值将被忽略（保持无冻结状态）。
     *
     * @param {object} [options={}] - 插件配置
     * @param {number} [options.fixedRowsTop] - 顶部冻结行数
     * @param {number} [options.fixedColumnsStart] - 左侧冻结列数
     */
    init(options = {}) {
        super.init(options);
        if (options.fixedRowsTop !== undefined || options.fixedColumnsStart !== undefined) {
            const sheet = this.sheet;
            if (sheet) {
                if (isNumber(options.fixedRowsTop) && options.fixedRowsTop > 0) {
                    sheet.fixedRowsTop = options.fixedRowsTop;
                }
                if (isNumber(options.fixedColumnsStart) && options.fixedColumnsStart > 0) {
                    sheet.fixedColumnsStart = options.fixedColumnsStart;
                }
            }
        }

        this.#active = true;
        this.renderEngine?.invalidateAll();
        this.render();
    }

    // ═══════════════════════════════════════════════════════════════
    // 只读属性
    // ═══════════════════════════════════════════════════════════════

    /**
     * 插件是否处于激活状态
     * @returns {boolean}
     */
    get active() {
        return this.#active;
    }

    /**
     * 当前顶部冻结行数
     * @returns {number}
     */
    get fixedRowsTop() {
        return this.sheet ? this.sheet.fixedRowsTop : 0;
    }

    /**
     * 当前左侧冻结列数
     * @returns {number}
     */
    get fixedColumnsStart() {
        return this.sheet ? this.sheet.fixedColumnsStart : 0;
    }

    // ═══════════════════════════════════════════════════════════════
    // 公共 API
    // ═══════════════════════════════════════════════════════════════

    /**
     * 设置顶部冻结行数
     *
     * 修改冻结行数后自动触发重绘和钩子通知：
     * - 若仍有冻结（行或列）→ 触发 `AFTER_FREEZE`
     * - 若从有冻结变为无冻结 → 触发 `AFTER_UNFREEZE`
     *
     * @param {number} count - 冻结行数，0 表示取消行冻结，负值自动归零
     */
    setFixedRowsTop(count) {
        const sheet = this.sheet;
        if (!sheet) return;
        const oldRows = sheet.fixedRowsTop;
        const oldCols = sheet.fixedColumnsStart;
        sheet.fixedRowsTop = Math.max(0, Math.floor(count));
        this.#applyAndNotify(oldRows, oldCols);
    }

    /**
     * 设置左侧冻结列数
     *
     * 修改冻结列数后自动触发重绘和钩子通知：
     * - 若仍有冻结（行或列）→ 触发 `AFTER_FREEZE`
     * - 若从有冻结变为无冻结 → 触发 `AFTER_UNFREEZE`
     *
     * @param {number} count - 冻结列数，0 表示取消列冻结，负值自动归零
     */
    setFixedColumnsStart(count) {
        const sheet = this.sheet;
        if (!sheet) return;
        const oldRows = sheet.fixedRowsTop;
        const oldCols = sheet.fixedColumnsStart;
        sheet.fixedColumnsStart = Math.max(0, Math.floor(count));
        this.#applyAndNotify(oldRows, oldCols);
    }

    /**
     * 同时设置冻结行数和列数
     *
     * 便捷方法，一次调用同时修改行和列的冻结状态。
     * 由于此方法一定是设置冻结（rows/cols 至少一个 > 0），
     * 因此始终触发 `AFTER_FREEZE` 钩子。
     *
     * @param {number} rows - 冻结行数
     * @param {number} cols - 冻结列数
     */
    freeze(rows, cols) {
        const sheet = this.sheet;
        if (!sheet) return;
        sheet.fixedRowsTop = Math.max(0, Math.floor(rows || 0));
        sheet.fixedColumnsStart = Math.max(0, Math.floor(cols || 0));
        this.renderEngine?.invalidateAll();
        this.render();
        this.#notifyFreezeChange();
    }

    /**
     * 取消所有冻结
     *
     * 将冻结行数和列数同时归零。仅在之前存在冻结时触发 `AFTER_UNFREEZE` 钩子。
     */
    unfreeze() {
        const sheet = this.sheet;
        if (!sheet) return;
        const hadFreeze = sheet.fixedRowsTop > 0 || sheet.fixedColumnsStart > 0;
        sheet.fixedRowsTop = 0;
        sheet.fixedColumnsStart = 0;
        this.renderEngine?.invalidateAll();
        this.render();
        if (hadFreeze) {
            this.hooks?.runHooks(HOOKS.AFTER_UNFREEZE);
        }
    }

    /**
     * 判断当前是否存在冻结（行或列）
     * @returns {boolean}
     */
    isFrozen() {
        const sheet = this.sheet;
        return sheet ? sheet.fixedRowsTop > 0 || sheet.fixedColumnsStart > 0 : false;
    }

    // ═══════════════════════════════════════════════════════════════
    // 私有方法
    // ═══════════════════════════════════════════════════════════════

    /**
     * 应用渲染刷新并通知冻结变更
     *
     * 被 `setFixedRowsTop` 和 `setFixedColumnsStart` 共用，
     * 消除两者之间的重复逻辑（失效缓存 + 重新渲染 + 钩子通知）。
     *
     * @param {number} oldRows - 变更前的冻结行数
     * @param {number} oldCols - 变更前的冻结列数
     * @private
     */
    #applyAndNotify(oldRows, oldCols) {
        this.renderEngine?.invalidateAll();
        this.render();
        this.#notifyFreezeChange(oldRows, oldCols);
    }

    /**
     * 通知冻结状态变更钩子
     *
     * 判断逻辑：
     * - 当前仍有冻结（行或列 > 0）→ 触发 `AFTER_FREEZE`，传递当前冻结参数
     * - 当前无冻结，但之前有冻结 → 触发 `AFTER_UNFREEZE`
     * - 当前无冻结，之前也无冻结 → 不触发任何钩子
     *
     * `oldRows`/`oldCols` 参数可选：`freeze()` 调用时不需要旧值
     * （因为一定是冻结操作），`setFixedRowsTop`/`setFixedColumnsStart`
     * 调用时传入旧值以判断是否需要触发 `AFTER_UNFREEZE`。
     *
     * @param {number} [oldRows] - 变更前的冻结行数
     * @param {number} [oldCols] - 变更前的冻结列数
     * @private
     */
    #notifyFreezeChange(oldRows, oldCols) {
        const sheet = this.sheet;
        if (!sheet) return;
        if (sheet.fixedRowsTop > 0 || sheet.fixedColumnsStart > 0) {
            this.hooks?.runHooks(HOOKS.AFTER_FREEZE, sheet.fixedRowsTop, sheet.fixedColumnsStart);
        } else if ((oldRows ?? 0) > 0 || (oldCols ?? 0) > 0) {
            this.hooks?.runHooks(HOOKS.AFTER_UNFREEZE);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 启用 / 禁用 / 销毁
    // ═══════════════════════════════════════════════════════════════

    /**
     * 启用插件
     *
     * 恢复激活状态。注意：不会自动恢复之前的冻结配置，
     * 需要手动调用 `freeze()` 或 `setFixedRowsTop()` 等方法。
     */
    enable() {
        super.enable();
        this.#active = true;
    }

    /**
     * 禁用插件
     *
     * 清除所有冻结状态（行和列归零），失效缓存并重新渲染。
     * 禁用后用户无法看到任何冻结效果。
     */
    disable() {
        super.disable();
        this.#active = false;
        const sheet = this.sheet;
        if (sheet) {
            sheet.fixedRowsTop = 0;
            sheet.fixedColumnsStart = 0;
        }
        this.renderEngine?.invalidateAll();
        this.render();
    }

    /**
     * 销毁插件
     *
     * 先禁用（清除冻结状态），再调用父类销毁清理所有注册资源。
     */
    destroy() {
        this.disable();
        super.destroy();
    }
}