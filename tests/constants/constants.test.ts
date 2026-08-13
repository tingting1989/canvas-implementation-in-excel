import { describe, it, expect } from "vitest";
import { AUTO_FILL_DIR, type AutoFillDir } from "../../src/constants/enums/AutoFillDir.js";
import { BORDER_STYLE, type BorderStyle } from "../../src/constants/enums/BorderStyle.js";
import { CHART_TYPE, type ChartType } from "../../src/constants/enums/ChartType.js";
import { CONTENT_TYPE, type ContentType } from "../../src/constants/enums/ContentType.js";
import { ERROR_STYLE, type ErrorStyle } from "../../src/constants/enums/ErrorStyle.js";
import { FONT_STYLE, type FontStyle } from "../../src/constants/enums/FontStyle.js";
import { SCROLL_AXIS, type ScrollAxis } from "../../src/constants/enums/ScrollAxis.js";
import { SORT_ARROW_DIR, type SortArrowDir } from "../../src/constants/enums/SortArrowDir.js";
import { SORT_ORDER, type SortOrder } from "../../src/constants/enums/SortOrder.js";
import { STYLE_SCOPE, type StyleScope } from "../../src/constants/enums/StyleScope.js";
import { TEXT_ALIGN, type TextAlign } from "../../src/constants/enums/TextAlign.js";
import { VALIDATION_RULE_TYPE, type ValidationRuleType } from "../../src/constants/enums/ValidationRuleType.js";
import { VERTICAL_ALIGN, type VerticalAlign } from "../../src/constants/enums/VerticalAlign.js";
import { STYLE_LEVEL, type StyleLevel } from "../../src/constants/styleLevel.js";
import { LAYER_Z_INDEX, type LayerZIndex } from "../../src/constants/layerZIndex.js";
import { HIT_TYPE, type HitType } from "../../src/constants/hitType.js";
import { CORE_CONFIG, type CoreConfig } from "../../src/constants/coreConfig.js";
import { HEADER_CONFIG, type HeaderConfig } from "../../src/constants/headerConfig.js";
import { SELECTION_CONFIG, type SelectionConfig } from "../../src/constants/selectionConfig.js";
import { UI_CONFIG, type UiConfig } from "../../src/constants/uiConfig.js";
import { CHART_CONFIG, type ChartConfig } from "../../src/constants/chartConfig.js";
import { SORT_CONFIG, type SortConfig } from "../../src/constants/sortConfig.js";
import { CELL_TYPE_CONFIG, type CellTypeConfig } from "../../src/constants/cellTypeConfig.js";
import { ERROR_LEVEL, ERROR_CODE, type ErrorCode } from "../../src/constants/errorCodes.js";
import { EVENT_NAMES, DELEGATE_KEYS, type EventNames, type DelegateKeys } from "../../src/constants/eventNames.js";
import { HOOKS, type Hooks } from "../../src/constants/hookNames.js";
import { SHEET_EVENTS, EVENT_FLOW_REGISTRY, type SheetEvents, type EventFlowRegistry } from "../../src/constants/sheetEvents.js";
import { STRATEGY_PRIORITY, PriorityUtils, type StrategyPriority, type LayerInfo, type ValidationResult } from "../../src/constants/strategyPriority.js";
import { CONFIG, type Config } from "../../src/constants/config.js";

// ═══════════════════════════════════════════════════
// 辅助工具
// ═══════════════════════════════════════════════════

function isFrozen(obj: object): boolean {
    return Object.isFrozen(obj);
}

function getOwnKeys(obj: object): string[] {
    return Object.getOwnPropertyNames(obj).filter((k) => typeof (obj as Record<string, unknown>)[k] !== "function");
}

function allValuesUnique(obj: object): boolean {
    const keys = getOwnKeys(obj);
    const values = keys.map((k) => (obj as Record<string, unknown>)[k]);
    return new Set(values).size === values.length;
}

function allValuesAreStrings(obj: object): boolean {
    return getOwnKeys(obj).every((k) => typeof (obj as Record<string, unknown>)[k] === "string");
}

function allValuesAreNumbers(obj: object): boolean {
    return getOwnKeys(obj).every((k) => typeof (obj as Record<string, unknown>)[k] === "number");
}

