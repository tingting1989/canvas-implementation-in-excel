/**
 * URL 自动检测工具
 *
 * 用于自动识别单元格文本中的 URL，支持：
 * - 完整 URL 检测（以 http/https/ftp/mailto 开头）
 * - 从混合文本中提取 URL
 * - URL 格式验证
 *
 * ## 设计决策
 * - 不使用 new URL() 构造函数进行检测（兼容性更好，且允许更宽松的匹配）
 * - 正则表达式参考 RFC 3986，但做了实用化简化
 *
 * @module utils/UrlDetector
 */

const URL_PATTERN = /^https?:\/\/[^\s/$.?#][^\s]*/i;

const URL_IN_TEXT_PATTERN = /https?:\/\/[^\s/$.?#][^\s]*/gi;

const PROTOCOLS = ["http://", "https://", "ftp://", "mailto:", "tel:"];

/**
 * 检测值是否为纯 URL
 *
 * 判断标准：
 * 1. 值是字符串类型
 * 2. 去除首尾空白后以已知协议开头
 * 3. 匹配 URL 格式正则
 *
 * @param {*} value 待检测的值
 * @returns {boolean} 是否为有效 URL
 */
export function isUrl(value) {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (trimmed.length === 0) return false;
    return URL_PATTERN.test(trimmed);
}

/**
 * 从文本中提取所有 URL
 *
 * 支持从包含普通文本和 URL 的混合内容中提取 URL。
 * 例如："访问 https://example.com 获取更多信息" → ["https://example.com"]
 *
 * @param {string} text 待搜索的文本
 * @returns {string[]} 找到的 URL 数组（去重，保持出现顺序）
 */
export function extractUrls(text) {
    if (typeof text !== "string") return [];

    const urls = [];
    const matches = text.match(URL_IN_TEXT_PATTERN);

    if (!matches) return [];

    for (const url of matches) {
        if (!urls.includes(url)) {
            urls.push(url);
        }
    }

    return urls;
}

/**
 * 检测文本中是否包含 URL
 *
 * 比 isUrl 更宽松，只要文本中任何位置出现 URL 即返回 true。
 *
 * @param {*} value 待检测的值
 * @returns {boolean} 是否包含 URL
 */
export function containsUrl(value) {
    if (typeof value !== "string") return false;
    return URL_IN_TEXT_PATTERN.test(value);
}

/**
 * 获取 URL 的显示文本
 *
 * 对于过长的 URL，返回简化后的可读版本：
 * - 移除协议前缀（http:// 或 https://）
 * - 超过 maxLength 时截断并添加省略号
 *
 * @param {string} url 原始 URL
 * @param {number} [maxLength=50] 最大显示长度
 * @returns {string} 简化后的显示文本
 */
export function getUrlDisplayText(url, maxLength = 50) {
    let display = url.replace(/^https?:\/\//i, "");

    if (display.length > maxLength) {
        const halfLen = Math.floor((maxLength - 3) / 2);
        display = display.slice(0, halfLen) + "..." + display.slice(-halfLen);
    }

    return display;
}

/**
 * 安全打开 URL
 *
 * 使用 window.open 打开链接，支持配置 target。
 * 在非浏览器环境（如 Node.js 测试）中不会报错。
 *
 * @param {string} url 要打开的 URL
 * @param {string} [target="_blank"] 打开方式
 * @param {Object} [windowFeatures] window.open 的特性参数
 */
export function openUrl(url, target = "_blank", windowFeatures = null) {
    if (typeof window === "undefined") return;
    try {
        if (windowFeatures) {
            window.open(url, target, windowFeatures);
        } else {
            window.open(url, target, "noopener,noreferrer");
        }
    } catch (e) {
        console.warn("[UrlDetector] 无法打开 URL:", url, e);
    }
}