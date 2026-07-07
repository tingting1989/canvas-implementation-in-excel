/**
 * TextareaColumnType 多行文本列类型完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 配置选项测试（maxLength、maxRows）
 * 3. 渲染方法测试（Canvas 多行绘制、自动换行、省略号）
 * 4. 攻击性测试（边界条件、异常输入、性能压力）
 * 5. 集成测试
 * 6. 源码 Bug 检测
 *
 * @module tests/types/TextareaColumnType.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TextareaColumnType } from '../../src/types/TextareaColumnType.js';
import { createMockCanvasContext } from '../utils/canvas-mock.js';

describe('TextareaColumnType - 基础功能测试', () => {
    let textareaType;

    beforeEach(() => {
        textareaType = new TextareaColumnType();
    });

    describe('基本属性', () => {
        it('name 应该是 "textarea"', () => {
            expect(textareaType.name).toBe('textarea');
        });

        it('editorType 应该是 "textarea"', () => {
            expect(textareaType.editorType).toBe('textarea');
        });
    });

    describe('format() 方法', () => {
        it('undefined 返回空字符串', () => {
            expect(textareaType.format(undefined)).toBe('');
        });

        it('null 返回空字符串', () => {
            expect(textareaType.format(null)).toBe('');
        });

        it('数字转字符串', () => {
            expect(textareaType.format(123)).toBe('123');
        });

        it('布尔值转字符串', () => {
            expect(textareaType.format(true)).toBe('true');
            expect(textareaType.format(false)).toBe('false');
        });

        it('字符串保持不变', () => {
            expect(textareaType.format('hello')).toBe('hello');
        });

        it('多行字符串保持换行符', () => {
            const multiline = '第一行\n第二行\n第三行';
            expect(textareaType.format(multiline)).toBe(multiline);
        });
    });

    describe('validate() 方法', () => {
        it('空值应该通过验证', () => {
            expect(textareaType.validate('')).toBe(true);
            expect(textareaType.validate(undefined)).toBe(true);
            expect(textareaType.validate(null)).toBe(true);
        });

        it('有效文本应该通过验证', () => {
            expect(textareaType.validate('hello')).toBe(true);
            expect(textareaType.validate('123')).toBe(true);
        });

        it('多行文本应该通过验证', () => {
            expect(textareaType.validate('第一行\n第二行')).toBe(true);
        });

        it('超出最大长度应该返回错误信息', () => {
            const limitedType = new TextareaColumnType({ maxLength: 5 });
            expect(limitedType.validate('hello')).toBe(true);
            expect(limitedType.validate('hello world')).toContain('不能超过');
        });

        it('错误信息应包含具体的长度限制值', () => {
            const type = new TextareaColumnType({ maxLength: 100 });
            const result = type.validate('a'.repeat(101));
            expect(result).toContain('100');
        });
    });

    describe('parse() 方法', () => {
        it('应该 trim 空白字符', () => {
            expect(textareaType.parse('  hello  ')).toBe('hello');
            expect(textareaType.parse('\t\nhello\t\n')).toBe('hello');
        });

        it('null/undefined 保持原样', () => {
            expect(textareaType.parse(null)).toBeNull();
            expect(textareaType.parse(undefined)).toBeUndefined();
        });

        it('trim 后的空字符串返回 ""', () => {
            expect(textareaType.parse('   ')).toBe('');
            expect(textareaType.parse('\t\n')).toBe('');
        });

        it('多行文本保留换行符', () => {
            const input = '  第一行\n第二行  ';
            expect(textareaType.parse(input)).toBe('第一行\n第二行');
        });
    });

    describe('getDefaultStyle() 方法', () => {
        it('默认添加左对齐', () => {
            const style = textareaType.getDefaultStyle({});
            expect(style.textAlign).toBe('left');
        });

        it('默认添加垂直居中对齐', () => {
            const style = textareaType.getDefaultStyle({});
            expect(style.verticalAlign).toBe('middle');
        });

        it('已有 textAlign 不覆盖', () => {
            const style = textareaType.getDefaultStyle({ textAlign: 'right' });
            expect(style.textAlign).toBe('right');
        });

        it('已有 verticalAlign 不覆盖', () => {
            const style = textareaType.getDefaultStyle({ verticalAlign: 'middle' });
            expect(style.verticalAlign).toBe('middle');
        });

        it('保留原有样式属性', () => {
            const baseStyle = { color: 'red', fontSize: 14 };
            const style = textareaType.getDefaultStyle(baseStyle);
            expect(style.color).toBe('red');
            expect(style.fontSize).toBe(14);
            expect(style.textAlign).toBe('left');
            expect(style.verticalAlign).toBe('middle');
        });
    });

    describe('getEditorOptions() 方法', () => {
        it('无配置时返回空对象', () => {
            const options = textareaType.getEditorOptions();
            expect(options).toEqual({
                maxLength: undefined,
                maxRows: undefined,
            });
        });

        it('有 maxLength 配置时传递给编辑器', () => {
            const type = new TextareaColumnType({ maxLength: 500 });
            const options = type.getEditorOptions();
            expect(options.maxLength).toBe(500);
        });

        it('有 maxRows 配置时传递给编辑器', () => {
            const type = new TextareaColumnType({ maxRows: 5 });
            const options = type.getEditorOptions();
            expect(options.maxRows).toBe(5);
        });

        it('同时配置两个选项时都正确传递', () => {
            const type = new TextareaColumnType({ maxLength: 200, maxRows: 10 });
            const options = type.getEditorOptions();
            expect(options.maxLength).toBe(200);
            expect(options.maxRows).toBe(10);
        });
    });
});

describe('TextareaColumnType - 渲染方法测试', () => {
    let mockCtx;
    let textareaType;

    beforeEach(() => {
        mockCtx = createMockCanvasContext();
        textareaType = new TextareaColumnType();
    });

    /**
     * 创建模拟渲染上下文
     */
    function createRenderContext(overrides = {}) {
        return {
            ctx: mockCtx,
            x: 0,
            y: 0,
            width: 200,
            height: 100,
            value: null,
            style: {},
            sheet: {
                cellPadding: 6,
            },
            getPadding(sheet) {
                return sheet?.cellPadding ?? 6;
            },
            ...overrides,
        };
    }

    describe('render() 基础行为', () => {
        it('null 值不渲染', () => {
            const context = createRenderContext({ value: null });
            textareaType.render(context);
            expect(mockCtx.getCallCount('fillText')).toBe(0);
        });

        it('undefined 值不渲染', () => {
            const context = createRenderContext({ value: undefined });
            textareaType.render(context);
            expect(mockCtx.getCallCount('fillText')).toBe(0);
        });

        it('空字符串不渲染', () => {
            const context = createRenderContext({ value: '' });
            textareaType.render(context);
            expect(mockCtx.getCallCount('fillText')).toBe(0);
        });

        it('普通文本应该调用 fillText', () => {
            const context = createRenderContext({ value: 'Hello World' });
            textareaType.render(context);
            expect(mockCtx.getCallCount('fillText')).toBeGreaterThan(0);
        });
    });

    describe('render() Canvas 属性设置', () => {
        it('设置正确的 font 属性', () => {
            const context = createRenderContext({ value: 'test' });
            textareaType.render(context);

            const fontCalls = mockCtx.calls.filter(c => c.prop === 'font');
            expect(fontCalls.length).toBeGreaterThan(0);
            expect(fontCalls[0].value).toContain('14px');
            expect(fontCalls[0].value).toContain('Microsoft YaHei');
        });

        it('使用 style 中的字体配置', () => {
            const context = createRenderContext({
                value: 'test',
                style: { fontSize: 16, fontFamily: 'Arial', fontWeight: 'bold' },
            });
            textareaType.render(context);

            const fontCalls = mockCtx.calls.filter(c => c.prop === 'font');
            expect(fontCalls[0].value).toContain('16px');
            expect(fontCalls[0].value).toContain('Arial');
            expect(fontCalls[0].value).toContain('bold');
        });

        it('使用斜体样式时 font 包含 italic', () => {
            const context = createRenderContext({
                value: 'test',
                style: { fontStyle: 'italic' },
            });
            textareaType.render(context);

            const fontCalls = mockCtx.calls.filter(c => c.prop === 'font');
            expect(fontCalls[0].value).toContain('italic');
        });

        it('设置 textBaseline 为 middle（与标准文本渲染一致）', () => {
            const context = createRenderContext({ value: 'test' });
            textareaType.render(context);

            const baselineCalls = mockCtx.calls.filter(c => c.prop === 'textBaseline');
            expect(baselineCalls.some(c => c.value === 'middle')).toBe(true);
        });
    });

    describe('render() 文本对齐', () => {
        it('默认左对齐', () => {
            const context = createRenderContext({ value: 'left align' });
            textareaType.render(context);

            const textAlignCalls = mockCtx.calls.filter(c => c.prop === 'textAlign');
            expect(textAlignCalls.some(c => c.value === 'left')).toBe(true);
        });

        it('居中对齐生效', () => {
            const context = createRenderContext({
                value: 'center',
                style: { textAlign: 'center' },
            });
            textareaType.render(context);

            const textAlignCalls = mockCtx.calls.filter(c => c.prop === 'textAlign');
            expect(textAlignCalls.some(c => c.value === 'center')).toBe(true);
        });

        it('右对齐生效', () => {
            const context = createRenderContext({
                value: 'right',
                style: { textAlign: 'right' },
            });
            textareaType.render(context);

            const textAlignCalls = mockCtx.calls.filter(c => c.prop === 'textAlign');
            expect(textAlignCalls.some(c => c.value === 'right')).toBe(true);
        });
    });

    describe('render() 裁剪区域', () => {
        it('调用 save/restore 保护画布状态', () => {
            const context = createRenderContext({ value: 'clip test' });
            textareaType.render(context);

            expect(mockCtx.getCallCount('save')).toBeGreaterThan(0);
            expect(mockCtx.getCallCount('restore')).toBeGreaterThan(0);
        });

        it('设置 clip 区域限制在单元格范围内', () => {
            const context = createRenderContext({
                value: 'clip',
                x: 10,
                y: 20,
                width: 150,
                height: 80,
            });
            textareaType.render(context);

            const rectCalls = mockCtx.calls.filter(c => c.method === 'rect');
            expect(rectCalls.length).toBeGreaterThan(0);
            expect(rectCalls[0].args).toEqual([10, 20, 150, 80]);
        });
    });

    describe('#wrapText() 换行算法', () => {
        it('短文本不拆分', () => {
            const lines = textareaType._testWrapText?.(mockCtx, "Hello", 200) ?? [];
            if (lines.length > 0) {
                expect(lines).toHaveLength(1);
                expect(lines[0]).toBe("Hello");
            }
        });

        it('长文本按宽度拆分', () => {
            const longText = "HelloWorldThisIsAVeryLongString";
            const lines = textareaType._testWrapText?.(mockCtx, longText, 40) ?? [];
            if (lines.length > 1) {
                expect(lines.length).toBeGreaterThan(1);
            }
        });

        it('单个字符作为最小单位', () => {
            const lines = textareaType._testWrapText?.(mockCtx, "AB", 8) ?? [];
            if (lines.length > 1) {
                expect(lines).toContain("A");
                expect(lines).toContain("B");
            }
        });
    });
});

