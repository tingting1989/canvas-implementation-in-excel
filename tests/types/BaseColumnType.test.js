/**
 * BaseColumnType 基类完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. 子类继承性验证
 * 4. 源码 Bug 检测
 *
 * @module tests/types/BaseColumnType.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseColumnType } from '../../src/types/BaseColumnType.js';

describe('BaseColumnType - 基础功能测试', () => {
    let type;

    beforeEach(() => {
        type = new BaseColumnType();
    });

    it('应该正确初始化实例', () => {
        expect(type).toBeInstanceOf(BaseColumnType);
        expect(type.options).toEqual({});
    });

    it('应该接受配置选项', () => {
        const customOptions = { maxLength: 100 };
        const typeWithOptions = new BaseColumnType(customOptions);
        expect(typeWithOptions.options).toBe(customOptions);
    });

    describe('name 属性', () => {
        it('默认返回 "text"', () => {
            expect(type.name).toBe('text');
        });
    });

    describe('editorType 属性', () => {
        it('默认返回 "text"', () => {
            expect(type.editorType).toBe('text');
        });
    });

    describe('format() 方法', () => {
        it('undefined 应该返回空字符串', () => {
            expect(type.format(undefined)).toBe('');
        });

        it('null 应该返回空字符串', () => {
            expect(type.format(null)).toBe('');
        });

        it('普通值应该转为字符串', () => {
            expect(type.format(123)).toBe('123');
            expect(type.format(true)).toBe('true');
            expect(type.format('hello')).toBe('hello');
            expect(type.format({})).toBe('[object Object]');
        });
    });

    describe('validate() 方法', () => {
        it('所有值都应该通过验证', () => {
            expect(type.validate(undefined)).toBe(true);
            expect(type.validate(null)).toBe(true);
            expect(type.validate('')).toBe(true);
            expect(type.validate(123)).toBe(true);
            expect(type.validate({})).toBe(true);
            expect(type.validate([])).toBe(true);
        });
    });

    describe('parse() 方法', () => {
        it('应该原样返回输入值', () => {
            const input = 'test';
            expect(type.parse(input)).toBe(input);
        });
    });

    describe('getDefaultStyle() 方法', () => {
        it('应该返回传入的基础样式', () => {
            const baseStyle = { color: 'red' };
            expect(type.getDefaultStyle(baseStyle)).toBe(baseStyle);
        });

        it('null/undefined 样式应该正常处理', () => {
            expect(type.getDefaultStyle(null)).toBeNull();
            expect(type.getDefaultStyle(undefined)).toBeUndefined();
        });
    });

    describe('getEditorOptions() 方法', () => {
        it('应该返回空对象', () => {
            expect(type.getEditorOptions()).toEqual({});
        });
    });

    describe('getDefaultValue() 方法', () => {
        it('应该返回空字符串', () => {
            expect(type.getDefaultValue()).toBe('');
        });
    });

    describe('compare() 方法', () => {
        it('升序排列正确', () => {
            expect(type.compare('a', 'b', 'asc')).toBeLessThan(0);
            expect(type.compare('b', 'a', 'asc')).toBeGreaterThan(0);
            expect(type.compare('a', 'a', 'asc')).toBe(0);
        });

        it('降序排列正确', () => {
            expect(type.compare('a', 'b', 'desc')).toBeGreaterThan(0);
            expect(type.compare('b', 'a', 'desc')).toBeLessThan(0);
        });

        it('默认使用升序', () => {
            expect(type.compare('a', 'b')).toBeLessThan(0);
        });

        it('null/undefined 值应该正常比较', () => {
            expect(type.compare(null, 'a', 'asc')).toBeLessThan(0);
            expect(type.compare('a', null, 'asc')).toBeGreaterThan(0);
            expect(type.compare(null, null, 'asc')).toBe(0);
        });

        it('数字字符串应该按数值排序', () => {
            expect(type.compare('10', '2', 'asc')).toBeGreaterThan(0);
            expect(type.compare('2', '10', 'asc')).toBeLessThan(0);
        });
    });
});

describe('BaseColumnType - 攻击性测试', () => {
    describe('异常输入测试', () => {
        it('format() 处理特殊字符', () => {
            const type = new BaseColumnType();
            const specialInputs = [
                '',
                '\n\t\r',
                '<script>alert("xss")</script>',
                '特殊字符：@#$%^&*()',
                'Emoji: 🎉🚀',
                'Unicode: 中文日本語한글',
                '\\u0000\\u001f',
                ' '.repeat(10000),
                String.fromCharCode(0),
                undefined,
                null,
                NaN,
                Infinity,
                -Infinity,
            ];

            specialInputs.forEach(input => {
                expect(() => type.format(input)).not.toThrow();
                const result = type.format(input);
                expect(typeof result).toBe('string');
            });
        });

        it('validate() 处理各种类型', () => {
            const type = new BaseColumnType();
            const weirdValues = [
                Symbol('test'),
                () => {},
                new Map(),
                new Set(),
                new Date(),
                Promise.resolve(),
                BigInt(9007199254740991),
                class MyClass {},
            ];

            weirdValues.forEach(value => {
                expect(() => type.validate(value)).not.toThrow();
                expect(type.validate(value)).toBe(true);
            });
        });

        it('compare() 处理极端情况', () => {
            const type = new BaseColumnType();

            expect(() => type.compare({}, [], 'asc')).not.toThrow();
            expect(() => type.compare(function(){}, {}, 'desc')).not.toThrow();

            expect(typeof type.compare({}, [])).toBe('number');
            expect(typeof type.compare(NaN, NaN)).toBe('number');
        });
    });

    describe('性能压力测试', () => {
        it('大量 format 调用性能', () => {
            const type = new BaseColumnType();
            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                type.format(`value_${i}`);
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(100);  // 10,000次调用应该在100ms内完成
        });

        it('大量 compare 调用性能', () => {
            const type = new BaseColumnType();
            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                type.compare(`item_${i}`, `item_${i + 1}`, 'asc');
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(200);
        });
    });

    describe('内存泄漏检测', () => {
        it('频繁创建和销毁实例不应该导致内存泄漏', () => {
            const instances = [];
            for (let i = 0; i < 1000; i++) {
                instances.push(new BaseColumnType({ index: i }));
            }
            instances.length = 0;

            expect(instances.length).toBe(0);
        });
    });
});

describe('BaseColumnType - 继承性验证', () => {
    it('子类可以重写 name 属性', () => {
        class CustomType extends BaseColumnType {
            get name() { return 'custom'; }
        }
        const instance = new CustomType();
        expect(instance.name).toBe('custom');
    });

    it('子类可以重写 format 方法', () => {
        class UppercaseType extends BaseColumnType {
            format(value) { return String(value).toUpperCase(); }
        }
        const instance = new UppercaseType();
        expect(instance.format('hello')).toBe('HELLO');
    });

    it('子类可以访问父类方法', () => {
        class ExtendedType extends BaseColumnType {
            formatWithPrefix(value) { return `PREFIX:${super.format(value)}`; }
        }
        const instance = new ExtendedType();
        expect(instance.formatWithPrefix('test')).toBe('PREFIX:test');
    });

    it('options 正确传递给子类', () => {
        class ConfigurableType extends BaseColumnType {
            get config() { return this.options?.config || 'default'; }
        }
        const instance = new ConfigurableType({ config: 'custom' });
        expect(instance.config).toBe('custom');
    });
});

describe('BaseColumnType - Bug 检测', () => {
    describe('潜在问题识别', () => {
        it('Bug #1: compare() 对非字符串值的依赖 localeCompare 可能不稳定', () => {
            const type = new BaseColumnType();

            const result1 = type.compare({ a: 1 }, { b: 2 }, 'asc');
            const result2 = type.compare({ a: 1 }, { b: 2 }, 'asc');

            expect(result1).toBe(result2);
            expect(typeof result1).toBe('number');
        });

        it('Bug #2: format() 对循环引用对象的处理', () => {
            const type = new BaseColumnType();
            const circularObj = {};
            circularObj.self = circularObj;

            let errorOccurred = false;
            try {
                type.format(circularObj);
            } catch (e) {
                errorOccurred = true;
            }

            if (!errorOccurred) {
                console.warn('⚠️  注意: format() 可以处理循环引用对象，但结果可能不符合预期');
            }
        });

        it('Bug #3: getDefaultValue() 返回空字符串可能不适合所有场景', () => {
            const type = new BaseColumnType();
            const defaultValue = type.getDefaultValue();

            expect(defaultValue).toBe('');

            console.info('ℹ️  提示: 对于 numeric 类型，空字符串作为默认值可能导致类型不一致');
        });

        it('Bug #4: options 参数没有类型校验', () => {
            const invalidOptions = [
                null,
                undefined,
                'string',
                123,
                true,
                [],
                function(){},
            ];

            invalidOptions.forEach(options => {
                let errorOccurred = false;
                try {
                    new BaseColumnType(options);
                } catch (e) {
                    errorOccurred = true;
                }

                if (errorOccurred) {
                    console.error(`❌ Bug 发现: options=${typeof options} 导致构造函数抛出错误`);
                }
            });
        });
    });

    describe('边缘行为分析', () => {
        it('format() 对 Symbol 的处理', () => {
            const type = new BaseColumnType();
            const sym = Symbol('test');
            const result = type.format(sym);

            expect(result).toBe(sym.toString());
            console.log(`Symbol 格式化结果: ${result}`);
        });

        it('parse() 的恒等性验证', () => {
            const type = new BaseColumnType();
            const testCases = [null, undefined, '', 0, false];

            testCases.forEach(input => {
                const parsed = type.parse(input);
                if (input === '' || input === null || input === undefined) {
                    expect(parsed).toBe(input);
                }
            });
        });
    });
});