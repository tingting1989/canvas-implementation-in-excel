import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ThemeManager } from "@/theme/ThemeManager";
import { defaultThemeConfig, darkThemeConfig } from "@/theme/config";

describe("ThemeManager", () => {
    let tm: ThemeManager;

    beforeEach(() => {
        localStorage.clear();
        tm = new ThemeManager({ persist: false });
    });

    describe("构造函数和基础属性", () => {
        it("TM-01: 应正确创建实例", () => {
            expect(tm).toBeInstanceOf(ThemeManager);
        });

        it("TM-02: 默认当前主题为 default", () => {
            expect(tm.getCurrentTheme()).toBe("default");
        });

        it("TM-03: 应注册内置 default 和 dark 主题", () => {
            const themes = tm.getThemes();
            expect(themes).toContain("default");
            expect(themes).toContain("dark");
        });

        it("TM-04: persist=false 时不读写 localStorage", () => {
            const tm2 = new ThemeManager({ persist: false });
            expect(tm2.persist).toBe(false);
        });

        it("TM-05: 可指定默认主题", () => {
            const tm2 = new ThemeManager({ defaultTheme: "dark", persist: false });
            expect(tm2.getCurrentTheme()).toBe("dark");
        });
    });

    describe("getTheme()", () => {
        it("TM-06: 获取已注册的主题", () => {
            expect(tm.getTheme("default")).not.toBeNull();
        });

        it("TM-07: 获取未注册的主题返回 null", () => {
            expect(tm.getTheme("nonexistent")).toBeNull();
        });
    });

    describe("setTheme()", () => {
        it("TM-08: 切换到已注册主题应成功", () => {
            const result = tm.setTheme("dark");
            expect(result).toBe(true);
            expect(tm.getCurrentTheme()).toBe("dark");
        });

        it("TM-09: 切换到未注册主题应抛错", () => {
            expect(() => tm.setTheme("nonexistent")).toThrow();
        });

        it("TM-10: 切换主题应触发 CustomEvent", () => {
            const handler = vi.fn();
            document.addEventListener("canvas-sheet-theme-change", handler);
            tm.setTheme("dark");
            expect(handler).toHaveBeenCalled();
            document.removeEventListener("canvas-sheet-theme-change", handler);
        });
    });

    describe("registerTheme()", () => {
        it("TM-11: 注册新主题应成功", () => {
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
            tm.registerTheme("custom", customConfig as any);
            expect(tm.getThemes()).toContain("custom");
        });

        it("TM-12: 注册已存在的主题应抛错", () => {
            expect(() => tm.registerTheme("default", defaultThemeConfig)).toThrow();
        });

        it("TM-13: 注册无效配置应抛错", () => {
            expect(() => tm.registerTheme("bad", null as any)).toThrow();
        });

        it("TM-14: 注册缺少 config 的配置应抛错", () => {
            expect(() => tm.registerTheme("bad2", { name: "bad2" } as any)).toThrow();
        });

        it("TM-15: 注册缺少 config.cell 的配置应抛错", () => {
            expect(() => tm.registerTheme("bad3", { name: "bad3", config: {} } as any)).toThrow();
        });
    });

    describe("getStyle()", () => {
        it("TM-16: 获取当前主题的样式", () => {
            const style = tm.getStyle("cell.default");
            expect(style).toBeDefined();
            expect(style.fontFamily).toBe("Microsoft YaHei");
        });

        it("TM-17: 切换主题后样式应变化", () => {
            const lightStyle = tm.getStyle("cell.default");
            tm.setTheme("dark");
            const darkStyle = tm.getStyle("cell.default");
            expect(darkStyle.color).not.toBe(lightStyle.color);
        });

        it("TM-18: 不存在的样式类型返回空对象", () => {
            const style = tm.getStyle("nonexistent");
            expect(style).toEqual({});
        });
    });

    describe("getStyleId()", () => {
        it("TM-19: 应返回样式 ID", () => {
            const styleId = tm.getStyleId("cell.default");
            expect(styleId).toBeDefined();
        });

        it("TM-20: 不存在的样式类型返回 undefined", () => {
            const styleId = tm.getStyleId("nonexistent.style");
            expect(styleId).toBeUndefined();
        });
    });

    describe("removeTheme()", () => {
        it("TM-21: 删除非当前主题应成功", () => {
            const result = tm.removeTheme("dark");
            expect(result).toBe(true);
            expect(tm.getThemes()).not.toContain("dark");
        });

        it("TM-22: 删除当前主题应抛错", () => {
            expect(() => tm.removeTheme("default")).toThrow();
        });

        it("TM-23: 删除不存在的主题返回 false", () => {
            expect(tm.removeTheme("nonexistent")).toBe(false);
        });

        it("TM-24: 删除主题后相关 styleIds 应清除", () => {
            tm.removeTheme("dark");
            const keys = Object.keys(tm.styleIds).filter((k) => k.startsWith("dark."));
            expect(keys).toHaveLength(0);
        });
    });

    describe("getThemes()", () => {
        it("TM-25: 应返回所有主题名称", () => {
            const themes = tm.getThemes();
            expect(themes).toContain("default");
            expect(themes).toContain("dark");
        });
    });

    describe("getCurrentTheme()", () => {
        it("TM-26: 应返回当前主题名称", () => {
            expect(tm.getCurrentTheme()).toBe("default");
            tm.setTheme("dark");
            expect(tm.getCurrentTheme()).toBe("dark");
        });
    });

    describe("持久化", () => {
        it("TM-27: persist=true 时切换主题应写入 localStorage", () => {
            localStorage.clear();
            const tm2 = new ThemeManager({ persist: true });
            tm2.setTheme("dark");
            expect(localStorage.getItem("canvas-sheet-theme")).toBe("dark");
        });

        it("TM-28: persist=true 时应从 localStorage 恢复主题", () => {
            localStorage.setItem("canvas-sheet-theme", "dark");
            const tm2 = new ThemeManager({ persist: true });
            expect(tm2.getCurrentTheme()).toBe("dark");
        });
    });
});