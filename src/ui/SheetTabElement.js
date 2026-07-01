import { WebComponent } from "@/core/WebComponent";

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

    render() {
        const name = this.getAttribute("name") || "";
        const isActive = this.hasAttribute("active");
        const closable = this.hasAttribute("closable");

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: inline-flex;
                    align-items: center;
                    padding: 0 12px;
                    height: 100%;
                    font-size: 13px;
                    color: #444;
                    cursor: pointer;
                    border-right: 1px solid #d0d0d0;
                    background: ${isActive ? "#fff" : "#e8e8e8"};
                    position: relative;
                    flex-shrink: 0;
                    user-select: none;
                    transition: background 0.15s ease;
                }
                
                :host(:hover) {
                    background: ${isActive ? "#fff" : "#d8d8d8"};
                }
                
                :host([active]) {
                    background: #fff;
                    color: #217346;
                    font-weight: 600;
                    border-bottom: 2px solid #217346;
                }
                
                .label {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    max-width: 150px;
                }
                
                .close-btn {
                    display: ${closable ? "inline-flex" : "none"};
                    margin-left: 8px;
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    color: #888;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }
                
                .close-btn:hover {
                    background: #c8c8c8;
                    color: #333;
                }
            </style>
            
            <span class="label">${this.escapeHtml(name)}</span>
            <span class="close-btn">×</span>
        `;
    }

    #handleClick = (e) => {
        const closeBtn = e.target.closest(".close-btn");
        const name = this.getAttribute("name");
        if (closeBtn) {
            e.stopPropagation();
            this.emit("close", { name });
        } else {
            this.emit("switch", { name });
        }
    };

    #handleDblClick = (e) => {
        if (!e.target.closest(".close-btn")) {
            this.emit("rename", { name: this.getAttribute("name") });
        }
    };

    onDisconnect() {}
}

customElements.define("sheet-tab", SheetTabElement);