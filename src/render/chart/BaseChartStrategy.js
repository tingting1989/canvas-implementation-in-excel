const HIT_RADIUS = 12;
export { HIT_RADIUS };

export class BaseChartStrategy {
    constructor(type, name) {
        this.type = type;
        this.name = name;
    }

    render(ctx, data, area, style, yScale) {}

    hitTest(px, py, data, area, seriesCount, catCount, yScale) {
        return null;
    }

    isAxisFree() {
        return false;
    }

    formatTooltip(hoverInfo) {
        const lines = [String(hoverInfo.category)];
        let displayValue;

        if (typeof hoverInfo.value === "number" && !isNaN(hoverInfo.value)) {
            displayValue = Number.isInteger(hoverInfo.value) ? String(hoverInfo.value) : hoverInfo.value.toFixed(2);
        } else {
            displayValue = String(hoverInfo.value ?? "");
        }

        if (hoverInfo.detail) {
            lines.push(...this.formatDetail(hoverInfo.detail));
        } else if (hoverInfo.seriesName && hoverInfo.seriesName !== "undefined") {
            lines.push(`${hoverInfo.seriesName}: ${displayValue}`);
        } else {
            lines.push(displayValue);
        }

        return lines;
    }

    formatDetail(detail) {
        return [detail.value ?? detail];
    }
}
