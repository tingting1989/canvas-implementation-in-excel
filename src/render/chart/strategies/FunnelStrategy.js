import { BaseChartStrategy, HIT_RADIUS } from "../BaseChartStrategy.js";
import { CONFIG } from "../../../constants/config.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

export class FunnelStrategy extends BaseChartStrategy {
    constructor() {
        super("funnel", "漏斗图");
    }

    isAxisFree() {
        return true;
    }

    render(ctx, data, area, style) {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Funnel 开始渲染`);

        if (!data.data || data.data.length === 0) {
            errorHandler.warn(ERROR_CODE.CHART_DATA_EMPTY, `Funnel 数据为空`);
            return;
        }

        const items = data.data.map((row) => ({
            name: String(row?.[0] || ""),
            value: Number(row?.[1]) || 0,
        }));

        if (items.length === 0) return;

        const maxValue = Math.max(...items.map((item) => item.value), 1);
        const colors = ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272", "#fc8452", "#9a60b4", "#ea7ccc"];

        const cx = area.x + area.w / 2;
        const topY = area.y + (style.title ? 30 : 10);
        const bottomY = area.y + area.h - 20;
        const totalHeight = bottomY - topY;
        const itemHeight = totalHeight / items.length;

        const maxWidth = area.w * 0.85;
        const minWidth = area.w * 0.15;
        const widthRange = maxWidth - minWidth;

        items.forEach((item, index) => {
            const ratio = item.value / maxValue;
            const currentWidth = minWidth + widthRange * ratio;

            const y1 = topY + index * itemHeight;
            const y2 = topY + (index + 1) * itemHeight - 4;

            const color = colors[index % colors.length];

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(cx - currentWidth / 2, y1);
            ctx.lineTo(cx + currentWidth / 2, y1);

            if (index < items.length - 1) {
                const nextItem = items[index + 1];
                const nextRatio = nextItem.value / maxValue;
                const nextWidth = minWidth + widthRange * nextRatio;
                ctx.lineTo(cx + nextWidth / 2, y2);
                ctx.lineTo(cx - nextWidth / 2, y2);
            } else {
                const tipWidth = currentWidth * 0.15;
                ctx.lineTo(cx + tipWidth / 2, y2 + itemHeight * 0.5);
                ctx.lineTo(cx - tipWidth / 2, y2 + itemHeight * 0.5);
            }

            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = "rgba(255,255,255,0.7)";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = "#fff";
            ctx.font = `bold ${Math.min(14, itemHeight * 0.35)}px ${CONFIG.CHART_FONT_FAMILY}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const textY = (y1 + y2) / 2;
            ctx.fillText(item.name, cx, textY);
        });
    }

    hitTest(px, py, data, area, seriesCount, catCount, yScale) {
        if (!data.data || data.data.length === 0) return null;

        const items = data.data.map((row) => ({
            name: String(row?.[0] || ""),
            value: Number(row?.[1]) || 0,
        }));

        if (items.length === 0) return null;

        const maxValue = Math.max(...items.map((item) => item.value), 1);

        const cx = area.x + area.w / 2;
        const topY = area.y + 30;
        const bottomY = area.y + area.h - 20;
        const totalHeight = bottomY - topY;
        const itemHeight = totalHeight / items.length;

        const maxWidth = area.w * 0.85;
        const minWidth = area.w * 0.15;
        const widthRange = maxWidth - minWidth;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const ratio = item.value / maxValue;
            const currentWidth = minWidth + widthRange * ratio;

            const y1 = topY + i * itemHeight;
            let y2;
            if (i < items.length - 1) {
                y2 = topY + (i + 1) * itemHeight - 4;
            } else {
                y2 = topY + (i + 1) * itemHeight - 4 + itemHeight * 0.5;
            }

            if (py >= y1 && py <= y2) {
                const nextItem = items[i + 1];
                let nextWidth;
                if (nextItem) {
                    const nextRatio = nextItem.value / maxValue;
                    nextWidth = minWidth + widthRange * nextRatio;
                } else {
                    nextWidth = currentWidth * 0.15;
                }

                const leftX = Math.min(cx - currentWidth / 2, cx - nextWidth / 2);
                const rightX = Math.max(cx + currentWidth / 2, cx + nextWidth / 2);

                if (px >= leftX && px <= rightX) {
                    const prevValue = i > 0 ? items[i - 1].value : item.value;
                    const conversionRate = prevValue > 0 ? ((item.value / prevValue) * 100).toFixed(1) : "N/A";
                    const totalRate = ((item.value / items[0].value) * 100).toFixed(1);

                    return {
                        category: item.name,
                        seriesName: "Funnel",
                        value: item.value,
                        pointX: cx,
                        pointY: (y1 + y2) / 2,
                        detail: {
                            type: "漏斗图",
                            stage: item.name,
                            value: item.value,
                            conversionRate: `${conversionRate}%`,
                            totalRate: `${totalRate}%`,
                        },
                    };
                }
            }
        }

        return null;
    }

    formatDetail(detail) {
        return [`─────────`, `阶段: ${detail.stage}`, `数值: ${detail.value}`, `转化率: ${detail.conversionRate}`, `总体占比: ${detail.totalRate}`];
    }
}
