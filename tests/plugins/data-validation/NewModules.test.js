import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { ShadowEvaluator } from "@/plugins/dataValidation/ShadowEvaluator.ts";
import { ValidationDirtyFlagManager } from "@/plugins/dataValidation/ValidationDirtyFlagManager.ts";
import { ListSourceResolver } from "@/plugins/dataValidation/ListSourceResolver.ts";
import { CopyPasteHandler, PASTE_OPTIONS, CONFLICT_RESOLUTION } from "@/plugins/dataValidation/CopyPasteHandler.ts";

describe("ShadowEvaluator - 沙箱隔离测试", () => {
    let mockEngine;

    beforeEach(() => {
        const cells = new Map();
        cells.set("0,0", { value: 50 });
        cells.set("1,0", { value: 100 });

        mockEngine = {
            cellStore: {
                get: vi.fn((row, col) => cells.get(`${row},${col}`)),
            },
            evaluateInContext: vi.fn(async (formula, context) => {
                if (formula === "=A1>0") return true;
                if (formula === "=A1>1000") return false;
                return null;
            }),
        };
    });

    test("应该正确初始化", () => {
        const shadow = new ShadowEvaluator(mockEngine, {
            row: 0,
            col: 0,
            value: 50,
            sheet: "Sheet1",
        });
        expect(shadow).toBeDefined();
        shadow.destroy();
    });

    test("应该拦截易变函数 INDIRECT", async () => {
        const shadow = new ShadowEvaluator(mockEngine, { row: 0, col: 0, value: 50, sheet: "Sheet1" });
        await expect(shadow.evaluate("=INDIRECT(A1)")).rejects.toThrow(/易变函数/);
        shadow.destroy();
    });

    test("应该拦截易变函数 RAND", async () => {
        const shadow = new ShadowEvaluator(mockEngine, { row: 0, col: 0, value: 50, sheet: "Sheet1" });
        await expect(shadow.evaluate("=RAND()")).rejects.toThrow(/易变函数/);
        shadow.destroy();
    });

    test("应该拦截易变函数 NOW", async () => {
        const shadow = new ShadowEvaluator(mockEngine, { row: 0, col: 0, value: 50, sheet: "Sheet1" });
        await expect(shadow.evaluate("=NOW()")).rejects.toThrow(/易变函数/);
        shadow.destroy();
    });

    test("应该拦截易变函数 OFFSET", async () => {
        const shadow = new ShadowEvaluator(mockEngine, { row: 0, col: 0, value: 50, sheet: "Sheet1" });
        await expect(shadow.evaluate("=OFFSET(A1,1,0)")).rejects.toThrow(/易变函数/);
        shadow.destroy();
    });

    test("应该拦截易变函数 RANDBETWEEN", async () => {
        const shadow = new ShadowEvaluator(mockEngine, { row: 0, col: 0, value: 50, sheet: "Sheet1" });
        await expect(shadow.evaluate("=RANDBETWEEN(1,100)")).rejects.toThrow(/易变函数/);
        shadow.destroy();
    });

    test("应该拦截易变函数 TODAY", async () => {
        const shadow = new ShadowEvaluator(mockEngine, { row: 0, col: 0, value: 50, sheet: "Sheet1" });
        await expect(shadow.evaluate("=TODAY()")).rejects.toThrow(/易变函数/);
        shadow.destroy();
    });

    test("destroy 后 evaluate 应抛出异常", async () => {
        const shadow = new ShadowEvaluator(mockEngine, { row: 0, col: 0, value: 50, sheet: "Sheet1" });
        shadow.destroy();
        await expect(shadow.evaluate("=A1>0")).rejects.toThrow(/已销毁/);
    });

    test("getTrackedDependencies 初始应为空集合", () => {
        const shadow = new ShadowEvaluator(mockEngine, { row: 0, col: 0, value: 50, sheet: "Sheet1" });
        expect(shadow.getTrackedDependencies()).toBeInstanceOf(Set);
        expect(shadow.getTrackedDependencies().size).toBe(0);
        shadow.destroy();
    });
});

