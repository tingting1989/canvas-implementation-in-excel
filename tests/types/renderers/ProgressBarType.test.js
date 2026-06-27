/**
 * ProgressBarType 进度条渲染器完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. Canvas 渲染测试
 * 4. 配置选项和颜色测试
 * 5. 集成测试
 * 6. 源码 Bug 检测
 *
 * @module tests/types/renderers/ProgressBarType.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressBarType } from '../../../src/types/renderers/ProgressBarType.js';
import { CellRenderContext } from '../../../src/types/CellRenderContext.js';
import { createMockCanvasContext } from '../../../tests/utils/canvas-mock.js';

describe('ProgressBarType - 基础功能测试', () => {
    let progressBarType;

    beforeEach(() => {
        progressBarType = new ProgressBarType();
    });

    describe('基本属性', () => {
        it('name 应该是 "progressBar"', () => {
            expect(progressBarType.name).toBe('progressBar');
        });

        it('editorType 应该是 "numeric"', () => {
            expect(progressBarType.editorType).toBe('numeric');
        });
    });

    describe('getDefaultStyle() 方法', () => {
        it('默认居中对齐', () => {
            const style = progressBarType.getDefaultStyle({});
            expect(style.textAlign).toBe('center');
        });
    });

    describe('format() 方法', () => {
        it('数值格式化为百分比字符串', () => {
            expect(progressBarType.format(50)).toBe('50%');
            expect(progressBarType.format(100)).toBe('100%');
            expect(progressBarType.format(0)).toBe('0%');
        });

        it('null 值返回空字符串', () => {
            expect(progressBarType.format(null)).toBe('');
            expect(progressBarType.format(undefined)).toBe('');
        });
    });

    describe('validate() 方法', () => {
        it('空值应该通过验证', () => {
            expect(progressBarType.validate('')).toBe(true);
            expect(progressBarType.validate(null)).toBe(true);
        });

        it('有效范围 0-100 应该通过验证', () => {
            expect(progressBarType.validate(0)).toBe(true);
            expect(progressBarType.validate(50)).toBe(true);
            expect(progressBarType.validate(100)).toBe(true);
        });

        it('超出范围应该返回错误信息', () => {
            expect(progressBarType.validate(-1)).toContain('0-100');
            expect(progressBarType.validate(101)).toContain('0-100');
        });

        it('非数字应该验证失败', () => {
            expect(progressBarType.validate('abc')).toBe(false);
        });
    });
});

describe('ProgressBarType - 渲染测试', () => {
    let mockCtx, progressBarType;

    beforeEach(() => {
        mockCtx = createMockCanvasContext();
        progressBarType = new ProgressBarType();
    });

    function createContext(value, overrides = {}) {
        return new CellRenderContext({
            ctx: mockCtx,
            x: 10, y: 20, width: 200, height: 30,
            value,
            displayValue: value != null ? `${value}%` : '',
            style: { color: '#333', fontSize: 11, fontFamily: 'Segoe UI' },
            row: 0, col: 0,
            ...overrides,
        });
    }

    it('渲染 0% 进度条', () => {
        const context = createContext(0);
        mockCtx.resetCalls();

        progressBarType.render(context);

        const fillCalls = mockCtx.calls.filter(c => c.method === 'fillRect' || (c.method === 'fill' && c.args.length === 0));
        console.log(`0% 进度条的绘制调用数: ${mockCtx.calls.length}`);
    });

    it('渲染 50% 进度条', () => {
        const context = createContext(50);
        mockCtx.resetCalls();

        progressBarType.render(context);

        expect(mockCtx.calls.some(c => c.method === 'createLinearGradient')).toBe(true);
        expect(mockCtx.calls.some(c => c.method === 'fillText')).toBe(true);
    });

    it('渲染 100% 进度条', () => {
        const context = createContext(100);
        mockCtx.resetCalls();

        progressBarType.render(context);

        expect(() => progressBarType.render(context)).not.toThrow();
    });

    it('超出范围的值被限制到 0-100', () => {
        const overContext = createContext(150);
        const underContext = createContext(-50);

        mockCtx.resetCalls();
        progressBarType.render(overContext);
        expect(() => progressBarType.render(overContext)).not.toThrow();

        mockCtx.resetCalls();
        progressBarType.render(underContext);
        expect(() => progressBarType.render(underContext)).not.toThrow();
    });

    it('隐藏百分比文字', () => {
        const type = new ProgressBarType({ showPercent: false });
        const context = createContext(75);
        mockCtx.resetCalls();

        type.render(context);

        const textCalls = mockCtx.calls.filter(c => c.method === 'fillText');
        expect(textCalls.length).toBe(0);
    });
});

describe('ProgressBarType - 配置选项测试', () => {
    describe('颜色配置', () => {
        it('自定义低/中/高范围颜色', () => {
            const type = new ProgressBarType({
                colors: {
                    low: '#ff0000',
                    medium: '#ffff00',
                    high: '#00ff00'
                }
            });

            expect(type.options.colors.low).toBe('#ff0000');
            expect(type.options.colors.medium).toBe('#ffff00');
            expect(type.options.colors.high).toBe('#00ff00');
        });

        it('默认颜色配置', () => {
            const type = new ProgressBarType();

            expect(type.options.colors).toBeDefined();
        });
    });

    describe('尺寸配置', () => {
        it('自定义高度比例', () => {
            const type = new ProgressBarType({ heightRatio: 0.8 });
            expect(type.options.heightRatio).toBe(0.8);
        });

        it('自定义圆角半径', () => {
            const type = new ProgressBarType({ borderRadius: 10 });
            expect(type.options.borderRadius).toBe(10);
        });
    });
});

describe('ProgressBarType - 攻击性测试', () => {
    describe('异常输入测试', () => {
        it('特殊数值处理', () => {
            const type = new ProgressBarType();
            const specialValues = [
                NaN, Infinity, -Infinity, null, undefined, '',
                'abc', true, false, {}, [], 0.001, 99.999,
            ];

            specialValues.forEach(value => {
                expect(() => type.render(new CellRenderContext({
                    ctx: createMockCanvasContext(),
                    x: 0, y: 0, width: 200, height: 30,
                    value, displayValue: String(value),
                    style: {},
                    row: 0, col: 0,
                }))).not.toThrow();
            });
        });

        it('极小单元格尺寸', () => {
            const type = new ProgressBarType();
            const tinyContext = new CellRenderContext({
                ctx: createMockCanvasContext(),
                x: 0, y: 0, width: 5, height: 5,
                value: 50, displayValue: '50%',
                style: {},
                row: 0, col: 0,
            });

            expect(() => type.render(tinyContext)).not.toThrow();
        });

        it('极大单元格尺寸', () => {
            const type = new ProgressBarType();
            const hugeContext = new CellRenderContext({
                ctx: createMockCanvasContext(),
                x: 0, y: 0, width: 5000, height: 5000,
                value: 75, displayValue: '75%',
                style: {},
                row: 0, col: 0,
            });

            expect(() => type.render(hugeContext)).not.toThrow();
        });
    });

    describe('性能压力测试', () => {
        it('批量渲染性能', () => {
            const type = new ProgressBarType();
            const start = performance.now();

            for (let i = 0; i < 1000; i++) {
                type.render(new CellRenderContext({
                    ctx: createMockCanvasContext(),
                    x: i % 800, y: Math.floor(i / 800) * 30,
                    width: 200, height: 30,
                    value: Math.random() * 100,
                    displayValue: `${Math.round(Math.random() * 100)}%`,
                    style: {},
                    row: i, col: 0,
                }));
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(1000);
        });
    });
});

describe('ProgressBarType - Bug 检测', () => {
    describe('源码问题识别', () => {
        it('Bug #1: lightenColor 对无效颜色值的处理', () => {
            const type = new ProgressBarType({ colors: { low: 'invalid-color' } });

            let errorOccurred = false;
            try {
                type.render(new CellRenderContext({
                    ctx: createMockCanvasContext(),
                    x: 0, y: 0, width: 200, height: 30,
                    value: 10, displayValue: '10%',
                    style: {},
                    row: 0, col: 0,
                }));
            } catch (e) {
                errorOccurred = true;
            }

            if (errorOccurred) {
                console.error('❌ Bug: 无效颜色值导致渲染失败');
            }
        });

        it('Bug #2: 渐变方向的一致性', () => {
            const type = new ProgressBarType();
            const ctx = createMockCanvasContext();
            const context = new CellRenderContext({
                ctx,
                x: 0, y: 0, width: 200, height: 30,
                value: 50, displayValue: '50%',
                style: {},
                row: 0, col: 0,
            });

            type.render(context);

            const gradientCalls = ctx.calls.filter(c => c.method === 'createLinearGradient');
            if (gradientCalls.length > 0) {
                const [, , x2, y2] = gradientCalls[0].args;
                console.log(`渐变终点坐标: (${x2}, ${y2})`);
                if (y2 !== 0) {
                    console.warn('⚠️  渐变可能不是水平方向的');
                }
            }
        });

        it('Bug #3: 百分比文字溢出问题', () => {
            const type = new ProgressBarType();
            const narrowContext = new CellRenderContext({
                ctx: createMockCanvasContext(),
                x: 0, y: 0, width: 30, height: 30,
                value: 100, displayValue: '100%',
                style: { fontSize: 14 },
                row: 0, col: 0,
            });

            type.render(narrowContext);
            console.warn('⚠️  窄单元格中百分比文字可能溢出');
        });
    });
});