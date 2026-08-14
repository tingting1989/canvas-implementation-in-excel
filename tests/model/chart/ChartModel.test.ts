import { describe, it, expect } from "vitest";
import { ChartModel } from "@/model/chart/ChartModel";
import type { DataRange, ChartModelOptions } from "@/model/chart/ChartModel";

describe("ChartModel", () => {
    describe("构造函数和基础属性", () => {
        it("CM-01: 应正确创建实例", () => {
            const chart = new ChartModel();
            expect(chart).toBeInstanceOf(ChartModel);
        });

        it("CM-02: 默认类型为 bar", () => {
            const chart = new ChartModel();
            expect(chart.type).toBe("bar");
        });

        it("CM-03: 自动生成 UUID 作为 id", () => {
            const chart = new ChartModel();
            expect(chart.id).toBeDefined();
            expect(typeof chart.id).toBe("string");
            expect(chart.id.length).toBeGreaterThan(0);
        });

        it("CM-04: 可指定 id", () => {
            const chart = new ChartModel({ id: "my-chart" });
            expect(chart.id).toBe("my-chart");
        });

        it("CM-05: 默认位置为 (0,0) 偏移为 (0,0)", () => {
            const chart = new ChartModel();
            expect(chart.anchorRow).toBe(0);
            expect(chart.anchorCol).toBe(0);
            expect(chart.offsetX).toBe(0);
            expect(chart.offsetY).toBe(0);
        });

        it("CM-06: 默认尺寸为 400x300", () => {
            const chart = new ChartModel();
            expect(chart.width).toBe(400);
            expect(chart.height).toBe(300);
        });

        it("CM-07: 默认 dataRange 为 null", () => {
            const chart = new ChartModel();
            expect(chart.dataRange).toBeNull();
        });

        it("CM-08: 默认样式配置", () => {
            const chart = new ChartModel();
            expect(chart.style.title).toBe("");
            expect(chart.style.showLegend).toBe(true);
            expect(chart.style.showGrid).toBe(true);
            expect(chart.style.showTooltip).toBe(true);
            expect(chart.style.ignoreHiddenData).toBe(false);
            expect(chart.style.colors).toHaveLength(9);
        });

        it("CM-09: 可通过 options 自定义所有属性", () => {
            const chart = new ChartModel({
                type: "line",
                anchorRow: 5,
                anchorCol: 3,
                offsetX: 10,
                offsetY: 20,
                width: 500,
                height: 400,
                dataRange: { startRow: 0, startCol: 0, endRow: 10, endCol: 5 },
                style: { title: "测试图表", showLegend: false },
            });
            expect(chart.type).toBe("line");
            expect(chart.anchorRow).toBe(5);
            expect(chart.anchorCol).toBe(3);
            expect(chart.offsetX).toBe(10);
            expect(chart.offsetY).toBe(20);
            expect(chart.width).toBe(500);
            expect(chart.height).toBe(400);
            expect(chart.dataRange).toEqual({ startRow: 0, startCol: 0, endRow: 10, endCol: 5 });
            expect(chart.style.title).toBe("测试图表");
            expect(chart.style.showLegend).toBe(false);
        });

        it("CM-10: 初始缓存为空", () => {
            const chart = new ChartModel();
            expect(chart._cachedData).toBeNull();
            expect(chart._cacheVersion).toBe(-1);
        });
    });

    describe("getBounds()", () => {
        it("CM-11: 无视口时返回偏移量作为坐标", () => {
            const chart = new ChartModel({ offsetX: 50, offsetY: 60, width: 200, height: 150 });
            const bounds = chart.getBounds();
            expect(bounds).toEqual({ x: 50, y: 60, w: 200, h: 150 });
        });

        it("CM-12: 有视口时计算实际位置", () => {
            const chart = new ChartModel({ anchorRow: 2, anchorCol: 3, offsetX: 10, offsetY: 20 });
            const viewport = {
                colToViewX: (col: number) => col * 100,
                rowToViewY: (row: number) => row * 25,
            };
            const bounds = chart.getBounds(viewport);
            expect(bounds.x).toBe(3 * 100 + 10);
            expect(bounds.y).toBe(2 * 25 + 20);
        });

        it("CM-13: null 视口等同于无视口", () => {
            const chart = new ChartModel({ offsetX: 30, offsetY: 40 });
            const bounds = chart.getBounds(null);
            expect(bounds).toEqual({ x: 30, y: 40, w: 400, h: 300 });
        });
    });

    describe("containsPoint()", () => {
        it("CM-14: 点在图表内应返回 true", () => {
            const chart = new ChartModel({ offsetX: 0, offsetY: 0, width: 100, height: 100 });
            expect(chart.containsPoint(50, 50)).toBe(true);
        });

        it("CM-15: 点在边界上应返回 true", () => {
            const chart = new ChartModel({ offsetX: 0, offsetY: 0, width: 100, height: 100 });
            expect(chart.containsPoint(0, 0)).toBe(true);
            expect(chart.containsPoint(100, 100)).toBe(true);
        });

        it("CM-16: 点在图表外应返回 false", () => {
            const chart = new ChartModel({ offsetX: 0, offsetY: 0, width: 100, height: 100 });
            expect(chart.containsPoint(150, 150)).toBe(false);
            expect(chart.containsPoint(-10, 50)).toBe(false);
        });

        it("CM-17: 结合视口判断", () => {
            const chart = new ChartModel({ anchorRow: 0, anchorCol: 0, offsetX: 0, offsetY: 0, width: 100, height: 100 });
            const viewport = {
                colToViewX: (col: number) => col * 100,
                rowToViewY: (row: number) => row * 25,
            };
            expect(chart.containsPoint(50, 50, viewport)).toBe(true);
            expect(chart.containsPoint(200, 200, viewport)).toBe(false);
        });
    });

    describe("toJSON()", () => {
        it("CM-18: 应返回纯 JSON 对象", () => {
            const chart = new ChartModel({ type: "line", style: { title: "图表" } });
            const json = chart.toJSON();
            expect(json.id).toBe(chart.id);
            expect(json.type).toBe("line");
            expect(json.style).toBeDefined();
        });

        it("CM-19: 不包含缓存属性", () => {
            const chart = new ChartModel();
            chart._cachedData = { foo: "bar" };
            chart._cacheVersion = 5;
            const json = chart.toJSON();
            expect((json as any)._cachedData).toBeUndefined();
            expect((json as any)._cacheVersion).toBeUndefined();
        });

        it("CM-20: style 应为浅拷贝", () => {
            const chart = new ChartModel();
            const json = chart.toJSON();
            expect(json.style).not.toBe(chart.style);
        });
    });

    describe("fromJSON()", () => {
        it("CM-21: 应还原为 ChartModel 实例", () => {
            const original = new ChartModel({ type: "pie", anchorRow: 3, anchorCol: 2 });
            const json = original.toJSON();
            const restored = ChartModel.fromJSON(json as any);
            expect(restored).toBeInstanceOf(ChartModel);
            expect(restored.id).toBe(original.id);
            expect(restored.type).toBe("pie");
            expect(restored.anchorRow).toBe(3);
            expect(restored.anchorCol).toBe(2);
        });

        it("CM-22: fromJSON(toJSON()) 应保持数据一致", () => {
            const original = new ChartModel({
                type: "bar",
                anchorRow: 1,
                anchorCol: 1,
                offsetX: 10,
                offsetY: 20,
                width: 500,
                height: 400,
                dataRange: { startRow: 0, startCol: 0, endRow: 5, endCol: 3 },
            });
            const restored = ChartModel.fromJSON(original.toJSON() as any);
            expect(restored.toJSON()).toEqual(original.toJSON());
        });
    });
});