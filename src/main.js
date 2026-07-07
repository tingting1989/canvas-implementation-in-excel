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
            // {
            //     name: "Sheet1",
            //     // readOnly: false,
            //     data: [
            //         // ["Zhang San", 25, "Beijing", "Tech", 15000, "2020-03-15"],
            //         // ["Li Si", 30, "Shanghai", "Marketing", 18000, "2019-07-01"],
            //         // ["Wang Wu", 28, "Guangzhou", "Tech", 16000, "2021-01-10"],
            //     ],
            //     // colHeaders: ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
            //     rowHeaderWidth: 120,
            //     rowHeights: [30, 50, 90],
            //     rowHeaders: [{label: "序号", style: {textAlign: "center"}}, "年龄", "城市", "部门", "薪酬", "入职日期"],
            //     maxRows: 200,
            //     // 嵌套表头配置（支持完整 style 属性）
            //     nestedHeaders: [
            //         [
            //             {
            //                 label: "基本信息",
            //                 colspan: 2,
            //                 style: {
            //                     backgroundColor: "#FFC000",
            //                     color: "#FFFFFF",
            //                     fontWeight: "bold",
            //                     fontSize: "14px",
            //                     textAlign: "left",
            //                 },
            //             },
            //             {
            //                 label: "工作信息",
            //                 colspan: 4,
            //                 style: {
            //                     backgroundColor: "#70AD47",
            //                     color: "#FFFFFF",
            //                     fontWeight: "bold",
            //                     fontSize: "14px",
            //                     textAlign: "center",
            //                 },
            //             },
            //         ],
            //         [
            //             {
            //                 label: "姓名",
            //                 style: {
            //                     backgroundColor: "#FFC000",
            //                     fontWeight: "bold",
            //                 },
            //             },
            //             "年龄",
            //             {
            //                 label: "城市",
            //                 style: {
            //                     backgroundColor: "#FFC000",
            //                     fontWeight: "bold",
            //                 },
            //             },
            //             {
            //                 label: "部门",
            //                 style: {
            //                     fontStyle: "italic",
            //                     color: "#333333",
            //                 },
            //             },
            //             {
            //                 label: "薪酬",
            //                 colspan: 2,
            //                 style: {
            //                     backgroundColor: "#ED7D31",
            //                     color: "#FFFFFF",
            //                     textAlign: "center",
            //                 },
            //             },
            //         ],
            //         ["Name", "Age", "City", "Dept", "Salary", "Hire Date"],
            //     ],
            //     textOverflowEllipsis: false,
            //     cellPadding: 10,
            //     conditionalStyles: [
            //         {
            //             range: {topRow: 0, topCol: 0, bottomRow: 10000000, bottomCol: 25},
            //             condition: (v) => isNumber(v) && v > 25,
            //             style: {backgroundColor: "#ffcccc"},
            //         },
            //     ],
            //     cell: [
            //         {row: 0, col: 0, style: {backgroundColor: "#e8f4fd", fontWeight: "bold", textAlign: "center"}},
            //         {row: 1, col: 3, disabled: true},
            //         {row: 2, col: 4, readOnly: true, style: {backgroundColor: "#fff3cd"}},
            //     ],
            //     cells: (row, col) => {
            //         if (row === 0) {
            //             return {style: {fontWeight: "bold", backgroundColor: "#e8f4fd"}};
            //         }
            //         if (col === 0 && row > 0) {
            //             return {style: {textAlign: "right", fontWeight: "bold"}};
            //         }
            //     },
            //     columns: [
            //         {type: "text", width: 120, style: {textAlign: "left"}},
            //         {type: "numeric", width: 80, style: {textAlign: "right"}, numericFormat: {pattern: "0"}},
            //         {type: "text", width: 100},
            //         {type: "text", width: 100},
            //         {type: "numeric", width: 100, style: {textAlign: "right"}, numericFormat: {pattern: "$0,0.00"}},
            //         {type: "date", width: 300},
            //     ],
            // },
            {
                name: "Sheet1",

                // 是否只读
                readOnly: false,
                headerHeight: 48,

                // 嵌套表头配置
                nestedHeaders: [
                    [
                        {
                            label: "原水调节池+废水污泥池运行日报表",
                            colspan: 14,
                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },
                    ],
                    [
                        { label: "日期：yyyy-mm-dd", style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" } },
                        {
                            label: "时间",
                            colspan: 13,

                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },
                    ],
                    [
                        {
                            label: "名称",
                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },
                        {
                            label: "0:00",
                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },

                        {
                            label: "2:00",
                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },

                        {
                            label: "4:00",
                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },
                        {
                            label: "6:00",
                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },
                        {
                            label: "8:00",
                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },
                        {
                            label: "10:00",
                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },
                        {
                            label: "12:00",
                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },
                        {
                            label: "14:00",
                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },
                        {
                            label: "16:00",
                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },
                        {
                            label: "18:00",
                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },
                        {
                            label: "20:00",
                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },
                        {
                            label: "22:00",
                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },
                        {
                            label: "24:00",
                            style: { fontWeight: "bold", textAlign: "center", backgroundColor: "#fff" },
                        },
                    ],
                ],

                // 单元格内容超出单元格宽度时是否显示省略号
                textOverflowEllipsis: false,

                // 每个单元格的内边距（像素值）
                cellPadding: 10,

                // 固定行列数上限（使用 maxRows/maxCols）
                maxRows: 50,
                maxCols: 14,

                colWidths: [600],
                columns: [
                    { type: "text", width: 120, style: { textAlign: "left" } },
                    { type: "select", width: 80, style: { textAlign: "right" }, source: ["正常", "异常"] },
                    { type: "textarea", width: 200, maxRows: 4, style: { textAlign: "right" } },
                ],

                cell: [
                    { row: 0, col: 2, type: "trafficLight" }, // 第0行第2列 → trafficLight
                    { row: 1, col: 2, type: "select", source: ["正常", "异常"] }, // → select
                ],
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

    setTimeout(() => {
        // wb.updateSettings({
        //     maxRows: 100,
        // });
        wb.activeSheet.loadData([
            ["姓名", "年龄", "green"],
            ["张三", 30, "yellow"],
            ["李四", 25, "red"],
        ]);

        // wb.loadData(HOOKS.AFTER_CHANGE, () => {
        //     if (isFunction(window.updateToolbarStyleState)) {
        //         window.updateToolbarStyleState();
        //     }
        // });
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
