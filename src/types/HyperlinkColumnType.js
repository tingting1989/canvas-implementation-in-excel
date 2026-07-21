import { BaseColumnType } from "./BaseColumnType.js";
import { isUrl, getUrlDisplayText, openUrl } from "../utils/UrlDetector.js";
import { HOOKS } from "../constants/hookNames.js";

/**
 * 超链接列类型（Hyperlink Column Type）
 *
 * 用于处理和显示超链接的专用列类型。支持：
 * - URL 格式验证
 * - 可点击的链接显示
 * - 自定义链接文本
 * - 安全的链接打开方式
 *
 * 特性：
 * - 🔗 自动检测 URL 格式
 * - 📝 支持自定义显示文本
 * - 🔒 安全打开链接（noopener,noreferrer）
 * - 🎨 默认蓝色带下划线样式
 * - ✅ URL 有效性验证
 *
 * 适用场景：网站链接、文档链接、邮箱地址、社交媒体链接等
 *
 * @class HyperlinkColumnType
 * @extends BaseColumnType
 */
export class HyperlinkColumnType extends BaseColumnType {
    /**
     * 获取类型名称
     * @returns {string} 类型名称
     */
    get name() {
        return "hyperlink";
    }

    /**
     * 获取编辑器类型
     * @returns {string} 编辑器类型
     */
    get editorType() {
        return "text";
    }

    /**
     * 是否可交互（会被 InteractionStrategy 处理）
     * 设置为 false，允许双击弹出编辑器
     * 单击事件仍会由 InteractionStrategy 处理
     * @returns {boolean}
     */
    get isInteractive() {
        return false;
    }

    /**
     * 格式化值用于编辑器显示
     * @param {*} rawValue - 原始值
     * @returns {string} 格式化后的值
     */
    formatValueForEditor(rawValue) {
        if (!rawValue) {
            return "";
        }
        if (typeof rawValue === "object" && rawValue.url) {
            return rawValue.text || rawValue.url;
        }
        return String(rawValue);
    }

    /**
     * 自定义渲染超链接
     * @param {CellRenderContext} context - 渲染上下文
     */
    render(context) {
        const { ctx, x, y, width, height, value, displayValue, style } = context;

        const url = this.getUrl(value);
        const displayText = displayValue || this.format(value);

        const fontSize = style.fontSize || 12;
        const textAlign = style.textAlign || "left";
        const verticalAlign = style.verticalAlign || "middle";
        const cellPadding = style.cellPadding || 8;

        ctx.font = `${style.fontWeight || "normal"} ${fontSize}px ${style.fontFamily || "Microsoft YaHei"}`;
        ctx.textBaseline = verticalAlign === "middle" ? "middle" : verticalAlign === "bottom" ? "bottom" : "top";

        let textX = x + cellPadding;
        let textY = y + height / 2;

        const textWidth = ctx.measureText(displayText).width;

        if (textAlign === "center") {
            textX = x + (width - textWidth) / 2;
        } else if (textAlign === "right") {
            textX = x + width - textWidth - cellPadding;
        }

        if (url) {
            console.log(ctx, style);
            ctx.fillStyle = style.color || "#1a73e8";
            ctx.fillText(displayText, textX, textY);

            const underlineY = textY + fontSize / 2 + 2;
            ctx.strokeStyle = style.color || "#1a73e8";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(textX, underlineY);
            ctx.lineTo(textX + textWidth, underlineY);
            ctx.stroke();
        } else {
            ctx.fillStyle = style.color || "#333";
            ctx.fillText(displayText, textX, textY);
        }
    }

    /**
     * 处理点击事件（由 InteractionStrategy 调用）
     * @param {object} context - 交互上下文
     * @param {MouseEvent} event - 鼠标事件
     */
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

    /**
     * 格式化值用于显示
     *
     * 根据配置，可能返回：
     * - 纯 URL 的简化显示文本（移除协议，超长截断）
     * - 自定义显示文本（如果配置了 displayText）
     *
     * @param {*} value - 原始值（可以是 URL 字符串或对象）
     * @returns {string} 格式化后的显示文本
     */
    format(value) {
        if (value === undefined || value === null || value === "") {
            return "";
        }

        // 如果是对象格式 { url, text }
        if (typeof value === "object" && value.url) {
            return value.text || getUrlDisplayText(value.url, this.options?.maxDisplayLength);
        }

        // 如果是纯 URL 字符串
        const urlStr = String(value);
        return getUrlDisplayText(urlStr, this.options?.maxDisplayLength);
    }

