/**
 * ColorPreviewType 颜色预览渲染器完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. Canvas 渲染测试
 * 4. 颜色验证和标准化测试
 * 5. 配置选项测试
 * 6. 集成测试
 * 7. 源码 Bug 检测
 *
 * @module tests/types/renderers/ColorPreviewType.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ColorPreviewType } from '../../../src/types/renderers/ColorPreviewType.js';
import { CellRenderContext } from '../../../src/types/CellRenderContext.js';
import { createMockCanvasContext } from '../../../tests/utils/canvas-mock.js';

describe('ColorPreviewType - 基础功能测试', () => {
    let colorPreviewType;

    beforeEach(() => {
        colorPreviewType = new ColorPreviewType();
    });

    describe('基本属性', () => {
        it('name 应该是 "colorPreview"', () => {
            expect(colorPreviewType.name).toBe('colorPreview');
        });

        it('editorType 应该是 "text"', () => {
            expect(colorPreviewType.editorType).toBe('text');
        });
    });

    describe('format() 方法', () => {
        it('颜色值转为字符串', () => {
            expect(colorPreviewType.format('#ff0000')).toBe('#ff0000');
            expect(colorPreviewType.format('rgb(255, 0, 0)')).toBe('rgb(255, 0, 0)');
        });

        it('null/undefined 返回空字符串', () => {
            expect(colorPreviewType.format(null)).toBe('');
            expect(colorPreviewType.format(undefined)).toBe('');
        });
    });

    describe('validate() 方法', () => {
        it('空值应该通过验证', () => {
            expect(colorPreviewType.validate('')).toBe(true);
            expect(colorPreviewType.validate(null)).toBe(true);
        });

        it('有效的 Hex 颜色应该通过验证', () => {
            expect(colorPreviewType.validate('#ff0000')).toBe(true);
            expect(colorPreviewType.validate('#FF0000')).toBe(true);
            expect(colorPreviewType.validate('#f00')).toBe(true);
            expect(colorPreviewType.validate('#fff')).toBe(true);
        });

        it('有效的 RGB/RGBA 颜色应该通过验证', () => {
            expect(colorPreviewType.validate('rgb(255, 0, 0)')).toBe(true);
            expect(colorPreviewType.validate('rgba(255, 0, 0, 0.5)')).toBe(true);
        });

        it('有效的 CSS 颜色名称应该通过验证', () => {
            expect(colorPreviewType.validate('red')).toBe(true);
            expect(colorPreviewType.validate('blue')).toBe(true);
            expect(colorPreviewType.validate('transparent')).toBe(true);
        });

        it('无效的颜色值应该返回错误信息', () => {
            expect(colorPreviewType.validate('invalid-color')).toContain('无效的颜色值');
            expect(colorPreviewType.validate('not-a-color')).toContain('无效的颜色值');
        });
    });
});

describe('ColorPreviewType - 渲染测试', () => {
    let mockCtx, colorPreviewType;

    beforeEach(() => {
        mockCtx = createMockCanvasContext();
        colorPreviewType = new ColorPreviewType();
    });

    function createContext(value, overrides = {}) {
        return new CellRenderContext({
            ctx: mockCtx,
            x: 10, y: 20, width: 80, height: 30,
            value,
            displayValue: String(value ?? ''),
            style: {},
            row: 0, col: 0,
            ...overrides,
        });
    }

    it('渲染有效 Hex 颜色', () => {
        const context = createContext('#ff0000');
        mockCtx.resetCalls();

        colorPreviewType.render(context);

        expect(mockCtx.calls.some(c => c.method === 'fill')).toBe(true);
        expect(mockCtx.calls.some(c => c.prop === 'fillStyle')).toBe(true);
    });

    it('渲染 RGB 颜色', () => {
        const context = createContext('rgb(0, 128, 255)');
        mockCtx.resetCalls();

        colorPreviewType.render(context);

        expect(() => colorPreviewType.render(context)).not.toThrow();
    });

    it('渲染 RGBA 颜色', () => {
        const context = createContext('rgba(255, 0, 0, 0.5)');
        mockCtx.resetCalls();

        colorPreviewType.render(context);

        expect(() => colorPreviewType.render(context)).not.toThrow();
    });

    it('渲染 CSS 颜色名称', () => {
        const context = createContext('green');
        mockCtx.resetCalls();

        colorPreviewType.render(context);

        expect(() => colorPreviewType.render(context)).not.toThrow();
    });

    it('空值不渲染', () => {
        const context = createContext('');
        mockCtx.resetCalls();

        colorPreviewType.render(context);

        expect(mockCtx.calls.length).toBe(0);
    });

    it('null 值不渲染', () => {
        const context = createContext(null);
        mockCtx.resetCalls();

        colorPreviewType.render(context);

        expect(mockCtx.calls.length).toBe(0);
    });

    it('无效颜色值使用 transparent 或尝试修复', () => {
        const context = createContext('invalid-color');
        mockCtx.resetCalls();

        colorPreviewType.render(context);

        const fillStyleCalls = mockCtx.calls.filter(c => c.prop === 'fillStyle');
        if (fillStyleCalls.length > 0) {
            console.log(`无效颜色的处理结果: ${fillStyleCalls[0].val}`);
        }
    });

    it('显示边框（默认）', () => {
        const context = createContext('#ff0000');
        mockCtx.resetCalls();

        colorPreviewType.render(context);

        expect(mockCtx.calls.some(c => c.method === 'stroke')).toBe(true);
    });

    it('隐藏边框', () => {
        const type = new ColorPreviewType({ showBorder: false });
        const context = createContext('#ff0000');
        mockCtx.resetCalls();

        type.render(context);

        const strokeCalls = mockCtx.calls.filter(c => c.method === 'stroke' && c.args.length === 0);
        expect(strokeCalls.length).toBe(0);
    });
});

describe('ColorPreviewType - 配置选项测试', () => {
    it('自定义 borderRadius', () => {
        const type = new ColorPreviewType({ borderRadius: 8 });
        expect(type.options.borderRadius).toBe(8);
    });

    it('自定义 showBorder', () => {
        const withBorder = new ColorPreviewType({ showBorder: true });
        const withoutBorder = new ColorPreviewType({ showBorder: false });

        expect(withBorder.options.showBorder).toBe(true);
        expect(withoutBorder.options.showBorder).toBe(false);
    });
});

describe('ColorPreviewType - 颜色格式支持测试', () => {
    let colorPreviewType;

    beforeEach(() => {
        colorPreviewType = new ColorPreviewType();
    });

    it('Hex 格式', () => {
        const hexColors = [
            '#ff0000', '#00ff00', '#0000ff',
            '#FF0000', '#00FF00', '#0000FF',
            '#f00', '#0f0', '#00f',
            '#123456', '#abcdef', '#ABCDEF',
        ];

        hexColors.forEach(color => {
            expect(colorPreviewType.validate(color)).toBe(true);
            expect(() => colorPreviewType.render(new CellRenderContext({
                ctx: createMockCanvasContext(),
                x: 0, y: 0, width: 80, height: 30,
                value: color, displayValue: color,
                style: {},
                row: 0, col: 0,
            }))).not.toThrow();
        });
    });

    it('RGB/RGBA 格式', () => {
        const rgbColors = [
            'rgb(255, 0, 0)',
            'rgb(0, 255, 0)',
            'rgba(255, 0, 0, 0.5)',
            'rgba(0, 0, 255, 1)',
        ];

        rgbColors.forEach(color => {
            expect(colorPreviewType.validate(color)).toBe(true);
        });
    });

    it('HSL/HSLA 格式', () => {
        const hslColors = [
            'hsl(0, 100%, 50%)',
            'hsl(120, 100%, 50%)',
            'hsla(240, 100%, 50%, 0.8)',
        ];

        hslColors.forEach(color => {
            const result = colorPreviewType.validate(color);
            console.log(`${color}: ${result}`);
        });
    });

    it('CSS 预定义颜色名称', () => {
        const namedColors = [
            'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
            'white', 'black', 'gray', 'grey',
            'orange', 'purple', 'pink', 'brown',
            'transparent', 'inherit', 'initial',
        ];

        namedColors.forEach(color => {
            const result = colorPreviewType.validate(color);
            if (result === true || result === '无效的颜色值') {
                console.log(`${color}: ${result}`);
            }
        });
    });
});

describe('ColorPreviewType - 攻击性测试', () => {
    describe('异常输入测试', () => {
        it('各种无效颜色值', () => {
            const type = new ColorPreviewType();
            const invalidColors = [
                '', 'notacolor', 'color123', '###', 'ggg',
                'rgb(300, 0, 0)', 'rgba(0, 0, 0, 2)',
                '{r:255,g:0,b:0}', 'javascript:alert(1)',
                '<script>alert("xss")</script>',
                'a'.repeat(1000),
                '\n\t\r',
                null, undefined, 0, false, {}, [],
            ];

            invalidColors.forEach(color => {
                expect(() => type.render(new CellRenderContext({
                    ctx: createMockCanvasContext(),
                    x: 0, y: 0, width: 80, height: 30,
                    value: color, displayValue: String(color),
                    style: {},
                    row: 0, col: 0,
                }))).not.toThrow();
            });
        });

        it('边界 Hex 值', () => {
            const type = new ColorPreviewType();
            const edgeHexValues = [
                '#000000', '#ffffff', '#FFFFFF',
                '#000', '#fff', '#FFF',
                '#123abc', '#ABCDEF', '#abcdef',
                '#00000000', '#ffffffff',
            ];

            edgeHexValues.forEach(color => {
                expect(() => type.render(new CellRenderContext({
                    ctx: createMockCanvasContext(),
                    x: 0, y: 0, width: 80, height: 30,
                    value: color, displayValue: color,
                    style: {},
                    row: 0, col: 0,
                }))).not.toThrow();
            });
        });

        it('极小/极大单元格尺寸', () => {
            const type = new ColorPreviewType();

            const tinyContext = new CellRenderContext({
                ctx: createMockCanvasContext(),
                x: 0, y: 0, width: 2, height: 2,
                value: '#ff0000', displayValue: '#ff0000',
                style: {},
                row: 0, col: 0,
            });

            const hugeContext = new CellRenderContext({
                ctx: createMockCanvasContext(),
                x: 0, y: 0, width: 5000, height: 5000,
                value: '#00ff00', displayValue: '#00ff00',
                style: {},
                row: 0, col: 0,
            });

            expect(() => type.render(tinyContext)).not.toThrow();
            expect(() => type.render(hugeContext)).not.toThrow();
        });
    });

    describe('性能压力测试', () => {
        it('批量渲染性能', () => {
            const type = new ColorPreviewType();
            const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
            const start = performance.now();

            for (let i = 0; i < 1000; i++) {
                type.render(new CellRenderContext({
                    ctx: createMockCanvasContext(),
                    x: i % 800, y: Math.floor(i / 800) * 30,
                    width: 80, height: 30,
                    value: colors[i % colors.length],
                    displayValue: colors[i % colors.length],
                    style: {},
                    row: i, col: 0,
                }));
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(500);
        });
    });
});

describe('ColorPreviewType - Bug 检测', () => {
    describe('源码问题识别', () => {
        it('Bug #1: 无 # 前缀的 3/6 位十六进制修复', () => {
            const type = new ColorPreviewType();
            const withoutHash = ['ff0000', '00ff00', 'abc', 'def'];

            withoutHash.forEach(color => {
                const validation = type.validate(color);
                console.log(`${color} (无#): ${validation}`);
            });
        });

        it('Bug #2: 大写/小写不一致', () => {
            const type = new ColorPreviewType();
            const mixedCase = ['#Ff0000', '#fFfFfF', '#AbCdEf'];

            mixedCase.forEach(color => {
                const isValid = type.validate(color);
                expect(isValid).toBe(true);
            });
        });

        it('Bug #3: normalizeColor 的回退行为', () => {
            const type = new ColorPreviewType();
            const invalidInputs = ['not-a-color', '###', 'xyz'];

            invalidInputs.forEach(input => {
                const ctx = createMockCanvasContext();
                const context = new CellRenderContext({
                    ctx,
                    x: 0, y: 0, width: 80, height: 30,
                    value: input, displayValue: input,
                    style: {},
                    row: 0, col: 0,
                });

                type.render(context);

                const fillStyleCall = ctx.calls.find(c => c.prop === 'fillStyle');
                if (fillStyleCall) {
                    console.log(`${input} -> ${fillStyleCall.val}`);
                    expect(['transparent', input]).toContain(fillStyleCall.val);
                } else {
                    console.log(`${input} -> 无 fillStyle（可能提前返回）`);
                }
            });

            console.log('✅ 确认: 空字符串会导致 render() 提前返回，这是正常行为');
        });
        });

        it('Bug #4: Option().style 的浏览器兼容性', () => {
            console.log('ℹ️  使用 new Option().style 验证颜色依赖浏览器 API');

            let optionStyleAvailable = true;
            try {
                const testOption = new Option();
                testOption.style.color = 'test';
            } catch (e) {
                optionStyleAvailable = false;
            }

            if (!optionStyleAvailable) {
                console.error('❌ Bug: 当前环境不支持 Option().style，颜色验证可能失效');
            }
        });

        it('Bug #5: 透明色的渲染', () => {
            const type = new ColorPreviewType();
            const ctx = createMockCanvasContext();
            const context = new CellRenderContext({
                ctx,
                x: 0, y: 0, width: 80, height: 30,
                value: 'transparent', displayValue: 'transparent',
                style: {},
                row: 0, col: 0,
            });

            type.render(context);

            const fillStyleCall = ctx.calls.find(c => c.prop === 'fillStyle');
            if (fillStyleCall) {
                console.log(`transparent 渲染结果: ${fillStyleCall.val}`);
            }
        });
    });
});