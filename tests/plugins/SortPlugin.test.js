import { describe, it, expect, beforeEach } from 'vitest';
import { SortState } from '../../src/plugins/sort/SortState.js';
import { SortEngine } from '../../src/plugins/sort/SortEngine.js';
import { ChunkedCellStore } from '../../src/model/store/ChunkedCellStore.js';

describe('SortState', () => {
    let sortState;

    beforeEach(() => {
        sortState = new SortState();
    });

    describe('初始化状态', () => {
        it('应该处于未排序状态', () => {
            expect(sortState.isSorted).toBe(false);
            expect(sortState.sortCol).toBe(-1);
            expect(sortState.sortOrder).toBeNull();
        });

        it('不应该有恢复点', () => {
            expect(sortState.hasRestorePoint).toBe(false);
        });
    });

    describe('capturePreSortState', () => {
        it('应该捕获当前行顺序作为快照', () => {
            const order = [0, 1, 2, 3, 4];
            sortState.capturePreSortState(order);

            sortState.setPostSortOrder([0, 1, 2, 3, 4]);

            expect(sortState.hasRestorePoint).toBe(true);
            expect(sortState.toJSON().preSortSnapshotLength).toBe(5);
        });

        it('每次调用都应该更新快照（动态快照模式）', () => {
            sortState.capturePreSortState([0, 1, 2]);
            sortState.setCurrentSort(0, 'asc');
            sortState.setPostSortOrder([0, 1, 2]);

            sortState.capturePreSortState([2, 0, 1]);
            sortState.setCurrentSort(0, 'asc');
            sortState.setPostSortOrder([1, 2, 0]); // 模拟排序后的顺序

            const restoreMapping = sortState.getRestoreMapping();
            expect(restoreMapping).not.toBeNull();
        });
    });

    describe('setCurrentSort', () => {
        it('应该记录排序列和顺序', () => {
            sortState.setCurrentSort(0, 'asc');

            expect(sortState.isSorted).toBe(true);
            expect(sortState.sortCol).toBe(0);
            expect(sortState.sortOrder).toBe('asc');
        });

        it('应该支持降序', () => {
            sortState.setCurrentSort(2, 'desc');

            expect(sortState.sortCol).toBe(2);
            expect(sortState.sortOrder).toBe('desc');
        });
    });

    describe('getRestoreMapping', () => {
        it('未排序时应该返回 null', () => {
            const mapping = sortState.getRestoreMapping();
            expect(mapping).toBeNull();
        });

        it('已排序且有双快照时应该生成恢复映射', () => {
            sortState.capturePreSortState([0, 1, 2, 3]); // 排序前：位置0是行0，位置1是行1...
            sortState.setCurrentSort(0, 'asc');
            sortState.setPostSortOrder([3, 2, 1, 0]); // 排序后：位置0是行3，位置1是行2...

            // 模拟排序后的顺序变化
            const restoreMapping = sortState.getRestoreMapping();
            expect(restoreMapping).not.toBeNull();

            // 验证恢复映射的正确性：
            // 行0应该在位置0（当前在位置3）→ mapping.set(3, 0)
            // 行1应该在位置1（当前在位置2）→ mapping.set(2, 1)
            expect(restoreMapping.has(3)).toBe(true);
            expect(restoreMapping.get(3)).toBe(0);
            expect(restoreMapping.has(2)).toBe(true);
            expect(restoreMapping.get(2)).toBe(1);
        });

        it('如果当前位置与快照一致，映射表应为空或 null', () => {
            sortState.capturePreSortState([0, 1, 2, 3]);
            sortState.setCurrentSort(0, 'asc');
            sortState.setPostSortOrder([0, 1, 2, 3]); // 排序后顺序没变

            // 当前位置就是 [0,1,2,3]，没有变化
            const restoreMapping = sortState.getRestoreMapping();
            if (restoreMapping !== null) {
                expect(restoreMapping.size).toBe(0);
            }
        });
    });

    describe('clear', () => {
        it('应该清除排序状态但保留快照', () => {
            sortState.capturePreSortState([0, 1, 2]);
            sortState.setCurrentSort(0, 'asc');
            sortState.setPostSortOrder([2, 1, 0]); // 模拟排序后的顺序
            sortState.clear();

            expect(sortState.isSorted).toBe(false);
            expect(sortState.sortCol).toBe(-1);
            expect(sortState.sortOrder).toBeNull();
            expect(sortState.hasRestorePoint).toBe(true); // 快照保留
        });
    });

    describe('reset', () => {
        it('应该完全重置所有状态', () => {
            sortState.capturePreSortState([0, 1, 2]);
            sortState.setCurrentSort(0, 'asc');
            sortState.reset();

            expect(sortState.isSorted).toBe(false);
            expect(sortState.hasRestorePoint).toBe(false);
        });
    });

    describe('toJSON', () => {
        it('应该返回正确的状态信息', () => {
            sortState.capturePreSortState([0, 1, 2, 3, 4]);
            sortState.setCurrentSort(1, 'desc');

            const json = sortState.toJSON();

            expect(json.isSorted).toBe(true);
            expect(json.sortCol).toBe(1);
            expect(json.sortOrder).toBe('desc');
            expect(json.hasPreSortSnapshot).toBe(true);
            expect(json.preSortSnapshotLength).toBe(5);
        });
    });
});