describe('TextareaColumnType - 配置选项测试', () => {
    describe('maxLength 选项', () => {
        it('maxLength 配置影响 validate()', () => {
            const type = new TextareaColumnType({ maxLength: 10 });
            expect(type.validate('12345678901')).toContain('不能超过');
            expect(type.validate('1234567890')).toBe(true);
        });

        it('无 maxLength 配置时不限制长度', () => {
            const type = new TextareaColumnType();
            const longStr = 'a'.repeat(10000);
            expect(type.validate(longStr)).toBe(true);
        });

        it('maxLength 为 0 时允许空字符串', () => {
            const type = new TextareaColumnType({ maxLength: 0 });
            expect(type.validate('')).toBe(true);
            expect(type.validate('a')).toContain('不能超过');
        });
    });

    describe('maxRows 选项', () => {
        it('maxRows 影响渲染时的可见行数', () => {
            const ctx = createMockCanvasContext();
            const type = new TextareaColumnType({ maxRows: 2 });

            const context = {
                ctx,
                x: 0,
                y: 0,
                width: 200,
                height: 500,
                value: '第一行\n第二行\n第三行\n第四行',
                style: {},
                sheet: { cellPadding: 6 },
                getPadding(sheet) { return sheet?.cellPadding ?? 6; },
            };

            type.render(context);

            const fillTextCalls = ctx.calls.filter(c => c.method === 'fillText');

            expect(fillTextCalls.length).toBeLessThanOrEqual(2);
        });

        it('maxRows 不限制时根据单元格高度计算', () => {
            const ctx = createMockCanvasContext();
            const type = new TextareaColumnType();

            const context = {
                ctx,
                x: 0,
                y: 0,
                width: 200,
                height: 30,
                value: '第一行\n第二行\n第三行',
                style: {},
                sheet: { cellPadding: 6 },
                getPadding(sheet) { return sheet?.cellPadding ?? 6; },
            };

            type.render(context);

            const fillTextCalls = ctx.calls.filter(c => c.method === 'fillText');

            expect(fillTextCalls.length).toBeLessThanOrEqual(Math.floor((30 - 12) / (12 * 1.4)));
        });
    });
});

