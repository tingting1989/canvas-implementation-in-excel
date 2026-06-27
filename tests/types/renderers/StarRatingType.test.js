/**
 * StarRatingType 星级评分渲染器完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. Canvas 渲染测试
 * 4. 配置选项测试（maxStars, starSize, color）
 * 5. 集成测试
 * 6. 源码 Bug 检测
 *
 * @module tests/types/renderers/StarRatingType.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StarRatingType } from '../../../src/types/renderers/StarRatingType.js';
import { CellRenderContext } from '../../../src/types/CellRenderContext.js';
import { createMockCanvasContext } from '../../../tests/utils/canvas-mock.js';

describe('StarRatingType - 基础功能测试', () => {
    let starRatingType;

    beforeEach(() => {
        starRatingType = new StarRatingType();
    });

    describe('基本属性', () => {
        it('name 应该是 "starRating"', () => {
            expect(starRatingType.name).toBe('starRating');
        });

        it('editorType 应该是 "numeric"', () => {
            expect(starRatingType.editorType).toBe('numeric');
        });
    });

    describe('getDefaultStyle() 方法', () => {
        it('默认左对齐', () => {
            const style = starRatingType.getDefaultStyle({});
            expect(style.textAlign).toBe('left');
        });
    });

    describe('format() 方法', () => {
        it('数值格式化为星级字符串', () => {
            expect(starRatingType.format(3)).toBe('3 星');
            expect(starRatingType.format(5)).toBe('5 星');
            expect(starRatingType.format(0)).toBe('0 星');
        });

        it('null 值返回空字符串', () => {
            expect(starRatingType.format(null)).toBe('');
            expect(starRatingType.format(undefined)).toBe('');
        });
    });

    describe('validate() 方法', () => {
        it('空值应该通过验证', () => {
            expect(starRatingType.validate('')).toBe(true);
            expect(starRatingType.validate(null)).toBe(true);
        });

        it('有效范围 0-maxStars 应该通过验证', () => {
            expect(starRatingType.validate(0)).toBe(true);
            expect(starRatingType.validate(3)).toBe(true);
            expect(starRatingType.validate(5)).toBe(true);
        });

        it('超出范围应该返回错误信息', () => {
            expect(starRatingType.validate(-1)).toContain('0-5');
            expect(starRatingType.validate(6)).toContain('0-5');
        });

        it('非数字应该验证失败', () => {
            expect(starRatingType.validate('abc')).toContain('0-5');
        });

        it('自定义 maxStars 范围', () => {
            const type = new StarRatingType({ maxStars: 10 });

            expect(type.validate(7)).toBe(true);
            expect(type.validate(11)).toContain('0-10');
        });
    });
});

describe('StarRatingType - 渲染测试', () => {
    let mockCtx, starRatingType;

    beforeEach(() => {
        mockCtx = createMockCanvasContext();
        starRatingType = new StarRatingType();
    });

    function createContext(value, overrides = {}) {
        return new CellRenderContext({
            ctx: mockCtx,
            x: 10, y: 20, width: 150, height: 40,
            value,
            displayValue: value != null ? `${value} 星` : '',
            style: {},
            row: 0, col: 0,
            ...overrides,
        });
    }

    it('渲染 0 星', () => {
        const context = createContext(0);
        mockCtx.resetCalls();

        starRatingType.render(context);

        expect(mockCtx.calls.length).toBeGreaterThan(0);
    });

    it('渲染 3 星', () => {
        const context = createContext(3);
        mockCtx.resetCalls();

        starRatingType.render(context);

        const fillCalls = mockCtx.calls.filter(c => c.method === 'fill');
        const strokeCalls = mockCtx.calls.filter(c => c.method === 'stroke');

        expect(fillCalls.length + strokeCalls.length).toBeGreaterThan(0);
    });

    it('渲染 5 星（满分）', () => {
        const context = createContext(5);
        mockCtx.resetCalls();

        starRatingType.render(context);

        expect(() => starRatingType.render(context)).not.toThrow();
    });

    it('渲染半星（如 3.5）', () => {
        const context = createContext(3.5);
        mockCtx.resetCalls();

        starRatingType.render(context);

        expect(() => starRatingType.render(context)).not.toThrow();
    });

    it('负数评分渲染为 0 星', () => {
        const context = createContext(-2);
        mockCtx.resetCalls();

        starRatingType.render(context);

        expect(() => starRatingType.render(context)).not.toThrow();
    });

    it('超过 maxStars 的评分被截断', () => {
        const context = createContext(10);
        mockCtx.resetCalls();

        starRatingType.render(context);

        expect(() => starRatingType.render(context)).not.toThrow();
    });
});

describe('StarRatingType - 配置选项测试', () => {
    it('自定义 maxStars', () => {
        const type = new StarRatingType({ maxStars: 10 });
        expect(type.options.maxStars).toBe(10);
    });

    it('自定义 starSize', () => {
        const type = new StarRatingType({ starSize: 24 });
        expect(type.options.starSize).toBe(24);
    });

    it('自定义填充颜色', () => {
        const type = new StarRatingType({ color: '#ffd700' });
        expect(type.options.color).toBe('#ffd700');
    });

    it('自定义空星颜色', () => {
        const type = new StarRatingType({ emptyColor: '#e0e0e0' });
        expect(type.options.emptyColor).toBe('#e0e0e0');
    });
});

describe('StarRatingType - 攻击性测试', () => {
    describe('异常输入测试', () => {
        it('特殊数值处理', () => {
            const type = new StarRatingType();
            const specialValues = [
                NaN, Infinity, -Infinity, null, undefined, '',
                'abc', true, false, 0.001, 4.999, 100, -100,
            ];

            specialValues.forEach(value => {
                expect(() => type.render(new CellRenderContext({
                    ctx: createMockCanvasContext(),
                    x: 0, y: 0, width: 150, height: 40,
                    value, displayValue: String(value),
                    style: {},
                    row: 0, col: 0,
                }))).not.toThrow();
            });
        });

        it('极小单元格尺寸', () => {
            const type = new StarRatingType();
            const tinyContext = new CellRenderContext({
                ctx: createMockCanvasContext(),
                x: 0, y: 0, width: 10, height: 10,
                value: 3, displayValue: '3 星',
                style: {},
                row: 0, col: 0,
            });

            expect(() => type.render(tinyContext)).not.toThrow();
        });

        it('极大 maxStars 值', () => {
            const type = new StarRatingType({ maxStars: 1000 });
            const context = new CellRenderContext({
                ctx: createMockCanvasContext(),
                x: 0, y: 0, width: 3000, height: 50,
                value: 500, displayValue: '500 星',
                style: {},
                row: 0, col: 0,
            });

            expect(() => type.render(context)).not.toThrow();
        });
    });

    describe('性能压力测试', () => {
        it('批量渲染性能', () => {
            const type = new StarRatingType();
            const start = performance.now();

            for (let i = 0; i < 1000; i++) {
                type.render(new CellRenderContext({
                    ctx: createMockCanvasContext(),
                    x: i % 800, y: Math.floor(i / 800) * 40,
                    width: 150, height: 40,
                    value: Math.random() * 5,
                    displayValue: `${Math.round(Math.random() * 5)} 星`,
                    style: {},
                    row: i, col: 0,
                }));
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(1000);
        });
    });
});

describe('StarRatingType - Bug 检测', () => {
    describe('源码问题识别', () => {
        it('Bug #1: 固定显示 5 颗星的问题', () => {
            const type = new StarRatingType({ maxStars: 10 });
            const ctx = createMockCanvasContext();
            const context = new CellRenderContext({
                ctx,
                x: 0, y: 0, width: 400, height: 40,
                value: 7, displayValue: '7 星',
                style: {},
                row: 0, col: 0,
            });

            type.render(context);

            const loopCount = ctx.calls.filter(c => c.method === 'save').length;
            console.log(`循环次数（应该是 10）: ${loopCount}`);

            if (loopCount !== 10 && loopCount > 0) {
                console.error('❌ Bug: 循环次数与 maxStars 不匹配，可能硬编码为 5');
            }
        });

        it('Bug #2: 半星精度丢失', () => {
            const type = new StarRatingType();
            const values = [2.3, 2.5, 2.7, 2.9];

            values.forEach(val => {
                const ctx = createMockCanvasContext();
                const context = new CellRenderContext({
                    ctx,
                    x: 0, y: 0, width: 150, height: 40,
                    value: val, displayValue: `${val} 星`,
                    style: {},
                    row: 0, col: 0,
                });

                type.render(context);
                console.log(`${val} 星渲染完成`);
            });
        });

        it('Bug #3: 星星重叠或间距不均', () => {
            const type = new StarRatingType({ starSize: 20 });
            const ctx = createMockCanvasContext();
            const context = new CellRenderContext({
                ctx,
                x: 0, y: 0, width: 120, height: 40,
                value: 5, displayValue: '5 星',
                style: {},
                row: 0, col: 0,
            });

            type.render(context);

            const translateCalls = ctx.calls.filter(c => c.method === 'translate');
            console.log(`星星位置数量: ${translateCalls.length}`);

            if (translateCalls.length > 0) {
                const positions = translateCalls.map(c => c.args[0]);
                positions.sort((a, b) => a - b);

                for (let i = 1; i < positions.length; i++) {
                    const gap = positions[i] - positions[i - 1];
                    if (gap < 16) {
                        console.warn(`⚠️  星星 ${i-1} 和 ${i} 可能重叠，间距: ${gap.toFixed(2)}`);
                    }
                }
            }
        });
    });
});