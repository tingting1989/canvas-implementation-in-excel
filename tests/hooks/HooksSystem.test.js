import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HOOKS } from '../../src/constants/hookNames.js';
import { Hooks } from '../../src/editor/Hooks.js';

describe('Hooks 系统 - 单元测试', () => {
    let hooks;

    beforeEach(() => {
        hooks = new Hooks();
        hooks.init();
    });

    describe('初始化', () => {
        it('应该正确初始化所有默认钩子类型', () => {
            const hookNames = hooks.getHookNames();
            const expectedCount = Object.keys(HOOKS).length;
            
            expect(hookNames.length).toBe(expectedCount);
            expect(hookNames).toContain(HOOKS.ON_CELL_CLICK);
            expect(hookNames).toContain(HOOKS.BEFORE_CHANGE);
            expect(hookNames).toContain(HOOKS.AFTER_CHANGE);
        });

        it('重复调用 init 不应报错', () => {
            expect(() => {
                hooks.init();
                hooks.init();
            }).not.toThrow();
        });
    });

    describe('addHook - 添加钩子', () => {
        it('应该成功添加钩子回调', () => {
            const callback = vi.fn();
            hooks.addHook(HOOKS.ON_CELL_CLICK, callback);

            expect(hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(true);
            expect(hooks.getHooks(HOOKS.ON_CELL_CLICK)).toHaveLength(1);
        });

        it('应该支持添加多个回调到同一钩子', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();
            const callback3 = vi.fn();

            hooks.addHook(HOOKS.ON_CELL_CLICK, callback1);
            hooks.addHook(HOOKS.ON_CELL_CLICK, callback2);
            hooks.addHook(HOOKS.ON_CELL_CLICK, callback3);

            expect(hooks.getHooks(HOOKS.ON_CELL_CLICK)).toHaveLength(3);
        });

        it('应该支持动态添加未预定义的钩子类型', () => {
            const callback = vi.fn();
            hooks.addHook('customHook', callback);

            expect(hooks.hasHook('customHook')).toBe(true);
            expect(hooks.getHooks('customHook')).toContain(callback);
        });

        it('非函数回调应该抛出错误', () => {
            expect(() => {
                hooks.addHook(HOOKS.ON_CELL_CLICK, 'not a function');
            }).toThrow();

            expect(() => {
                hooks.addHook(HOOKS.ON_CELL_CLICK, null);
            }).toThrow();

            expect(() => {
                hooks.addHook(HOOKS.ON_CELL_CLICK, undefined);
            }).toThrow();

            expect(() => {
                hooks.addHook(HOOKS.ON_CELL_CLICK, 123);
            }).toThrow();
        });
    });

    describe('addHookOnce - 一次性钩子', () => {
        it('触发一次后应该自动移除', () => {
            const callback = vi.fn();
            hooks.addHookOnce(HOOKS.ON_CELL_CLICK, callback);

            // 第一次触发
            hooks.runHooks(HOOKS.ON_CELL_CLICK, 1, 2);
            expect(callback).toHaveBeenCalledTimes(1);

            // 第二次触发 - 应该不再调用
            hooks.runHooks(HOOKS.ON_CELL_CLICK, 3, 4);
            expect(callback).toHaveBeenCalledTimes(1); // 仍然是 1 次

            expect(hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(false);
        });

        it('应该正确传递参数', () => {
            const callback = vi.fn();
            hooks.addHookOnce(HOOKS.BEFORE_CHANGE, callback);

            hooks.runHooks(HOOKS.BEFORE_CHANGE, { row: 0, col: 0, value: 'test' });

            expect(callback).toHaveBeenCalledWith({ row: 0, col: 0, value: 'test' });
        });
    });

    describe('removeHook - 移除钩子', () => {
        it('应该成功移除指定的回调', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            hooks.addHook(HOOKS.ON_CELL_CLICK, callback1);
            hooks.addHook(HOOKS.ON_CELL_CLICK, callback2);

            hooks.removeHook(HOOKS.ON_CELL_CLICK, callback1);

            expect(hooks.getHooks(HOOKS.ON_CELL_CLICK)).toHaveLength(1);
            expect(hooks.getHooks(HOOKS.ON_CELL_CLICK)).toContain(callback2);
            expect(hooks.getHooks(HOOKS.ON_CELL_CLICK)).not.toContain(callback1);
        });

        it('移除不存在的回调不应报错', () => {
            const callback = vi.fn();
            
            expect(() => {
                hooks.removeHook(HOOKS.ON_CELL_CLICK, callback);
            }).not.toThrow();
        });
    });

    describe('clearHook / clearAllHooks - 清除钩子', () => {
        it('clearHook 应该清除指定钩子的所有回调', () => {
            hooks.addHook(HOOKS.ON_CELL_CLICK, vi.fn());
            hooks.addHook(HOOKS.ON_CELL_CLICK, vi.fn());
            hooks.addHook(HOOKS.AFTER_CHANGE, vi.fn());

            hooks.clearHook(HOOKS.ON_CELL_CLICK);

            expect(hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(false);
            expect(hooks.hasHook(HOOKS.AFTER_CHANGE)).toBe(true);
        });

        it('clearAllHooks 应该清除所有钩子', () => {
            hooks.addHook(HOOKS.ON_CELL_CLICK, vi.fn());
            hooks.addHook(HOOKS.AFTER_CHANGE, vi.fn());
            hooks.addHook(HOOKS.BEFORE_CHANGE, vi.fn());

            hooks.clearAllHooks();

            expect(hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(false);
            expect(hooks.hasHook(HOOKS.AFTER_CHANGE)).toBe(false);
            expect(hooks.hasHook(HOOKS.BEFORE_CHANGE)).toBe(false);
        });
    });

    describe('runHooks - 触发钩子', () => {
        it('应该按注册顺序执行所有回调', () => {
            const order = [];
            const callback1 = vi.fn(() => order.push(1));
            const callback2 = vi.fn(() => order.push(2));
            const callback3 = vi.fn(() => order.push(3));

            hooks.addHook(HOOKS.ON_CELL_CLICK, callback1);
            hooks.addHook(HOOKS.ON_CELL_CLICK, callback2);
            hooks.addHook(HOOKS.ON_CELL_CLICK, callback3);

            hooks.runHooks(HOOKS.ON_CELL_CLICK, 5, 10);

            expect(order).toEqual([1, 2, 3]);
        });

        it('应该正确传递参数给所有回调', () => {
            const callback = vi.fn();
            hooks.addHook(HOOKS.ON_CELL_CLICK, callback);

            hooks.runHooks(HOOKS.ON_CELL_CLICK, 1, 2, 'extra');

            expect(callback).toHaveBeenCalledWith(1, 2, 'extra');
        });

        it('应该返回最后一个回调的返回值', () => {
            hooks.addHook(HOOKS.BEFORE_CHANGE, () => 'first');
            hooks.addHook(HOOKS.BEFORE_CHANGE, () => 'second');
            hooks.addHook(HOOKS.BEFORE_CHANGE, () => 'third');

            const result = hooks.runHooks(HOOKS.BEFORE_CHANGE);

            expect(result).toBe('third');
        });

        it('没有回调时应该返回 undefined', () => {
            const result = hooks.runHooks(HOOKS.ON_CELL_CLICK);
            expect(result).toBeUndefined();
        });

        it('回调抛出异常不应该中断其他回调的执行', () => {
            const callback1 = vi.fn(() => { throw new Error('Test error'); });
            const callback2 = vi.fn();

            hooks.addHook(HOOKS.ON_CELL_CLICK, callback1);
            hooks.addHook(HOOKS.ON_CELL_CLICK, callback2);

            // 不应该抛出异常
            expect(() => {
                hooks.runHooks(HOOKS.ON_CELL_CLICK);
            }).not.toThrow();

            // 第二个回调仍然应该被执行
            expect(callback2).toHaveBeenCalledTimes(1);
        });
    });

    describe('runHooksUntil - 条件触发', () => {
        it('应该返回第一个非 undefined 的返回值', () => {
            hooks.addHook(HOOKS.BEFORE_CHANGE, () => undefined); // 跳过
            hooks.addHook(HOOKS.BEFORE_CHANGE, () => false);     // 返回这个
            hooks.addHook(HOOKS.BEFORE_CHANGE, () => true);      // 不应该执行到

            const result = hooks.runHooksUntil(HOOKS.BEFORE_CHANGE);

            expect(result).toBe(false);
        });

        it('全部返回 undefined 时应该返回 undefined', () => {
            hooks.addHook(HOOKS.BEFORE_CHANGE, () => undefined);
            hooks.addHook(HOOKS.BEFORE_CHANGE, () => undefined);

            const result = hooks.runHooksUntil(HOOKS.BEFORE_CHANGE);

            expect(result).toBeUndefined();
        });

        it('适用于 before* 类型的拦截操作', () => {
            let canProceed = true;

            hooks.addHook(HOOKS.BEFORE_CHANGE, (changes) => {
                if (changes.value < 0) {
                    return false; // 拒绝负数
                }
            });

            const result1 = hooks.runHooksUntil(HOOKS.BEFORE_CHANGE, { value: -5 });
            const result2 = hooks.runHooksUntil(HOOKS.BEFORE_CHANGE, { value: 10 });

            expect(result1).toBe(false);  // 被拦截
            expect(result2).toBeUndefined(); // 放行
        });
    });

    describe('查询方法', () => {
        it('hasHook 应该正确判断钩子是否存在', () => {
            expect(hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(false);

            hooks.addHook(HOOKS.ON_CELL_CLICK, vi.fn());
            expect(hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(true);
        });

        it('getHooks 应该返回回调数组的副本', () => {
            const callback = vi.fn();
            hooks.addHook(HOOKS.ON_CELL_CLICK, callback);

            const hooksArray = hooks.getHooks(HOOKS.ON_CELL_CLICK);
            hooksArray.push(vi.fn()); // 修改副本

            // 原始数据不应受影响
            expect(hooks.getHooks(HOOKS.ON_CELL_CLICK)).toHaveLength(1);
        });

        it('getHookNames 应该返回所有已注册的钩子名称', () => {
            hooks.addHook('custom1', vi.fn());
            hooks.addHook('custom2', vi.fn());

            const names = hooks.getHookNames();
            
            expect(names).toContain('custom1');
            expect(names).toContain('custom2');
            expect(names).toContain(HOOKS.ON_CELL_CLICK);
        });
    });
});

describe('Hooks 系统 - 边界条件测试', () => {
    let hooks;

    beforeEach(() => {
        hooks = new Hooks();
        hooks.init();
    });

    it('大量钩子性能测试', () => {
        const CALLBACK_COUNT = 1000;
        
        for (let i = 0; i < CALLBACK_COUNT; i++) {
            hooks.addHook(HOOKS.ON_CELL_CLICK, vi.fn());
        }

        expect(hooks.getHooks(HOOKS.ON_CELL_CLICK)).toHaveLength(CALLBACK_COUNT);

        const startTime = performance.now();
        hooks.runHooks(HOOKS.ON_CELL_CLICK, 1, 2);
        const endTime = performance.now();

        // 1000 个回调应该在合理时间内完成 (< 50ms)
        expect(endTime - startTime).toBeLessThan(50);
    });

    it('空字符串作为钩子名称', () => {
        const callback = vi.fn();
        
        expect(() => {
            hooks.addHook('', callback);
        }).not.toThrow();

        expect(hooks.hasHook('')).toBe(true);
    });

    it('特殊字符作为钩子名称', () => {
        const callback = vi.fn();
        const specialName = 'hook-with-special.chars!@#$%';
        
        hooks.addHook(specialName, callback);
        
        expect(hooks.hasHook(specialName)).toBe(true);
        hooks.runHooks(specialName, 'test');
        expect(callback).toHaveBeenCalledWith('test');
    });

    it('循环引用检测', () => {
        // 在回调中移除自身
        let callCount = 0;
        const selfRemovingCallback = (...args) => {
            callCount++;
            hooks.removeHook(HOOKS.ON_CELL_CLICK, selfRemovingCallback);
        };

        hooks.addHook(HOOKS.ON_CELL_CLICK, selfRemovingCallback);
        hooks.runHooks(HOOKS.ON_CELL_CLICK, 1, 2);

        expect(callCount).toBe(1);
        expect(hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(false);
    });

    it('异步回调支持', async () => {
        const asyncCallback = vi.fn(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return 'async result';
        });

        hooks.addHook(HOOKS.AFTER_CHANGE, asyncCallback);
        
        // runHooks 是同步的，但不会等待异步完成
        const result = hooks.runHooks(HOOKS.AFTER_CHANGE);
        
        expect(asyncCallback).toHaveBeenCalled();
        // 结果可能是 Promise 或 undefined，取决于实现
    });
});

describe('Hooks 系统 - 攻击性测试', () => {
    let hooks;

    beforeEach(() => {
        hooks = new Hooks();
        hooks.init();
    });

    it('恶意回调：修改参数对象', () => {
        const maliciousCallback = (args) => {
            args.row = 99999;
            args.col = -1;
        };

        hooks.addHook(HOOKS.ON_CELL_CLICK, maliciousCallback);

        const testArgs = { row: 1, col: 2 };
        hooks.runHooks(HOOKS.ON_CELL_CLICK, testArgs);

        // JavaScript 对象是引用传递，所以会被修改
        // 这是一个已知行为，文档中应提醒用户注意
        expect(testArgs.row).toBe(99999);
    });

    it('恶意回调：抛出特殊类型的错误', () => {
        class CustomError extends Error {}
        
        const maliciousCallback = () => {
            throw new CustomError('Malicious error');
        };

        hooks.addHook(HOOKS.ON_CELL_CLICK, maliciousCallback);

        // 应该捕获并处理，不影响其他回调
        const safeCallback = vi.fn();
        hooks.addHook(HOOKS.ON_CELL_CLICK, safeCallback);

        expect(() => {
            hooks.runHooks(HOOKS.ON_CELL_CLICK);
        }).not.toThrow();

        expect(safeCallback).toHaveBeenCalled();
    });

    it('内存泄漏风险：大量添加不移除', () => {
        // 验证可以添加大量 hooks 而不崩溃
        for (let i = 0; i < 10000; i++) {
            hooks.addHook(HOOKS.ON_CELL_CLICK, vi.fn());
        }

        expect(hooks.getHooks(HOOKS.ON_CELL_CLICK)).toHaveLength(10000);

        // 清理后应该完全释放
        hooks.clearHook(HOOKS.ON_CELL_CLICK);
        expect(hooks.getHooks(HOOKS.ON_CELL_CLICK)).toHaveLength(0);

        // 重新添加少量 hooks 验证系统恢复正常
        hooks.addHook(HOOKS.ON_CELL_CLICK, vi.fn());
        expect(hooks.getHooks(HOOKS.ON_CELL_CLICK)).toHaveLength(1);
    });

    it('原型链污染尝试', () => {
        const maliciousCallback = vi.fn();
        
        // 尝试覆盖原型方法
        expect(() => {
            hooks.addHook('__proto__', maliciousCallback);
        }).not.toThrow();

        // 验证正常功能未受影响
        expect(typeof hooks.addHook).toBe('function');
        expect(typeof hooks.runHooks).toBe('function');
    });

    it('回调中再次添加钩子', () => {
        const dynamicAdder = () => {
            hooks.addHook(HOOKS.ON_CELL_CLICK, vi.fn(() => 'dynamic'));
        };

        hooks.addHook(HOOKS.ON_CELL_CLICK, dynamicAdder);

        // 第一次运行会添加新回调
        hooks.runHooks(HOOKS.ON_CELL_CLICK);
        expect(hooks.getHooks(HOOKS.ON_CELL_CLICK)).toHaveLength(2); // dynamicAdder + 新添加的

        // 第二次运行又会添加一个
        hooks.runHooks(HOOKS.ON_CELL_CLICK);
        expect(hooks.getHooks(HOOKS.ON_CELL_CLICK)).toHaveLength(3); // +1
    });
});