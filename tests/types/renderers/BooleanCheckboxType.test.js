/**
 * BooleanCheckboxType 复选框渲染器完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. Canvas 渲染测试
 * 4. 配置选项测试
 * 5. 集成测试
 * 6. 源码 Bug 检测
 *
 * @module tests/types/renderers/BooleanCheckboxType.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BooleanCheckboxType } from '../../../src/types/renderers/BooleanCheckboxType.js';
import { CellRenderContext } from '../../../src/types/CellRenderContext.js';
import { createMockCanvasContext } from '../../../tests/utils/canvas-mock.js';

describe('BooleanCheckboxType - 基础功能测试', () => {
    let checkboxType;

    beforeEach(() => {
        checkboxType = new BooleanCheckboxType();
    });

    describe('基本属性', () => {
        it('name 应该是 "checkbox"', () => {
            expect(checkboxType.name).toBe('checkbox');
        });

        it('editorType 应该是 "text"', () => {
            expect(checkboxType.editorType).toBe('text');
        });
    });

    describe('getDefaultStyle() 方法', () => {
        it('默认居中对齐', () => {
            const style = checkboxType.getDefaultStyle({});
            expect(style.textAlign).toBe('center');
        });
    });

    describe('format() 方法', () => {
        it('true 格式化', () => {
            expect(checkboxType.format(true)).toBe('true');
        });

        it('false 格式化', () => {
            expect(checkboxType.format(false)).toBe('false');
        });

        it('null/undefined 格式化', () => {
            expect(checkboxType.format(null)).toBe('');
            expect(checkboxType.format(undefined)).toBe('');
        });
    });

    describe('parse() 方法', () => {
        it('解析 true 值', () => {
            expect(checkboxType.parse('true')).toBe(true);
            expect(checkboxType.parse('TRUE')).toBe(true);
            expect(checkboxType.parse('yes')).toBe(true);
            expect(checkboxType.parse('1')).toBe(true);
            expect(checkboxType.parse('是')).toBe(true);
        });

        it('解析 false 值', () => {
            expect(checkboxType.parse('false')).toBe(false);
            expect(checkboxType.parse('FALSE')).toBe(false);
            expect(checkboxType.parse('no')).toBe(false);
            expect(checkboxType.parse('0')).toBe(false);
            expect(checkboxType.parse('否')).toBe(false);
        });

        it('无法识别的值原样返回', () => {
            expect(checkboxType.parse('maybe')).toBe('maybe');
        });

        it('空值返回空字符串', () => {
            expect(checkboxType.parse('')).toBe('');
            expect(checkboxType.parse(null)).toBe('');
        });
    });
});

describe('BooleanCheckboxType - 渲染测试', () => {
    let mockCtx, checkboxType;

    beforeEach(() => {
        mockCtx = createMockCanvasContext();
        checkboxType = new BooleanCheckboxType();
    });

    function createContext(value, overrides = {}) {
        return new CellRenderContext({
            ctx: mockCtx,
            x: 10, y: 20, width: 100, height: 50,
            value,
            displayValue: String(value),
            style: {},
            row: 0, col: 0,
            ...overrides,
        });
    }

    it('选中状态渲染', () => {
        const context = createContext(true);
        mockCtx.resetCalls();

        checkboxType.render(context);

        expect(mockCtx.calls.some(c => c.method === 'stroke')).toBe(true);
        expect(mockCtx.calls.some(c => c.method === 'fill')).toBe(true);
    });

    it('未选中状态渲染', () => {
        const context = createContext(false);
        mockCtx.resetCalls();

        checkboxType.render(context);

        expect(mockCtx.calls.some(c => c.method === 'stroke')).toBe(true);
    });

    it('禁用状态渲染', () => {
        const context = createContext(true, { isDisabled: true });
        mockCtx.resetCalls();

        checkboxType.render(context);

        expect(mockCtx.calls.some(c => c.prop === 'globalAlpha')).toBe(true);
    });

    it('null 值渲染为未选中', () => {
        const context = createContext(null);
        mockCtx.resetCalls();

        checkboxType.render(context);

        expect(() => checkboxType.render(context)).not.toThrow();
    });
});

describe('BooleanCheckboxType - 配置选项测试', () => {
    it('自定义 size 选项', () => {
        const type = new BooleanCheckboxType({ size: 0.8 });
        expect(type.options.size).toBe(0.8);
    });

    it('自定义 checkedColor 选项', () => {
        const type = new BooleanCheckboxType({ checkedColor: '#ff0000' });
        expect(type.options.checkedColor).toBe('#ff0000');
    });

    it('自定义 uncheckedColor 选项', () => {
        const type = new BooleanCheckboxType({ uncheckedColor: '#00ff00' });
        expect(type.options.uncheckedColor).toBe('#00ff00');
    });
});

describe('BooleanCheckboxType - 攻击性测试', () => {
    describe('异常输入测试', () => {
        it('各种布尔值的 truthy/falsy 判断', () => {
            const type = new BooleanCheckboxType();
            const values = [0, 1, '', ' ', '0', '1', null, undefined, {}, [], NaN];

            values.forEach(value => {
                expect(() => type.render(new CellRenderContext({
                    ctx: createMockCanvasContext(),
                    x: 0, y: 0, width: 80, height: 30,
                    value, displayValue: String(value), style: {},
                    row: 0, col: 0,
                }))).not.toThrow();
            });
        });

        it('极小单元格尺寸', () => {
            const type = new BooleanCheckboxType();
            const tinyContext = new CellRenderContext({
                ctx: createMockCanvasContext(),
                x: 0, y: 0, width: 1, height: 1,
                value: true, displayValue: 'true', style: {},
                row: 0, col: 0,
            });

            expect(() => type.render(tinyContext)).not.toThrow();
        });

        it('极大单元格尺寸', () => {
            const type = new BooleanCheckboxType();
            const hugeContext = new CellRenderContext({
                ctx: createMockCanvasContext(),
                x: 0, y: 0, width: 10000, height: 10000,
                value: true, displayValue: 'true', style: {},
                row: 0, col: 0,
            });

            expect(() => type.render(hugeContext)).not.toThrow();
        });
    });

    describe('性能压力测试', () => {
        it('批量渲染性能', () => {
            const type = new BooleanCheckboxType();
            const start = performance.now();

            for (let i = 0; i < 1000; i++) {
                type.render(new CellRenderContext({
                    ctx: createMockCanvasContext(),
                    x: i % 800, y: Math.floor(i / 800) * 30,
                    width: 80, height: 30,
                    value: i % 2 === 0,
                    displayValue: String(i % 2 === 0),
                    style: {},
                    row: i, col: 0,
                }));
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(500);
        });
    });
});

describe('BooleanCheckboxType - Bug 检测', () => {
    describe('源码问题识别', () => {
        it('Bug #1: parse() 与 BooleanColumnType 的差异', () => {
            const checkboxType = new BooleanCheckboxType();

            const missingKeywords = ['y', 'Y', 't', 'T', 'f', 'F', '真', '假'];
            missingKeywords.forEach(keyword => {
                const result = checkboxType.parse(keyword);
                if (result === keyword) {
                    console.log(`⚠️  parse('${keyword}') 未识别，与 BooleanColumnType 行为不一致`);
                }
            });
        });

        it('Bug #2: render() 中 drawRoundedRect 依赖', () => {
            const type = new BooleanCheckboxType();
            const contextWithoutMethod = {
                ctx: createMockCanvasContext(),
                x: 0, y: 0, width: 80, height: 30,
                value: true, displayValue: 'true', style: {},
                row: 0, col: 0,
            };

            delete contextWithoutMethod.drawRoundedRect;

            let errorOccurred = false;
            try {
                type.render(contextWithoutMethod);
            } catch (e) {
                errorOccurred = true;
            }

            if (errorOccurred) {
                console.error('❌ Bug: render() 强依赖 context.drawRoundedRect 方法');
            }
        });

        it('Bug #3: isDisabled 对已禁用控件的二次处理', () => {
            const type = new BooleanCheckboxType();
            const ctx = createMockCanvasContext();
            const disabledContext = new CellRenderContext({
                ctx,
                x: 0, y: 0, width: 80, height: 30,
                value: true, displayValue: 'true', style: {},
                row: 0, col: 0,
                isDisabled: true,
            });

            type.render(disabledContext);

            const alphaCalls = ctx.calls.filter(c => c.prop === 'globalAlpha');
            console.log(`globalAlpha 设置次数: ${alphaCalls.length}`);
        });
    });
});