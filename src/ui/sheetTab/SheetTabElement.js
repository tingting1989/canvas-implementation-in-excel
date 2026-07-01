import { WebComponent } from "@/core/WebComponent";
import { SHEET_TAB_EVENTS } from "./SheetTabEvents.js";

/**
 * SheetTabElement — 工作表标签 Web Component
 *
 * 使用方式：
 * <sheet-tab name="Sheet1" active closable></sheet-tab>
 *
 * 事件：
 * - switch: 点击标签时触发（detail: { name }）
 * - close: 点击关闭按钮时触发（detail: { name }）
 * - rename: 双击标签时触发（detail: { name }）
 */
export class SheetTabElement extends WebComponent {
    static get observedAttributes() {
        return ["name", "active", "closable"];
    }

    onConnect(disposable) {
        disposable.trackEvent(this.shadowRoot, "click", this.#handleClick);
        disposable.trackEvent(this.shadowRoot, "dblclick", this.#handleDblClick);
    }

    #styleText = `
        :host {
            display: inline-flex;
            align-items: center;
            padding: 0 10px;
            height: 100%;
            font-size: 11px;
            color: #444;
            cursor: pointer;
            background: #e7e7e7;
            position: relative;
            flex-shrink: 0;
            user-select: none;
            border-left: 1px solid transparent;
            border-right: 1px solid transparent;
        }

        :host(:hover) {
            background: #d8d8d8;
        }

        :host([active]) {
            background: #fff;
            color: #000;
            font-weight: 600;
            border-left: 1px solid #b4b4b4;
            border-right: 1px solid #b4b4b4;
        }

        :host([active]):hover {
            background: #fff;
        }

        .label {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 150px;
            line-height: 1;
        }

        .close-btn {
            display: none;
            margin-left: 6px;
            width: 16px;
            height: 16px;
            border-radius: 2px;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            color: #666;
            cursor: pointer;
        }

        :host([closable]) .close-btn {
            display: inline-flex;
        }

        :host([active]) .close-btn {
            display: inline-flex;
        }

        :host(:hover) .close-btn {
            display: inline-flex;
        }

        .close-btn:hover {
            background: #c0c0c0;
            color: #333;
        }
    `;

    render(changedAttr) {
        const name = this.getAttribute("name") || "";

        if (!this.shadowRoot.querySelector(".label")) {
            this.shadowRoot.innerHTML = `
                <style>${this.#styleText}</style>
                <span class="label">${this.escapeHtml(name)}</span>
                <span class="close-btn">×</span>
            `;
            return;
        }

        if (!changedAttr || changedAttr === "name") {
            const label = this.shadowRoot.querySelector(".label");
            if (label) label.textContent = name;
        }
    }

    #handleClick = (e) => {
        const closeBtn = e.target.closest(".close-btn");
        const name = this.getAttribute("name");
        if (closeBtn) {
            e.stopPropagation();
            this.emit(SHEET_TAB_EVENTS.CLOSE, { name });
        } else {
            this.emit(SHEET_TAB_EVENTS.SWITCH, { name });
        }
    };

    #handleDblClick = (e) => {
        if (!e.target.closest(".close-btn")) {
            this.emit(SHEET_TAB_EVENTS.RENAME, { name: this.getAttribute("name") });
        }
    };

    onDisconnect() {}
}

customElements.define("sheet-tab", SheetTabElement);