// ═══════════════════════════════════════════════════
// 枚举常量测试
// ═══════════════════════════════════════════════════

describe("枚举常量", () => {
    describe("AUTO_FILL_DIR", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(AUTO_FILL_DIR)).toBe(true);
        });

        it("应包含四个方向", () => {
            expect(AUTO_FILL_DIR.UP).toBe("up");
            expect(AUTO_FILL_DIR.DOWN).toBe("down");
            expect(AUTO_FILL_DIR.LEFT).toBe("left");
            expect(AUTO_FILL_DIR.RIGHT).toBe("right");
        });

        it("所有值应唯一", () => {
            expect(allValuesUnique(AUTO_FILL_DIR)).toBe(true);
        });
    });

    describe("BORDER_STYLE", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(BORDER_STYLE)).toBe(true);
        });

        it("应包含三种边框样式", () => {
            expect(BORDER_STYLE.SOLID).toBe("solid");
            expect(BORDER_STYLE.DASHED).toBe("dashed");
            expect(BORDER_STYLE.DOTTED).toBe("dotted");
        });
    });

    describe("CHART_TYPE", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(CHART_TYPE)).toBe(true);
        });

        it("应包含十种图表类型", () => {
            const keys = getOwnKeys(CHART_TYPE);
            expect(keys.length).toBe(10);
            expect(CHART_TYPE.LINE).toBe("line");
            expect(CHART_TYPE.BAR).toBe("bar");
            expect(CHART_TYPE.PIE).toBe("pie");
            expect(CHART_TYPE.HEATMAP).toBe("heatmap");
        });

        it("所有值应为字符串且唯一", () => {
            expect(allValuesAreStrings(CHART_TYPE)).toBe(true);
            expect(allValuesUnique(CHART_TYPE)).toBe(true);
        });
    });

    describe("CONTENT_TYPE", () => {
        it("应包含 IMAGE 和 CHART", () => {
            expect(CONTENT_TYPE.IMAGE).toBe("image");
            expect(CONTENT_TYPE.CHART).toBe("chart");
        });
    });

    describe("ERROR_STYLE", () => {
        it("应包含三种错误样式", () => {
            expect(ERROR_STYLE.STOP).toBe("stop");
            expect(ERROR_STYLE.WARNING).toBe("warning");
            expect(ERROR_STYLE.INFO).toBe("info");
        });
    });

    describe("FONT_STYLE", () => {
        it("应包含四种字体样式", () => {
            expect(FONT_STYLE.ITALIC).toBe("italic");
            expect(FONT_STYLE.BOLD).toBe("bold");
            expect(FONT_STYLE.UNDERLINE).toBe("underline");
            expect(FONT_STYLE.NORMAL).toBe("normal");
        });
    });

    describe("SCROLL_AXIS", () => {
        it("应包含水平和垂直轴", () => {
            expect(SCROLL_AXIS.HORIZONTAL).toBe("h");
            expect(SCROLL_AXIS.VERTICAL).toBe("v");
        });
    });

    describe("SORT_ARROW_DIR", () => {
        it("应包含向上和向下方向", () => {
            expect(SORT_ARROW_DIR.UP).toBe("up");
            expect(SORT_ARROW_DIR.DOWN).toBe("down");
        });
    });

    describe("SORT_ORDER", () => {
        it("应包含升序和降序", () => {
            expect(SORT_ORDER.ASC).toBe("asc");
            expect(SORT_ORDER.DESC).toBe("desc");
        });
    });

    describe("STYLE_SCOPE", () => {
        it("应包含行、列、单元格三种作用域", () => {
            expect(STYLE_SCOPE.ROW).toBe("row");
            expect(STYLE_SCOPE.COL).toBe("col");
            expect(STYLE_SCOPE.CELL).toBe("cell");
        });
    });

    describe("TEXT_ALIGN", () => {
        it("应包含三种对齐方式", () => {
            expect(TEXT_ALIGN.LEFT).toBe("left");
            expect(TEXT_ALIGN.CENTER).toBe("center");
            expect(TEXT_ALIGN.RIGHT).toBe("right");
        });
    });

    describe("VALIDATION_RULE_TYPE", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(VALIDATION_RULE_TYPE)).toBe(true);
        });

        it("应包含九种验证类型", () => {
            const keys = getOwnKeys(VALIDATION_RULE_TYPE);
            expect(keys.length).toBe(9);
            expect(VALIDATION_RULE_TYPE.NUMBER).toBe("number");
            expect(VALIDATION_RULE_TYPE.REGEX).toBe("regex");
            expect(VALIDATION_RULE_TYPE.UNIQUE).toBe("unique");
        });
    });

    describe("VERTICAL_ALIGN", () => {
        it("应包含三种垂直对齐方式", () => {
            expect(VERTICAL_ALIGN.TOP).toBe("top");
            expect(VERTICAL_ALIGN.MIDDLE).toBe("middle");
            expect(VERTICAL_ALIGN.BOTTOM).toBe("bottom");
        });
    });
});

