import { Workbook } from "./workbook/Workbook.js";
import { stylePool } from "./styles/index.js";
import { AutoFillPlugin } from "./plugins/AutoFillPlugin.js";
import { ContextMenuPlugin } from "./plugins/ContextMenuPlugin.js";
import { ColumnMovePlugin } from "./plugins/ColumnMovePlugin.js";
import { CopyPastePlugin } from "./plugins/CopyPastePlugin.js";
import { ExportFilePlugin } from "./plugins/ExportFilePlugin.js";
import { PaginationPlugin } from "./plugins/PaginationPlugin.js";
import { HiddenColumnsPlugin } from "./plugins/HiddenColumnsPlugin.js";
import { HiddenRowsPlugin } from "./plugins/HiddenRowsPlugin.js";
import { RowMovePlugin } from "./plugins/RowMovePlugin.js";
import { FreezePlugin } from "./plugins/FreezePlugin.js";
import { HOOKS } from "./constants/hookNames.js";
import { isFunction, isNumber } from "lodash-es";

const initApp = () => {
    console.log("Initializing Canvas Spreadsheet (Tile Rendering + Plugin System)...");

    Workbook.registerPlugin("autoFill", AutoFillPlugin);
    Workbook.registerPlugin("contextMenu", ContextMenuPlugin);
    Workbook.registerPlugin("columnMove", ColumnMovePlugin);
    Workbook.registerPlugin("copyPaste", CopyPastePlugin);
    Workbook.registerPlugin("exportFile", ExportFilePlugin);
    Workbook.registerPlugin("pagination", PaginationPlugin);
    Workbook.registerPlugin("hiddenColumns", HiddenColumnsPlugin);
    Workbook.registerPlugin("hiddenRows", HiddenRowsPlugin);
    Workbook.registerPlugin("rowMove", RowMovePlugin);
    Workbook.registerPlugin("freeze", FreezePlugin);

    const wb = new Workbook("grid", {
        data: [
            ["Zhang San", 25, "Beijing", "Tech", 15000, "2020-03-15"],
            ["Li Si", 30, "Shanghai", "Marketing", 18000, "2019-07-01"],
            ["Wang Wu", 28, "Guangzhou", "Tech", 16000, "2021-01-10"],
        ],
        colHeaders: ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
        // 配置 rowHeader 宽度
        rowHeaderWidth: 120,
        rowHeights: [30, 50, 90],
        rowHeaders: ["姓名", "年龄", "城市", "部门", "薪酬", "入职日期"],
        // 嵌套表头示例（参考 Handsontable nestedHeaders API）
        // nestedHeaders: [
        //     [
        //         { label: "基本信息", colspan: 2 },
        //         { label: "工作信息", colspan: 4 },
        //     ],
        //     ["姓名", "年龄", "城市", "部门", { label: "薪酬", colspan: 2 }],
        //     ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
        // ],
        textOverflowEllipsis: false,
        cellPadding: 10,
        // width: 400,
        // height: 300,
        startRows: 100,
        startCols: 26,
        // plugins: ['autoFill', 'contextMenu', 'columnMove', 'exportFile', 'pagination', 'hiddenColumns', 'rowMove'],
        // 声明要加载： 声明当前实例需要哪些插件， 这是典型的注册-加载分离模式：
        plugins: [
            "autoFill",
            "contextMenu",
            "columnMove",
            "copyPaste",
            "pagination",
            "exportFile",
            "hiddenColumns",
            "hiddenRows",
            "rowMove",
            "freeze",
        ],
        pluginOptions: {
            //  pagination: { pageSize: 50 },
            // hiddenColumns: { columns: [2] },
            contextMenu: {
                enabled: true,
                customItems: [
                    {
                        label: "高亮选中行",
                        // 自定义项 contexts 属性：自定义菜单项可指定在哪些上下文中显示，不指定则默认 ["cell"]
                        contexts: ["cell", "rowHeader"],
                        action: (row, col, sheet) => {
                            sheet.setRowStyle(row, stylePool.getStyleId({ backgroundColor: "yellow" }));
                            wb.render();
                        },
                    },
                    {
                        label: "设置单元格样式",
                        contexts: ["cell"],
                        action: (row, col, sheet) => {
                            const range = sheet.selection.getRange();
                            const styleObj = { backgroundColor: "#d4edda", fontWeight: "bold", color: "#155724" };
                            for (let r = range.topRow; r <= range.bottomRow; r++) {
                                for (let c = range.topCol; c <= range.bottomCol; c++) {
                                    if (!sheet.isDisabled(r, c)) {
                                        sheet.setCellStyle(r, c, styleObj);
                                    }
                                }
                            }
                            wb.render();
                        },
                    },
                    {
                        label: "取消单元格样式",
                        contexts: ["cell", "rowHeader", "colHeader"],
                        action: (row, col, sheet) => {
                            console.log("Clear cell style");
                            const range = sheet.selection.getRange();
                            for (let r = range.topRow; r <= range.bottomRow; r++) {
                                sheet.clearRowStyle(r);
                                for (let c = range.topCol; c <= range.bottomCol; c++) {
                                    sheet.clearCellStyle(r, c);
                                }
                            }
                            wb.render();
                        },
                    },
                    { type: "separator" },
                    {
                        label: "导出选中区域",
                        action: (row, col, sheet) => {
                            console.log("Export from", row, col);
                            alert("导出功能（示例）");
                        },
                    },
                ],
                // disabledItems: ["mergeCells", "unmergeCells"],
            },
            // rowMove: { enabled: false }
            freeze: { fixedRowsTop: 1, fixedColumnsStart: 1 },
        },
        conditionalStyles: [
            {
                range: { sr: 0, sc: 0, er: 10000000, ec: 25 },
                condition: (v) => isNumber(v) && v > 25,
                style: { backgroundColor: "#ffcccc" },
            },
        ],
        cell: [
            { row: 0, col: 0, style: { backgroundColor: "#e8f4fd", fontWeight: "bold", textAlign: "center" } },
            { row: 1, col: 3, disabled: true },
            { row: 2, col: 4, readOnly: true, style: { backgroundColor: "#fff3cd" } },
        ],
        cells: (row, col) => {
            if (row === 0) {
                return { style: { fontWeight: "bold", backgroundColor: "#e8f4fd" } };
            }
            if (col === 0 && row > 0) {
                return { style: { textAlign: "right", fontWeight: "bold" } };
            }
        },
        columns: [
            { type: "text", width: 120, style: { textAlign: "left" } },
            { type: "numeric", width: 80, style: { textAlign: "right" }, numericFormat: { pattern: "0" } },
            { type: "text", width: 100 },
            { type: "text", width: 100 },
            { type: "numeric", width: 100, style: { textAlign: "right" }, numericFormat: { pattern: "$0,0.00" } },
            { type: "date", width: 300 },
        ],
        // 统一默认样式 — 所有单元格的基础字体
        defaultStyle: {
            fontSize: 14,
            fontFamily: "Microsoft YaHei",
            color: "#000",
        },
        hooks: {
            [HOOKS.ON_CELL_CLICK]: (row, col) => {
                console.log("Cell clicked: (" + row + ", " + col + ")");
                if (isFunction(updateToolbarStyleState)) {
                    updateToolbarStyleState();
                }
            },
        },
        afterInit(wb) {
            console.log("afterInit");
            const sheet = wb.getActiveSheet();

            const s2 = wb.addSheet("Sheet2");
            s2.setCell(0, 0, "Sheet2 Data");
            s2.setCell(0, 1, 123);
            s2.setCell(2, 0, "Switch to Sheet1 to paste");
        },
    });

    wb.initRender();
    wb.render();

    wb.addHook(HOOKS.AFTER_CHANGE, () => {
        if (isFunction(window.updateToolbarStyleState)) {
            window.updateToolbarStyleState();
        }
    });

    wb.addHook(HOOKS.BEFORE_COLUMN_MOVE, (sourceCol, targetCol) => {
        console.log(`即将移动列 ${sourceCol} → ${targetCol}`);
    });

    wb.addHook(HOOKS.AFTER_COLUMN_MOVE, (sourceCol, targetCol) => {
        console.log(`列移动完成 ${sourceCol} → ${targetCol}`);
    });
    window.wb = wb;

    console.log(wb.getActiveSheet().name);
    console.log("Loaded plugins:", wb.pluginManager.getLoadedNames());
    console.log("App started! Tile Rendering + Plugin System ready.");
};

document.addEventListener("DOMContentLoaded", initApp);