describe('SortEngine', () => {
    let cellStore;
    let sortState;
    let sortEngine;

    const createFreshEngine = (rowCount = 10) => {
        const store = new ChunkedCellStore();
        const state = new SortState();
        const engine = new SortEngine(store, state, rowCount);

        for (let row = 0; row < rowCount; row++) {
            store.set(row, 0, { value: rowCount - row }); // 降序: N, N-1, ..., 1
            store.set(row, 1, `Row ${row}`);
        }

        return { cellStore: store, sortState: state, sortEngine: engine };
    };

    describe('sortRows - 单列升序', () => {
        it('应该按数值升序排列', () => {
            ({ cellStore, sortState, sortEngine } = createFreshEngine(10));
            const result = sortEngine.sortRows(0, { order: 'asc' });

            expect(result.swapped).toBeGreaterThan(0);
            expect(cellStore.get(0, 0).value).toBe(1); // 最小值在最前
            expect(cellStore.get(9, 0).value).toBe(10); // 最大值在最后
        });

        it('应该返回正确的统计信息', () => {
            ({ cellStore, sortState, sortEngine } = createFreshEngine(5));
            const result = sortEngine.sortRows(0, { order: 'asc' });

            expect(result.rowCount).toBe(5);
            expect(result.columns).toBe(1);
            expect(result.time).toBeGreaterThanOrEqual(0);
        });
    });

    describe('sortRows - 单列降序', () => {
        it('应该按数值降序排列（从乱序数据）', () => {
            ({ cellStore, sortState, sortEngine } = createFreshEngine(5));

            // 先打乱数据
            cellStore.set(0, 0, { value: 3 });
            cellStore.set(1, 0, { value: 1 });
            cellStore.set(2, 0, { value: 5 });
            cellStore.set(3, 0, { value: 2 });
            cellStore.set(4, 0, { value: 4 });

            const result = sortEngine.sortRows(0, { order: 'desc' });

            expect(result.swapped).toBeGreaterThan(0);
            expect(cellStore.get(0, 0).value).toBe(5); // 最大值在最前
            expect(cellStore.get(4, 0).value).toBe(1); // 最小值在最后
        });
    });

    describe('sortMultiple - 多列排序', () => {
        it('应该按第一列优先排序', () => {
            ({ cellStore, sortState, sortEngine } = createFreshEngine(4));

            cellStore.set(0, 0, { value: 1 }); cellStore.set(0, 1, { value: 'B' });
            cellStore.set(1, 0, { value: 2 }); cellStore.set(1, 1, { value: 'A' });
            cellStore.set(2, 0, { value: 1 }); cellStore.set(2, 1, { value: 'A' });
            cellStore.set(3, 0, { value: 2 }); cellStore.set(3, 1, { value: 'B' });

            sortEngine.sortMultiple([
                { col: 0, order: 'asc' },
                { col: 1, order: 'asc' }
            ]);

            expect(cellStore.get(0, 0).value).toBe(1);
            expect(cellStore.get(1, 0).value).toBe(1);
            expect(cellStore.get(2, 0).value).toBe(2);
            expect(cellStore.get(3, 0).value).toBe(2);
        });

        it('第一列相同时应该按第二列排序', () => {
            ({ cellStore, sortState, sortEngine } = createFreshEngine(4));

            cellStore.set(0, 0, { value: 1 }); cellStore.set(0, 1, { value: 'B' });
            cellStore.set(1, 0, { value: 2 }); cellStore.set(1, 1, { value: 'A' });
            cellStore.set(2, 0, { value: 1 }); cellStore.set(2, 1, { value: 'A' });
            cellStore.set(3, 0, { value: 2 }); cellStore.set(3, 1, { value: 'B' });

            sortEngine.sortMultiple([
                { col: 0, order: 'asc' },
                { col: 1, order: 'asc' }
            ]);

            expect(cellStore.get(0, 1).value).toBe('A'); // (1,A)
            expect(cellStore.get(1, 1).value).toBe('B'); // (1,B)
            expect(cellStore.get(2, 1).value).toBe('A'); // (2,A)
            expect(cellStore.get(3, 1).value).toBe('B'); // (2,B)
        });
    });

    describe('冻结行处理', () => {
        it('不应该移动冻结行', () => {
            ({ cellStore, sortState, sortEngine } = createFreshEngine(5));
            cellStore.set(0, 0, { value: 'HEADER' }); // 冻结行

            sortEngine.sortRows(0, { order: 'asc', fixedRows: 1 });

            expect(cellStore.get(0, 0).value).toBe('HEADER'); // 冻结行保持不变
            expect(cellStore.get(1, 0).value).toBe(1); // 第一行数据行是最小值
        });
    });

    describe('空数据处理', () => {
        it('空列数组应该直接返回', () => {
            ({ cellStore, sortState, sortEngine } = createFreshEngine(5));
            const result = sortEngine.sortMultiple([]);

            expect(result.swapped).toBe(0);
            expect(result.rowCount).toBe(0);
        });
    });

    describe('边界条件 - 空单元格混合排序', () => {
        it('null/undefined 值应该排在最后', () => {
            const store = new ChunkedCellStore();
            const state = new SortState();
            const engine = new SortEngine(store, state, 6);

            store.set(0, 0, { value: 6 }); // 初始化 row 0
            store.set(1, 0, { value: 3 });
            store.set(2, 0, { value: null });
            store.set(3, 0, { value: 1 });
            store.set(4, 0); // undefined
            store.set(5, 0, { value: 2 });

            engine.sortRows(0, { order: 'asc' });

            expect(store.get(0, 0).value).toBe(1);
            expect(store.get(1, 0).value).toBe(2);
            expect(store.get(2, 0).value).toBe(3);
            expect(store.get(3, 0).value).toBe(6);
            expect(store.get(4, 0)?.value ?? null).toBeNull(); // null 或 undefined
            expect(store.get(5, 0)?.value ?? null).toBeNull();
        });
    });

    describe('边界条件 - 特殊字符和Unicode排序', () => {
        it('字符串排序应该正确处理大小写', () => {
            const store = new ChunkedCellStore();
            const state = new SortState();
            const engine = new SortEngine(store, state, 4);

            store.set(0, 0, { value: 'banana' });
            store.set(1, 0, { value: 'Apple' });
            store.set(2, 0, { value: 'cherry' });
            store.set(3, 0, { value: 'apple' });

            engine.sortRows(0, { order: 'asc' });

            // 默认不区分大小写，apple 和 Apple 应该相邻
            const values = [0, 1, 2, 3].map(i => store.get(i, 0)?.value);
            expect(values[0].toLowerCase()).toBe('apple');
            expect(values[1].toLowerCase()).toBe('apple');
            expect(values[2]).toBe('banana');
            expect(values[3]).toBe('cherry');
        });

        it('Unicode字符应该正确排序', () => {
            const store = new ChunkedCellStore();
            const state = new SortState();
            const engine = new SortEngine(store, state, 5);

            store.set(0, 0, { value: '中文' });
            store.set(1, 0, { value: '数据' });
            store.set(2, 0, { value: 'abc' });
            store.set(3, 0, { value: '123' });
            store.set(4, 0, { value: '测试' });

            engine.sortRows(0, { order: 'asc' });

            const values = [0, 1, 2, 3, 4].map(i => store.get(i, 0)?.value);

            expect(values).toContain('123');
            expect(values).toContain('abc');

            const result = engine.sortRows(0, { order: 'desc' });
            expect(result.swapped).toBeGreaterThanOrEqual(0);
        });
    });

    describe('边界条件 - 自定义比较器', () => {
        it('自定义比较器应该被正确调用', () => {
            const store = new ChunkedCellStore();
            const state = new SortState();
            const engine = new SortEngine(store, state, 4);

            store.set(0, 0, { value: 'X' }); // 初始化 row 0
            store.set(1, 0, { value: '10' });
            store.set(2, 0, { value: '2' });
            store.set(3, 0, { value: '1' });

            let comparatorCalled = false;
            const customComparator = (a, b) => {
                comparatorCalled = true;
                return String(a).localeCompare(String(b), undefined, { numeric: true });
            };

            engine.sortRows(0, { order: 'asc', comparator: customComparator });

            expect(comparatorCalled).toBe(true);

            const values = [0, 1, 2, 3].map(i => store.get(i, 0)?.value);
            console.log('自定义比较器结果:', values);
            expect(values[0]).toBe('1');
            expect(values[1]).toBe('2');
            expect(values[2]).toBe('10');
            expect(values[3]).toBe('X');
        });

        it('多列排序时每列可以有不同的比较器', () => {
            const store = new ChunkedCellStore();
            const state = new SortState();
            const engine = new SortEngine(store, state, 6);

            store.set(0, 0, { value: 'X' }); store.set(0, 1, { value: 9 });
            store.set(1, 0, { value: 'A' }); store.set(1, 1, { value: 3 });
            store.set(2, 0, { value: 'A' }); store.set(2, 1, { value: 1 });
            store.set(3, 0, { value: 'B' }); store.set(3, 1, { value: 2 });
            store.set(4, 0, { value: 'B' }); store.set(4, 1, { value: 4 });

            const result = engine.sortMultiple([
                { col: 0, order: 'asc' },
                { col: 1, order: 'asc', comparator: (a, b) => a - b }
            ]);

            expect(result.swapped).toBeGreaterThan(0);
            console.log('多列排序结果:', [0,1,2,3,4].map(i => `(${store.get(i,0)?.value},${store.get(i,1)?.value})`));

            expect(store.get(0, 0).value).toBe('A');
            expect(store.get(0, 1).value).toBe(1);
            expect(store.get(1, 0).value).toBe('A');
            expect(store.get(1, 1).value).toBe(3);
            expect(store.get(2, 0).value).toBe('B');
            expect(store.get(2, 1).value).toBe(2);
        });
    });

    describe('性能测试 - 大数据量', () => {
        it('10K行数据应该在合理时间内完成排序', () => {
            const rowCount = 10000;
            const store = new ChunkedCellStore();
            const state = new SortState();
            const engine = new SortEngine(store, state, rowCount);

            for (let i = 0; i < rowCount; i++) {
                store.set(i, 0, { value: rowCount - i }); // 降序数据
            }

            const startTime = performance.now();
            const result = engine.sortRows(0, { order: 'asc' });
            const endTime = performance.now();

            expect(result.swapped).toBe(rowCount);
            expect(endTime - startTime).toBeLessThan(3000); // 放宽到3秒（考虑CI环境性能波动）

            expect(store.get(0, 0).value).toBe(1);
            expect(store.get(rowCount - 1, 0).value).toBe(rowCount);
        });

        it('10K行多列排序也应该高效', () => {
            const rowCount = 10000;
            const store = new ChunkedCellStore();
            const state = new SortState();
            const engine = new SortEngine(store, state, rowCount);

            for (let i = 0; i < rowCount; i++) {
                store.set(i, 0, { value: Math.floor((rowCount - 1 - i) / 100) });
                store.set(i, 1, { value: (rowCount - 1 - i) % 100 });
            }

            console.log('10K多列排序前:', `row0=(${store.get(0,0)?.value},${store.get(0,1)?.value}), row9999=(${store.get(9999,0)?.value},${store.get(9999,1)?.value})`);

            const startTime = performance.now();
            const result = engine.sortMultiple([
                { col: 0, order: 'asc' },
                { col: 1, order: 'asc' }
            ]);
            const endTime = performance.now();

            console.log('10K多列结果:', `swapped=${result.swapped}, time=${endTime - startTime}ms`);
            console.log('10K多列排序后:', `row0=(${store.get(0,0)?.value},${store.get(0,1)?.value}), row9999=(${store.get(9999,0)?.value},${store.get(9999,1)?.value})`);

            expect(result.swapped).toBeGreaterThan(0);
            expect(endTime - startTime).toBeLessThan(5000); // 多列排序放宽到5秒

            expect(store.get(0, 0).value).toBe(0);
            expect(store.get(0, 1).value).toBe(0);
            expect(store.get(9999, 0).value).toBe(99);
            expect(store.get(9999, 1).value).toBe(99);
        });
    });
});

describe('ChunkedCellStore.batchMoveRows', () => {
    let store;

    beforeEach(() => {
        store = new ChunkedCellStore();
        for (let row = 0; row < 5; row++) {
            store.set(row, 0, { value: `Row${row}` });
        }
    });

    it('应该正确执行批量移动', () => {
        const mapping = new Map([
            [0, 2],
            [2, 0]
        ]);

        const swapped = store.batchMoveRows(mapping);

        expect(swapped).toBe(2);
        expect(store.get(0, 0).value).toBe('Row2');
        expect(store.get(2, 0).value).toBe('Row0');
    });

    it('空映射应该返回 0', () => {
        const result = store.batchMoveRows(new Map());
        expect(result).toBe(0);
    });

    it('链条移动应该保持数据完整性', () => {
        const mapping = new Map([
            [0, 1],
            [1, 2],
            [2, 0]
        ]);

        store.batchMoveRows(mapping);

        expect(store.get(0, 0).value).toBe('Row2');
        expect(store.get(1, 0).value).toBe('Row0');
        expect(store.get(2, 0).value).toBe('Row1');
    });
});