// ═══════════════════════════════════════════════════
// 配置常量测试
// ═══════════════════════════════════════════════════

describe("配置常量", () => {
    describe("STYLE_LEVEL", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(STYLE_LEVEL)).toBe(true);
        });

        it("优先级应递增排列", () => {
            expect(STYLE_LEVEL.THEME).toBeLessThan(STYLE_LEVEL.COL);
            expect(STYLE_LEVEL.COL).toBeLessThan(STYLE_LEVEL.ROW);
            expect(STYLE_LEVEL.ROW).toBeLessThan(STYLE_LEVEL.CELL);
            expect(STYLE_LEVEL.CELL).toBeLessThan(STYLE_LEVEL.CONDITIONAL);
            expect(STYLE_LEVEL.CONDITIONAL).toBeLessThan(STYLE_LEVEL.DATA_BINDING);
        });

        it("所有值应为数字且唯一", () => {
            expect(allValuesAreNumbers(STYLE_LEVEL)).toBe(true);
            expect(allValuesUnique(STYLE_LEVEL)).toBe(true);
        });
    });

    describe("LAYER_Z_INDEX", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(LAYER_Z_INDEX)).toBe(true);
        });

        it("图层 z-index 应递增排列", () => {
            expect(LAYER_Z_INDEX.TILE).toBeLessThan(LAYER_Z_INDEX.SELECTION);
            expect(LAYER_Z_INDEX.SELECTION).toBeLessThan(LAYER_Z_INDEX.FROZEN);
            expect(LAYER_Z_INDEX.FROZEN).toBeLessThan(LAYER_Z_INDEX.CHART);
            expect(LAYER_Z_INDEX.CHART).toBeLessThan(LAYER_Z_INDEX.INTERACTION);
            expect(LAYER_Z_INDEX.INTERACTION).toBeLessThan(LAYER_Z_INDEX.HEADER);
        });
    });

    describe("HIT_TYPE", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(HIT_TYPE)).toBe(true);
        });

        it("应包含所有命中类型", () => {
            expect(HIT_TYPE.CORNER).toBe("corner");
            expect(HIT_TYPE.COL_HEADER).toBe("col-header");
            expect(HIT_TYPE.ROW_HEADER).toBe("row-header");
            expect(HIT_TYPE.CELL).toBe("cell");
            expect(HIT_TYPE.COL_RESIZE).toBe("col-resize");
            expect(HIT_TYPE.ROW_RESIZE).toBe("row-resize");
            expect(HIT_TYPE.CHART).toBe("chart");
        });

        it("所有值应为字符串且唯一", () => {
            expect(allValuesAreStrings(HIT_TYPE)).toBe(true);
            expect(allValuesUnique(HIT_TYPE)).toBe(true);
        });
    });

    describe("CORE_CONFIG", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(CORE_CONFIG)).toBe(true);
        });

        it("应包含数据规模常量", () => {
            expect(CORE_CONFIG.MAX_ROWS).toBe(10000000);
            expect(CORE_CONFIG.MAX_COLS).toBe(70000);
        });

        it("应包含默认尺寸常量", () => {
            expect(CORE_CONFIG.DEFAULT_COL_WIDTH).toBe(100);
            expect(CORE_CONFIG.DEFAULT_ROW_HEIGHT).toBe(28);
            expect(CORE_CONFIG.HEADER_WIDTH).toBe(46);
            expect(CORE_CONFIG.HEADER_HEIGHT).toBe(28);
        });

        it("应包含瓦片分块常量", () => {
            expect(CORE_CONFIG.CHUNK_ROW_SIZE).toBe(1024);
            expect(CORE_CONFIG.CHUNK_COL_SIZE).toBe(256);
            expect(CORE_CONFIG.TILE_SIZE).toBe(256);
            expect(CORE_CONFIG.TILE_CACHE_MAX).toBe(512);
        });

        it("DPR 应为正数", () => {
            expect(CORE_CONFIG.DPR).toBeGreaterThan(0);
        });
    });

    describe("HEADER_CONFIG", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(HEADER_CONFIG)).toBe(true);
        });

        it("应包含表头颜色常量", () => {
            expect(HEADER_CONFIG.HEADER_BG).toBe("#f0f0f0");
            expect(HEADER_CONFIG.HEADER_HIGHLIGHT_BG).toBe("#dcdcdc");
            expect(HEADER_CONFIG.HEADER_HIGHLIGHT_COLOR).toBe("#217346");
        });
    });

    describe("SELECTION_CONFIG", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(SELECTION_CONFIG)).toBe(true);
        });

        it("应包含选区颜色和尺寸", () => {
            expect(SELECTION_CONFIG.SELECTION_COLOR).toBe("#217346");
            expect(SELECTION_CONFIG.SELECTION_LINE_WIDTH).toBe(2);
            expect(SELECTION_CONFIG.FILL_HANDLE_SIZE).toBe(5);
        });

        it("虚线模式应为数字数组", () => {
            expect(Array.isArray(SELECTION_CONFIG.BORDER_DASH_SOLID)).toBe(true);
            expect(SELECTION_CONFIG.BORDER_DASH_SOLID).toEqual([4, 2]);
        });
    });

    describe("UI_CONFIG", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(UI_CONFIG)).toBe(true);
        });

        it("应包含滚动条和标签栏配置", () => {
            expect(UI_CONFIG.SCROLLBAR_WIDTH).toBe(14);
            expect(UI_CONFIG.SHEET_TAB_HEIGHT).toBe(28);
            expect(UI_CONFIG.DEFAULT_SHEET_NAME).toBe("Sheet");
        });

        it("应包含轴标识", () => {
            expect(UI_CONFIG.AXIS_ROW).toBe("row");
            expect(UI_CONFIG.AXIS_COL).toBe("col");
        });
    });

    describe("CHART_CONFIG", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(CHART_CONFIG)).toBe(true);
        });

        it("应包含图表渲染和选择配置", () => {
            expect(CHART_CONFIG.CHART_FONT_FAMILY).toBe("sans-serif");
            expect(CHART_CONFIG.CHART_MIN_WIDTH).toBe(100);
            expect(CHART_CONFIG.CHART_MIN_HEIGHT).toBe(80);
        });
    });

    describe("SORT_CONFIG", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(SORT_CONFIG)).toBe(true);
        });

        it("应包含排序颜色和尺寸", () => {
            expect(SORT_CONFIG.SORT_ACTIVE_COLOR).toBe("#1890ff");
            expect(SORT_CONFIG.SORT_ARROW_SIZE).toBe(12);
        });
    });

    describe("CELL_TYPE_CONFIG", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(CELL_TYPE_CONFIG)).toBe(true);
        });

        it("应包含进度条配置", () => {
            expect(CELL_TYPE_CONFIG.PROGRESS_BAR_TRACK_COLOR).toBe("#e0e0e0");
            expect(CELL_TYPE_CONFIG.PROGRESS_BAR_HEIGHT_RATIO).toBeCloseTo(0.6);
        });

        it("应包含星级评分配置", () => {
            expect(CELL_TYPE_CONFIG.STAR_RATING_MAX_STARS).toBe(5);
            expect(CELL_TYPE_CONFIG.STAR_RATING_STAR_SIZE).toBe(16);
        });

        it("应包含自动超链接配置", () => {
            expect(CELL_TYPE_CONFIG.AUTO_LINK_COLOR).toBe("#0066cc");
            expect(CELL_TYPE_CONFIG.AUTO_LINK_UNDERLINE_WIDTH).toBe(1);
        });
    });
});

