import { BaseMovePlugin } from "./BaseMovePlugin.js";
import { RowMoveStrategy } from "../editor/strategies/RowMoveStrategy.js";

export class RowMovePlugin extends BaseMovePlugin {
    static get PLUGIN_NAME(): string {
        return "rowMove";
    }

    _createStrategy(): RowMoveStrategy {
        return new RowMoveStrategy(this.eventHandler);
    }
}
