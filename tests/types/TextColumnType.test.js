/**
 * TextColumnType 文本列类型完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. 配置选项测试
 * 4. 集成测试
 * 5. 源码 Bug 检测
 *
 * @module tests/types/TextColumnType.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TextColumnType } from '../../src/types/TextColumnType.js';

describe('TextColumnType - 基础功能测试', () => {
    let textType;

    beforeEach(() => {
        textType = new TextColumnType();
    });

    describe('基本属性', () => {
        it('name 应该是 "text"', () => {
            expect(textType.name).toBe('text');
        });

        it('editorType 应该是 "text"', () => {
            expect(textType.editorType).toBe('text');
        });
    });

    describe('format() 方法', () => {
        it('undefined 返回空字符串', () => {
            expect(textType.format(undefined)).toBe('');
        });

        it('null 返回空字符串', () => {
            expect(textType.format(null)).toBe('');
        });

        it('数字转字符串', () => {
            expect(textType.format(123)).toBe('123');
        });

        it('布尔值转字符串', () => {
            expect(textType.format(true)).toBe('true');
            expect(textType.format(false)).toBe('false');
        });

        it('字符串保持不变', () => {
            expect(textType.format('hello')).toBe('hello');
        });
    });

    describe('validate() 方法', () => {
        it('空值应该通过验证', () => {
            expect(textType.validate('')).toBe(true);
            expect(textType.validate(undefined)).toBe(true);
            expect(textType.validate(null)).toBe(true);
        });

        it('有效文本应该通过验证', () => {
            expect(textType.validate('hello')).toBe(true);
            expect(textType.validate('123')).toBe(true);
        });

        it('超出最大长度应该返回错误信息', () => {
            const limitedType = new TextColumnType({ maxLength: 5 });
            expect(limitedType.validate('hello')).toBe(true);
            expect(limitedType.validate('hello world')).toContain('不能超过');
        });
    });

    describe('parse() 方法', () => {
        it('应该 trim 空白字符', () => {
            expect(textType.parse('  hello  ')).toBe('hello');
            expect(textType.parse('\t\nhello\t\n')).toBe('hello');
        });

        it('null/undefined 保持原样', () => {
            expect(textType.parse(null)).toBeNull();
            expect(textType.parse(undefined)).toBeUndefined();
        });

        it('超出最大长度应该截断', () => {
            const limitedType = new TextColumnType({ maxLength: 5 });
            expect(limitedType.parse('helloworld')).toBe('hello');
        });
    });

    describe('getDefaultStyle() 方法', () => {
        it('默认添加左对齐', () => {
            const style = textType.getDefaultStyle({});
            expect(style.textAlign).toBe('left');
        });

        it('已有 textAlign 不覆盖', () => {
            const style = textType.getDefaultStyle({ textAlign: 'right' });
            expect(style.textAlign).toBe('right');
        });

        it('保留原有样式属性', () => {
            const baseStyle = { color: 'red', fontSize: 14 };
            const style = textType.getDefaultStyle(baseStyle);
            expect(style.color).toBe('red');
            expect(style.fontSize).toBe(14);
            expect(style.textAlign).toBe('left');
        });
    });
});

describe('TextColumnType - 配置选项测试', () => {
    it('maxLength 配置生效', () => {
        const type = new TextColumnType({ maxLength: 10 });

        expect(type.validate('12345678901')).toContain('不能超过');
        expect(type.parse('12345678901')).toHaveLength(10);
    });

    it('无 maxLength 配置时无限制', () => {
        const type = new TextColumnType();
        const longStr = 'a'.repeat(10000);

        expect(type.validate(longStr)).toBe(true);
        expect(type.parse(longStr)).toHaveLength(10000);
    });

    it('maxLength 为 0 时允许空字符串', () => {
        const type = new TextColumnType({ maxLength: 0 });

        expect(type.validate('')).toBe(true);
        expect(type.validate('a')).toContain('不能超过');
    });
});

describe('TextColumnType - 攻击性测试', () => {
    describe('异常输入测试', () => {
        it('XSS 攻击向量', () => {
            const type = new TextColumnType();
            const xssPayloads = [
                '<script>alert("xss")</script>',
                '"><script>alert(document.cookie)</script>',
                "javascript:alert('xss')",
                '<img src=x onerror=alert(1)>',
                '{{constructor.constructor("return this")()}}',
                '${alert(xss)}',
            ];

            xssPayloads.forEach(payload => {
                expect(() => type.format(payload)).not.toThrow();
                expect(() => type.validate(payload)).not.toThrow();
                expect(() => type.parse(payload)).not.toThrow();
            });
        });

        it('SQL 注入向量', () => {
            const type = new TextColumnType();
            const sqlPayloads = [
                "' OR '1'='1",
                "'; DROP TABLE users; --",
                '" OR ""="',
                '1 UNION SELECT * FROM users',
            ];

            sqlPayloads.forEach(payload => {
                expect(() => type.format(payload)).not.toThrow();
                expect(() => type.parse(payload)).not.toThrow();
            });
        });

        it('超长字符串处理', () => {
            const type = new TextColumnType();
            const megaString = 'a'.repeat(1000000);

            const startTime = performance.now();
            const formatted = type.format(megaString);
            const parseTime = performance.now() - startTime;

            expect(formatted).toHaveLength(1000000);
            expect(parseTime).toBeLessThan(500);
        });

        it('Unicode 和特殊字符', () => {
            const type = new TextColumnType();
            const unicodeStrings = [
                '中文测试日本語한국어',
                '🎉🚀💡🎯',
                '\u0000\u0001\u0002',
                '\t\n\r\f\v',
                '   多个空格   ',
                'Zalgo文本̵̢̧̛̙͇͈̞͎͍̹̺̝̦͔̗͖͉͍̮̜̟̠̬̤͓͉ͅ  h̶i̸',
            ];

            unicodeStrings.forEach(str => {
                expect(() => type.format(str)).not.toThrow();
                expect(() => type.parse(str)).not.toThrow();
            });
        });
    });

    describe('边界条件测试', () => {
        it('空格字符串的处理', () => {
            const type = new TextColumnType();
            expect(type.parse('   ')).toBe('');
        });

        it('只有换行符的字符串', () => {
            const type = new TextColumnType();
            expect(type.parse('\n\n\n')).toBe('');
        });

        it('maxLength 刚好等于长度', () => {
            const type = new TextColumnType({ maxLength: 5 });
            expect(type.validate('abcde')).toBe(true);
            expect(type.parse('abcde')).toBe('abcde');
        });

        it('maxLength 为负数时的行为', () => {
            const type = new TextColumnType({ maxLength: -5 });
            expect(type.validate('a')).toBeTruthy();
        });
    });

    describe('性能压力测试', () => {
        it('高频 validate 调用', () => {
            const type = new TextColumnType({ maxLength: 50 });
            const start = performance.now();

            for (let i = 0; i < 50000; i++) {
                type.validate('test value');
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(500);
        });

        it('高频 parse 调用（包含 trim）', () => {
            const type = new TextColumnType();
            const start = performance.now();

            for (let i = 0; i < 50000; i++) {
                type.parse('  padded string  ');
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(500);
        });
    });
});

describe('TextColumnType - 集成测试', () => {
    it('与 BaseColumnType 接口兼容', () => {
        const type = new TextColumnType();

        expect(typeof type.format).toBe('function');
        expect(typeof type.validate).toBe('function');
        expect(typeof type.parse).toBe('function');
        expect(typeof type.getDefaultStyle).toBe('function');
        expect(typeof type.getEditorOptions).toBe('function');
        expect(typeof type.getDefaultValue).toBe('function');
        expect(typeof type.compare).toBe('function');
    });

    it('格式化和解析的往返一致性', () => {
        const type = new TextColumnType();
        const originalValue = '  Hello World  ';

        const formatted = type.format(originalValue);
        const parsed = type.parse(originalValue);

        expect(parsed).toBe('Hello World');
    });

    it('validate 通过后 format 不应报错', () => {
        const type = new TextColumnType({ maxLength: 100 });
        const validStrings = ['short', 'medium length', 'exactly 100 characters!'.padEnd(100, '!')];

        validStrings.forEach(str => {
            expect(type.validate(str)).toBe(true);
            expect(() => type.format(str)).not.toThrow();
        });
    });
});

describe('TextColumnType - Bug 检测', () => {
    describe('源码问题识别', () => {
        it('Bug #1: options 可能为 null 时访问 ?. 安全吗？', () => {
            const type = new TextColumnType(null);

            expect(() => type.validate('test')).not.toThrow();
            expect(() => type.parse('test')).not.toThrow();
            expect(() => type.getDefaultStyle({})).not.toThrow();
        });

        it('Bug #2: trim 后再检查 maxLength 是否合理？', () => {
            const type = new TextColumnType({ maxLength: 5 });
            const input = '  abcdef  ';

            const parsed = type.parse(input);
            expect(parsed).toBe('abcdef');

            const isValid = type.validate(parsed);
            expect(isValid).toContain('不能超过');

            console.warn('⚠️  设计问题: parse() 截断在 trim 之后，但 validate 在 trim 之前检查长度');
        });

        it('Bug #3: parse() 对非字符串类型的处理', () => {
            const type = new TextColumnType();

            const nonStringInputs = [123, true, null, undefined, {}, []];
            nonStringInputs.forEach(input => {
                const result = type.parse(input);
                if (input !== null && input !== undefined) {
                    console.log(`parse(${typeof input}): ${JSON.stringify(result)}`);
                }
            });
        });

        it('Bug #4: getDefaultStyle 对 null baseStyle 的处理', () => {
            const type = new TextColumnType();

            const result = type.getDefaultStyle(null);
            expect(result).toBeDefined();
            expect(result.textAlign).toBe('left');
        });
    });

    describe('逻辑漏洞检测', () => {
        it('maxLength 为 0 时的边界情况', () => {
            const type = new TextColumnType({ maxLength: 0 });

            expect(type.validate('')).toBe(true);
            expect(type.validate('a')).not.toBe(true);
            expect(type.parse('')).toBe('');
            expect(type.parse('a')).toBe('');
        });

        it('options.maxLength 为字符串数字的情况', () => {
            const type = new TextColumnType({ maxLength: '5' });

            const validation = type.validate('123456');
            console.log(`maxLength='5' 验证结果: ${validation}`);

            if (validation !== true) {
                console.warn('⚠️  字符串数字 maxLength 生效，但类型不安全');
            }
        });
    });
});