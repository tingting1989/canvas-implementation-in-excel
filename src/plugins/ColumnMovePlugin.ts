import { BaseMovePlugin } from "./BaseMovePlugin.js";
import { ColumnMoveStrategy } from "../editor/strategies/ColumnMoveStrategy.js";

export class ColumnMovePlugin extends BaseMovePlugin {
    static get PLUGIN_NAME(): string {
        return "columnMove";
    }

    _createStrategy(): ColumnMoveStrategy {
        return new ColumnMoveStrategy(this.eventHandler);
    }
}
