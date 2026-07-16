import { CONFIG } from "../../constants/config.js";

const HIT_RADIUS = 12;

export class NativeChartRenderer {
    static render(ctx, chart, data, plotArea, style) {
        ctx.save();

        let yScale = null;

        if (!this.#isAxisFreeChart(chart.type)) {
            if (style.showGrid !== false) {
                this.#renderGrid(ctx, plotArea);
            }

            yScale = NativeChartRenderer.buildYScale(data, chart.type);
            this.#renderAxes(ctx, data, plotArea, yScale);
        }

        switch (chart.type) {
            case "bar":
                this.#renderBar(ctx, data, plotArea, style, yScale);
                break;
            case "line":
                this.#renderLine(ctx, data, plotArea, style, yScale);
                break;
            case "pie":
                this.#renderPie(ctx, data, plotArea, style);
                break;
            case "area":
                this.#renderArea(ctx, data, plotArea, style, yScale);
                break;
            case "scatter":
                this.#renderScatter(ctx, data, plotArea, style, yScale);
                break;
            case "candlestick":
                this.#renderCandlestick(ctx, data, plotArea, style, yScale);
                break;
            case "gauge":
                this.#renderGauge(ctx, data, plotArea, style);
                break;
            case "funnel":
                this.#renderFunnel(ctx, data, plotArea, style);
                break;
        }

        if (style.title) {
            this.#renderTitle(ctx, style.title, plotArea);
        }

        if (style.showLegend !== false) {
            this.#renderLegend(ctx, data, plotArea, style);
        }

        ctx.restore();
    }

    static hitTestDataPoint(px, py, chartType, data, plotArea, yScale) {
        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return null;

        switch (chartType) {
            case "bar":
                return this.#hitBar(px, py, data, plotArea, seriesCount, catCount, yScale);
            case "line":
                return this.#hitLine(px, py, data, plotArea, seriesCount, catCount, yScale);
            case "area":
                return this.#hitLine(px, py, data, plotArea, seriesCount, catCount, yScale);
            case "scatter":
                return this.#hitScatter(px, py, data, plotArea, seriesCount, catCount, yScale);
            case "pie":
                return this.#hitPie(px, py, data, plotArea, catCount);
            case "candlestick":
                return this.#hitCandlestick(px, py, data, plotArea, catCount, yScale);
            case "gauge":
                return this.#hitGauge(px, py, data, plotArea);
            case "funnel":
                return this.#hitFunnel(px, py, data, plotArea);
            default:
                return null;
        }
    }