// ═══════════════════════════════════════════════════
// 错误码常量测试
// ═══════════════════════════════════════════════════

describe("ERROR_LEVEL & ERROR_CODE", () => {
    describe("ERROR_LEVEL", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(ERROR_LEVEL)).toBe(true);
        });

        it("级别应递增排列", () => {
            expect(ERROR_LEVEL.DEBUG).toBeLessThan(ERROR_LEVEL.INFO);
            expect(ERROR_LEVEL.INFO).toBeLessThan(ERROR_LEVEL.WARN);
            expect(ERROR_LEVEL.WARN).toBeLessThan(ERROR_LEVEL.ERROR);
            expect(ERROR_LEVEL.ERROR).toBeLessThan(ERROR_LEVEL.FATAL);
        });
    });

    describe("ERROR_CODE", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(ERROR_CODE)).toBe(true);
        });

        it("所有值应为字符串且唯一", () => {
            expect(allValuesAreStrings(ERROR_CODE)).toBe(true);
            expect(allValuesUnique(ERROR_CODE)).toBe(true);
        });

        it("键名与值应一致（自描述错误码）", () => {
            const keys = getOwnKeys(ERROR_CODE);
            for (const key of keys) {
                expect((ERROR_CODE as Record<string, string>)[key]).toBe(key);
            }
        });

        it("应包含搜索相关错误码", () => {
            expect(ERROR_CODE.SEARCH_EMPTY_RANGE).toBe("SEARCH_EMPTY_RANGE");
            expect(ERROR_CODE.SEARCH_INVALID_REGEX).toBe("SEARCH_INVALID_REGEX");
            expect(ERROR_CODE.SEARCH_NO_RESULTS).toBe("SEARCH_NO_RESULTS");
        });

        it("应包含导入/导出相关错误码", () => {
            expect(ERROR_CODE.IMPORT_FILE_READ_ERROR).toBe("IMPORT_FILE_READ_ERROR");
            expect(ERROR_CODE.EXPORT_FILE_GENERATE_FAILED).toBe("EXPORT_FILE_GENERATE_FAILED");
        });
    });
});

