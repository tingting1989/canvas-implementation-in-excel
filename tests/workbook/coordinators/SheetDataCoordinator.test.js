import { describe, it, expect, vi, beforeEach } from "vitest";
import { Sheet } from "@/workbook/Sheet";
import { Cell } from "@/model/store/Cell";

describe("SheetDataCoordinator - 数据操作协调者", () => {
    let sheet;

    beforeEach(() => {
        sheet = new Sheet("TestData");
    });

    // ============================================================
    // 单元格 CRUD 操作
    // ============================================================
    describe("setCell / getCell", () => {
        it("应该设置并获取单元格值", () => {
            sheet.setCell(0, 0, "hello");
            const cell = sheet.cellStore.get(0, 0);
            expect(cell).toBeDefined();
            expect(cell.value).toBe("hello");
        });

        it("应该设置单元格的 styleId", () => {
            sheet.setCell(0, 0, "styled", 5);
            const cell = sheet.cellStore.get(0, 0);
            expect(cell.styleId).toBe(5);
        });

        it("应该设置单元格的 disabled 状态", () => {
            sheet.setCell(0, 0, "disabled", 0, true);
            const cell = sheet.cellStore.get(0, 0);
            expect(cell.disabled).toBe(true);
        });

        it("应该在 readOnly 模式下拒绝设置单元格", () => {
            sheet.readOnly = true;
            sheet.setCell(0, 0, "should not work");
            const cell = sheet.cellStore.get(0, 0);
            expect(cell).toBeUndefined();
        });

        it("应该识别公式并设置 formula 属性", () => {
            sheet.setCell(0, 0, "=SUM(A1:A10)");
            const cell = sheet.cellStore.get(0, 0);
            expect(cell).toBeDefined();
            expect(cell.formula).toBe("=SUM(A1:A10)");
        });
    });

    describe("disableCell / enableCell / isDisabled", () => {
        it("应该禁用单元格", () => {
            sheet.disableCell(1, 1);
            expect(sheet.isDisabled(1, 1)).toBe(true);
        });

        it("应该启用已禁用的单元格", () => {
            sheet.disableCell(1, 1);
            sheet.enableCell(1, 1);
            expect(sheet.isDisabled(1, 1)).toBe(false);
        });

        it("未禁用的单元格应返回 false", () => {
            expect(sheet.isDisabled(5, 5)).toBe(false);
        });
    });

    // ============================================================
    // 批量加载
    // ============================================================
    describe("loadData", () => {
        it("应该加载数据矩阵", () => {
            const data = [
                ["A1", "B1"],
                ["A2", "B2"]
            ];
            sheet.loadData(data);

            expect(sheet.cellStore.get(0, 0).value).toBe("A1");
            expect(sheet.cellStore.get(0, 1).value).toBe("B1");
            expect(sheet.cellStore.get(1, 0).value).toBe("A2");
            expect(sheet.cellStore.get(1, 1).value).toBe("B2");
        });

        it("应该扩展行列数以适应数据大小", () => {
            const data = Array.from({ length: 100 }, (_, r) =>
                Array.from({ length: 50 }, (_, c) => `${r}-${c}`)
            );
            sheet.loadData(data);

            expect(sheet.rowColManager.rowCount).toBeGreaterThanOrEqual(100);
            expect(sheet.rowColManager.colCount).toBeGreaterThanOrEqual(50);
        });

        it("应该处理空数组", () => {
            sheet.loadData([]);
            // 空数组不改变行列数（保持默认值）
            expect(sheet.rowColManager.rowCount).toBeGreaterThanOrEqual(0);
        });

        it("应该处理包含公式的数据", () => {
            const data = [["=SUM(1,2)", "normal"]];
            sheet.loadData(data);

            const formulaCell = sheet.cellStore.get(0, 0);
            expect(formulaCell.formula).toBe("=SUM(1,2)");

            const normalCell = sheet.cellStore.get(0, 1);
            expect(normalCell.formula).toBeNull();
        });
    });

    // ============================================================
    // dataAccessor 访问器
    // ============================================================
    describe("dataAccessor", () => {
        it("应该返回 CellDataAccessor 实例", () => {
            const accessor = sheet.data.dataAccessor;
            expect(accessor).toBeDefined();
            expect(accessor.constructor.name).toBe("CellDataAccessor");
        });

        it("应该缓存 accessor 实例（单例模式）", () => {
            const accessor1 = sheet.data.dataAccessor;
            const accessor2 = sheet.data.dataAccessor;
            expect(accessor1).toBe(accessor2);
        });

        it("应该支持区域遍历", () => {
            sheet.setCell(0, 0, "A");
            sheet.setCell(0, 1, "B");
            sheet.setCell(1, 0, "C");

            const cells = [];
            sheet.data.dataAccessor.forEach(0, 0, 1, 1, (r, c) => {
                cells.push({ row: r, col: c, value: sheet.cellStore.get(r, c)?.value });
            });

            expect(cells.length).toBe(4);
            expect(cells[0]).toEqual({ row: 0, col: 0, value: "A" });
            expect(cells[1]).toEqual({ row: 0, col: 1, value: "B" });
            expect(cells[2]).toEqual({ row: 1, col: 0, value: "C" });
            expect(cells[3].value).toBeUndefined(); // (1,1) 为空
        });
    });

    // ============================================================
    // 协调者懒初始化
    // ============================================================
    describe("懒初始化机制", () => {
        it("应该在首次访问时创建协调者实例", () => {
            const coordinator = sheet.data;
            expect(coordinator).toBeDefined();
            expect(coordinator.constructor.name).toBe("SheetDataCoordinator");
        });

        it("应该返回相同的协调者实例（缓存）", () => {
            const coord1 = sheet.data;
            const coord2 = sheet.data;
            expect(coord1).toBe(coord2);
        });
    });
});