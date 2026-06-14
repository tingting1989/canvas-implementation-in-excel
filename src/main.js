import { Workbook } from "./workbook/Workbook.js";
import { stylePool } from "./styles/index.js";
import { AutoFillPlugin } from "./plugins/AutoFillPlugin.js";
import { ContextMenuPlugin } from "./plugins/ContextMenuPlugin.js";
import { ColumnHeaderPlugin } from "./plugins/ColumnHeaderPlugin.js";
import { ColumnWidthPlugin } from "./plugins/ColumnWidthPlugin.js";
import { NestedHeadersPlugin } from "./plugins/NestedHeadersPlugin.js";
import { CollapsibleColumnsPlugin } from "./plugins/CollapsibleColumnsPlugin.js";
import { ColumnMenuPlugin } from "./plugins/ColumnMenuPlugin.js";
import { ColumnMovePlugin } from "./plugins/ColumnMovePlugin.js";
import { ColumnSortPlugin } from "./plugins/ColumnSortPlugin.js";
import { ColumnFilterPlugin } from "./plugins/ColumnFilterPlugin.js";
import { ColumnSummaryPlugin } from "./plugins/ColumnSummaryPlugin.js";
import { ColumnHidingPlugin } from "./plugins/ColumnHidingPlugin.js";
import { ColumnFreezePlugin } from "./plugins/ColumnFreezePlugin.js";
import { HOOKS } from "./editor/hookNames.js";

const initApp = () => {
  console.log("Initializing Canvas Spreadsheet (Tile Rendering + Plugin System)...");

  const wb = new Workbook();

  const s1 = wb.addSheet("Sheet1");

  s1.rowColManager.ensureSize(100, 26);

  s1.setCell(0, 0, "Name", stylePool.getStyleId({ fontWeight: "bold", color: "#d00" }));
  s1.setCell(0, 1, "Age");
  s1.setCell(0, 2, "City", stylePool.getStyleId({ fontWeight: "bold", color: "#217346" }));
  s1.setCell(0, 3, "Dept");
  s1.setCell(0, 4, "Salary");
  s1.setCell(0, 5, "Hire Date");

  s1.setCell(1, 0, "Zhang San");
  s1.setCell(1, 1, 25);
  s1.setCell(1, 2, "Beijing");
  s1.setCell(1, 3, "Tech");
  s1.setCell(1, 4, 15000);
  s1.setCell(1, 5, "2020-03-15");

  s1.setCell(2, 0, "Li Si");
  s1.setCell(2, 1, 30);
  s1.setCell(2, 2, "Shanghai");
  s1.setCell(2, 3, "Marketing");
  s1.setCell(2, 4, 18000);
  s1.setCell(2, 5, "2019-07-01");

  s1.setCell(3, 0, "Wang Wu");
  s1.setCell(3, 1, 28);
  s1.setCell(3, 2, "Guangzhou");
  s1.setCell(3, 3, "Tech");
  s1.setCell(3, 4, 16000);
  s1.setCell(3, 5, "2021-01-10");

  s1.addConditionalRule(
    { sr: 0, sc: 0, er: 10000000, ec: 25 },
    (v) => typeof v === "number" && v > 25,
    stylePool.getStyleId({ backgroundColor: "#ffcccc" })
  );

  s1.setRowStyle(0, stylePool.getStyleId({ backgroundColor: "#e8f4fd" }));
  s1.setColStyle(0, stylePool.getStyleId({ textAlign: "center", fontWeight: "bold" }));

  const s2 = wb.addSheet("Sheet2");
  s2.rowColManager.ensureSize(50, 26);
  s2.setCell(0, 0, "Sheet2 Data");
  s2.setCell(0, 1, 123);
  s2.setCell(2, 0, "Switch to Sheet1 to paste");

  /* Register plugins globally */
  Workbook.registerPlugin('autoFill', AutoFillPlugin);
  Workbook.registerPlugin('contextMenu', ContextMenuPlugin);
  Workbook.registerPlugin('columnHeader', ColumnHeaderPlugin);
  Workbook.registerPlugin('columnWidth', ColumnWidthPlugin);
  Workbook.registerPlugin('nestedHeaders', NestedHeadersPlugin);
  Workbook.registerPlugin('collapsibleColumns', CollapsibleColumnsPlugin);
  Workbook.registerPlugin('columnMenu', ColumnMenuPlugin);
  Workbook.registerPlugin('columnMove', ColumnMovePlugin);
  Workbook.registerPlugin('columnSort', ColumnSortPlugin);
  Workbook.registerPlugin('columnFilter', ColumnFilterPlugin);
  Workbook.registerPlugin('columnSummary', ColumnSummaryPlugin);
  Workbook.registerPlugin('columnHiding', ColumnHidingPlugin);
  Workbook.registerPlugin('columnFreeze', ColumnFreezePlugin);

  /* Initialize rendering */
  wb.initRender();

  /* Load base plugins */
  wb.loadPlugin('autoFill');
  wb.loadPlugin('contextMenu');

  /* Load Columns series plugins */
  wb.loadPlugin('columnHeader', {
    labels: ["Name", "Age", "City", "Dept", "Salary", "Hire Date"]
  });

  wb.loadPlugin('columnWidth', {
    widths: [80, 60, 80, 100, 80, 100]
  });

  wb.loadPlugin('columnSort');
  wb.loadPlugin('columnMenu');
  wb.loadPlugin('columnMove');
  wb.loadPlugin('columnFilter');
  wb.loadPlugin('columnHiding');
  wb.loadPlugin('columnFreeze', { fixedColumnsStart: 1 });

  wb.loadPlugin('columnSummary', {
    summaries: [
      { col: 1, type: "average", resultRow: 50, label: "Avg" },
      { col: 4, type: "sum", resultRow: 50, label: "Total" },
    ]
  });

  /* Load NestedHeaders plugin */
  wb.loadPlugin('nestedHeaders', {
    headers: [
      [
        { label: "Basic Info", colspan: 3 },
        { label: "Work Info", colspan: 3 }
      ],
      ["Name", "Age", "City", "Dept", "Salary", "Hire Date"]
    ]
  });

  /* Load CollapsibleColumns plugin */
  wb.loadPlugin('collapsibleColumns', {
    collapsible: true
  });

  wb.render();

  window.wb = wb;

  const activeSheet = wb.getActiveSheet();
  console.log(activeSheet.name);

  wb.addHook(HOOKS.ON_CELL_CLICK, (row, col) => {
    console.log("Cell clicked: (" + row + ", " + col + ")");
  });

  console.log("Loaded plugins:", wb.pluginManager.getLoadedNames());
  console.log("App started! Tile Rendering + Plugin System + Columns ready.");
};

document.addEventListener("DOMContentLoaded", initApp);
