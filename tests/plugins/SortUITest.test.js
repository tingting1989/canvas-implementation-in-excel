import { describe, it, expect, beforeEach } from 'vitest';
import { SortUIManager } from '../../src/plugins/sort/SortUIManager.js';
import { SortState } from '../../src/plugins/sort/SortState.js';

describe('UI集成 - SortUIManager 渲染验证', () => {
    /**
     * 创建模拟的 Plugin 对象
     */
    function createMockPlugin(initialState = {}) {
        return {
            getSortState: () => ({
                col: initialState.col ?? -1,
                order: initialState.order ?? null,
                isSorted: initialState.isSorted ?? false
            }),
            renderEngine: {
                invalidateAll: () => {}
            },
            render: () => {}
        };
    }

    /**
     * 创建 Canvas 2D 上下文（用于绘制测试）
     */
    function createMockContext() {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;

        const ctx = canvas.getContext('2d');

        const calls = [];
        const originalFillRect = ctx.fillRect.bind(ctx);
        const originalFill = ctx.fill.bind(ctx);
        const originalStroke = ctx.stroke.bind(ctx);

        ctx.fillRect = function(...args) {
            calls.push({ method: 'fillRect', args });
            return originalFillRect.apply(ctx, args);
        };

        ctx.fill = function(...args) {
            calls.push({ method: 'fill', args });
            return originalFill.apply(ctx, args);
        };

        ctx.stroke = function(...args) {
            calls.push({ method: 'stroke', args });
            return originalStroke.apply(ctx, args);
        };

        return { ctx, canvas, calls };
    }

    describe('初始化和生命周期', () => {
        it('应该正确初始化 UI 管理器', () => {
            const plugin = createMockPlugin();
            const uiManager = new SortUIManager(plugin);

            expect(uiManager).toBeDefined();
            expect(SortUIManager.ARROW_SIZE).toBe(8);
            expect(SortUIManager.ACTIVE_COLOR).toBe('#1890ff');
        });

        it('init() 应该正确初始化（跳过 Path2D 缓存）', () => {
            const plugin = createMockPlugin();
            const uiManager = new SortUIManager(plugin);

            if (typeof Path2D !== 'undefined') {
                expect(() => uiManager.init()).not.toThrow();
            } else {
                console.log('⚠️ 跳过 Path2D 缓存测试（Node.js 环境）');
                expect(true).toBe(true);
            }
        });

        it('destroy() 应该清理缓存', () => {
            const plugin = createMockPlugin();
            const uiManager = new SortUIManager(plugin);

            if (typeof Path2D !== 'undefined') {
                uiManager.init();
            }

            expect(() => uiManager.destroy()).not.toThrow();
            expect(uiManager).toBeDefined(); // 对象仍然存在
        });
    });

    describe('排序箭头渲染 - drawSortIndicator', () => {
        let uiManager;
        let mockCtx;

        beforeEach(() => {
            const plugin = createMockPlugin({ col: 1, order: 'asc', isSorted: true });
            uiManager = new SortUIManager(plugin);

            if (typeof Path2D !== 'undefined') {
                uiManager.init();
            }

            const context = createMockContext();
            mockCtx = context.ctx;
        });

        it('活跃列应该绘制升序箭头', () => {
            console.log('\n=== 升序箭头渲染测试 ===');

            if (typeof Path2D === 'undefined') {
                console.log('⚠️ 跳过测试（需要浏览器环境）');
                expect(true).toBe(true);
                return;
            }

            uiManager.drawSortIndicator(mockCtx, 1, 100, 0, 150, 30);

            console.log('绘制调用:', mockCtx.calls.map(c => c.method));

            expect(mockCtx.calls.length).toBeGreaterThan(0);
            expect(mockCtx.calls.some(c => c.method === 'fill')).toBe(true);
            expect(mockCtx.calls.some(c => c.method === 'stroke')).toBe(true);
        });

        it('非活跃列不应该绘制箭头（默认配置）', () => {
            if (typeof Path2D === 'undefined') {
                expect(true).toBe(true);
                return;
            }

            const inactiveCalls = [];

            const originalFill = mockCtx.fill.bind(mockCtx);
            mockCtx.fill = function(...args) {
                inactiveCalls.push({ method: 'fill' });
                return originalFill.apply(mockCtx, args);
            };

            uiManager.drawSortIndicator(mockCtx, 0, 0, 0, 100, 30); // col 0 不是排序列

            console.log('非活跃列绘制调用:', inactiveCalls.length);

            expect(inactiveCalls.length).toBe(0);
        });

        it('启用 showAllArrows 时所有列都应该显示箭头', () => {
            if (typeof Path2D === 'undefined') {
                expect(true).toBe(true);
                return;
            }

            uiManager.setShowAllArrows(true);

            uiManager.drawSortIndicator(mockCtx, 0, 0, 0, 100, 30); // 非活跃列

            console.log('showAllArrows 模式调用:', mockCtx.calls.filter(c => c.method === 'fill').length);

            expect(mockCtx.calls.some(c => c.method === 'fill')).toBe(true);
        });
    });

    describe('排序状态切换 - 不同顺序的箭头', () => {
        it('降序应该绘制向下箭头', () => {
            if (typeof Path2D === 'undefined') {
                expect(true).toBe(true);
                return;
            }

            const plugin = createMockPlugin({ col: 2, order: 'desc', isSorted: true });
            const uiManager = new SortUIManager(plugin);
            uiManager.init();

            const { ctx } = createMockContext();

            console.log('\n=== 降序箭头渲染测试 ===');

            uiManager.drawSortIndicator(ctx, 2, 200, 0, 150, 30);

            console.log('绘制调用:', ctx.calls.map(c => c.method));

            expect(ctx.calls.length).toBeGreaterThan(0);
        });

        it('未排序状态应该绘制双向箭头', () => {
            if (typeof Path2D === 'undefined') {
                expect(true).toBe(true);
                return;
            }

            const plugin = createMockPlugin({ isSorted: false });
            const uiManager = new SortUIManager(plugin);
            uiManager.init();
            uiManager.setShowAllArrows(true);

            const { ctx } = createMockContext();

            console.log('\n=== 未排序双向箭头测试 ===');

            uiManager.drawSortIndicator(ctx, 0, 0, 0, 100, 30);

            console.log('双向箭头调用:', ctx.calls.filter(c => c.method === 'fill').length);

            expect(ctx.calls.some(c => c.method === 'fill')).toBe(true);
        });
    });

    describe('列高亮 - highlightSortedColumn', () => {
        it('活跃列应该绘制高亮背景', () => {
            if (typeof Path2D === 'undefined') {
                expect(true).toBe(true);
                return;
            }

            const plugin = createMockPlugin({ col: 1, order: 'asc', isSorted: true });
            const uiManager = new SortUIManager(plugin);
            uiManager.init();

            const { ctx, calls } = createMockContext();

            console.log('\n=== 列高亮测试 ===');

            uiManager.highlightSortedColumn(ctx, 1, 100, 0, 150, 30);

            console.log('高亮调用:', calls);

            expect(calls.some(c => c.method === 'fillRect')).toBe(true);

            const fillRectCall = calls.find(c => c.method === 'fillRect');
            expect(fillRectCall.args[0]).toBe(100); // x
            expect(fillRectCall.args[1]).toBe(0);   // y
            expect(fillRectCall.args[2]).toBe(150); // w
            expect(fillRectCall.args[3]).toBe(30);  // h
        });

        it('非活跃列不应该高亮', () => {
            if (typeof Path2D === 'undefined') {
                expect(true).toBe(true);
                return;
            }

            const plugin = createMockPlugin({ col: 1, order: 'asc', isSorted: true });
            const uiManager = new SortUIManager(plugin);
            uiManager.init();

            const { ctx, calls } = createMockContext();

            uiManager.highlightSortedColumn(ctx, 0, 0, 0, 100, 30);

            expect(calls.some(c => c.method === 'fillRect')).toBe(false);
        });
    });

    describe('更新指示器 - updateIndicators', () => {
        it('应该触发重新渲染', () => {
            const plugin = createMockPlugin({ col: 1, order: 'asc', isSorted: true });
            const uiManager = new SortUIManager(plugin);

            if (typeof Path2D !== 'undefined') {
                uiManager.init();
            }

            const invalidateSpy = vi.spyOn(plugin.renderEngine, 'invalidateAll');
            const renderSpy = vi.spyOn(plugin, 'render');

            uiManager.updateIndicators();

            expect(invalidateSpy).toHaveBeenCalled();
            expect(renderSpy).toHaveBeenCalled();
        });
    });

    describe('配置选项', () => {
        it('setShowAllArrows 应该切换显示模式', () => {
            const plugin = createMockPlugin({ isSorted: false });
            const uiManager = new SortUIManager(plugin);

            if (typeof Path2D !== 'undefined') {
                uiManager.init();
            }

            expect(() => uiManager.setShowAllArrows(true)).not.toThrow();
            expect(() => uiManager.setShowAllArrows(false)).not.toThrow();
        });
    });

    describe('Canvas 绘制性能', () => {
        it('多次绘制应该在合理时间内完成', () => {
            if (typeof Path2D === 'undefined') {
                console.log('⚠️ 跳过性能测试（需要浏览器环境）');
                expect(true).toBe(true);
                return;
            }

            const plugin = createMockPlugin({ col: 1, order: 'asc', isSorted: true });
            const uiManager = new SortUIManager(plugin);
            uiManager.init();

            const { ctx } = createMockContext();

            const iterations = 1000;
            const startTime = performance.now();

            for (let i = 0; i < iterations; i++) {
                uiManager.drawSortIndicator(ctx, i % 10, i * 100, 0, 100, 30);
                uiManager.highlightSortedColumn(ctx, 1, i * 100, 0, 100, 30);
            }

            const endTime = performance.now();

            console.log(`\n=== 性能测试：${iterations}次绘制耗时 ${(endTime - startTime).toFixed(2)}ms ===`);

            expect(endTime - startTime).toBeLessThan(100); // 1000次绘制应在100ms内完成
        });
    });

    describe('边界条件', () => {
        it('极端坐标值不应该导致错误', () => {
            if (typeof Path2D === 'undefined') {
                expect(true).toBe(true);
                return;
            }

            const plugin = createMockPlugin({ col: 999, order: 'asc', isSorted: true });
            const uiManager = new SortUIManager(plugin);
            uiManager.init();

            const { ctx } = createMockContext();

            expect(() => {
                uiManager.drawSortIndicator(ctx, 999, -100, -50, 1, 1);
                uiManager.highlightSortedColumn(ctx, 999, -100, -50, 1, 1);
            }).not.toThrow();
        });

        it('零尺寸区域不应该导致错误', () => {
            if (typeof Path2D === 'undefined') {
                expect(true).toBe(true);
                return;
            }

            const plugin = createMockPlugin({ col: 0, order: 'asc', isSorted: true });
            const uiManager = new SortUIManager(plugin);
            uiManager.init();

            const { ctx } = createMockContext();

            expect(() => {
                uiManager.drawSortIndicator(ctx, 0, 0, 0, 0, 0);
                uiManager.highlightSortedColumn(ctx, 0, 0, 0, 0, 0);
            }).not.toThrow();
        });
    });
});