// ═══════════════════════════════════════════════════
// 事件名称常量测试
// ═══════════════════════════════════════════════════

describe("EVENT_NAMES & DELEGATE_KEYS", () => {
    describe("EVENT_NAMES", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(EVENT_NAMES)).toBe(true);
        });

        it("所有值应为字符串且唯一", () => {
            expect(allValuesAreStrings(EVENT_NAMES)).toBe(true);
            expect(allValuesUnique(EVENT_NAMES)).toBe(true);
        });

        it("应包含常用 DOM 事件", () => {
            expect(EVENT_NAMES.CLICK).toBe("click");
            expect(EVENT_NAMES.KEYDOWN).toBe("keydown");
            expect(EVENT_NAMES.SCROLL).toBe("scroll");
            expect(EVENT_NAMES.WHEEL).toBe("wheel");
        });
    });

    describe("DELEGATE_KEYS", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(DELEGATE_KEYS)).toBe(true);
        });

        it("所有值应为字符串且唯一", () => {
            expect(allValuesAreStrings(DELEGATE_KEYS)).toBe(true);
            expect(allValuesUnique(DELEGATE_KEYS)).toBe(true);
        });

        it("应使用 target:event 命名格式", () => {
            const keys = getOwnKeys(DELEGATE_KEYS);
            for (const key of keys) {
                const value = (DELEGATE_KEYS as Record<string, string>)[key];
                expect(value).toContain(":");
            }
        });

        it("应包含 Canvas 和 Document 事件", () => {
            expect(DELEGATE_KEYS.CANVAS_MOUSEDOWN).toBe("canvas:mousedown");
            expect(DELEGATE_KEYS.DOCUMENT_KEYDOWN).toBe("document:keydown");
        });
    });
});

// ═══════════════════════════════════════════════════
// 钩子名称常量测试
// ═══════════════════════════════════════════════════

