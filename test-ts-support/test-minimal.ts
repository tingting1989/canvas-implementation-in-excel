import {
    Workbook,
    BasePlugin,
    AutoFillPlugin,
    FormulaEngine,
    BaseColumnType,
    EVENT_NAMES,
    HOOKS,
    CONFIG,
} from "@canvas-sheet/core";

const workbook = new Workbook(document.createElement("div"));

const sheet = workbook.createSheet("Test", { rowCount: 100, colCount: 10 });
sheet.setCellValue(0, 0, "Hello");
const value: unknown = sheet.getCellValue(0, 0);

console.log(EVENT_NAMES.CLICK, HOOKS.ON_CELL_SELECTED, CONFIG);