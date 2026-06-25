import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SortPlugin } from '../../src/plugins/SortPlugin.js';
import { SortState } from '../../src/plugins/sort/SortState.js';
import { ChunkedCellStore } from '../../src/model/store/ChunkedCellStore.js';

describe('集成测试 - SortPlugin 端到端流程', () => {
    /**
     * 创建模拟的 Workbook 环境
     */
    function createMockWorkbook() {
        const cellStore = new ChunkedCellStore();
        const rowCount = 100;

        for (let row = 0; row < rowCount; row++) {
            cellStore.set(row, 0, { value: rowCount - row });
            cellStore.set(row, 1, { value: `Item ${rowCount - row}` });
            cellStore.set(row, 2, { value: (rowCount - row) * 10 });
        }

        return {
            cellStore,
            rowCount,
            fixedRowsTop: 1,
            selection: {
                clear: vi.fn()
            }
        };
    }

    /**
     * 创建模拟的 Sheet 对象
     */
    function createMockSheet() {
        const mockData = createMockWorkbook();

        return {
            cellStore: mockData.cellStore,
            rowCount: mockData.rowCount,
            fixedRowsTop: mockData.fixedRowsTop,
            selection: mockData.selection
        };
    }

    /**
     * 创建最小化的 Plugin 实例（用于单元测试）
     */
    function createTestPlugin() {
        const sheet = createMockSheet();

        const mockWorkbook = { sheet };
        const plugin = new SortPlugin(mockWorkbook);

        Object.defineProperty(plugin, 'sheet', {
            get: () => sheet,
            configurable: true
        });
        Object.defineProperty(plugin, 'renderEngine', {
            value: {
                invalidateAll: vi.fn(),
                canvas: document.createElement('canvas')
            },
            writable: true,
            configurable: true
        });
        Object.defineProperty(plugin, 'eventHandler', {
            value: {
                viewport: {
                    scrollToCell: vi.fn(),
                    hitTest: vi.fn()
                }
            },
            writable: true,
            configurable: true
        });
        Object.defineProperty(plugin, 'hooks', {
            value: {
                runHooks: vi.fn(),
                addHook: vi.fn()
            },
            writable: true,
            configurable: true
        });
        Object.defineProperty(plugin, 'render', {
            value: vi.fn(),
            writable: true,
            configurable: true
        });

        return { plugin, sheet };
    }

    describe('插件初始化和生命周期', () => {
        it('应该正确初始化所有子模块', () => {
            const { plugin } = createTestPlugin();

            expect(plugin.sortState).toBeInstanceOf(SortState);
            expect(plugin.sortEngine).toBeNull(); // 延迟初始化
            expect(plugin.sortUIManager).toBeDefined();
            expect(plugin.sortStrategy).toBeDefined();
        });

        it('init() 应该创建排序引擎并注册钩子', () => {
            const { plugin } = createTestPlugin();

            plugin.init();

            expect(plugin.sortEngine).toBeDefined();
            expect(plugin.hooks.addHook).toHaveBeenCalled();
        });

        it('destroy() 应该清理所有资源', () => {
            const { plugin } = createTestPlugin();

            plugin.init();
            plugin.destroy();

            expect(plugin.sortEngine).toBeNull();
        });
    });

    describe('API 调用 - sortRows', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('单列升序排序应该正确执行', () => {
            const { plugin, sheet } = createTestPlugin();
            plugin.init();

            console.log('\n=== 单列升序排序测试 ===');
            console.log('排序前 Row 0 (header):', sheet.cellStore.get(0, 0)?.value);
            console.log('排序前 Row 1:', sheet.cellStore.get(1, 0)?.value);

            const result = plugin.sortRows(0, { order: 'asc' });

            console.log('结果:', result);
            console.log('排序后 Row 0 (header):', sheet.cellStore.get(0, 0)?.value); // 不变
            console.log('排序后 Row 1:', sheet.cellStore.get(1, 0)?.value);
            console.log('排序后 Row 99:', sheet.cellStore.get(99, 0)?.value);

            expect(result.swapped).toBeGreaterThan(0);
            expect(sheet.cellStore.get(0, 0).value).toBe(100); // header 保持不变
            expect(sheet.cellStore.get(1, 0).value).toBe(1);
            expect(sheet.cellStore.get(99, 0).value).toBe(99);
        });

        it('单列降序排序应该正确执行', () => {
            const { plugin, sheet } = createTestPlugin();
            plugin.init();

            const result = plugin.sortRows(0, { order: 'desc' });

            console.log('\n降序排序结果:', result);
            console.log('Row 1:', sheet.cellStore.get(1, 0)?.value, 'Row 99:', sheet.cellStore.get(99, 0)?.value);

            expect(result.swapped).toBeGreaterThan(0);
            expect(sheet.cellStore.get(1, 0).value).toBe(99);
            expect(sheet.cellStore.get(99, 0).value).toBe(1);
        });

        it('排序后应该触发 AFTER_SORT 钩子', () => {
            const { plugin } = createTestPlugin();
            plugin.init();

            plugin.sortRows(0, { order: 'asc' });

            expect(plugin.hooks.runHooks).toHaveBeenCalledWith(
                expect.anything(), // HOOKS.AFTER_SORT
                0,                 // colIndex
                { order: 'asc' },  // options
                expect.objectContaining({ swapped: expect.any(Number) }) // result
            );
        });

        it('排序后应该清空选区并重新渲染', () => {
            const { plugin, sheet } = createTestPlugin();
            plugin.init();

            plugin.sortRows(0, { order: 'asc' });

            expect(sheet.selection.clear).toHaveBeenCalled();
            expect(plugin.renderEngine.invalidateAll).toHaveBeenCalled();
            expect(plugin.render).toHaveBeenCalled();
        });
    });

    describe('API 调用 - sortMultiple', () => {
        it('多列排序应该按优先级正确执行', () => {
            const { plugin, sheet } = createTestPlugin();
            plugin.init();

            console.log('\n=== 多列排序测试 ===');
            console.log('排序前:');
            console.log('  Row 0:', sheet.cellStore.get(0, 0)?.value, sheet.cellStore.get(0, 2)?.value);
            console.log('  Row 1:', sheet.cellStore.get(1, 0)?.value, sheet.cellStore.get(1, 2)?.value);

            const result = plugin.sortMultiple([
                { col: 2, order: 'asc' },
                { col: 0, order: 'asc' }
            ]);

            console.log('排序后:');
            console.log('  Row 0 (header):', sheet.cellStore.get(0, 0)?.value, sheet.cellStore.get(0, 2)?.value);
            console.log('  Row 1:', sheet.cellStore.get(1, 0)?.value, sheet.cellStore.get(1, 2)?.value);
            console.log('  Row 99:', sheet.cellStore.get(99, 0)?.value, sheet.cellStore.get(99, 2)?.value);

            expect(result.swapped).toBeGreaterThan(0);
            expect(sheet.cellStore.get(0, 2).value).toBe(1000); // header 不变
            expect(sheet.cellStore.get(1, 2).value).toBe(10); // 最小值
            expect(sheet.cellStore.get(99, 2).value).toBe(990); // 最大值
        });
    });

    describe('状态管理 - getSortState', () => {
        it('未排序时应该返回初始状态', () => {
            const { plugin } = createTestPlugin();
            plugin.init();

            const state = plugin.getSortState();

            expect(state.isSorted).toBe(false);
            expect(state.col).toBe(-1);
            expect(state.order).toBeNull();
        });

        it('排序后应该更新状态', () => {
            const { plugin } = createTestPlugin();
            plugin.init();

            plugin.sortRows(2, { order: 'desc' });

            const state = plugin.getSortState();

            expect(state.isSorted).toBe(true);
            expect(state.col).toBe(2);
            expect(state.order).toBe('desc');
        });
    });

    describe('恢复功能 - restoreOriginalOrder', () => {
        it('排序后应该可以恢复原始顺序', () => {
            const { plugin, sheet } = createTestPlugin();
            plugin.init();

            console.log('\n=== 恢复功能测试 ===');

            const originalValue = sheet.cellStore.get(0, 0).value;
            console.log('原始 Row 0 值:', originalValue);

            plugin.sortRows(0, { order: 'asc' });

            const sortedValue = sheet.cellStore.get(0, 0).value;
            console.log('排序后 Row 0 值:', sortedValue);

            expect(sortedValue).not.toBe(originalValue);

            const canRestore = plugin.canRestore();
            console.log('可以恢复?', canRestore);
            expect(canRestore).toBe(true);

            const restored = plugin.restoreOriginalOrder();
            console.log('恢复成功?', restored);

            expect(restored).toBe(true);
            expect(sheet.cellStore.get(0, 0).value).toBe(originalValue);
        });

        it('未排序时不应该恢复', () => {
            const { plugin } = createTestPlugin();
            plugin.init();

            expect(plugin.canRestore()).toBe(false);
            expect(plugin.restoreOriginalOrder()).toBe(false);
        });
    });

    describe('清除功能 - clearSort', () => {
        it('清除排序应该重置 UI 状态', () => {
            const { plugin } = createTestPlugin();
            plugin.init();

            plugin.sortRows(0, { order: 'asc' });
            expect(plugin.getSortState().isSorted).toBe(true);

            plugin.clearSort();

            expect(plugin.getSortState().isSorted).toBe(false);
            expect(plugin.render).toHaveBeenCalled();
        });
    });

    describe('冻结行交互', () => {
        it('排序时不应该移动冻结行', () => {
            const { plugin, sheet } = createTestPlugin();
            plugin.init();

            const headerValue = sheet.cellStore.get(0, 0).value;
            console.log('\n冻结行测试 - 排序前 header:', headerValue);

            plugin.sortRows(0, { order: 'asc', fixedRows: 1 });

            const afterHeaderValue = sheet.cellStore.get(0, 0).value;
            console.log('冻结行测试 - 排序后 header:', afterHeaderValue);

            expect(afterHeaderValue).toBe(headerValue);
        });

        it('有冻结行时应该滚动到冻结位置', () => {
            const { plugin } = createTestPlugin();
            plugin.init();

            plugin.sortRows(0, { order: 'asc', fixedRows: 1 });

            expect(plugin.eventHandler.viewport.scrollToCell).toHaveBeenCalledWith(1, 0);
        });
    });

    describe('错误处理', () => {
        it('引擎未初始化时应该返回空结果', () => {
            const { plugin } = createTestPlugin();

            const result = plugin.sortRows(0, { order: 'asc' });

            expect(result.swapped).toBe(0);
            expect(result.time).toBe(0);
        });

        it('无效参数应该优雅处理', () => {
            const { plugin } = createTestPlugin();
            plugin.init();

            const result = plugin.sortRows(-1, { order: 'invalid' });

            expect(result).toBeDefined();
        });
    });
});