describe("HOOKS", () => {
    it("应被 Object.freeze 冻结", () => {
        expect(isFrozen(HOOKS)).toBe(true);
    });

    it("所有值应为字符串且唯一", () => {
        expect(allValuesAreStrings(HOOKS)).toBe(true);
        expect(allValuesUnique(HOOKS)).toBe(true);
    });

    it("before* 钩子应有对应的 after* 钩子", () => {
        const keys = getOwnKeys(HOOKS);
        const beforeKeys = keys.filter((k) => k.startsWith("BEFORE_"));

        for (const bk of beforeKeys) {
            const afterKey = bk.replace("BEFORE_", "AFTER_");
            if (afterKey !== bk) {
                expect(keys).toContain(afterKey);
            }
        }
    });

    it("应包含编辑相关钩子", () => {
        expect(HOOKS.BEFORE_BEGIN_EDITING).toBe("beforeBeginEditing");
        expect(HOOKS.AFTER_FINISH_EDITING).toBe("afterFinishEditing");
    });

    it("应包含搜索相关钩子", () => {
        expect(HOOKS.BEFORE_SEARCH).toBe("beforeSearch");
        expect(HOOKS.AFTER_SEARCH_REPLACE_ALL).toBe("afterSearchReplaceAll");
    });

    it("应包含生命周期钩子", () => {
        expect(HOOKS.INIT).toBe("init");
        expect(HOOKS.DESTROY).toBe("destroy");
    });
});

// ═══════════════════════════════════════════════════
// 工作表事件常量测试
// ═══════════════════════════════════════════════════

describe("SHEET_EVENTS & EVENT_FLOW_REGISTRY", () => {
    describe("SHEET_EVENTS", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(SHEET_EVENTS)).toBe(true);
        });

        it("所有值应为字符串且唯一", () => {
            expect(allValuesAreStrings(SHEET_EVENTS)).toBe(true);
            expect(allValuesUnique(SHEET_EVENTS)).toBe(true);
        });

        it("事件名应使用命名空间格式", () => {
            const keys = getOwnKeys(SHEET_EVENTS);
            for (const key of keys) {
                const value = (SHEET_EVENTS as Record<string, string>)[key];
                expect(value).toContain(":");
            }
        });

        it("应包含渲染控制事件", () => {
            expect(SHEET_EVENTS.INVALIDATE_ALL).toBe("sheet:invalidate-all");
            expect(SHEET_EVENTS.RENDER_REQUEST).toBe("sheet:render-request");
        });

        it("应包含数据变更事件", () => {
            expect(SHEET_EVENTS.CELL_CHANGED).toBe("sheet:cell-changed");
            expect(SHEET_EVENTS.AFTER_CHANGE).toBe("sheet:after-change");
        });
    });

    describe("EVENT_FLOW_REGISTRY", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(EVENT_FLOW_REGISTRY)).toBe(true);
        });

        it("每个事件应有 emitters 和 listeners 数组", () => {
            const keys = getOwnKeys(EVENT_FLOW_REGISTRY);
            for (const key of keys) {
                const entry = (EVENT_FLOW_REGISTRY as Record<string, { emitters: unknown[]; listeners: unknown[] }>)[key];
                expect(Array.isArray(entry.emitters)).toBe(true);
                expect(Array.isArray(entry.listeners)).toBe(true);
            }
        });

        it("SHEET_EVENTS 的每个事件都应在注册表中有条目", () => {
            const eventKeys = getOwnKeys(SHEET_EVENTS);
            const registryKeys = getOwnKeys(EVENT_FLOW_REGISTRY);

            for (const ek of eventKeys) {
                const eventValue = (SHEET_EVENTS as Record<string, string>)[ek];
                expect(registryKeys).toContain(eventValue);
            }
        });
    });
});

// ═══════════════════════════════════════════════════
// 策略优先级常量测试
// ═══════════════════════════════════════════════════

