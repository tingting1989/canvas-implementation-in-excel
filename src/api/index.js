/**
 * @license Apache-2.0
 *
 * Copyright 2026 jiangsuiting <1158973435@qq.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// ============================================================
// 核心
// ============================================================
export { Workbook } from "../workbook/Workbook";
export * from "../model/index";
export * from "../core/ErrorHandler";
export * from "../types/index";
export { ReactiveStore } from "../state/ReactiveStore";
export { WebComponent } from "../core/WebComponent";
export { DOMComponent } from "../core/DOMComponent";
export { Disposable } from "../core/Disposable";

// ============================================================
// 编辑器
// ============================================================
export { EventStrategy } from "../editor/strategies/EventStrategy";
export { CellEditor } from "../editor/editors/CellEditor";

// ============================================================
// 插件系统
// ============================================================
export { BasePlugin } from "../plugins/BasePlugin";
export { PluginManager } from "../plugins/PluginManager";
export { AutoFillPlugin } from "../plugins/AutoFillPlugin";
export { ChartPlugin } from "../plugins/ChartPlugin";
export { ColumnMovePlugin } from "../plugins/ColumnMovePlugin";
export { ContextMenuPlugin } from "../plugins/ContextMenuPlugin";
export { CopyPastePlugin } from "../plugins/CopyPastePlugin";
export { FreezePlugin } from "../plugins/FreezePlugin";
export { HiddenColumnsPlugin } from "../plugins/HiddenColumnsPlugin";
export { HiddenRowsPlugin } from "../plugins/HiddenRowsPlugin";
export { RowMovePlugin } from "../plugins/RowMovePlugin";
export { ImportFilePlugin } from "../plugins/ImportFilePlugin";
export { ExportFilePlugin } from "../plugins/ExportFilePlugin";
export { FormulaPlugin } from "../plugins/FormulaPlugin";
export { SortPlugin } from "../plugins/sort/SortPlugin";
export { FilterPlugin } from "../plugins/filter/FilterPlugin";
export { SearchPlugin } from "../plugins/search/SearchPlugin";
export { DataValidationPlugin } from "../plugins/data-validation/DataValidationPlugin";
export { ValidationRule } from "../plugins/data-validation/ValidationRule";
export { ValidationResult } from "../plugins/data-validation/ValidationResult";
export { ValidationEngine } from "../plugins/data-validation/ValidationEngine";
export { BaseValidator } from "../plugins/data-validation/validators/BaseValidator";
export { NumberValidator } from "../plugins/data-validation/validators/NumberValidator";
export { TextLengthValidator } from "../plugins/data-validation/validators/TextLengthValidator";
export { ListValidator } from "../plugins/data-validation/validators/ListValidator";
export { UniqueValidator } from "../plugins/data-validation/validators/UniqueValidator";
export { FormulaValidator } from "../plugins/data-validation/validators/FormulaValidator";
export { DateTimeValidator } from "../plugins/data-validation/validators/DateTimeValidator";
export { RegexValidator } from "../plugins/data-validation/validators/RegexValidator";

// ============================================================
// 公式引擎
// ============================================================
export { FormulaEngine } from "../formula/FormulaEngine";
export { FormulaEvaluator } from "../formula/FormulaEvaluator";
export { functionRegistry, FUNCTION_CATEGORY } from "../formula/functions/index";

// ============================================================
// 类型系统
// ============================================================
export { BaseColumnType } from "../types/BaseColumnType";
export { themeStyleProvider } from "../theme/ThemeStyleProvider";
export { PopupManager } from "../ui/components/PopupManager";
export { PopupPanel } from "../ui/components/PopupPanel";

// ============================================================
// 渲染
// ============================================================
export { BaseLayer } from "../render/BaseLayer";
export { ViewportTransform } from "../render/ViewportTransform";

// ============================================================
// 图表系统
// ============================================================
export { ChartModel } from "../model/chart/ChartModel";
export { ChartManager } from "../model/chart/ChartManager";
export { ChartRendererFactory } from "../render/chart/ChartRendererFactory";
export { NativeChartRenderer } from "../render/chart/NativeChartRenderer";
export { IChartRenderer } from "../render/chart/IChartRenderer";
export { BaseChartStrategy } from "../render/chart/BaseChartStrategy";
export { DataExtractor } from "../render/chart/DataExtractor";
export { ChartCacheManager } from "../render/chart/ChartCacheManager";
export { ChartCache } from "../render/chart/ChartCache";
export * from "../render/chart/types";
export * from "../render/chart/strategies/index";

// ============================================================
// 常量与枚举
// ============================================================
export * from "../constants/enums/AutoFillDir";
export * from "../constants/enums/BorderStyle";
export * from "../constants/enums/ChartType";
export * from "../constants/enums/ContentType";
export * from "../constants/enums/ErrorStyle";
export * from "../constants/enums/FontStyle";
export * from "../constants/enums/ScrollAxis";
export * from "../constants/enums/SortArrowDir";
export * from "../constants/enums/SortOrder";
export * from "../constants/enums/StyleScope";
export * from "../constants/enums/TextAlign";
export * from "../constants/enums/ValidationRuleType";
export * from "../constants/enums/VerticalAlign";
export * from "../constants/eventNames";
export * from "../constants/hookNames";
export * from "../constants/sheetEvents";
export * from "../constants/config";
export * from "../constants/hitType";
export * from "../constants/layerZIndex";

// ============================================================
// 工具
// ============================================================
export * from "../utils/index";
