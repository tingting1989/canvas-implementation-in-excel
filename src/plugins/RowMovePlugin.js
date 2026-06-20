import { BaseMovePlugin } from "./BaseMovePlugin.js";
import { RowMoveStrategy } from "../editor/strategies/RowMoveStrategy.js";

/**
 * 行拖拽移动插件
 *
 * 参考 Handsontable ManualRowMove API：
 * - 用户拖拽行头即可移动整行数据
 * - 支持 beforeRowMove / afterRowMove 钩子
 * - 可通过 pluginOptions.rowMove.enabled = false 禁用
 *
 * 用法：
 * ```js
 * const wb = new Workbook('grid', {
 *     plugins: ['rowMove'],
 *     pluginOptions: { rowMove: { enabled: true } }
 * });
 * ```
 */
export class RowMovePlugin extends BaseMovePlugin {
    static get PLUGIN_NAME() {
        return "rowMove";
    }

    /** @override */
    _createStrategy() {
        return new RowMoveStrategy(this.eventHandler);
    }
}
