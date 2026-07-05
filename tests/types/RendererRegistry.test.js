/**
 * TypeRegistry 类型注册表完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. 注册/注销/查询功能测试
 * 4. 单例模式测试
 * 5. 源码 Bug 检测
 *
 * @module tests/types/TypeRegistry.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TypeRegistry, registerTypeClass, getType, hasType, unregisterType, getRegisteredTypes, clearTypes, resetTypes, getRegistrySize, registerType } from '../../src/types/index.js';
import { BaseColumnType } from '../../src/types/BaseColumnType.js';

describe('TypeRegistry - 单例模式测试', () => {
    it('多次 getInstance 返回同一实例', () => {
        const a = TypeRegistry.getInstance();
        const b = TypeRegistry.getInstance();
        expect(a).toBe(b);
    });

    it('new TypeRegistry() 也返回同一实例', () => {
        const a = TypeRegistry.getInstance();
        const b = new TypeRegistry();
        expect(a).toBe(b);
    });

    it('内置类型在初始化时自动注册', () => {
        const registry = TypeRegistry.getInstance();
        expect(registry.has('text')).toBe(true);
        expect(registry.has('numeric')).toBe(true);
        expect(registry.has('date')).toBe(true);
        expect(registry.has('boolean')).toBe(true);
        expect(registry.has('select')).toBe(true);
    });

    it('内置渲染器在初始化时自动注册', () => {
        const registry = TypeRegistry.getInstance();
        expect(registry.has('checkbox')).toBe(true);
        expect(registry.has('progressBar')).toBe(true);
        expect(registry.has('starRating')).toBe(true);
        expect(registry.has('sparkline')).toBe(true);
        expect(registry.has('colorPreview')).toBe(true);
    });
});

describe('TypeRegistry - register() 方法', () => {
    beforeEach(() => {
        clearTypes();
    });

    it('成功注册类型', () => {
        class TestType extends BaseColumnType {
            get name() { return 'test'; }
        }

        const registry = TypeRegistry.getInstance();
        const result = registry.register('test', TestType);
        expect(result).toBe(true);
    });

    it('重复注册覆盖已有类型（返回 true）', () => {
        class Type1 extends BaseColumnType {
            get name() { return 'renderer'; }
        }
        class Type2 extends BaseColumnType {
            get name() { return 'renderer'; }
        }

        const registry = TypeRegistry.getInstance();
        expect(registry.register('renderer', Type1)).toBe(true);
        expect(registry.register('renderer', Type2)).toBe(true);
    });

    it('无效名称返回 false', () => {
        const invalidNames = [null, undefined, '', ' ', 123, {}, []];
        const registry = TypeRegistry.getInstance();

        invalidNames.forEach(name => {
            const result = registry.register(name, BaseColumnType);
            expect(result).toBe(false);
        });
    });

    it('无效构造函数返回 false', () => {
        const invalidConstructors = [
            null,
            undefined,
            'string',
            123,
            {},
            [],
            () => {},
        ];
        const registry = TypeRegistry.getInstance();

        invalidConstructors.forEach(ctor => {
            const result = registry.register('test', ctor);
            expect(result).toBe(false);
        });

        const validFunction = function() {};
        expect(registry.register('valid-function', validFunction)).toBe(true);
    });

    it('通过便捷函数 registerTypeClass 注册', () => {
        class QuickType extends BaseColumnType {
            get name() { return 'quick'; }
        }

        const result = registerTypeClass('quick', QuickType);
        expect(result).toBe(true);
        expect(hasType('quick')).toBe(true);
    });
});

describe('TypeRegistry - registerInstance() 方法', () => {
    beforeEach(() => {
        clearTypes();
    });

    it('成功注册类型实例', () => {
        class MyType extends BaseColumnType {
            get name() { return 'myType'; }
        }

        const registry = TypeRegistry.getInstance();
        const result = registry.registerInstance(new MyType());
        expect(result).toBe(true);
        expect(registry.has('myType')).toBe(true);
    });

    it('无效实例返回 false', () => {
        const registry = TypeRegistry.getInstance();
        expect(registry.registerInstance(null)).toBe(false);
        expect(registry.registerInstance(undefined)).toBe(false);
        expect(registry.registerInstance({})).toBe(false);
    });

    it('通过便捷函数 registerType 注册', () => {
        class QuickInstance extends BaseColumnType {
            get name() { return 'quickInstance'; }
        }

        const result = registerType(new QuickInstance());
        expect(result).toBe(true);
        expect(hasType('quickInstance')).toBe(true);
    });
});

describe('TypeRegistry - get() 方法', () => {
    beforeEach(() => {
        resetTypes();
    });

    it('获取已注册的类型实例', () => {
        class CustomType extends BaseColumnType {
            get name() { return 'custom'; }
        }

        const registry = TypeRegistry.getInstance();
        registry.register('custom', CustomType);
        const instance = registry.get('custom');

        expect(instance).toBeInstanceOf(CustomType);
    });

    it('获取不存在的类型回退到 text', () => {
        const registry = TypeRegistry.getInstance();
        const instance = registry.get('nonexistent');
        expect(instance).not.toBeNull();
        expect(instance.name).toBe('text');
    });

    it('传递 options 创建新实例', () => {
        class ConfigurableType extends BaseColumnType {
            get name() { return 'configurable'; }
            get config() { return this.options?.value || 'default'; }
        }

        const registry = TypeRegistry.getInstance();
        registry.register('configurable', ConfigurableType);
        const instance = registry.get('configurable', { value: 'custom' });

        expect(instance.config).toBe('custom');
    });

    it('实例化失败返回 null', () => {
        class FailingType extends BaseColumnType {
            get name() { return 'failing'; }
            constructor(options) {
                super(options);
                throw new Error('Intentional failure');
            }
        }

        const registry = TypeRegistry.getInstance();
        registry.register('failing', FailingType);
        const instance = registry.get('failing');

        expect(instance).toBeNull();
    });

    it('通过便捷函数 getType 获取', () => {
        class QuickGetType extends BaseColumnType {
            get name() { return 'quickGet'; }
        }

        registerTypeClass('quickGet', QuickGetType);
        const instance = getType('quickGet');
        expect(instance).toBeInstanceOf(QuickGetType);
    });
});

describe('TypeRegistry - has() / unregister() / list() / size', () => {
    beforeEach(() => {
        clearTypes();
    });

    it('has() 检查类型是否存在', () => {
        const registry = TypeRegistry.getInstance();
        class ExistingType extends BaseColumnType {
            get name() { return 'existing'; }
        }

        registry.register('existing', ExistingType);
        expect(registry.has('existing')).toBe(true);
        expect(registry.has('nonexistent')).toBe(false);
    });

    it('unregister() 成功注销类型', () => {
        const registry = TypeRegistry.getInstance();
        class TempType extends BaseColumnType {
            get name() { return 'temp'; }
        }

        registry.register('temp', TempType);
        expect(registry.has('temp')).toBe(true);

        const result = registry.unregister('temp');
        expect(result).toBe(true);
        expect(registry.has('temp')).toBe(false);
    });

    it('unregister() 注销不存在的类型返回 false', () => {
        const registry = TypeRegistry.getInstance();
        expect(registry.unregister('nonexistent')).toBe(false);
    });

    it('list() 列出所有已注册的类型名称', () => {
        const registry = TypeRegistry.getInstance();
        registry.register('r1', BaseColumnType);
        registry.register('r2', BaseColumnType);

        const list = registry.list();
        expect(Array.isArray(list)).toBe(true);
        expect(list).toContain('r1');
        expect(list).toContain('r2');
    });

    it('size 返回已注册类型数量', () => {
        const registry = TypeRegistry.getInstance();
        const initialSize = registry.size;
        registry.register('sizeTest', BaseColumnType);
        expect(registry.size).toBe(initialSize + 1);
    });

    it('便捷函数 hasType / unregisterType / getRegisteredTypes / getRegistrySize', () => {
        registerTypeClass('convTest', BaseColumnType);
        expect(hasType('convTest')).toBe(true);
        expect(getRegisteredTypes()).toContain('convTest');
        expect(typeof getRegistrySize()).toBe('number');
        expect(unregisterType('convTest')).toBe(true);
        expect(hasType('convTest')).toBe(false);
    });
});

describe('TypeRegistry - clear() / reset()', () => {
    it('clear() 清空所有类型', () => {
        const registry = TypeRegistry.getInstance();
        registry.register('x', BaseColumnType);
        registry.register('y', BaseColumnType);

        registry.clear();
        expect(registry.list()).toEqual([]);
        expect(registry.size).toBe(0);
    });

    it('reset() 清空后重新注册内置类型', () => {
        const registry = TypeRegistry.getInstance();
        registry.clear();
        expect(registry.has('text')).toBe(false);

        registry.reset();
        expect(registry.has('text')).toBe(true);
        expect(registry.has('numeric')).toBe(true);
        expect(registry.has('select')).toBe(true);
        expect(registry.has('checkbox')).toBe(true);
    });

    it('便捷函数 clearTypes / resetTypes', () => {
        resetTypes();
        expect(hasType('text')).toBe(true);
    });
});

describe('TypeRegistry - 攻击性测试', () => {
    beforeEach(() => {
        clearTypes();
    });

    it('特殊字符作为类型名称', () => {
        const specialNames = [
            'name-with-dashes',
            'name.with.dots',
            'name_with_underscores',
            'nameWithCamelCase',
            'NAME-UPPERCASE',
            'name123',
            '123name',
            '@#$%',
            '中文命名',
            '🎉emoji',
            'name with spaces',
        ];
        const registry = TypeRegistry.getInstance();

        specialNames.forEach(name => {
            const result = registry.register(name, BaseColumnType);
            if (result) {
                expect(registry.has(name)).toBe(true);
            }
        });
    });

    it('极端长度的类型名称', () => {
        const longName = 'a'.repeat(10000);
        const registry = TypeRegistry.getInstance();

        const result = registry.register(longName, BaseColumnType);
        if (result) {
            expect(registry.has(longName)).toBe(true);
        }
    });

    it('Unicode 名称', () => {
        const unicodeNames = ['日本語', '한글', '中文', '🎯', 'αβγδ'];
        const registry = TypeRegistry.getInstance();

        unicodeNames.forEach(name => {
            const result = registry.register(name, BaseColumnType);
            if (result) {
                expect(registry.get(name)).not.toBeNull();
            }
        });
    });

    it('频繁注册和注销不应该导致内存泄漏', () => {
        const registry = TypeRegistry.getInstance();
        for (let i = 0; i < 10000; i++) {
            class TempType extends BaseColumnType {
                get name() { return `temp_${i}`; }
            }
            registry.register(`temp_${i}`, TempType);
            registry.unregister(`temp_${i}`);
        }

        expect(registry.size).toBeLessThan(100);
    });
});

describe('TypeRegistry - 集成测试', () => {
    beforeEach(() => {
        resetTypes();
    });

    it('完整的注册-查询-使用流程', () => {
        class CompleteType extends BaseColumnType {
            get name() { return 'complete'; }
            format(value) { return `[${value}]`; }
        }

        const registry = TypeRegistry.getInstance();
        expect(registry.register('complete', CompleteType)).toBe(true);
        expect(registry.has('complete')).toBe(true);

        const instance = registry.get('complete', { option: 'test' });
        expect(instance).toBeInstanceOf(CompleteType);
        expect(instance.format('hello')).toBe('[hello]');

        expect(registry.unregister('complete')).toBe(true);
        expect(registry.has('complete')).toBe(false);
    });

    it('多个类型的独立管理', () => {
        class TypeA extends BaseColumnType {
            get name() { return 'A'; }
        }
        class TypeB extends BaseColumnType {
            get name() { return 'B'; }
        }

        const registry = TypeRegistry.getInstance();
        registry.register('A', TypeA);
        registry.register('B', TypeB);

        const a = registry.get('A');
        const b = registry.get('B');

        expect(a).toBeInstanceOf(TypeA);
        expect(b).toBeInstanceOf(TypeB);
        expect(a).not.toBe(b);

        registry.unregister('A');
        expect(registry.has('A')).toBe(false);
        expect(registry.has('B')).toBe(true);
    });

    it('内置类型与自定义类型共存', () => {
        const registry = TypeRegistry.getInstance();
        expect(registry.has('text')).toBe(true);

        class CustomType extends BaseColumnType {
            get name() { return 'custom'; }
        }
        registry.register('custom', CustomType);

        expect(registry.has('text')).toBe(true);
        expect(registry.has('custom')).toBe(true);

        const textInstance = registry.get('text');
        const customInstance = registry.get('custom');
        expect(textInstance.name).toBe('text');
        expect(customInstance.name).toBe('custom');
    });
});

describe('TypeRegistry - Bug 检测', () => {
    beforeEach(() => {
        clearTypes();
    });

    it('get() 无 options 时返回缓存的默认实例', () => {
        class CachedType extends BaseColumnType {
            get name() { return 'cached'; }
        }

        const registry = TypeRegistry.getInstance();
        registry.register('cached', CachedType);

        const instance1 = registry.get('cached');
        const instance2 = registry.get('cached');

        expect(instance1).toBe(instance2);
    });

    it('get() 有 options 时每次创建新实例', () => {
        class NewInstanceType extends BaseColumnType {
            get name() { return 'newInstance'; }
        }

        const registry = TypeRegistry.getInstance();
        registry.register('newInstance', NewInstanceType);

        const instance1 = registry.get('newInstance', { a: 1 });
        const instance2 = registry.get('newInstance', { b: 2 });

        expect(instance1).not.toBe(instance2);
    });

    it('构造函数抛出非 Error 对象时返回 null', () => {
        class WeirdError extends BaseColumnType {
            get name() { return 'weird'; }
            constructor() {
                super();
                throw 'string error';
            }
        }

        const registry = TypeRegistry.getInstance();
        registry.register('weird', WeirdError);
        const result = registry.get('weird');

        expect(result).toBeNull();
    });

    it('循环引用的 options', () => {
        class CircularType extends BaseColumnType {
            get name() { return 'circular'; }
        }

        const registry = TypeRegistry.getInstance();
        registry.register('circular', CircularType);

        const circularOpts = {};
        circularOpts.self = circularOpts;

        const renderer = registry.get('circular', circularOpts);
        expect(renderer).toBeDefined();
    });

    it('Symbol 作为名称返回 false', () => {
        const sym = Symbol('test');
        const registry = TypeRegistry.getInstance();
        const result = registry.register(sym, BaseColumnType);
        expect(result).toBe(false);
    });

    it('Proxy 对象作为构造函数', () => {
        const proxyCtor = new Proxy(BaseColumnType, {});
        const registry = TypeRegistry.getInstance();
        const result = registry.register('proxy', proxyCtor);
        expect(result).toBe(true);
    });
});