    /**
     * 验证值是否有效
     *
     * 验证规则：
     * - 空值有效
     * - 纯 URL 字符串必须是有效的 URL 格式
     * - 对象格式必须包含有效的 url 字段
     *
     * @param {*} value - 待验证的值
     * @returns {boolean|string} 验证通过返回 true，失败返回错误消息
     */
    validate(value) {
        if (value === "" || value === undefined || value === null) {
            return true;
        }

        // 对象格式验证
        if (typeof value === "object") {
            if (!value.url) {
                return "超链接对象必须包含 url 字段";
            }
            if (!isUrl(value.url)) {
                return "无效的 URL 格式";
            }
            return true;
        }

        // 字符串格式验证
        const str = String(value);
        if (!isUrl(str)) {
            return "请输入有效的 URL（以 http:// 或 https:// 开头）";
        }

        return true;
    }

    /**
     * 解析用户输入
     *
     * 支持两种输入格式：
     * 1. 纯 URL 字符串：直接返回
     * 2. 格式为 "显示文本|URL" 的字符串：解析为对象格式
     *
     * @param {string} input - 用户输入的文本
     * @returns {string|object} 解析后的值
     */
    parse(input) {
        if (!input || typeof input !== "string") {
            return input;
        }

        const trimmed = input.trim();
        if (trimmed === "") {
            return "";
        }

        // 检查是否为 "显示文本|URL" 格式
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

        // 如果已经是有效的 URL，直接返回
        if (isUrl(trimmed)) {
            return trimmed;
        }

        // 如果不是 URL，可能是想作为显示文本，需要用户补全 URL
        return trimmed;
    }

    /**
     * 获取超链接列的默认样式
     *
     * 默认样式：手型光标（颜色由渲染层根据 URL 检测结果决定，避免重复设置）
     *
     * @param {object} baseStyle - 基础样式对象
     * @returns {object} 合并后的样式对象
     */
    getDefaultStyle(baseStyle) {
        // 只设置 cursor，颜色和下划线由渲染层根据 URL 检测结果统一处理
        // 避免与 TileRenderer 中的自动链接样式冲突
        console.log(1111);
        // const color = baseStyle?.color ?? '#1a73e8';
        return {
            ...baseStyle,
            cursor: "pointer",
        };
    }

    /**
     * 获取实际的 URL
     *
     * 从值中提取实际的 URL 地址，支持两种格式：
     * - 纯字符串 URL
     * - 对象格式 { url, text }
     *
     * @param {*} value - 单元格值
     * @returns {string|null} URL 字符串，无效时返回 null
     */
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

    /**
     * 安全打开链接
     *
     * 使用 noopener,noreferrer 安全打开链接
     * 支持 hooks 系统，可以在打开链接前后触发回调
     *
     * @param {*} value - 单元格值（包含 URL）
     * @param {object} [options] - 打开选项
     * @param {string} [options.target="_blank"] - 打开方式
     * @param {number} [options.row] - 行号（用于 hooks）
     * @param {number} [options.col] - 列号（用于 hooks）
     * @param {Event} [options.event] - 触发事件（用于 hooks）
     * @param {object} [options.hooks] - Hooks 系统实例（用于触发回调）
     * @returns {boolean} 是否成功打开链接
     */
    openLink(value, options = {}) {
        const { target = "_blank", row, col, event, hooks } = options;

        const url = this.getUrl(value);
        if (!url) {
            return false;
        }

        // 触发 BEFORE_OPEN_URL hook，允许拦截
        if (hooks && typeof hooks.runHooksUntil === "function") {
            const canOpen = hooks.runHooksUntil(HOOKS.BEFORE_OPEN_URL, row, col, url, event);
            if (canOpen === false) {
                return false;
            }
        }

        // 打开链接
        openUrl(url, target);

        // 触发 AFTER_OPEN_URL hook
        if (hooks && typeof hooks.runHooks === "function") {
            hooks.runHooks(HOOKS.AFTER_OPEN_URL, row, col, url);
        }

        return true;
    }
}
