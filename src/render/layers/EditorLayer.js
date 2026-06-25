import { BaseLayer } from "../BaseLayer.js";
import { CONFIG } from "../../constants/config";

export class EditorLayer extends BaseLayer {
    constructor() {
        super("editor", 80);
    }

    bindStore(store) {
        super.bindStore(store);
        this.watchForDirty("editor");
        this.watchForDirty("selection");
        this.watchForDirty("scroll");
    }

    render(ctx, sheet, viewport, options = {}) {
        if (!this.enabled) return;

        const { viewW, viewH } = options;
        const store = this.getStore();
        if (!store) return;

        const editorVisible = store.state.editor.visible;
        if (!editorVisible) {
            this.renderCount++;
            return;
        }

        const row = store.state.editor.row;
        const col = store.state.editor.col;
        if (row < 0 || col < 0) {
            this.renderCount++;
            return;
        }

        const merge = sheet.getMerge(row, col);
        let rect;
        if (merge) {
            rect = viewport.mergeToViewRect(merge);
        } else {
            rect = viewport.cellToViewRect(row, col);
        }

        ctx.save();
        ctx.strokeStyle = CONFIG.SELECTION_COLOR;
        ctx.lineWidth = 2;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

        ctx.fillStyle = "rgba(76, 139, 245, 0.06)";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.restore();

        this.renderCount++;
    }
}