// ============================================================
// 🔧 调试开关（分页模式诊断）
// ============================================================
window.__DEBUG_PAGINATION = true; // 设置为 false 可关闭调试日志

import { Workbook } from "./workbook/Workbook.js";
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

    Workbook.registerPlugin("pagination", PaginationPlugin);
    Workbook.registerPlugin("hiddenColumns", HiddenColumnsPlugin);
    Workbook.registerPlugin("hiddenRows", HiddenRowsPlugin);
    Workbook.registerPlugin("rowMove", RowMovePlugin);
    Workbook.registerPlugin("freeze", FreezePlugin);
    Workbook.registerPlugin("formula", FormulaPlugin);
    Workbook.registerPlugin("sort", SortPlugin);
    Workbook.registerPlugin("dataValidation", DataValidationPlugin);

    const wb = new Workbook("grid", {
        defaultStyle: {
            fontSize: 14,
            fontFamily: "Microsoft YaHei",
            color: "#000",
        },
        // readOnly: true,
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
                name: "Sheet1",

                // 是否只读
                // readOnly: false,

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
                        range: { topRow: 0, topCol: 0, bottomRow: 10000000, bottomCol: 25 },
                        condition: (v) => isNumber(v) && v > 25,
                        style: { backgroundColor: "#ffcccc" },
                    },
                ],

                // 单元格样式配置
                cell: [
                    // { row: 0, col: 0, style: { backgroundColor: "#e8f4fd", fontWeight: "bold", textAlign: "center" } },
                    { row: 1, col: 3, disabled: true },
                    { row: 2, col: 4, readOnly: true, style: { backgroundColor: "#fff3cd" } },
                ],

                // 单元格样式配置函数
                cells: (row, col) => {
                    // if (row === 0) {
                    //     return { style: { fontWeight: "bold", backgroundColor: "#e8f4fd" } };
                    // }
                    // if (col === 0 && row > 0) {
                    //     return { style: { textAlign: "right", fontWeight: "bold" } };
                    // }
                },

                // 列配置
                columns: [
                    { type: "text", width: 120, style: { textAlign: "left" } },
                    { type: "numeric", style: { textAlign: "right" }, numericFormat: { pattern: "0" } },
                    { type: "text" },
                    { type: "text" },
                    { type: "numeric", style: { textAlign: "right" }, numericFormat: { pattern: "$0,0.00" } },
                    { type: "date" },

                    // 自定义渲染器
                    { type: "progressBar", options: { showPercent: true } },
                ],

                // 配置列的宽度 number|number[],优先级比columns中的width 低
                colWidths: 200,

                // colWidths: [120, 80, 100, 100, 100, 300],
            },
            {
                name: "Sheet2",
                // readOnly: false,
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
                        range: { topRow: 0, topCol: 0, bottomRow: 10000000, bottomCol: 25 },
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
            },
        ],
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
            "formula",
            "sort",
            "dataValidation",
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
                            sheet.setRowStyle(row, { backgroundColor: "yellow" });
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

                // rowMove: { enabled: false },
            },

            freeze: { fixedRowsTop: 1, fixedColumnsStart: 1 },

            dataValidation: {
                conflictStrategy: "short-circuit",
                rules: [
                    // {
                    //     range: "B:B",
                    //     type: "number",
                    //     operator: "between",
                    //     value: [0, 100],
                    //     errorMessage: "必须输入正数",
                    //     errorStyle: "stop",
                    // },
                    //
                    // {
                    //     range: "A:A",
                    //     type: "text",
                    //     operator: "greaterThan",
                    //     value: 5,
                    //     errorMessage: "必须输入正数",
                    //     errorStyle: "stop",
                    // },
                    //
                    // {
                    //     range: "C:C",
                    //     type: "time",
                    //     operator: "between",
                    //     value: ["09:00", "18:00"],
                    //     errorMessage: "必须输入正数",
                    //     errorStyle: "stop",
                    // },
                    // {
                    //     range: "D:D",
                    //     type: "unique",
                    // },
                    // {
                    //     range: "G:G",
                    //     type: "date",
                    //     operator: "between",
                    //     value: ["01/01/2020", "12/31/2020"],
                    //     errorMessage: "必须输入正数",
                    //     errorStyle: "stop",
                    // },
                ],
            },
        },
        hooks: {
            // ==================== 编辑相关钩子 ====================
            // ✅ 已执行
            // [HOOKS.BEFORE_BEGIN_EDITING]: (...args) => {
            //     console.log("[HOOK] beforeBeginEditing 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_BEGIN_EDITING]: (...args) => {
            //     console.log("[HOOK] afterBeginEditing 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.BEFORE_FINISH_EDITING]: (...args) => {
            //     console.log("[HOOK] beforeFinishEditing 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_FINISH_EDITING]: (...args) => {
            //     console.log("[HOOK] afterFinishEditing 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.BEFORE_CHANGE]: (...args) => {
            //     console.log("[HOOK] beforeChange 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_CHANGE]: (...args) => {
            //     console.log("[HOOK] afterChange 执行了", ...args);
            // },
            //
            // // ==================== 选择相关钩子 ====================
            // // ✅ 已执行
            // [HOOKS.BEFORE_SELECTION]: (...args) => {
            //     console.log("[HOOK] beforeSelection 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_SELECTION]: (...args) => {
            //     console.log("[HOOK] afterSelection 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.BEFORE_SELECTION_END]: (...args) => {
            //     console.log("[HOOK] beforeSelectionEnd 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_SELECTION_END]: (...args) => {
            //     console.log("[HOOK] afterSelectionEnd 执行了", ...args);
            // },
            //
            // // ==================== 单元格交互钩子 ====================
            // // ✅ 已执行
            // [HOOKS.ON_CELL_MOUSE_DOWN]: (...args) => {
            //     console.log("[HOOK] onCellMouseDown 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.ON_CELL_MOUSE_OVER]: (...args) => {
            //     console.log("[HOOK] onCellMouseOver 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.ON_CELL_MOUSE_OUT]: (...args) => {
            //     console.log("[HOOK] onCellMouseOut 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.ON_CELL_CLICK]: (...args) => {
            //     console.log("[HOOK] onCellClick 执行了", ...args);
            //     if (isFunction(updateToolbarStyleState)) {
            //         updateToolbarStyleState();
            //     }
            // },
            // // ✅ 已执行
            // [HOOKS.ON_CELL_DBL_CLICK]: (...args) => {
            //     console.log("[HOOK] onCellDblClick 执行了", ...args);
            // },
            //
            // // ==================== 键盘相关钩子 ====================
            // // ✅ 已执行
            // [HOOKS.BEFORE_KEY_DOWN]: (...args) => {
            //     console.log("[HOOK] beforeKeyDown 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_KEY_DOWN]: (...args) => {
            //     console.log("[HOOK] afterKeyDown 执行了", ...args);
            // },
            //
            // // ==================== 滚动相关钩子 ====================
            // // ✅ 已执行
            // [HOOKS.AFTER_SCROLL_HORIZONTALLY]: (...args) => {
            //     console.log("[HOOK] afterScrollHorizontally 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_SCROLL_VERTICALLY]: (...args) => {
            //     console.log("[HOOK] afterScrollVertically 执行了", ...args);
            // },
            //
            // // ==================== 合并单元格相关钩子 ====================
            // // ✅ 已执行
            // [HOOKS.BEFORE_MERGE_CELLS]: (...args) => {
            //     console.log("[HOOK] beforeMergeCells 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_MERGE_CELLS]: (...args) => {
            //     console.log("[HOOK] afterMergeCells 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.BEFORE_UNMERGE_CELLS]: (...args) => {
            //     console.log("[HOOK] beforeUnmergeCells 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_UNMERGE_CELLS]: (...args) => {
            //     console.log("[HOOK] afterUnmergeCells 执行了", ...args);
            // },
            //
            // // ==================== 剪贴板相关钩子 ====================
            // // ✅ 已执行
            // [HOOKS.BEFORE_COPY]: (...args) => {
            //     console.log("[HOOK] beforeCopy 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_COPY]: (...args) => {
            //     console.log("[HOOK] afterCopy 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.BEFORE_CUT]: (...args) => {
            //     console.log("[HOOK] beforeCut 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_CUT]: (...args) => {
            //     console.log("[HOOK] afterCut 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.BEFORE_PASTE]: (...args) => {
            //     console.log("[HOOK] beforePaste 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_PASTE]: (...args) => {
            //     console.log("[HOOK] afterPaste 执行了", ...args);
            // },
            //
            // // ==================== 列移动相关钩子 ====================
            // // ✅ 已执行
            // [HOOKS.BEFORE_COLUMN_MOVE]: (...args) => {
            //     console.log("[HOOK] beforeColumnMove 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_COLUMN_MOVE]: (...args) => {
            //     console.log("[HOOK] afterColumnMove 执行了", ...args);
            // },
            //
            // // ==================== 行移动相关钩子 ====================
            // // ✅ 已执行
            // [HOOKS.BEFORE_ROW_MOVE]: (...args) => {
            //     console.log("[HOOK] beforeRowMove 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_ROW_MOVE]: (...args) => {
            //     console.log("[HOOK] afterRowMove 执行了", ...args);
            // },
            //
            // // ==================== 分页相关钩子 ====================
            // // ✅ 已执行
            // [HOOKS.AFTER_PAGE_CHANGE]: (...args) => {
            //     console.log("[HOOK] afterPageChange 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_PAGE_SIZE_CHANGE]: (...args) => {
            //     console.log("[HOOK] afterPageSizeChange 执行了", ...args);
            // },
            //
            // // ==================== 隐藏列相关钩子 ====================
            // // ✅ 已执行
            // [HOOKS.AFTER_HIDE_COLUMN]: (...args) => {
            //     console.log("[HOOK] afterHideColumn 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_SHOW_COLUMN]: (...args) => {
            //     console.log("[HOOK] afterShowColumn 执行了", ...args);
            // },
            //
            // // ==================== 隐藏行相关钩子 ====================
            // // ✅ 已执行
            // [HOOKS.AFTER_HIDE_ROW]: (...args) => {
            //     console.log("[HOOK] afterHideRow 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_SHOW_ROW]: (...args) => {
            //     console.log("[HOOK] afterShowRow 执行了", ...args);
            // },
            //
            // // ==================== 冻结行列相关钩子 ====================
            // // ✅ 已执行
            // [HOOKS.AFTER_FREEZE]: (...args) => {
            //     console.log("[HOOK] afterFreeze 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_UNFREEZE]: (...args) => {
            //     console.log("[HOOK] afterUnfreeze 执行了", ...args);
            // },
            //
            // // ==================== 工作表切换相关钩子 ====================
            // // ✅ 已执行
            // [HOOKS.AFTER_SHEET_SWITCH]: (...args) => {
            //     console.log("[HOOK] afterSheetSwitch 执行了", ...args);
            // },
            //
            // // ==================== 排序相关钩子 ====================
            // // ✅ 已执行
            // [HOOKS.AFTER_SORT]: (...args) => {
            //     console.log("[HOOK] afterSort 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_SORT_RESTORE]: (...args) => {
            //     console.log("[HOOK] afterSortRestore 执行了", ...args);
            // },
            //
            // // ==================== 生命周期钩子 ====================
            // // ✅ 已执行
            // [HOOKS.INIT]: (...args) => {
            //     console.log("[HOOK] init 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.DESTROY]: (...args) => {
            //     console.log("[HOOK] destroy 执行了", ...args);
            // },
            // ==================== 工作表相关钩子 ====================
            // ✅ 已执行
            // [HOOKS.BEFORE_SHEET_RENAME]: (...args) => {
            //     console.log("[HOOK] beforeSheetRename 执行了", ...args);
            //     return true;
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_SHEET_RENAME]: (...args) => {
            //     console.log("[HOOK] afterSheetRename 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.BEFORE_SHEET_ADD]: (...args) => {
            //     console.log("[HOOK] beforeSheetAdd 执行了", ...args);
            //     return true;
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_SHEET_ADD]: (...args) => {
            //     console.log("[HOOK] afterSheetAdd 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.BEFORE_SHEET_REMOVE]: (...args) => {
            //     console.log("[HOOK] beforeSheetRemove 执行了", ...args);
            //     return true;
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_SHEET_REMOVE]: (...args) => {
            //     console.log("[HOOK] afterSheetRemove 执行了", ...args);
            // },
            // // ✅ 已执行
            // [HOOKS.BEFORE_SHEET_SWITCH]: (...args) => {
            //     console.log("[HOOK] beforeSheetSwitch 执行了", ...args);
            //     return true;
            // },
            // // ✅ 已执行
            // [HOOKS.AFTER_SHEET_SWITCH]: (...args) => {
            //     console.log("[HOOK] afterSheetSwitch 执行了", ...args);
            //     return true;
            // },
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

    // wb.addHook(HOOKS.AFTER_CHANGE, () => {
    //     if (isFunction(window.updateToolbarStyleState)) {
    //         window.updateToolbarStyleState();
    //     }
    // });

    // setTimeout(() => {
    //     wb.destroy();
    // }, 5000);

    // 注意：BEFORE_COLUMN_MOVE、AFTER_COLUMN_MOVE、AFTER_SORT 已在 hooks 配置中注册，
    // 无需重复通过 addHook 注册，否则会触发两次回调。

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
