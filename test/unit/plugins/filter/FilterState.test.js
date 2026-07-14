import { FilterState } from "../../../src/plugins/filter/FilterState.js";

describe("FilterState", () => {
    
    let filterState;
    
    beforeEach(() => {
        filterState = new FilterState();
    });

    describe("setColumnFilter() / getColumnFilter()", () => {
        
        it("应该设置和获取筛选器", () => {
            const filter = {
                type: "values",
                uncheckedValues: new Set(["Alice"])
            };
            
            filterState.setColumnFilter(0, filter);
            const result = filterState.getColumnFilter(0);
            
            expect(result).toEqual(filter);
        });

        it("不存在的列应返回 null", () => {
            expect(filterState.getColumnFilter(999)).toBe(null);
        });
    });

    describe("removeColumnFilter()", () => {
        
        it("应该移除指定列的筛选器", () => {
            filterState.setColumnFilter(0, { type: "values", uncheckedValues: new Set() });
            filterState.removeColumnFilter(0);
            
            expect(filterState.getColumnFilter(0)).toBe(null);
        });
    });

    describe("getAllFilters()", () => {
        
        it("应该返回所有活跃的筛选器", () => {
            filterState.setColumnFilter(0, { type: "values", uncheckedValues: new Set(["A"]) });
            filterState.setColumnFilter(1, { type: "condition", operator: "eq", value: "test" });
            
            const allFilters = filterState.getAllFilters();
            
            expect(allFilters.size).toBe(2);
            expect(allFilters.has(0)).toBe(true);
            expect(allFilters.has(1)).toBe(true);
        });
    });

    describe("hasActiveFilters()", () => {
        
        it("有筛选器时应返回 true", () => {
            filterState.setColumnFilter(0, { type: "values", uncheckedValues: new Set() });
            expect(filterState.hasActiveFilters()).toBe(true);
        });

        it("无筛选器时应返回 false", () => {
            expect(filterState.hasActiveFilters()).toBe(false);
        });
    });

    describe("clearAll()", () => {
        
        it("应该清除所有筛选器和缓存", () => {
            filterState.setColumnFilter(0, { type: "values", uncheckedValues: new Set() });
            filterState.cacheUniqueValues(0, ["A", "B"]);
            
            filterState.clearAll();
            
            expect(filterState.hasActiveFilters()).toBe(false);
            expect(filterState.getUniqueValuesCache(0)).toBe(null);
        });
    });

    describe("uniqueValuesCache", () => {
        
        it("应该缓存唯一值", () => {
            const values = ["Alice", "Bob", "Carol"];
            filterState.cacheUniqueValues(0, values);
            
            expect(filterState.getUniqueValuesCache(0)).toEqual(values);
        });

        it("invalidateColumnCache 应清除指定列的缓存", () => {
            filterState.cacheUniqueValues(0, ["A"]);
            filterState.cacheUniqueValues(1, ["B"]);
            
            filterState.invalidateColumnCache(0);
            
            expect(filterState.getUniqueValuesCache(0)).toBe(null);
            expect(filterState.getUniqueValuesCache(1)).not.toBe(null);
        });

        it("isCacheValid 应正确判断缓存有效性", () => {
            expect(filterState.isCacheValid(0)).toBe(true);
            
            filterState.invalidateColumnCache(0);
            expect(filterState.isCacheValid(0)).toBe(false);
        });
    });
});
