import { EventStrategy } from "../../editor/strategies/EventStrategy.js";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { HIT_TYPE } from "../../constants/hitType.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";

export class FilterStrategy extends EventStrategy {
    /** 筛选策略优先级（高于默认鼠标策略 50） */
    priority = STRATEGY_PRIORITY.POPUP_UI;

    #uiManager = null;
    #iconSize = 12;
    #iconPadding = 6;

    constructor(uiManager, handler) {
        super(handler);
        this.#uiManager = uiManager;
    }

    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => this.#handleCanvasMouseDown(e),
        };
    }

    #handleCanvasMouseDown(e) {
        if (!this.enabled || !this.#uiManager || !this.handler?.viewport) return true;

        // 使用 viewport.hitTest 获取点击信息（与 MouseStrategy 相同的方式）
        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (!hit) return true;

        // 只处理列头区域的点击
        if (hit.type !== HIT_TYPE.COL_HEADER) return true;

        // 检查是否点击了筛选图标区域
        const isFilterIconHit = this.#isFilterIconArea(hit, e);

        if (!isFilterIconHit) return true; // 不是图标区域，让其他策略处理

        e.preventDefault();
        e.stopPropagation();

        const col = hit.col;
        const position = {
            x: e.clientX,
            y: e.clientY,
        };

        console.log("[Filter] 点击筛选图标 - 列:", col, "位置:", position);

        this.#uiManager.openDropdown(col, position);

        return false; // 阻止后续策略处理（如选整列）
    }

    #isFilterIconArea(hit, event) {
        if (!hit.rect) return false;

        // 计算图标区域（列头右侧）
        const iconRightEdge = hit.rect.right - this.#iconPadding;
        const iconLeftEdge = iconRightEdge - (this.#iconSize + this.#iconPadding * 2);

        // 使用 hit 中的坐标或事件的 clientX
        let mouseX;
        if (hit.mouseX !== undefined) {
            mouseX = hit.mouseX;
        } else {
            // 如果 hit 没有 mouseX，从 rect 和事件计算相对位置
            mouseX = event.clientX - (hit.rect.left || 0);

            // 加上可能的视口偏移
            if (hit.viewportX !== undefined) {
                mouseX += hit.viewportX;
            }
        }

        const isIconArea = mouseX >= iconLeftEdge && mouseX <= iconRightEdge;

        if (isIconArea) {
            console.log("[Filter] 图标命中检测成功");
            console.log("   图标区域:", iconLeftEdge, "-", iconRightEdge);
            console.log("   鼠标 X:", mouseX);
        }

        return isIconArea;
    }

    destroy() {
        super.destroy();
        this.#uiManager = null;
    }
}