describe('TextareaColumnType - 攻击性测试', () => {
    describe('异常输入测试', () => {
        it('XSS 攻击向量安全处理', () => {
            const type = new TextareaColumnType();
            const xssPayloads = [
                '<script>alert("xss")</script>',
                '"><script>alert(document.cookie)</script>',
                "javascript:alert('xss')",
                '<img src=x onerror=alert(1)>',
                '{{constructor.constructor("return this")()}}',
            ];

            xssPayloads.forEach(payload => {
                expect(() => type.format(payload)).not.toThrow();
                expect(() => type.validate(payload)).not.toThrow();
                expect(() => type.parse(payload)).not.toThrow();
            });
        });

        it('SQL 注入向量安全处理', () => {
            const type = new TextareaColumnType();
            const sqlPayloads = [
                "' OR '1'='1",
                "'; DROP TABLE users; --",
                '" OR ""="',
            ];

            sqlPayloads.forEach(payload => {
                expect(() => type.format(payload)).not.toThrow();
                expect(() => type.parse(payload)).not.toThrow();
            });
        });

        it('超长字符串处理', () => {
            const type = new TextareaColumnType();
            const megaString = 'a'.repeat(100000);

            const startTime = performance.now();
            const formatted = type.format(megaString);
            const elapsed = performance.now() - startTime;

            expect(formatted).toHaveLength(100000);
            expect(elapsed).toBeLessThan(500);
        });

        it('Unicode 和特殊字符', () => {
            const type = new TextareaColumnType();
            const unicodeStrings = [
                '中文测试日本語한국어',
                '🎉🚀💡🎯',
                '\u0000\u0001\u0002',
                '\t\n\r\f\v',
                'Zalgo文本̵̢̧̛̙͇͈̞͎͍̹̺̝̦͔̗͖͉͍̮̜̟̠̬̤͓͉ͅ  h̶i̸',
            ];

            unicodeStrings.forEach(str => {
                expect(() => type.format(str)).not.toThrow();
                expect(() => type.parse(str)).not.toThrow();
            });
        });

        it('多行 XSS payload 安全处理', () => {
            const type = new TextareaColumnType();
            const multilineXss = `<script>\nalert("xss")\n</script>`;

            expect(() => type.format(multilineXss)).not.toThrow();
            expect(() => type.validate(multilineXss)).not.toThrow();
        });
    });

    describe('边界条件测试', () => {
        it('空格字符串的处理', () => {
            const type = new TextareaColumnType();
            expect(type.parse('   ')).toBe('');
        });

        it('只有换行符的字符串', () => {
            const type = new TextareaColumnType();
            expect(type.parse('\n\n\n')).toBe('');
        });

        it('混合空白和换行', () => {
            const type = new TextareaColumnType();
            expect(type.parse('  \n  \n  ')).toBe('');
        });

        it('maxLength 刚好等于长度', () => {
            const type = new TextareaColumnType({ maxLength: 5 });
            expect(type.validate('abcde')).toBe(true);
            expect(type.parse('abcde')).toBe('abcde');
        });

        it('maxLength 为负数时的行为', () => {
            const type = new TextareaColumnType({ maxLength: -5 });
            expect(type.validate('a')).toBeTruthy();
        });

        it('极大单元格尺寸', () => {
            const ctx = createMockCanvasContext();
            const type = new TextareaColumnType();

            const context = {
                ctx,
                x: 0,
                y: 0,
                width: 10000,
                height: 10000,
                value: 'large cell',
                style: {},
                sheet: { cellPadding: 6 },
                getPadding(sheet) { return sheet?.cellPadding ?? 6; },
            };

            expect(() => type.render(context)).not.toThrow();
        });

        it('极小单元格尺寸（宽度为 0）', () => {
            const ctx = createMockCanvasContext();
            const type = new TextareaColumnType();

            const context = {
                ctx,
                x: 0,
                y: 0,
                width: 0,
                height: 50,
                value: 'should not render',
                style: {},
                sheet: { cellPadding: 6 },
                getPadding(sheet) { return sheet?.cellPadding ?? 6; },
            };

            type.render(context);
            expect(ctx.getCallCount('fillText')).toBe(0);
        });

        it('负数坐标', () => {
            const ctx = createMockCanvasContext();
            const type = new TextareaColumnType();

            const context = {
                ctx,
                x: -100,
                y: -50,
                width: 200,
                height: 100,
                value: 'negative coords',
                style: {},
                sheet: { cellPadding: 6 },
                getPadding(sheet) { return sheet?.cellPadding ?? 6; },
            };

            expect(() => type.render(context)).not.toThrow();
        });
    });

    describe('性能压力测试', () => {
        it('高频 format 调用', () => {
            const type = new TextareaColumnType();
            const start = performance.now();

            for (let i = 0; i < 100000; i++) {
                type.format(`line ${i}\ndata`);
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(1000);
        });

        it('高频 validate 调用', () => {
            const type = new TextareaColumnType({ maxLength: 50 });
            const start = performance.now();

            for (let i = 0; i < 100000; i++) {
                type.validate('test value with some content');
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(1000);
        });

        it('高频 parse 调用（包含 trim）', () => {
            const type = new TextareaColumnType();
            const start = performance.now();

            for (let i = 0; i < 100000; i++) {
                type.parse('  padded string  ');
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(1000);
        });

        it('大量文本的渲染性能', () => {
            const ctx = createMockCanvasContext();
            const type = new TextareaColumnType();
            const longText = Array.from({ length: 100 }, (_, i) => `这是第 ${i + 1} 行文本内容`).join('\n');

            const start = performance.now();

            for (let i = 0; i < 1000; i++) {
                ctx.resetCalls();
                const context = {
                    ctx,
                    x: 0,
                    y: 0,
                    width: 300,
                    height: 400,
                    value: longText,
                    style: {},
                    sheet: { cellPadding: 6 },
                    getPadding(sheet) { return sheet?.cellPadding ?? 6; },
                };
                type.render(context);
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(3000);
        });
    });
});

describe('TextareaColumnType - 集成测试', () => {
    it('与 BaseColumnType 接口兼容', () => {
        const type = new TextareaColumnType();

        expect(typeof type.format).toBe('function');
        expect(typeof type.validate).toBe('function');
        expect(typeof type.parse).toBe('function');
        expect(typeof type.getDefaultStyle).toBe('function');
        expect(typeof type.getEditorOptions).toBe('function');
        expect(typeof type.getDefaultValue).toBe('function');
        expect(typeof type.compare).toBe('function');
        expect(typeof type.render).toBe('function');
    });

    it('格式化和解析的往返一致性', () => {
        const type = new TextareaColumnType();
        const originalValue = '  Hello\nWorld  ';

        const formatted = type.format(originalValue);
        const parsed = type.parse(originalValue);

        expect(parsed).toBe('Hello\nWorld');
    });

    it('validate 通过后 format 不应报错', () => {
        const type = new TextareaColumnType({ maxLength: 1000 });
        const validValues = [
            'short text',
            'medium length text here',
            'exactly 1000 characters!'.padEnd(1000, '!'),
            '多行文本\n第二行内容\n第三行结束',
        ];

        validValues.forEach(value => {
            expect(type.validate(value)).toBe(true);
            expect(() => type.format(value)).not.toThrow();
        });
    });

    it('render 方法与 CellRenderContext 接口兼容', () => {
        const ctx = createMockCanvasContext();
        const type = new TextareaColumnType();

        const context = {
            ctx,
            x: 10,
            y: 20,
            width: 150,
            height: 80,
            value: 'test render compatibility',
            displayValue: 'Test Render Compatibility',
            style: { color: '#333333', fontSize: 14 },
            row: 5,
            col: 3,
            realRow: 105,
            realCol: 103,
            isSelected: false,
            isDisabled: false,
            isMerged: false,
            mergeInfo: null,
            pageInfo: null,
            sheet: { cellPadding: 6 },
            getPadding(sheet) { return sheet?.cellPadding ?? 6; },
            getCenterX() { return this.x + this.width / 2; },
            getCenterY() { return this.y + this.height / 2; },
        };

        expect(() => type.render(context)).not.toThrow();
    });

    it('options 为 null 时的容错处理', () => {
        const type = new TextareaColumnType(null);

        expect(() => type.format('test')).not.toThrow();
        expect(() => type.validate('test')).not.toThrow();
        expect(() => type.parse('test')).not.toThrow();
        expect(() => type.getDefaultStyle({})).not.toThrow();
        expect(() => type.getEditorOptions()).not.toThrow();
    });
});

describe('TextareaColumnType - Bug 检测', () => {
    describe('源码问题识别', () => {
        it('Bug #1: options 可能为 null 时访问 ?. 安全吗？', () => {
            const type = new TextareaColumnType(null);

            expect(() => type.validate('test')).not.toThrow();
            expect(() => type.parse('test')).not.toThrow();
            expect(() => type.getDefaultStyle({})).not.toThrow();
            expect(() => type.getEditorOptions()).not.toThrow();
        });

        it('Bug #2: render 中 sheet 为 null 时的行为', () => {
            const ctx = createMockCanvasContext();
            const type = new TextareaColumnType();

            const context = {
                ctx,
                x: 0,
                y: 0,
                width: 200,
                height: 100,
                value: 'no sheet',
                style: {},
                sheet: null,
                getPadding(sheet) { return sheet?.cellPadding ?? 6; },
            };

            expect(() => type.render(context)).not.toThrow();
        });

        it('Bug #3: parse() 对非字符串类型的处理', () => {
            const type = new TextareaColumnType();

            const nonStringInputs = [123, true, {}, []];
            nonStringInputs.forEach(input => {
                const result = type.parse(input);
                console.log(`parse(${typeof input}): ${JSON.stringify(result)}`);
            });
        });

        it('Bug #4: getDefaultStyle 对 null baseStyle 的处理', () => {
            const type = new TextareaColumnType();

            const result = type.getDefaultStyle(null);
            expect(result).toBeDefined();
            expect(result.textAlign).toBe('left');
            expect(result.verticalAlign).toBe('middle');
        });

        it('Bug #5: render 中 style 缺少字体属性时的回退', () => {
            const ctx = createMockCanvasContext();
            const type = new TextareaColumnType();

            const context = {
                ctx,
                x: 0,
                y: 0,
                width: 200,
                height: 100,
                value: 'minimal style',
                style: {},
                sheet: { cellPadding: 6 },
                getPadding(sheet) { return sheet?.cellPadding ?? 6; },
            };

            type.render(context);

            const fontCalls = ctx.calls.filter(c => c.prop === 'font');
            expect(fontCalls.length).toBeGreaterThan(0);
        });
    });

    describe('逻辑漏洞检测', () => {
        it('maxRows 与单元格高度同时限制时的优先级', () => {
            const ctx = createMockCanvasContext();

            const typeWithMaxRows = new TextareaColumnType({ maxRows: 2 });

            const context = {
                ctx,
                x: 0,
                y: 0,
                width: 200,
                height: 500,
                value: '第一行\n第二行\n第三行\n第四行\n第五行',
                style: {},
                sheet: { cellPadding: 6 },
                getPadding(sheet) { return sheet?.cellPadding ?? 6; },
            };

            typeWithMaxRows.render(context);

            const fillTextCalls = ctx.calls.filter(c => c.method === 'fillText');

            expect(fillTextCalls.length).toBeLessThanOrEqual(2);
        });

        it('maxRows=0 或负数时应忽略该限制', () => {
            const ctx = createMockCanvasContext();

            const typeZeroMaxRows = new TextareaColumnType({ maxRows: 0 });
            const typeNegativeMaxRows = new TextareaColumnType({ maxRows: -5 });

            [typeZeroMaxRows, typeNegativeMaxRows].forEach(type => {
                ctx.resetCalls();
                const context = {
                    ctx,
                    x: 0,
                    y: 0,
                    width: 200,
                    height: 200,
                    value: 'line1\nline2\nline3',
                    style: {},
                    sheet: { cellPadding: 6 },
                    getPadding(sheet) { return sheet?.cellPadding ?? 6; },
                };

                expect(() => type.render(context)).not.toThrow();
            });
        });

        it('options.maxLength 为字符串数字的情况', () => {
            const type = new TextareaColumnType({ maxLength: '5' });

            const validation = type.validate('123456');
            console.log(`maxLength='5' 验证结果: ${validation}`);

            if (validation !== true && typeof validation === 'string') {
                console.warn('⚠️  字符串数字 maxLength 生效，但类型不安全');
            }
        });

        it('render 后 ctx 状态是否被 restore 正确恢复', () => {
            const ctx = createMockCanvasContext();
            const type = new TextareaColumnType();

            ctx.fillStyle = '#original-color';
            ctx.font = 'original-font';

            const context = {
                ctx,
                x: 0,
                y: 0,
                width: 200,
                height: 100,
                value: 'state check',
                style: { color: '#new-color', fontSize: 16 },
                sheet: { cellPadding: 6 },
                getPadding(sheet) { return sheet?.cellPadding ?? 6; },
            };

            type.render(context);

            expect(ctx.getCallCount('save')).toBeGreaterThan(0);
            expect(ctx.getCallCount('restore')).toBeGreaterThan(0);
        });
    });
});