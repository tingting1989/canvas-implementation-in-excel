import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThemeStyleProvider } from "@/theme/ThemeStyleProvider";

describe("ThemeStyleProvider", () => {
    let provider: ThemeStyleProvider;

    beforeEach(() => {
        localStorage.clear();
        provider = new ThemeStyleProvider();
    });

    describe("构造函数和基础属性", () => {
        it("TSP-01: 应正确创建实例", () => {
            expect(provider).toBeInstanceOf(ThemeStyleProvider);
        });

        it("TSP-02: 应包含 themeManager", () => {
            expect(provider.themeManager).toBeDefined();
        });
    });

    describe("subscribe()", () => {
        it("TSP-03: 订阅后切换主题应通知", () => {
            const callback = vi.fn();
            provider.subscribe(callback);
            provider.setTheme("dark");
            expect(callback).toHaveBeenCalled();
        });

        it("TSP-04: 取消订阅后不再通知", () => {
            const callback = vi.fn();
            const unsubscribe = provider.subscribe(callback);
            unsubscribe();
            provider.setTheme("dark");
            expect(callback).not.toHaveBeenCalled();
        });

        it("TSP-05: 多个订阅者都应被通知", () => {
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            provider.subscribe(cb1);
            provider.subscribe(cb2);
            provider.setTheme("dark");
            expect(cb1).toHaveBeenCalled();
            expect(cb2).toHaveBeenCalled();
        });
    });

    describe("getCellStyleId()", () => {
        it("TSP-06: 应返回样式 ID", () => {
            const styleId = provider.getCellStyleId(0, 0, "numeric");
            expect(styleId).toBeDefined();
        });

        it("TSP-07: 未知类型回退到 cell.default", () => {
            const styleId = provider.getCellStyleId(0, 0, "unknown");
            expect(styleId).toBeDefined();
        });
    });

    describe("getCellStyle()", () => {
        it("TSP-08: 应返回样式配置", () => {
            const style = provider.getCellStyle(0, 0, "numeric");
            expect(style).toBeDefined();
        });

        it("TSP-09: 未知类型回退到 cell.default", () => {
            const style = provider.getCellStyle(0, 0, "unknown");
            expect(style).toBeDefined();
        });
    });

    describe("getStyle()", () => {
        it("TSP-10: 应返回指定样式类型", () => {
            const style = provider.getStyle("cell.default");
            expect(style).toBeDefined();
            expect(style.fontFamily).toBe("Microsoft YaHei");
        });
    });

    describe("getStyleId()", () => {
        it("TSP-11: 应返回样式 ID", () => {
            const styleId = provider.getStyleId("cell.default");
            expect(styleId).toBeDefined();
        });
    });

    describe("getCurrentTheme()", () => {
        it("TSP-12: 默认为 default", () => {
            expect(provider.getCurrentTheme()).toBe("default");
        });

        it("TSP-13: 切换后返回新主题", () => {
            provider.setTheme("dark");
            expect(provider.getCurrentTheme()).toBe("dark");
        });
    });

    describe("setTheme()", () => {
        it("TSP-14: 切换到已注册主题应成功", () => {
            const result = provider.setTheme("dark");
            expect(result).toBe(true);
        });

        it("TSP-15: 切换到未注册主题应抛错", () => {
            expect(() => provider.setTheme("nonexistent")).toThrow();
        });
    });

    describe("registerTheme()", () => {
        it("TSP-16: 注册新主题应成功", () => {
            const customConfig = {
                name: "custom",
                displayName: "自定义",
                version: "1.0.0",
                config: {
                    cell: { default: { fontFamily: "Arial", fontSize: 12 } },
                    font: { family: "Arial", sizes: { small: 10, medium: 12, large: 14 } },
                    colors: { primary: "#000", success: "#0f0", warning: "#ff0", error: "#f00", info: "#00f" },
                },
            };
            provider.registerTheme("custom", customConfig);
            expect(provider.getThemes()).toContain("custom");
        });
    });

    describe("getThemes()", () => {
        it("TSP-17: 应返回所有主题名称", () => {
            const themes = provider.getThemes();
            expect(themes).toContain("default");
            expect(themes).toContain("dark");
        });
    });
});