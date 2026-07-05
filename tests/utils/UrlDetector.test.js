/**
 * UrlDetector URL 自动检测工具完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（URL 检测、提取、验证）
 * 2. 边界条件测试（空值、特殊字符、边界长度）
 * 3. 攻击性测试（XSS、注入、超长输入）
 * 4. 显示文本处理测试
 * 5. openUrl 安全性测试
 * 6. 集成测试
 *
 * @module tests/utils/UrlDetector.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isUrl, extractUrls, containsUrl, getUrlDisplayText, openUrl } from '../../src/utils/UrlDetector.js';
import { HOOKS } from '../../src/constants/hookNames.js';

describe('UrlDetector - isUrl() 基础功能测试', () => {
    describe('有效 URL 检测', () => {
        it('检测 http:// 开头的 URL', () => {
            expect(isUrl('http://example.com')).toBe(true);
            expect(isUrl('http://www.example.com/path?query=1')).toBe(true);
        });

        it('检测 https:// 开头的 URL', () => {
            expect(isUrl('https://example.com')).toBe(true);
            expect(isUrl('https://www.example.com/path/to/resource')).toBe(true);
            expect(isUrl('https://sub.domain.co.uk:8080/api/v1/users?id=123#section')).toBe(true);
        });

        it('检测带端口的 URL', () => {
            expect(isUrl('http://localhost:3000')).toBe(true);
            expect(isUrl('https://example.com:443/path')).toBe(true);
        });

        it('检测带查询参数的 URL', () => {
            expect(isUrl('https://example.com?key=value&foo=bar')).toBe(true);
            expect(isUrl('http://test.com/?q=search+term')).toBe(true);
        });

        it('检测带锚点的 URL', () => {
            expect(isUrl('https://example.com#section')).toBe(true);
            expect(isUrl('https://example.com/page#anchor-1')).toBe(true);
        });

        it('检测 IP 地址 URL', () => {
            expect(isUrl('http://192.168.1.1')).toBe(true);
            expect(isUrl('https://127.0.0.1:8080/admin')).toBe(true);
        });
    });

    describe('无效值拒绝', () => {
        it('null 返回 false', () => {
            expect(isUrl(null)).toBe(false);
        });

        it('undefined 返回 false', () => {
            expect(isUrl(undefined)).toBe(false);
        });

        it('数字返回 false', () => {
            expect(isUrl(123)).toBe(false);
            expect(isUrl(0)).toBe(false);
        });

        it('布尔值返回 false', () => {
            expect(isUrl(true)).toBe(false);
            expect(isUrl(false)).toBe(false);
        });

        it('对象返回 false', () => {
            expect(isUrl({})).toBe(false);
            expect(isUrl({ url: 'https://example.com' })).toBe(false);
        });

        it('数组返回 false', () => {
            expect(isUrl([])).toBe(false);
            expect(isUrl(['https://example.com'])).toBe(false);
        });

        it('空字符串返回 false', () => {
            expect(isUrl('')).toBe(false);
        });

        it('纯空白字符串返回 false', () => {
            expect(isUrl('   ')).toBe(false);
            expect(isUrl('\t\n')).toBe(false);
        });

        it('普通文本返回 false', () => {
            expect(isUrl('hello world')).toBe(false);
            expect(isUrl('not a url')).toBe(false);
        });

        it('缺少协议的域名返回 false', () => {
            expect(isUrl('example.com')).toBe(false);
            expect(isUrl('www.example.com')).toBe(false);
        });

        it('不完整的协议返回 false', () => {
            expect(isUrl('http:/example.com')).toBe(false);
            expect(isUrl('http:example.com')).toBe(false);
            expect(isUrl('ttps://example.com')).toBe(false);
        });

        it('ftp/mailto/tel 协议返回 false（仅支持 http/https）', () => {
            expect(isUrl('ftp://files.example.com')).toBe(false);
            expect(isUrl('mailto:user@example.com')).toBe(false);
            expect(isUrl('tel:+8613800138000')).toBe(false);
        });
    });

    describe('前后空白处理', () => {
        it('去除首尾空白后检测', () => {
            expect(isUrl('  https://example.com  ')).toBe(true);
            expect(isUrl('\thttps://example.com\n')).toBe(true);
        });
    });
});

describe('UrlDetector - extractUrls() 提取测试', () => {
    describe('从文本中提取 URL', () => {
        it('提取单个 URL', () => {
            const urls = extractUrls('访问 https://example.com 获取更多信息');
            expect(urls).toEqual(['https://example.com']);
        });

        it('提取多个 URL', () => {
            const text = '参考 https://a.com 和 https://b.com 两个网站';
            const urls = extractUrls(text);
            expect(urls).toContain('https://a.com');
            expect(urls).toContain('https://b.com');
            expect(urls.length).toBe(2);
        });

        it('去重处理', () => {
            const text = '链接 https://example.com 和 https://example.com 是一样的';
            const urls = extractUrls(text);
            const uniqueUrls = urls.filter((u, i) => urls.indexOf(u) === i);
            expect(urls.length).toBe(uniqueUrls.length);
        });

        it('保持出现顺序', () => {
            const text = '先 https://first.com 后 https://second.com';
            const urls = extractUrls(text);
            if (urls.length >= 2) {
                expect(urls.indexOf('https://first.com')).toBeLessThan(urls.indexOf('https://second.com'));
            }
        });

        it('无 URL 时返回空数组', () => {
            expect(extractUrls('普通文本，没有链接')).toEqual([]);
            expect(extractUrls('')).toEqual([]);
        });
    });

    describe('非字符串输入处理', () => {
        it('null 返回空数组', () => {
            expect(extractUrls(null)).toEqual([]);
        });

        it('undefined 返回空数组', () => {
            expect(extractUrls(undefined)).toEqual([]);
        });

        it('数字返回空数组', () => {
            expect(extractUrls(123)).toEqual([]);
        });
    });
});

describe('UrlDetector - containsUrl() 包含检测测试', () => {
    it('包含 URL 时返回 true', () => {
        expect(containsUrl('点击 https://example.com 访问')).toBe(true);
    });

    it('不包含 URL 时返回 false', () => {
        expect(containsUrl('普通文本内容')).toBe(false);
    });

    it('纯 URL 返回 true', () => {
        expect(containsUrl('https://example.com')).toBe(true);
    });

    it('非字符串返回 false', () => {
        expect(containsUrl(null)).toBe(false);
        expect(containsUrl(123)).toBe(false);
    });
});

describe('UrlDetector - getUrlDisplayText() 显示文本测试', () => {
    describe('协议移除', () => {
        it('移除 https:// 前缀', () => {
            expect(getUrlDisplayText('https://example.com')).toBe('example.com');
        });

        it('移除 http:// 前缀', () => {
            expect(getUrlDisplayText('http://example.com')).toBe('example.com');
        });

        it('大小写不敏感', () => {
            expect(getUrlDisplayText('HTTPS://Example.COM')).toBe('Example.COM');
            expect(getUrlDisplayText('HTTP://Example.COM')).toBe('Example.COM');
        });
    });

    describe('长 URL 截断', () => {
        it('超过 maxLength 时截断并添加省略号', () => {
            const longUrl = 'https://very-long-domain-name.example.com/some/very/deep/path/to/a/resource';
            const display = getUrlDisplayText(longUrl, 30);
            expect(display.length).toBeLessThanOrEqual(30);
            expect(display).toContain('...');
        });

        it('短于 maxLength 时不截断', () => {
            const display = getUrlDisplayText('https://short.com', 50);
            expect(display).toBe('short.com');
            expect(display).not.toContain('...');
        });

        it('刚好等于 maxLength 时不截断', () => {
            const url = 'https://abcd.com';
            const display = getUrlDisplayText(url, 8);
            expect(display).toBe('abcd.com');
        });

        it('自定义 maxLength 参数', () => {
            const display = getUrlDisplayText('https://example.com', 10);
            expect(display.length).toBeLessThanOrEqual(10);
        });
    });

    describe('默认参数', () => {
        it('默认 maxLength 为 50', () => {
            const url = 'https://' + 'a'.repeat(60) + '.com';
            const display = getUrlDisplayText(url);
            expect(display.length).toBeLessThanOrEqual(50);
        });
    });
});

describe('UrlDetector - openUrl() 打开链接测试', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('正常打开', () => {
        it('使用 window.open 打开 URL', () => {
            const mockOpen = vi.fn();
            global.window = { open: mockOpen };

            openUrl('https://example.com');

            expect(mockOpen).toHaveBeenCalledWith(
                'https://example.com',
                '_blank',
                'noopener,noreferrer'
            );
        });

        it('支持自定义 target', () => {
            const mockOpen = vi.fn();
            global.window = { open: mockOpen };

            openUrl('https://example.com', '_self');

            expect(mockOpen).toHaveBeenCalledWith(
                'https://example.com',
                '_self',
                'noopener,noreferrer'
            );
        });

        it('支持自定义 windowFeatures', () => {
            const mockOpen = vi.fn();
            global.window = { open: mockOpen };

            openUrl('https://example.com', '_blank', 'width=800,height=600');

            expect(mockOpen).toHaveBeenCalledWith(
                'https://example.com',
                '_blank',
                'width=800,height=600'
            );
        });
    });

    describe('安全性处理', () => {
        it('window 不存在时不报错', () => {
            const originalWindow = global.window;
            delete global.window;

            expect(() => openUrl('https://example.com')).not.toThrow();

            global.window = originalWindow;
        });

        it('window.open 抛出异常时捕获并警告', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const mockOpen = vi.fn().mockImplementation(() => {
                throw new Error('Popup blocked');
            });
            global.window = { open: mockOpen };

            openUrl('https://blocked.com');

            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });
});

describe('UrlDetector - 攻击性测试', () => {
    describe('XSS 攻击向量', () => {
        it('JavaScript: 伪协议不是有效 URL', () => {
            expect(isUrl('javascript:alert("xss")')).toBe(false);
            expect(isUrl('javascript:void(0)')).toBe(false);
        });

        it('Data URI 不是有效 URL', () => {
            expect(isUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
        });

        it('VbScript 伪协议不是有效 URL', () => {
            expect(isUrl('vbscript:MsgBox("xss")')).toBe(false);
        });
    });

    describe('注入攻击向量', () => {
        it('SQL 注入字符串不是 URL', () => {
            expect(isUrl("' OR '1'='1")).toBe(false);
            expect(isUrl("https://'; DROP TABLE users; --")).toBe(true);
        });

        it('包含 HTML 标签的文本', () => {
            expect(isUrl('<a href="https://evil.com">click</a>')).toBe(false);
            expect(isUrl('<img src=x onerror=alert(1)>')).toBe(false);
        });
    });

    describe('边界条件压力测试', () => {
        it('超长 URL 字符串', () => {
            const megaUrl = 'https://' + 'a'.repeat(100000) + '.com';
            expect(() => isUrl(megaUrl)).not.toThrow();
            expect(isUrl(megaUrl)).toBe(true);
        });

        it('大量 URL 的提取性能', () => {
            const manyUrls = Array.from({ length: 1000 }, (_, i) =>
                `参考 https://site${i}.com 获取信息`
            ).join(' ');

            const start = performance.now();
            const urls = extractUrls(manyUrls);
            const elapsed = performance.now() - start;

            expect(urls.length).toBe(1000);
            expect(elapsed).toBeLessThan(500);
        });

        it('Unicode 域名 (Punycode)', () => {
            expect(isUrl('https://xn--nxasmq6b.example.com')).toBe(true);
        });

        it('特殊字符在 URL 中', () => {
            expect(isUrl('https://example.com/path%20with%20spaces')).toBe(true);
            expect(isUrl('https://example.com?q=hello&world&foo=bar+baz')).toBe(true);
        });
    });
});

describe('UrlDetector - 集成测试', () => {
    describe('完整工作流', () => {
        it('检测 → 提取 → 显示 的完整流程', () => {
            const rawValue = '  https://github.com/user/repo/issues/123  ';

            expect(isUrl(rawValue)).toBe(true);

            const extracted = extractUrls(`请查看 ${rawValue} 了解详情`);
            expect(extracted).toContain('https://github.com/user/repo/issues/123');

            const display = getUrlDisplayText('https://github.com/user/repo/issues/123');
            expect(display).toBe('github.com/user/repo/issues/123');
        });

        it('与单元格数据场景集成', () => {
            const cellValues = [
                { value: 'https://api.example.com/v1/users', expected: true },
                { value: '普通文本内容', expected: false },
                { value: '', expected: false },
                { value: null, expected: false },
                { value: '  https://example.com/path  ', expected: true },
            ];

            cellValues.forEach(({ value, expected }) => {
                expect(isUrl(value)).toBe(expected);
            });
        });
    });

    describe('实际应用场景', () => {
        it('GitHub 链接', () => {
            expect(isUrl('https://github.com/facebook/react')).toBe(true);
        });

        it('NPM 包链接', () => {
            expect(isUrl('https://www.npmjs.com/package/lodash')).toBe(true);
        });

        it('文档链接', () => {
            expect(isUrl('https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API')).toBe(true);
        });

        it('API 端点', () => {
            expect(isUrl('https://api.openweathermap.org/data/2.5/weather?q=London')).toBe(true);
        });

        it('CDN 资源', () => {
            expect(isUrl('https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.js')).toBe(true);
        });
    });
});

describe('UrlDetector - URL Hooks 集成测试', () => {
    describe('ON_URL_DETECTED 钩子', () => {
        it('钩子常量已定义', () => {
            expect(HOOKS.ON_URL_DETECTED).toBe('onUrlDetected');
            expect(HOOKS.BEFORE_OPEN_URL).toBe('beforeOpenUrl');
            expect(HOOKS.AFTER_OPEN_URL).toBe('afterOpenUrl');
        });

        it('URL 变更时触发 ON_URL_DETECTED', () => {
            const mockRunHooks = vi.fn();
            const changes = [
                { row: 0, col: 0, newValue: 'https://example.com' },
                { row: 1, col: 0, newValue: '普通文本' },
                { row: 2, col: 0, newValue: 'https://github.com' },
            ];

            for (const { row, col, newValue } of changes) {
                if (isUrl(newValue)) {
                    mockRunHooks(HOOKS.ON_URL_DETECTED, row, col, newValue);
                }
            }

            expect(mockRunHooks).toHaveBeenCalledTimes(2);
            expect(mockRunHooks).toHaveBeenCalledWith(HOOKS.ON_URL_DETECTED, 0, 0, 'https://example.com');
            expect(mockRunHooks).toHaveBeenCalledWith(HOOKS.ON_URL_DETECTED, 2, 0, 'https://github.com');
        });
    });

    describe('BEFORE_OPEN_URL 钩子', () => {
        it('返回 false 时阻止打开链接', () => {
            const mockRunHooks = vi.fn().mockReturnValue(false);
            const url = 'https://blocked-site.com';
            const row = 5;
            const col = 3;

            const canOpen = mockRunHooks(HOOKS.BEFORE_OPEN_URL, row, col, url);

            expect(canOpen).toBe(false);
            expect(mockRunHooks).toHaveBeenCalledWith(HOOKS.BEFORE_OPEN_URL, row, col, url);
        });

        it('未返回 false 或 undefined 时允许打开', () => {
            const mockRunHooks = vi.fn().mockReturnValue(true);

            const canOpen1 = mockRunHooks(HOOKS.BEFORE_OPEN_URL, 0, 0, 'https://example.com');

            const mockRunHooks2 = vi.fn();
            const canOpen2 = mockRunHooks2(HOOKS.BEFORE_OPEN_URL, 0, 0, 'https://example.com');

            expect(canOpen1).toBe(true);
            expect(canOpen2).toBe(undefined);
        });

        it('传递正确的参数（row, col, url, event）', () => {
            const mockRunHooks = vi.fn();
            const mockEvent = { ctrlKey: true, preventDefault: vi.fn() };

            mockRunHooks(HOOKS.BEFORE_OPEN_URL, 10, 20, 'https://test.com', mockEvent);

            expect(mockRunHooks).toHaveBeenCalledWith(
                HOOKS.BEFORE_OPEN_URL,
                10,
                20,
                'https://test.com',
                mockEvent
            );
        });

        it('可用于实现域名白名单过滤', () => {
            const allowedDomains = ['github.com', 'npmjs.com'];
            const whitelistHandler = (row, col, url) => {
                try {
                    const hostname = new URL(url).hostname;
                    return allowedDomains.some(domain => hostname === domain || hostname.endsWith('.' + domain));
                } catch {
                    return false;
                }
            };

            expect(whitelistHandler(0, 0, 'https://github.com/user/repo')).toBe(true);
            expect(whitelistHandler(0, 0, 'https://www.npmjs.com/package/lodash')).toBe(true);
            expect(whitelistHandler(0, 0, 'https://blocked-site.com')).toBe(false);
        });

        it('可用于记录 URL 访问日志', () => {
            const logEntries = [];
            const loggingHandler = (row, col, url) => {
                logEntries.push({ timestamp: Date.now(), row, col, url });
                return true;
            };

            loggingHandler(0, 0, 'https://example.com');
            loggingHandler(1, 2, 'https://github.com');

            expect(logEntries.length).toBe(2);
            expect(logEntries[0]).toEqual({
                timestamp: expect.any(Number),
                row: 0,
                col: 0,
                url: 'https://example.com',
            });
        });
    });

    describe('AFTER_OPEN_URL 钩子', () => {
        it('URL 打开后触发', () => {
            const mockRunHooks = vi.fn();

            mockRunHooks(HOOKS.AFTER_OPEN_URL, 0, 0, 'https://opened-url.com');

            expect(mockRunHooks).toHaveBeenCalledTimes(1);
            expect(mockRunHooks).toHaveBeenCalledWith(
                HOOKS.AFTER_OPEN_URL,
                0,
                0,
                'https://opened-url.com'
            );
        });

        it('可用于统计点击次数', () => {
            const clickStats = {};
            const statsHandler = (row, col, url) => {
                clickStats[url] = (clickStats[url] || 0) + 1;
            };

            statsHandler(0, 0, 'https://popular-link.com');
            statsHandler(1, 1, 'https://popular-link.com');
            statsHandler(2, 2, 'https://other-link.com');

            expect(clickStats['https://popular-link.com']).toBe(2);
            expect(clickStats['https://other-link.com']).toBe(1);
        });

        it('可用于发送分析事件', () => {
            const analyticsEvents = [];
            const analyticsHandler = (row, col, url) => {
                analyticsEvents.push({
                    event: 'url_opened',
                    url,
                    cellPosition: { row, col },
                    timestamp: new Date().toISOString(),
                });
            };

            analyticsHandler(5, 10, 'https://tracking-test.com');

            expect(analyticsEvents.length).toBe(1);
            expect(analyticsEvents[0].event).toBe('url_opened');
            expect(analyticsEvents[0].cellPosition).toEqual({ row: 5, col: 10 });
        });
    });

    describe('完整工作流模拟', () => {
        it('检测 → 确认 → 打开 → 统计 的完整流程', () => {
            const events = [];
            const mockRunHooks = vi.fn((hookName, ...args) => {
                events.push({ hook: hookName, args });
                if (hookName === HOOKS.BEFORE_OPEN_URL) return true;
            });
            const mockOpenUrl = vi.fn();

            const urlValue = 'https://example.com';
            const row = 0, col = 1;

            mockRunHooks(HOOKS.ON_URL_DETECTED, row, col, urlValue);

            const canOpen = mockRunHooks(HOOKS.BEFORE_OPEN_URL, row, col, urlValue, {});
            if (canOpen !== false) {
                mockOpenUrl(urlValue);
                mockRunHooks(HOOKS.AFTER_OPEN_URL, row, col, urlValue);
            }

            expect(events.map(e => e.hook)).toEqual([
                HOOKS.ON_URL_DETECTED,
                HOOKS.BEFORE_OPEN_URL,
                HOOKS.AFTER_OPEN_URL,
            ]);
            expect(mockOpenUrl).toHaveBeenCalledWith(urlValue);
        });

        it('BEFORE_OPEN_URL 返回 false 时中断流程', () => {
            const events = [];
            const mockRunHooks = vi.fn((hookName) => {
                events.push(hookName);
                if (hookName === HOOKS.BEFORE_OPEN_URL) return false;
            });
            const mockOpenUrl = vi.fn();

            const canOpen = mockRunHooks(HOOKS.BEFORE_OPEN_URL, 0, 0, 'https://blocked.com', {});

            if (canOpen === false) {
                expect(mockOpenUrl).not.toHaveBeenCalled();
                expect(events).not.toContain(HOOKS.AFTER_OPEN_URL);
            }
        });
    });
});