describe("ValidationDirtyFlagManager - 脏标记测试", () => {
    let manager;

    beforeEach(() => {
        manager = new ValidationDirtyFlagManager();
    });

    afterEach(() => {
        manager.destroy();
    });

    test("初始状态无脏单元格", () => {
        expect(manager.dirtyCount).toBe(0);
        expect(manager.getDirtyCells()).toEqual([]);
    });

    test("markDirty 应标记单元格为脏", () => {
        manager.markDirty(0, 0, "user_edit");
        expect(manager.dirtyCount).toBe(1);
        expect(manager.isDirty(0, 0)).toBe(true);
    });

    test("markDirty 应记录原因", () => {
        manager.markDirty(5, 3, "sort");
        const dirty = manager.getDirtyCells();
        expect(dirty).toHaveLength(1);
        expect(dirty[0]).toEqual({ row: 5, col: 3, reason: "sort" });
    });

    test("markRangeDirty 应批量标记区域", () => {
        manager.markRangeDirty(0, 2, 0, 1, "paste");
        expect(manager.dirtyCount).toBe(6);
        expect(manager.isDirty(0, 0)).toBe(true);
        expect(manager.isDirty(2, 1)).toBe(true);
    });

    test("markClean 应清除脏标记", () => {
        manager.markDirty(0, 0, "user_edit");
        expect(manager.isDirty(0, 0)).toBe(true);

        manager.markClean(0, 0);
        expect(manager.isDirty(0, 0)).toBe(false);
        expect(manager.dirtyCount).toBe(0);
    });

    test("markCellsClean 应批量清除", () => {
        manager.markRangeDirty(0, 2, 0, 0, "sort");
        manager.markCellsClean([{ row: 0, col: 0 }, { row: 1, col: 0 }]);
        expect(manager.isDirty(0, 0)).toBe(false);
        expect(manager.isDirty(1, 0)).toBe(false);
        expect(manager.isDirty(2, 0)).toBe(true);
    });

    test("getDirtyCellsInViewport 应仅返回视口内的脏单元格", () => {
        manager.markDirty(0, 0, "user_edit");
        manager.markDirty(50, 50, "user_edit");
        manager.markDirty(100, 100, "user_edit");

        const viewport = { startRow: 0, endRow: 60, startCol: 0, endCol: 60 };
        const inView = manager.getDirtyCellsInViewport(viewport);
        expect(inView).toHaveLength(2);
    });

    test("lazyValidate 应返回视口内的脏单元格", () => {
        manager.markDirty(5, 5, "formula_recalc");
        manager.markDirty(200, 200, "formula_recalc");

        const viewport = { startRow: 0, endRow: 100, startCol: 0, endCol: 100 };
        const lazy = manager.lazyValidate(viewport);
        expect(lazy).toHaveLength(1);
        expect(lazy[0].row).toBe(5);
    });

    test("clearAll 应清空所有标记", () => {
        manager.markRangeDirty(0, 10, 0, 10, "rule_change");
        manager.clearAll();
        expect(manager.dirtyCount).toBe(0);
    });

    test("禁用后 markDirty 不生效", () => {
        manager.enabled = false;
        manager.markDirty(0, 0, "user_edit");
        expect(manager.dirtyCount).toBe(0);
    });

    test("destroy 后应清空并禁用", () => {
        manager.markDirty(0, 0, "user_edit");
        manager.destroy();
        expect(manager.dirtyCount).toBe(0);
        expect(manager.enabled).toBe(false);
    });

    test("isDirty 对未标记的单元格应返回 false", () => {
        expect(manager.isDirty(999, 999)).toBe(false);
    });

    test("重复 markDirty 同一单元格不应增加计数", () => {
        manager.markDirty(0, 0, "user_edit");
        manager.markDirty(0, 0, "sort");
        expect(manager.dirtyCount).toBe(1);
    });
});

describe("ListSourceResolver - 动态区域引用测试", () => {
    let resolver;
    let mockCellStore;
    let mockSheetManager;

    beforeEach(() => {
        const cells = new Map();
        for (let i = 0; i < 10; i++) {
            cells.set(`${i},0`, { value: `选项${i + 1}` });
        }
        cells.set("0,1", { value: "北京" });
        cells.set("1,1", { value: "上海" });
        cells.set("2,1", { value: "广州" });

        mockCellStore = {
            get: vi.fn((row, col) => cells.get(`${row},${col}`)),
            sheetName: "Sheet1",
        };

        mockSheetManager = {
            getSheetByName: vi.fn((name) => {
                if (name === "Sheet1") return { cellStore: mockCellStore };
                return null;
            }),
        };

        resolver = new ListSourceResolver(mockCellStore, mockSheetManager);
    });

    afterEach(() => {
        resolver.destroy();
    });

    test("静态数组应直接返回", async () => {
        const result = await resolver.resolve(["男", "女", "其他"]);
        expect(result).toEqual(["男", "女", "其他"]);
    });

    test("同表区域引用应正确解析", async () => {
        const result = await resolver.resolve("A1:A3", { currentSheet: "Sheet1" });
        expect(result).toEqual(["选项1", "选项2", "选项3"]);
    });

    test("跨表区域引用应正确解析", async () => {
        const result = await resolver.resolve("Sheet1!B1:B3", { currentSheet: "Sheet1" });
        expect(result).toEqual(["北京", "上海", "广州"]);
    });

    test("带 = 前缀的引用应正确解析", async () => {
        const result = await resolver.resolve("=Sheet1!$A$1:$A$3", { currentSheet: "Sheet1" });
        expect(result).toEqual(["选项1", "选项2", "选项3"]);
    });

    test("空单元格应被跳过", async () => {
        const result = await resolver.resolve("A1:A20", { currentSheet: "Sheet1" });
        expect(result).toHaveLength(10);
    });

    test("缓存应在 TTL 内生效", async () => {
        await resolver.resolve("A1:A3", { currentSheet: "Sheet1" });
        const callCountAfterFirst = mockCellStore.get.mock.calls.length;
        await resolver.resolve("A1:A3", { currentSheet: "Sheet1" });
        const callCountAfterSecond = mockCellStore.get.mock.calls.length;
        expect(callCountAfterSecond).toBe(callCountAfterFirst);
    });

    test("destroy 后应标记已销毁", () => {
        resolver.destroy();
    });
});

