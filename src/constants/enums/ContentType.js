/**
 * 内容类型枚举
 * @description 定义工作表中支持的特殊内容类型（非文本内容）
 * @constant {Object}
 * @property {string} IMAGE - 图片内容，支持在工作表中嵌入和显示图片资源
 * @property {string} CHART - 图表内容，支持在工作表中嵌入数据可视化图表对象
 */
export const CONTENT_TYPE = Object.freeze({
    IMAGE: "image",
    CHART: "chart",
});