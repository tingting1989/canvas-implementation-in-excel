import { EVENT_NAMES } from "../../constants/eventNames.js";

export class FilterIconRenderer {
    static ICON_SIZE = 12;
    static ICON_PADDING = 6;
    static ACTIVE_COLOR = "#1890ff";
    static INACTIVE_COLOR = "#999";

    constructor(options = {}) {
        this.iconSize = options.iconSize || FilterIconRenderer.ICON_SIZE;
        this.iconPadding = options.iconPadding || FilterIconRenderer.ICON_PADDING;
        this.activeColor = options.activeColor || FilterIconRenderer.ACTIVE_COLOR;
        this.inactiveColor = options.inactiveColor || FilterIconRenderer.INACTIVE_COLOR;
    }

    render(container, col, hasActiveFilter) {
        const iconWrapper = document.createElement("div");
        iconWrapper.className = "filter-icon-wrapper";
        iconWrapper.dataset.col = col;

        const color = hasActiveFilter ? this.activeColor : this.inactiveColor;

        iconWrapper.innerHTML = `
            <svg 
                width="${this.iconSize}" 
                height="${this.iconSize}" 
                viewBox="0 0 16 16" 
                fill="none"
                class="filter-icon"
                data-col="${col}"
            >
                <path 
                    d="M2 3h12l-5 5v5l-2 1V8L2 3z" 
                    stroke="${color}" 
                    stroke-width="1.5" 
                    fill="${hasActiveFilter ? color : "none"}"
                />
                ${hasActiveFilter ? '<circle cx="8" cy="11" r="1.5" fill="#fff"/>' : ""}
            </svg>
        `;

        iconWrapper.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: ${this.iconPadding}px;
            cursor: pointer;
            margin-left: 4px;
            vertical-align: middle;
            border-radius: 2px;
            transition: background-color 0.15s ease;
        `;

        iconWrapper.addEventListener("mouseenter", () => {
            iconWrapper.style.backgroundColor = "rgba(24,144,255,0.05)";
        });

        iconWrapper.addEventListener("mouseleave", () => {
            iconWrapper.style.backgroundColor = "transparent";
        });

        container.appendChild(iconWrapper);
        return iconWrapper;
    }

    updateIconState(iconElement, hasActiveFilter) {
        if (!iconElement) return;

        const svg = iconElement.querySelector("svg");
        if (!svg) return;

        const path = svg.querySelector("path");
        if (path) {
            const color = hasActiveFilter ? this.activeColor : this.inactiveColor;
            path.setAttribute("stroke", color);
            path.setAttribute("fill", hasActiveFilter ? color : "none");

            const existingCircle = svg.querySelector("circle");
            if (hasActiveFilter && !existingCircle) {
                const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                circle.setAttribute("cx", "8");
                circle.setAttribute("cy", "11");
                circle.setAttribute("r", "1.5");
                circle.setAttribute("fill", "#fff");
                svg.appendChild(circle);
            } else if (!hasActiveFilter && existingCircle) {
                existingCircle.remove();
            }
        }
    }

    getIconHitArea(rect, mouseX) {
        const iconRightEdge = rect.right - this.iconPadding;
        const iconLeftEdge = iconRightEdge - (this.iconSize + this.iconPadding * 2);

        return {
            isIconArea: mouseX >= iconLeftEdge && mouseX <= iconRightEdge,
            left: iconLeftEdge,
            right: iconRightEdge,
            top: rect.top,
            bottom: rect.bottom,
        };
    }
}
