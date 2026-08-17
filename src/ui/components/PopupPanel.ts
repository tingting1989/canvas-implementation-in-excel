import { EVENT_NAMES } from "../../constants/eventNames.js";

interface PopupShowOptions {
    content?: HTMLElement;
    position?: { x: number; y: number };
    anchor?: HTMLElement;
    placement?: "top" | "bottom" | "left" | "right";
    title?: string;
    draggable?: boolean;
    mask?: boolean;
    closeOnClickOutside?: boolean;
    closeOnEscape?: boolean;
    zIndex?: number;
    onClose?: (reason: string) => void;
}

interface DragStartState {
    clientX: number;
    clientY: number;
    panelX: number;
    panelY: number;
}

const template = document.createElement("template");
template.innerHTML = `
<style>
  :host {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 10000;
  }
 

.mask {
    position: absolute;
    inset: 0;
    background: transparent;
    display: none;
    pointer-events: auto;   
}
:host([data-mask="true"]) .mask {
    background: rgba(0, 0, 0, 0.28);
    display: block;
}


  .panel {
    position: absolute;
    min-width: 260px;
    background: var(--popup-bg, #ffffff);
    border: 1px solid var(--popup-border, #d9d9d9);
    border-radius: 6px;
    box-shadow: 0 8px 30px rgba(0,0,0,.18);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    opacity: 0;
    pointer-events: auto;
    will-change: transform, opacity;
    transform-origin: top center;
}

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--popup-header-bg, #fafafa);
    border-bottom: 1px solid var(--popup-border, #e5e6eb);
    cursor: grab;
    user-select: none;
    flex-shrink: 0;
  }
  .header.dragging {
    cursor: grabbing;
  }

  .title {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    color: var(--popup-title-color, #1f2329);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :host(:not([data-has-title])) .title {
    visibility: hidden;
  }

  .close-btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    font-size: 15px;
    color: #8f959e;
    flex-shrink: 0;
    line-height: 1;
  }
  .close-btn:hover {
    background: #e8eaed;
    color: #1f2329;
  }

  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>

<div class="mask" part="mask"></div>
<div class="panel" part="panel">
  <div class="header" part="header">
    <span class="title" part="title"></span>
    <span class="close-btn" part="close">×</span>
  </div>
  <div class="body"><slot></slot></div>
</div>
`;

export class PopupPanel extends HTMLElement {
    static DEFAULT_Z_INDEX = 10000;
    static ANIMATION_DURATION = 150;

    #anchor: HTMLElement | null = null;
    #position: { x: number; y: number } = { x: 0, y: 0 };
    #placement: "top" | "bottom" | "left" | "right" = "bottom";
    #zIndex: number = PopupPanel.DEFAULT_Z_INDEX;
    #visible: boolean = false;
    #closeOnClickOutside: boolean = true;
    #closeOnEscape: boolean = true;
    #draggable: boolean = true;
    #onClose: ((reason: string) => void) | null = null;

    #dragging: boolean = false;
    #dragStart: DragStartState | null = null;
    #rafDrag: number | null = null;

    _panel: HTMLElement | null = null;
    _header: HTMLElement | null = null;
    _titleEl: HTMLElement | null = null;
    _closeBtn: HTMLElement | null = null;
    _body: HTMLElement | null = null;
    _mask: HTMLElement | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot!.appendChild(template.content.cloneNode(true));

        this._panel = this.shadowRoot!.querySelector(".panel");
        this._header = this.shadowRoot!.querySelector(".header");
        this._titleEl = this.shadowRoot!.querySelector(".title");
        this._closeBtn = this.shadowRoot!.querySelector(".close-btn");
        this._body = this.shadowRoot!.querySelector(".body");
        this._mask = this.shadowRoot!.querySelector(".mask");

