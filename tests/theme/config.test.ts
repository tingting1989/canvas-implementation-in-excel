import { describe, it, expect } from "vitest";
import { defaultThemeConfig, darkThemeConfig, styleTypes } from "@/theme/config";

describe("config", () => {
    describe("defaultThemeConfig", () => {
        it("CFG-01: 应有 name 属性", () => {
            expect(defaultThemeConfig.name).toBe("default");
        });

        it("CFG-02: 应有 displayName 属性", () => {
            expect(defaultThemeConfig.displayName).toBe("默认主题");
        });

        it("CFG-03: 应有 version 属性", () => {
            expect(defaultThemeConfig.version).toBe("1.0.0");
        });

        it("CFG-04: 应有 config.cell.default", () => {
            expect(defaultThemeConfig.config.cell.default).toBeDefined();
        });

        it("CFG-05: cell.default 应有 fontFamily", () => {
            expect(defaultThemeConfig.config.cell.default.fontFamily).toBe("Microsoft YaHei");
        });

        it("CFG-06: cell.default 背景应为透明", () => {
            expect(defaultThemeConfig.config.cell.default.backgroundColor).toBe("transparent");
        });

        it("CFG-07: cell.hyperlink 应有下划线", () => {
            expect(defaultThemeConfig.config.cell.hyperlink.textDecoration).toBe("underline");
        });

        it("CFG-08: cell.header 应为粗体", () => {
            expect(defaultThemeConfig.config.cell.header.fontWeight).toBe("bold");
        });

        it("CFG-09: cell.numeric 应右对齐", () => {
            expect(defaultThemeConfig.config.cell.numeric.textAlign).toBe("right");
        });

        it("CFG-10: 应有 font 配置", () => {
            expect(defaultThemeConfig.config.font.family).toBe("Microsoft YaHei");
        });

        it("CFG-11: 应有 colors 配置", () => {
            expect(defaultThemeConfig.config.colors.primary).toBe("#1a73e8");
        });
    });

    describe("darkThemeConfig", () => {
        it("CFG-12: 应有 name 属性", () => {
            expect(darkThemeConfig.name).toBe("dark");
        });

        it("CFG-13: cell.default 文字应为白色", () => {
            expect(darkThemeConfig.config.cell.default.color).toBe("#fff");
        });

        it("CFG-14: cell.default 背景应为深色", () => {
            expect(darkThemeConfig.config.cell.default.backgroundColor).toBe("#333");
        });

        it("CFG-15: cell.textarea 应顶部对齐", () => {
            expect(darkThemeConfig.config.cell.textarea.verticalAlign).toBe("top");
        });

        it("CFG-16: 应有 colors 配置", () => {
            expect(darkThemeConfig.config.colors.primary).toBe("#64B5F6");
        });
    });

    describe("styleTypes", () => {
        it("CFG-17: 应包含 9 种样式类型", () => {
            expect(styleTypes).toHaveLength(9);
        });

        it("CFG-18: 应包含 cell.default", () => {
            expect(styleTypes).toContain("cell.default");
        });

        it("CFG-19: 应包含 cell.hyperlink", () => {
            expect(styleTypes).toContain("cell.hyperlink");
        });

        it("CFG-20: 应包含 cell.selected", () => {
            expect(styleTypes).toContain("cell.selected");
        });
    });
});