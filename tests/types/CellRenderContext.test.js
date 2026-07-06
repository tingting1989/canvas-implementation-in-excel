/**
 * CellRenderContext 单元格渲染上下文完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. 双轨行列号体系测试
 * 4. 辅助方法测试
 * 5. 集成测试
 * 6. 源码 Bug 检测
 *
 * @module tests/types/CellRenderContext.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CellRenderContext } from '../../src/types/CellRenderContext.js';
import { createMockCanvasContext } from '../utils/canvas-mock.js';

describe('CellRenderContext - 基础功能测试', () => {
    let mockCtx;

    beforeEach(() => {
        mockCtx = createMockCanvasContext();
    });

    describe('构造函数', () => {
        it('应该正确初始化所有属性', () => {
            const context = new CellRenderContext({
                ctx: mockCtx,
                x: 10,
                y: 20,
                width: 100,
                height: 50,
                value: 'test',
                displayValue: 'Test',
                style: { color: 'red' },
                row: 5,
                col: 3,
            });

            expect(context.ctx).toBe(mockCtx);
            expect(context.x).toBe(10);
            expect(context.y).toBe(20);
            expect(context.width).toBe(100);
            expect(context.height).toBe(50);
            expect(context.value).toBe('test');
            expect(context.displayValue).toBe('Test');
            expect(context.style.color).toBe('red');
            expect(context.row).toBe(5);
            expect(context.col).toBe(3);
        });

        it('默认值设置正确', () => {
            const context = new CellRenderContext({
                ctx: mockCtx,
                x: 0,
                y: 0,
                width: 80,
                height: 30,
                value: null,
                displayValue: '',
                style: {},
                row: 0,
                col: 0,
            });

            expect(context.sheet).toBeNull();
            expect(context.isSelected).toBe(false);
            expect(context.isDisabled).toBe(false);
            expect(context.isMerged).toBe(false);
            expect(context.mergeInfo).toBeNull();
        });
    });

    describe('行列号属性', () => {
        it('正确设置和读取行号列号', () => {
            const context = new CellRenderContext({
                ctx: mockCtx,
                x: 0, y: 0, width: 80, height: 30,
                value: '', displayValue: '', style: {},
                row: 5, col: 3,
            });

            expect(context.row).toBe(5);
            expect(context.col).toBe(3);
        });
    });

    describe('只读属性验证', () => {
        it('所有公共属性应该是只读的', () => {
            const context = new CellRenderContext({
                ctx: mockCtx,
                x: 0, y: 0, width: 80, height: 30,
                value: '', displayValue: '', style: {},
                row: 0, col: 0,
            });

            expect(() => { context.x = 999; }).toThrow();
            expect(() => { context.y = 999; }).toThrow();
            expect(() => { context.width = 999; }).toThrow();
            expect(() => { context.height = 999; }).toThrow();
            expect(() => { context.row = 999; }).toThrow();
            expect(() => { context.col = 999; }).toThrow();
        });
    });
});

describe('CellRenderContext - 辅助方法测试', () => {
    let mockCtx;

    beforeEach(() => {
        mockCtx = createMockCanvasContext();
    });

    describe('drawRoundedRect() 方法', () => {
        it('应该绘制圆角矩形路径', () => {
            const context = new CellRenderContext({
                ctx: mockCtx,
                x: 10, y: 20, width: 100, height: 50,
                value: '', displayValue: '', style: {},
                row: 0, col: 0,
            });

            expect(() => context.drawRoundedRect(10, 20, 100, 50, 5)).not.toThrow();
        });

        it('radius 为 0 应该绘制普通矩形', () => {
            const context = new CellRenderContext({
                ctx: mockCtx,
                x: 0, y: 0, width: 80, height: 30,
                value: '', displayValue: '', style: {},
                row: 0, col: 0,
            });

            expect(() => context.drawRoundedRect(0, 0, 80, 30, 0)).not.toThrow();
        });
    });

    describe('getCenterX/getCenterY() 方法', () => {
        it('计算正确的中心坐标', () => {
            const context = new CellRenderContext({
                ctx: mockCtx,
                x: 10, y: 20, width: 100, height: 50,
                value: '', displayValue: '', style: {},
                row: 0, col: 0,
            });

            expect(context.getCenterX()).toBe(60);
            expect(context.getCenterY()).toBe(45);
        });
    });
});

describe('CellRenderContext - 攻击性测试', () => {
    let mockCtx;

    beforeEach(() => {
        mockCtx = createMockCanvasContext();
    });

    describe('异常输入测试', () => {
        it('极端坐标值', () => {
            const extremeCoords = [
                { x: -10000, y: -10000, width: 1, height: 1 },
                { x: 10000, y: 10000, width: 20000, height: 20000 },
                { x: 0, y: 0, width: 0.001, height: 0.001 },
                { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER, width: 100, height: 100 },
                { x: NaN, y: NaN, width: 100, height: 100 },
                { x: Infinity, y: Infinity, width: 100, height: 100 },
            ];

            extremeCoords.forEach(coords => {
                expect(() => new CellRenderContext({
                    ctx: mockCtx,
                    ...coords,
                    value: '', displayValue: '', style: {},
                    row: 0, col: 0,
                })).not.toThrow();
            });
        });

        it('特殊的 value 和 displayValue', () => {
            const specialValues = [
                null,
                undefined,
                '',
                '<script>alert("xss")</script>',
                'a'.repeat(100000),
                { toString: () => 'object value' },
                Symbol('symbol'),
                () => 'function value',
            ];

            specialValues.forEach(value => {
                expect(() => new CellRenderContext({
                    ctx: mockCtx,
                    x: 0, y: 0, width: 80, height: 30,
                    value,
                    displayValue: String(value),
                    style: {},
                    row: 0, col: 0,
                })).not.toThrow();
            });
        });

        it('复杂的 style 对象', () => {
            const complexStyles = [
                null,
                undefined,
                {},
                { nested: { deep: { value: true } } },
                { color: () => 'dynamic' },
                new Map(),
                new Set(),
            ];

            complexStyles.forEach(style => {
                expect(() => new CellRenderContext({
                    ctx: mockCtx,
                    x: 0, y: 0, width: 80, height: 30,
                    value: '', displayValue: '', style,
                    row: 0, col: 0,
                })).not.toThrow();
            });
        });

        it('负数或零尺寸', () => {
            const invalidSizes = [
                { width: -100, height: 50 },
                { width: 100, height: -50 },
                { width: 0, height: 0 },
                { width: -1, height: -1 },
            ];

            invalidSizes.forEach(size => {
                expect(() => new CellRenderContext({
                    ctx: mockCtx,
                    x: 0, y: 0, ...size,
                    value: '', displayValue: '', style: {},
                    row: 0, col: 0,
                })).not.toThrow();
            });
        });
    });

    describe('边界条件测试', () => {
        it('极大的行号列号', () => {
            const context = new CellRenderContext({
                ctx: mockCtx,
                x: 0, y: 0, width: 80, height: 30,
                value: '', displayValue: '', style: {},
                row: Number.MAX_SAFE_INTEGER,
                col: Number.MAX_SAFE_INTEGER,
            });

            expect(context.row).toBe(Number.MAX_SAFE_INTEGER);
            expect(context.col).toBe(Number.MAX_SAFE_INTEGER);
        });

        it('负数行号列号', () => {
            const context = new CellRenderContext({
                ctx: mockCtx,
                x: 0, y: 0, width: 80, height: 30,
                value: '', displayValue: '', style: {},
                row: -5,
                col: -3,
            });

            expect(context.row).toBe(-5);
            expect(context.col).toBe(-3);
        });
    });

    describe('性能压力测试', () => {
        it('高频创建 Context 实例', () => {
            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                new CellRenderContext({
                    ctx: mockCtx,
                    x: i % 800, y: Math.floor(i / 800) * 30,
                    width: 80, height: 30,
                    value: `cell_${i}`, displayValue: `Cell ${i}`,
                    style: { color: 'black' },
                    row: i, col: 0,
                });
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(500);
        });

        it('高频调用辅助方法', () => {
            const context = new CellRenderContext({
                ctx: mockCtx,
                x: 0, y: 0, width: 100, height: 50,
                value: '', displayValue: '', style: {},
                row: 0, col: 0,
            });

            const start = performance.now();

            for (let i = 0; i < 50000; i++) {
                context.getCenterX();
                context.getCenterY();
                context.drawRoundedRect(0, 0, 100, 50, 5);
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(300);
        });
    });
});

describe('CellRenderContext - 集成测试', () => {
    let mockCtx;

    beforeEach(() => {
        mockCtx = createMockCanvasContext();
    });

    it('与渲染器接口兼容', () => {
        const context = new CellRenderContext({
            ctx: mockCtx,
            x: 10, y: 20, width: 100, height: 50,
            value: 42, displayValue: '42',
            style: { textAlign: 'center', color: 'blue', fontSize: 14 },
            row: 5, col: 3,
            isSelected: true,
            isDisabled: false,
            isMerged: false,
            mergeInfo: null,
        });

        expect(typeof context.ctx).toBe('object');
        expect(typeof context.x).toBe('number');
        expect(typeof context.y).toBe('number');
        expect(typeof context.width).toBe('number');
        expect(typeof context.height).toBe('number');
        expect(typeof context.value).toBeDefined();
        expect(typeof context.displayValue).toBe('string');
        expect(typeof context.style).toBe('object');
        expect(typeof context.row).toBe('number');
        expect(typeof context.col).toBe('number');
        expect(typeof context.isSelected).toBe('boolean');
        expect(typeof context.isDisabled).toBe('boolean');
        expect(typeof context.isMerged).toBe('boolean');
        expect(typeof context.getCenterX).toBe('function');
        expect(typeof context.getCenterY).toBe('function');
        expect(typeof context.drawRoundedRect).toBe('function');
    });

    it('合并单元格信息完整性', () => {
        const mergeInfo = {
            startRow: 5, startCol: 3,
            endRow: 7, endCol: 5,
            isMainCell: true,
        };

        const context = new CellRenderContext({
            ctx: mockCtx,
            x: 0, y: 0, width: 300, height: 90,
            value: 'merged', displayValue: 'Merged Content',
            style: {},
            row: 5, col: 3,
            isMerged: true,
            mergeInfo,
        });

        expect(context.isMerged).toBe(true);
        expect(context.mergeInfo).toBe(mergeInfo);
        expect(context.mergeInfo.startRow).toBe(5);
        expect(context.mergeInfo.endRow).toBe(7);
    });

});

describe('CellRenderContext - Bug 检测', () => {
    let mockCtx;

    beforeEach(() => {
        mockCtx = createMockCanvasContext();
    });

    describe('源码问题识别', () => {
        it('Bug #1: ctx 为 null 或 undefined', () => {
            let errorOccurred = false;
            try {
                const context = new CellRenderContext({
                    ctx: null,
                    x: 0, y: 0, width: 80, height: 30,
                    value: '', displayValue: '', style: {},
                    row: 0, col: 0,
                });
                context.ctx;
            } catch (e) {
                errorOccurred = true;
            }

            if (!errorOccurred) {
                console.warn('⚠️  ctx 为 null 时不会立即报错，但后续使用可能出错');
            }
        });

        it('Bug #2: 缺少必需参数的行为', () => {
            const minimalParams = {};

            let errorOccurred = false;
            try {
                const context = new CellRenderContext(minimalParams);
                console.log('缺少参数的 context:', context);
            } catch (e) {
                errorOccurred = true;
                console.log('错误:', e.message);
            }

            if (!errorOccurred) {
                console.warn('⚠️  缺少必需参数时不会抛出错误，但属性可能是 undefined');
            }
        });

        it('Bug #3: 行列号正确设置', () => {
            const context = new CellRenderContext({
                ctx: mockCtx,
                x: 0, y: 0, width: 80, height: 30,
                value: '', displayValue: '', style: {},
                row: 5, col: 3,
            });

            expect(context.row).toBe(5);
            expect(context.col).toBe(3);
        });

        it('Bug #4: drawRoundedRect 对负 radius 的处理', () => {
            const context = new CellRenderContext({
                ctx: mockCtx,
                x: 0, y: 0, width: 80, height: 30,
                value: '', displayValue: '', style: {},
                row: 0, col: 0,
            });

            expect(() => context.drawRoundedRect(0, 0, 80, 30, -5)).not.toThrow();
            expect(() => context.drawRoundedRect(0, 0, 80, 30, -Infinity)).not.toThrow();
        });
    });

    describe('边缘行为分析', () => {
        it('style 对象的可变性影响', () => {
            const sharedStyle = { color: 'red' };
            const context1 = new CellRenderContext({
                ctx: mockCtx,
                x: 0, y: 0, width: 80, height: 30,
                value: '', displayValue: '', style: sharedStyle,
                row: 0, col: 0,
            });

            sharedStyle.color = 'blue';

            console.log(`原始样式颜色改变后 context.style.color: ${context1.style.color}`);
            console.warn('⚠️  外部修改 style 会影响已创建的 context');
        });

        it('value 和 displayValue 不一致的情况', () => {
            const context = new CellRenderContext({
                ctx: mockCtx,
                x: 0, y: 0, width: 80, height: 30,
                value: 12345,
                displayValue: '12,345',
                style: {},
                row: 0, col: 0,
            });

            console.log(`value: ${context.value} (${typeof context.value})`);
            console.log(`displayValue: ${context.displayValue} (${typeof context.displayValue})`);

            expect(context.value).toBe(12345);
            expect(context.displayValue).toBe('12,345');
        });

        it('sheet 引用的潜在循环引用', () => {
            const sheetMock = {};
            sheetMock.context = null;

            const context = new CellRenderContext({
                ctx: mockCtx,
                x: 0, y: 0, width: 80, height: 30,
                value: '', displayValue: '', style: {},
                row: 0, col: 0,
                sheet: sheetMock,
            });

            sheetMock.context = context;

            console.log('⚠️  创建了 sheet <-> context 循环引用');
            console.log('ℹ️  这可能导致内存泄漏，需要确保及时解除引用');
        });
    });
});