describe("STRATEGY_PRIORITY & PriorityUtils", () => {
    describe("STRATEGY_PRIORITY", () => {
        it("应被 Object.freeze 冻结", () => {
            expect(isFrozen(STRATEGY_PRIORITY)).toBe(true);
        });

        it("所有值应为数字且唯一", () => {
            expect(allValuesAreNumbers(STRATEGY_PRIORITY)).toBe(true);
            expect(allValuesUnique(STRATEGY_PRIORITY)).toBe(true);
        });

        it("优先级应递增排列", () => {
            const keys = getOwnKeys(STRATEGY_PRIORITY);
            const values = keys.map((k) => (STRATEGY_PRIORITY as Record<string, number>)[k]);
            for (let i = 1; i < values.length; i++) {
                expect(values[i]).toBeGreaterThan(values[i - 1]);
            }
        });

        it("基础层应为 100-299 范围", () => {
            expect(STRATEGY_PRIORITY.KEYBOARD_BASE).toBe(100);
            expect(STRATEGY_PRIORITY.SHORTCUT_KEY).toBe(200);
        });

        it("关键操作层应为 950+", () => {
            expect(STRATEGY_PRIORITY.DATA_VALIDATION).toBe(950);
            expect(STRATEGY_PRIORITY.DATA_SORT).toBe(1000);
            expect(STRATEGY_PRIORITY.DATA_FILTER).toBe(1100);
        });
    });

    describe("PriorityUtils.between", () => {
        it("应在两个锚点之间生成中间值", () => {
            const mid = PriorityUtils.between(100, 200, "middle");
            expect(mid).toBe(150);
        });

        it("early 位置应在 25% 处", () => {
            const early = PriorityUtils.between(100, 200, "early");
            expect(early).toBe(125);
        });

        it("late 位置应在 75% 处", () => {
            const late = PriorityUtils.between(100, 200, "late");
            expect(late).toBe(175);
        });

        it("默认位置应为 middle", () => {
            const def = PriorityUtils.between(100, 200);
            expect(def).toBe(150);
        });
    });

    describe("PriorityUtils.validate", () => {
        it("应接受合法优先级", () => {
            const result = PriorityUtils.validate(300);
            expect(result.valid).toBe(true);
        });

        it("应拒绝非整数", () => {
            const result = PriorityUtils.validate(300.5);
            expect(result.valid).toBe(false);
        });

        it("应拒绝小于 100 的值", () => {
            const result = PriorityUtils.validate(50);
            expect(result.valid).toBe(false);
        });

        it("应拒绝大于 2000 的值", () => {
            const result = PriorityUtils.validate(3000);
            expect(result.valid).toBe(false);
        });
    });

    describe("PriorityUtils.getLayerInfo", () => {
        it("基础层 (100-299) 应返回 BASE", () => {
            const info = PriorityUtils.getLayerInfo(200);
            expect(info.layer).toBe(1);
            expect(info.name).toBe("BASE");
        });

        it("标准交互层 (300-599) 应返回 STANDARD", () => {
            const info = PriorityUtils.getLayerInfo(400);
            expect(info.layer).toBe(2);
            expect(info.name).toBe("STANDARD");
        });

        it("高级功能层 (600-999) 应返回 ADVANCED", () => {
            const info = PriorityUtils.getLayerInfo(800);
            expect(info.layer).toBe(3);
            expect(info.name).toBe("ADVANCED");
        });

        it("关键操作层 (1000+) 应返回 CRITICAL", () => {
            const info = PriorityUtils.getLayerInfo(1100);
            expect(info.layer).toBe(4);
            expect(info.name).toBe("CRITICAL");
        });
    });
});

// ═══════════════════════════════════════════════════
// CONFIG barrel 文件测试
// ═══════════════════════════════════════════════════

