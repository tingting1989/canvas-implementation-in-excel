import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClipboardManager } from "@/editor/ClipboardManager";

function createMockSheet(cells: Record<string, unknown> = {}) {
    const store = new Map<string, { value: unknown; styleId: number }>();
    for (const [key, value] of Object.entries(cells)) {
        store.set(key, { value, styleId: 0 });
    }

    return {
        name: "Sheet1",
        cellStore: {
            get: (r: number, c: number) => store.get(`${r},${c}`),
        },
        cellDataAccessor: {
            getValueMatrix: (topRow: number, topCol: number, bottomRow: number, bottomCol: number) => {
                const matrix: unknown[][] = [];
                for (let r = topRow; r <= bottomRow; r++) {
                    const rowData: unknown[] = [];
                    for (let c = topCol; c <= bottomCol; c++) {
                        const cell = store.get(`${r},${c}`);
                        rowData.push(cell ? cell.value : "");
                    }
                    matrix.push(rowData);
                }
                return matrix;
            },
            get: (row: number, col: number) => store.get(`${row},${col}`),
        },
        selection: {
            getRange: vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 })),
            getActive: vi.fn(() => [0, 0]),
            setRange: vi.fn(),
            setActive: vi.fn(),
        },
        getCellTypeInstance: vi.fn(() => ({ name: "text" })),
        render: vi.fn(),
        getColumnConfig: vi.fn(() => null),
        cellTypes: new Map(),
        setCell: vi.fn(),
        beginBatch: vi.fn(),
        endBatch: vi.fn(),
        invalidateAll: vi.fn(),
        isDisabled: vi.fn(() => false),
        parseCellValue: vi.fn((_r: number, _c: number, v: unknown) => v),
        formatCellValue: vi.fn((_r: number, _c: number, v: unknown) => String(v ?? "")),
        rowColManager: { ensureSize: vi.fn() },
    };
}

