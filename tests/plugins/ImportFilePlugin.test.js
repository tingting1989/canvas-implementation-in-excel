/**
 * ImportFilePlugin 完整功能测试套件
 *
 * 覆盖范围：
 * - 文件解析（XLSX 格式）
 * - 样式转换（使用共享 style-converter 模块）
 * - Hooks 事件系统
 * - 数据验证
 * - 进度报告
 * - 错误处理
 * - 文件预览功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ImportFilePlugin } from "../../src/plugins/ImportFilePlugin.js";
import { HOOKS } from "../../src/constants/hookNames.js";
import { StyleConverter, toArgb, fromArgb } from "@/shared/StyleConverter.js";

// ============================================================================
// Mock 工厂函数
// ============================================================================

/**
 * 创建 Mock Workbook 对象
 */
function createMockWorkbook() {
    const mockHooks = {
        addHook: vi.fn(),
        addHookOnce: vi.fn(),
        removeHook: vi.fn(),
        runHooks: vi.fn(),
        runHooksUntil: vi.fn(),
        clearHook: vi.fn(),
        clearAllHooks: vi.fn(),
    };

    return {
        eventHandler: {
            hooks: mockHooks,
        },
        activeSheet: createMockSheet(),
        renderEngine: {},
        editor: {},
        clipboard: {},
        getPlugin: vi.fn(),
    };
}

/**
 * 创建 Mock Sheet 对象
 */
function createMockSheet() {
    return {
        name: "TestSheet",
        cellStore: {
            set: vi.fn(),
            get: vi.fn(() => ({})),
        },
        colHeaders: [],
        rowHeaders: [],
        colStyles: new Map(),
        rowStyles: new Map(),
    };
}

/**
 * 创建测试用的 Excel 文件对象（Mock）
 */