describe("CONFIG (barrel)", () => {
    it("应被 Object.freeze 冻结", () => {
        expect(isFrozen(CONFIG)).toBe(true);
    });

    it("应包含 CORE_CONFIG 的所有键", () => {
        expect(CONFIG.MAX_ROWS).toBe(10000000);
        expect(CONFIG.DEFAULT_COL_WIDTH).toBe(100);
        expect(CONFIG.DEFAULT_FONT_FAMILY).toBe("Microsoft YaHei");
    });

    it("应包含 HEADER_CONFIG 的所有键", () => {
        expect(CONFIG.HEADER_BG).toBe("#f0f0f0");
    });

    it("应包含 SELECTION_CONFIG 的所有键", () => {
        expect(CONFIG.SELECTION_COLOR).toBe("#217346");
    });

    it("应包含 UI_CONFIG 的所有键", () => {
        expect(CONFIG.SCROLLBAR_WIDTH).toBe(14);
        expect(CONFIG.AXIS_ROW).toBe("row");
    });

    it("应包含 STYLE_LEVEL 的非冲突键", () => {
        expect(CONFIG.THEME).toBe(100);
        expect(CONFIG.COL).toBe(200);
        expect(CONFIG.ROW).toBe(300);
        expect(CONFIG.CONDITIONAL).toBe(500);
        expect(CONFIG.DATA_BINDING).toBe(600);
    });

    it("CELL 键冲突时 HIT_TYPE 应覆盖 STYLE_LEVEL", () => {
        expect(CONFIG.CELL).toBe("cell");
    });

    it("CHART 键冲突时 HIT_TYPE 应覆盖 LAYER_Z_INDEX", () => {
        expect(CONFIG.CHART).toBe("chart");
    });

    it("应包含 LAYER_Z_INDEX 的所有键", () => {
        expect(CONFIG.TILE).toBe(100);
        expect(CONFIG.HEADER).toBe(600);
    });

    it("应包含 HIT_TYPE 的所有键", () => {
        expect(CONFIG.CORNER).toBe("corner");
        expect(CONFIG.CELL).toBe("cell");
    });

    it("应包含 STRATEGY_PRIORITY 的所有键", () => {
        expect(CONFIG.KEYBOARD_BASE).toBe(100);
        expect(CONFIG.DATA_FILTER).toBe(1100);
    });

    it("不应有 undefined 值（所有子配置正确合并）", () => {
        const keys = getOwnKeys(CONFIG);
        for (const key of keys) {
            expect((CONFIG as Record<string, unknown>)[key]).not.toBeUndefined();
        }
    });
});

// ═══════════════════════════════════════════════════
// 类型导出验证测试
// ═══════════════════════════════════════════════════

describe("TypeScript 类型导出", () => {
    it("枚举类型应可被引用（编译时检查）", () => {
        const _dir: AutoFillDir = AUTO_FILL_DIR;
        const _border: BorderStyle = BORDER_STYLE;
        const _chart: ChartType = CHART_TYPE;
        const _content: ContentType = CONTENT_TYPE;
        const _error: ErrorStyle = ERROR_STYLE;
        const _font: FontStyle = FONT_STYLE;
        const _scroll: ScrollAxis = SCROLL_AXIS;
        const _sortArrow: SortArrowDir = SORT_ARROW_DIR;
        const _sortOrder: SortOrder = SORT_ORDER;
        const _scope: StyleScope = STYLE_SCOPE;
        const _textAlign: TextAlign = TEXT_ALIGN;
        const _validation: ValidationRuleType = VALIDATION_RULE_TYPE;
        const _vertical: VerticalAlign = VERTICAL_ALIGN;
        expect(true).toBe(true);
    });

    it("配置类型应可被引用（编译时检查）", () => {
        const _style: StyleLevel = STYLE_LEVEL;
        const _layer: LayerZIndex = LAYER_Z_INDEX;
        const _hit: HitType = HIT_TYPE;
        const _core: CoreConfig = CORE_CONFIG;
        const _header: HeaderConfig = HEADER_CONFIG;
        const _selection: SelectionConfig = SELECTION_CONFIG;
        const _ui: UiConfig = UI_CONFIG;
        const _chart: ChartConfig = CHART_CONFIG;
        const _sort: SortConfig = SORT_CONFIG;
        const _cellType: CellTypeConfig = CELL_TYPE_CONFIG;
        const _config: Config = CONFIG;
        expect(true).toBe(true);
    });

    it("事件/钩子类型应可被引用（编译时检查）", () => {
        const _events: EventNames = EVENT_NAMES;
        const _delegates: DelegateKeys = DELEGATE_KEYS;
        const _hooks: Hooks = HOOKS;
        const _sheetEvents: SheetEvents = SHEET_EVENTS;
        const _flow: EventFlowRegistry = EVENT_FLOW_REGISTRY;
        const _priority: StrategyPriority = STRATEGY_PRIORITY;
        expect(true).toBe(true);
    });

    it("工具函数返回类型应正确", () => {
        const layerInfo: LayerInfo = PriorityUtils.getLayerInfo(300);
        expect(layerInfo.layer).toBe(2);
        expect(layerInfo.name).toBe("STANDARD");

        const validation: ValidationResult = PriorityUtils.validate(300);
        expect(validation.valid).toBe(true);
    });
});