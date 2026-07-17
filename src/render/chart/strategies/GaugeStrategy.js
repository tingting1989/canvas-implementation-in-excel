import { BaseChartStrategy, HIT_RADIUS } from "../BaseChartStrategy.js";
import { CONFIG } from "../../../constants/config.js";
import { errorHandler } from "../../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../../constants/errorCodes.js";

export class GaugeStrategy extends BaseChartStrategy {
    constructor() {
        super("gauge", "仪表盘");
    }

    isAxisFree() {
        return true;
    }

    render(ctx, data, area, style) {
        errorHandler.debug(ERROR_CODE.CHART_RENDER_START, `Gauge 开始渲染`, { dataType: typeof data.data });

        if (!data.data || data.data.length === 0) {
            errorHandler.warn(ERROR_CODE.CHART_DATA_EMPTY, `Gauge 数据为空`);
            return;
        }

        const value = Number(data.data[0]?.[1]) || 0;
        const label = String(data.data[0]?.[0] || data.headers?.[0] || "Value");

        errorHandler.debug(ERROR_CODE.CHART_STRATEGY_DEBUG, `Gauge 数据提取`, { label, value });

        const min = style?.min ?? 0;
        const max = style?.max ?? 100;
        const safeMax = max - min || 1;
        const percentage = Math.max(0, Math.min(1, (value - min) / safeMax));

        const cx = area.x + area.w / 2;
        const cy = area.y + area.h * 0.65;
        const radius = Math.min(area.w, area.h) * 0.4;

        const startAngle = Math.PI;
        const endAngle = 2 * Math.PI;
        const valueAngle = startAngle + (endAngle - startAngle) * percentage;

        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = "#e0e0e0";
        ctx.lineWidth = radius * 0.15;
        ctx.stroke();

        const gradient = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
        gradient.addColorStop(0, "#5470c6");
        gradient.addColorStop(0.5, "#91cc75");
        gradient.addColorStop(1, "#ee6666");

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, valueAngle);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = radius * 0.15;
        ctx.stroke();

        const tickRadius = radius * 1.15;
        const tickCount = 11;
        for (let i = 0; i < tickCount; i++) {
            const angle = startAngle + ((endAngle - startAngle) / (tickCount - 1)) * i;
            const isMajor = i % 2 === 0;

            const innerR = tickRadius - (isMajor ? radius * 0.06 : radius * 0.03);
            const outerR = tickRadius;

            const x1 = cx + Math.cos(angle) * innerR;
            const y1 = cy + Math.sin(angle) * innerR;
            const x2 = cx + Math.cos(angle) * outerR;
            const y2 = cy + Math.sin(angle) * outerR;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = "#666";
            ctx.lineWidth = isMajor ? 2 : 1;
            ctx.stroke();

            if (isMajor) {
                const tickValue = min + ((max - min) / (tickCount - 1)) * i;
                const textR = tickRadius + radius * 0.08;
                const tx = cx + Math.cos(angle) * textR;
                const ty = cy + Math.sin(angle) * textR;

                ctx.fillStyle = "#666";
                ctx.font = `${radius * 0.12}px ${CONFIG.CHART_FONT_FAMILY}`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(Math.round(tickValue).toString(), tx, ty);
            }
        }

        const needleLength = radius * 0.85;
        const needleWidth = radius * 0.04;
        const needleAngle = startAngle + (endAngle - startAngle) * percentage;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(needleAngle);

        ctx.beginPath();
        ctx.moveTo(-needleWidth * 1.5, 0);
        ctx.lineTo(0, -needleLength);
        ctx.lineTo(needleWidth * 1.5, 0);
        ctx.closePath();
        ctx.fillStyle = "#5470c6";
        ctx.fill();

        ctx.restore();

        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = "#5470c6";
        ctx.fill();

        ctx.fillStyle = "#333";
        ctx.font = `bold ${radius * 0.14}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label.toUpperCase(), cx, cy + radius * 0.25);

        ctx.fillStyle = "#333";
        ctx.font = `bold ${radius * 0.22}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        let displayValue;
        if (Number.isInteger(value)) {
            displayValue = String(value);
        } else {
            displayValue = value.toFixed(1);
        }
        ctx.fillText(displayValue, cx, cy + radius * 0.42);
    }

    hitTest(px, py, data, area, seriesCount, catCount, yScale) {
        if (!data.data || data.data.length === 0) return null;

        const value = Number(data.data[0]?.[1]) || 0;
        const label = String(data.data[0]?.[0] || data.headers?.[0] || "Value");
        const cx = area.x + area.w / 2;
        const cy = area.y + area.h * 0.65;
        const radius = Math.min(area.w, area.h) * 0.45;

        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        if (dist > radius) return null;

        const min = 0;
        const max = 100;
        const percentage = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));

        return {
            category: label,
            seriesName: "Gauge",
            value: value,
            pointX: cx,
            pointY: cy,
            detail: {
                type: "仪表盘",
                value: value,
                min: min,
                max: max,
                percentage: `${(percentage * 100).toFixed(1)}%`,
            },
        };
    }

    formatDetail(detail) {
        return [`─────────`, `数值: ${detail.value}`, `范围: ${detail.min} - ${detail.max}`, `完成度: ${detail.percentage}`];
    }
}
