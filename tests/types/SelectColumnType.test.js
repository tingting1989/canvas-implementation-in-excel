/**
 * SelectColumnType 选择列类型完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. source 配置选项测试
 * 4. allowInvalid/strict 选项测试
 * 5. 集成测试
 * 6. 源码 Bug 检测
 *
 * @module tests/types/SelectColumnType.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SelectColumnType } from '../../src/types/SelectColumnType.js';

describe('SelectColumnType - 基础功能测试', () => {
    let selectType;

    beforeEach(() => {
        selectType = new SelectColumnType({
            source: ['选项A', '选项B', '选项C']
        });
    });

    describe('基本属性', () => {
        it('name 应该是 "select"', () => {
            expect(selectType.name).toBe('select');
        });

        it('editorType 应该是 "select"', () => {
            expect(selectType.editorType).toBe('select');
        });
    });

    describe('format() 方法', () => {
        it('undefined/null 返回空字符串', () => {
            expect(selectType.format(undefined)).toBe('');
            expect(selectType.format(null)).toBe('');
        });

        it('选项值转为字符串', () => {
            expect(selectType.format('选项A')).toBe('选项A');
            expect(selectType.format(123)).toBe('123');
        });
    });

    describe('validate() 方法', () => {
        it('空值应该通过验证', () => {
            expect(selectType.validate('')).toBe(true);
            expect(selectType.validate(undefined)).toBe(true);
            expect(selectType.validate(null)).toBe(true);
        });

        it('在 source 中的值应该通过验证', () => {
            expect(selectType.validate('选项A')).toBe(true);
            expect(selectType.validate('选项B')).toBe(true);
            expect(selectType.validate('选项C')).toBe(true);
        });

        it('不在 source 中的值应该验证失败', () => {
            expect(selectType.validate('选项D')).toBe(false);
            expect(selectType.validate('unknown')).toBe(false);
        });

        it('空 source 允许任何值', () => {
            const emptySourceType = new SelectColumnType({ source: [] });
            expect(emptySourceType.validate('anything')).toBe(true);
        });

        it('无 source 允许任何值', () => {
            const noSourceType = new SelectColumnType();
            expect(noSourceType.validate('anything')).toBe(true);
        });
    });

    describe('parse() 方法', () => {
        it('精确匹配 source 中的值', () => {
            expect(selectType.parse('选项A')).toBe('选项A');
            expect(selectType.parse('选项B')).toBe('选项B');
        });

        it('不在 source 中的值根据 allowInvalid 处理', () => {
            expect(selectType.parse('选项D')).toBe('');

            const allowInvalidType = new SelectColumnType({
                source: ['A', 'B'],
                allowInvalid: true
            });
            expect(allowInvalidType.parse('C')).toBe('C');
        });

        it('空值返回空字符串', () => {
            expect(selectType.parse('')).toBe('');
            expect(selectType.parse(null)).toBe('');
            expect(selectType.parse(undefined)).toBe('');
        });

        it('trim 输入值', () => {
            expect(selectType.parse('  选项A  ')).toBe('选项A');
        });
    });

    describe('getEditorOptions() 方法', () => {
        it('返回正确的编辑器选项', () => {
            const options = selectType.getEditorOptions();

            expect(options.source).toEqual(['选项A', '选项B', '选项C']);
            expect(options.allowInvalid).toBe(false);
            expect(options.strict).toBe(false);
        });

        it('使用配置的选项', () => {
            const type = new SelectColumnType({
                source: ['X', 'Y'],
                allowInvalid: true,
                strict: true
            });

            const options = type.getEditorOptions();
            expect(options.source).toEqual(['X', 'Y']);
            expect(options.allowInvalid).toBe(true);
            expect(options.strict).toBe(true);
        });
    });

    describe('compare() 方法', () => {
        it('按 source 顺序排序', () => {
            expect(selectType.compare('选项C', '选项A', 'asc')).toBeGreaterThan(0);
            expect(selectType.compare('选项A', '选项C', 'asc')).toBeLessThan(0);
            expect(selectType.compare('选项A', '选项A', 'asc')).toBe(0);
        });

        it('不在 source 中的值排到最后', () => {
            expect(selectType.compare('未知', '选项A', 'asc')).toBeGreaterThan(0);
            expect(selectType.compare('选项A', '未知', 'asc')).toBeLessThan(0);
        });

        it('无 source 时按字典序排序', () => {
            const noSourceType = new SelectColumnType();
            const result = noSourceType.compare('banana', 'apple', 'asc');
            expect(result).toBeGreaterThan(0);
        });
    });
});

describe('SelectColumnType - 配置选项测试', () => {
    describe('source 选项', () => {
        it('数组类型的 source', () => {
            const type = new SelectColumnType({ source: ['a', 'b', 'c'] });
            expect(type.validate('a')).toBe(true);
            expect(type.validate('d')).toBe(false);
        });

        it('空数组 source', () => {
            const type = new SelectColumnType({ source: [] });
            expect(type.validate('anything')).toBe(true);
        });

        it('包含特殊字符的 source', () => {
            const type = new SelectColumnType({
                source: ['option with spaces', 'option-with-dashes', 'option.with.dots']
            });

            expect(type.validate('option with spaces')).toBe(true);
            expect(type.parse('option with spaces')).toBe('option with spaces');
        });

        it('包含中文的 source', () => {
            const type = new SelectColumnType({
                source: ['北京', '上海', '广州']
            });

            expect(type.validate('北京')).toBe(true);
            expect(type.parse('北京')).toBe('北京');
        });
    });

    describe('allowInvalid 选项', () => {
        it('allowInvalid=false (默认)', () => {
            const type = new SelectColumnType({
                source: ['A', 'B'],
                allowInvalid: false
            });

            expect(type.validate('C')).toBe(false);
            expect(type.parse('C')).toBe('');
        });

        it('allowInvalid=true', () => {
            const type = new SelectColumnType({
                source: ['A', 'B'],
                allowInvalid: true
            });

            expect(type.validate('C')).toBe(true);
            expect(type.parse('C')).toBe('C');
        });
    });

    describe('strict 选项', () => {
        it('strict 选项传递到 getEditorOptions', () => {
            const type = new SelectColumnType({
                source: ['A', 'B'],
                strict: true
            });

            const options = type.getEditorOptions();
            expect(options.strict).toBe(true);
        });
    });
});

describe('SelectColumnType - 攻击性测试', () => {
    describe('异常输入测试', () => {
        it('XSS 向量', () => {
            const type = new SelectColumnType({
                source: ['<script>alert("xss")</script>', 'normal']
            });

            expect(() => type.format('<script>alert("xss")</script>')).not.toThrow();
            expect(() => type.validate('<script>alert("xss")</script>')).not.toThrow();
        });

        it('超长选项值', () => {
            const longOption = 'a'.repeat(10000);
            const type = new SelectColumnType({ source: [longOption] });

            expect(type.validate(longOption)).toBe(true);
            expect(type.parse(longOption)).toBe(longOption);
        });

        it('Unicode 和特殊字符选项', () => {
            const type = new SelectColumnType({
                source: ['🎉选项', '日本語オプション', '\u0000\u001f', '  spaced  ']
            });

            type.source.forEach(option => {
                expect(() => type.validate(option)).not.toThrow();
                expect(() => type.parse(option)).not.toThrow();
            });
        });

        it('大量 source 选项', () => {
            const largeSource = Array.from({ length: 1000 }, (_, i) => `选项${i}`);
            const type = new SelectColumnType({ source: largeSource });

            const start = performance.now();
            expect(type.validate('选项500')).toBe(true);
            expect(type.validate('选项1001')).toBe(false);
            const elapsed = performance.now() - start;

            expect(elapsed).toBeLessThan(50);
        });
    });

    describe('边界条件测试', () => {
        it('空字符串作为选项', () => {
            const type = new SelectColumnType({ source: ['', 'non-empty'] });

            expect(type.validate('')).toBe(true);
            expect(type.validate('non-empty')).toBe(true);
        });

        it('重复的选项值', () => {
            const type = new SelectColumnType({ source: ['same', 'same'] });

            expect(type.validate('same')).toBe(true);
            expect(type.parse('same')).toBe('same');
        });

        it('大小写敏感', () => {
            const type = new SelectColumnType({ source: ['Option'] });

            expect(type.validate('Option')).toBe(true);
            expect(type.validate('option')).toBe(false);
            expect(type.validate('OPTION')).toBe(false);
        });

        it('数值类型选项', () => {
            const type = new SelectColumnType({ source: [1, 2, 3] });

            expect(type.validate(1)).toBe(true);
            expect(type.validate('1')).toBe(false);  // 字符串 '1' 不在 source 中
            expect(type.parse(1)).toBe(1);           // 精确匹配数字 1
            expect(type.parse('1')).toBe('');        // 不允许无效值时返回空字符串
        });
    });

    describe('性能压力测试', () => {
        it('高频 validate 调用', () => {
            const type = new SelectColumnType({
                source: Array.from({ length: 100 }, (_, i) => `opt_${i}`)
            });
            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                type.validate(`opt_${i % 100}`);
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(300);
        });

        it('高频 parse 调用', () => {
            const type = new SelectColumnType({
                source: Array.from({ length: 100 }, (_, i) => `opt_${i}`)
            });
            const start = performance.now();

            for (let i = 0; i < 10000; i++) {
                type.parse(`opt_${i % 100}`);
            }

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(300);
        });

        it('高频 compare 调用', () => {
            const type = new SelectColumnType({
                source: Array.from({ length: 100 }, (_, i) => `opt_${i}`)
            });
            const data = Array.from({ length: 1000 }, (_, i) => `opt_${i % 100}`);
            const start = performance.now();

            data.sort((a, b) => type.compare(a, b));

            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(200);
        });
    });
});

describe('SelectColumnType - 集成测试', () => {
    it('与 BaseColumnType 接口兼容', () => {
        const type = new SelectColumnType({ source: ['A', 'B'] });

        expect(typeof type.format).toBe('function');
        expect(typeof type.validate).toBe('function');
        expect(typeof type.parse).toBe('function');
        expect(typeof type.getDefaultStyle).toBe('function');
        expect(typeof type.getEditorOptions).toBe('function');
        expect(typeof type.getDefaultValue).toBe('function');
        expect(typeof type.compare).toBe('function');
    });

    it('validate 通过后可以被正确格式化和解析', () => {
        const type = new SelectColumnType({ source: ['x', 'y', 'z'] });

        ['x', 'y', 'z'].forEach(value => {
            expect(type.validate(value)).toBe(true);
            expect(type.format(value)).toBe(value);
            expect(type.parse(value)).toBe(value);
        });
    });

    it('getEditorOptions 返回值可用于构建 UI', () => {
        const type = new SelectColumnType({
            source: ['red', 'green', 'blue'],
            allowInvalid: false,
            strict: true
        });

        const options = type.getEditorOptions();

        expect(Array.isArray(options.source)).toBe(true);
        expect(options.source.length).toBe(3);
        expect(typeof options.allowInvalid).toBe('boolean');
        expect(typeof options.strict).toBe('boolean');
    });
});

describe('SelectColumnType - Bug 检测', () => {
    describe('源码问题识别', () => {
        it('Bug #1: source 为非数组类型', () => {
            const invalidSources = [
                null,
                undefined,
                'string',
                123,
                { 0: 'a', 1: 'b' },
                function(){},
            ];

            invalidSources.forEach(source => {
                const type = new SelectColumnType({ source });
                expect(type.validate('anything')).toBe(true);
            });
        });

        it('Bug #2: source 包含 null/undefined 元素', () => {
            const type = new SelectColumnType({ source: [null, undefined, 'valid'] });

            expect(type.validate(null)).toBe(true);
            expect(type.validate(undefined)).toBe(true);
            expect(type.validate('valid')).toBe(true);

            console.warn('⚠️  source 中的 null/undefined 可能导致意外行为');
        });

        it('Bug #3: compare() 中 findIndex 性能', () => {
            const largeSource = Array.from({ length: 10000 }, (_, i) => `item_${i}`);
            const type = new SelectColumnType({ source: largeSource });

            const start = performance.now();
            type.compare('item_9999', 'item_0', 'asc');
            const elapsed = performance.now() - start;

            console.log(`10,000 个选项的 compare 耗时: ${elapsed.toFixed(2)}ms`);
            if (elapsed > 10) {
                console.warn('⚠️  大数据量下 compare 性能可能需要优化');
            }
        });

        it('Bug #4: parse() 类型转换问题', () => {
            const type = new SelectColumnType({ source: [123, true, false] });

            const numResult = type.parse('123');
            const boolResult = type.parse('true');

            console.log(`parse('123'): ${numResult} (${typeof numResult})`);
            console.log(`parse('true'): ${boolResult} (${typeof boolResult})`);

            if (numResult !== 123) {
                console.warn('⚠️  数值选项无法通过字符串匹配');
            }
        });

        it('Bug #5: validate 和 parse 行为不一致', () => {
            const type = new SelectColumnType({
                source: ['value'],
                allowInvalid: true
            });

            const validation = type.validate('other');
            const parsed = type.parse('other');

            console.log(`validate('other'): ${validation}`);
            console.log(`parse('other'): ${parsed}`);

            expect(validation).toBe(true);
            expect(parsed).toBe('other');
        });
    });

    describe('边缘行为分析', () => {
        it('空 source 与无 source 的区别', () => {
            const emptySource = new SelectColumnType({ source: [] });
            const noSource = new SelectColumnType();

            expect(emptySource.validate('x')).toBe(true);
            expect(noSource.validate('x')).toBe(true);

            expect(emptySource.getEditorOptions().source).toEqual([]);
            expect(noSource.getEditorOptions().source).toEqual([]);
        });

        it('source 动态修改的影响', () => {
            const type = new SelectColumnType({ source: ['original'] });

            type.options.source.push('added');

            expect(type.validate('added')).toBe(true);
            console.warn('⚠️  外部修改 source 会影响实例行为');
        });

        it('Object.is vs == 的区别', () => {
            const type = new SelectColumnType({ source: [NaN] });

            const validation = type.validate(NaN);
            console.log(`validate(NaN) when source=[NaN]: ${validation}`);
        });
    });
});