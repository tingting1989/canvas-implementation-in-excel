import { WebComponent } from "../../core/WebComponent.js";
import { EVENT_NAMES } from "../../constants/eventNames.js";

export class PopupPanel extends WebComponent {
    static DEFAULT_Z_INDEX = 10000;
    static ANIMATION_DURATION = 150;

    #anchor = null;
    #position = { x: 0, y: 0 };
    #placement = "bottom";
    #zIndex = PopupPanel.DEFAULT_Z_INDEX;
    #visible = false;
    #closeOnClickOutside = true;
    #closeOnEscape = true;
    #onClose = null;
    #animationFrameId = null;

    constructor() {
        super();
        this.style.position = "fixed";
        this.style.display = "none";
        this.style.zIndex = this.#zIndex;
        this.setAttribute("role", "dialog");
        this.setAttribute("aria-modal", "false");
    }

    show(options = {}) {
        if (this.#visible) return;

        this.#anchor = options.anchor || null;
        this.#position = options.position || { x: 0, y: 0 };
        this.#placement = options.placement || "bottom";
        this.#zIndex = options.zIndex || PopupPanel.DEFAULT_Z_INDEX;
        this.#onClose = options.onClose || null;
        this.#closeOnClickOutside = options.closeOnClickOutside !== false;
        this.#closeOnEscape = options.closeOnEscape !== false;

        this.style.zIndex = this.#zIndex;

        if (!this.isConnected) {
            document.body.appendChild(this);
        }

        this.#calculatePosition();
        this.#enterAnimation();

        this.#visible = true;
    }

    hide(reason = "user") {
        if (!this.#visible) return;

        this.#exitAnimation(() => {
            this.style.display = "none";
            this.#visible = false;
            this.#onClose?.(reason);
        });
    }

    toggle(options = {}) {
        if (this.#visible) {
            this.hide();
        } else {
            this.show(options);
        }
    }

    updatePosition() {
        if (!this.#visible) return;
        this.#calculatePosition();
    }

    get visible() {
        return this.#visible;
    }

    getOffset() {
        return { x: 0, y: 4 };
    }

    onEnter() {
        this.style.opacity = "0";
        this.style.transform = "scaleY(0.9)";
        this.style.transformOrigin = "top center";

        requestAnimationFrame(() => {
            this.style.transition = `opacity ${PopupPanel.ANIMATION_DURATION}ms ease, transform ${PopupPanel.ANIMATION_DURATION}ms ease`;
            this.style.opacity = "1";
            this.style.transform = "scaleY(1)";
        });
    }

    onExit(callback) {
        this.style.transition = `opacity ${PopupPanel.ANIMATION_DURATION}ms ease, transform ${PopupPanel.ANIMATION_DURATION}ms ease`;
        this.style.opacity = "0";
        this.style.transform = "scaleY(0.9)";

        setTimeout(callback, PopupPanel.ANIMATION_DURATION);
    }

    onConnect(disposable) {
        if (this.#closeOnClickOutside) {
            disposable.trackEvent(document, EVENT_NAMES.MOUSEDOWN, this.#handleClickOutside.bind(this));
        }

        if (this.#closeOnEscape) {
            disposable.trackEvent(document, EVENT_NAMES.KEYDOWN, this.#handleEscapeKey.bind(this));
        }
    }

    onDisconnect() {
        this.#cancelAnimation();
    }

    #calculatePosition() {
        let x, y;

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
                    y = rect.top - this.offsetHeight - Math.abs(offset.y);
                    break;
                case "right":
                    x = rect.right + Math.abs(offset.x);
                    y = rect.top + offset.y;
                    break;
                case "left":
                    x = rect.left - this.offsetWidth - Math.abs(offset.x);
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

        this.#adjustForViewport(x, y);
    }

    #adjustForViewport(x, y) {
        const width = this.offsetWidth || 240;
        const height = this.offsetHeight || 300;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (x + width > viewportWidth - 10) {
            x = viewportWidth - width - 10;
        }
        if (x < 10) {
            x = 10;
        }
        if (y + height > viewportHeight - 10) {
            y = viewportHeight - height - 10;
        }
        if (y < 10) {
            y = 10;
        }

        this.style.left = `${x}px`;
        this.style.top = `${y}px`;
    }

    #handleClickOutside(e) {
        const path = e.composedPath();
        if (!path.includes(this)) {
            this.hide("click-outside");
        }
    }

    #handleEscapeKey(e) {
        if (e.key === "Escape") {
            e.preventDefault();
            this.hide("escape");
        }
    }

    #enterAnimation() {
        this.style.display = "block";
        this.onEnter();
    }

    #exitAnimation(callback) {
        this.onExit(callback);
    }

    #cancelAnimation() {
        if (this.#animationFrameId) {
            cancelAnimationFrame(this.#animationFrameId);
            this.#animationFrameId = null;
        }
    }
}

customElements.define("popup-panel", PopupPanel);
