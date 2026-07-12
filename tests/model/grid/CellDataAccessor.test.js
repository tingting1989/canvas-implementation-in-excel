import { CellDataAccessor } from '../../../src/model/grid/CellDataAccessor.js';

describe('CellDataAccessor', () => {
    let accessor;
    let mockCellStore;
    let mockSheet;

    beforeEach(() => {
        // 创建符合 ChunkedCellStore 接口的 mock 对象
        mockCellStore = {
            _data: new Map([
                [`${0},${0}`, { value: 'A1', styleId: 1 }],
                [`${0},${1}`, { value: 'B1', styleId: 2 }],
                [`${1},${0}`, { value: 'A2', styleId: 1 }],
                [`${1},${1}`, { value: 'B2', styleId: 3 }],
                [`${2},${0}`, null],
                [`${2},${1}`, undefined],
            ]),
            get(row, col) {
                return this._data.get(`${row},${col}`);
            },
            set(row, col, value) {
                this._data.set(`${row},${col}`, value);
            },
        };

        mockSheet = {
            name: 'TestSheet',
            cellStore: mockCellStore,
        };

        accessor = new CellDataAccessor(mockSheet);
    });

    describe('get(row, col)', () => {
        it('should return cell for valid coordinates', () => {
            const cell = accessor.get(0, 0);
            expect(cell).toEqual({ value: 'A1', styleId: 1 });
        });

        it('should return undefined for non-existent cell', () => {
            const cell = accessor.get(5, 5);
            expect(cell).toBeUndefined();
        });

        it('should return null for explicitly stored null values', () => {
            const cell = accessor.get(2, 0);
            expect(cell).toBeNull();
        });
    });

    describe('setRange(topRow, topCol, cells)', () => {
        it('should batch set cell data in store', () => {
            const newData = [[{ value: 'NewValue', styleId: 5 }]];
            accessor.setRange(3, 3, newData);

            expect(mockCellStore.get(3, 3)).toEqual({ value: 'NewValue', styleId: 5 });
        });

        it('should overwrite existing cell data via setRange', () => {
            const updatedData = [[{ value: 'UpdatedA1', styleId: 10 }]];
            accessor.setRange(0, 0, updatedData);

            expect(mockCellStore.get(0, 0)).toEqual({ value: 'UpdatedA1', styleId: 10 });
        });
    });

    describe('getValueMatrix(topRow, topCol, bottomRow, bottomCol)', () => {
        it('should return 2D array of cell values', () => {
            const matrix = accessor.getValueMatrix(0, 0, 1, 1);

            expect(matrix).toEqual([
                ['A1', 'B1'],
                ['A2', 'B2']
            ]);
        });

        it('should handle single cell range', () => {
            const matrix = accessor.getValueMatrix(0, 0, 0, 0);

            expect(matrix).toEqual([['A1']]);
        });

        it('should return empty string for missing cells (2D array)', () => {
            const matrix = accessor.getValueMatrix(2, 0, 2, 1);

            expect(matrix).toEqual([['', '']]);
        });

        it('should handle empty range (returns empty array)', () => {
            const matrix = accessor.getValueMatrix(5, 5, 4, 4);

            expect(matrix).toEqual([]);
        });
    });

    describe('getNonEmptyCells(topRow, topCol, bottomRow, bottomCol)', () => {
        it('should return only non-empty cells with coordinates', () => {
            const cells = accessor.getNonEmptyCells(0, 0, 2, 1);

            expect(cells.length).toBe(4);
            expect(cells[0]).toEqual({ row: 0, col: 0, cell: { value: 'A1', styleId: 1 } });
        });

        it('should exclude null and undefined cells', () => {
            const cells = accessor.getNonEmptyCells(2, 0, 2, 1);

            expect(cells.length).toBe(0);
        });
    });

    describe('forEach(topRow, topCol, bottomRow, bottomCol, callback)', () => {
        it('should iterate over all cells in range', () => {
            const visited = [];
            accessor.forEach(0, 0, 1, 1, (r, c, cell) => {
                visited.push({ row: r, col: c, hasCell: !!cell });
            });

            expect(visited.length).toBe(4);
            expect(visited[0]).toEqual({ row: 0, col: 0, hasCell: true });
        });

        it('should pass correct coordinates to callback', () => {
            const coords = [];
            accessor.forEach(0, 0, 0, 1, (r, c) => {
                coords.push([r, c]);
            });

            expect(coords).toEqual([[0, 0], [0, 1]]);
        });
    });

    describe('[Symbol.iterator]()', () => {
        it('should support for...of iteration', () => {
            const results = [];
            for (const { row, col, cell } of accessor[Symbol.iterator](0, 0, 1, 1)) {
                if (cell) {
                    results.push({ row, col, value: cell.value });
                }
            }

            expect(results.length).toBe(4);
            expect(results[0].value).toBe('A1');
        });

        it('should allow early termination', () => {
            let count = 0;
            for (const { row, col, cell } of accessor[Symbol.iterator](0, 0, 1, 1)) {
                count++;
                if (row === 0 && col === 1) break;
            }

            expect(count).toBe(2);
        });
    });

    describe('Edge Cases', () => {
        it('should handle large ranges efficiently', () => {
            const start = performance.now();
            const matrix = accessor.getValueMatrix(0, 0, 100, 100);
            const duration = performance.now() - start;

            expect(matrix.length).toBe(101);
            expect(duration).toBeLessThan(100); // Should complete within 100ms
        });

        it('should handle inverted ranges (top > bottom)', () => {
            const matrix = accessor.getValueMatrix(1, 1, 0, 0);

            expect(matrix).toEqual([]);
        });
    });
});

describe('CellDataAccessor - Integration Scenarios', () => {
    function createMockCellStore(data) {
        const map = new Map();
        Object.entries(data).forEach(([key, value]) => {
            map.set(key, value);
        });

        return {
            _data: map,
            get(row, col) {
                return this._data.get(`${row},${col}`);
            },
            set(row, col, value) {
                this._data.set(`${row},${col}`, value);
            },
        };
    }

    it('should work correctly with FormulaEvaluator pattern', () => {
        const store = createMockCellStore({
            '0,0': { value: 10 },
            '0,1': { value: 20 },
            '1,0': { value: 30 },
            '1,1': { value: 40 },
        });

        const sheet = { cellStore: store };
        const acc = new CellDataAccessor(sheet);

        const matrix = acc.getValueMatrix(0, 0, 1, 1);

        expect(matrix).toEqual([
            [10, 20],
            [30, 40]
        ]);
    });

    it('should work correctly with AutoFillStrategy pattern', () => {
        const store = createMockCellStore({
            '0,0': { value: 1 },
            '0,1': { value: 2 },
            '0,2': { value: 3 },
        });

        const sheet = { cellStore: store };
        const acc = new CellDataAccessor(sheet);

        const srcValues = acc.getValueMatrix(0, 0, 0, 2);

        expect(srcValues).toEqual([[1, 2, 3]]);
    });

    it('should work correctly with ExportFilePlugin pattern', () => {
        const store = createMockCellStore({
            '0,0': { value: 'Header' },
            '0,1': { value: 'Value' },
            '1,0': { value: 'Data1' },
            '1,1': { value: '100' },
        });

        const sheet = { cellStore: store };
        const acc = new CellDataAccessor(sheet);

        const rows = [];
        const dataRows = acc.getValueMatrix(0, 0, 1, 1);
        rows.push(...dataRows);

        expect(rows).toEqual([
            ['Header', 'Value'],
            ['Data1', '100']
        ]);
    });
});