describe("ClipboardManager", () => {
    describe("构造函数和基础属性", () => {
        it("CM-01: 应正确创建实例", () => {
            const cm = new ClipboardManager();
            expect(cm).toBeInstanceOf(ClipboardManager);
        });

        it("CM-02: 初始状态无剪贴板数据", () => {
            const cm = new ClipboardManager();
            expect(cm.getClipboardData()).toBeNull();
        });
    });

    describe("copy()", () => {
        it("CM-03: 应存储复制的选区数据", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet({ "0,0": "A", "0,1": "B" });
            sheet.selection.getRange = vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 1 }));
            cm.copy(sheet);
            const data = cm.getClipboardData();
            expect(data).not.toBeNull();
            expect(data!.sourceSheetName).toBe("Sheet1");
            expect(data!.rows).toBe(1);
            expect(data!.cols).toBe(2);
        });

        it("CM-04: 应复制单元格值", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet({ "0,0": "Hello", "0,1": "World" });
            sheet.selection.getRange = vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 1 }));
            cm.copy(sheet);
            const data = cm.getClipboardData();
            expect(data!.cells[0][0]!.value).toBe("Hello");
            expect(data!.cells[0][1]!.value).toBe("World");
        });

        it("CM-05: 应记录列类型", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet({ "0,0": "A" });
            sheet.selection.getRange = vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 }));
            cm.copy(sheet);
            const data = cm.getClipboardData();
            expect(data!.columnTypes).toBeDefined();
            expect(data!.columnTypes[0]).toBe("text");
        });

        it("CM-06: 应记录源工作表名称", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet({ "0,0": "X" });
            sheet.name = "TestSheet";
            sheet.selection.getRange = vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 }));
            cm.copy(sheet);
            expect(cm.getClipboardData()!.sourceSheetName).toBe("TestSheet");
        });

        it("CM-07: 应记录样式ID", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            const store = new Map<string, { value: unknown; styleId: number }>();
            store.set("0,0", { value: "styled", styleId: 5 });
            sheet.cellDataAccessor.get = vi.fn((r: number, c: number) => store.get(`${r},${c}`));
            sheet.cellDataAccessor.getValueMatrix = vi.fn(() => [["styled"]]);
            sheet.selection.getRange = vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 }));
            cm.copy(sheet);
            const data = cm.getClipboardData();
            expect(data!.cells[0][0]!.styleId).toBe(5);
        });
    });

    describe("clear()", () => {
        it("CM-08: 应清空剪贴板数据", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet({ "0,0": "A" });
            sheet.selection.getRange = vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 }));
            cm.copy(sheet);
            expect(cm.getClipboardData()).not.toBeNull();
            cm.clear();
            expect(cm.getClipboardData()).toBeNull();
        });

        it("CM-09: 多次 clear 不抛异常", () => {
            const cm = new ClipboardManager();
            expect(() => { cm.clear(); cm.clear(); }).not.toThrow();
        });
    });

    describe("pasteText()", () => {
        it("CM-10: 空文本不抛异常", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            sheet.selection.getActive = vi.fn(() => [0, 0]);
            expect(() => cm.pasteText(sheet, "")).not.toThrow();
        });

        it("CM-11: 单值粘贴应调用 setCell", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            sheet.selection.getActive = vi.fn(() => [0, 0]);
            cm.pasteText(sheet, "hello");
            expect(sheet.setCell).toHaveBeenCalled();
        });

        it("CM-12: Tab 分隔值粘贴", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            sheet.selection.getActive = vi.fn(() => [0, 0]);
            cm.pasteText(sheet, "A\tB\tC");
            expect(sheet.setCell).toHaveBeenCalledTimes(3);
        });

        it("CM-13: 换行分隔的多行粘贴", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            sheet.selection.getActive = vi.fn(() => [0, 0]);
            cm.pasteText(sheet, "A1\tB1\nA2\tB2");
            expect(sheet.setCell).toHaveBeenCalledTimes(4);
        });

        it("CM-14: 粘贴后应调用 beginBatch/endBatch", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            sheet.selection.getActive = vi.fn(() => [0, 0]);
            cm.pasteText(sheet, "value");
            expect(sheet.beginBatch).toHaveBeenCalled();
            expect(sheet.endBatch).toHaveBeenCalled();
        });

        it("CM-15: 粘贴后应调用 invalidateAll 和 render", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            sheet.selection.getActive = vi.fn(() => [0, 0]);
            cm.pasteText(sheet, "value");
            expect(sheet.invalidateAll).toHaveBeenCalled();
            expect(sheet.render).toHaveBeenCalled();
        });

        it("CM-16: 禁用单元格不应写入", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            sheet.selection.getActive = vi.fn(() => [0, 0]);
            sheet.isDisabled = vi.fn(() => true);
            cm.pasteText(sheet, "value");
            expect(sheet.setCell).not.toHaveBeenCalled();
        });
    });

    describe("pasteInternal()", () => {
        it("CM-17: 无内部数据时不操作", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            sheet.selection.getActive = vi.fn(() => [0, 0]);
            cm.pasteInternal(sheet);
            expect(sheet.setCell).not.toHaveBeenCalled();
        });

        it("CM-18: 有内部数据时粘贴", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet({ "0,0": "A", "0,1": "B" });
            sheet.selection.getRange = vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 1 }));
            cm.copy(sheet);

            const targetSheet = createMockSheet();
            targetSheet.selection.getActive = vi.fn(() => [2, 3]);
            cm.pasteInternal(targetSheet);
            expect(targetSheet.setCell).toHaveBeenCalled();
        });
    });

    describe("pasteFromEvent()", () => {
        it("CM-19: 无剪贴板项且无内部数据时返回 false", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            const event = { clipboardData: { items: [] } } as unknown as ClipboardEvent;
            const result = cm.pasteFromEvent(sheet, event);
            expect(result).toBe(false);
        });

        it("CM-20: 无剪贴板项但有内部数据时返回 true", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet({ "0,0": "A" });
            sheet.selection.getRange = vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 }));
            cm.copy(sheet);

            const targetSheet = createMockSheet();
            targetSheet.selection.getActive = vi.fn(() => [0, 0]);
            const event = { clipboardData: { items: [] } } as unknown as ClipboardEvent;
            const result = cm.pasteFromEvent(targetSheet, event);
            expect(result).toBe(true);
        });

        it("CM-21: 有文本项时返回 true", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            sheet.selection.getActive = vi.fn(() => [0, 0]);

            const textItem = {
                type: "text/plain",
                getAsString: vi.fn((cb: (s: string) => void) => cb("pasted")),
            };
            const event = { clipboardData: { items: [textItem] } } as unknown as ClipboardEvent;
            const result = cm.pasteFromEvent(sheet, event);
            expect(result).toBe(true);
        });

        it("CM-22: 有图片项时返回 true 并调用 render", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            sheet.selection.getActive = vi.fn(() => [0, 0]);

            const blob = new Blob(["fake"], { type: "image/png" });
            const imageItem = {
                type: "image/png",
                getAsFile: vi.fn(() => blob),
            };
            const event = { clipboardData: { items: [imageItem] } } as unknown as ClipboardEvent;
            const result = cm.pasteFromEvent(sheet, event);
            expect(result).toBe(true);
            expect(sheet.render).toHaveBeenCalled();
        });
    });

    describe("getCellContent()", () => {
        it("CM-23: 无内容时返回 null", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            expect(cm.getCellContent(sheet, 0, 0)).toBeNull();
        });

        it("CM-24: 设置图片后可获取", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            const blob = new Blob(["img"], { type: "image/png" });
            cm.setCellImage(sheet, 0, 0, blob);
            const content = cm.getCellContent(sheet, 0, 0);
            expect(content).not.toBeNull();
            expect(content!.type).toBe("image");
            expect(content!.objectUrl).toContain("blob:");
        });
    });

    describe("setCellImage()", () => {
        it("CM-25: 设置图片后应调用 invalidateAll", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            const blob = new Blob(["img"], { type: "image/png" });
            cm.setCellImage(sheet, 0, 0, blob);
            expect(sheet.invalidateAll).toHaveBeenCalled();
        });

        it("CM-26: 替换图片时旧 ObjectURL 应被撤销", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            const blob1 = new Blob(["img1"], { type: "image/png" });
            const blob2 = new Blob(["img2"], { type: "image/png" });

            const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
            cm.setCellImage(sheet, 0, 0, blob1);
            cm.setCellImage(sheet, 0, 0, blob2);
            expect(revokeSpy).toHaveBeenCalled();
            revokeSpy.mockRestore();
        });

        it("CM-27: 单元格不存在时应创建占位", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            sheet.cellStore.get = vi.fn(() => null);
            const blob = new Blob(["img"], { type: "image/png" });
            cm.setCellImage(sheet, 0, 0, blob);
            expect(sheet.setCell).toHaveBeenCalledWith(0, 0, "");
        });
    });

    describe("removeCellContent()", () => {
        it("CM-28: 移除不存在的 key 不抛异常", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            expect(() => cm.removeCellContent(sheet, 0, 0)).not.toThrow();
        });

        it("CM-29: 移除已设置的图片后 getCellContent 返回 null", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            const blob = new Blob(["img"], { type: "image/png" });
            cm.setCellImage(sheet, 0, 0, blob);
            expect(cm.getCellContent(sheet, 0, 0)).not.toBeNull();
            cm.removeCellContent(sheet, 0, 0);
            expect(cm.getCellContent(sheet, 0, 0)).toBeNull();
        });
    });

    describe("destroy()", () => {
        it("CM-30: 销毁后剪贴板数据为 null", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet({ "0,0": "A" });
            sheet.selection.getRange = vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 }));
            cm.copy(sheet);
            cm.destroy();
            expect(cm.getClipboardData()).toBeNull();
        });

        it("CM-31: 销毁后富内容被清除", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet();
            const blob = new Blob(["img"], { type: "image/png" });
            cm.setCellImage(sheet, 0, 0, blob);
            cm.destroy();
            expect(cm.getCellContent(sheet, 0, 0)).toBeNull();
        });

        it("CM-32: 多次 destroy 不抛异常", () => {
            const cm = new ClipboardManager();
            expect(() => { cm.destroy(); cm.destroy(); }).not.toThrow();
        });
    });

    describe("getClipboardData()", () => {
        it("CM-33: 未复制时返回 null", () => {
            const cm = new ClipboardManager();
            expect(cm.getClipboardData()).toBeNull();
        });

        it("CM-34: 复制后返回完整数据结构", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet({ "0,0": "X" });
            sheet.selection.getRange = vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 }));
            cm.copy(sheet);
            const data = cm.getClipboardData();
            expect(data).toHaveProperty("sourceSheetName");
            expect(data).toHaveProperty("topRow");
            expect(data).toHaveProperty("topCol");
            expect(data).toHaveProperty("rows");
            expect(data).toHaveProperty("cols");
            expect(data).toHaveProperty("cells");
            expect(data).toHaveProperty("columnTypes");
        });
    });

    describe("类型检查", () => {
        it("CM-35: 目标列类型与源类型不同时应阻止粘贴", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet({ "0,0": "100" });
            sheet.selection.getRange = vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 }));
            sheet.getCellTypeInstance = vi.fn(() => ({ name: "numeric" }));
            cm.copy(sheet);

            const targetSheet = createMockSheet();
            targetSheet.selection.getActive = vi.fn(() => [0, 0]);
            targetSheet.getCellTypeInstance = vi.fn(() => ({ name: "date", editorType: "date" }));
            targetSheet.getColumnConfig = vi.fn(() => ({ type: "date" }));

            cm.pasteInternal(targetSheet);
            expect(targetSheet.setCell).not.toHaveBeenCalled();
        });

        it("CM-36: 目标列无显式类型配置时允许粘贴", () => {
            const cm = new ClipboardManager();
            const sheet = createMockSheet({ "0,0": "hello" });
            sheet.selection.getRange = vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 }));
            cm.copy(sheet);

            const targetSheet = createMockSheet();
            targetSheet.selection.getActive = vi.fn(() => [0, 0]);
            targetSheet.getColumnConfig = vi.fn(() => null);
            targetSheet.cellTypes = new Map();

            cm.pasteInternal(targetSheet);
            expect(targetSheet.setCell).toHaveBeenCalled();
        });
    });
});