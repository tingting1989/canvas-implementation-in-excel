import { PluginManager } from "./PluginManager.js";
import { AutoFillPlugin } from "./AutoFillPlugin.js";
import { ContextMenuPlugin } from "./ContextMenuPlugin.js";
import { ColumnMovePlugin } from "./ColumnMovePlugin.js";
import { CopyPastePlugin } from "./CopyPastePlugin.js";
import { ExportFilePlugin } from "./ExportFilePlugin.js";
import { PaginationPlugin } from "./PaginationPlugin.js";
import { HiddenColumnsPlugin } from "./HiddenColumnsPlugin.js";
import { HiddenRowsPlugin } from "./HiddenRowsPlugin.js";
import { RowMovePlugin } from "./RowMovePlugin.js";
import { FreezePlugin } from "./FreezePlugin.js";
import { FormulaPlugin } from "./FormulaPlugin.js";
import { SortPlugin } from "./SortPlugin.js";
import { DataValidationPlugin } from "./data-validation/DataValidationPlugin.js";

const builtinPlugins = [
    ["autoFill", AutoFillPlugin],
    ["contextMenu", ContextMenuPlugin],
    ["columnMove", ColumnMovePlugin],
    ["copyPaste", CopyPastePlugin],
    ["exportFile", ExportFilePlugin],
    ["pagination", PaginationPlugin],
    ["hiddenColumns", HiddenColumnsPlugin],
    ["hiddenRows", HiddenRowsPlugin],
    ["rowMove", RowMovePlugin],
    ["freeze", FreezePlugin],
    ["formula", FormulaPlugin],
    ["sort", SortPlugin],
    ["dataValidation", DataValidationPlugin],
];

export function registerBuiltinPlugins() {
    for (const [name, PluginClass] of builtinPlugins) {
        if (!PluginManager.getRegisteredNames().includes(name)) {
            PluginManager.register(name, PluginClass);
        }
    }
}

registerBuiltinPlugins();
