/**
 * 内置渲染器导出
 *
 * @module types/renderers/index
 */

import { BooleanCheckboxType } from "./BooleanCheckboxType.js";
import { ProgressBarType } from "./ProgressBarType.js";
import { StarRatingType } from "./StarRatingType.js";
import { SparklineType } from "./SparklineType.js";
import { ColorPreviewType } from "./ColorPreviewType.js";

// 重新导出（供外部使用）
export { BooleanCheckboxType, ProgressBarType, StarRatingType, SparklineType, ColorPreviewType };

// 渲染器名称映射（用于自动注册）
export const BUILTIN_RENDERERS = {
    checkbox: BooleanCheckboxType,
    progressBar: ProgressBarType,
    starRating: StarRatingType,
    sparkline: SparklineType,
    colorPreview: ColorPreviewType,
};
