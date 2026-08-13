// PopupPanelNew.js
import { EVENT_NAMES } from "../../constants/eventNames.js";

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
    pointer-events: auto;   /* ← 弹框自己接事件 */
    will-change: transform, opacity;
    transform-origin: top center;
}

  /* 固定 header */
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

  /* 没传 title 时隐藏标题文字区，但保留 header 高度（拖拽抓手） */
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

  /* 内容区：内容组件自己管 padding/背景 */
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

export class PopupPanelNew extends HTMLElement {
    static DEFAULT_Z_INDEX = 10000;
    static ANIMATION_DURATION = 150;

    // ── 内部状态 ──────────────────────────────────
    #anchor = null;
    #position = { x: 0, y: 0 };
    #placement = "bottom";
    #zIndex = PopupPanelNew.DEFAULT_Z_INDEX;
    #visible = false;
    #closeOnClickOutside = true;
    #closeOnEscape = true;
    #draggable = true;
    #onClose = null;

    // 拖拽
    #dragging = false;
    #dragStart = null;
    #rafDrag = null;

    // Shadow 缓存
    _panel = null;
    _header = null;
    _titleEl = null;
    _closeBtn = null;
    _body = null;
    _mask = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot.appendChild(template.content.cloneNode(true));

        this._panel = this.shadowRoot.querySelector(".panel");
        this._header = this.shadowRoot.querySelector(".header");
        this._titleEl = this.shadowRoot.querySelector(".title");
        this._closeBtn = this.shadowRoot.querySelector(".close-btn");
        this._body = this.shadowRoot.querySelector(".body");
        this._mask = this.shadowRoot.querySelector(".mask");

