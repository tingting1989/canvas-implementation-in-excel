/**
 * HyperlinkColumnType 超链接列类型完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 配置选项测试
 * 3. 攻击性测试（边界条件、异常输入）
 * 4. 集成测试
 * 5. Hooks 系统测试
 *
 * @module tests/types/HyperlinkColumnType.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HyperlinkColumnType } from '../../src/types/HyperlinkColumnType.js';

describe('HyperlinkColumnType - 基础功能测试', () => {
    let hyperlinkType;

    beforeEach(() => {
        hyperlinkType = new HyperlinkColumnType();
    });

    describe('基本属性', () => {
        it('name 应该是 "hyperlink"', () => {
            expect(hyperlinkType.name).toBe('hyperlink');
        });

        it('editorType 应该是 "text"', () => {
            expect(hyperlinkType.editorType).toBe('text');
        });
    });

    describe('format() 方法', () => {
        it('undefined 返回空字符串', () => {
            expect(hyperlinkType.format(undefined)).toBe('');
        });

        it('null 返回空字符串', () => {
            expect(hyperlinkType.format(null)).toBe('');
        });

        it('空字符串返回空字符串', () => {
            expect(hyperlinkType.format('')).toBe('');
        });

        it('纯 URL 字符串应该简化显示', () => {
            const result = hyperlinkType.format('https://www.example.com/path/to/page');
            expect(result).not.toContain('https://');
            expect(result).toBe('www.example.com/path/to/page');
        });

        it('超长 URL 应该截断', () => {
            const longUrl = 'https://www.example.com/' + 'a'.repeat(100);
            const result = hyperlinkType.format(longUrl);
            expect(result.length).toBeLessThan(60);
            expect(result).toContain('...');
        });

        it('对象格式 {url, text} 应该显示 text', () => {
            const result = hyperlinkType.format({
                url: 'https://example.com',
                text: '点击访问'
            });
            expect(result).toBe('点击访问');
        });

        it('对象格式缺少 text 时显示简化 URL', () => {
            const result = hyperlinkType.format({
                url: 'https://example.com'
            });
            expect(result).toBe('example.com');
        });
    });

    describe('validate() 方法', () => {
        it('空值应该通过验证', () => {
            expect(hyperlinkType.validate('')).toBe(true);
            expect(hyperlinkType.validate(undefined)).toBe(true);
            expect(hyperlinkType.validate(null)).toBe(true);
        });

        it('有效 URL 应该通过验证', () => {
            expect(hyperlinkType.validate('https://example.com')).toBe(true);
            expect(hyperlinkType.validate('http://example.com')).toBe(true);
        });

        it('无效 URL 应该返回错误信息', () => {
            expect(hyperlinkType.validate('not-a-url')).toContain('有效的');
            expect(hyperlinkType.validate('ftp://example.com')).toContain('有效的');
        });

        it('对象格式缺少 url 字段应该返回错误', () => {
            expect(hyperlinkType.validate({ text: '点击' })).toContain('url 字段');
        });

        it('对象格式 url 无效应该返回错误', () => {
            expect(hyperlinkType.validate({ url: 'invalid', text: '点击' })).toContain('URL 格式');
        });

        it('对象格式有效应该通过验证', () => {
            expect(hyperlinkType.validate({
                url: 'https://example.com',
                text: '点击访问'
            })).toBe(true);
        });
    });

    describe('parse() 方法', () => {
        it('纯 URL 字符串直接返回', () => {
            expect(hyperlinkType.parse('https://example.com')).toBe('https://example.com');
        });

        it('"显示文本|URL" 格式应该解析为对象', () => {
            const result = hyperlinkType.parse('点击访问|https://example.com');
            expect(result).toEqual({
                url: 'https://example.com',
                text: '点击访问'
            });
        });

        it('无效 URL 的 "显示文本|URL" 格式应该返回原始字符串', () => {
            const result = hyperlinkType.parse('点击|invalid-url');
            expect(result).toBe('点击|invalid-url');
        });

        it('null/undefined 保持原样', () => {
            expect(hyperlinkType.parse(null)).toBeNull();
            expect(hyperlinkType.parse(undefined)).toBeUndefined();
        });

        it('空字符串返回空字符串', () => {
            expect(hyperlinkType.parse('')).toBe('');
        });
    });

    describe('getDefaultStyle() 方法', () => {
        it('应该添加手型光标', () => {
            const style = hyperlinkType.getDefaultStyle({});
            expect(style.cursor).toBe('pointer');
        });

        it('保留原有样式属性', () => {
            const baseStyle = { color: 'red', fontSize: 14 };
            const style = hyperlinkType.getDefaultStyle(baseStyle);
            expect(style.color).toBe('red');
            expect(style.fontSize).toBe(14);
            expect(style.cursor).toBe('pointer');
        });

        it('不覆盖已有的 cursor', () => {
            const style = hyperlinkType.getDefaultStyle({ cursor: 'default' });
            expect(style.cursor).toBe('default');
        });
    });

    describe('getUrl() 方法', () => {
        it('纯 URL 字符串应该返回 URL', () => {
            expect(hyperlinkType.getUrl('https://example.com')).toBe('https://example.com');
        });

        it('对象格式应该返回 url 字段', () => {
            expect(hyperlinkType.getUrl({ url: 'https://example.com', text: '点击' })).toBe('https://example.com');
        });

        it('无效 URL 应该返回 null', () => {
            expect(hyperlinkType.getUrl('not-a-url')).toBeNull();
            expect(hyperlinkType.getUrl({ url: 'invalid' })).toBeNull();
        });

        it('空值应该返回 null', () => {
            expect(hyperlinkType.getUrl(null)).toBeNull();
            expect(hyperlinkType.getUrl(undefined)).toBeNull();
            expect(hyperlinkType.getUrl('')).toBeNull();
        });
    });
});

describe('HyperlinkColumnType - 配置选项测试', () => {
    it('maxDisplayLength 配置生效', () => {
        const type = new HyperlinkColumnType({ maxDisplayLength: 20 });
        const longUrl = 'https://www.example.com/path/to/resource';
        
        const result = type.format(longUrl);
        expect(result.length).toBeLessThanOrEqual(23); // 20 + 3 个省略号
        expect(result).toContain('...');
    });

    it('默认 maxDisplayLength 为 50', () => {
        const type = new HyperlinkColumnType();
        const url = 'https://' + 'a'.repeat(60) + '.com';
        
        const result = type.format(url);
        expect(result.length).toBeLessThan(60);
    });
});

describe('HyperlinkColumnType - 攻击性测试', () => {
    describe('异常输入测试', () => {
        it('XSS 攻击向量', () => {
            const type = new HyperlinkColumnType();
            const xssPayloads = [
                '<script>alert("xss")</script>',
                '"><script>alert(document.cookie)</script>',
                "javascript:alert('xss')",
                '<img src=x onerror=alert(1)>',
            ];

            xssPayloads.forEach(payload => {
                expect(() => type.format(payload)).not.toThrow();
                expect(() => type.validate(payload)).not.toThrow();
                expect(() => type.parse(payload)).not.toThrow();
            });
        });

        it('超长 URL 处理', () => {
            const type = new HyperlinkColumnType();
            const megaUrl = 'https://example.com/' + 'a'.repeat(10000);

            const startTime = performance.now();
            const formatted = type.format(megaUrl);
            const elapsed = performance.now() - startTime;

            expect(formatted.length).toBeLessThan(60);
            expect(elapsed).toBeLessThan(100);
        });

        it('特殊字符 URL', () => {
            const type = new HyperlinkColumnType();
            const specialUrls = [
                'https://example.com/path?a=1&b=2',
                'https://example.com/#section',
                'https://example.com/path with spaces',
                'https://example.com/中文路径',
            ];

            specialUrls.forEach(url => {
                expect(() => type.format(url)).not.toThrow();
            });
        });
    });

    describe('边界条件测试', () => {
        it('空对象作为值', () => {
            const type = new HyperlinkColumnType();
            expect(type.validate({})).toBe('超链接对象必须包含 url 字段');
            expect(type.format({})).toBe('');
        });

        it('嵌套对象作为值', () => {
            const type = new HyperlinkColumnType();
            const nested = { url: { inner: 'value' }, text: 'test' };
            expect(type.validate(nested)).toBe('无效的 URL 格式');
        });

        it('url 字段为 null', () => {
            const type = new HyperlinkColumnType();
            expect(type.validate({ url: null, text: 'test' })).toBe('无效的 URL 格式');
        });
    });
});

describe('HyperlinkColumnType - 集成测试', () => {
    it('与 BaseColumnType 接口兼容', () => {
        const type = new HyperlinkColumnType();

        expect(typeof type.format).toBe('function');
        expect(typeof type.validate).toBe('function');
        expect(typeof type.parse).toBe('function');
        expect(typeof type.getDefaultStyle).toBe('function');
        expect(typeof type.getEditorOptions).toBe('function');
        expect(typeof type.getDefaultValue).toBe('function');
        expect(typeof type.compare).toBe('function');
        expect(typeof type.getUrl).toBe('function');
        expect(typeof type.openLink).toBe('function');
    });

    it('格式化和解析的往返一致性', () => {
        const type = new HyperlinkColumnType();
        
        // 纯 URL
        const urlResult = type.parse('https://example.com');
        expect(urlResult).toBe('https://example.com');
        
        // 对象格式
        const objResult = type.parse('显示文本|https://example.com');
        expect(objResult).toEqual({ url: 'https://example.com', text: '显示文本' });
        expect(type.format(objResult)).toBe('显示文本');
    });

    it('validate 通过后 format 不应报错', () => {
        const type = new HyperlinkColumnType();
        const validValues = [
            'https://example.com',
            { url: 'https://example.com', text: '点击' }
        ];

        validValues.forEach(value => {
            expect(type.validate(value)).toBe(true);
            expect(() => type.format(value)).not.toThrow();
        });
    });
});

describe('HyperlinkColumnType - Hooks 系统测试', () => {
    it('openLink 不传入 hooks 时应该正常工作', () => {
        const type = new HyperlinkColumnType();
        const result = type.openLink('https://example.com');
        
        expect(result).toBe(true);
    });

    it('openLink 传入 hooks 时应该触发 BEFORE_OPEN_URL', () => {
        const type = new HyperlinkColumnType();
        let beforeOpenCalled = false;
        
        const mockHooks = {
            runHooksUntil: (hookName, ...args) => {
                if (hookName === 'beforeOpenUrl') {
                    beforeOpenCalled = true;
                    expect(args[0]).toBe(1);
                    expect(args[1]).toBe(2);
                    expect(args[2]).toBe('https://example.com');
                }
                return undefined;
            },
            runHooks: () => {}
        };

        type.openLink('https://example.com', {
            row: 1,
            col: 2,
            hooks: mockHooks
        });

        expect(beforeOpenCalled).toBe(true);
    });

    it('BEFORE_OPEN_URL 返回 false 时应该阻止打开', () => {
        const type = new HyperlinkColumnType();
        
        const mockHooks = {
            runHooksUntil: () => false,
            runHooks: () => {}
        };

        const result = type.openLink('https://example.com', {
            hooks: mockHooks
        });

        expect(result).toBe(false);
    });

    it('openLink 应该触发 AFTER_OPEN_URL', () => {
        const type = new HyperlinkColumnType();
        let afterOpenCalled = false;
        
        const mockHooks = {
            runHooksUntil: () => undefined,
            runHooks: (hookName, ...args) => {
                if (hookName === 'afterOpenUrl') {
                    afterOpenCalled = true;
                    expect(args[0]).toBe(1);
                    expect(args[1]).toBe(2);
                    expect(args[2]).toBe('https://example.com');
                }
            }
        };

        type.openLink('https://example.com', {
            row: 1,
            col: 2,
            hooks: mockHooks
        });

        expect(afterOpenCalled).toBe(true);
    });
});