    static renderTooltip(ctx, hoverInfo, bounds, style) {
        if (!hoverInfo || !bounds) return;

        const { category, seriesName, value, pointX, pointY } = hoverInfo;
        const padding = { x: 8, y: 6 };
        const lineHeight = 16;
        const lines = [String(category)];

        let displayValue;
        if (typeof value === "number" && !isNaN(value)) {
            displayValue = Number.isInteger(value) ? String(value) : value.toFixed(2);
        } else {
            displayValue = String(value ?? "");
        }

        if (hoverInfo.detail) {
            const d = hoverInfo.detail;
            if (d.type === "K线" || d.type === "Candlestick") {
                lines.push(`📊 ${d.direction || ""}`);
                lines.push(`─────────`);
                lines.push(`开盘: ${d.open ?? "N/A"}`);
                lines.push(`最高: ${d.high ?? "N/A"}`);
                lines.push(`最低: ${d.low ?? "N/A"}`);
                lines.push(`收盘: ${d.close ?? "N/A"}`);
                lines.push(`─────────`);
                lines.push(`涨跌: ${d.change ?? "N/A"} (${d.changePercent ?? "N/A"})`);
            } else if (d.type === "仪表盘") {
                lines.push(`─────────`);
                lines.push(`数值: ${d.value}`);
                lines.push(`范围: ${d.min} - ${d.max}`);
                lines.push(`完成度: ${d.percentage}`);
            } else if (d.type === "漏斗图") {
                lines.push(`─────────`);
                lines.push(`阶段: ${d.stage}`);
                lines.push(`数值: ${d.value}`);
                lines.push(`转化率: ${d.conversionRate}`);
                lines.push(`总体占比: ${d.totalRate}`);
            } else {
                lines.push(displayValue);
            }
        } else if (seriesName && seriesName !== "undefined") {
            lines.push(`${seriesName}: ${displayValue}`);
        } else {
            lines.push(displayValue);
        }

        ctx.save();
        ctx.font = `${CONFIG.CHART_FONT_SIZE}px ${CONFIG.CHART_FONT_FAMILY}`;

        let maxW = 0;
        for (const line of lines) {
            const w = ctx.measureText(line).width;
            if (w > maxW) maxW = w;
        }

        const boxW = maxW + padding.x * 2;
        const boxH = lines.length * lineHeight + padding.y * 2;

        let tipX = pointX + 12;
        let tipY = pointY - boxH - 10;

        if (tipX + boxW > bounds.x + bounds.w) {
            tipX = pointX - boxW - 12;
        }
        if (tipY < bounds.y) {
            tipY = pointY + 14;
        }

        tipX = Math.max(bounds.x, Math.min(tipX, bounds.x + bounds.w - boxW));
        tipY = Math.max(bounds.y, Math.min(tipY, bounds.y + bounds.h - boxH));

        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.beginPath();
        ctx.roundRect(tipX, tipY, boxW, boxH, 4);
        ctx.fill();

        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], tipX + padding.x, tipY + padding.y + i * lineHeight);
        }

        ctx.restore();
    }

    static #hitBar(px, py, data, area, seriesCount, catCount, yScale) {
        const groupWidth = area.w / catCount;
        const barWidth = (groupWidth * 0.7) / seriesCount;
        const barGap = (groupWidth * 0.3) / (seriesCount + 1);
        const yMin = yScale.min;
        const yMax = yScale.max;
        const yRange = yMax - yMin || 1;

        for (let s = 0; s < seriesCount; s++) {
            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const barH = ((val - yMin) / yRange) * area.h;
                const bx = area.x + i * groupWidth + barGap + s * (barWidth + barGap);
                const by = area.y + area.h - barH;

                if (px >= bx && px <= bx + barWidth && py >= by && py <= by + barH) {
                    return {
                        category: String(data.data[i][0]),
                        seriesName: String(data.headers[s + 1] || ""),
                        value: val,
                        pointX: bx + barWidth / 2,
                        pointY: by,
                    };
                }
            }
        }
        return null;
    }

    static #hitLine(px, py, data, area, seriesCount, catCount, yScale) {
        const yMin = yScale ? yScale.min : this.#getYMin(data);
        const yMax = yScale ? yScale.max : this.#getYMax(data);
        const yRange = yMax - yMin || 1;
        const stepX = area.w / catCount;
        const dotR = Math.max(CONFIG.CHART_LINE_DOT_RADIUS || 4, HIT_RADIUS);
        const lineSnapDist = 10;

        let closestHit = null;
        let minDistSq = dotR * dotR;

        for (let s = 0; s < seriesCount; s++) {
            const points = [];

            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const dx = area.x + stepX * i + stepX / 2;
                const dy = area.y + area.h - ((val - yMin) / yRange) * area.h;
                points.push({ x: dx, y: dy, val, idx: i });

                const distSq = (px - dx) * (px - dx) + (py - dy) * (py - dy);

                if (distSq <= dotR * dotR && distSq < minDistSq) {
                    minDistSq = distSq;
                    closestHit = {
                        category: String(data.data[i][0]),
                        seriesName: String(data.headers[s + 1] || ""),
                        value: val,
                        pointX: dx,
                        pointY: dy,
                    };
                }
            }

            if (!closestHit && points.length > 1) {
                for (let i = 0; i < points.length - 1; i++) {
                    const p1 = points[i];
                    const p2 = points[i + 1];

                    const dist = this.#pointToSegmentDistance(px, py, p1.x, p1.y, p2.x, p2.y);

                    if (dist <= lineSnapDist) {
                        const distToP1 = Math.sqrt((px - p1.x) ** 2 + (py - p1.y) ** 2);
                        const distToP2 = Math.sqrt((px - p2.x) ** 2 + (py - p2.y) ** 2);
                        const nearestPoint = distToP1 <= distToP2 ? p1 : p2;

                        closestHit = {
                            category: String(data.data[nearestPoint.idx][0]),
                            seriesName: String(data.headers[s + 1] || ""),
                            value: nearestPoint.val,
                            pointX: nearestPoint.x,
                            pointY: nearestPoint.y,
                        };

                        break;
                    }
                }
            }

            if (closestHit) break;
        }

        return closestHit;
    }

    static #hitScatter(px, py, data, area, seriesCount, catCount, yScale) {
        const allX = data.data.map((row) => Number(row[0]) || 0);
        const allY = data.data.flatMap((row) => row.slice(1).map((v) => Number(v) || 0));
        const xMin = Math.min(...allX);
        const xMax = Math.max(...allX);
        const yMin = yScale ? yScale.min : Math.min(...allY);
        const yMax = yScale ? yScale.max : Math.max(...allY);
        const xRange = xMax - xMin || 1;
        const yRange = yMax - yMin || 1;
        const dotR = Math.max(CONFIG.CHART_SCATTER_DOT_RADIUS, HIT_RADIUS);

        for (let s = 0; s < seriesCount; s++) {
            for (let i = 0; i < catCount; i++) {
                const xVal = Number(data.data[i][0]) || 0;
                const yVal = Number(data.data[i][s + 1]) || 0;
                const dx = area.x + ((xVal - xMin) / xRange) * area.w;
                const dy = area.y + area.h - ((yVal - yMin) / yRange) * area.h;

                if ((px - dx) * (px - dx) + (py - dy) * (py - dy) <= dotR * dotR) {
                    return {
                        category: String(xVal),
                        seriesName: String(data.headers[s + 1] || ""),
                        value: yVal,
                        pointX: dx,
                        pointY: dy,
                    };
                }
            }
        }
        return null;
    }

    static #hitPie(px, py, data, area, catCount) {
        const values = data.data.map((row) => Number(row[1]) || 0);
        const total = values.reduce((sum, v) => sum + v, 0);
        if (total === 0) return null;

        const cx = area.x + area.w / 2;
        const cy = area.y + area.h / 2;
        const r = Math.min(area.w, area.h) / 2 - 10;

        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r) return null;

        let angle = Math.atan2(dy, dx);
        if (angle < -Math.PI / 2) angle += Math.PI * 2;

        let startAngle = -Math.PI / 2;
        for (let i = 0; i < catCount; i++) {
            const sliceAngle = (values[i] / total) * Math.PI * 2;
            let endAngle = startAngle + sliceAngle;
            if (endAngle > (Math.PI * 3) / 2) endAngle -= Math.PI * 2;

            const normalizedAngle = angle;
            if (startAngle <= endAngle) {
                if (normalizedAngle >= startAngle && normalizedAngle <= endAngle) {
                    return {
                        category: String(data.data[i][0]),
                        seriesName: "",
                        value: values[i],
                        pointX: cx + Math.cos(startAngle + sliceAngle / 2) * r * 0.6,
                        pointY: cy + Math.sin(startAngle + sliceAngle / 2) * r * 0.6,
                    };
                }
            } else {
                if (normalizedAngle >= startAngle || normalizedAngle <= endAngle) {
                    return {
                        category: String(data.data[i][0]),
                        seriesName: "",
                        value: values[i],
                        pointX: cx + Math.cos(startAngle + sliceAngle / 2) * r * 0.6,
                        pointY: cy + Math.sin(startAngle + sliceAngle / 2) * r * 0.6,
                    };
                }
            }
            startAngle += sliceAngle;
        }
        return null;
    }

    static #renderGrid(ctx, area) {
        ctx.save();
        ctx.strokeStyle = CONFIG.CHART_GRID_COLOR;
        ctx.lineWidth = CONFIG.CHART_GRID_LINE_WIDTH;

        const yTicks = 5;
        const stepY = area.h / yTicks;
        for (let i = 0; i <= yTicks; i++) {
            const y = area.y + stepY * i;
            ctx.beginPath();
            ctx.moveTo(area.x, y);
            ctx.lineTo(area.x + area.w, y);
            ctx.stroke();
        }

        ctx.restore();
    }

    static #renderAxes(ctx, data, area, yScale) {
        ctx.save();
        ctx.strokeStyle = CONFIG.CHART_AXIS_COLOR;
        ctx.lineWidth = CONFIG.CHART_AXIS_LINE_WIDTH;

        ctx.beginPath();
        ctx.moveTo(area.x, area.y);
        ctx.lineTo(area.x, area.y + area.h);
        ctx.lineTo(area.x + area.w, area.y + area.h);
        ctx.stroke();

        const categories = data.data.map((row) => String(row[0]));
        ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
        ctx.font = `${CONFIG.CHART_FONT_SIZE}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        const step = area.w / categories.length;
        for (let i = 0; i < categories.length; i++) {
            ctx.fillText(String(categories[i]), area.x + step * i + step / 2, area.y + area.h + 6);
        }

        const yTicks = yScale.ticks;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";

        for (const val of yTicks) {
            const y = area.y + area.h - ((val - yScale.min) / (yScale.max - yScale.min)) * area.h;
            ctx.fillText(this.#formatNumber(val), area.x - 6, y);
        }

        ctx.restore();
    }

    static #renderBar(ctx, data, area, style, yScale) {
        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        const groupWidth = area.w / catCount;
        const barWidth = (groupWidth * 0.7) / seriesCount;
        const barGap = (groupWidth * 0.3) / (seriesCount + 1);
        const yMin = yScale.min;
        const yMax = yScale.max;
        const yRange = yMax - yMin || 1;

        ctx.strokeStyle = CONFIG.CHART_BAR_BORDER_COLOR;
        ctx.lineWidth = CONFIG.CHART_GRID_LINE_WIDTH;

        for (let s = 0; s < seriesCount; s++) {
            ctx.fillStyle = style.colors[s % style.colors.length];

            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const barH = ((val - yMin) / yRange) * area.h;
                const x = area.x + i * groupWidth + barGap + s * (barWidth + barGap);
                const y = area.y + area.h - barH;

                ctx.fillRect(x, y, barWidth, barH);
                ctx.strokeRect(x, y, barWidth, barH);
            }
        }
    }

    static #renderLine(ctx, data, area, style, yScale) {
        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        const yMin = yScale ? yScale.min : this.#getYMin(data);
        const yMax = yScale ? yScale.max : this.#getYMax(data);
        const yRange = yMax - yMin || 1;
        const stepX = area.w / catCount;

        for (let s = 0; s < seriesCount; s++) {
            ctx.strokeStyle = style.colors[s % style.colors.length];
            ctx.fillStyle = style.colors[s % style.colors.length];
            ctx.lineWidth = CONFIG.CHART_LINE_DOT_RADIUS > 3 ? 2 : CONFIG.CHART_TOOLTIP_BORDER_WIDTH;

            ctx.beginPath();
            let firstPoint = true;
            const points = [];

            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const x = area.x + stepX * i + stepX / 2;
                const y = area.y + area.h - ((val - yMin) / yRange) * area.h;
                points.push({ x, y });

                if (firstPoint) {
                    ctx.moveTo(x, y);
                    firstPoint = false;
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.stroke();

            for (const pt of points) {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, CONFIG.CHART_LINE_DOT_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    static #renderPie(ctx, data, area, style) {
        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        const values = data.data.map((row) => Number(row[1]) || 0);
        const total = values.reduce((sum, v) => sum + v, 0);
        if (total === 0) return;

        const cx = area.x + area.w / 2;
        const cy = area.y + area.h / 2;
        const r = Math.min(area.w, area.h) / 2 - 10;

        ctx.strokeStyle = CONFIG.CHART_TOOLTIP_BORDER;
        ctx.lineWidth = CONFIG.CHART_TOOLTIP_BORDER_WIDTH;
        ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
        ctx.font = `${CONFIG.CHART_FONT_SIZE}px ${CONFIG.CHART_FONT_FAMILY}`;

        let startAngle = -Math.PI / 2;

        for (let i = 0; i < catCount; i++) {
            const sliceAngle = (values[i] / total) * Math.PI * 2;
            ctx.fillStyle = style.colors[i % style.colors.length];

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            const midAngle = startAngle + sliceAngle / 2;
            const pct = ((values[i] / total) * 100).toFixed(1) + "%";
            ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
            const labelR = r * 0.65;
            ctx.fillText(pct, cx + Math.cos(midAngle) * labelR, cy + Math.sin(midAngle) * labelR);

            startAngle += sliceAngle;
        }
    }

    static #renderArea(ctx, data, area, style, yScale) {
        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        const yMin = yScale ? yScale.min : this.#getYMin(data);
        const yMax = yScale ? yScale.max : this.#getYMax(data);
        const yRange = yMax - yMin || 1;
        const stepX = area.w / catCount;

        ctx.lineWidth = CONFIG.CHART_AREA_LINE_WIDTH;

        for (let s = seriesCount - 1; s >= 0; s--) {
            const color = style.colors[s % style.colors.length];
            ctx.fillStyle = color + "40";
            ctx.strokeStyle = color;

            const baseline = area.y + area.h;

            ctx.beginPath();
            ctx.moveTo(area.x + stepX / 2, baseline);

            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const x = area.x + stepX * i + stepX / 2;
                const y = area.y + area.h - ((val - yMin) / yRange) * area.h;
                ctx.lineTo(x, y);
            }

            ctx.lineTo(area.x + stepX * (catCount - 1) + stepX / 2, baseline);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            let firstPoint = true;
            for (let i = 0; i < catCount; i++) {
                const val = Number(data.data[i][s + 1]) || 0;
                const x = area.x + stepX * i + stepX / 2;
                const y = area.y + area.h - ((val - yMin) / yRange) * area.h;

                if (firstPoint) {
                    ctx.moveTo(x, y);
                    firstPoint = false;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }
    }

    static #renderScatter(ctx, data, area, style, yScale) {
        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;

        const allX = data.data.map((row) => Number(row[0]) || 0);
        const allY = data.data.flatMap((row) => row.slice(1).map((v) => Number(v) || 0));
        const xMin = Math.min(...allX);
        const xMax = Math.max(...allX);
        const yMin = yScale ? yScale.min : Math.min(...allY);
        const yMax = yScale ? yScale.max : Math.max(...allY);
        const xRange = xMax - xMin || 1;
        const yRange = yMax - yMin || 1;

        for (let s = 0; s < seriesCount; s++) {
            ctx.fillStyle = style.colors[s % style.colors.length];

            for (let i = 0; i < catCount; i++) {
                const xVal = Number(data.data[i][0]) || 0;
                const yVal = Number(data.data[i][s + 1]) || 0;
                const x = area.x + ((xVal - xMin) / xRange) * area.w;
                const y = area.y + area.h - ((yVal - yMin) / yRange) * area.h;

                ctx.beginPath();
                ctx.arc(x, y, CONFIG.CHART_SCATTER_DOT_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    static #renderTitle(ctx, title, area) {
        ctx.save();
        ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
        ctx.font = `bold ${CONFIG.CHART_TITLE_FONT_SIZE}px ${CONFIG.CHART_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(title, area.x + area.w / 2, 10);
        ctx.restore();
    }

    static #renderLegend(ctx, data, area, style) {
        const seriesNames = data.headers.slice(1);
        ctx.save();
        ctx.font = `${CONFIG.CHART_LEGEND_FONT_SIZE}px ${CONFIG.CHART_FONT_FAMILY}`;

        const itemWidth = CONFIG.CHART_LEGEND_ITEM_WIDTH;
        const totalWidth = seriesNames.length * itemWidth;
        let startX = area.x + (area.w - totalWidth) / 2;
        const y = area.y + area.h + CONFIG.CHART_LEGEND_OFFSET_Y;

        for (let i = 0; i < seriesNames.length; i++) {
            ctx.fillStyle = style.colors[i % style.colors.length];
            ctx.fillRect(startX, y - 5, CONFIG.CHART_LEGEND_ITEM_SIZE, CONFIG.CHART_LEGEND_ITEM_SIZE);

            ctx.fillStyle = CONFIG.CHART_TEXT_COLOR;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(String(seriesNames[i]), startX + 16, y + 1);

            startX += itemWidth;
        }

        ctx.restore();
    }

    static #getYMin(data) {
        let min = Infinity;
        for (const row of data.data) {
            for (let c = 1; c < row.length; c++) {
                const v = Number(row[c]);
                if (!isNaN(v) && v < min) min = v;
            }
        }
        return min === Infinity ? 0 : min;
    }

    static #getYMax(data) {
        let max = -Infinity;
        for (const row of data.data) {
            for (let c = 1; c < row.length; c++) {
                const v = Number(row[c]);
                if (!isNaN(v) && v > max) max = v;
            }
        }
        return max === -Infinity ? 1 : max;
    }

    static buildYScale(data, chartType) {
        const dataMin = this.#getYMin(data);

        let minValue;
        if (dataMin >= 0) {
            minValue = 0;
        } else if (chartType === "bar") {
            minValue = 0;
        } else {
            minValue = dataMin;
        }

        const ticks = this.#calcYTicks(data, 5, minValue);
        return {
            min: ticks[0],
            max: ticks[ticks.length - 1],
            ticks,
        };
    }

    static #calcYTicks(data, count, minValue) {
        const yMin = minValue !== undefined ? minValue : this.#getYMin(data);
        const yMax = this.#getYMax(data);
        const range = yMax - yMin || 1;
        const rawStep = range / count;
        const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const normStep = rawStep / mag;

        let step;
        if (normStep <= 1.5) step = mag;
        else if (normStep <= 3) step = 2 * mag;
        else if (normStep <= 7) step = 5 * mag;
        else step = 10 * mag;

        const start = Math.floor(yMin / step) * step;
        const end = Math.ceil(yMax / step) * step;
        const ticks = [];
        for (let v = start; v <= end + step * 0.01; v += step) {
            ticks.push(Math.round(v * 1e10) / 1e10);
        }

        return ticks;
    }

    static #formatNumber(val) {
        if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1) + "M";
        if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(1) + "K";
        return String(val);
    }

    /**
     * 判断图表类型是否不需要坐标轴
     *
     * 某些图表类型（如饼图、仪表盘、漏斗图、旭日图等）使用非笛卡尔坐标系，
     * 不需要 X/Y 坐标轴和网格线。
     *
     * @private
     * @param {string} chartType - 图表类型
     * @returns {boolean} 如果不需要坐标轴返回 true
     */
    static #isAxisFreeChart(chartType) {
        const axisFreeTypes = ["pie", "gauge", "funnel", "sunburst"];
        return axisFreeTypes.includes(chartType);
    }

    /**
     * 渲染 K 线图（蜡烛图）
     *
     * 数据格式：每行 [开盘价, 收盘价, 最低价, 最高价]
     * - 绿色（上涨）：收盘价 > 开盘价
     * - 红色（下跌）：收盘价 < 开盘价
     *
     * @private
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     * @param {Object} data - 图表数据
     * @param {Object} area - 绘图区域 {x, y, w, h}
     * @param {Object} style - 样式配置
     * @param {Object} yScale - Y 轴刻度信息
     */
    static #renderCandlestick(ctx, data, area, style, yScale) {
        const catCount = data.data.length;
        if (catCount <= 0) return;

        const yMin = yScale ? yScale.min : this.#getYMin(data);
        const yMax = yScale ? yScale.max : this.#getYMax(data);
        const yRange = yMax - yMin || 1;

        const candleWidth = Math.max((area.w / catCount) * 0.7, 4);
        const candleGap = (area.w / catCount - candleWidth) / 2;
        const wickWidth = 1;

        for (let i = 0; i < catCount; i++) {
            const row = data.data[i];

            if (!row || row.length < 4) continue;

            const open = Number(row[0]) || 0;
            const close = Number(row[1]) || 0;
            const low = Number(row[2]) || 0;
            const high = Number(row[3]) || 0;

            const isUp = close >= open;

            const cx = area.x + (i + 0.5) * (area.w / catCount);

            const openY = area.y + area.h - ((open - yMin) / yRange) * area.h;
            const closeY = area.y + area.h - ((close - yMin) / yRange) * area.h;
            const lowY = area.y + area.h - ((low - yMin) / yRange) * area.h;
            const highY = area.y + area.h - ((high - yMin) / yRange) * area.h;

            const bodyTop = Math.min(openY, closeY);
            const bodyH = Math.abs(closeY - openY) || 1;

            ctx.strokeStyle = isUp ? "#00aa44" : "#ff4444";
            ctx.fillStyle = isUp ? "#00aa44" : "#ff4444";

            ctx.lineWidth = wickWidth;

            ctx.beginPath();
            ctx.moveTo(cx, highY);
            ctx.lineTo(cx, lowY);
            ctx.stroke();

            if (bodyH > 1) {
                ctx.fillRect(cx - candleWidth / 2, bodyTop, candleWidth, bodyH);

                ctx.lineWidth = 1;
                ctx.strokeRect(cx - candleWidth / 2, bodyTop, candleWidth, bodyH);
            } else {
                ctx.beginPath();
                ctx.moveTo(cx - candleWidth / 2, bodyTop);
                ctx.lineTo(cx + candleWidth / 2, bodyTop);
                ctx.stroke();
            }
        }
    }

    /**
     * K 线图点击检测
     *
     * 检测点击位置是否落在某根 K 线的范围内
     *
     * @private
     * @param {number} px - 点击 X 坐标
     * @param {number} py - 点击 Y 坐标
     * @param {Object} data - 图表数据
     * @param {Object} area - 绘图区域
     * @param {number} catCount - 类别数量
     * @param {Object} yScale - Y 轴刻度信息
     * @returns {Object|null} 命中信息或 null
     */
    static #hitCandlestick(px, py, data, area, catCount, yScale) {
        const yMin = yScale ? yScale.min : this.#getYMin(data);
        const yMax = yScale ? yScale.max : this.#getYMax(data);
        const yRange = yMax - yMin || 1;

        const candleWidth = Math.max((area.w / catCount) * 0.7, 4);
        const hitPaddingX = candleWidth / 2 + 8;
        const hitPaddingY = 15;

        for (let i = 0; i < catCount; i++) {
            const row = data.data[i];
            if (!row || row.length < 4) continue;

            const open = Number(row[0]) || 0;
            const close = Number(row[1]) || 0;
            const low = Number(row[2]) || 0;
            const high = Number(row[3]) || 0;

            const cx = area.x + (i + 0.5) * (area.w / catCount);

            const highY = area.y + area.h - ((high - yMin) / yRange) * area.h;
            const lowY = area.y + area.h - ((low - yMin) / yRange) * area.h;

            if (px >= cx - hitPaddingX && px <= cx + hitPaddingX && py >= highY - hitPaddingY && py <= lowY + hitPaddingY) {
                const isUp = close >= open;
                const change = close - open;
                const changePercent = open !== 0 ? ((change / open) * 100).toFixed(2) : "0.00";

                return {
                    category: String(data.headers?.[i] || `K${i + 1}`),
                    seriesName: "OHLC",
                    value: `O:${open} H:${high} L:${low} C:${close}`,
                    detail: {
                        open,
                        high,
                        low,
                        close,
                        change: change.toFixed(2),
                        changePercent: `${changePercent}%`,
                        direction: isUp ? "上涨 📈" : "下跌 📉",
                    },
                    pointX: cx,
                    pointY: (highY + lowY) / 2,
                };
            }
        }

        return null;
    }

    /**
     * 计算点到线段的最短距离
     *
     * @private
     * @param {number} px - 点的 X 坐标
     * @param {number} py - 点的 Y 坐标
     * @param {number} x1 - 线段起点 X
     * @param {number} y1 - 线段起点 Y
     * @param {number} x2 - 线段终点 X
     * @param {number} y2 - 线段终点 Y
     * @returns {number} 最短距离（像素）
     */
    static #pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;

        return Math.sqrt(dx * dx + dy * dy);
    }

    static #renderGauge(ctx, data, area, style) {
        console.log("[Gauge] 开始渲染仪表盘...", { data, area, style });

        if (!data.data || data.data.length === 0) {
            console.warn("[Gauge] 数据为空，无法渲染");
            return;
        }

        const value = Number(data.data[0]?.[1]) || 0;
        const label = String(data.data[0]?.[0] || data.headers?.[0] || "Value");

        console.log(`[Gauge] 提取数据: 标签=${label}, 数值=${value}`);

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

    static #hitGauge(px, py, data, area) {
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

    static #renderFunnel(ctx, data, area, style) {
        console.log("[Funnel] 开始渲染漏斗图...", { data, area, style });

        if (!data.data || data.data.length === 0) {
            console.warn("[Funnel] 数据为空，无法渲染");
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

    static #hitFunnel(px, py, data, area) {
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
}
