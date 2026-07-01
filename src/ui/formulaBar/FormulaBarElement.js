import { WebComponent } from "@/core/WebComponent";
import { FORMULA_BAR_EVENTS } from "./FormulaBarEvents.js";

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
        return ["cell-ref", "editing"];
    }

    #cellRef = "A1";
    #value = "";

    onConnect(disposable) {
        const input = this.shadowRoot.querySelector(".formula-input");
        disposable.trackEvent(this, "keydown", (e) => e.stopPropagation());

        disposable.trackEvent(input, "keydown", this.#handleKeydown);
        disposable.trackEvent(input, "focus", this.#handleFocus);
        disposable.trackEvent(input, "blur", this.#handleBlur);
        disposable.trackEvent(input, "compositionstart", () => (this.composing = true));
        disposable.trackEvent(input, "compositionend", () => (this.composing = false));
    }

    #styleText = `
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
            background: #fff;
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

        :host([editing]) .formula-input {
            background: #fffbe6;
        }
    `;

    render(changedAttr) {
        if (!this.shadowRoot.querySelector(".formula-input")) {
            this.shadowRoot.innerHTML = `
                <style>${this.#styleText}</style>
                <div class="cell-ref"></div>
                <input class="formula-input" type="text" placeholder="输入值或公式...">
            `;

            this.shadowRoot.querySelector(".cell-ref").textContent = this.#cellRef;
            this.shadowRoot.querySelector(".formula-input").value = this.#value;
            return;
        }

        if (!changedAttr || changedAttr === "cell-ref") {
            this.#cellRef = this.getAttribute("cell-ref") || "A1";
            const cellRefEl = this.shadowRoot.querySelector(".cell-ref");
            if (cellRefEl) cellRefEl.textContent = this.#cellRef;
        }
    }

    #handleKeydown = (e) => {
        if (this.composing) return;

        if (e.key === "Enter") {
            e.preventDefault();
            this.emit(FORMULA_BAR_EVENTS.COMMIT, { value: e.target.value });
        } else if (e.key === "Escape") {
            e.preventDefault();
            this.emit(FORMULA_BAR_EVENTS.CANCEL);
        } else if (e.key === "Tab") {
            e.preventDefault();
            this.emit(FORMULA_BAR_EVENTS.COMMIT_AND_MOVE, { value: e.target.value, direction: e.shiftKey ? "prev" : "next" });
        }
    };

    #handleFocus = (e) => {
        e.target.select();
        this.setAttribute("editing", "");
        this.emit(FORMULA_BAR_EVENTS.START_EDIT);
    };

    #handleBlur = (e) => {
        if (!this.hasAttribute("editing")) {
            this.emit(FORMULA_BAR_EVENTS.CANCEL);
        }
        this.removeAttribute("editing");
    };

    setValue(value) {
        this.#value = value;
        const input = this.shadowRoot?.querySelector(".formula-input");
        if (input) input.value = value;
    }

    getValue() {
        if (this.isDestroyed) return this.#value;
        const input = this.shadowRoot?.querySelector(".formula-input");
        return input ? input.value : this.#value;
    }

    focus() {
        const input = this.shadowRoot?.querySelector(".formula-input");
        if (input) input.focus();
    }

    cancelEdit() {
        this.removeAttribute("editing");
        const input = this.shadowRoot?.querySelector(".formula-input");
        if (input) input.blur();
    }

    onDisconnect() {
        this.#value = "";
        this.#cellRef = "A1";
    }
}

customElements.define("formula-bar", FormulaBarElement);