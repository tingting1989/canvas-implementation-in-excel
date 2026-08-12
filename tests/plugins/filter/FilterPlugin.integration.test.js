import { FilterPlugin } from "@/plugins/filter/FilterPlugin.js";
import { NullValueHandler } from "../../../src/plugins/filter/NullValueTypes.js";

describe("FilterPlugin 集成测试", () => {
    
    let mockWorkbook;
    let filterPlugin;

    beforeEach(() => {
        mockWorkbook = {
            activeSheet: {
                rowCount: 5,
                colCount: 3,
                data: [
                    ["Name", "Age", "Dept"],
                    ["Alice", 30, "Sales"],
                    [null, null, "Dev"],
                    ["", 25, "HR"],
                    ["Bob", 35, ""],
                    [null, 28, "Sales"]
                ],
                getCellValue: (row, col) => mockWorkbook.activeSheet.data[row][col],
                setHiddenRows: jest.fn()
            },
            plugins: new Map(),
            registerPlugin: (pluginClass) => {
                const instance = new pluginClass(mockWorkbook);
                mockWorkbook.plugins.set(pluginClass.PLUGIN_NAME, instance);
                return instance;
            },
            getPlugin: (name) => mockWorkbook.plugins.get(name)
        };
    });

    describe("插件生命周期", () => {

        it("应该正确初始化和销毁", () => {
            const plugin = mockWorkbook.registerPlugin(FilterPlugin);
            
            expect(plugin).toBeInstanceOf(FilterPlugin);
            expect(mockWorkbook.activeSheet.filterState).toBeDefined();
            
            plugin.destroy();
            
            expect(mockWorkbook.activeSheet.filterState).toBeUndefined();
        });

        it("启用/禁用应该正常工作", () => {
            const plugin = mockWorkbook.registerPlugin(FilterPlugin);
            
            expect(plugin.enabled).toBe(true);
            
            plugin.disable();
            expect(plugin.enabled).toBe(false);
            
            plugin.enable();
            expect(plugin.enabled).toBe(true);
        });
    });

    describe("筛选功能", () => {

        beforeEach(() => {
            filterPlugin = mockWorkbook.registerPlugin(FilterPlugin);
            filterPlugin.init({ enabled: true });
        });

        it("应该正确设置值列表筛选", () => {
            const state = mockWorkbook.activeSheet.filterState;
            
            state.setColumnFilter(0, {
                type: "values",
                uncheckedValues: new Set(["Bob"])
            });

            const engine = filterPlugin.getFilterEngine();
            const hiddenRows = engine.computeHiddenRows();

            // Bob 在第 4 行（索引 3）
            expect(hiddenRows.has(3)).toBe(true);
        });

        it("应该正确处理空值筛选", () => {
            const state = mockWorkbook.activeSheet.filterState;
            
            state.setColumnFilter(0, {
                type: "values",
                uncheckedValues: new Set([NullValueHandler.NULL_KEY])
            });

            const engine = filterPlugin.getFilterEngine();
            const hiddenRows = engine.computeHiddenRows();

            // 空值行：1 (null), 2 (""), 4 (null)
            expect(hiddenRows.has(1)).toBe(true);
            expect(hiddenRows.has(2)).toBe(true);
            expect(hiddenRows.has(4)).toBe(true);
        });

        it("清除所有筛选应重置状态", () => {
            const state = mockWorkbook.activeSheet.filterState;
            
            state.setColumnFilter(0, {
                type: "values",
                uncheckedValues: new Set(["Alice"])
            });
            
            expect(state.hasActiveFilters()).toBe(true);

            filterPlugin.clearAllFilters();
            
            expect(state.hasActiveFilters()).toBe(false);
        });
    });

    describe("UI 交互", () => {

        beforeEach(() => {
            filterPlugin = mockWorkbook.registerPlugin(FilterPlugin);
            filterPlugin.init({ enabled: true });
        });

        it("打开/关闭下拉面板", () => {
            expect(filterPlugin.isDropdownOpen()).toBe(false);
            
            filterPlugin.openDropdown(0, { x: 100, y: 100 });
            
            expect(filterPlugin.isDropdownOpen()).toBe(true);
            
            filterPlugin.closeDropdown();
            
            expect(filterPlugin.isDropdownOpen()).toBe(false);
        });
    });
});
