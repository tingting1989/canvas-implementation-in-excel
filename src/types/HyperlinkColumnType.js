/**
 * 超链接列类型（HyperlinkColumnType）
 *
 * 将 URL 渲染为可点击的超链接样式文本（蓝色 + 下划线），
 * 点击时在新标签页中打开链接，支持钩子拦截。
 *
 * ## 数据格式
 *
 * 支持两种数据格式：
 *
 * | 格式     | 示例                                        | 说明                     |
 * |----------|---------------------------------------------|--------------------------|
 * | 字符串   | "https://example.com"                       | URL 即显示文本           |
 * | 对象     | { url: "https://example.com", text: "示例" } | text 为显示文本，url 为链接地址 |
 *
 * ## 输入解析（parse）
 *
 * 支持以下输入格式：
 * - 纯 URL：`"https://example.com"` → 直接存储为字符串
 * - 显示文本|URL：`"示例|https://example.com"` → 存储为 `{ url, text }` 对象
 * - 非 URL 字符串：原样存储
 *
 * ## 渲染效果
 *
 * - **有效 URL**：蓝色文字 + 下划线（颜色可由 style.color 或主题配置覆盖）
 * - **无效 URL**：普通黑色文字，无下划线
 * - **文本截断**：超出单元格宽度时自动截断并添加省略号 "..."
 * - **裁剪**：截断文本使用 clip 限制在单元格区域内
 *
 * ## 点击行为（handleClick）
 *
 * 1. 从单元格值提取 URL
 * 2. 触发 BEFORE_OPEN_URL 钩子，返回 false 则阻止打开
 * 3. 调用 openUrl() 在新标签页打开链接
 * 4. 触发 AFTER_OPEN_URL 钩子
 *
 * ## 自定义选项（this.options）
 *
 * | 选项              | 类型   | 默认值 | 说明                           |
 * |-------------------|--------|--------|--------------------------------|
 * | maxDisplayLength   | number | —      | URL 显示文本的最大长度（由 getUrlDisplayText 截断） |
 *
 * @module types/HyperlinkColumnType
 * @see BaseColumnType 列类型基类，定义 name、editorType、format、parse 等接口
 * @see UrlDetector URL 工具集，提供 isUrl / getUrlDisplayText / openUrl 方法
 * @see HOOKS 钩子名称常量，定义 BEFORE_OPEN_URL / AFTER_OPEN_URL
 */

import { BaseColumnType } from "./BaseColumnType.js";
import { getUrlDisplayText, isUrl, openUrl } from "../utils/UrlDetector.js";
import { HOOKS } from "../constants/hookNames.js";
import { themeStyleProvider } from "../theme/index.js";

export class HyperlinkColumnType extends BaseColumnType {
    /** @type {string} 类型名称标识 */
    get name() {
        return "hyperlink";
    }

    /** @type {string} 关联的编辑器类型（超链接使用文本编辑器输入） */
    get editorType() {
        return "text";
    }

    /**
     * 是否为交互式列类型
     *
     * 返回 false 表示不自动注册点击事件监听，
     * 点击行为由 handleClick() 在事件分发阶段手动调用。
     *
     * @type {boolean}
     */
    get isInteractive() {
        return false;
    }

    /**
     * 将原始值格式化为编辑器显示文本
     *
     * 编辑器中需要显示用户可理解的文本：
     * - 对象值：优先显示 text，回退到 url
     * - 其他值：直接转为字符串
     *
     * @param {*} rawValue - 原始单元格值
     * @returns {string} 编辑器显示文本
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
     * 自定义渲染方法：绘制超链接样式文本
     *
     * 绘制流程：
     * 1. 提取 URL 和显示文本
     * 2. 设置字体、对齐方式，计算文本位置
     * 3. 文本截断：超出宽度时二分查找最大可显示字符数，添加省略号
     * 4. 有效 URL：蓝色文字 + 下划线
     * 5. 无效 URL：普通黑色文字
     * 6. 截断文本使用 clip 裁剪到单元格区域
     *
     * 下划线位置：文本基线下方 fontSize/2 + 2 像素处，
     * 根据文本对齐方式计算起始 X 坐标。
     *
     * @param {import('./CellRenderContext.js').CellRenderContext} context - 单元格渲染上下文
     */
    render(context) {
        const { ctx, x, y, width, height, value, displayValue, style, sheet } = context;

        const url = this.getUrl(value);
        const text = displayValue || this.format(value);

        const fontSize = style.fontSize || 12;
        const textAlign = style.textAlign || "left";
        const cellPadding = sheet?.cellPadding ?? 8;
        const textOverflowEllipsis = sheet?.textOverflowEllipsis ?? true;

        // 设置字体
        const fontFamily = style.fontFamily || "Microsoft YaHei";
        const fontWeight = style.fontWeight || "normal";
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.textBaseline = "middle";
        ctx.textAlign = textAlign;

        // 计算文本位置
        let textX = x + cellPadding;
        const textY = y + height / 2;

        if (textAlign === "center") {
            textX = x + width / 2;
        } else if (textAlign === "right") {
            textX = x + width - cellPadding;
        }

        // 文本截断：二分查找最大可显示字符数
        const maxTextWidth = width - cellPadding * 2;
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
            // 有效 URL：蓝色文字 + 下划线
            const hyperlinkStyle = themeStyleProvider.getStyle("cell.hyperlink");
            const linkColor = style.color || hyperlinkStyle.color || "#1a73e8";

            // 截断文本需要裁剪，防止省略号溢出单元格
            if (renderedText !== text) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(x, y, width, height);
                ctx.clip();
            }

            // 绘制链接文字
            ctx.fillStyle = linkColor;
            ctx.fillText(renderedText, textX, textY);