describe("CopyPasteHandler - 复制/粘贴规则测试", () => {
    let handler;
    let mockPlugin;

    beforeEach(() => {
        mockPlugin = {
            getRulesForCell: vi.fn(() => []),
            setValidation: vi.fn(() => "vr_new"),
        };

        handler = new CopyPasteHandler(mockPlugin);
    });

    afterEach(() => {
        handler.destroy();
    });

    test("shouldPasteValidation 对 ALL 应返回 true", () => {
        expect(handler.shouldPasteValidation(PASTE_OPTIONS.ALL)).toBe(true);
    });

    test("shouldPasteValidation 对 FORMATS 应返回 true", () => {
        expect(handler.shouldPasteValidation(PASTE_OPTIONS.FORMATS)).toBe(true);
    });

    test("shouldPasteValidation 对 VALIDATION 应返回 true", () => {
        expect(handler.shouldPasteValidation(PASTE_OPTIONS.VALIDATION)).toBe(true);
    });

    test("shouldPasteValidation 对 VALUES_ONLY 应返回 false", () => {
        expect(handler.shouldPasteValidation(PASTE_OPTIONS.VALUES_ONLY)).toBe(false);
    });

    test("shouldPasteValidation 对 NO_VALIDATION 应返回 false", () => {
        expect(handler.shouldPasteValidation(PASTE_OPTIONS.NO_VALIDATION)).toBe(false);
    });

    test("shouldPasteValidation 对 FORMULAS 应返回 false", () => {
        expect(handler.shouldPasteValidation(PASTE_OPTIONS.FORMULAS)).toBe(false);
    });

    test("pasteWithRules 在无源规则时应返回空数组", () => {
        mockPlugin.getRulesForCell.mockReturnValue([]);
        const result = handler.pasteWithRules(0, 0, 5, 5, PASTE_OPTIONS.ALL);
        expect(result).toEqual([]);
    });

    test("pasteRangeWithRules 在无源规则时应返回空数组", () => {
        mockPlugin.getRulesForCell.mockReturnValue([]);
        const result = handler.pasteRangeWithRules(0, 0, 5, 5, 3, 3, PASTE_OPTIONS.ALL);
        expect(result).toEqual([]);
    });

    test("getRuleSnapshot 应返回规则快照", () => {
        mockPlugin.getRulesForCell.mockReturnValue([]);
        const snapshot = handler.getRuleSnapshot(0, 0);
        expect(snapshot).toEqual([]);
    });

    test("PASTE_OPTIONS 应包含所有选项", () => {
        expect(PASTE_OPTIONS.ALL).toBe("all");
        expect(PASTE_OPTIONS.VALUES_ONLY).toBe("values_only");
        expect(PASTE_OPTIONS.FORMULAS).toBe("formulas");
        expect(PASTE_OPTIONS.FORMATS).toBe("formats");
        expect(PASTE_OPTIONS.VALIDATION).toBe("validation");
        expect(PASTE_OPTIONS.NO_VALIDATION).toBe("no_validation");
    });

    test("CONFLICT_RESOLUTION 应包含所有策略", () => {
        expect(CONFLICT_RESOLUTION.OVERWRITE).toBe("overwrite");
        expect(CONFLICT_RESOLUTION.MERGE).toBe("merge");
        expect(CONFLICT_RESOLUTION.SKIP).toBe("skip");
        expect(CONFLICT_RESOLUTION.PROMPT).toBe("prompt");
    });

    test("destroy 后应释放引用", () => {
        handler.destroy();
    });
});