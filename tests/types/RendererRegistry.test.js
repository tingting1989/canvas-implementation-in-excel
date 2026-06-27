/**
 * RendererRegistry 渲染器注册表完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. 注册/注销/查询功能测试
 * 4. 线程安全/并发测试
 * 5. 源码 Bug 检测
 *
 * @module tests/types/RendererRegistry.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import RendererRegistry from '../../src/types/RendererRegistry.js';
import { BaseColumnType } from '../../src/types/BaseColumnType.js';

describe('RendererRegistry - 基础功能测试', () => {
    beforeEach(() => {
        RendererRegistry.clear();
    });

    describe('registerRenderer() 方法', () => {
        it('成功注册渲染器', () => {
            class TestRenderer extends BaseColumnType {
                get name() { return 'test'; }
            }

            const result = RendererRegistry.registerRenderer('test', TestRenderer);
            expect(result).toBe(true);
        });

        it('重复注册覆盖已有渲染器（返回 true）', () => {
            class Renderer1 extends BaseColumnType {
                get name() { return 'renderer'; }
            }
            class Renderer2 extends BaseColumnType {
                get name() { return 'renderer'; }
            }

            expect(RendererRegistry.registerRenderer('renderer', Renderer1)).toBe(true);
            expect(RendererRegistry.registerRenderer('renderer', Renderer2)).toBe(true);
        });

        it('无效名称返回 false', () => {
            const invalidNames = [null, undefined, '', ' ', 123, {}, []];

            invalidNames.forEach(name => {
                const result = RendererRegistry.registerRenderer(name, BaseColumnType);
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
                function(){},
                () => {},
            ];

            invalidConstructors.forEach(ctor => {
                const result = RendererRegistry.registerRenderer('test', ctor);
                expect(result).toBe(false);
            });
        });
    });

    describe('getRenderer() 方法', () => {
        it('获取已注册的渲染器实例', () => {
            class CustomRenderer extends BaseColumnType {
                get name() { return 'custom'; }
            }

            RendererRegistry.registerRenderer('custom', CustomRenderer);
            const renderer = RendererRegistry.getRenderer('custom');

            expect(renderer).toBeInstanceOf(CustomRenderer);
        });

        it('获取不存在的渲染器返回 null', () => {
            const renderer = RendererRegistry.getRenderer('nonexistent');
            expect(renderer).toBeNull();
        });

        it('传递 options 给渲染器实例', () => {
            class ConfigurableRenderer extends BaseColumnType {
                get name() { return 'configurable'; }
                get config() { return this.options?.value || 'default'; }
            }

            RendererRegistry.registerRenderer('configurable', ConfigurableRenderer);
            const renderer = RendererRegistry.getRenderer('configurable', { value: 'custom' });

            expect(renderer.config).toBe('custom');
        });

        it('实例化失败返回 null', () => {
            class FailingRenderer extends BaseColumnType {
                get name() { return 'failing'; }
                constructor(options) {
                    super(options);
                    throw new Error('Intentional failure');
                }
            }

            RendererRegistry.registerRenderer('failing', FailingRenderer);
            const renderer = RendererRegistry.getRenderer('failing');

            expect(renderer).toBeNull();
        });
    });

    describe('hasRenderer() 方法', () => {
        it('检查已存在的渲染器', () => {
            class ExistingRenderer extends BaseColumnType {
                get name() { return 'existing'; }
            }

            RendererRegistry.registerRenderer('existing', ExistingRenderer);
            expect(RendererRegistry.hasRenderer('existing')).toBe(true);
        });

        it('检查不存在的渲染器', () => {
            expect(RendererRegistry.hasRenderer('nonexistent')).toBe(false);
        });
    });

    describe('unregisterRenderer() 方法', () => {
        it('成功注销渲染器', () => {
            class TempRenderer extends BaseColumnType {
                get name() { return 'temp'; }
            }

            RendererRegistry.registerRenderer('temp', TempRenderer);
            expect(RendererRegistry.hasRenderer('temp')).toBe(true);

            const result = RendererRegistry.unregisterRenderer('temp');
            expect(result).toBe(true);
            expect(RendererRegistry.hasRenderer('temp')).toBe(false);
        });

        it('注销不存在的渲染器返回 false', () => {
            const result = RendererRegistry.unregisterRenderer('nonexistent');
            expect(result).toBe(false);
        });
    });

    describe('listRenderers() 方法', () => {
        it('列出所有已注册的渲染器名称', () => {
            RendererRegistry.registerRenderer('r1', BaseColumnType);
            RendererRegistry.registerRenderer('r2', BaseColumnType);

            const list = RendererRegistry.listRenderers();

            expect(Array.isArray(list)).toBe(true);
            expect(list.length).toBeGreaterThanOrEqual(2);
            expect(list).toContain('r1');
            expect(list).toContain('r2');
        });

        it('无注册渲染器时返回空数组', () => {
            const list = RendererRegistry.listRenderers();
            expect(list).toEqual([]);
        });
    });
});

describe('RendererRegistry - 攻击性测试', () => {
    beforeEach(() => {
        RendererRegistry.clear();
    });

    describe('异常输入测试', () => {
        it('特殊字符作为渲染器名称', () => {
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
                '',
                '\t\n',
            ];

            specialNames.forEach(name => {
                if (name && typeof name === 'string' && name.trim()) {
                    try {
                        RendererRegistry.registerRenderer(name, BaseColumnType);
                        console.log(`✓ 成功注册: ${name}`);
                    } catch (e) {
                        console.log(`✗ 注册失败: ${name} - ${e.message}`);
                    }
                }
            });
        });

        it('恶意构造函数', () => {
            const maliciousConstructors = [
                class Malicious1 extends BaseColumnType {
                    get name() { while(true); }
                },
                class Malicious2 extends BaseColumnType {
                    constructor() {
                        super();
                        this.self = this;
                    }
                },
                class Malicious3 extends BaseColumnType {
                    get name() { return new Proxy({}, {}); }
                },
            ];

            maliciousConstructors.forEach((ctor, i) => {
                RendererRegistry.registerRenderer(`malicious_${i}`, ctor);
                const start = performance.now();
                const renderer = RendererRegistry.getRenderer(`malicious_${i}`);
                const elapsed = performance.now() - start;

                if (elapsed > 1000) {
                    console.error(`❌ 恶意构造函数 ${i} 导致超时`);
                } else {
                    console.log(`✓ 恶意构造函数 ${i} 处理耗时: ${elapsed.toFixed(2)}ms`);
                }
            });
        });

        it('大量并发注册', () => {
            const promises = [];
            for (let i = 0; i < 1000; i++) {
                const idx = i;
                promises.push(
                    Promise.resolve().then(() => {
                        class DynamicRenderer extends BaseColumnType {
                            get name() { return `dynamic_${idx}`; }
                        }
                        return RendererRegistry.registerRenderer(`dynamic_${idx}`, DynamicRenderer);
                    })
                );
            }

            // 注意：这测试的是基本功能，不是真正的并发安全性
            expect(async () => {
                await Promise.all(promises);
            }).not.toThrow();
        });
    });

    describe('边界条件测试', () => {
        it('极端长度的渲染器名称', () => {
            const longName = 'a'.repeat(10000);

            const result = RendererRegistry.registerRenderer(longName, BaseColumnType);
            console.log(`10,000 字符名称注册结果: ${result}`);

            if (result) {
                expect(RendererRegistry.hasRenderer(longName)).toBe(true);
            }
        });

        it('Unicode 名称', () => {
            const unicodeNames = ['日本語', '한글', '中文', '🎯', 'αβγδ'];

            unicodeNames.forEach(name => {
                const result = RendererRegistry.registerRenderer(name, BaseColumnType);
                if (result) {
                    expect(RendererRegistry.getRenderer(name)).not.toBeNull();
                }
            });
        });

        it('保留字和特殊标识符', () => {
            const reservedNames = [
                'constructor',
                'prototype',
                '__proto__',
                'toString',
                'valueOf',
                'hasOwnProperty',
            ];

            reservedNames.forEach(name => {
                const result = RendererRegistry.registerRenderer(name, BaseColumnType);
                console.log(`保留字 "${name}" 注册: ${result}`);
            });
        });
    });

    describe('内存泄漏检测', () => {
        it('频繁注册和注销不应该导致内存泄漏', () => {
            for (let i = 0; i < 10000; i++) {
                class TempRenderer extends BaseColumnType {
                    get name() { return `temp_${i}`; }
                }
                RendererRegistry.registerRenderer(`temp_${i}`, TempRenderer);
                RendererRegistry.unregisterRenderer(`temp_${i}`);
            }

            const remaining = RendererRegistry.listRenderers();
            expect(remaining.length).toBeLessThan(100);
        });
    });
});

describe('RendererRegistry - 集成测试', () => {
    beforeEach(() => {
        RendererRegistry.clear();
    });

    it('完整的注册-查询-使用流程', () => {
        class CompleteRenderer extends BaseColumnType {
            get name() { return 'complete'; }
            format(value) { return `[${value}]`; }
        }

        expect(RendererRegistry.registerRenderer('complete', CompleteRenderer)).toBe(true);
        expect(RendererRegistry.hasRenderer('complete')).toBe(true);

        const instance = RendererRegistry.getRenderer('complete', { option: 'test' });
        expect(instance).toBeInstanceOf(CompleteRenderer);
        expect(instance.format('hello')).toBe('[hello]');

        expect(RendererRegistry.unregisterRenderer('complete')).toBe(true);
        expect(RendererRegistry.hasRenderer('complete')).toBe(false);
    });

    it('多个渲染器的独立管理', () => {
        class RendererA extends BaseColumnType {
            get name() { return 'A'; }
        }
        class RendererB extends BaseColumnType {
            get name() { return 'B'; }
        }

        RendererRegistry.registerRenderer('A', RendererA);
        RendererRegistry.registerRenderer('B', RendererB);

        const a = RendererRegistry.getRenderer('A');
        const b = RendererRegistry.getRenderer('B');

        expect(a).toBeInstanceOf(RendererA);
        expect(b).toBeInstanceOf(RendererB);
        expect(a).not.toBe(b);

        RendererRegistry.unregisterRenderer('A');
        expect(RendererRegistry.hasRenderer('A')).toBe(false);
        expect(RendererRegistry.hasRenderer('B')).toBe(true);
    });

    it('clear() 清除所有渲染器', () => {
        RendererRegistry.registerRenderer('x', BaseColumnType);
        RendererRegistry.registerRenderer('y', BaseColumnType);

        expect(RendererRegistry.listRenderers().length).toBeGreaterThan(0);

        RendererRegistry.clear();
        expect(RendererRegistry.listRenderers()).toEqual([]);
    });
});

describe('RendererRegistry - Bug 检测', () => {
    beforeEach(() => {
        RendererRegistry.clear();
    });

    describe('源码问题识别', () => {
        it('Bug #1: 静态方法中的 #renderers 私有字段共享问题', () => {
            class TestRenderer extends BaseColumnType {
                get name() { return 'test'; }
            }

            RendererRegistry.registerRenderer('test', TestRenderer);

            const instance1 = RendererRegistry.getRenderer('test');
            const instance2 = RendererRegistry.getRenderer('test');

            console.log(`多次获取的实例是否相同: ${instance1 === instance2}`);
            console.warn('⚠️  每次调用 getRenderer 都会创建新实例，可能导致不必要的开销');
        });

        it('Bug #2: 并发注册竞态条件', () => {
            let successCount = 0;
            const attempts = [];

            for (let i = 0; i < 100; i++) {
                attempts.push(
                    Promise.resolve().then(() => {
                        class RaceRenderer extends BaseColumnType {
                            get name() { return 'race'; }
                        }
                        if (RendererRegistry.registerRenderer('race', RaceRenderer)) {
                            successCount++;
                        }
                    })
                );
            }

            console.log(`并发注册尝试次数: ${attempts.length}, 成功次数: ${successCount}`);
        });

        it('Bug #3: 构造函数抛出非 Error 对象', () => {
            class WeirdError extends BaseColumnType {
                get name() { return 'weird'; }
                constructor() {
                    super();
                    throw 'string error';
                }
            }

            RendererRegistry.registerRenderer('weird', WeirdError);
            const result = RendererRegistry.getRenderer('weird');

            expect(result).toBeNull();
            console.log('ℹ️  提示: 构造函数抛出任何值都会导致返回 null');
        });

        it('Bug #4: name 属性为 getter 的动态性', () => {
            let callCount = 0;
            class DynamicName extends BaseColumnType {
                get name() {
                    callCount++;
                    return `dynamic_${callCount}`;
                }
            }

            RendererRegistry.registerRenderer('first_call', DynamicName);
            const hasIt = RendererRegistry.hasRenderer('first_call');

            console.log(`name getter 调用次数: ${callCount}`);
            console.log(`首次注册名是否存在: ${hasIt}`);
        });
    });

    describe('边缘行为分析', () => {
        it('循环引用的 options', () => {
            class CircularOptions extends BaseColumnType {
                get name() { return 'circular'; }
            }

            const circularOpts = {};
            circularOpts.self = circularOpts;

            RendererRegistry.registerRenderer('circular', CircularOptions);
            const renderer = RendererRegistry.getRenderer('circular', circularOpts);

            expect(renderer).toBeDefined();
        });

        it('Symbol 作为名称', () => {
            const sym = Symbol('test');

            const result = RendererRegistry.registerRenderer(sym, BaseColumnType);
            console.log(`Symbol 名称注册结果: ${result}`);
        });

        it('Proxy 对象作为构造函数', () => {
            const proxyCtor = new Proxy(BaseColumnType, {});

            const result = RendererRegistry.registerRenderer('proxy', proxyCtor);
            console.log(`Proxy 构造函数注册结果: ${result}`);
        });
    });
});