        this.setAttribute("role", "dialog");
        this.setAttribute("aria-modal", "false");
    }

    // ── 公开 API ──────────────────────────────────

    /**
     * @param {Object} options
     * @param {HTMLElement} [options.content]    - 内容节点，塞进 slot
     * @param {{x:number,y:number}} [options.position]
     * @param {HTMLElement} [options.anchor]
     * @param {"top"|"bottom"|"left"|"right"} [options.placement="bottom"]
     * @param {string} [options.title]           - 标题（业务方传）
     * @param {boolean} [options.draggable=true]
     * @param {boolean} [options.mask=false]
     * @param {boolean} [options.closeOnClickOutside=true]
     * @param {boolean} [options.closeOnEscape=true]
     * @param {number} [options.zIndex]
     * @param {Function} [options.onClose]
     */
    show(options = {}) {
        if (this.#visible) return;

        this.#anchor = options.anchor || null;
        this.#position = options.position || { x: 0, y: 0 };
        this.#placement = options.placement || "bottom";
        this.#zIndex = options.zIndex || PopupPanelNew.DEFAULT_Z_INDEX;
        this.#onClose = options.onClose || null;
        this.#closeOnClickOutside = options.closeOnClickOutside !== false;
        this.#closeOnEscape = options.closeOnEscape !== false;
        this.#draggable = options.draggable !== false;

        // z-index
        this.style.zIndex = this.#zIndex;

        // mask
        this.dataset.mask = options.mask ? "true" : "false";

        // title
        if (options.title) {
            this._titleEl.textContent = options.title;
            this.setAttribute("data-has-title", "");
        } else {
            this.removeAttribute("data-has-title");
        }

        // 内容注入（light DOM → slot 进 .body）
        this._body.innerHTML = "";
        if (options.content) {
            this._body.appendChild(options.content);
        }

        // 挂 DOM
        if (!this.isConnected) {
            document.body.appendChild(this);
        }

        // 先定位（display:block 后才能拿到 offsetWidth）
        this.style.display = "block";
        this._panel.style.left = "0px";
        this._panel.style.top = "0px";
        this._panel.style.transform = "none";
        this.#calculatePosition();

        // 显示 + 动画
        this.setAttribute("open", "");
        this.#enterAnimation(() => {
            this.#visible = true;
            this.#bindGlobalEvents();
        });

        // 拖拽
        if (this.#draggable) {
            this._header.addEventListener("mousedown", this.#onDragStart);
        }

        // 关闭按钮
        this._closeBtn.onclick = () => this.hide("close-btn");
    }

    hide(reason = "user") {
        if (!this.#visible) return;

        this.#unbindGlobalEvents();
        this.#cleanupDrag();

        this.#exitAnimation(() => {
            this.style.display = "none";
            this.style.pointerEvents = ""; // ← 加这行
            this.removeAttribute("open");
            this._body.innerHTML = "";
            this.#visible = false;

            if (this.parentNode) {
                this.parentNode.removeChild(this);
            }

            const cb = this.#onClose;
            this.#onClose = null;
            cb?.(reason);
        });
    }

    toggle(options = {}) {
        this.#visible ? this.hide() : this.show(options);
    }

    updatePosition() {
        if (!this.#visible) return;
        this.#calculatePosition();
    }

    /** 运行时改标题 */
    setTitle(text) {
        if (text) {
            this._titleEl.textContent = text;
            this.setAttribute("data-has-title", "");
        } else {
            this.removeAttribute("data-has-title");
        }
    }

    get visible() {
        return this.#visible;
    }
    get panelEl() {
        return this._panel;
    }

    // ── 定位（兼容你原来的 anchor/placement 逻辑） ──

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
                    y = rect.top - this._panel.offsetHeight - Math.abs(offset.y);
                    break;
                case "right":
                    x = rect.right + Math.abs(offset.x);
                    y = rect.top + offset.y;
                    break;
                case "left":
                    x = rect.left - this._panel.offsetWidth - Math.abs(offset.x);
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

    #clampToViewport(x, y) {
        const w = this._panel.offsetWidth || 260;
        const h = this._panel.offsetHeight || 300;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        x = Math.max(4, Math.min(x, vw - w - 4));
        y = Math.max(4, Math.min(y, vh - h - 4));

        this._panel.style.left = `${x}px`;
        this._panel.style.top = `${y}px`;
    }

    getOffset() {
        return { x: 0, y: 4 };
    }

    // ── 拖拽（header 抓手，松手弹回边界） ────────

    #onDragStart = (e) => {
        if (e.button !== 0) return;
        if (e.target === this._closeBtn || e.target.closest(".close-btn")) return;

        e.preventDefault();
        this.#dragging = true;
        this._header.classList.add("dragging");

        const rect = this._panel.getBoundingClientRect();
        this.#dragStart = {
            clientX: e.clientX,
            clientY: e.clientY,
            panelX: rect.left,
            panelY: rect.top,
        };

        document.addEventListener("mousemove", this.#onDragMove);
        document.addEventListener("mouseup", this.#onDragEnd, { once: true });
    };

    #onDragMove = (e) => {
        if (!this.#dragging) return;
        if (this.#rafDrag) cancelAnimationFrame(this.#rafDrag);
        this.#rafDrag = requestAnimationFrame(() => {
            let x = this.#dragStart.panelX + (e.clientX - this.#dragStart.clientX);
            let y = this.#dragStart.panelY + (e.clientY - this.#dragStart.clientY);
            // 拖拽过程中也限制边界，防止超出屏幕
            this.#clampToViewport(x, y);
        });
    };

    #onDragEnd = () => {
        if (!this.#dragging) return;
        this.#dragging = false;
        this._header.classList.remove("dragging");
        document.removeEventListener("mousemove", this.#onDragMove);
        this.#rafDrag = null;
        // 松手弹回
        const left = parseFloat(this._panel.style.left);
        const top = parseFloat(this._panel.style.top);
        this.#clampToViewport(left, top);
    };

    #cleanupDrag() {
        document.removeEventListener("mousemove", this.#onDragMove);
        document.removeEventListener("mouseup", this.#onDragEnd);
        this.#dragging = false;
        this._header.classList.remove("dragging");
    }

    // ── 全局关闭事件 ──────────────────────────────

    #bindGlobalEvents() {
        if (this.#closeOnClickOutside) {
            document.addEventListener(EVENT_NAMES.MOUSEDOWN, this.#handleClickOutside);
        }
        if (this.#closeOnEscape) {
            document.addEventListener(EVENT_NAMES.KEYDOWN, this.#handleEscapeKey);
        }
    }

    #unbindGlobalEvents() {
        document.removeEventListener(EVENT_NAMES.MOUSEDOWN, this.#handleClickOutside);
        document.removeEventListener(EVENT_NAMES.KEYDOWN, this.#handleEscapeKey);
    }

    #handleClickOutside = (e) => {
        // 检查是否点击在 .panel 内部（内容区域）
        const clickedInsidePanel = e.composedPath().some((el) => el === this._panel || el === this._header || el === this._body);

        if (clickedInsidePanel) return;

        // 如果点击的是 mask 或者外部区域，关闭弹窗
        this.hide("click-outside");
    };

    #handleEscapeKey = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.hide("escape");
        }
    };

    // ── 动画（兼容你原来的 onEnter/onExit 风格） ─

    #enterAnimation(done) {
        this.onEnter();
        setTimeout(done, PopupPanelNew.ANIMATION_DURATION);
    }

    #exitAnimation(done) {
        this.onExit(done);
    }

    /** 子类可覆盖 */
    onEnter() {
        this._panel.style.transition = "none";
        this._panel.style.opacity = "0";
        this._panel.style.transform = "scaleY(0.9)";

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this._panel.style.transition = `opacity ${PopupPanelNew.ANIMATION_DURATION}ms ease, transform ${PopupPanelNew.ANIMATION_DURATION}ms ease`;
                this._panel.style.opacity = "1";
                this._panel.style.transform = "scaleY(1)";
            });
        });
    }

    onExit(callback) {
        this._panel.style.transition = `opacity ${PopupPanelNew.ANIMATION_DURATION}ms ease, transform ${PopupPanelNew.ANIMATION_DURATION}ms ease`;
        this._panel.style.opacity = "0";
        this._panel.style.transform = "scaleY(0.9)";
        setTimeout(callback, PopupPanelNew.ANIMATION_DURATION);
    }

    disconnectedCallback() {
        this.#cleanupDrag();
        this.#unbindGlobalEvents();
    }
}

customElements.define("popup-panel-new", PopupPanelNew);
