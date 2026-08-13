/**
 * 内容类型枚举
 * @description 定义工作表中支持的特殊内容类型（非文本内容）
 * @constant
 */
export type ContentTypeValue = "image" | "chart";

export interface ContentType {
    /** 图片内容，支持在工作表中嵌入和显示图片资源 */
    readonly IMAGE: "image";
    /** 图表内容，支持在工作表中嵌入数据可视化图表对象 */
    readonly CHART: "chart";
}

export const CONTENT_TYPE: ContentType = Object.freeze({
    IMAGE: "image",
    CHART: "chart",
});
