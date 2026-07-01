import { WebComponent } from "../core/WebComponent.js";

/**
 * FormulaBarElement — 公式栏 Web Component
 *
 * 使用方式：
 * <formula-bar cell-ref="A1" value="=SUM(A1:A10)"></formula-bar>
 *
 * 事件：
 * - commit: 回车确认时触发（detail: { value }）
 * - cancel: Esc取消时触发
 * - commit-and-move: Tab确认并移动时触发（detail: { value, direction }）
 * - start-edit: 聚焦时触发
 */
export class FormulaBarElement extends WebComponent {
    static get observedAttributes() {
        return ["cell-ref", "value", "editing"];
    }

    onConnect(disposable) {
        const input = this.shadowRoot.querySelector(".formula-input");

        disposable.trackEvent(input, "keydown", this.#handleKeydown);
        disposable.trackEvent(input, "focus", this.#handleFocus);
        disposable.trackEvent(input, "blur", this.#handleBlur);
        disposable.trackEvent(input, "compositionstart", () => (this.composing = true));
        disposable.trackEvent(input, "compositionend", () => (this.composing = false));
    }

    render() {
        const cellRef = this.getAttribute("cell-ref") || "A1";
        const value = this.getAttribute("value") || "";
        const editing = this.hasAttribute("editing");

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: flex;
                    height: 28px;
                    border-bottom: 1px solid #d0d0d0;
                    background: #fff;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                }
                
                .cell-ref {
                    width: 80px;
                    padding: 0 12px;
                    background: #f5f5f5;
                    border-right: 1px solid #d0d0d0;
                    font-size: 13px;
                    color: #444;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    user-select: none;
                    font-weight: 500;
                }
                
                .formula-input {
                    flex: 1;
                    padding: 0 12px;
                    border: none;
                    font-size: 13px;
                    font-family: "SF Mono", "Monaco", "Inconsolata", "Fira Mono", "Droid Sans Mono", "Source Code Pro", monospace;
                    background: ${editing ? "#fffbe6" : "#fff"};
                    transition: background 0.15s ease;
                }
                
                .formula-input:focus {
                    outline: none;
                    background: #fffbe6;
                }
                
                .formula-input::placeholder {
                    color: #999;
                    font-style: italic;
                }
            </style>
            
            <div class="cell-ref">${this.escapeHtml(cellRef)}</div>
            <input class="formula-input" type="text" 
                   value="${this.escapeHtml(value)}" 
                   placeholder="输入值或公式...">
        `;
    }

    #handleKeydown = (e) => {
        if (this.composing) return;

        if (e.key === "Enter") {
            e.preventDefault();
            const input = e.target;
            this.dispatchEvent(
                new CustomEvent("commit", {
                    bubbles: true,
                    composed: true,
                    detail: { value: input.value },
                }),
            );
        } else if (e.key === "Escape") {
            e.preventDefault();
            this.dispatchEvent(
                new CustomEvent("cancel", {
                    bubbles: true,
                    composed: true,
                }),
            );
        } else if (e.key === "Tab") {
            e.preventDefault();
            const input = e.target;
            this.dispatchEvent(
                new CustomEvent("commit-and-move", {
                    bubbles: true,
                    composed: true,
                    detail: { value: input.value, direction: e.shiftKey ? "prev" : "next" },
                }),
            );
        }
    };

    #handleFocus = (e) => {
        e.target.select();
        this.setAttribute("editing", "");
        this.dispatchEvent(
            new CustomEvent("start-edit", {
                bubbles: true,
                composed: true,
            }),
        );
    };

    #handleBlur = (e) => {
        if (!this.hasAttribute("editing")) {
            this.dispatchEvent(
                new CustomEvent("cancel", {
                    bubbles: true,
                    composed: true,
                }),
            );
        }
        this.removeAttribute("editing");
    };

    // 公开方法：设置值
    setValue(value) {
        const input = this.shadowRoot.querySelector(".formula-input");
        if (input) input.value = value;
    }

    // 公开方法：获取值
    getValue() {
        const input = this.shadowRoot.querySelector(".formula-input");
        return input ? input.value : "";
    }

    // 公开方法：聚焦
    focus() {
        const input = this.shadowRoot.querySelector(".formula-input");
        if (input) input.focus();
    }

    // 公开方法：取消编辑
    cancelEdit() {
        this.removeAttribute("editing");
        const input = this.shadowRoot.querySelector(".formula-input");
        if (input) input.blur();
    }

    onDisconnect() {
        console.log("FormulaBar destroyed");
    }
}

customElements.define("formula-bar", FormulaBarElement);
