/**
 * 内置单元格渲染器类型注册表（Built-in Cell Renderer Type Registry）
 *
 * 本模块是 Canvas Spreadsheet 的可视化渲染引擎核心组件，负责管理和导出所有内置的
 * 单元格渲染器类型。每个渲染器类型都是 BaseColumnType 的子类，实现了特定的
 * 数据可视化逻辑，将原始数据转换为用户友好的图形化展示。
 *
 * @module types/renderers/index
 * @see BaseColumnType 基础类型类
 * @see types/index 类型系统主入口
 */

import { CheckboxColumnType } from "./CheckboxColumnType.js";
import { ProgressBarType } from "./ProgressBarType.js";
import { StarRatingType } from "./StarRatingType.js";
import { SparklineType } from "./SparklineType.js";
import { ColorPreviewType } from "./ColorPreviewType.js";
import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";

export { CheckboxColumnType };
export { ProgressBarType };
export { StarRatingType };
export { SparklineType };
export { ColorPreviewType };

export const BUILTIN_RENDERER_TYPE_REGISTRY: Readonly<Record<string, typeof BaseColumnType>> = Object.freeze({
    checkbox: CheckboxColumnType,
    progressBar: ProgressBarType,
    starRating: StarRatingType,
    sparkline: SparklineType,
    colorPreview: ColorPreviewType,
});

import { BaseColumnType } from "../BaseColumnType.js";

export function getBuiltinRendererType(rendererName: string): typeof BaseColumnType | undefined {
    if (typeof rendererName !== "string" || !rendererName.trim()) {
        return undefined;
    }

    return BUILTIN_RENDERER_TYPE_REGISTRY[rendererName] ?? undefined;
}

export function isBuiltinRendererType(rendererName: string): boolean {
    if (typeof rendererName !== "string" || !rendererName.trim()) {
        return false;
    }

    return rendererName in BUILTIN_RENDERER_TYPE_REGISTRY;
}

export function getAllBuiltinRendererNames(): string[] {
    return Object.keys(BUILTIN_RENDERER_TYPE_REGISTRY);
}

errorHandler.debug(ERROR_CODE.DEBUG_LOG, "[Renderers] ✅ 内置渲染器类型注册表初始化完成");
errorHandler.debug(ERROR_CODE.DEBUG_LOG, `  可用渲染器 (${getAllBuiltinRendererNames().length}):`, { names: getAllBuiltinRendererNames() });