        this.setAttribute("role", "dialog");
        this.setAttribute("aria-modal", "false");
    }

    show(options: PopupShowOptions = {}): void {
        if (this.#visible) return;

        this.#anchor = options.anchor || null;
        this.#position = options.position || { x: 0, y: 0 };
        this.#placement = options.placement || "bottom";
        this.#zIndex = options.zIndex || PopupPanel.DEFAULT_Z_INDEX;
        this.#onClose = options.onClose || null;
        this.#closeOnClickOutside = options.closeOnClickOutside !== false;
        this.#closeOnEscape = options.closeOnEscape !== false;
        this.#draggable = options.draggable !== false;

        this.style.zIndex = String(this.#zIndex);

        this.dataset.mask = options.mask ? "true" : "false";

        if (options.title) {
            this._titleEl!.textContent = options.title;
            this.setAttribute("data-has-title", "");
        } else {
            this.removeAttribute("data-has-title");
        }

        this._body!.innerHTML = "";
        if (options.content) {
            this._body!.appendChild(options.content);
        }

        if (!this.isConnected) {
            document.body.appendChild(this);
        }

        this.style.display = "block";
        this._panel!.style.left = "0px";
        this._panel!.style.top = "0px";
        this._panel!.style.transform = "none";
        this.#calculatePosition();

        this.setAttribute("open", "");
        this.#enterAnimation(() => {
            this.#visible = true;
            this.#bindGlobalEvents();
        });

        if (this.#draggable) {
            this._header!.addEventListener("mousedown", this.#onDragStart);
        }

        this._closeBtn!.onclick = () => this.hide("close-btn");
    }

    hide(reason: string = "user"): void {
        if (!this.#visible) return;

        this.#unbindGlobalEvents();
        this.#cleanupDrag();

        this.#exitAnimation(() => {
            this.style.display = "none";
            this.style.pointerEvents = "";
            this.removeAttribute("open");
            this._body!.innerHTML = "";
            this.#visible = false;

            if (this.parentNode) {
                this.parentNode.removeChild(this);
            }

            const cb = this.#onClose;
            this.#onClose = null;
            cb?.(reason);
        });
    }

    toggle(options: PopupShowOptions = {}): void {
        this.#visible ? this.hide() : this.show(options);
    }

    updatePosition(): void {
        if (!this.#visible) return;
        this.#calculatePosition();
    }

    setTitle(text: string): void {
        if (text) {
            this._titleEl!.textContent = text;
            this.setAttribute("data-has-title", "");
        } else {
            this.removeAttribute("data-has-title");
        }
    }

    get visible(): boolean {
        return this.#visible;
    }

    get panelEl(): HTMLElement | null {
        return this._panel;
    }

    #calculatePosition(): void {
        let x: number, y: number;

        if (this.#anchor) {
            const rect = this.#anchor.getBoundingClientRect();
            const offset = this.getOffset();

            switch (this.#placement) {
                case "bottom":
                    x = rect.left + offset.x;
                    y = rect.bottom + offset.y;
                    break;
                case "top":
                    x = rect.left + offset.x;
                    y = rect.top - this._panel!.offsetHeight - Math.abs(offset.y);
                    break;
                case "right":
                    x = rect.right + Math.abs(offset.x);
                    y = rect.top + offset.y;
                    break;
                case "left":
                    x = rect.left - this._panel!.offsetWidth - Math.abs(offset.x);
                    y = rect.top + offset.y;
                    break;
                default:
                    x = rect.left + offset.x;
                    y = rect.bottom + offset.y;
            }
        } else {
            x = this.#position.x;
            y = this.#position.y;
        }

        this.#clampToViewport(x, y);
    }

    #clampToViewport(x: number, y: number): void {
        const w = this._panel!.offsetWidth || 260;
        const h = this._panel!.offsetHeight || 300;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        x = Math.max(4, Math.min(x, vw - w - 4));
        y = Math.max(4, Math.min(y, vh - h - 4));

        this._panel!.style.left = `${x}px`;
        this._panel!.style.top = `${y}px`;
    }

    getOffset(): { x: number; y: number } {
        return { x: 0, y: 4 };
    }

    #onDragStart = (e: MouseEvent): void => {
        if (e.button !== 0) return;
        if (e.target === this._closeBtn || (e.target as HTMLElement).closest(".close-btn")) return;

        e.preventDefault();
        this.#dragging = true;
        this._header!.classList.add("dragging");

        const rect = this._panel!.getBoundingClientRect();
        this.#dragStart = {
            clientX: e.clientX,
            clientY: e.clientY,
            panelX: rect.left,
            panelY: rect.top,
        };

        document.addEventListener("mousemove", this.#onDragMove);
        document.addEventListener("mouseup", this.#onDragEnd, { once: true });
    };

    #onDragMove = (e: MouseEvent): void => {
        if (!this.#dragging) return;
        if (this.#rafDrag) cancelAnimationFrame(this.#rafDrag);
        this.#rafDrag = requestAnimationFrame(() => {
            let x = this.#dragStart!.panelX + (e.clientX - this.#dragStart!.clientX);
            let y = this.#dragStart!.panelY + (e.clientY - this.#dragStart!.clientY);
            this.#clampToViewport(x, y);
        });
    };

    #onDragEnd = (): void => {
        if (!this.#dragging) return;
        this.#dragging = false;
        this._header!.classList.remove("dragging");
        document.removeEventListener("mousemove", this.#onDragMove);
        this.#rafDrag = null;
        const left = parseFloat(this._panel!.style.left);
        const top = parseFloat(this._panel!.style.top);
        this.#clampToViewport(left, top);
    };

    #cleanupDrag(): void {
        document.removeEventListener("mousemove", this.#onDragMove);
        document.removeEventListener("mouseup", this.#onDragEnd);
        this.#dragging = false;
        this._header?.classList.remove("dragging");
    }

    #bindGlobalEvents(): void {
        if (this.#closeOnClickOutside) {
            document.addEventListener(EVENT_NAMES.MOUSEDOWN, this.#handleClickOutside);
        }
        if (this.#closeOnEscape) {
            document.addEventListener(EVENT_NAMES.KEYDOWN, this.#handleEscapeKey);
        }
    }

    #unbindGlobalEvents(): void {
        document.removeEventListener(EVENT_NAMES.MOUSEDOWN, this.#handleClickOutside);
        document.removeEventListener(EVENT_NAMES.KEYDOWN, this.#handleEscapeKey);
    }

    #handleClickOutside = (e: MouseEvent): void => {
        const clickedInsidePanel = e.composedPath().some((el) => el === this._panel || el === this._header || el === this._body);

        if (clickedInsidePanel) return;

        this.hide("click-outside");
    };

    #handleEscapeKey = (e: KeyboardEvent): void => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.hide("escape");
        }
    };

    #enterAnimation(done: () => void): void {
        this.onEnter();
        setTimeout(done, PopupPanel.ANIMATION_DURATION);
    }

    #exitAnimation(done: () => void): void {
        this.onExit(done);
    }

    onEnter(): void {
        this._panel!.style.transition = "none";
        this._panel!.style.opacity = "0";
        this._panel!.style.transform = "scaleY(0.9)";

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this._panel!.style.transition = `opacity ${PopupPanel.ANIMATION_DURATION}ms ease, transform ${PopupPanel.ANIMATION_DURATION}ms ease`;
                this._panel!.style.opacity = "1";
                this._panel!.style.transform = "scaleY(1)";
            });
        });
    }

    onExit(callback: () => void): void {
        this._panel!.style.transition = `opacity ${PopupPanel.ANIMATION_DURATION}ms ease, transform ${PopupPanel.ANIMATION_DURATION}ms ease`;
        this._panel!.style.opacity = "0";
        this._panel!.style.transform = "scaleY(0.9)";
        setTimeout(callback, PopupPanel.ANIMATION_DURATION);
    }

    disconnectedCallback(): void {
        this.#cleanupDrag();
        this.#unbindGlobalEvents();
    }
}

customElements.define("popup-panel-new", PopupPanel);

declare global {
    interface HTMLElementTagNameMap {
        "popup-panel-new": PopupPanel;
    }
}
