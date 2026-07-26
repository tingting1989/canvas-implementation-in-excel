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
import { isFunction, isNumber } from "./utils/helper.js";
import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "./core/ErrorHandler.js";
import { registerColumnTypeClass } from "@/types";
import { isUrl, openUrl } from "./utils/UrlDetector.js";

const initApp = () => {
    errorHandler.debug(ERROR_CODE.DEBUG_LOG, "Initializing Canvas Spreadsheet (Tile Rendering + Plugin System)...");

    // 配置统一错误处理：开发模式输出所有级别日志
    errorHandler.configure({
        level: ERROR_LEVEL.DEBUG,
        devMode: true,
    });

    const wb = new Workbook(document.getElementById("wrap"), {
        defaultStyle: {},

        sheets: [
            {
                name: "星级评分演示",

                data: [
                    // ["产品名称", "类别", "用户评分", "专家评分", "综合评价", "推荐指数", "满意度", "性价比"],
                    // ["产品A", "电子产品", 5, 5, 5, 5, 5, 5],
                    // ["产品B", "家居用品", 4, 4, 4, 4, 4, 4],
                    // ["产品C", "服装配饰", 3, 3, 3, 3, 3, 3],
                    // ["产品D", "食品饮料", 5, 4, 5, 4, 5, 4],
                    // ["产品E", "图书文具", 4, 5, 4, 5, 4, 5],
                    // ["产品F", "运动户外", 3, 4, 3, 4, 3, 4],
                    // ["产品G", "美妆护肤", 5, 5, 5, 5, 5, 5],
                    // ["产品H", "汽车配件", 4, 3, 4, 3, 4, 3],
                    // ["产品I", "数码配件", 5, 5, 5, 5, 5, 5],
                    // ["产品J", "母婴用品", 4, 4, 4, 4, 4, 4],
                    // ["产品K", "宠物用品", 3, 3, 3, 3, 3, 3],
                    // ["产品L", "办公设备", 5, 4, 5, 4, 5, 4],
                ],

                columns: [
                    { type: "numeric", width: 120, style: { textAlign: "center" } },
                    { type: "hyperlink", width: 100 },
                    // 用户评分
                    {
                        type: "starRating",
                        width: 180,
                        options: { maxStars: 3, color: "#00FF00", emptyColor: "#CCCCCC" },
                    },
                    // 专家评分
                    // {
                    //     type: "trafficLight",
                    //     width: 180,
                    //     options: { maxStars: 5, color: "#FF6B6B", emptyColor: "#E0E0E0" },
                    // },
                    // // 综合评价
                    {
                        type: "select",
                        width: 180,
                        source: [
                            { value: "0", label: "好" },
                            { value: "1", label: "中" },
                            { value: "2", label: "差" },
                        ],
                    },
                    {
                        type: "date",
                        width: 120,
                        style: { textAlign: "center" },
                        options: { min: "2025-12-11", max: "2026-01-01", allowInvalid: false, dateFormat: { pattern: "YYYY-MM-DD" } },
                    },
                    { type: "text", width: 120 },
                    // // 推荐指数
                    // {
                    //     type: "starRating",
                    //     width: 180,
                    //     options: {maxStars: 5, color: "#9B59B6", emptyColor: "#C0C0C0"}
                    // },
                    // // 满意度
                    // {
                    //     type: "starRating",
                    //     width: 180,
                    //     options: {maxStars: 5, color: "#F39C12", emptyColor: "#E8E8E8"}
                    // },
                    // // 性价比
                    // {
                    //     type: "starRating",
                    //     width: 180,
                    //     options: {maxStars: 5, color: "#2ECC71", emptyColor: "#D5D5D5"}
                    // }
                ],

                cell: [
                    // 表头样式
                    // {
                    //     row: 0,
                    //     col: 0,
                    //     style: { backgroundColor: "#667eea", color: "white", fontWeight: "bold", textAlign: "center" },
                    // },
                    // {
                    //     row: 0,
                    //     col: 1,
                    //     type: "text",
                    //     style: { backgroundColor: "#667eea", color: "white", fontWeight: "bold", textAlign: "center" },
                    // },
                    // {
                    //     row: 0,
                    //     col: 2,
                    //     type: "text",
                    //     style: { backgroundColor: "#667eea", color: "white", fontWeight: "bold", textAlign: "center" },
                    // },
                    {
                        row: 0,
                        col: 3,
                        style: { backgroundColor: "#667eea", color: "white", fontWeight: "bold", textAlign: "center" },
                    },
                    {
                        row: 0,
                        col: 4,
                        style: { backgroundColor: "#667eea", color: "white", fontWeight: "bold", textAlign: "center" },
                    },
                    {
                        row: 0,
                        col: 5,
                        style: { backgroundColor: "#667eea", color: "white", fontWeight: "bold", textAlign: "center" },
                    },
                    {
                        row: 0,
                        col: 6,
                        style: { backgroundColor: "#667eea", color: "white", fontWeight: "bold", textAlign: "center" },
                    },
                    {
                        row: 0,
                        col: 7,
                        style: { backgroundColor: "#667eea", color: "white", fontWeight: "bold", textAlign: "center" },
                    },
                ],

                // rowHeights: [40, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45],
                textOverflowEllipsis: false,
                cellPadding: 10,
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
            // "interaction"
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
                highlightInvalidCells: true,
                rules: [
                    {
                        range: "F2:F10",
                        type: "text",
                        operator: "lengthBetween",
                        value: [3, 10],
                        allowBlank: false,
                        errorMessage: "长度为3-10个字符",
                        errorStyle: "warning",
                        // inputTitle: "输入提示",
                        // inputMessage: "请输入3~10个字符",
                    },
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

    // wb.loadPluginClass(InteractionPlugin, {
    //     debugMode: false,
    //     throttleMs: 16,
    //     autoRender: true,
    // });

    // ✨ 新特性：autoInit=true（默认）时，构造函数会自动调用 initRender() 和 render()
    // 如需延迟初始化，可设置 autoInit: false
    // wb.initRender();
    // wb.render();

    // 🧹 示例：数据清空 API（v1.0.15+）
    // 可在控制台测试以下命令：

    // 1. 清空当前工作表（支持 Ctrl+Z 撤销）
    // wb.clearActiveSheetData();

    // 2. 清空所有工作表
    // wb.clearAllSheetsData();

    // 3. 清空指定范围（A1:D10）
    // sheet.clearRange(0, 0, 9, 3);

    // 4. 性能优化模式（大数据量）
    // wb.clearActiveSheetData({ skipHistory: true });

    // 5. 监听清空事件
    // wb.addHook('afterClearData', ({ changes, clearedCount }) => {
    //     console.log(`已清除 ${clearedCount} 个单元格`);
    // });

    const sheet = wb.getActiveSheet();
    wb.updateSettings({
        conditionalStyles: [
            {
                range: { topRow: 15, topCol: 0, bottomRow: 20, bottomCol: 10 },
                condition: function (v) {
                    const value = Number(v);
                    return !Number.isNaN(value) && v > 30000;
                },
                style: {
                    color: "red",
                },
            },
        ],
    });
    // wb.initRender();
    // wb.render();
    // sheet.operations.setGridSize(10, 5);
    // 超链接点击处理说明：
    // - HyperlinkColumnType 的点击由 InteractionStrategy 处理（handleClick 方法）
    // - 隐式超链接（其他列类型中的 URL）在此 hook 中处理
    wb.addHook(HOOKS.ON_CELL_CLICK, (row, col, e) => {
        const sheet = wb.activeSheet;
        const cell = sheet.cellStore.get(row, col);

        // 跳过超链接列类型（已由 InteractionStrategy 处理）
        const cellType = sheet.getCellTypeInstance(row, col);
        if (cellType?.name === "hyperlink") {
            return; // 由 InteractionStrategy 处理，避免重复
        }

        // 隐式超链接检测：自动检测非超链接列类型中的 URL
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
