import {Workbook} from "./workbook/Workbook.js";
import {stylePool} from "./styles/index.js";
import {AutoFillPlugin} from "./plugins/AutoFillPlugin.js";
import {ContextMenuPlugin} from "./plugins/ContextMenuPlugin.js";
import {ColumnMovePlugin} from "./plugins/ColumnMovePlugin.js";
import {ExportFilePlugin} from "./plugins/ExportFilePlugin.js";
import {PaginationPlugin} from "./plugins/PaginationPlugin.js";
import {HOOKS} from "./constants/hookNames.js";

const initApp = () => {
    console.log("Initializing Canvas Spreadsheet (Tile Rendering + Plugin System)...");

    Workbook.registerPlugin('autoFill', AutoFillPlugin);
    Workbook.registerPlugin('contextMenu', ContextMenuPlugin);
    Workbook.registerPlugin('columnMove', ColumnMovePlugin);
    Workbook.registerPlugin('exportFile', ExportFilePlugin);
    Workbook.registerPlugin('pagination', PaginationPlugin);

    const wb = new Workbook('grid', {
        data: [
            ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
            ["Zhang San", 25, "Beijing", "Tech", 15000, "2020-03-15"],
            ["Li Si", 30, "Shanghai", "Marketing", 18000, "2019-07-01"],
            ["Wang Wu", 28, "Guangzhou", "Tech", 16000, "2021-01-10"],
        ],
        colHeaders: ['Name', 'Age', 'City', 'Dept', 'Salary', 'Hire Date'],
        rowHeaders: true,
        colWidths: [120, 80, 100, 100, 100, 100],
        startRows: 100,
        startCols: 26,
        plugins: ['autoFill', 'contextMenu', 'columnMove', 'exportFile', 'pagination'],
        pagination: { pageSize: 50 },
        conditionalStyles: [
            {
                range: {sr: 0, sc: 0, er: 10000000, ec: 25},
                condition: (v) => typeof v === "number" && v > 25,
                style: {backgroundColor: "#ffcccc"},
            },
        ],
        hooks: {
            [HOOKS.ON_CELL_CLICK]: (row, col) => {
                console.log("Cell clicked: (" + row + ", " + col + ")");
            },
        },
        afterInit(wb) {
            console.log('afterInit')
            const sheet = wb.getActiveSheet();
            sheet.setRowStyle(0, stylePool.getStyleId({backgroundColor: "#e8f4fd"}));
            sheet.setColStyle(0, stylePool.getStyleId({textAlign: "center", fontWeight: "bold"}));

            const s2 = wb.addSheet("Sheet2");
            s2.setCell(0, 0, "Sheet2 Data");
            s2.setCell(0, 1, 123);
            s2.setCell(2, 0, "Switch to Sheet1 to paste");
        },
    });

    wb.initRender();
    wb.render();
// 监听列移动前，返回 false 可阻止
    wb.addHook(HOOKS.BEFORE_COLUMN_MOVE, (sourceCol, targetCol) => {
        console.log(`即将移动列 ${sourceCol} → ${targetCol}`);
        // return false; // 取消移动
    });

// 监听列移动后
    wb.addHook(HOOKS.AFTER_COLUMN_MOVE, (sourceCol, targetCol) => {
        console.log(`列移动完成 ${sourceCol} → ${targetCol}`);
    });
    window.wb = wb;

    console.log(wb.getActiveSheet().name);
    console.log("Loaded plugins:", wb.pluginManager.getLoadedNames());
    console.log("App started! Tile Rendering + Plugin System ready.");
};

document.addEventListener("DOMContentLoaded", initApp);