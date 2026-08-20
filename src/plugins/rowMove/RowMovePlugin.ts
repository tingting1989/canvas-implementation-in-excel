import { BaseMovePlugin } from "../base/BaseMovePlugin.js";
import { RowMoveStrategy } from "./RowMoveStrategy.js";

export class RowMovePlugin extends BaseMovePlugin {
    static get PLUGIN_NAME(): string {
        return "rowMove";
    }

    _createStrategy(): RowMoveStrategy {
        return new RowMoveStrategy(this.eventHandler);
    }
}
