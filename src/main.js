import { Workbook } from "./workbook/Workbook.js";
import { stylePool } from "./model/styles";
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
import { FormulaPlugin } from "./plugins/FormulaPlugin.js";
import { HOOKS } from "./constants/hookNames.js";
import { isFunction, isNumber } from "./utils/utils.js";
import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "./core/ErrorHandler.js";
import { SortPlugin, DataValidationPlugin } from "@/plugins";

const initApp = () => {
    errorHandler.debug(ERROR_CODE.DEBUG_LOG, "Initializing Canvas Spreadsheet (Tile Rendering + Plugin System)...");

    // 配置统一错误处理：开发模式输出所有级别日志
    errorHandler.configure({
        level: ERROR_LEVEL.DEBUG,
        devMode: true,
    });

    Workbook.registerPlugin("autoFill", AutoFillPlugin);
    Workbook.registerPlugin("contextMenu", ContextMenuPlugin);
    Workbook.registerPlugin("columnMove", ColumnMovePlugin);
    Workbook.registerPlugin("copyPaste", CopyPastePlugin);
    Workbook.registerPlugin("exportFile", ExportFilePlugin);

    // Workbook.registerPlugin("pagination", PaginationPlugin);
    Workbook.registerPlugin("hiddenColumns", HiddenColumnsPlugin);
    Workbook.registerPlugin("hiddenRows", HiddenRowsPlugin);
    Workbook.registerPlugin("rowMove", RowMovePlugin);
    Workbook.registerPlugin("freeze", FreezePlugin);
    Workbook.registerPlugin("formula", FormulaPlugin);
    Workbook.registerPlugin("sort", SortPlugin);
    Workbook.registerPlugin("dataValidation", DataValidationPlugin);

    const wb = new Workbook("grid", {
        // 工作表高度和宽度（像素值）
        // height: 600,
        // 工作表高度和宽度（像素值）
        // width: 800,

        // 初始行数
        // startRows: 10,
        // 初始列数
        // startCols: 10,
        sheets: [
            {
                // 工作表名称
                name: "Sheet1",

                // 是否只读
                readOnly: false,
                // 初始数据
                // data: [
                //     ["Zhang San", 25, "Beijing", "Tech", 15000, "2020-03-15"],
                //     ["Li Si", 30, "Shanghai", "Marketing", 18000, "2019-07-01"],
                //     ["Wang Wu", 28, "Guangzhou", "Tech", 16000, "2021-01-10"],
                // ],
                // 列表头配置，用于替换默认的行号表头 A,B,C...
                // colHeaders: ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
                // 行表头宽度配置
                rowHeaderWidth: 120,

                // 行高配置
                rowHeights: [30, 50, 90],

                // 行表头配置，用于替换默认的行号表头 1,2,3...
                rowHeaders: ["姓名", "年龄", "城市", "部门", "薪酬", "入职日期"],

                // 嵌套表头配置
                nestedHeaders: [
                    [
                        { label: "基本信息", colspan: 2 },
                        { label: "工作信息", colspan: 4 },
                    ],
                    ["姓名", "年龄", "城市", "部门", { label: "薪酬", colspan: 2 }],
                    ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
                ],

                // 单元格内容超出单元格宽度时是否显示省略号
                textOverflowEllipsis: false,
                // 每个单元格的内边距（像素值）
                cellPadding: 10,
                // 固定行列数上限（使用 maxRows/maxCols）
                // maxRows: 20,
                // maxCols: 12,
                conditionalStyles: [
                    {
                        range: { sr: 0, sc: 0, er: 10000000, ec: 25 },
                        condition: (v) => isNumber(v) && v > 25,
                        style: { backgroundColor: "#ffcccc" },
                    },
                ],

                // 单元格样式配置
                cell: [
                    { row: 0, col: 0, style: { backgroundColor: "#e8f4fd", fontWeight: "bold", textAlign: "center" } },
                    { row: 1, col: 3, disabled: true },
                    { row: 2, col: 4, readOnly: true, style: { backgroundColor: "#fff3cd" } },
                ],

                // 单元格样式配置函数
                cells: (row, col) => {
                    if (row === 0) {
                        return { style: { fontWeight: "bold", backgroundColor: "#e8f4fd" } };
                    }
                    if (col === 0 && row > 0) {
                        return { style: { textAlign: "right", fontWeight: "bold" } };
                    }
                },

                // 列配置
                columns: [
                    { type: "text", width: 120, style: { textAlign: "left" } },
                    { type: "numeric",  style: { textAlign: "right" }, numericFormat: { pattern: "0" } },
                    { type: "text",},
                    { type: "text",  },
                    { type: "numeric", style: { textAlign: "right" }, numericFormat: { pattern: "$0,0.00" } },
                    { type: "date",  },
                ],
                // 配置列的宽度 number|number[],优先级比columns中的width 低
                colWidths: 200,

                // colWidths: [120, 80, 100, 100, 100, 300],

                // 默认单元格样式
                defaultStyle: {
                    fontSize: 14,
                    fontFamily: "Microsoft YaHei",
                    color: "#000",
                },
            },
            {
                name: "Sheet2",
                readOnly: false,
                data: [
                    ["Zhang San", 25, "Beijing", "Tech", 15000, "2020-03-15"],
                    ["Li Si", 30, "Shanghai", "Marketing", 18000, "2019-07-01"],
                    ["Wang Wu", 28, "Guangzhou", "Tech", 16000, "2021-01-10"],
                ],
                colHeaders: ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
                rowHeaderWidth: 120,
                rowHeights: [30, 50, 90],
                rowHeaders: ["姓名", "年龄", "城市", "部门", "薪酬", "入职日期"],
                nestedHeaders: [
                    [
                        { label: "基本信息", colspan: 2 },
                        { label: "工作信息", colspan: 4 },
                    ],
                    ["姓名", "年龄", "城市", "部门", { label: "薪酬", colspan: 2 }],
                    ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
                ],
                textOverflowEllipsis: false,
                cellPadding: 10,
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
                defaultStyle: {
                    fontSize: 14,
                    fontFamily: "Microsoft YaHei",
                    color: "#000",
                },
            },
        ],
        plugins: [
            "autoFill",
            "contextMenu",
            "columnMove",
            "copyPaste",

            // "pagination",
            "exportFile",
            "hiddenColumns",
            "hiddenRows",
            "rowMove",
            "freeze",
            "formula",
            "sort",
        ],
        pluginOptions: {
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
                            errorHandler.debug(ERROR_CODE.DEBUG_LOG, "Clear cell style");
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
                            errorHandler.debug(ERROR_CODE.DEBUG_LOG, "Export from", row, col);
                            alert("导出功能（示例）");
                        },
                    },
                ],

                // disabledItems: ["mergeCells", "unmergeCells"],
            },

            // rowMove: { enabled: false }
            freeze: { fixedRowsTop: 1, fixedColumnsStart: 1 },
        },
        hooks: {
            [HOOKS.ON_CELL_CLICK]: (row, col) => {
                errorHandler.debug(ERROR_CODE.DEBUG_LOG, "Cell clicked: (" + row + ", " + col + ")");
                if (isFunction(updateToolbarStyleState)) {
                    updateToolbarStyleState();
                }
            },
            // 值改变时触发
            [HOOKS.AFTER_CHANGE]: () => {
                console.log("值改变时触发");
            },
        },
        afterInit(wb) {
            errorHandler.debug(ERROR_CODE.DEBUG_LOG, "afterInit");
            const s2 = wb.sheets.get("Sheet2");
            if (s2) {
                s2.setCell(2, 0, "Switch to Sheet1 to paste");
            }
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
        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `即将移动列 ${sourceCol} → ${targetCol}`);
    });

    wb.addHook(HOOKS.AFTER_COLUMN_MOVE, (sourceCol, targetCol) => {
        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `列移动完成 ${sourceCol} → ${targetCol}`);
    });

    wb.addHook(HOOKS.AFTER_SORT, (colIndex, options, result) => {
        errorHandler.debug(ERROR_CODE.DEBUG_LOG, `排序完成！列 ${colIndex}, 耗时 ${result.time}ms`);
    });
    window.wb = wb;

    // ============================================================
    // 动态调整行列数示例（可在浏览器控制台调用）
    // ============================================================
    window.resizeGrid = {
        /** 设置行数 */
        setRows: (rows) => {
            const sheet = wb.getActiveSheet();
            sheet.setRowCount(rows);
            errorHandler.debug(ERROR_CODE.DEBUG_LOG, `✅ 行数已调整为: ${rows}`);
        },

        /** 设置列数 */
        setCols: (cols) => {
            const sheet = wb.getActiveSheet();
            sheet.setColCount(cols);
            errorHandler.debug(ERROR_CODE.DEBUG_LOG, `✅ 列数已调整为: ${cols}`);
        },

        /** 同时设置行数和列数 */
        setSize: (rows, cols) => {
            const sheet = wb.getActiveSheet();
            sheet.setGridSize(rows, cols);
            errorHandler.debug(ERROR_CODE.DEBUG_LOG, `✅ 网格大小已调整为: ${rows}行 x ${cols}列`);
        },

        /** 获取当前网格大小 */
        getSize: () => {
            const sheet = wb.getActiveSheet();
            const rc = sheet.rowColManager;
            return {
                rows: rc.rowCount,
                cols: rc.colCount,
                explicitlySized: rc.isExplicitlySized,
            };
        },

        /** 切换到"大数据模式"（启用分页） */
        enableLargeDataMode: (rows = 1000, pageSize = 50) => {
            const sheet = wb.getActiveSheet();
            const pg = wb.getPlugin("pagination");

            // 启用分页插件
            wb.enablePlugin("pagination");

            // 设置大数据量
            sheet.setGridSize(rows, sheet.rowColManager.colCount);

            // 调整每页行数
            if (pg && pg.active) {
                pg.setPageSize(pageSize);
            }

            errorHandler.debug(ERROR_CODE.DEBUG_LOG, `✅ 大数据模式已启用: ${rows}行, 每页${pageSize}行, 共${Math.ceil(rows / pageSize)}页`);
        },

        /** 切换到"小表格模式"（可选禁用分页） */
        enableSmallTableMode: (rows = 30, disablePagination = true) => {
            const sheet = wb.getActiveSheet();

            // 设置小表格
            sheet.setGridSize(rows, sheet.rowColManager.colCount);

            // 可选：禁用分页
            if (disablePagination) {
                wb.disablePlugin("pagination");
            }

            errorHandler.debug(ERROR_CODE.DEBUG_LOG, `✅ 小表格模式已启用: ${rows}行, 分页${disablePagination ? "已禁用" : "仍启用"}`);
        },
    };

    // 示例：5秒后自动调整为 30行 x 15列（可删除此段代码）
    // setTimeout(() => {
    //     window.resizeGrid.setSize(30, 15);
    // }, 5000);

    errorHandler.debug(ERROR_CODE.DEBUG_LOG, wb.getActiveSheet().name);
    errorHandler.debug(ERROR_CODE.DEBUG_LOG, "Loaded plugins:", wb.pluginManager.getLoadedNames());
    errorHandler.debug(ERROR_CODE.DEBUG_LOG, "App started! Tile Rendering + Plugin System ready.");
};

document.addEventListener("DOMContentLoaded", initApp);
