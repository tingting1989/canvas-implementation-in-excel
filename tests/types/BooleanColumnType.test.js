/**
 * BooleanColumnType 布尔列类型完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. 自定义标签配置测试
 * 4. 集成测试
 * 5. 源码 Bug 检测
 *
 * @module tests/types/BooleanColumnType.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BooleanColumnType } from '../../src/types/BooleanColumnType.js';

describe('BooleanColumnType - 基础功能测试', () => {
    let boolType;

    beforeEach(() => {
        boolType = new BooleanColumnType();
    });

    describe('基本属性', () => {
        it('name 应该是 "boolean"', () => {
            expect(boolType.name).toBe('boolean');
        });

        it('editorType 应该是 "text"', () => {
            expect(boolType.editorType).toBe('text');
        });
    });

    describe('getDefaultStyle() 方法', () => {
        it('默认居中对齐', () => {
            const style = boolType.getDefaultStyle({});
            expect(style.textAlign).toBe('center');
        });
    });

    describe('format() 方法', () => {
        it('true 布尔值格式化', () => {
            expect(boolType.format(true)).toBe('TRUE');
        });

        it('false 布尔值格式化', () => {
            expect(boolType.format(false)).toBe('FALSE');
        });

        it('undefined/null 格式化', () => {
            expect(boolType.format(undefined)).toBe('');
            expect(boolType.format(null)).toBe('');
        });
    });

    describe('validate() 方法', () => {
        it('空值应该通过验证', () => {
            expect(boolType.validate('')).toBe(true);
            expect(boolType.validate(undefined)).toBe(true);
            expect(boolType.validate(null)).toBe(true);
        });

        it('有效布尔值应该通过验证', () => {
            expect(boolType.validate(true)).toBe(true);
            expect(boolType.validate(false)).toBe(true);
            expect(boolType.validate(1)).toBe(true);
            expect(boolType.validate(0)).toBe(true);
            expect(boolType.validate('true')).toBe(true);
            expect(boolType.validate('false')).toBe(true);
        });

        it('无效值应该验证失败', () => {
            expect(boolType.validate('maybe')).toBe(false);
            expect(boolType.validate(2)).toBe(false);
            expect(boolType.validate('yesno')).toBe(false);
        });
    });

    describe('parse() 方法', () => {
        it('解析 true 值', () => {
            expect(boolType.parse('true')).toBe(true);
            expect(boolType.parse('TRUE')).toBe(true);
            expect(boolType.parse('yes')).toBe(true);
            expect(boolType.parse('YES')).toBe(true);
            expect(boolType.parse('y')).toBe(true);
            expect(boolType.parse('Y')).toBe(true);
            expect(boolType.parse('1')).toBe(true);
            expect(boolType.parse('t')).toBe(true);
            expect(boolType.parse('T')).toBe(true);
            expect(boolType.parse('是')).toBe(true);
            expect(boolType.parse('真')).toBe(true);
        });

        it('解析 false 值', () => {
            expect(boolType.parse('false')).toBe(false);
            expect(boolType.parse('FALSE')).toBe(false);
            expect(boolType.parse('no')).toBe(false);
            expect(boolType.parse('NO')).toBe(false);
            expect(boolType.parse('n')).toBe(false);
            expect(boolType.parse('N')).toBe(false);
            expect(boolType.parse('0')).toBe(false);
            expect(boolType.parse('f')).toBe(false);
            expect(boolType.parse('F')).toBe(false);
            expect(boolType.parse('否')).toBe(false);
            expect(boolType.parse('假')).toBe(false);
        });

        it('无法识别的值原样返回', () => {
            expect(boolType.parse('maybe')).toBe('maybe');
            expect(boolType.parse('2')).toBe('2');
        });

        it('空值返回空字符串', () => {
            expect(boolType.parse('')).toBe('');
            expect(boolType.parse(null)).toBe('');
            expect(boolType.parse(undefined)).toBe('');
        });
    });

    describe('compare() 方法', () => {
        it('true > false', () => {
            expect(boolType.compare(true, false, 'asc')).toBeGreaterThan(0);
            expect(boolType.compare(false, true, 'asc')).toBeLessThan(0);
        });

        it('相同值比较为 0', () => {
            expect(boolType.compare(true, true, 'asc')).toBe(0);
            expect(boolType.compare(false, false, 'asc')).toBe(0);
        });

        it('无效值排在前面', () => {
            expect(boolType.compare('invalid', true, 'asc')).toBeLessThan(0);
            expect(boolType.compare('invalid', false, 'asc')).toBeLessThan(0);
        });
    });
});

describe('BooleanColumnType - 自定义标签配置测试', () => {
    it('自定义 labels 配置', () => {
        const type = new BooleanColumnType({
            labels: { true: '✓', false: '✗' }
        });

        expect(type.format(true)).toBe('✓');
        expect(type.format(false)).toBe('✗');
    });

    it('部分自定义 labels', () => {
        const type = new BooleanColumnType({
            labels: { true: '是' }
        });

        expect(type.format(true)).toBe('是');
        expect(type.format(false)).toBe('FALSE');  // 使用默认值
    });

    it('labels 为 null 时使用默认值', () => {
        const type = new BooleanColumnType({ labels: null });

        expect(type.format(true)).toBe('TRUE');
        expect(type.format(false)).toBe('FALSE');
    });
});

describe('BooleanColumnType - 攻击性测试', () => {
    describe('异常输入测试', () => {
        it('各种大小写组合', () => {
            const type = new BooleanColumnType();
            const variations = [
                'True', 'TRUE', 'tRuE', 'tRUE',
                'False', 'FALSE', 'fAlSe', 'fALSE',
                'Yes', 'YES', 'yeS', 'yES',
                'No', 'NO', 'nO',
                'Y', 'y', 'N', 'n',
                'T', 't', 'F', 'f',
                '1', '0',
            ];

            variations.forEach(v => {
                expect(() => type.parse(v)).not.toThrow();
                expect(() => type.validate(v)).not.toThrow();
            });
        });

        it('带空白字符的输入', () => {
            const type = new BooleanColumnType();

            expect(type.parse('  true  ')).toBe(true);
            expect(type.parse('\tfalse\t')).toBe(false);
            expect(type.parse(' yes ')).toBe(true);
        });

        it('特殊 Unicode 字符', () => {
            const type = new BooleanColumnType();
            const specialChars = [
                '是', '否', '真', '假',
                'Ｔｒｕｅ',  // 全角字符
                '𝚝𝚛𝚞𝚎',  // 数学字母
            ];

            specialChars.forEach(char => {
                expect(() => type.parse(char)).not.toThrow();
                expect(() => type.format(char)).not.toThrow();
            });
        });

        it('数字边界值', () => {
            const type = new BooleanColumnType();
            const numbers = [0, 1, -1, 2, 0.5, 1.5, NaN, Infinity];

            numbers.forEach(num => {
                expect(() => type.parse(num)).not.toThrow();
                expect(() => type.validate(num)).not.toThrow();
                expect(() => type.format(num)).not.toThrow();
            });
        });
    });

    describe('性能压力测试', () => {
        it('高频 parse 调用', () => {
            const type = new BooleanColumnType();
            const start = performance.now();

            for (let i = 0; i < 50000; i++) {
                type.parse(i % 2 === 0 ? 'true' : 'false');
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(300);
        });

        it('高频 format 调用', () => {
            const type = new BooleanColumnType({
                labels: { true: '✓', false: '✗' }
            });
            const start = performance.now();

            for (let i = 0; i < 50000; i++) {
                type.format(i % 2 === 0);
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(300);
        });
    });
});

describe('BooleanColumnType - 集成测试', () => {
    it('与 BaseColumnType 接口兼容', () => {
        const type = new BooleanColumnType();

        expect(typeof type.format).toBe('function');
        expect(typeof type.validate).toBe('function');
        expect(typeof type.parse).toBe('function');
        expect(typeof type.getDefaultStyle).toBe('function');
        expect(typeof type.getEditorOptions).toBe('function');
        expect(typeof type.getDefaultValue).toBe('function');
        expect(typeof type.compare).toBe('function');
    });

    it('parse 和 format 的往返一致性', () => {
        const type = new BooleanColumnType();

        const inputs = ['true', 'false', 'yes', 'no', '1', '0'];
        inputs.forEach(input => {
            const parsed = type.parse(input);
            if (typeof parsed === 'boolean') {
                const formatted = type.format(parsed);
                expect(['TRUE', 'FALSE', '✓', '✗']).toContain(formatted);
            }
        });
    });

    it('validate 通过后可以正确格式化', () => {
        const type = new BooleanColumnType();

        const validValues = [true, false, 0, 1, 'true', 'false'];
        validValues.forEach(val => {
            if (type.validate(val) === true) {
                expect(() => type.format(val)).not.toThrow();
            }
        });
    });
});

describe('BooleanColumnType - Bug 检测', () => {
    describe('源码问题识别', () => {
        it('Bug #1: 数字 2 的处理（不是 0 或 1）', () => {
            const type = new BooleanColumnType();

            const result = type.parse(2);
            console.log(`parse(2): ${result} (${typeof result})`);
            expect(result).toBe(2);  // 无法识别，返回原值

            const validation = type.validate(2);
            console.log(`validate(2): ${validation}`);
            expect(validation).toBe(false);
        });

        it('Bug #2: 空字符串和字符串 "null" 的区别', () => {
            const type = new BooleanColumnType();

            expect(type.parse('')).toBe('');
            expect(type.parse('null')).toBe('null');

            expect(type.validate('')).toBe(true);
            expect(type.validate('null')).toBe(false);
        });

        it('Bug #3: 布尔对象 vs 基本布尔值', () => {
            const type = new BooleanColumnType();

            expect(type.format(new Boolean(true))).toBe('TRUE');
            expect(type.parse(new Boolean(false))).toBe(false);

            console.log('ℹ️  提示: Boolean 对象会被自动拆箱');
        });

        it('Bug #4: 自定义 labels 不影响 parse 逻辑', () => {
            const type = new BooleanColumnType({
                labels: { true: '是', false: '否' }
            });

            expect(type.parse('是')).toBe(true);   // '是' 被识别为 true
            expect(type.parse('否')).toBe(false);  // '否' 被识别为 false

            console.log('✅ 确认: parse() 始终识别标准布尔字符串，labels 只影响 format()');
        });
    });

    describe('边缘行为分析', () => {
        it('toBoolean 私有方法的边界情况', () => {
            const type = new BooleanColumnType();

            const edgeCases = [
                { input: '', expected: null },
                { input: '  ', expected: null },
                { input: 'tru', expected: null },
                { input: 'falsy', expected: null },
                { input: -1, expected: null },
                { input: 2, expected: null },
            ];

            edgeCases.forEach(({ input, expected }) => {
                const parsed = type.parse(input);
                if (expected === null && parsed !== '' && parsed !== true && parsed !== false) {
                    console.log(`${JSON.stringify(input)} -> ${parsed}`);
                }
            });
        });

        it('compare() 中无效值的排序稳定性', () => {
            const type = new BooleanColumnType();

            const invalidValues = ['a', 'b', 'c', 'x', 'y', 'z'];
            const sorted = [...invalidValues].sort((a, b) => type.compare(a, b));

            console.log('无效值排序结果:', sorted);
        });
    });
});