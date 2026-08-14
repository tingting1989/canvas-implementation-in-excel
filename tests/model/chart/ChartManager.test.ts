import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChartManager } from "@/model/chart/ChartManager";
import type { ChartLike } from "@/model/chart/ChartManager";

function createMockSheet() {
    return {
        bus: {
            emit: vi.fn(),
        },
    };
}

function createChart(id: string, overrides: Partial<ChartLike> = {}): ChartLike {
    return {
        id,
        type: "bar",
        anchorRow: 0,
        anchorCol: 0,
        offsetX: 0,
        offsetY: 0,
        width: 400,
        height: 300,
        dataRange: null,
        style: {},
        ...overrides,
    };
}

describe("ChartManager", () => {
    let cm: ChartManager;
    let mockSheet: any;

    beforeEach(() => {
        mockSheet = createMockSheet();
        cm = new ChartManager(mockSheet);
    });

    describe("构造函数和基础属性", () => {
        it("CHM-01: 应正确创建实例", () => {
            expect(cm).toBeInstanceOf(ChartManager);
        });

        it("CHM-02: 初始图表数量为 0", () => {
            expect(cm.count).toBe(0);
        });
    });

    describe("add()", () => {
        it("CHM-03: 添加图表后数量增加", () => {
            cm.add(createChart("c1"));
            expect(cm.count).toBe(1);
        });

        it("CHM-04: 添加图表应触发 CHART_ADDED 事件", () => {
            cm.add(createChart("c1", { type: "line" }));
            expect(mockSheet.bus.emit).toHaveBeenCalledWith(
                "chart:added",
                { chartId: "c1", type: "line" },
                { source: "ChartManager" }
            );
        });
    });

    describe("remove()", () => {
        it("CHM-05: 移除存在的图表应返回该图表", () => {
            const chart = createChart("c1");
            cm.add(chart);
            const removed = cm.remove("c1");
            expect(removed).toBe(chart);
            expect(cm.count).toBe(0);
        });

        it("CHM-06: 移除不存在的图表应返回 null", () => {
            expect(cm.remove("nonexistent")).toBeNull();
        });

        it("CHM-07: 移除图表应触发 CHART_REMOVED 事件", () => {
            cm.add(createChart("c1"));
            mockSheet.bus.emit.mockClear();
            cm.remove("c1");
            expect(mockSheet.bus.emit).toHaveBeenCalledWith(
                "chart:removed",
                { chartId: "c1" },
                { source: "ChartManager" }
            );
        });
    });

    describe("get()", () => {
        it("CHM-08: 获取存在的图表", () => {
            const chart = createChart("c1");
            cm.add(chart);
            expect(cm.get("c1")).toBe(chart);
        });

        it("CHM-09: 获取不存在的图表返回 null", () => {
            expect(cm.get("nonexistent")).toBeNull();
        });
    });

    describe("getAll()", () => {
        it("CHM-10: 返回所有图表", () => {
            cm.add(createChart("c1"));
            cm.add(createChart("c2"));
            const all = cm.getAll();
            expect(all).toHaveLength(2);
        });
    });

    describe("update()", () => {
        it("CHM-11: 更新存在的图表属性", () => {
            cm.add(createChart("c1"));
            const updated = cm.update("c1", { offsetX: 100, offsetY: 200 });
            expect(updated).not.toBeNull();
            expect(updated!.offsetX).toBe(100);
            expect(updated!.offsetY).toBe(200);
        });

        it("CHM-12: 更新不存在的图表返回 null", () => {
            expect(cm.update("nonexistent", { offsetX: 100 })).toBeNull();
        });

        it("CHM-13: 更新尺寸", () => {
            cm.add(createChart("c1"));
            const updated = cm.update("c1", { width: 600, height: 500 });
            expect(updated!.width).toBe(600);
            expect(updated!.height).toBe(500);
        });

        it("CHM-14: 更新 dataRange", () => {
            cm.add(createChart("c1"));
            const newRange = { startRow: 1, startCol: 1, endRow: 5, endCol: 3 };
            const updated = cm.update("c1", { dataRange: newRange });
            expect(updated!.dataRange).toEqual(newRange);
        });

        it("CHM-15: 更新 style 应合并", () => {
            cm.add(createChart("c1", { style: { color: "red" } }));
            const updated = cm.update("c1", { style: { fontSize: 14 } });
            expect(updated!.style).toEqual({ color: "red", fontSize: 14 });
        });

        it("CHM-16: 更新应触发 CHART_UPDATED 事件", () => {
            cm.add(createChart("c1"));
            mockSheet.bus.emit.mockClear();
            cm.update("c1", { offsetX: 50 });
            expect(mockSheet.bus.emit).toHaveBeenCalledWith(
                "chart:updated",
                { chartId: "c1" },
                { source: "ChartManager" }
            );
        });
    });

    describe("insertRow()", () => {
        it("CHM-17: 锚点行 >= atRow 的图表应下移", () => {
            cm.add(createChart("c1", { anchorRow: 3, anchorCol: 0 }));
            cm.insertRow(2);
            expect(cm.get("c1")!.anchorRow).toBe(4);
        });

        it("CHM-18: 锚点行 < atRow 的图表不变", () => {
            cm.add(createChart("c1", { anchorRow: 1, anchorCol: 0 }));
            cm.insertRow(3);
            expect(cm.get("c1")!.anchorRow).toBe(1);
        });

        it("CHM-19: dataRange 行索引同步调整", () => {
            cm.add(createChart("c1", { anchorRow: 0, anchorCol: 0, dataRange: { startRow: 2, startCol: 0, endRow: 5, endCol: 3 } }));
            cm.insertRow(3);
            const chart = cm.get("c1")!;
            expect(chart.dataRange!.startRow).toBe(2);
            expect(chart.dataRange!.endRow).toBe(6);
        });
    });

    describe("deleteRow()", () => {
        it("CHM-20: 锚点行 > atRow 的图表应上移", () => {
            cm.add(createChart("c1", { anchorRow: 5, anchorCol: 0 }));
            cm.deleteRow(3);
            expect(cm.get("c1")!.anchorRow).toBe(4);
        });

        it("CHM-21: 锚点行 === atRow 的图表保持不变", () => {
            cm.add(createChart("c1", { anchorRow: 3, anchorCol: 0 }));
            cm.deleteRow(3);
            expect(cm.get("c1")!.anchorRow).toBe(3);
        });
    });

    describe("insertCol()", () => {
        it("CHM-22: 锚点列 >= atCol 的图表应右移", () => {
            cm.add(createChart("c1", { anchorRow: 0, anchorCol: 3 }));
            cm.insertCol(2);
            expect(cm.get("c1")!.anchorCol).toBe(4);
        });

        it("CHM-23: dataRange 列索引同步调整", () => {
            cm.add(createChart("c1", { anchorRow: 0, anchorCol: 0, dataRange: { startRow: 0, startCol: 2, endRow: 5, endCol: 4 } }));
            cm.insertCol(3);
            const chart = cm.get("c1")!;
            expect(chart.dataRange!.startCol).toBe(2);
            expect(chart.dataRange!.endCol).toBe(5);
        });
    });

    describe("deleteCol()", () => {
        it("CHM-24: 锚点列 > atCol 的图表应左移", () => {
            cm.add(createChart("c1", { anchorRow: 0, anchorCol: 5 }));
            cm.deleteCol(3);
            expect(cm.get("c1")!.anchorCol).toBe(4);
        });

        it("CHM-25: 锚点列 === atCol 的图表保持不变", () => {
            cm.add(createChart("c1", { anchorRow: 0, anchorCol: 3 }));
            cm.deleteCol(3);
            expect(cm.get("c1")!.anchorCol).toBe(3);
        });
    });

    describe("moveRow()", () => {
        it("CHM-26: 锚点行正好是被移动行时移到目标位置", () => {
            cm.add(createChart("c1", { anchorRow: 2, anchorCol: 0 }));
            cm.moveRow(2, 5);
            expect(cm.get("c1")!.anchorRow).toBe(5);
        });

        it("CHM-27: 锚点行在向下移动区间内时上移", () => {
            cm.add(createChart("c1", { anchorRow: 4, anchorCol: 0 }));
            cm.moveRow(2, 6);
            expect(cm.get("c1")!.anchorRow).toBe(3);
        });

        it("CHM-28: 锚点行在向上移动区间内时下移", () => {
            cm.add(createChart("c1", { anchorRow: 3, anchorCol: 0 }));
            cm.moveRow(6, 2);
            expect(cm.get("c1")!.anchorRow).toBe(4);
        });
    });

    describe("moveCol()", () => {
        it("CHM-29: 锚点列正好是被移动列时移到目标位置", () => {
            cm.add(createChart("c1", { anchorRow: 0, anchorCol: 2 }));
            cm.moveCol(2, 5);
            expect(cm.get("c1")!.anchorCol).toBe(5);
        });

        it("CHM-30: 锚点列在向右移动区间内时左移", () => {
            cm.add(createChart("c1", { anchorRow: 0, anchorCol: 4 }));
            cm.moveCol(2, 6);
            expect(cm.get("c1")!.anchorCol).toBe(3);
        });
    });

    describe("count", () => {
        it("CHM-31: 应正确反映图表数量", () => {
            expect(cm.count).toBe(0);
            cm.add(createChart("c1"));
            expect(cm.count).toBe(1);
            cm.add(createChart("c2"));
            expect(cm.count).toBe(2);
            cm.remove("c1");
            expect(cm.count).toBe(1);
        });
    });

    describe("destroy()", () => {
        it("CHM-32: 销毁后图表为空", () => {
            cm.add(createChart("c1"));
            cm.add(createChart("c2"));
            cm.destroy();
            expect(cm.count).toBe(0);
        });
    });
});