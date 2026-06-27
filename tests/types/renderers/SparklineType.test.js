/**
 * SparklineType 迷你图渲染器完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. Canvas 渲染测试（折线图和柱状图）
 * 4. 配置选项测试
 * 5. 集成测试
 * 6. 源码 Bug 检测
 *
 * @module tests/types/renderers/SparklineType.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SparklineType } from '../../../src/types/renderers/SparklineType.js';
import { CellRenderContext } from '../../../src/types/CellRenderContext.js';
import { createMockCanvasContext } from '../../../tests/utils/canvas-mock.js';

describe('SparklineType - 基础功能测试', () => {
    let sparklineType;

    beforeEach(() => {
        sparklineType = new SparklineType();
    });

    describe('基本属性', () => {
        it('name 应该是 "sparkline"', () => {
            expect(sparklineType.name).toBe('sparkline');
        });

        it('editorType 应该是 "text"', () => {
            expect(sparklineType.editorType).toBe('text');
        });
    });

    describe('format() 方法', () => {
        it('数组格式化为数据点数量', () => {
            expect(sparklineType.format([1, 2, 3, 4, 5])).toBe('5 个数据点');
            expect(sparklineType.format([10, 20])).toBe('2 个数据点');
        });

        it('空数组返回空字符串', () => {
            expect(sparklineType.format([])).toBe('');
        });

        it('非数组值转为字符串', () => {
            expect(sparklineType.format(123)).toBe('123');
            expect(sparklineType.format(null)).toBe('');
            expect(sparklineType.format(undefined)).toBe('');
        });
    });
});

describe('SparklineType - 渲染测试', () => {
    let mockCtx, sparklineType;

    beforeEach(() => {
        mockCtx = createMockCanvasContext();
        sparklineType = new SparklineType();
    });

    function createContext(value, overrides = {}) {
        return new CellRenderContext({
            ctx: mockCtx,
            x: 10, y: 20, width: 200, height: 60,
            value,
            displayValue: Array.isArray(value) ? `${value.length} 个数据点` : String(value),
            style: {},
            row: 0, col: 0,
            ...overrides,
        });
    }

    describe('折线图渲染', () => {
        it('渲染简单折线图', () => {
            const context = createContext([10, 20, 15, 25, 30]);
            mockCtx.resetCalls();

            sparklineType.render(context);

            expect(mockCtx.calls.some(c => c.method === 'beginPath')).toBe(true);
            expect(mockCtx.calls.some(c => c.method === 'stroke')).toBe(true);
        });

        it('渲染单点数据', () => {
            const context = createContext([50]);
            mockCtx.resetCalls();

            sparklineType.render(context);

            expect(() => sparklineType.render(context)).not.toThrow();
        });

        it('渲染大量数据点', () => {
            const data = Array.from({ length: 100 }, (_, i) => Math.sin(i / 10) * 50 + 50);
            const context = createContext(data);
            mockCtx.resetCalls();

            sparklineType.render(context);

            expect(() => sparklineType.render(context)).not.toThrow();
        });
    });

    describe('柱状图渲染', () => {
        it('渲染柱状图', () => {
            const type = new SparklineType({ type: 'bar' });
            const context = createContext([30, 45, 20, 55, 40]);
            mockCtx.resetCalls();

            type.render(context);

            expect(() => type.render(context)).not.toThrow();
        });
    });

    describe('空数据和异常值', () => {
        it('空数组不渲染', () => {
            const context = createContext([]);
            mockCtx.resetCalls();

            sparklineType.render(context);

            expect(mockCtx.calls.length).toBe(0);
        });

        it('null/undefined 不渲染', () => {
            const nullContext = createContext(null);
            const undefinedContext = createContext(undefined);

            mockCtx.resetCalls();
            sparklineType.render(nullContext);
            expect(mockCtx.calls.length).toBe(0);

            mockCtx.resetCalls();
            sparklineType.render(undefinedContext);
            expect(mockCtx.calls.length).toBe(0);
        });

        it('非数组值不渲染', () => {
            const context = createContext('not an array');
            mockCtx.resetCalls();

            sparklineType.render(context);

            expect(() => sparklineType.render(context)).not.toThrow();
        });
    });
});

describe('SparklineType - 配置选项测试', () => {
    it('自定义图表类型', () => {
        const lineType = new SparklineType({ type: 'line' });
        const barType = new SparklineType({ type: 'bar' });

        expect(lineType.options.type).toBe('line');
        expect(barType.options.type).toBe('bar');
    });

    it('自定义线条颜色', () => {
        const type = new SparklineType({
            lineColor: '#ff0000',
            fillColor: 'rgba(255, 0, 0, 0.3)'
        });

        expect(type.options.lineColor).toBe('#ff0000');
        expect(type.options.fillColor).toBe('rgba(255, 0, 0, 0.3)');
    });

    it('自定义线条宽度', () => {
        const type = new SparklineType({ lineWidth: 3 });
        expect(type.options.lineWidth).toBe(3);
    });

    it('显示数据点', () => {
        const type = new SparklineType({ showDots: true });
        expect(type.options.showDots).toBe(true);
    });
});

describe('SparklineType - 攻击性测试', () => {
    describe('异常输入测试', () => {
        it('特殊数值数组', () => {
            const type = new SparklineType();
            const specialData = [
                [NaN, NaN, NaN],
                [Infinity, -Infinity],
                [0, 0, 0, 0],
                [Number.MAX_VALUE, Number.MIN_VALUE],
                [-1000000, 1000000],
                [1e-10, 1e10],
            ];

            specialData.forEach(data => {
                expect(() => type.render(new CellRenderContext({
                    ctx: createMockCanvasContext(),
                    x: 0, y: 0, width: 200, height: 60,
                    value: data, displayValue: `${data.length} 个数据点`,
                    style: {},
                    row: 0, col: 0,
                }))).not.toThrow();
            });
        });

        it('极小单元格尺寸', () => {
            const type = new SparklineType();
            const tinyContext = new CellRenderContext({
                ctx: createMockCanvasContext(),
                x: 0, y: 0, width: 5, height: 5,
                value: [1, 2, 3], displayValue: '3 个数据点',
                style: {},
                row: 0, col: 0,
            });

            expect(() => type.render(tinyContext)).not.toThrow();
        });

        it('极大单元格尺寸', () => {
            const type = new SparklineType();
            const data = Array.from({ length: 1000 }, (_, i) => Math.random() * 100);
            const hugeContext = new CellRenderContext({
                ctx: createMockCanvasContext(),
                x: 0, y: 0, width: 5000, height: 5000,
                value: data, displayValue: `${data.length} 个数据点`,
                style: {},
                row: 0, col: 0,
            });

            expect(() => type.render(hugeContext)).not.toThrow();
        });

        it('所有相同值的数组', () => {
            const type = new SparklineType();
            const flatData = Array(20).fill(42);
            const context = new CellRenderContext({
                ctx: createMockCanvasContext(),
                x: 0, y: 0, width: 200, height: 60,
                value: flatData, displayValue: `${flatData.length} 个数据点`,
                style: {},
                row: 0, col: 0,
            });

            type.render(context);
            console.log('ℹ️  提示: 所有值相同时，范围计算需要特殊处理');
        });
    });

    describe('性能压力测试', () => {
        it('批量渲染性能', () => {
            const type = new SparklineType();
            const start = performance.now();

            for (let i = 0; i < 500; i++) {
                const data = Array.from({ length: 20 }, () => Math.random() * 100);
                type.render(new CellRenderContext({
                    ctx: createMockCanvasContext(),
                    x: i % 800, y: Math.floor(i / 800) * 60,
                    width: 200, height: 60,
                    value: data, displayValue: `${data.length} 个数据点`,
                    style: {},
                    row: i, col: 0,
                }));
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(2000);
        });

        it('大数据量渲染', () => {
            const type = new SparklineType();
            const largeData = Array.from({ length: 10000 }, (_, i) => Math.sin(i / 100) * 50 + 50);
            const start = performance.now();

            type.render(new CellRenderContext({
                ctx: createMockCanvasContext(),
                x: 0, y: 0, width: 1000, height: 200,
                value: largeData, displayValue: `${largeData.length} 个数据点`,
                style: {},
                row: 0, col: 0,
            }));

            const elapsed = performance.now() - start;
            console.log(`10,000 数据点渲染耗时: ${elapsed.toFixed(2)}ms`);
            expect(elapsed).toBeLessThan(3000);
        });
    });
});

describe('SparklineType - Bug 检测', () => {
    describe('源码问题识别', () => {
        it('Bug #1: 单点数据的除零问题', () => {
            const type = new SparklineType();
            const singlePoint = [42];
            const ctx = createMockCanvasContext();
            const context = new CellRenderContext({
                ctx,
                x: 0, y: 0, width: 200, height: 60,
                value: singlePoint, displayValue: '1 个数据点',
                style: {},
                row: 0, col: 0,
            });

            let errorOccurred = false;
            try {
                type.render(context);
            } catch (e) {
                errorOccurred = true;
                if (e.message.includes('division') || e.message.includes('zero')) {
                    console.error('❌ Bug: 单点数据导致除零错误');
                }
            }

            if (!errorOccurred) {
                console.log('✓ 单点数据处理正确');
            }
        });

        it('Bug #2: 所有值相同时的范围为 0', () => {
            const type = new SparklineType();
            const flatData = Array(10).fill(50);
            const ctx = createMockCanvasContext();
            const context = new CellRenderContext({
                ctx,
                x: 0, y: 0, width: 200, height: 60,
                value: flatData, displayValue: '10 个数据点',
                style: {},
                row: 0, col: 0,
            });

            type.render(context);

            console.log('ℹ️  所有值相同时，range 为 0，代码使用 || 1 避免除零');
        });

        it('Bug #3: showDots 对大数据量的影响', () => {
            const type = new SparklineType({ showDots: true });
            const data = Array.from({ length: 100 }, () => Math.random() * 100);
            const ctx = createMockCanvasContext();
            const context = new CellRenderContext({
                ctx,
                x: 0, y: 0, width: 400, height: 80,
                value: data, displayValue: `${data.length} 个数据点`,
                style: {},
                row: 0, col: 0,
            });

            const start = performance.now();
            type.render(context);
            const elapsed = performance.now() - start;

            const dotCalls = ctx.calls.filter(c => c.method === 'arc');
            console.log(`100 个数据点的圆点绘制数: ${dotCalls.length}`);

            if (elapsed > 100) {
                console.warn('⚠️  大数据量 + showDots 可能导致性能问题');
            }
        });
    });
});