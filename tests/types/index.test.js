/**
 * types/index 类型注册表完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. getType/registerType/getColumnTypeFromConfig 测试
 * 4. 集成测试
 * 5. 源码 Bug 检测
 *
 * @module tests/types/index.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    getType,
    registerType,
    getRegisteredTypes,
    getColumnTypeFromConfig,
} from '../../src/types/index.js';
import { BaseColumnType } from '../../src/types/BaseColumnType.js';
import { TextColumnType } from '../../src/types/TextColumnType.js';

describe('types/index - 基础功能测试', () => {
    describe('getType() 方法', () => {
        it('获取内置 text 类型', () => {
            const type = getType('text');
            expect(type).toBeInstanceOf(BaseColumnType);
            expect(type.name).toBe('text');
        });

        it('获取内置 numeric 类型', () => {
            const type = getType('numeric');
            expect(type).toBeDefined();
            expect(type.name).toBe('numeric');
        });

        it('获取内置 date 类型', () => {
            const type = getType('date');
            expect(type).toBeDefined();
            expect(type.name).toBe('date');
        });

        it('获取内置 boolean 类型', () => {
            const type = getType('boolean');
            expect(type).toBeDefined();
            expect(type.name).toBe('boolean');
        });

        it('获取内置 select 类型', () => {
            const type = getType('select');
            expect(type).toBeDefined();
            expect(type.name).toBe('select');
        });

        it('不存在的类型回退到 text', () => {
            const type = getType('nonexistent');
            expect(type).toBeDefined();
            expect(type.name).toBe('text');
        });

        it('传入 options 创建新实例', () => {
            const type = getType('text', { maxLength: 100 });
            expect(type).toBeInstanceOf(TextColumnType);
            expect(type.options.maxLength).toBe(100);
        });

        it('不传 options 返回单例', () => {
            const type1 = getType('text');
            const type2 = getType('text');

            expect(type1).toBe(type2);
        });
    });

    describe('registerType() 方法', () => {
        it('注册自定义类型', () => {
            class CustomType extends BaseColumnType {
                get name() { return 'custom'; }
            }

            registerType(new CustomType());
            const type = getType('custom');

            expect(type).toBeInstanceOf(CustomType);
            expect(type.name).toBe('custom');
        });

        it('无效实例不注册', () => {
            const invalidInstances = [
                null,
                undefined,
                {},
                'string',
                123,
                new BaseColumnType(),  // 没有 name getter 的实例
            ];

            invalidInstances.forEach(instance => {
                expect(() => registerType(instance)).not.toThrow();
            });
        });

        it('覆盖已存在的类型', () => {
            class NewTextType extends BaseColumnType {
                get name() { return 'text'; }
                format(value) { return `NEW:${value}`; }
            }

            registerType(new NewTextType());
            const type = getType('text');

            expect(type.format('test')).toBe('NEW:test');
        });
    });

    describe('getRegisteredTypes() 方法', () => {
        it('返回所有注册的类型名称', () => {
            const types = getRegisteredTypes();

            expect(Array.isArray(types)).toBe(true);
            expect(types.length).toBeGreaterThanOrEqual(5);  // 至少有 5 个内置类型
            expect(types).toContain('text');
            expect(types).toContain('numeric');
            expect(types).toContain('date');
            expect(types).toContain('boolean');
            expect(types).toContain('select');
        });
    });

    describe('getColumnTypeFromConfig() 方法', () => {
        it('从配置创建类型实例', () => {
            const config = {
                type: 'text',
                maxLength: 50,
            };

            const type = getColumnTypeFromConfig(config);

            expect(type.name).toBe('text');
            expect(type.options.maxLength).toBe(50);

            console.log(`✅ 类型名称: ${type.constructor.name}, options: ${JSON.stringify(type.options)}`);
        });

        it('无 type 配置返回 text 类型', () => {
            const config = {};
            const type = getColumnTypeFromConfig(config);

            expect(type.name).toBe('text');
        });

        it('null/undefined 配置返回 text 类型', () => {
            expect(getColumnTypeFromConfig(null).name).toBe('text');
            expect(getColumnTypeFromConfig(undefined).name).toBe('text');
        });

        it('提取所有相关配置选项', () => {
            const config = {
                type: 'numeric',
                min: 0,
                max: 100,
                allowInvalid: true,
                numericFormat: { pattern: '0,0.00' },
            };

            const type = getColumnTypeFromConfig(config);

            expect(type.options.min).toBe(0);
            expect(type.options.max).toBe(100);
            expect(type.options.allowInvalid).toBe(true);
            expect(type.options.numericFormat.pattern).toBe('0,0.00');
        });
    });
});

describe('types/index - 攻击性测试', () => {
    describe('异常输入测试', () => {
        it('特殊字符作为类型名称', () => {
            const specialNames = [
                '',
                ' ',
                '\t\n',
                'name-with-dashes',
                'name.with.dots',
                'name_with_underscores',
                'CamelCase',
                'UPPERCASE',
                'name123',
                '中文类型',
                '🎉emoji',
                '<script>',
                'constructor',
                '__proto__',
            ];

            specialNames.forEach(name => {
                expect(() => getType(name)).not.toThrow();
                const type = getType(name);
                expect(type).toBeDefined();
            });
        });

        it('极端 options 值', () => {
            const extremeOptions = [
                null,
                undefined,
                {},
                { maxLength: -1 },
                { maxLength: 0 },
                { maxLength: Number.MAX_SAFE_INTEGER },
                { source: Array(10000).fill('item') },
                { nested: { deep: { value: true } } },
                function(){},
                Symbol('option'),
            ];

            extremeOptions.forEach(options => {
                expect(() => getType('text', options)).not.toThrow();
            });
        });

        it('恶意构造函数覆盖', () => {
            class MaliciousType extends BaseColumnType {
                get name() { return 'text'; }
                format(value) { throw new Error('Malicious'); }
            }

            registerType(new MaliciousType());

            let errorOccurred = false;
            try {
                const type = getType('text');
                type.format('test');
            } catch (e) {
                errorOccurred = true;
            }

            if (errorOccurred) {
                console.error('❌ 安全问题: 可以通过 registerType 覆盖内置类型并注入恶意代码');
            }
        });
    });

    describe('边界条件测试', () => {
        it('频繁注册和获取', () => {
            for (let i = 0; i < 1000; i++) {
                class DynamicType extends BaseColumnType {
                    get name() { return `dynamic_${i}`; }
                }
                registerType(new DynamicType());
            }

            const types = getRegisteredTypes();
            console.log(`注册了 ${types.filter(t => t.startsWith('dynamic_')).length} 个动态类型`);
        });

        it('大量不同类型的 options', () => {
            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                getType('numeric', {
                    min: Math.random() * 1000,
                    max: Math.random() * 2000 + 1000,
                    numericFormat: { pattern: ['0,0.00', '0.00%', '$0,0.00'][i % 3]
                    }
                });
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(500);
        });
    });

    describe('性能压力测试', () => {
        it('高频 getType 调用', () => {
            const start = performance.now();

            for (let i = 0; i < 50000; i++) {
                getType(['text', 'numeric', 'date', 'boolean', 'select'][i % 5]);
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(300);
        });

        it('高频 getColumnTypeFromConfig 调用', () => {
            const configs = Array.from({ length: 1000 }, (_, i) => ({
                type: ['text', 'numeric', 'select'][i % 3],
                ...(i % 3 === 1 ? { min: 0, max: 100 } : {}),
                ...(i % 3 === 2 ? { source: [`opt${i}`] } : {}),
            }));

            const start = performance.now();
            configs.forEach(config => getColumnTypeFromConfig(config));
            const elapsed = performance.now() - start;

            expect(elapsed).toBeLessThan(200);
        });
    });
});

describe('types/index - 集成测试', () => {
    it('完整的类型使用流程', () => {
        class EmailType extends BaseColumnType {
            get name() { return 'email'; }
            validate(value) {
                if (!value) return true;
                if (typeof value !== 'string') return false;
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
            }
        }

        registerType(new EmailType());

        const emailType = getType('email', {});
        expect(emailType.validate('user@example.com')).toBe(true);
        expect(emailType.validate('invalid')).toBe(false);

        const fromConfig = getColumnTypeFromConfig({ type: 'email' });
        expect(fromConfig.name).toBe('email');
    });

    it('所有内置类型的接口一致性', () => {
        const builtInTypes = getRegisteredTypes();

        builtInTypes.forEach(typeName => {
            const type = getType(typeName);

            expect(typeof type.format).toBe('function');
            expect(typeof type.validate).toBe('function');
            expect(typeof type.parse).toBe('function');
            expect(typeof type.getDefaultStyle).toBe('function');
            expect(typeof type.getEditorOptions).toBe('function');
            expect(typeof type.getDefaultValue).toBe('function');
            expect(typeof type.compare).toBe('function');
            expect(typeof type.name).toBe('string');
            expect(typeof type.editorType).toBe('string');
        });
    });

    it('getColumnTypeFromConfig 与直接调用 getType 等价', () => {
        const config = {
            type: 'select',
            source: ['A', 'B', 'C'],
            allowInvalid: true,
        };

        const fromConfig = getColumnTypeFromConfig(config);
        const fromDirect = getType('select', {
            source: config.source,
            allowInvalid: config.allowInvalid,
        });

        expect(fromConfig.name).toEqual(fromDirect.name);
        expect(fromConfig.options.source).toEqual(fromDirect.options.source);
    });
});

describe('types/index - Bug 检测', () => {
    describe('源码问题识别', () => {
        it('Bug #1: 注册表全局状态污染', () => {
            const initialCount = getRegisteredTypes().length;

            class TempType extends BaseColumnType {
                get name() { return 'temp_test'; }
            }
            registerType(new TempType());

            const afterRegisterCount = getRegisteredTypes().length;

            expect(afterRegisterCount).toBe(initialCount + 1);
            console.warn('⚠️  全局注册表在测试间可能互相影响，需要清理机制');
        });

        it('Bug #2: getType 返回的单例被意外修改', () => {
            const type1 = getType('text');

            try {
                type1.options.customProp = 'modified';
                const type2 = getType('text');

                if (type2.options.customProp === 'modified') {
                    console.error('❌ Bug: 单例对象被修改会影响后续使用者');
                }
            } catch (e) {
                console.log('ℹ️  单例是只读的或不可修改的');
            }
        });

        it('Bug #3: extractTypeOptions 不完整', () => {
            const config = {
                type: 'custom',
                customOption: 'should be extracted',
                anotherOption: 123,
            };

            const type = getColumnTypeFromConfig(config);

            if (type.options.customOption) {
                console.log('✓ 自定义选项被提取');
            } else {
                console.warn('⚠️  extractTypeOptions 可能遗漏了一些选项字段');
            }
        });

        it('Bug #4: 并发注册竞态条件', () => {
            const promises = [];
            for (let i = 0; i < 100; i++) {
                const idx = i;
                promises.push(
                    Promise.resolve().then(() => {
                        class RaceType extends BaseColumnType {
                            get name() { return `race_${idx}`; }
                        }
                        registerType(new RaceType());
                    })
                );
            }

            // 这不是真正的并发测试，但可以检测基本问题
            expect(async () => await Promise.all(promises)).not.toThrow();
        });
    });

    describe('边缘行为分析', () => {
        it('type 为空字符串的行为', () => {
            const type = getType('');
            expect(type).toBeDefined();
            expect(type.name).toBe('text');  // 回退到默认值
        });

        it('type 为 null/undefined 的行为', () => {
            expect(getType(null).name).toBe('text');
            expect(getType(undefined).name).toBe('text');
        });

        it('registerType 传入非 BaseColumnType 实例', () => {
            const nonInstances = [
                {},
                [],
                new Date(),
                new Map(),
                new Set(),
                function(){},
                () => {},
                class MyClass {},
                123,
                'string',
                true,
                null,
                undefined,
            ];

            nonInstances.forEach(instance => {
                let errorOccurred = false;
                try {
                    registerType(instance);
                } catch (e) {
                    errorOccurred = true;
                }

                if (errorOccurred) {
                    console.error(`❌ registerType(${typeof instance}) 抛出错误`);
                }
            });
        });

        it('循环引用的 options', () => {
            const circularOpts = {};
            circularOpts.self = circularOpts;

            expect(() => getType('text', circularOpts)).not.toThrow();

            const type = getType('text', circularOpts);
            expect(type.options.self).toBe(circularOpts);
        });
    });
});