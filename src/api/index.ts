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
export { Sheet } from "../workbook/Sheet";
export * from "../workbook/interfaces/index";
export * from "../model/index";
export * from "../core/ErrorHandler";
export { Hooks } from "../core/Hooks";
export { EventHandler } from "../core/EventHandler";
export * from "../types/index";
export { ReactiveStore } from "../state/ReactiveStore";
export { Scheduler } from "../state/Scheduler";
export { WebComponent } from "../core/WebComponent";
export { DOMComponent } from "../core/DOMComponent";
export { Disposable } from "../core/Disposable";

// ============================================================
// 编辑器
// ============================================================
export { EventStrategy } from "../editor/strategies/EventStrategy";
export { CellEditor } from "../editor/editors/CellEditor";
export { TextEditor } from "../editor/editors/TextEditor";
export { NumericEditor } from "../editor/editors/NumericEditor";
export { DateEditor } from "../editor/editors/DateEditor";
export { SelectEditor } from "../editor/editors/SelectEditor";
export { TextareaEditor } from "../editor/editors/TextareaEditor";
export { EditorManager } from "../editor/EditorManager";
export { ClipboardManager } from "../editor/ClipboardManager";

// ============================================================
// 插件系统
// ============================================================
export { BasePlugin } from "../plugins/base/BasePlugin";
export { BaseHidePlugin } from "../plugins/base/BaseHidePlugin";
export { BaseMovePlugin } from "../plugins/base/BaseMovePlugin";
export { PluginManager } from "../plugins/PluginManager";
export { AutoFillPlugin } from "../plugins/autoFill/AutoFillPlugin";
export { ChartPlugin } from "../plugins/chart/ChartPlugin";
export { ColumnMovePlugin } from "../plugins/columnMove/ColumnMovePlugin";
export { ContextMenuPlugin } from "../plugins/contextMenu/ContextMenuPlugin";
export { CopyPastePlugin } from "../plugins/copyPaste/CopyPastePlugin";
export { FreezePlugin } from "../plugins/freeze/FreezePlugin";
export { HiddenColumnsPlugin } from "../plugins/hiddenColumns/HiddenColumnsPlugin";
export { HiddenRowsPlugin } from "../plugins/hiddenRows/HiddenRowsPlugin";
export { RowMovePlugin } from "../plugins/rowMove/RowMovePlugin";
export { ImportFilePlugin } from "../plugins/importFile/ImportFilePlugin";
export { ExportFilePlugin } from "../plugins/exportFile/ExportFilePlugin";
export { FormulaPlugin } from "../plugins/formula/FormulaPlugin";
export { SortPlugin } from "../plugins/sort/SortPlugin";
export { FilterPlugin } from "../plugins/filter/FilterPlugin";
export { SearchPlugin } from "../plugins/search/SearchPlugin";
export { DataValidationPlugin } from "../plugins/dataValidation/DataValidationPlugin";
export { ValidationRule } from "../plugins/dataValidation/ValidationRule";
export { ValidationResult } from "../plugins/dataValidation/ValidationResult";
export { ValidationEngine } from "../plugins/dataValidation/ValidationEngine";
export { BaseValidator } from "../plugins/dataValidation/validators/BaseValidator";
export { NumberValidator } from "../plugins/dataValidation/validators/NumberValidator";
export { TextLengthValidator } from "../plugins/dataValidation/validators/TextLengthValidator";
export { ListValidator } from "../plugins/dataValidation/validators/ListValidator";
export { UniqueValidator } from "../plugins/dataValidation/validators/UniqueValidator";
export { FormulaValidator } from "../plugins/dataValidation/validators/FormulaValidator";
export { DateTimeValidator } from "../plugins/dataValidation/validators/DateTimeValidator";
export { RegexValidator } from "../plugins/dataValidation/validators/RegexValidator";
export { TimeValidator } from "../plugins/dataValidation/validators/TimeValidator";

// ============================================================
// 插件引擎
// ============================================================
export { SortEngine } from "../plugins/sort/SortEngine";
export { FilterEngine } from "../plugins/filter/FilterEngine";
export { SearchEngine } from "../plugins/search/SearchEngine";

// ============================================================
// 公式引擎
// ============================================================
export { FormulaEngine } from "../plugins/formula/FormulaEngine";
export { FormulaEvaluator } from "../plugins/formula/FormulaEvaluator";
export { parseFormula } from "../plugins/formula/FormulaParser";
export type { ASTNode, ASTLiteral, ASTCellRef, ASTRangeRef, ASTFunction, ASTUnaryOp, ASTBinaryOp } from "../plugins/formula/FormulaParser";
export { functionRegistry, FUNCTION_CATEGORY } from "../plugins/formula/functions";

// ============================================================
// 样式与主题
// ============================================================
export { StylePool, stylePool, DEFAULT_STYLE_ID } from "../model/styles/index";
export { StyleConverter, createStyleConverter, toArgb, fromArgb } from "../shared/StyleConverter";
export { BaseColumnType } from "../types/BaseColumnType";
export { ThemeManager } from "../theme/ThemeManager";
export { defaultThemeConfig, darkThemeConfig } from "../theme/config";
export { ThemeStyleProvider, themeStyleProvider } from "../theme/ThemeStyleProvider";
export { PopupManager } from "../ui/components/PopupManager";
export { PopupPanel } from "../ui/components/PopupPanel";

// ============================================================
// 渲染
// ============================================================
export { BaseLayer } from "../render/BaseLayer";
export { ViewportTransform } from "../render/ViewportTransform";
export { LayerCompositor } from "../render/LayerCompositor";
export { TileLayer } from "../render/layers/TileLayer";
export { SelectionLayer } from "../render/layers/SelectionLayer";
export { FrozenLayer } from "../render/layers/FrozenLayer";
export { InteractionLayer } from "../render/layers/InteractionLayer";
export { HeaderLayer } from "../render/layers/HeaderLayer";

// ============================================================
// 图表系统
// ============================================================
export { ChartModel } from "../plugins/chart/ChartModel";
export { ChartManager } from "../plugins/chart/ChartManager";
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
// UI
// ============================================================
export { ScrollManager } from "../ui/ScrollManager";

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
export * from "../constants/errorCodes";
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
