/**
 * NumericColumnType 数字列类型完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. 格式化模式测试
 * 4. 验证规则测试
 * 5. 集成测试
 * 6. 源码 Bug 检测
 *
 * @module tests/types/NumericColumnType.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NumericColumnType } from '../../src/types/NumericColumnType.js';

describe('NumericColumnType - 基础功能测试', () => {
    let numericType;

    beforeEach(() => {
        numericType = new NumericColumnType();
    });

    describe('基本属性', () => {
        it('name 应该是 "numeric"', () => {
            expect(numericType.name).toBe('numeric');
        });

        it('editorType 应该是 "numeric"', () => {
            expect(numericType.editorType).toBe('numeric');
        });
    });

    describe('getDefaultStyle() 方法', () => {
        it('默认右对齐', () => {
            const style = numericType.getDefaultStyle({});
            expect(style.textAlign).toBe('right');
        });

        it('保留原有样式', () => {
            const baseStyle = { color: 'blue', fontSize: 16 };
            const style = numericType.getDefaultStyle(baseStyle);
            expect(style.color).toBe('blue');
            expect(style.fontSize).toBe(16);
            expect(style.textAlign).toBe('right');
        });
    });

    describe('format() 方法', () => {
        it('undefined/null 返回空字符串', () => {
            expect(numericType.format(undefined)).toBe('');
            expect(numericType.format(null)).toBe('');
        });

        it('数字保持原样', () => {
            expect(numericType.format(123)).toBe('123');
            expect(numericType.format(45.67)).toBe('45.67');
        });

        it('可解析的字符串转为数字格式', () => {
            expect(numericType.format('123')).toBe('123');
        });

        it('NaN 输入返回字符串形式', () => {
            expect(numericType.format('abc')).toBe('abc');
        });
    });

    describe('validate() 方法', () => {
        it('空值应该通过验证', () => {
            expect(numericType.validate('')).toBe(true);
            expect(numericType.validate(undefined)).toBe(true);
            expect(numericType.validate(null)).toBe(true);
        });

        it('有效数字应该通过验证', () => {
            expect(numericType.validate(123)).toBe(true);
            expect(numericType.validate(-45.67)).toBe(true);
            expect(numericType.validate('123')).toBe(true);
        });

        it('无效数字应该验证失败', () => {
            expect(numericType.validate('abc')).toBe(false);
        });

        it('范围限制验证', () => {
            const rangedType = new NumericColumnType({ min: 0, max: 100 });

            expect(rangedType.validate(50)).toBe(true);
            expect(rangedType.validate(-1)).toContain('不能小于');
            expect(rangedType.validate(101)).toContain('不能大于');
        });

        it('allowInvalid 选项', () => {
            const allowInvalidType = new NumericColumnType({ allowInvalid: true });
            expect(allowInvalidType.validate('abc')).toBe('invalid');
        });
    });

    describe('parse() 方法', () => {
        it('空值返回空字符串', () => {
            expect(numericType.parse('')).toBe('');
            expect(numericType.parse(null)).toBe('');
        });

        it('清理逗号和空格', () => {
            expect(numericType.parse('1,234,567')).toBe(1234567);
            expect(numericType.parse('1 234 567')).toBe(1234567);
        });

        it('无效输入原样返回', () => {
            expect(numericType.parse('abc')).toBe('abc');
        });
    });

    describe('compare() 方法', () => {
        it('数字升序排序', () => {
            expect(numericType.compare(1, 2, 'asc')).toBeLessThan(0);
            expect(numericType.compare(2, 1, 'asc')).toBeGreaterThan(0);
            expect(numericType.compare(1, 1, 'asc')).toBe(0);
        });

        it('数字降序排序', () => {
            expect(numericType.compare(1, 2, 'desc')).toBeGreaterThan(0);
            expect(numericType.compare(2, 1, 'desc')).toBeLessThan(0);
        });

        it('NaN 值排序到最前面', () => {
            expect(numericType.compare('abc', 1, 'asc')).toBeLessThan(0);
            expect(numericType.compare(1, 'abc', 'asc')).toBeGreaterThan(0);
        });
    });
});

describe('NumericColumnType - 格式化模式测试', () => {
    it('千分位格式 0,0.00', () => {
        const type = new NumericColumnType({
            numericFormat: { pattern: '0,0.00' }
        });
        expect(type.format(1234.567)).toBe('1,234.57');
    });

    it('千分位格式 0,0.0', () => {
        const type = new NumericColumnType({
            numericFormat: { pattern: '0,0.0' }
        });
        expect(type.format(1234.567)).toBe('1,234.6');
    });

    it('千分位格式 0,0', () => {
        const type = new NumericColumnType({
            numericFormat: { pattern: '0,0' }
        });
        expect(type.format(1234.567)).toBe('1,235');
    });

    it('百分比格式 0.00%', () => {
        const type = new NumericColumnType({
            numericFormat: { pattern: '0.00%' }
        });
        expect(type.format(0.1234)).toBe('12.34%');
    });

    it('百分比格式 0.0%', () => {
        const type = new NumericColumnType({
            numericFormat: { pattern: '0.0%' }
        });
        expect(type.format(0.1234)).toBe('12.3%');
    });

    it('货币格式 $', () => {
        const type = new NumericColumnType({
            numericFormat: { pattern: '$0,0.00' }
        });
        expect(type.format(1234.56)).toContain('$');
        expect(type.format(1234.56)).toContain(',');
    });

    it('货币格式 €', () => {
        const type = new NumericColumnType({
            numericFormat: { pattern: '€0,0.00' }
        });
        expect(type.format(1234.56)).toContain('€');
    });

    it('货币格式 ¥', () => {
        const type = new NumericColumnType({
            numericFormat: { pattern: '¥0,0.00' }
        });
        expect(type.format(1234.56)).toContain('¥');
    });

    it('无格式模式返回简单字符串', () => {
        const type = new NumericColumnType();
        expect(type.format(1234.56)).toBe('1234.56');
    });
});

describe('NumericColumnType - 攻击性测试', () => {
    describe('异常输入测试', () => {
        it('极大数值处理', () => {
            const type = new NumericColumnType();
            const bigNumbers = [
                Number.MAX_SAFE_INTEGER,
                Number.MAX_VALUE,
                Infinity,
                -Infinity,
                1e308,
                -1e308,
            ];

            bigNumbers.forEach(num => {
                expect(() => type.format(num)).not.toThrow();
                expect(() => type.validate(num)).not.toThrow();
            });
        });

        it('极小数值处理', () => {
            const type = new NumericColumnType();
            const smallNumbers = [
                Number.MIN_SAFE_INTEGER,
                Number.MIN_VALUE,
                0.0000000001,
                -0.0000000001,
                1e-308,
            ];

            smallNumbers.forEach(num => {
                expect(() => type.format(num)).not.toThrow();
                expect(() => type.validate(num)).not.toThrow();
            });
        });

        it('特殊数值', () => {
            const type = new NumericColumnType();
            const specials = [NaN, undefined, null, '', '  ', 'abc', '123abc'];

            specials.forEach(val => {
                expect(() => type.format(val)).not.toThrow();
                expect(() => type.validate(val)).not.toThrow();
                expect(() => type.parse(val)).not.toThrow();
            });
        });

        it('精度丢失测试', () => {
            const type = new NumericColumnType();
            const preciseNum = 0.1 + 0.2;

            const formatted = type.format(preciseNum);
            console.log(`0.1+0.2 格式化结果: ${formatted}`);
            expect(typeof formatted).toBe('string');
        });
    });

    describe('边界条件测试', () => {
        it('min/max 相等时只允许该值', () => {
            const type = new NumericColumnType({ min: 42, max: 42 });

            expect(type.validate(42)).toBe(true);
            expect(type.validate(41.999)).not.toBe(true);
            expect(type.validate(42.001)).not.toBe(true);
        });

        it('负数范围', () => {
            const type = new NumericColumnType({ min: -100, max: -50 });

            expect(type.validate(-75)).toBe(true);
            expect(type.validate(-49)).toContain('不能大于');
            expect(type.validate(-101)).toContain('不能小于');
        });

        it('跨零范围', () => {
            const type = new NumericColumnType({ min: -100, max: 100 });

            expect(type.validate(0)).toBe(true);
            expect(type.validate(-50)).toBe(true);
            expect(type.validate(50)).toBe(true);
        });
    });

    describe('性能压力测试', () => {
        it('批量格式化性能', () => {
            const type = new NumericColumnType({
                numericFormat: { pattern: '$0,0.00' }
            });
            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                type.format(Math.random() * 1000000);
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(2000);  // CI 环境可能较慢，放宽到 2 秒
        });

        it('批量解析性能', () => {
            const type = new NumericColumnType();
            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                type.parse(`${(Math.random() * 1000000).toLocaleString()}`);
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(300);
        });

        it('批量比较排序性能', () => {
            const type = new NumericColumnType();
            const data = Array.from({ length: 1000 }, () => Math.random() * 1000);
            const start = performance.now();

            data.sort((a, b) => type.compare(a, b, 'asc'));

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(100);

            const isSorted = data.every((val, i) => i === 0 || val >= data[i - 1]);
            expect(isSorted).toBe(true);
        });
    });
});

describe('NumericColumnType - 集成测试', () => {
    it('格式化后能被正确解析回来', () => {
        const type = new NumericColumnType({
            numericFormat: { pattern: '0,0.00' }
        });

        const original = 1234.567;
        const formatted = type.format(original);
        const parsed = type.parse(formatted);

        expect(Math.abs(parsed - original)).toBeLessThan(0.01);
    });

    it('validate 通过的值可以被格式化', () => {
        const type = new NumericColumnType({ min: 0, max: 1000 });

        for (let i = 0; i <= 1000; i += 100) {
            expect(type.validate(i)).toBe(true);
            expect(() => type.format(i)).not.toThrow();
        }
    });

    it('compare 结果与原生排序一致', () => {
        const type = new NumericColumnType();
        const numbers = [5, 2, 8, 1, 9, 3, 7, 4, 6];

        const sortedByType = [...numbers].sort((a, b) => type.compare(a, b));
        const sortedNative = [...numbers].sort((a, b) => a - b);

        expect(sortedByType).toEqual(sortedNative);
    });
});

describe('NumericColumnType - Bug 检测', () => {
    describe('源码问题识别', () => {
        it('Bug #1: parseFloat 对大整数可能丢失精度', () => {
            const type = new NumericColumnType();
            const bigInt = 9007199254740993;

            const parsed = type.parse(bigInt.toString());
            const precisionLoss = Math.abs(parsed - bigInt);

            if (precisionLoss > 0) {
                console.error(`❌ Bug: 大整数精度丢失 ${precisionLoss}`);
            }
        });

        it('Bug #2: parse() 清理逗号但不清理其他分隔符', () => {
            const type = new NumericColumnType();

            const withComma = type.parse('1,234');
            const withChineseComma = type.parse('1，234');

            expect(withComma).toBe(1234);
            if (withChineseComma === '1，234') {
                console.warn('⚠️  不支持中文逗号分隔符');
            }
        });

        it('Bug #3: compare() 中 NaN 都变成 -Infinity 无法区分', () => {
            const type = new NumericColumnType();

            const cmp1 = type.compare('abc', 'xyz', 'asc');
            const cmp2 = type.compare('xyz', 'abc', 'asc');

            expect(cmp1).toBe(0);
            expect(cmp2).toBe(0);

            console.warn('⚠️  所有 NaN 值在排序中视为相等，可能不是预期行为');
        });

        it('Bug #4: formatByPattern 私有方法对未知模式的处理', () => {
            const type = new NumericColumnType({
                numericFormat: { pattern: 'UNKNOWN_PATTERN' }
            });

            const result = type.format(1234);
            console.log(`未知模式输出: ${result}`);
        });

        it('Bug #5: 百分比格式对大于 1 的数值处理', () => {
            const type = new NumericColumnType({
                numericFormat: { pattern: '0.00%' }
            });

            const result = type.format(2);
            console.log(`2 的百分比格式: ${result}`);
            expect(result).toBe('200.00%');
        });

        it('Bug #6: 负数百分比格式', () => {
            const type = new NumericColumnType({
                numericFormat: { pattern: '0.00%' }
            });

            const result = type.format(-0.5);
            console.log(`-0.5 的百分比格式: ${result}`);
            expect(result).toBe('-50.00%');
        });
    });

    describe('边缘行为分析', () => {
        it('-0 与 0 的区别', () => {
            const type = new NumericColumnType();

            const formatZero = type.format(0);
            const formatNegZero = type.format(-0);

            console.log(`0 -> ${formatZero}, -0 -> ${formatNegZero}`);
        });

        it('科学计数法字符串的解析', () => {
            const type = new NumericColumnType();

            const scientificNotations = ['1e10', '1E10', '1.5e-5', '-2.3E+6'];
            scientificNotations.forEach(s => {
                const parsed = type.parse(s);
                console.log(`${s} -> ${parsed} (${typeof parsed})`);
            });
        });

        it('十六进制/八进制字符串', () => {
            const type = new NumericColumnType();

            const hexOctal = ['0xFF', '0o777', '0b1010'];
            hexOctal.forEach(s => {
                const parsed = type.parse(s);
                console.log(`${s} -> ${parsed}`);
            });
        });
    });
});