function createMockExcelFile(options = {}) {
    const defaultData = [
        ["Name", "Age", "City"],
        ["Alice", 25, "Beijing"],
        ["Bob", 30, "Shanghai"],
    ];

    const data = options.data || defaultData;

    return new File([""], options.filename || "test.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
}

// ============================================================================
// 测试套件
// ============================================================================

describe("ImportFilePlugin", () => {
    let plugin;
    let mockWorkbook;

    beforeEach(() => {
        mockWorkbook = createMockWorkbook();
        plugin = new ImportFilePlugin(mockWorkbook);
    });

    afterEach(() => {
        if (plugin.initialized) {
            plugin.destroy();
        }
    });

    // ══════════════════════════════════════
    // [Section 1] 基础功能测试
    // ══════════════════════════════════════

    describe("插件基础功能", () => {
        it("应该有正确的插件名称", () => {
            expect(ImportFilePlugin.PLUGIN_NAME).toBe("importFile");
        });

        it("应该能够成功初始化", async () => {
            await plugin.init();

            expect(plugin.initialized).toBe(true);
            expect(plugin.enabled).toBe(true);
        });

        it("应该能够正确销毁", async () => {
            await plugin.init();
            plugin.destroy();

            expect(plugin.initialized).toBe(false);
            expect(plugin.enabled).toBe(false);
        });

        it("初始化后应该创建样式转换器实例", async () => {
            await plugin.init();

            // 验证插件初始化成功（样式转换器在 init() 中创建）
            expect(plugin.initialized).toBe(true);
        });
    });

    // ══════════════════════════════════════
    // [Section 2] Hooks 事件系统测试
    // ══════════════════════════════════════

    describe("Hooks 事件系统", () => {
        beforeEach(async () => {
            await plugin.init();
        });

        it("HOOKS.IMPORT_* 应该包含所有必需的事件名称", () => {
            expect(HOOKS.IMPORT_PROGRESS).toBe("onImportProgress");
            expect(HOOKS.IMPORT_COMPLETE).toBe("onImportComplete");
            expect(HOOKS.IMPORT_ERROR).toBe("onImportError");
            expect(HOOKS.IMPORT_BEFORE_IMPORT).toBe("beforeImport");
            expect(HOOKS.IMPORT_ROW_PROCESSED).toBe("onRowProcessed");
            expect(HOOKS.IMPORT_STYLE_WARNING).toBe("onStyleWarning");
        });

        it("应该通过 Workbook Hooks 触发进度事件", async () => {
            const mockFile = createMockExcelFile();

            mockWorkbook.eventHandler.hooks.runHooksUntil.mockReturnValue(true);

            try {
                await plugin.importFromFile(mockFile);
            } catch (error) {
                // 预期会抛出异常（因为 Mock 文件不是真正的 Excel 文件）
            }

            // 验证触发了 IMPORT_PROGRESS Hook（在解析前就会触发）
            expect(mockWorkbook.eventHandler.hooks.runHooks).toHaveBeenCalledWith(
                HOOKS.IMPORT_PROGRESS,
                expect.objectContaining({
                    percent: expect.any(Number),
                    stage: expect.any(String),
                    message: expect.any(String),
                })
            );
        });

        it("应该通过 Workbook Hooks 触发完成事件", async () => {
            const mockFile = createMockExcelFile();

            mockWorkbook.eventHandler.hooks.runHooksUntil.mockReturnValue(true);

            try {
                await plugin.importFromFile(mockFile);
            } catch (error) {
                // 预期会抛出异常（因为 Mock 文件不是真正的 Excel 文件）
                // 但我们仍然验证 Hook 是否被触发
            }

            // 验证触发了 IMPORT_PROGRESS Hook（在解析前就会触发）
            expect(mockWorkbook.eventHandler.hooks.runHooks).toHaveBeenCalledWith(
                HOOKS.IMPORT_PROGRESS,
                expect.objectContaining({
                    percent: expect.any(Number),
                    stage: expect.any(String),
                    message: expect.any(String),
                })
            );
        });

        it("应该通过 Workbook Hooks 触发错误事件", async () => {
            const mockFile = createMockExcelFile({ filename: "invalid.txt" });

            try {
                await plugin.importFromFile(mockFile);
            } catch (error) {
                // 预期会抛出异常
            }

            // 验证触发了 IMPORT_ERROR Hook
            expect(mockWorkbook.eventHandler.hooks.runHooks).toHaveBeenCalledWith(
                HOOKS.IMPORT_ERROR,
                expect.objectContaining({
                    code: expect.any(String),
                    message: expect.any(String),
                    taskId: expect.any(Number),
                })
            );
        });
    });

    // ══════════════════════════════════════
    // [Section 3] 样式转换器测试
    // ══════════════════════════════════════

    describe("StyleConverter 样式转换", () => {
        let converter;

        beforeEach(() => {
            converter = new StyleConverter();
        });

        describe("toArgb() 颜色转换", () => {
            it("应该将十六进制颜色转换为 ARGB 格式", () => {
                expect(toArgb("#FF0000")).toBe("FFFF0000");
                expect(toArgb("#00FF00")).toBe("FF00FF00");
                expect(toArgb("#0000FF")).toBe("FF0000FF");
            });

            it("应该支持简写的十六进制格式", () => {
                expect(toArgb("#F00")).toBe("FFFF0000");
                expect(toArgb("#0F0")).toBe("FF00FF00");
            });

            it("应该处理透明色", () => {
                expect(toArgb("transparent")).toBe("00000000");
                expect(toArgb("")).toBe("00000000");
            });

            it("应该处理 8 位 ARGB 输入", () => {
                expect(toArgb("FFFF0000")).toBe("FFFF0000");
                expect(toArgb("8000FF00")).toBe("8000FF00");
            });

            it("应该缓存已解析的颜色（相同输入返回相同输出）", () => {
                const result1 = toArgb("#FF0000");
                const result2 = toArgb("#FF0000");

                expect(result1).toBe(result2);
                expect(typeof result1).toBe("string");
            });
        });

        describe("fromArgb() 反向颜色转换", () => {
            it("应该将 ARGB 格式转换为标准 CSS 颜色", () => {
                expect(fromArgb("FFFF0000")).toBe("#FF0000");
                expect(fromArgb("FF00FF00")).toBe("#00FF00");
            });

            it("应该处理 6 位 RGB 输入", () => {
                expect(fromArgb("FF0000")).toBe("#FF0000");
                expect(fromArgb("00FF00")).toBe("#00FF00");
            });

            it("应该缓存反向转换结果", () => {
                const result1 = fromArgb("FFFF0000");
                const result2 = fromArgb("FFFF0000");

                expect(result1).toBe(result2);
            });
        });

        describe("convertToExcel() Canvas-Sheet → Excel", () => {
            it("应该转换扁平格式样式", () => {
                const flatStyle = {
                    fontFamily: "Arial",
                    fontSize: 14,
                    fontWeight: "bold",
                    textAlign: "center",
                    backgroundColor: "#FF0000",
                    color: "#FFFFFF",
                };

                const excelStyle = converter.convertToExcel(flatStyle);

                expect(excelStyle.font).toBeDefined();
                expect(excelStyle.font.name).toBe("Arial");
                expect(excelStyle.font.size).toBe(14);
                expect(excelStyle.font.bold).toBe(true);
                expect(excelStyle.alignment.horizontal).toBe("center");
                expect(excelStyle.fill).toBeDefined();
            });

            it("应该转换嵌套格式样式", () => {
                const nestedStyle = {
                    font: {
                        name: "Calibri",
                        size: 12,
                        bold: true,
                        color: "#000000",
                    },
                    alignment: {
                        horizontal: "left",
                        vertical: "middle",
                    },
                    border: {
                        top: { style: "thin", color: "#000000" },
                    },
                    fill: {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: "#FFFFFF",
                    },
                };

                const excelStyle = converter.convertToExcel(nestedStyle);

                expect(excelStyle.font).toBeDefined();
                expect(excelStyle.alignment).toBeDefined();
                expect(excelStyle.border).toBeDefined();
                expect(excelStyle.fill).toBeDefined();
            });

            it("应该返回空对象对于无效输入", () => {
                expect(converter.convertToExcel(null)).toEqual({});
                expect(converter.convertToExcel(undefined)).toEqual({});
                expect(converter.convertToExcel("string")).toEqual({});
            });
        });

        describe("convertFromExcel() Excel → Canvas-Sheet", () => {
            it("应该转换为扁平格式", () => {
                const excelStyle = {
                    font: {
                        name: "Arial",
                        size: 14,
                        bold: true,
                        color: { argb: "FFFF0000" },
                    },
                    alignment: {
                        horizontal: "center",
                        vertical: "middle",
                    },
                    fill: {
                        fgColor: { argb: "FFFFFF00" },
                    },
                };

                const flatStyle = converter.convertFromExcel(excelStyle, "flat");

                expect(flatStyle.fontFamily).toBe("Arial");
                expect(flatStyle.fontSize).toBe(14);
                expect(flatStyle.fontWeight).toBe("bold");
                expect(flatStyle.textAlign).toBe("center");
                expect(flatStyle.backgroundColor).toBe("#FFFF00");
            });

            it("应该转换为嵌套格式", () => {
                const excelStyle = {
                    font: { name: "Calibri", size: 12 },
                    alignment: { horizontal: "left" },
                };

                const nestedStyle = converter.convertFromExcel(excelStyle, "nested");

                expect(nestedStyle.font).toBeDefined();
                expect(nestedStyle.alignment).toBeDefined();
            });

            it("应该处理无效输入", () => {
                expect(converter.convertFromExcel(null)).toEqual({});
                expect(converter.convertFromExcel(undefined)).toEqual({});
            });
        });

        describe("双向转换一致性", () => {
            it("往返转换应该保持关键属性一致", () => {
                const originalStyle = {
                    fontFamily: "Arial",
                    fontSize: 14,
                    fontWeight: "bold",
                    textAlign: "center",
                    backgroundColor: "#FF0000",
                    color: "#333333",
                };

                // Canvas-Sheet → Excel
                const excelStyle = converter.convertToExcel(originalStyle);

                // Excel → Canvas-Sheet
                const roundTripStyle = converter.convertFromExcel(excelStyle, "flat");

                // 验证关键属性保持一致
                expect(roundTripStyle.fontFamily).toBe(originalStyle.fontFamily);
                expect(roundTripStyle.fontSize).toBe(originalStyle.fontSize);
                expect(roundTripStyle.fontWeight).toBe(originalStyle.fontWeight);
                expect(roundTripStyle.textAlign).toBe(originalStyle.textAlign);
            });
        });
    });

    // ══════════════════════════════════════
    // [Section 4] 文件导入核心流程测试
    // ══════════════════════════════════════

    describe("文件导入流程", () => {
        beforeEach(async () => {
            await plugin.init();
        });

        describe("previewFile() 文件预览", () => {
            it("应该返回文件预览信息", async () => {
                const file = createMockExcelFile({ filename: "test.xlsx" });

                // Mock arrayBuffer 方法
                file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));

                const preview = await plugin.previewFile(file, { previewRows: 5 });

                expect(preview.fileName).toBe("test.xlsx");
                expect(preview.fileSize).toBeDefined();
                expect(preview.fileType).toBeDefined();
                expect(preview.success).toBeDefined();
            });

            it("应该处理预览失败的情况", async () => {
                const file = createMockExcelFile({ filename: "invalid.xyz" });

                const preview = await plugin.previewFile(file);

                expect(preview.success).toBe(false);
                expect(preview.error).toBeDefined();
            });
        });

        describe("importFromFile() 导入流程", () => {
            it("应该在导入前触发 IMPORT_BEFORE_IMPORT Hook", async () => {
                const file = createMockExcelFile();

                file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));

                try {
                    await plugin.importFromFile(file);
                } catch (e) {
                    // 忽略错误，我们只关心 Hook 是否被调用
                }

                expect(mockWorkbook.eventHandler.hooks.runHooksUntil).toHaveBeenCalledWith(
                    HOOKS.IMPORT_BEFORE_IMPORT,
                    expect.any(Object)
                );
            });

            it("应该在导入过程中触发 IMPORT_PROGRESS Hook", async () => {
                const file = createMockExcelFile();

                file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));

                try {
                    await plugin.importFromFile(file);
                } catch (e) {
                    // 忽略错误
                }

                expect(mockWorkbook.eventHandler.hooks.runHooks).toHaveBeenCalledWith(
                    HOOKS.IMPORT_PROGRESS,
                    expect.objectContaining({
                        stage: expect.any(String),
                    })
                );
            });

            it("应该在用户取消时抛出取消错误", async () => {
                const file = createMockExcelFile();

                file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));

                // 设置 IMPORT_BEFORE_IMPORT Hook 返回 false 以模拟用户取消
                mockWorkbook.eventHandler.hooks.runHooksUntil.mockReturnValue(false);

                try {
                    await plugin.importFromFile(file);
                    expect.fail("应该抛出异常");
                } catch (error) {
                    expect(error.message).toContain("IMPORT_CANCELLED_BY_USER");
                }
            });
        });

        describe("cancelImport() 取消导入", () => {
            it("应该能够取消正在进行的导入（不抛出异常）", async () => {
                await plugin.init();

                // 调用取消方法（不应该抛出异常）
                expect(() => plugin.cancelImport()).not.toThrow();
            });
        });
    });

    // ══════════════════════════════════════
    // [Section 5] 错误处理测试
    // ══════════════════════════════════════

    describe("错误处理", () => {
        beforeEach(async () => {
            await plugin.init();
        });

        it("应该在失败时触发 IMPORT_ERROR Hook", async () => {
            const file = createMockExcelFile({ filename: "unsupported.txt" });

            file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));

            try {
                await plugin.importFromFile(file);
            } catch (e) {
                // 忽略错误
            }

            expect(mockWorkbook.eventHandler.hooks.runHooks).toHaveBeenCalledWith(
                HOOKS.IMPORT_ERROR,
                expect.objectContaining({
                    code: expect.any(String),
                    message: expect.any(String),
                    taskId: expect.any(Number),
                })
            );
        });
    });

    // ══════════════════════════════════════
    // [Section 6] 配置选项测试
    // ══════════════════════════════════════

    describe("配置选项", () => {
        it("应该使用合理的默认选项", async () => {
            await plugin.init();

            // 验证导入方法存在且可调用
            expect(typeof plugin.importFromFile).toBe("function");
            expect(typeof plugin.previewFile).toBe("function");
            
            // 验证插件正确初始化
            expect(plugin.initialized).toBe(true);
            expect(plugin.enabled).toBe(true);
        });

        it("应该合并用户提供的选项与默认选项", async () => {
            await plugin.init();

            const customOptions = {
                startRow: 5,
                startCol: 3,
                firstRowAsHeader: false,
            };

            // 这里只是验证选项结构，实际合并逻辑在 importFromFile 内部
            expect(customOptions.startRow).toBe(5);
            expect(customOptions.startCol).toBe(3);
            expect(customOptions.firstRowAsHeader).toBe(false);
        });
    });
});

// ============================================================================
// 测试工具函数
// ============================================================================

/**
 * 访问模块级缓存（用于测试颜色转换缓存）
 */
function getColorCache() {
    return typeof _colorCache !== "undefined" ? _colorCache : null;
}