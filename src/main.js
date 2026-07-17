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

import { BaseColumnType } from "@/types/BaseColumnType";
import { Workbook } from "./workbook/Workbook.js";
import { HOOKS } from "./constants/hookNames.js";
import { isFunction, isNumber } from "./utils/utils.js";
import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "./core/ErrorHandler.js";
import { registerColumnTypeClass } from "@/types";
import { isUrl, openUrl } from "./utils/UrlDetector.js";

class TrafficLightType extends BaseColumnType {
    get name() {
        return "trafficLight";
    }

    get editorType() {
        return "select";
    }

    getEditorOptions() {
        return {
            source: [
                { value: "green", label: "🟢 正常" },
                { value: "yellow", label: "🟡 警告" },
                { value: "red", label: "🔴 危险" },
            ],
        };
    }

    format(value) {
        const map = { green: "正常", yellow: "警告", red: "危险" };
        return map[value] || String(value);
    }

    render(context) {
        const { ctx, x, y, width, height, value, displayValue, style } = context;

        const indicatorSize = Math.min(width, height) * 0.35;
        const indicatorRadius = indicatorSize / 2;
        const indicatorCy = context.getCenterY();
        const gap = 6;
        const padding = context.getPadding(context.sheet);

        const colors = {
            green: "#4caf50",
            yellow: "#ff9800",
            red: "#f44336",
        };

        const fontSize = style?.fontSize || 14;
        const fontFamily = style?.fontFamily || "Microsoft YaHei";
        const textColor = style?.color || "#000";
        const textAlign = style?.textAlign || "left";

        ctx.font = `${fontSize}px ${fontFamily}`;
        const textWidth = displayValue ? ctx.measureText(displayValue).width : 0;
        const totalWidth = indicatorSize + gap + textWidth;

        let startX;
        if (textAlign === "right") {
            startX = x + width - totalWidth - padding;
        } else if (textAlign === "center") {
            startX = x + (width - totalWidth) / 2;
        } else {
            startX = x + padding;
        }

        const indicatorCx = startX + indicatorRadius;
        const textX = startX + indicatorSize + gap;

        ctx.fillStyle = colors[value] || "#ccc";
        ctx.beginPath();
        ctx.arc(indicatorCx, indicatorCy, indicatorRadius, 0, Math.PI * 2);
        ctx.fill();

        if (context.isSelected) {
            ctx.strokeStyle = colors[value] || "#999";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(indicatorCx, indicatorCy, indicatorRadius + 3, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (displayValue) {
            ctx.fillStyle = textColor;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(displayValue, textX, indicatorCy);
        }
    }
}

// 注册自定义类型
registerColumnTypeClass("trafficLight", TrafficLightType);
const initApp = () => {
    errorHandler.debug(ERROR_CODE.DEBUG_LOG, "Initializing Canvas Spreadsheet (Tile Rendering + Plugin System)...");

    // 配置统一错误处理：开发模式输出所有级别日志
    errorHandler.configure({
        level: ERROR_LEVEL.DEBUG,
        devMode: true,
    });

    const wb = new Workbook(document.getElementById("wrap"), {
        defaultStyle: {},

        // readOnly: true,
        // 工作表高度和宽度（像素值）
        // height: 600,
        // 工作表高度和宽度（像素值）
        // width: 800,

        // 初始行数
        // startRows: 10,
        // 初始列数
        // startCols: 10,
        // cellPadding: 30,
        sheets: [
            {
                name: "Sheet1",
            },
            {
                name: "Sheet2",

                // readOnly: false,
                data: [
                    ["Zhang San", 25, "Beijing", "Tech", 15000, "2020-03-15"],
                    ["Li Si", 30, "Shanghai", "Marketing", 18000, "2019-07-01"],
                    ["Wang Wu", 28, "Guangzhou", "Tech", 16000, "2021-01-10"],
                ],

                // colHeaders: ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
                rowHeaderWidth: 120,
                rowHeights: [30, 50, 90],
                rowHeaders: [{ label: "序号", style: { textAlign: "center" } }, "年龄", "城市", "部门", "薪酬", "入职日期"],

                // 嵌套表头配置（支持完整 style 属性）
                nestedHeaders: [
                    [
                        {
                            label: "基本信息",
                            colspan: 2,
                            style: {
                                backgroundColor: "#FFC000",
                                color: "#FFFFFF",
                                fontWeight: "bold",
                                fontSize: "14px",
                                textAlign: "left",
                            },
                        },
                        {
                            label: "工作信息",
                            colspan: 4,
                            style: {
                                backgroundColor: "#70AD47",
                                color: "#FFFFFF",
                                fontWeight: "bold",
                                fontSize: "14px",
                                textAlign: "center",
                            },
                        },
                    ],
                    [
                        {
                            label: "姓名",
                            style: {
                                backgroundColor: "#FFC000",
                                fontWeight: "bold",
                            },
                        },
                        "年龄",
                        {
                            label: "城市",
                            style: {
                                backgroundColor: "#FFC000",
                                fontWeight: "bold",
                            },
                        },
                        {
                            label: "部门",
                            style: {
                                fontStyle: "italic",
                                color: "#333333",
                            },
                        },
                        {
                            label: "薪酬",
                            colspan: 2,
                            style: {
                                backgroundColor: "#ED7D31",
                                color: "#FFFFFF",
                                textAlign: "center",
                            },
                        },
                    ],
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

            "exportFile",
            "importFile",
            "hiddenColumns",
            "hiddenRows",
            "rowMove",
            "freeze",
            "formula",

            // "sort",
            "dataValidation",
            "chart",

            // "filter",
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

            // freeze: { fixedRowsTop: 1, fixedColumnsStart: 1 },

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
            const s2 = wb.sheets.get("Sheet2");
            if (s2) {
                s2.setCell(2, 0, "Switch to Sheet1 to paste");
            }
        },
    });

    wb.initRender();
    wb.render();

    wb.addHook(HOOKS.ON_CELL_CLICK, (row, col, e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        const sheet = wb.activeSheet;
        const cell = sheet.cellStore.get(row, col);
        if (cell?.value && isUrl(cell.value)) {
            const canOpen = wb.runHooks(HOOKS.BEFORE_OPEN_URL, row, col, cell.value, e);
            if (canOpen === false) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            openUrl(cell.value);
            wb.runHooks(HOOKS.AFTER_OPEN_URL, row, col, cell.value);
            e.preventDefault();
            e.stopPropagation();
        }
    });

    wb.addHook(HOOKS.AFTER_CHANGE, (changes) => {
        for (const { row, col, newValue } of changes) {
            if (isUrl(newValue)) {
                wb.runHooks(HOOKS.ON_URL_DETECTED, row, col, newValue);
            }
        }
    });
    function prepareData() {
        const chartPlugin = wb.getPlugin("chart");
        if (!chartPlugin) return;
        console.log(chartPlugin);
        const s = wb.activeSheet;

        // ==================== 示例1：折线图/柱状图 ====================
        s.setCell(0, 0, "产品");
        s.setCell(0, 1, "Q1");
        s.setCell(0, 2, "Q2");
        s.setCell(0, 3, "Q3");
        s.setCell(0, 4, "Q4");
        ["A", "B", "C", "D", "E"].forEach((p, i) => {
            s.setCell(i + 1, 0, p);
            s.setCell(i + 1, 1, Math.floor(Math.random() * 1000) + 500);
            s.setCell(i + 1, 2, Math.floor(Math.random() * 1000) + 500);
            s.setCell(i + 1, 3, Math.floor(Math.random() * 1000) + 500);
            s.setCell(i + 1, 4, Math.floor(Math.random() * 1000) + 500);
        });

        const lineChart = chartPlugin.addLineChart(
            { startRow: 0, startCol: 0, endRow: 5, endCol: 4 },
            {
                anchorRow: 8,
                anchorCol: 1,
                width: 450,
                height: 300,
                style: { title: "销售趋势(折线图)", showLegend: true, showTooltip: true },
            },
        );
        console.log(lineChart);

        if (lineChart) {
            console.log(`📊 折线图 ${lineChart.id}`);
        }

        // ==================== 示例2：K线图（股票蜡烛图）====================
        // 设置K线图数据表头
        s.setCell(0, 6, "日期");
        s.setCell(0, 7, "开盘价");
        s.setCell(0, 8, "收盘价");
        s.setCell(0, 9, "最低价");
        s.setCell(0, 10, "最高价");

        // K线图数据：[开盘价, 收盘价, 最低价, 最高价]
        const candlestickData = [
            { date: "周一", data: [20, 34, 10, 38] }, // 上涨
            { date: "周二", data: [40, 35, 30, 50] }, // 下跌
            { date: "周三", data: [31, 38, 33, 44] }, // 上涨
            { date: "周四", data: [38, 15, 5, 42] }, // 大幅下跌
            { date: "周五", data: [25, 45, 20, 48] }, // 大幅上涨
        ];

        // 填充K线图数据到表格
        candlestickData.forEach((item, index) => {
            s.setCell(index + 1, 6, item.date); // 日期
            s.setCell(index + 1, 7, item.data[0]); // 开盘价
            s.setCell(index + 1, 8, item.data[1]); // 收盘价
            s.setCell(index + 1, 9, item.data[2]); // 最低价
            s.setCell(index + 1, 10, item.data[3]); // 最高价
        });

        // 创建K线图（注意：数据范围只包含4个价格列 H-K，不含日期列G）
        // H=列7(开盘价), I=列8(收盘价), J=列9(最低价), K=列10(最高价)
        console.log("🔍 开始创建K线图...");
        console.log("   数据范围: H1:K5 (开盘价、收盘价、最低价、最高价)");
        const candlestickChart = chartPlugin.addCandlestickChart(
            { startRow: 0, startCol: 7, endRow: 5, endCol: 10 },
            {
                anchorRow: 8,
                anchorCol: 8,
                width: 500,
                height: 320,
                style: {
                    title: "📈 股票K线图（周线）",
                    showLegend: false, // K线图通常不显示图例
                    showTooltip: true, // 显示tooltip展示详细信息
                    showGrid: true, // 显示网格线
                },
            },
        );

        console.log("📊 K线图创建结果:", candlestickChart);
        if (candlestickChart) {
            console.log(`✅ K线图 ${candlestickChart.id} 创建成功`);
            console.log("   - 类型:", candlestickChart.type);
            console.log("   - 位置:", `(${candlestickChart.anchorRow}, ${candlestickChart.anchorCol})`);
            console.log("   - 尺寸:", `${candlestickChart.width}x${candlestickChart.height}`);
            console.log("   - 数据范围:", candlestickChart.dataRange);

            console.log("\n📈 K线图数据说明：");
            console.log("- 每行代表一根K线（一天/一周/一月的交易数据）");
            console.log("- 数据格式：[开盘价, 收盘价, 最低价, 最高价]");
            console.log("- 🟢 绿色/红色：收盘价 >= 开盘价（上涨）");
            console.log("- 🔴 红色：收盘价 < 开盘价（下跌）");
            console.log("\n点击K线可查看详细信息：");
            console.log("- 开盘价、收盘价、最高价、最低价");
            console.log("- 涨跌额、涨跌幅百分比");
        }

        // ==================== 示例3：多种图表类型演示 ====================
        // 饼图数据
        s.setCell(20, 0, "类别");
        s.setCell(20, 1, "数值");
        s.setCell(21, 0, "产品A");
        s.setCell(21, 1, 30);
        s.setCell(22, 0, "产品B");
        s.setCell(22, 1, 25);
        s.setCell(23, 0, "产品C");
        s.setCell(23, 1, 20);
        s.setCell(24, 0, "产品D");
        s.setCell(24, 1, 15);
        s.setCell(25, 0, "其他");
        s.setCell(25, 1, 10);

        const pieChart = chartPlugin.addPieChart(
            { startRow: 20, startCol: 0, endRow: 25, endCol: 1 },
            {
                anchorRow: 20,
                anchorCol: 3,
                width: 350,
                height: 280,
                style: { title: "市场份额分布(饼图)", showLegend: true, showTooltip: true },
            },
        );

        if (pieChart) {
            console.log(`🥧 饼图 ${pieChart.id}`);
        }

        // 柱状图数据
        s.setCell(27, 0, "月份");
        s.setCell(27, 1, "销售额");
        s.setCell(28, 0, "1月");
        s.setCell(28, 1, 1200);
        s.setCell(29, 0, "2月");
        s.setCell(29, 1, 1800);
        s.setCell(30, 0, "3月");
        s.setCell(30, 1, 1500);
        s.setCell(31, 0, "4月");
        s.setCell(31, 1, 2100);

        const barChart = chartPlugin.addBarChart(
            { startRow: 27, startCol: 0, endRow: 31, endCol: 1 },
            {
                anchorRow: 20,
                anchorCol: 8,
                width: 380,
                height: 280,
                style: { title: "月度销售额(柱状图)", showLegend: true, showTooltip: true },
            },
        );

        if (barChart) {
            console.log(`📊 柱状图 ${barChart.id}`);
        }

        // ==================== 示例4：仪表盘（Gauge）====================
        // 仪表盘数据：[标签, 数值]
        // 注意：数据范围需要包含表头行，否则 DataExtractor 无法正确提取数据
        console.log("🔍 开始准备仪表盘数据...");
        s.setCell(33, 0, "指标"); // 表头行（第34行）
        s.setCell(33, 1, "数值");
        s.setCell(34, 0, "SCORE"); // 数据行（第35行）
        s.setCell(34, 1, 75); // 改为75%，更容易看到效果

        console.log("   数据已写入：A34=指标, B34=数值");
        console.log("              A35=SCORE, B35=75");

        console.log("🎯 正在创建仪表盘...");
        const gaugeChart = chartPlugin.addGaugeChart(
            { startRow: 33, startCol: 0, endRow: 34, endCol: 1 }, // 包含表头行和数据行
            {
                anchorRow: 36, // 改到第36行，避免与其他图表重叠
                anchorCol: 6, // 改到第6列，更靠左
                width: 350,
                height: 280,
                style: {
                    title: "🎯 完成度仪表盘",
                    showLegend: false,
                    showTooltip: true,
                    min: 0,
                    max: 100,
                },
            },
        );

        console.log("📊 仪表盘创建结果:", gaugeChart);
        if (gaugeChart) {
            console.log(`🎯 仪表盘 ${gaugeChart.id} 创建成功`);
            console.log("仪表盘数据格式：[标签, 数值]");
            console.log("- 标签：显示在仪表盘中心（如 SCORE、温度、速度等）");
            console.log("- 数值：指针指向的值（0-100范围）");
            console.log("\n特性：");
            console.log("- 半圆形设计，直观展示完成度/进度");
            console.log("- 渐变色弧线（蓝→绿→红）表示数值范围");
            console.log("- 动态指针精确指向当前值");
            console.log("- 刻度清晰标注（0-100，每10一个主刻度）");
            console.log("\n点击仪表盘可查看详细信息！");
        }

        // ==================== 示例5：漏斗图（Funnel）====================
        // 漏斗图数据：[阶段名称, 数值]
        console.log("🔍 开始准备漏斗图数据...");
        s.setCell(38, 0, "阶段");
        s.setCell(38, 1, "数量");

        const funnelData = [
            { stage: "Show", value: 1000 },
            { stage: "Click", value: 600 },
            { stage: "Visit", value: 400 },
            { stage: "Inquiry", value: 200 },
            { stage: "Order", value: 80 },
        ];

        funnelData.forEach((item, index) => {
            s.setCell(39 + index, 0, item.stage);
            s.setCell(39 + index, 1, item.value);
        });

        console.log(`   数据已写入：${funnelData.length}个阶段`);

        console.log("🎯 正在创建漏斗图...");
        const funnelChart = chartPlugin.addFunnelChart(
            { startRow: 38, startCol: 0, endRow: 43, endCol: 1 },
            {
                anchorRow: 38,
                anchorCol: 10,
                width: 450,
                height: 350,
                style: {
                    title: "📊 用户转化漏斗",
                    showLegend: true,
                    showTooltip: true,
                },
            },
        );

        console.log("📊 漏斗图创建结果:", funnelChart);
        if (funnelChart) {
            console.log(`📊 漏斗图 ${funnelChart.id} 创建成功`);
            console.log("漏斗图数据格式：[阶段名称, 数值]");
            console.log("- 阶段：显示在漏斗每一层（如 Show、Click、Visit 等）");
            console.log("- 数值：决定该层的宽度（数值越大层越宽）");
            console.log("\n特性：");
            console.log("- 倒三角形设计，直观展示转化流程");
            console.log("- 渐变色层级，每层不同颜色区分");
            console.log("- 自动计算转化率（相邻两层对比）");
            console.log("- 点击任意层查看详细转化数据");
            console.log("\n适用场景：销售漏斗、用户行为分析、转化率追踪等");
        }

        // ── 雷达图示例 ──
        const radarData = [
            ["指标", "预算", "实际支出"],
            ["Sales", 4200, 5000],
            ["Administration", 3000, 14000],
            ["Information Technology", 20000, 28000],
            ["Customer Support", 35000, 26000],
            ["Development", 50000, 42000],
            ["Marketing", 18000, 21000],
        ];

        for (let r = 0; r < radarData.length; r++) {
            for (let c = 0; c < radarData[r].length; c++) {
                s.setCell(r + 45, c, radarData[r][c]);
            }
        }

        console.log(`   数据已写入：${radarData.length - 1}个维度 × ${radarData[0].length - 1}个系列`);

        console.log("📡 正在创建雷达图...");

        const radarChart = chartPlugin.addRadarChart(
            { startRow: 45, startCol: 0, endRow: 51, endCol: 2 },
            {
                anchorRow: 45,
                anchorCol: 10,
                width: 450,
                height: 400,
                style: {
                    title: "📡 预算 vs 实际支出",
                    showLegend: true,
                    showTooltip: true,
                },
            },
        );

        console.log("📡 雷达图创建结果:", radarChart);
        if (radarChart) {
            console.log(`📡 雷达图 ${radarChart.id} 创建成功`);
            console.log("雷达图数据格式（类表格结构）：");
            console.log("| 指标 (维度) | 系列1 | 系列2 | ... |");
            console.log("|------------|-------|-------|-----|");
            console.log("| Sales      | 4200  | 5000  |     |");
            console.log("| Admin      | 3000  | 14000 |     |");
            console.log("| IT         | 20000 | 28000 |     |");
            console.log("\n数据说明：");
            console.log("- 第一列：维度/指标名称（显示在雷达图外围）");
            console.log("- 后续列：每个系列的数据值（决定距离圆心的远近）");
            console.log("- 自动计算最大值（无需手动配置 max）");
            console.log("\n特性：");
            console.log("- 多边形网格背景（5层同心多边形）");
            console.log("- 多系列对比（不同颜色填充区域）");
            console.log("- 维度标签自动分布（支持3-12个维度）");
            console.log("- 鼠标悬停显示详细数值和占比");
            console.log("\n适用场景：能力评估、性能分析、产品对比、SWOT分析等");
        }
    }
    setTimeout(() => {
        prepareData();
    }, 1000);

    // wb.addHook(HOOKS.AFTER_CHANGE, () => {
    //     if (isFunction(window.updateToolbarStyleState)) {
    //         window.updateToolbarStyleState();
    //     }
    // });

    // setTimeout(() => {
    //     wb.updateSettings({
    //         nestedHeaders: [
    //             [
    //                 {
    //                     label: "基本信息",
    //                     colspan: 2,
    //                     style: {
    //                         backgroundColor: "#FFC000",
    //                         color: "#4472C4",
    //                         fontWeight: "bold",
    //                         fontSize: "14px",
    //                         textAlign: "center",
    //                     },
    //                 },
    //                 {
    //                     label: "工作信息",
    //                     colspan: 4,
    //                     style: {
    //                         backgroundColor: "#70AD47",
    //                         color: "#FFFFFF",
    //                         fontWeight: "bold",
    //                         fontSize: "14px",
    //                         textAlign: "center",
    //                     },
    //                 },
    //             ],
    //             [
    //                 { label: "姓名", style: { textAlign: "center", backgroundColor: "#FFFFFF" } },
    //                 { label: "年龄", style: { textAlign: "center", backgroundColor: "#FFFFFF" } },
    //
    //                 {
    //                     label: "城市",
    //                     style: {
    //                         backgroundColor: "#FFC000",
    //                         fontWeight: "bold",
    //                     },
    //                 },
    //                 {
    //                     label: "部门",
    //                     style: {
    //                         fontStyle: "italic",
    //                         color: "#333333",
    //                     },
    //                 },
    //                 {
    //                     label: "薪酬",
    //                     colspan: 2,
    //                     style: {
    //                         backgroundColor: "#ED7D31",
    //                         color: "#FFFFFF",
    //                         textAlign: "center",
    //                     },
    //                 },
    //             ],
    //             [
    //                 {
    //                     label: "name",
    //                     style: { textAlign: "center", backgroundColor: "#FFFFFF" },
    //                 },
    //                 {
    //                     label: "Age",
    //                     style: { textAlign: "center", backgroundColor: "#FFFFFF" },
    //                 },
    //                 "City",
    //                 "Dept",
    //                 "Salary",
    //                 "Hire Date",
    //             ],
    //         ],
    //     });
    //     // wb.destroy();
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
    };

    // 示例：5秒后自动调整为 30行 x 15列（可删除此段代码）
    // setTimeout(() => {
    //     window.resizeGrid.setSize(30, 15);
    // }, 5000);
};

document.addEventListener("DOMContentLoaded", initApp);
