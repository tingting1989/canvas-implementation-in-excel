import { Workbook } from "./workbook/Workbook.js";
import { stylePool } from "./styles/index.js";
import { AutoFillPlugin } from "./plugins/AutoFillPlugin.js";
import { ContextMenuPlugin } from "./plugins/ContextMenuPlugin.js";
import { HOOKS } from "./constants/hookNames.js";

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

  Workbook.registerPlugin('autoFill', AutoFillPlugin);
  Workbook.registerPlugin('contextMenu', ContextMenuPlugin);

  wb.initRender();

  wb.loadPlugin('autoFill');
  wb.loadPlugin('contextMenu');

  wb.updateSettings({
    colHeaders: ['Name', 'Age', 'City', 'Dept', 'Salary', 'Hire Date'],
  });

  wb.render();

  window.wb = wb;

  const activeSheet = wb.getActiveSheet();
  console.log(activeSheet.name);

  wb.addHook(HOOKS.ON_CELL_CLICK, (row, col) => {
    console.log("Cell clicked: (" + row + ", " + col + ")");
  });

  console.log("Loaded plugins:", wb.pluginManager.getLoadedNames());
  console.log("App started! Tile Rendering + Plugin System ready.");
};

document.addEventListener("DOMContentLoaded", initApp);