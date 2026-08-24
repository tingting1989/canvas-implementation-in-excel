/**
 * 多行文本列类型（TextareaColumnType）
 *
 * 专门用于处理多行文本内容的单元格类型。
 *
 * ## 核心特性
 * - **Canvas 多行渲染**：支持自动换行、行高控制、超出截断（末行省略号）
 * - **编辑器集成**：使用 `<textarea>` 元素进行多行文本输入
 * - **样式默认值**：左对齐 + 顶部对齐
 * - **配置选项**：maxLength（最大字符数）、maxRows（最大显示行数）
 *
 * @module types/TextareaColumnType
 */

import { BaseColumnType } from "./BaseColumnType.js";
import { CONFIG } from "../constants/config.js";
import type { CellRenderContext } from "./CellRenderContext.js";

export class TextareaColumnType extends BaseColumnType {
    static readonly #MAX_CACHE_SIZE = 5000;
    static readonly #wrapCache = new Map<string, string[]>();

    get name(): "textarea" {
        return "textarea";
    }

    get editorType(): "textarea" {
        return "textarea";
    }

    static invalidateAll(): void {
        this.#wrapCache.clear();
    }

    static getCachedLines(key: string): string[] | undefined {
        return this.#getCache(key);
    }

    format(value: any): string {
        if (value === undefined || value === null) return "";
        return String(value);
    }

    validate(value: any): boolean | string {
        if (value === "" || value === undefined || value === null) return true;
        const str = String(value);
        const maxLength = this.options?.maxLength;
        if (maxLength != null && str.length > maxLength) {
            return `文本长度不能超过 ${maxLength} 个字符`;
        }
        return true;
    }

    parse(input: any): any {
        const trimmed = input?.trim?.() ?? input;
        if (trimmed === "") return "";
        return trimmed;
    }

    getEditorOptions(): Record<string, any> {
        return {
            maxLength: this.options?.maxLength,
            maxRows: this.options?.maxRows,
        };
    }

    render(context: CellRenderContext): void {
        const { ctx, x, y, width, height, value, style, sheet } = context;

        if (value === undefined || value === null || value === "") return;

        const text = String(value);

        const padding = context.getPadding(sheet);
        const maxTextWidth = width - padding * 2;

        if (maxTextWidth <= 0) return;

        const fontStyle = style.fontStyle === "italic" ? "italic" : "";
        const fontWeight = style.fontWeight || "normal";
        const fontSize = style.fontSize || CONFIG.DEFAULT_FONT_SIZE;
        const fontFamily = style.fontFamily || CONFIG.DEFAULT_FONT_FAMILY;
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`.trim().replace(/\s+/g, " ");
        ctx.fillStyle = style.color || CONFIG.CELL_TEXT_COLOR;
        ctx.textAlign = style.textAlign || "left";

        const lineHeight = fontSize * CONFIG.TEXTAREA_LINE_HEIGHT_RATIO;
        const lines = this.#wrapText(ctx, text, maxTextWidth);
        const configuredMaxRows = this.options?.maxRows;
        const availableHeight = height - padding * 2;
        const calculatedMaxLines = Math.max(1, Math.floor(availableHeight / lineHeight));
        const maxLines = configuredMaxRows > 0 ? configuredMaxRows : calculatedMaxLines;
        const visibleLines = lines.slice(0, maxLines);
        const showEllipsis = lines.length > visibleLines.length && visibleLines.length > 0;

        const totalTextHeight = visibleLines.length * lineHeight;
        const verticalAlign = style.verticalAlign || "middle";

        ctx.textBaseline = "middle";

        let startY: number;

        switch (verticalAlign) {
            case "middle":
                startY = y + (height - totalTextHeight) / 2;
                break;
            case "bottom":
                startY = y + height - padding - totalTextHeight;
                break;
            default:
                startY = y + padding;
                break;
        }

        if (startY < y) startY = y;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.clip();

        for (let i = 0; i < visibleLines.length; i++) {
            const lineText = showEllipsis && i === visibleLines.length - 1 ? visibleLines[i] + CONFIG.TEXTAREA_ELLIPSIS : visibleLines[i];

            let textX: number;
            switch (ctx.textAlign) {
                case "center":
                    textX = x + width / 2;
                    break;
                case "right":
                    textX = x + width - padding;
                    break;
                default:
                    textX = x + padding;
            }

            const textY = startY + i * lineHeight + lineHeight / 2;

            if (textY + lineHeight / 2 > y + height) break;

            ctx.fillText(lineText, textX, textY);
        }

        ctx.restore();
    }

    #wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
        const cacheKey = `${text}|${maxWidth}|${ctx.font}`;

        const cached = TextareaColumnType.#getCache(cacheKey);
        if (cached !== undefined) return cached;

        const lines = this.#doWrapText(ctx, text, maxWidth);

        TextareaColumnType.#setCache(cacheKey, lines);

        return lines;
    }

    #doWrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
        const paragraphs = text.split("\n");
        const allLines: string[] = [];

        for (const paragraph of paragraphs) {
            if (paragraph === "") {
                allLines.push("");
                continue;
            }
            let currentLine = "";

            for (const char of paragraph) {
                const testLine = currentLine + char;

                if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
                    allLines.push(currentLine);
                    currentLine = char;
                } else {
                    currentLine = testLine;
                }
            }

            if (currentLine) {
                allLines.push(currentLine);
            }
        }

        if (allLines.length === 0) {
            allLines.push("");
        }

        return allLines;
    }

    static #getCache(key: string): string[] | undefined {
        const value = this.#wrapCache.get(key);
        if (value !== undefined) {
            this.#wrapCache.delete(key);
            this.#wrapCache.set(key, value);
        }
        return value;
    }

    static #setCache(key: string, lines: string[]): void {
        if (this.#wrapCache.has(key)) {
            this.#wrapCache.delete(key);
        } else if (this.#wrapCache.size >= this.#MAX_CACHE_SIZE) {
            const oldestKey = this.#wrapCache.keys().next().value;
            if (oldestKey !== undefined) this.#wrapCache.delete(oldestKey);
        }
        this.#wrapCache.set(key, lines);
    }
}
