/**
 * SearchPlugin 替换功能 + 撤销支持 测试
 *
 * 覆盖设计文档 8.6 章节的所有撤销场景
 */
import { describe, it, expect, beforeEach, jest } from "vitest";

import { SearchPlugin } from "../SearchPlugin.js";
import { SetCellCommand } from "../../model/command/SetCellCommand.js";
import { BatchCommand } from "../../model/command/BatchCommand.js";
import { Cell } from "../../model/store/Cell.js";

// Mock 依赖模块
jest.mock("../../model/command/SetCellCommand.js");
jest.mock("../../model/command/BatchCommand.js");
jest.mock("../../model/store/Cell.js");

describe("SearchPlugin Replace with Undo Support", () => {
    let workbook;
    let searchPlugin;
    let sheet;

    /**
     * 创建模拟的 Workbook 对象
     */
    function createMockWorkbook() {
        return {
            element: document.createElement("div"),
            renderEngine: {
                scrollToCell: jest.fn(),
                markDirty: jest.fn(),
                markDirtyCell: jest.fn(),
            },
            activeSheet: createMockSheet(),
            eventHandler: {
                hooks: {
                    run: jest.fn().mockReturnValue(true),
                    addHook: jest.fn(),
                },
            },
        };
    }

    /**
     * 创建模拟的 Sheet 对象
     */
    function createMockSheet() {
        const cellStore = new Map();

        return {
            cellStore: {
                get: (row, col) => cellStore.get(`${row},${col}`),
                set: (row, col, cell) => cellStore.set(`${row},${col}`, cell),
                iterateAll: (callback) => {
                    cellStore.forEach((cell, key) => {
                        const [row, col] = key.split(",").map(Number);
                        callback(cell, row, col);
                    });
                },
                getCellValue: (row, col) => {
                    const cell = cellStore.get(`${row},${col}`);
                    return cell?.value;
                },
            },
            batchOp: {
                pushCommand: jest.fn(),
            },
            history: {
                undoStack: [],
                redoStack: [],
                undo: jest.fn(),
                redo: jest.fn(),
            },
            selectionManager: {
                setActive: jest.fn(),
                getRange: jest.fn().mockReturnValue({
                    topRow: 0,
                    bottomRow: 2,
                    topCol: 0,
                    bottomCol: 1,
                }),
            },
            dataCoordinator: {
                isDisabled: jest.fn().mockReturnValue(false),
            },
            mergeManager: {
                isMainCell: jest.fn().mockReturnValue(true),
            },
            _ensureWritable: jest.fn().mockReturnValue(true),
            _invalidateCell: jest.fn(),
            bus: {
                emit: jest.fn(),
            },
        };
    }

    beforeEach(async () => {
        // 初始化测试数据
        workbook = createMockWorkbook();
        sheet = workbook.activeSheet;

        // 预填充单元格数据
        sheet.cellStore.set(0, 0, new Cell("hello", 0, false, null));
        sheet.cellStore.set(1, 0, new Cell("hello", 0, false, null));
        sheet.cellStore.set(2, 1, new Cell("goodbye hello", 0, false, null));

        // 创建插件实例
        searchPlugin = new SearchPlugin(workbook);
        searchPlugin.init({ enabled: true });
    });

    describe("单个替换 (replace)", () => {
        it("单个替换应支持 Ctrl+Z 撤销", async () => {
            // 1. 搜索 "hello"
            const results = await searchPlugin.query("hello");
            expect(results).toHaveLength(3);

            // 2. 替换第一个结果
            const success = await searchPlugin.replace("hi");
            expect(success).toBeTruthy();

            // 3. 验证替换生效
            expect(sheet.cellStore.getCellValue(0, 0)).toBe("hi");

            // 4. 验证 SetCellCommand 已创建并推入历史栈
            expect(SetCellCommand).toHaveBeenCalled();
            expect(sheet.batchOp.pushCommand).toHaveBeenCalledTimes(1);

            // 5. 模拟撤销操作
            const pushedCmd = sheet.batchOp.pushCommand.mock.calls[0][0];
            pushedCmd.undo(); // 调用命令的 undo 方法

            // 6. 验证已恢复原值 ✅
            expect(sheet.cellStore.getCellValue(0, 0)).toBe("hello");
        });

        it("替换失败时应返回 false 且不推入历史栈", async () => {
            // 搜索一个不存在的词
            await searchPlugin.query("nonexistent");

            // 尝试替换（应该失败）
            const success = await searchPlugin.replace("new value");
            expect(success).toBeFalsy();

            // 不应有任何命令被推入
            expect(sheet.batchOp.pushCommand).not.toHaveBeenCalled();
        });
    });

    describe("全部替换 (replaceAll)", () => {
        it("全部替换应支持一键撤销所有更改", async () => {
            // 1. 搜索 "hello"
            await searchPlugin.query("hello");

            // 2. 全部替换为 "hi"
            const count = await searchPlugin.replaceAll("hi");
            expect(count).toBe(3);

            // 3. 验证 BatchCommand 已创建并使用
            expect(BatchCommand).toHaveBeenCalled();
            expect(sheet.batchOp.pushCommand).toHaveBeenCalledTimes(1);

            // 4. 验证 BatchCommand 包含 3 个子命令
            const batchCmd = sheet.batchOp.pushCommand.mock.calls[0][0];
            expect(batchCmd.commands).toHaveLength(3);

            // 5. 模拟一键撤销
            batchCmd.undo();

            // 6. 验证所有单元格都恢复了！✅
            expect(sheet.cellStore.getCellValue(0, 0)).toBe("hello");
            expect(sheet.cellStore.getCellValue(1, 0)).toBe("hello");
            expect(sheet.cellStore.getCellValue(2, 1)).toBe("goodbye hello");
        });

        it("全部替换的 BatchCommand 应仅占 1 个撤销槽位", async () => {
            await searchPlugin.query("hello");

            // 记录当前栈深度
            const stackDepthBefore = sheet.history.undoStack.length;

            // 全部替换
            await searchPlugin.replaceAll("hi");

            // 验证栈深度仅增加 1（而不是 3）
            expect(sheet.history.undoStack.length).toBe(stackDepthBefore + 1); // ✅
        });

        it("全部替换应跳过只读单元格", async () => {
            // 设置某个单元格为只读
            sheet.dataCoordinator.isDisabled.mockImplementation((row, col) => {
                return row === 1 && col === 0; // 第 2 行第 1 列只读
            });

            await searchPlugin.query("hello");
            const count = await searchPlugin.replaceAll("hi");

            // 应只替换 2 个（跳过 1 个只读的）
            expect(count).toBe(2);
        });

        it("全部替换应跳过非主合并单元格", async () => {
            // 模拟合并单元格：只有 (0,0) 是主单元格
            sheet.mergeManager.isMainCell.mockImplementation((row, col) => {
                return row === 0 && col === 0;
            });

            await searchPlugin.query("hello");
            const count = await searchPlugin.replaceAll("hi");

            // 应只替换 1 个主单元格
            expect(count).toBe(1);
        });
    });

    describe("连续多次替换", () => {
        it("连续多次替换应分别记录在历史栈中", async () => {
            await searchPlugin.query("hello");

            // 第 1 次替换
            await searchPlugin.replace("hi1");

            // 第 2 次替换（下一个匹配项）
            await searchPlugin.findNext();
            await searchPlugin.replace("hi2");

            // 第 3 次替换
            await searchPlugin.findNext();
            await searchPlugin.replace("hi3");

            // 验证有 3 个独立命令被推入
            expect(sheet.batchOp.pushCommand).toHaveBeenCalledTimes(3);
        });

        it("替换后重做应重新应用替换", async () => {
            await searchPlugin.query("hello");
            await searchPlugin.replace("hi");

            // 获取推送的命令
            const cmd = sheet.batchOp.pushCommand.mock.calls[0][0];

            // 模拟撤销
            cmd.undo();
            expect(sheet.cellStore.getCellValue(0, 0)).toBe("hello");

            // 模拟重做
            cmd.redo();
            expect(sheet.cellStore.getCellValue(0, 0)).toBe("hi"); // 又变回 "hi" ✅
        });
    });

    describe("Hook 集成", () => {
        it("替换前应触发 BEFORE_SEARCH_REPLACE Hook", async () => {
            await searchPlugin.query("hello");

            // 设置 Hook 返回 false 以阻止替换
            workbook.eventHandler.hooks.run.mockImplementation((hookName) => {
                if (hookName === "beforeSearchReplace") {
                    return false; // 阻止替换
                }
                return true;
            });

            const success = await searchPlugin.replace("blocked");

            // 替换应该被阻止
            expect(success).toBeFalsy();
            expect(sheet.batchOp.pushCommand).not.toHaveBeenCalled();
        });

        it("替换后应触发 AFTER_SEARCH_REPLACE Hook", async () => {
            await searchPlugin.query("hello");
            await searchPlugin.replace("hi");

            // 验证 Hook 被调用
            expect(workbook.eventHandler.hooks.run).toHaveBeenCalledWith(
                "afterSearchReplace",
                expect.objectContaining({
                    row: expect.any(Number),
                    col: expect.any(Number),
                    oldValue: expect.any(String),
                    newValue: "hi",
                }),
            );
        });
    });
});
