import { CONFIG } from "../../constants/config.js";

export class NativeChartRenderer {
    static render(ctx, chart, data, plotArea, style) {
        ctx.save();
        
        if (style.showGrid !== false) {
            this.#renderGrid(ctx, plotArea);
        }
        
        this.#renderAxes(ctx, data, plotArea);
        
        switch (chart.type) {
            case "bar":
                this.#renderBar(ctx, data, plotArea, style);
                break;
            case "line":
                this.#renderLine(ctx, data, plotArea, style);
                break;
            case "pie":
                this.#renderPie(ctx, data, plotArea, style);
                break;
            case "area":
                this.#renderArea(ctx, data, plotArea, style);
                break;
            case "scatter":
                this.#renderScatter(ctx, data, plotArea, style);
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

    static #renderAxes(ctx, data, area) {
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
        
        const yTicks = this.#calcYTicks(data, 5);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        
        for (const val of yTicks) {
            const y = area.y + area.h - ((val - yTicks[0]) / (yTicks[yTicks.length - 1] - yTicks[0])) * area.h;
            ctx.fillText(this.#formatNumber(val), area.x - 6, y);
        }
        
        ctx.restore();
    }

    static #renderBar(ctx, data, area, style) {
        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;
        
        const groupWidth = area.w / catCount;
        const barWidth = (groupWidth * 0.7) / seriesCount;
        const barGap = (groupWidth * 0.3) / (seriesCount + 1);
        const yMin = this.#getYMin(data);
        const yMax = this.#getYMax(data);
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

    static #renderLine(ctx, data, area, style) {
        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;
        
        const yMin = this.#getYMin(data);
        const yMax = this.#getYMax(data);
        const yRange = yMax - yMin || 1;
        const stepX = area.w / catCount;
        
        for (let s = 0; s < seriesCount; s++) {
            ctx.strokeStyle = style.colors[s % style.colors.length];
            ctx.fillStyle = style.colors[s % style.colors.length];
            ctx.lineWidth = CONFIG.CHART_TOOLTIP_BORDER_WIDTH;
            
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
                
                ctx.beginPath();
                ctx.arc(x, y, CONFIG.CHART_LINE_DOT_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.stroke();
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

    static #renderArea(ctx, data, area, style) {
        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;
        
        const yMin = this.#getYMin(data);
        const yMax = this.#getYMax(data);
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

    static #renderScatter(ctx, data, area, style) {
        const seriesCount = data.headers.length - 1;
        const catCount = data.data.length;
        if (seriesCount <= 0 || catCount <= 0) return;
        
        const allX = data.data.map((row) => Number(row[0]) || 0);
        const allY = data.data.flatMap((row) => row.slice(1).map((v) => Number(v) || 0));
        const xMin = Math.min(...allX);
        const xMax = Math.max(...allX);
        const yMin = Math.min(...allY);
        const yMax = Math.max(...allY);
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

    static #calcYTicks(data, count) {
        const yMin = this.#getYMin(data);
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
        const ticks = [];
        for (let v = start; v <= yMax + step * 0.01; v += step) {
            ticks.push(Math.round(v * 1e10) / 1e10);
        }
        
        return ticks;
    }

    static #formatNumber(val) {
        if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1) + "M";
        if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(1) + "K";
        return String(val);
    }
}
