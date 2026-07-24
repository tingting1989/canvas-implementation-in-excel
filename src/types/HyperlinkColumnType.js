import { BaseColumnType } from "./BaseColumnType.js";
import { isUrl, getUrlDisplayText, openUrl } from "../utils/UrlDetector.js";
import { HOOKS } from "../constants/hookNames.js";
import { themeStyleProvider } from "../theme/index.js";

export class HyperlinkColumnType extends BaseColumnType {
    get name() {
        return "hyperlink";
    }

    get editorType() {
        return "text";
    }

    get isInteractive() {
        return false;
    }

    formatValueForEditor(rawValue) {
        if (!rawValue) {
            return "";
        }
        if (typeof rawValue === "object" && rawValue.url) {
            return rawValue.text || rawValue.url;
        }
        return String(rawValue);
    }

    render(context) {
        const { ctx, x, y, width, height, value, displayValue, style, sheet } = context;

        const url = this.getUrl(value);
        const text = displayValue || this.format(value);

        const fontSize = style.fontSize || 12;
        const textAlign = style.textAlign || "left";
        const cellPadding = sheet?.cellPadding ?? 8;
        const textOverflowEllipsis = sheet?.textOverflowEllipsis ?? true;

        const fontFamily = style.fontFamily || "Microsoft YaHei";
        const fontWeight = style.fontWeight || "normal";
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.textBaseline = "middle";
        ctx.textAlign = textAlign;

        let textX = x + cellPadding;
        const textY = y + height / 2;

        if (textAlign === "center") {
            textX = x + width / 2;
        } else if (textAlign === "right") {
            textX = x + width - cellPadding;
        }

        const effectiveW = width;
        const maxTextWidth = effectiveW - cellPadding * 2;
        let renderedText = text;

        if (maxTextWidth > 0) {
            const fullWidth = ctx.measureText(text).width;
            if (fullWidth > maxTextWidth) {
                const suffix = textOverflowEllipsis ? "..." : "";
                let lo = 0;
                let hi = text.length;
                while (lo < hi) {
                    const mid = Math.ceil((lo + hi) / 2);
                    if (ctx.measureText(text.slice(0, mid) + suffix).width > maxTextWidth) {
                        hi = mid - 1;
                    } else {
                        lo = mid;
                    }
                }
                renderedText = text.slice(0, lo) + suffix;
            }
        }

        const textWidth = ctx.measureText(renderedText).width;

        if (url) {
            const hyperlinkStyle = themeStyleProvider.getStyle("cell.hyperlink");
            const linkColor = style.color || hyperlinkStyle.color || "#1a73e8";

            if (renderedText !== text) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(x, y, width, height);
                ctx.clip();
            }

            ctx.fillStyle = linkColor;
            ctx.fillText(renderedText, textX, textY);

            let underlineX = textX;
            if (textAlign === "center") {
                underlineX = textX - textWidth / 2;
            } else if (textAlign === "right") {
                underlineX = textX - textWidth;
            }

            const underlineY = textY + fontSize / 2 + 2;
            ctx.strokeStyle = linkColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(underlineX, underlineY);
            ctx.lineTo(underlineX + textWidth, underlineY);
            ctx.stroke();

            if (renderedText !== text) {
                ctx.restore();
            }
        } else {
            if (renderedText !== text) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(x, y, width, height);
                ctx.clip();
            }

            ctx.fillStyle = style.color || "#333";
            ctx.fillText(renderedText, textX, textY);

            if (renderedText !== text) {
                ctx.restore();
            }
        }
    }

    handleClick(context, event) {
        const { value, row, col, sheet } = context;
        const url = this.getUrl(value);

        if (!url) return null;

        const hooks = sheet?.hooks || null;

        if (hooks && typeof hooks.runHooksUntil === "function") {
            const canOpen = hooks.runHooksUntil(HOOKS.BEFORE_OPEN_URL, row, col, url, event);
            if (canOpen === false) return null;
        }

        openUrl(url, "_blank");

        if (hooks && typeof hooks.runHooks === "function") {
            hooks.runHooks(HOOKS.AFTER_OPEN_URL, row, col, url);
        }

        return null;
    }

    format(value) {
        if (value === undefined || value === null || value === "") {
            return "";
        }

        if (typeof value === "object" && value.url) {
            return value.text || getUrlDisplayText(value.url, this.options?.maxDisplayLength);
        }

        const urlStr = String(value);
        return getUrlDisplayText(urlStr, this.options?.maxDisplayLength);
    }

    validate(value) {
        if (value === "" || value === undefined || value === null) {
            return true;
        }

        if (typeof value === "object") {
            if (!value.url) {
                return "超链接对象必须包含 url 字段";
            }
            if (!isUrl(value.url)) {
                return "无效的 URL 格式";
            }
            return true;
        }

        const str = String(value);
        if (!isUrl(str)) {
            return "请输入有效的 URL（以 http:// 或 https:// 开头）";
        }

        return true;
    }

    parse(input) {
        if (!input || typeof input !== "string") {
            return input;
        }

        const trimmed = input.trim();
        if (trimmed === "") {
            return "";
        }

        const separatorIndex = trimmed.lastIndexOf("|");
        if (separatorIndex > 0) {
            const displayText = trimmed.slice(0, separatorIndex).trim();
            const url = trimmed.slice(separatorIndex + 1).trim();

            if (isUrl(url)) {
                return {
                    url: url,
                    text: displayText,
                };
            }
        }

        if (isUrl(trimmed)) {
            return trimmed;
        }

        return trimmed;
    }

    getDefaultStyle(baseStyle) {
        return baseStyle;
    }

    getUrl(value) {
        if (!value) {
            return null;
        }

        if (typeof value === "object" && value.url) {
            return isUrl(value.url) ? value.url : null;
        }

        const str = String(value);
        return isUrl(str) ? str : null;
    }

    openLink(value, options = {}) {
        const { target = "_blank", row, col, event, hooks } = options;

        const url = this.getUrl(value);
        if (!url) {
            return false;
        }

        if (hooks && typeof hooks.runHooksUntil === "function") {
            const canOpen = hooks.runHooksUntil(HOOKS.BEFORE_OPEN_URL, row, col, url, event);
            if (canOpen === false) {
                return false;
            }
        }

        openUrl(url, target);

        if (hooks && typeof hooks.runHooks === "function") {
            hooks.runHooks(HOOKS.AFTER_OPEN_URL, row, col, url);
        }

        return true;
    }
}
