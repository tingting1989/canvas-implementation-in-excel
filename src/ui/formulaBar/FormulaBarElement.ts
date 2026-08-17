import { WebComponent } from "../../core/WebComponent.js";
import { FORMULA_BAR_EVENTS } from "./formulaBarEvents.js";

export class FormulaBarElement extends WebComponent {
    static get observedAttributes(): string[] {
        return ["cell-ref", "editing"];
    }

    composing: boolean = false;
    #cellRef: string = "A1";
    #value: string = "";

    onConnect(disposable: import("../../core/Disposable.js").Disposable): void {
        const input = this.shadowRoot!.querySelector(".formula-input") as HTMLInputElement;
        disposable.trackEvent(this, "keydown", (e: Event) => e.stopPropagation());

        disposable.trackEvent(input, "keydown", (e: Event) => this.#handleKeydown(e as KeyboardEvent));
        disposable.trackEvent(input, "focus", (e: Event) => this.#handleFocus(e as FocusEvent));
        disposable.trackEvent(input, "blur", (e: Event) => this.#handleBlur(e as FocusEvent));
        disposable.trackEvent(input, "compositionstart", () => (this.composing = true));
        disposable.trackEvent(input, "compositionend", () => (this.composing = false));
    }

    #styleText: string = `
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

    render(changedAttr?: string | null): void {
        if (!this.shadowRoot!.querySelector(".formula-input")) {
            this.shadowRoot!.innerHTML = `
                <style>${this.#styleText}</style>
                <div class="cell-ref"></div>
                <input class="formula-input" type="text" placeholder="输入值或公式...">
            `;

            this.shadowRoot!.querySelector(".cell-ref")!.textContent = this.#cellRef;
            (this.shadowRoot!.querySelector(".formula-input") as HTMLInputElement).value = this.#value;
            return;
        }

        if (!changedAttr || changedAttr === "cell-ref") {
            this.#cellRef = this.getAttribute("cell-ref") || "A1";
            const cellRefEl = this.shadowRoot!.querySelector(".cell-ref");
            if (cellRefEl) cellRefEl.textContent = this.#cellRef;
        }
    }

    #handleKeydown = (e: KeyboardEvent): void => {
        if (this.composing) return;

        if (e.key === "Enter") {
            e.preventDefault();
            this.emit(FORMULA_BAR_EVENTS.COMMIT, { value: (e.target as HTMLInputElement).value });
        } else if (e.key === "Escape") {
            e.preventDefault();
            this.emit(FORMULA_BAR_EVENTS.CANCEL);
        } else if (e.key === "Tab") {
            e.preventDefault();
            this.emit(FORMULA_BAR_EVENTS.COMMIT_AND_MOVE, { value: (e.target as HTMLInputElement).value, direction: e.shiftKey ? "prev" : "next" });
        }
    };

    #handleFocus = (e: FocusEvent): void => {
        (e.target as HTMLInputElement).select();
        this.setAttribute("editing", "");
        this.emit(FORMULA_BAR_EVENTS.START_EDIT);
    };

    #handleBlur = (_e: FocusEvent): void => {
        if (!this.hasAttribute("editing")) {
            this.emit(FORMULA_BAR_EVENTS.CANCEL);
        }
        this.removeAttribute("editing");
    };

    setValue(value: string): void {
        this.#value = value;
        const input = this.shadowRoot?.querySelector(".formula-input") as HTMLInputElement | null;
        if (input) input.value = value;
    }

    getValue(): string {
        if (this.isDestroyed) return this.#value;
        const input = this.shadowRoot?.querySelector(".formula-input") as HTMLInputElement | null;
        return input ? input.value : this.#value;
    }

    focus(): void {
        const input = this.shadowRoot?.querySelector(".formula-input") as HTMLInputElement | null;
        if (input) input.focus();
    }

    cancelEdit(): void {
        this.removeAttribute("editing");
        const input = this.shadowRoot?.querySelector(".formula-input") as HTMLInputElement | null;
        if (input) input.blur();
    }

    onDisconnect(): void {
        this.#value = "";
        this.#cellRef = "A1";
    }
}

customElements.define("formula-bar", FormulaBarElement);

declare global {
    interface HTMLElementTagNameMap {
        "formula-bar": FormulaBarElement;
    }
}
