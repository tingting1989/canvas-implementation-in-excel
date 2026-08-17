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

import { BaseColumnType } from "./types/BaseColumnType.js";
import { Workbook } from "./workbook/Workbook.js";
import { FormulaEngine } from "./formula/FormulaEngine.js";
import { HOOKS } from "./constants/hookNames.js";
import { isFunction, isNumber } from "./utils/helper.js";
import { errorHandler } from "./core/ErrorHandler.js";
import { registerColumnTypeClass } from "./types/index.js";
import { isUrl, openUrl } from "./utils/UrlDetector.js";
import { functionRegistry } from "./formula/functions/index.js";
import { ERROR_CODE, ERROR_LEVEL } from "./constants/errorCodes.js";
const initApp = () => {
    const sampleData = [
        // 表头行
        [
            "编号", "姓名", "部门", "职位", "邮箱", "日期时间", "邮箱格式", "唯一编号",
            "数值>0", "范围0-100", "整数检查", "偶数检查", "文本长度≥5", "非空文本", "日期2024", "布尔值",
            "SUM聚合", "AVERAGE平均", "COUNTIF条件", "IFERROR处理", "AND复合联动", "OR异常检测", "NOT非空检查", "MAX/MIN范围", "VLOOKUP外键"
        ],

        // 第1行：全部通过（正常数据）
        [
            1, "张三", "技术部", "工程师", "zhangsan@corp.com", "2024-06-15 09:30", "valid@email.com", "EMP001",
            100, 50, 42, 8, "Valid Text", "NonEmpty", "2024-06-15", true,
            200, 50.0, "test@mail.com", "123", "OK", "Normal", "Filled", 75, "张三"
        ],

        // 第2行：多个失败（测试同步阻止 + 异步标记）
        [
            2, "李四", "市场部", "经理", "lisi@corp.com.cn", "2024-03-20 14:00", "user@domain.org", "EMP001",
            -10, 150, 3.14, 7, "No", "", "2023-01-01", false,
            141, 35.29, "no-at-sign", "abc", "Fail", "Abnormal", "", 120, "王五"
        ],

        // 第3行：部分失败（边界测试）
        [
            3, "王五", "财务部", "会计", "wangwu@finance.net", "2024-12-31 16:45", "ok@test.io", "EMP003",
            55, 75, 100, 6, "Perfect Length", "HasContent", "2024-12-31", true,
            231, 62.75, "another@email.com", "456", "Pass", "Normal", "Data", 90, "赵六"
        ],

        // 第4行：异常数据组合
        [
            4, "赵六", "人事部", "专员", "zhaoliu@hr.org", "2020-07-20 08:15", "bad-format", "EMP004",
            0, -5, -7, 9, "X", "TextHere", "2026-01-01", true,
            -3, -1.33, "missing@symbol", "xyz", "Error", "Outlier", "Value", -10, "钱七"
        ],

        // 第5行：混合结果
        [
            5, "钱七", "技术部", "架构师", "qianqi@tech.com", "2024-06-20 20:30", "good@email.cn", "EMP005",
            88, 99, 77, 4, "Another Good One", "NotEmpty", "2024-06-20", false,
            264, 66.0, "user@host.com", "789", "Good", "Normal", "Present", 85, "孙八"
        ],

        // 第6行：大量标记
        [
            6, "孙八", "市场部", "销售", "sunba@mkt.co.uk", "2023-11-11 12:45", "simple@addr", "EMP006",
            -1, 101, 2.5, 3, "Bad", "", "2023-12-31", false,
            102, 25.5, "invalid-email", "ABC", "Fail", "Special", "", 105, "周九"
        ],

        // 第7行：基本正常
        [
            7, "周九", "财务部", "总监", "zhoujiu@fin.com", "2024-07-04 10:00", "chief@office.gov", "EMP007",
            42, 50, 200, 10, "OK", "Has Value", "2024-07-04", true,
            292, 73.0, "admin@system.edu", "101010", "Pass", "Normal", "Exists", 110, "吴十"
        ]
    ];
    errorHandler.debug(ERROR_CODE.DEBUG_LOG, "Initializing Canvas Spreadsheet (Tile Rendering + Plugin System)...");

    // 配置统一错误处理：开发模式输出所有级别日志
    errorHandler.configure({
        level: ERROR_LEVEL.DEBUG,
        devMode: true,
    });

    const wb = new Workbook(document.getElementById("wrap"), {
        width: 1600, height: 400,
        sheets: [{
            name: '数据验证',
            data: sampleData,
            columns: [
                { type: 'numeric', width: 55, title: '编号' },
                { type: 'text', width: 65, title: '姓名' },
                { type: 'text', width: 70, title: '部门' },
                { type: 'text', width: 70, title: '职位' },
                { type: 'text', width: 120, title: '邮箱' },
                { type: 'text', width: 130, title: '日期时间' },
                { type: 'text', width: 110, title: '邮箱格式' },
                { type: 'text', width: 70, title: '唯一编号' },

                { type: 'numeric', width: 72, title: '数值>0\n[同步-stop]' },
                { type: 'numeric', width: 72, title: '范围0-100\n[同步-stop]' },
                { type: 'numeric', width: 68, title: '整数检查\n[同步-stop]' },
                { type: 'numeric', width: 68, title: '偶数检查\n[同步-stop]' },
                { type: 'text', width: 85, title: '文本长度≥5\n[同步-stop]' },
                { type: 'text', width: 80, title: '非空文本\n[同步-stop]' },
                { type: 'text', width: 90, title: '日期2024\n[同步-stop]' },
                { type: 'text', width: 68, title: '布尔值\n[同步-stop]' },

                { type: 'numeric', width: 72, title: 'SUM聚合\n[异步-warning]' },
                { type: 'numeric', width: 78, title: 'AVERAGE平均\n[异步-warning]' },
                { type: 'text', width: 82, title: 'COUNTIF条件\n[异步-warning]' },
                { type: 'text', width: 78, title: 'IFERROR处理\n[异步-warning]' },
                { type: 'text', width: 75, title: 'AND复合联动\n[异步-warning]' },
                { type: 'text', width: 75, title: 'OR异常检测\n[异步-warning]' },
                { type: 'text', width: 72, title: 'NOT非空检查\n[异步-warning]' },
                { type: 'numeric', width: 80, title: 'MAX/MIN范围\n[异步-warning]' },
                { type: 'text', width: 80, title: 'VLOOKUP外键\n[异步-warning]' }
            ],
            cellPadding: 8
        }],
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
            dataValidation: {
                conflictStrategy: 'short-circuit',
                rules: [
                    // ════════════════════════════════════════
                    // 📋 基础类型验证 (A-H列) - 展示内置验证器
                    // ════════════════════════════════════════

                    {
                        range: 'A2:A20',
                        type: 'number',
                        operator: 'between',
                        value: [3, 100],
                        errorMessage: '⛔ 编号必须是 1-100 之间的整数',
                        errorStyle: 'stop'
                    },
                    {
                        range: 'B2:B20',
                        type: 'text',
                        operator: 'lengthBetween',
                        value: [3, 10],
                        errorMessage: '⛔ 姓名长度必须在 3-10 个字符之间',
                        errorStyle: 'stop'
                    },
                    {
                        range: 'C2:C20',
                        type: 'list',
                        source: ['技术部', '市场部', '财务部', '人事部', '运营部'],
                        errorMessage: '⚠️ 请从下拉列表中选择部门',
                        errorStyle: 'warning',
                        inputMessage: '选择部门：技术/市场/财务/人事/运营'
                    },
                    {
                        range: 'D2:D20',
                        type: 'text',
                        operator: 'lengthBetween',
                        value: [3, 15],
                        errorMessage: '⚠️ 职位长度必须在 3-15 个字符之间',
                        errorStyle: 'warning'
                    },
                    {
                        range: 'E2:E20',
                        type: 'regex',
                        pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
                        errorMessage: '⚠️ 请输入有效的邮箱地址（如 user@example.com）',
                        errorStyle: 'warning',
                        inputMessage: '格式：用户名@域名.后缀'
                    },
                    {
                        range: 'F2:F20',
                        type: 'datetime',
                        operator: 'between',
                        value: ['2020-01-01 00:00:00', '2026-12-31 23:59:59'],
                        errorMessage: '⚠️ 请输入 2020-2026 年内的日期时间',
                        errorStyle: 'warning'
                    },
                    {
                        range: 'G2:G20',
                        type: 'regex',
                        pattern: '^.*@.*\\..*$',
                        errorMessage: '⚠️ 邮箱格式必须包含 @ 和 . 符号',
                        errorStyle: 'warning'
                    },
                    {
                        range: 'H2:H20',
                        type: 'unique',
                        errorMessage: '🚫 唯一编号不能重复！',
                        errorStyle: 'stop'
                    },
                    // ════════════════════════════════════════
                    // 🔄 同步验证示例 (8个) - 简单公式 + errorStyle:'stop'
                    // 特点：即时响应，可立即阻止非法输入
                    // ════════════════════════════════════════

                    {
                        range: 'I2:I20',
                        type: 'formula',
                        formula: '=I{row}>0',
                        errorMessage: '⛔ 数值必须大于0（同步-立即阻止）',
                        errorStyle: 'stop',
                        description: '[同步] 基础数值比较运算符 >'
                    },
                    {
                        range: 'J2:J20',
                        type: 'formula',
                        formula: '=AND(J{row}>=0, J{row}<=100)',
                        errorMessage: '⛔ 数值必须在0-100范围内（同步-范围检查）',
                        errorStyle: 'stop',
                        description: '[同步] AND逻辑组合 + 范围检查'
                    },
                    {
                        range: 'K2:K20',
                        type: 'formula',
                        formula: '=INT(K{row})=K{row}',
                        errorMessage: '⛔ 必须是整数（同步-整数验证）',
                        errorStyle: 'stop',
                        description: '[同步] INT函数 - 整数类型检查'
                    },
                    {
                        range: 'L2:L20',
                        type: 'formula',
                        formula: '=ISEVEN(L{row})',
                        errorMessage: '⛔ 必须是偶数（同步-奇偶性检查）',
                        errorStyle: 'stop',
                        description: '[同步] ISEVEN函数 - 偶数判断'
                    },
                    {
                        range: 'M2:M20',
                        type: 'formula',
                        formula: '=LEN(M{row})>=5',
                        errorMessage: '⛔ 文本长度不足：需要>=5字符（同步-长度验证）',
                        errorStyle: 'stop',
                        description: '[同步] LEN函数 - 文本长度限制'
                    },
                    {
                        range: 'N2:N20',
                        type: 'formula',
                        formula: '=AND(ISTEXT(N{row}), LEN(N{row})>0)',
                        errorMessage: '⛔ 必须是非空文本（同步-非空文本验证）',
                        errorStyle: 'stop',
                        description: '[同步] ISTEXT函数 + 复合条件'
                    },
                    {
                        range: 'O2:O20',
                        type: 'formula',
                        formula: '=AND(O{row}>=DATE(2024,1,1), O{row}<=DATE(2024,12,31))',
                        errorMessage: '🚫 日期必须在2024年内（同步-日期范围严格阻止）',
                        errorStyle: 'stop',
                        description: '[同步] DATE函数 - 固定日期范围（支持 YYYY-MM-DD 格式自动转换）',
                        hint: '输入格式：2024-06-15, 2024/06/15, 或 Date 对象'
                    },
                    {
                        range: 'P2:P20',
                        type: 'formula',
                        formula: '=OR(P{row}=TRUE, P{row}=FALSE)',
                        errorMessage: '⛔ 必须是布尔值TRUE/FALSE（严格模式：禁止0/1/"true"/"false"等）',
                        errorStyle: 'stop',
                        description: '[同步] OR逻辑 + 布尔值常量（严格类型检查，使用===）',
                        hint: '只接受 JavaScript 布尔值 true 或 false，其他所有值（包括数字0/1、字符串）都会被阻止'
                    },

                    // ════════════════════════════════════════
                    // ⏳ 异步验证示例 (9个) - 复杂函数 + errorStyle:'warning'
                    // 特点：使用FormulaEngine完整功能，后台执行后标记
                    // ════════════════════════════════════════

                    {
                        range: 'Q2:Q20',
                        type: 'formula',
                        formula: '=SUM(I{row}:P{row})<500',
                        errorMessage: '⚠️ 行总和超过500（异步-SUM聚合函数）',
                        errorStyle: 'warning',
                        description: '[异步] SUM聚合函数 - 行汇总限制'
                    },
                    {
                        range: 'R2:R20',
                        type: 'formula',
                        formula: '=AVERAGE(I{row},K{row},L{row},Q{row})>0',
                        errorMessage: '⚠️ 平均值必须>0（异步-AVERAGE统计函数）',
                        errorStyle: 'warning',
                        description: '[异步] AVERAGE统计函数 - 多列平均'
                    },
                    {
                        range: 'S2:S20',
                        type: 'formula',
                        formula: '=COUNTIF(E{row},"*@*")>0',
                        errorMessage: '⚠️ 邮箱格式不包含@符号（异步-COUNTIF条件计数）',
                        errorStyle: 'warning',
                        description: '[异步] COUNTIF条件函数 - 通配符匹配'
                    },
                    {
                        range: 'T2:T20',
                        type: 'formula',
                        formula: '=IFERROR(INT(T{row}),0)=T{row}',
                        errorMessage: '⚠️ 无法转换为整数（异步-IFERROR错误处理）',
                        errorStyle: 'warning',
                        description: '[异步] IFERROR条件函数 - 安全转换'
                    },
                    {
                        range: 'U2:U20',
                        type: 'formula',
                        formula: '=AND(I{row}>0, LEN(M{row})>=5, Q{row}<100)',
                        errorMessage: '⚠️ 复合条件不满足（异步-AND多字段联动）',
                        errorStyle: 'warning',
                        description: '[异步] AND复合逻辑 - 跨多列联合验证'
                    },
                    {
                        range: 'V2:V20',
                        type: 'formula',
                        formula: '=OR(I{row}<0, I{row}>100, M{row}="特殊")',
                        errorMessage: '⚠️ 触发了异常值规则（异步-OR多条件容错）',
                        errorStyle: 'warning',
                        description: '[异步] OR多条件逻辑 - 异常检测'
                    },
                    {
                        range: 'W2:W20',
                        type: 'formula',
                        formula: '=NOT(ISBLANK(W{row}))',
                        errorMessage: '⚠️ 不能为空（异步-NOT+ISBLANK组合）',
                        errorStyle: 'warning',
                        description: '[异步] NOT非运算 + ISBLANK空值检查'
                    },
                    {
                        range: 'X2:X20',
                        type: 'formula',
                        formula: '=AND(X{row}>=MIN(I{row}:L{row}), X{row}<=MAX(I{row}:L{row}))',
                        errorMessage: '⚠️ 超出历史数据范围（异步-MAX/MIN极值函数）',
                        errorStyle: 'warning',
                        description: '[异步] MAX/MIN数学函数 - 动态范围'
                    },
                    {
                        range: 'Y2:Y20',
                        type: 'formula',
                        formula: '=ISNUMBER(VLOOKUP(Y{row},$B$2:$D$20,1,FALSE))',
                        errorMessage: '⚠️ 未在员工列表中找到（异步-VLOOKUP查找函数）',
                        errorStyle: 'warning',
                        description: '[异步] VLOOKUP查找函数 - 外键约束'
                    }
                ]
            }
        },
        hooks:{
            beforeValidate: function(value, context) {
                console.log('🪝 [BEFORE_VALIDATE] 值=' + JSON.stringify(value) + ' 位置=(' + context.row + ',' + context.col + ')', 'info');
            }
        }
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
    for (let i = 0; i < 300; i++) {
        sheet.setCell(i, 0, i);
    }

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

    // ═══════════════════════════════════════════════════════════════════════
    // 📌 自定义公式函数注册（v3.0 新功能）
    // ═══════════════════════════════════════════════════════════════════════
    //
    // 注册业务逻辑注入的自定义函数，供公式验证使用
    // 函数注册后可通过 FormulaEngine.evaluate() 调用
    //
    const registerCustomValidationFunctions = () => {
        // 使用静态方法注册自定义函数
        // 静态方法直接调用 functionRegistry，不需要 FormulaEngine 实例

        // 注册自定义函数：ISPRIME - 判断是否为质数
        functionRegistry.register?.("ISPRIME", (args) => {
            console.log("ISPRIME", args);
            const value = Number(args[0]);
            if (value === null || value === undefined || isNaN(value)) {
                return false;
            }
            const num = Math.abs(Math.floor(value));
            if (num < 2) return false;
            if (num === 2) return true;
            if (num % 2 === 0) return false;
            for (let i = 3; i <= Math.sqrt(num); i += 2) {
                if (num % i === 0) return false;
            }
            return true;
        });

        // 注册自定义函数：ISPOSITIVE - 判断是否为正数
        functionRegistry.register?.("ISPOSITIVE", (args) => {
            console.log("ISPOSITIVE", args);
            const value = Number(args[0]);
            return !isNaN(value) && value > 0;
        });

        // 注册自定义函数：ISBETWEEN - 判断是否在指定范围内
        functionRegistry.register("ISBETWEEN", (args) => {
            console.log("ISBETWEEN", args);
            const [value, min, max] = args;
            if (isNaN(value) || isNaN(min) || isNaN(max)) {
                return false;
            }
            return value >= min && value <= max;
        });

        // 注册自定义函数：GETLETTERGRADE - 根据分数返回等级
        functionRegistry.register("GETLETTERGRADE", (args) => {
            console.log("GETLETTERGRADE", args);
            const score = args[0];
            if (isNaN(score)) return "F";
            if (score >= 90) return "A";
            if (score >= 80) return "B";
            if (score >= 70) return "C";
            if (score >= 60) return "D";
            return "F";
        });

        // 注册自定义函数：VALIDATEEMAIL - 验证邮箱格式
        functionRegistry.register("VALIDATEEMAIL", (args) => {
            console.log("VALIDATEEMAIL", args);
            const email = String(args[0] || "");
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        });

        // 注册自定义函数：CALCULATEBMI - 计算BMI指数
        functionRegistry.register("CALCULATEBMI", (args) => {
            console.log("CALCULATEBMI", args);
            const [weight, height] = args;
            if (isNaN(weight) || isNaN(height) || height <= 0) {
                return NaN;
            }
            return weight / (height * height);
        });
    };

    // 执行自定义函数注册
    registerCustomValidationFunctions();

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