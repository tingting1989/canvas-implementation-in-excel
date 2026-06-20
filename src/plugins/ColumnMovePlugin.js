import { BaseMovePlugin } from "./BaseMovePlugin.js";
import { ColumnMoveStrategy } from "../editor/strategies/ColumnMoveStrategy.js";

/**
 * 列拖拽移动插件
 *
 * 参考 Handsontable ManualColumnMove API。
 */
export class ColumnMovePlugin extends BaseMovePlugin {
    static get PLUGIN_NAME() {
        return "columnMove";
    }

    /** @override */
    _createStrategy() {
        return new ColumnMoveStrategy(this.eventHandler);
    }
}
