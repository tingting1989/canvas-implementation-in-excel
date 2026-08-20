import { PluginManager } from "./PluginManager.js";
import { AutoFillPlugin } from "./autoFill/AutoFillPlugin.js";
import { ContextMenuPlugin } from "./contextMenu/ContextMenuPlugin.js";
import { ColumnMovePlugin } from "./columnMove/ColumnMovePlugin.js";
import { CopyPastePlugin } from "./copyPaste/CopyPastePlugin.js";
import { ExportFilePlugin } from "./exportFile/ExportFilePlugin.js";
import { ImportFilePlugin } from "./importFile/ImportFilePlugin.js";
import { HiddenColumnsPlugin } from "./hiddenColumns/HiddenColumnsPlugin.js";
import { HiddenRowsPlugin } from "./hiddenRows/HiddenRowsPlugin.js";
import { RowMovePlugin } from "./rowMove/RowMovePlugin.js";
import { FreezePlugin } from "./freeze/FreezePlugin.js";
import { FormulaPlugin } from "./formula/FormulaPlugin.js";
import { SortPlugin } from "./sort/SortPlugin.js";
import { DataValidationPlugin } from "./dataValidation/DataValidationPlugin.js";
import { ChartPlugin } from "./chart/ChartPlugin.js";
import { FilterPlugin } from "./filter/FilterPlugin.js";
import { SearchPlugin } from "./search/SearchPlugin.js";

const builtinPlugins: [string, typeof BasePlugin][] = [
    ["autoFill", AutoFillPlugin],
    ["contextMenu", ContextMenuPlugin],
    ["columnMove", ColumnMovePlugin],
    ["copyPaste", CopyPastePlugin],
    ["exportFile", ExportFilePlugin],
    ["importFile", ImportFilePlugin],
    ["hiddenColumns", HiddenColumnsPlugin],
    ["hiddenRows", HiddenRowsPlugin],
    ["rowMove", RowMovePlugin],
    ["freeze", FreezePlugin],
    ["formula", FormulaPlugin],
    ["sort", SortPlugin],
    ["dataValidation", DataValidationPlugin],
    ["chart", ChartPlugin],
    ["filter", FilterPlugin],
    ["search", SearchPlugin],
];

import { BasePlugin } from "./base/BasePlugin.js";

export function registerBuiltinPlugins(): void {
    for (const [name, PluginClass] of builtinPlugins) {
        if (!PluginManager.getRegisteredNames().includes(name)) {
            PluginManager.register(name, PluginClass);
        }
    }
}

registerBuiltinPlugins();
