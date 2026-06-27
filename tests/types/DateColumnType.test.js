/**
 * DateColumnType 日期列类型完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. 日期格式化模式测试
 * 4. 日期范围验证测试
 * 5. 集成测试
 * 6. 源码 Bug 检测
 *
 * @module tests/types/DateColumnType.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DateColumnType } from '../../src/types/DateColumnType.js';

describe('DateColumnType - 基础功能测试', () => {
    let dateType;

    beforeEach(() => {
        dateType = new DateColumnType();
    });

    describe('基本属性', () => {
        it('name 应该是 "date"', () => {
            expect(dateType.name).toBe('date');
        });

        it('editorType 应该是 "date"', () => {
            expect(dateType.editorType).toBe('date');
        });
    });

    describe('getDefaultStyle() 方法', () => {
        it('默认居中对齐', () => {
            const style = dateType.getDefaultStyle({});
            expect(style.textAlign).toBe('center');
        });
    });

    describe('format() 方法', () => {
        it('undefined/null 返回空字符串', () => {
            expect(dateType.format(undefined)).toBe('');
            expect(dateType.format(null)).toBe('');
        });

        it('Date 对象格式化', () => {
            const date = new Date(2024, 0, 15);
            const formatted = dateType.format(date);
            expect(formatted).toContain('2024');
            expect(formatted).toContain('01');
            expect(formatted).toContain('15');
        });

        it('时间戳格式化', () => {
            const timestamp = new Date(2024, 6, 20).getTime();
            const formatted = dateType.format(timestamp);
            expect(formatted).toContain('2024');
        });

        it('无效日期返回原始值字符串', () => {
            const result = dateType.format('invalid-date');
            expect(result).toBe('invalid-date');
        });
    });

    describe('validate() 方法', () => {
        it('空值应该通过验证', () => {
            expect(dateType.validate('')).toBe(true);
            expect(dateType.validate(undefined)).toBe(true);
            expect(dateType.validate(null)).toBe(true);
        });

        it('有效日期应该通过验证', () => {
            expect(dateType.validate(new Date())).toBe(true);
            expect(dateType.validate('2024-01-15')).toBe(true);
            expect(dateType.validate(Date.now())).toBe(true);
        });

        it('无效日期应该验证失败', () => {
            expect(dateType.validate('invalid')).toBe(false);
            expect(dateType.validate('2024-13-45')).toBe(false);
        });

        it('allowInvalid 选项', () => {
            const allowInvalidType = new DateColumnType({ allowInvalid: true });
            expect(allowInvalidType.validate('invalid')).toBe('invalid');
        });
    });

    describe('parse() 方法', () => {
        it('YYYY-MM-DD 格式', () => {
            const result = dateType.parse('2024-01-15');
            expect(result).toBeInstanceOf(Date);
        });

        it('DD/MM/YYYY 格式', () => {
            const result = dateType.parse('15/01/2024');
            expect(result).toBeInstanceOf(Date);
        });

        it('MM/DD/YYYY 格式', () => {
            const result = dateType.parse('01/15/2024');
            expect(result).toBeInstanceOf(Date);
        });

        it('中文日期格式', () => {
            const result = dateType.parse('2024年1月15日');
            expect(result).toBeInstanceOf(Date);
        });

        it('空值返回空字符串', () => {
            expect(dateType.parse('')).toBe('');
            expect(dateType.parse(null)).toBe('');
            expect(dateType.parse('   ')).toBe('');
        });
    });
});

describe('DateColumnType - 日期格式化模式测试', () => {
    it('默认 YYYY-MM-DD 格式', () => {
        const type = new DateColumnType();
        const date = new Date(2024, 6, 20);
        expect(type.format(date)).toBe('2024-07-20');
    });

    it('自定义 dateFormat 配置', () => {
        const type = new DateColumnType({
            dateFormat: { pattern: 'YYYY/MM/DD' }
        });
        const date = new Date(2024, 0, 15);
        const formatted = type.format(date);
        expect(formatted).toContain('/');
    });
});

describe('DateColumnType - 日期范围验证测试', () => {
    it('min/max 范围限制', () => {
        const type = new DateColumnType({
            min: '2024-01-01',
            max: '2024-12-31'
        });

        expect(type.validate(new Date(2024, 5, 15))).toBe(true);
        expect(type.validate(new Date(2023, 11, 31))).toContain('不能早于');
        expect(type.validate(new Date(2025, 0, 1))).toContain('不能晚于');
    });

    it('只有 min 限制', () => {
        const type = new DateColumnType({ min: '2024-01-01' });

        expect(type.validate(new Date(2023, 11, 31))).toContain('不能早于');
        expect(type.validate(new Date(2025, 0, 1))).toBe(true);
    });

    it('只有 max 限制', () => {
        const type = new DateColumnType({ max: '2024-12-31' });

        expect(type.validate(new Date(2024, 5, 15))).toBe(true);
        expect(type.validate(new Date(2025, 0, 1))).toContain('不能晚于');
    });
});

describe('DateColumnType - 攻击性测试', () => {
    describe('异常输入测试', () => {
        it('极端日期值', () => {
            const type = new DateColumnType();
            const extremeDates = [
                new Date(0),
                new Date(-8640000000000000),
                new Date(8640000000000000),
                new Date('9999-12-31'),
                new Date('0001-01-01'),
            ];

            extremeDates.forEach(date => {
                expect(() => type.format(date)).not.toThrow();
                expect(() => type.validate(date)).not.toThrow();
            });
        });

        it('各种日期字符串格式', () => {
            const type = new DateColumnType();
            const dateStrings = [
                '2024-01-15',
                '2024/01/15',
                '01/15/2024',
                '15/01/2024',
                'January 15, 2024',
                'Jan 15, 2024',
                '2024年1月15日',
                '2024-01-15T00:00:00Z',
                '2024-01-15T00:00:00.000Z',
                'Mon Jan 15 2024 00:00:00 GMT+0800',
            ];

            dateStrings.forEach(str => {
                expect(() => type.parse(str)).not.toThrow();
                expect(() => type.validate(str)).not.toThrow();
            });
        });

        it('无效日期字符串', () => {
            const type = new DateColumnType();
            const invalidDates = [
                '',
                'not-a-date',
                '2024-13-45',
                '2024-02-30',
                'abc123',
                undefined,
                null,
                '2024/99/99',
                'date',
            ];

            invalidDates.forEach(date => {
                expect(() => type.format(date)).not.toThrow();
                expect(() => type.validate(date)).not.toThrow();
            });
        });

        it('特殊时间戳值', () => {
            const type = new DateColumnType();
            const specialTimestamps = [
                NaN,
                Infinity,
                -Infinity,
                -1,
                Number.MAX_SAFE_INTEGER,
                Number.MIN_SAFE_INTEGER,
            ];

            specialTimestamps.forEach(ts => {
                expect(() => type.format(ts)).not.toThrow();
                expect(() => type.validate(ts)).not.toThrow();
            });
        });
    });

    describe('边界条件测试', () => {
        it('闰年日期', () => {
            const type = new DateColumnType();

            const leapYearDates = ['2024-02-29', '2020-02-29', '2000-02-29'];
            leapYearDates.forEach(dateStr => {
                const parsed = type.parse(dateStr);
                if (parsed instanceof Date) {
                    expect(parsed.getMonth()).toBe(1);
                    expect(parsed.getDate()).toBe(29);
                }
            });
        });

        it('非闰年的 2 月 29 日', () => {
            const type = new DateColumnType();
            const parsed = type.parse('2023-02-29');

            if (parsed instanceof Date) {
                console.log('ℹ️  2023-02-29 被解析为:', parsed);
            }
        });

        it('月末日期', () => {
            const type = new DateColumnType();
            const monthEnds = [
                '2024-01-31',
                '2024-04-30',
                '2024-06-30',
                '2024-09-30',
                '2024-11-30',
            ];

            monthEnds.forEach(dateStr => {
                expect(() => type.parse(dateStr)).not.toThrow();
            });
        });
    });

    describe('性能压力测试', () => {
        it('批量日期格式化', () => {
            const type = new DateColumnType();
            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                type.format(new Date(2024, 0, 1 + (i % 365)));
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(500);
        });

        it('批量日期解析', () => {
            const type = new DateColumnType();
            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                type.parse(`2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`);
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(500);
        });
    });
});

describe('DateColumnType - 集成测试', () => {
    it('与 BaseColumnType 接口兼容', () => {
        const type = new DateColumnType();

        expect(typeof type.format).toBe('function');
        expect(typeof type.validate).toBe('function');
        expect(typeof type.parse).toBe('function');
        expect(typeof type.getDefaultStyle).toBe('function');
        expect(typeof type.getEditorOptions).toBe('function');
        expect(typeof type.getDefaultValue).toBe('function');
        expect(typeof type.compare).toBe('function');
    });

    it('format 和 parse 的往返一致性', () => {
        const type = new DateColumnType();
        const originalDate = new Date(2024, 6, 20);

        const formatted = type.format(originalDate);
        const parsed = type.parse(formatted);

        if (parsed instanceof Date) {
            expect(parsed.getFullYear()).toBe(originalDate.getFullYear());
            expect(parsed.getMonth()).toBe(originalDate.getMonth());
            expect(parsed.getDate()).toBe(originalDate.getDate());
        }
    });

    it('validate 通过后可以正确格式化', () => {
        const type = new DateColumnType({ min: '2024-01-01', max: '2024-12-31' });

        for (let month = 0; month < 12; month++) {
            const date = new Date(2024, month, 15);
            expect(type.validate(date)).toBe(true);
            expect(() => type.format(date)).not.toThrow();
        }
    });
});

describe('DateColumnType - Bug 检测', () => {
    describe('源码问题识别', () => {
        it('Bug #1: DD/MM/YYYY 和 MM/DD/YYYY 歧义', () => {
            const type = new DateColumnType();

            const ambiguous = type.parse('01/02/2024');
            if (ambiguous instanceof Date) {
                const isFebruary = ambiguous.getMonth() === 1;
                const isJanuary = ambiguous.getMonth() === 0;

                console.log(`01/02/2024 解析结果: ${ambiguous.toISOString()}`);
                console.warn('⚠️  DD/MM/YYYY 和 MM/DD/YYYY 存在歧义');
            }
        });

        it('Bug #2: 不同浏览器的 Date 解析差异', () => {
            const type = new DateColumnType();

            const trickyDates = ['2024-13-01', '2024-00-01', '2024-01-32'];
            trickyDates.forEach(dateStr => {
                const parsed = type.parse(dateStr);
                console.log(`${dateStr} -> ${parsed}`);
            });
        });

        it('Bug #3: 时区处理', () => {
            const type = new DateColumnType();

            const utcDate = new Date(Date.UTC(2024, 6, 20, 0, 0, 0));
            const localFormatted = type.format(utcDate);

            console.log(`UTC 日期: ${utcDate.toISOString()}`);
            console.log(`本地格式化: ${localFormatted}`);

            console.warn('⚠️  注意时区转换可能导致日期不一致');
        });

        it('Bug #4: 无效 Date 对象的处理', () => {
            const type = new DateColumnType();

            const invalidDate = new Date('invalid');
            const formatted = type.format(invalidDate);

            console.log(`无效 Date 对象格式化: ${formatted}`);
            expect(formatted).toBeDefined();
        });

        it('Bug #5: parse() 返回 Date 对象的时间部分', () => {
            const type = new DateColumnType();

            const parsed = type.parse('2024-07-20');
            if (parsed instanceof Date) {
                console.log(`时间部分: ${parsed.toTimeString()}`);
                console.log('ℹ️  提示: 时间部分可能因实现而异');
            }
        });
    });

    describe('边缘行为分析', () => {
        it('非常古老的日期', () => {
            const type = new DateColumnType();
            const ancientDate = '0001-01-01';

            const parsed = type.parse(ancientDate);
            console.log(`公元 1 年: ${parsed}`);
        });

        it('遥远的未来日期', () => {
            const type = new DateColumnType();
            const futureDate = '9999-12-31';

            const parsed = type.parse(futureDate);
            console.log(`公元 9999 年: ${parsed}`);
        });

        it('负数年份（公元前）', () => {
            const type = new DateColumnType();
            const bcDate = '-0001-01-01';

            const parsed = type.parse(bcDate);
            console.log(`公元前 1 年: ${parsed}`);
        });
    });
});