            // 计算下划线起始 X 坐标（根据对齐方式调整）
            let underlineX = textX;
            if (textAlign === "center") {
                underlineX = textX - textWidth / 2;
            } else if (textAlign === "right") {
                underlineX = textX - textWidth;
            }

            // 绘制下划线（基线下方 fontSize/2 + 2px）
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
            // 无效 URL：普通文字
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

    /**
     * 处理单元格点击事件
     *
     * 点击流程：
     * 1. 从单元格值提取 URL，无 URL 则忽略
     * 2. 触发 BEFORE_OPEN_URL 钩子，返回 false 则阻止打开
     * 3. 调用 openUrl() 在新标签页打开链接
     * 4. 触发 AFTER_OPEN_URL 钩子
     *
     * @param {import('./CellRenderContext.js').CellRenderContext} context - 单元格渲染上下文
     * @param {Event} event - 原生 DOM 事件
     * @returns {null} 始终返回 null（不产生操作结果）
     */
    handleClick(context, event) {
        const { value, row, col, sheet } = context;
        const url = this.getUrl(value);

        if (!url) return null;

        const hooks = sheet?.hooks || null;

        // 前置钩子：允许拦截链接打开
        if (hooks && typeof hooks.runHooksUntil === "function") {
            const canOpen = hooks.runHooksUntil(HOOKS.BEFORE_OPEN_URL, row, col, url, event);
            if (canOpen === false) return null;
        }

        openUrl(url, "_blank");

        // 后置钩子：通知链接已打开
        if (hooks && typeof hooks.runHooks === "function") {
            hooks.runHooks(HOOKS.AFTER_OPEN_URL, row, col, url);
        }

        return null;
    }

    /**
     * 格式化超链接值为显示文本
     *
     * - 对象值：优先使用 text 属性，回退到 getUrlDisplayText(url)
     * - 字符串值：使用 getUrlDisplayText() 截断过长的 URL
     * - 空值：返回 ""
     *
     * @param {*} value - 原始单元格值
     * @returns {string} 格式化后的显示文本
     */
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

    /**
     * 验证超链接值是否有效
     *
     * 验证规则：
     * - 空值合法
     * - 对象值：必须包含 url 字段，且 url 必须是有效 URL
     * - 字符串值：必须是有效 URL（以 http:// 或 https:// 开头）
     *
     * @param {*} value - 待验证的值
     * @returns {true|string} true 表示有效，字符串表示错误信息
     */
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

    /**
     * 解析用户输入为存储格式
     *
     * 支持的输入格式：
     * - `"显示文本|URL"`：使用 | 分隔，左侧为显示文本，右侧为 URL
     *   解析为 `{ url, text }` 对象（使用 lastIndexOf 确保文本中可包含 |）
     * - 纯 URL 字符串：直接存储为字符串
     * - 非 URL 字符串：原样存储
     * - 空输入：返回 ""
     *
     * @param {*} input - 用户输入值
     * @returns {string|object} 解析后的值（字符串或 { url, text } 对象）
     */
    parse(input) {
        if (!input || typeof input !== "string") {
            return input;
        }

        const trimmed = input.trim();
        if (trimmed === "") {
            return "";
        }

        // 尝试解析 "显示文本|URL" 格式（使用 lastIndexOf 允许文本中包含 |）
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

        // 纯 URL 字符串
        if (isUrl(trimmed)) {
            return trimmed;
        }

        // 非 URL 字符串，原样返回
        return trimmed;
    }

    /**
     * 获取默认样式
     *
     * 超链接列不覆盖基类默认样式，直接返回 baseStyle。
     * 链接颜色在 render() 中通过主题配置动态获取。
     *
     * @param {object} baseStyle - 基础样式
     * @returns {object} 原样返回基础样式
     */
    getDefaultStyle(baseStyle) {
        return baseStyle;
    }

    /**
     * 从单元格值中提取有效 URL
     *
     * 提取规则：
     * - 对象值：取 url 属性，通过 isUrl() 验证
     * - 字符串值：通过 isUrl() 验证
     * - 空值或无效 URL：返回 null
     *
     * @param {*} value - 单元格值
     * @returns {string|null} 有效 URL 字符串，无效则返回 null
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
     * 手动打开超链接（编程式 API）
     *
     * 与 handleClick() 类似，但可由外部代码主动调用，
     * 支持自定义 target 和钩子上下文。
     *
     * @param {*} value - 单元格值（用于提取 URL）
     * @param {object} [options={}] - 打开选项
     * @param {string} [options.target="_blank"] - 链接打开目标（如 "_blank"、"_self"）
     * @param {number} [options.row] - 行号（传递给钩子）
     * @param {number} [options.col] - 列号（传递给钩子）
     * @param {Event} [options.event] - 原生事件（传递给钩子）
     * @param {object} [options.hooks] - 钩子管理器实例
     * @returns {boolean} 是否成功打开（false 表示被钩子拦截或无有效 URL）
     */
    openLink(value, options = {}) {
        const { target = "_blank", row, col, event, hooks } = options;

        const url = this.getUrl(value);
        if (!url) {
            return false;
        }

        // 前置钩子：允许拦截链接打开
        if (hooks && typeof hooks.runHooksUntil === "function") {
            const canOpen = hooks.runHooksUntil(HOOKS.BEFORE_OPEN_URL, row, col, url, event);
            if (canOpen === false) {
                return false;
            }
        }

        openUrl(url, target);

        // 后置钩子：通知链接已打开
        if (hooks && typeof hooks.runHooks === "function") {
            hooks.runHooks(HOOKS.AFTER_OPEN_URL, row, col, url);
        }

        return true;
    }
}
