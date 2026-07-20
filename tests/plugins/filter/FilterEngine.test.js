import { FilterEngine } from "../../../src/plugins/filter/FilterEngine.js";
import { NullValueHandler } from "../../../src/plugins/filter/NullValueTypes.js";

describe("FilterEngine", () => {
    
    let mockSheet;
    let filterState;
    let filterEngine;

    beforeEach(() => {
        mockSheet = {
            rowCount: 5,
            data: [
                ["Alice", 30, "Sales"],
                [null, null, "Dev"],
                ["", 25, "HR"],
                ["Bob", 35, ""],
                [null, 28, "Sales"]
            ],
            getCellValue: (row, col) => mockSheet.data[row][col]
        };

        filterState = {
            columnFilters: new Map(),
            uniqueValuesCache: new Map(),
            invalidatedColumns: new Set(),
            setColumnFilter: (col, filter) => filterState.columnFilters.set(col, filter),
            removeColumnFilter: (col) => {
                filterState.columnFilters.delete(col);
                filterState.uniqueValuesCache.delete(col);
            },
            getColumnFilter: (col) => filterState.columnFilters.get(col) || null,
            getAllFilters: () => new Map(filterState.columnFilters),
            hasActiveFilters: () => filterState.columnFilters.size > 0,
            clearAll: () => {
                filterState.columnFilters.clear();
                filterState.uniqueValuesCache.clear();
                filterState.invalidatedColumns.clear();
            },
            cacheUniqueValues: (col, values) => filterState.uniqueValuesCache.set(col, values),
            getUniqueValuesCache: (col) => filterState.uniqueValuesCache.get(col) || null,
            invalidateColumnCache: (col) => {
                if (col !== undefined) {
                    filterState.invalidatedColumns.add(col);
                    filterState.uniqueValuesCache.delete(col);
                } else {
                    filterState.uniqueValuesCache.clear();
                }
            },
            isCacheValid: (col) => !filterState.invalidatedColumns.has(col)
        };

        filterEngine = new FilterEngine(mockSheet, filterState);
    });

    describe("extractUniqueValues()", () => {

        it("应该提取唯一值（含空值）", () => {
            const values = filterEngine.extractUniqueValues(0); // Name 列
            
            expect(values).toContain("Alice");
            expect(values).toContain("Bob");
            expect(values).toContain(NullValueHandler.NULL_KEY);
        });

        it("空值应排在最后", () => {
            const values = filterEngine.extractUniqueValues(0);
            
            expect(values[values.length - 1]).toBe(NullValueHandler.NULL_KEY);
        });

        it("值应按字母排序", () => {
            const values = filterEngine.extractUniqueValues(0);
            
            const normalValues = values.filter(v => v !== NullValueHandler.NULL_KEY);
            for (let i = 1; i < normalValues.length; i++) {
                expect(normalValues[i] >= normalValues[i-1]).toBe(true);
            }
        });

        it("应该使用缓存", () => {
            const firstCall = filterEngine.extractUniqueValues(1); // Age 列
            const secondCall = filterEngine.extractUniqueValues(1);
            
            expect(firstCall).toEqual(secondCall);
        });
    });

    describe("computeHiddenRows()", () => {

        it("无筛选器时应返回空集合", () => {
            const hiddenRows = filterEngine.computeHiddenRows();
            
            expect(hiddenRows.size).toBe(0);
        });

        it("值筛选器应正确计算隐藏行", () => {
            filterState.setColumnFilter(0, {
                type: "values",
                uncheckedValues: new Set([NullValueHandler.NULL_KEY])
            });
            
            const hiddenRows = filterEngine.computeHiddenRows();
            
            // Row 1 (null), Row 2 (""), Row 4 (null) 应该被隐藏
            expect(hiddenRows.has(1)).toBe(true);
            expect(hiddenRows.has(2)).toBe(true);
            expect(hiddenRows.has(4)).toBe(true);

            // Row 0 ("Alice"), Row 3 ("Bob") 应该可见
            expect(hiddenRows.has(0)).toBe(false);
            expect(hiddenRows.has(3)).toBe(false);
        });

        it("条件筛选器 - 等于空应匹配空单元格", () => {
            filterState.setColumnFilter(0, {
                type: "condition",
                operator: "eq",
                value: ""
            });
            
            const hiddenRows = filterEngine.computeHiddenRows();
            
            // 只有空值行可见
            expect(hiddenRows.has(0)).toBe(true); // Alice
            expect(hiddenRows.has(1)).toBe(false); // null
            expect(hiddenRows.has(2)).toBe(false); // ""
            expect(hiddenRows.has(3)).toBe(true); // Bob
            expect(hiddenRows.has(4)).toBe(false); // null
        });

        it("条件筛选器 - 包含不应匹配空单元格", () => {
            filterState.setColumnFilter(2, { // Dept 列
                type: "condition",
                operator: "contains",
                value: "S"
            });
            
            const hiddenRows = filterEngine.computeHiddenRows();
            
            // Row 3 (Carol, Dept="") 不匹配，应隐藏
            expect(hiddenRows.has(3)).toBe(true);
        });

        it("多列筛选应取交集", () => {
            filterState.setColumnFilter(0, {
                type: "values",
                uncheckedValues: new Set(["Bob"])
            });
            filterState.setColumnFilter(1, {
                type: "condition",
                operator: "gt",
                value: "27"
            });
            
            const hiddenRows = filterEngine.computeHiddenRows();
            
            // Row 3 (Bob) 被第一列过滤
            expect(hiddenRows.has(3)).toBe(true);
        });
    });
});
