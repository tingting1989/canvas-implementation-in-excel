import { describe, it, expect, vi, beforeEach } from "vitest";
import { BasePlugin } from "../../src/plugins/BasePlugin.js";

function createMockWorkbook() {
    const hooks = {
        addHook: vi.fn(),
        removeHook: vi.fn(),
    };
    return {
        activeSheet: {},
        renderEngine: {},
        eventHandler: { hooks, addStrategy: vi.fn(), removeStrategy: vi.fn() },
        editor: {},
        clipboard: {},
        render: vi.fn(),
        getPlugin: vi.fn(),
    };
}

class TestPlugin extends BasePlugin {
    static get PLUGIN_NAME() { return "testPlugin"; }
}

describe("BasePlugin - Bug Hunting", () => {
    let plugin;
    let workbook;

    beforeEach(() => {
        workbook = createMockWorkbook();
        plugin = new TestPlugin(workbook);
    });

    describe("addHook - enabled守卫", () => {
        it("BUG: 禁用插件后addHook注册的回调不应执行", () => {
            const cb = vi.fn();
            plugin.init();
            plugin.addHook("onCellClick", cb);

            plugin.disable();

            const registeredCallback = workbook.eventHandler.hooks.addHook.mock.calls[0][1];
            registeredCallback(0, 0);

            expect(cb).not.toHaveBeenCalled();
        });

        it("BUG: 重新启用插件后回调应恢复执行", () => {
            const cb = vi.fn();
            plugin.init();
            plugin.addHook("onCellClick", cb);

            plugin.disable();
            plugin.enable();

            const registeredCallback = workbook.eventHandler.hooks.addHook.mock.calls[0][1];
            registeredCallback(0, 0);

            expect(cb).toHaveBeenCalledWith(0, 0);
        });

        it("BUG: destroy后回调不应执行", () => {
            const cb = vi.fn();
            plugin.init();
            plugin.addHook("onCellClick", cb);

            plugin.destroy();

            const registeredCallback = workbook.eventHandler.hooks.addHook.mock.calls[0][1];
            registeredCallback(0, 0);

            expect(cb).not.toHaveBeenCalled();
        });
    });

    describe("addHookOnce - 一次性钩子", () => {
        it("BUG: addHookOnce应只触发一次", () => {
            const cb = vi.fn();
            plugin.init();
            plugin.addHookOnce("onCellClick", cb);

            const registeredCallback = workbook.eventHandler.hooks.addHook.mock.calls[0][1];
            registeredCallback(0, 0);
            registeredCallback(0, 1);

            expect(cb).toHaveBeenCalledOnce();
        });

        it("BUG: addHookOnce禁用期间触发后不应再触发", () => {
            const cb = vi.fn();
            plugin.init();
            plugin.addHookOnce("onCellClick", cb);

            plugin.disable();

            const registeredCallback = workbook.eventHandler.hooks.addHook.mock.calls[0][1];
            registeredCallback(0, 0);

            plugin.enable();
            registeredCallback(0, 1);

            expect(cb).not.toHaveBeenCalled();
        });

        it("BUG: addHookOnce触发后应从registeredHooks中清理", () => {
            const cb = vi.fn();
            plugin.init();
            plugin.addHookOnce("onCellClick", cb);

            const registeredCallback = workbook.eventHandler.hooks.addHook.mock.calls[0][1];
            registeredCallback(0, 0);

            plugin.destroy();

            expect(workbook.eventHandler.hooks.removeHook).toHaveBeenCalled();
        });
    });

    describe("destroy - 资源清理", () => {
        it("BUG: destroy应清理所有注册的钩子", () => {
            plugin.init();
            plugin.addHook("hook1", vi.fn());
            plugin.addHook("hook2", vi.fn());
            plugin.addHook("hook3", vi.fn());

            plugin.destroy();

            expect(workbook.eventHandler.hooks.removeHook).toHaveBeenCalledTimes(3);
        });

        it("BUG: destroy应清理所有注册的策略", () => {
            plugin.init();
            plugin.addStrategy("strategy1", {});
            plugin.addStrategy("strategy2", {});

            plugin.destroy();

            expect(workbook.eventHandler.removeStrategy).toHaveBeenCalledTimes(2);
        });

        it("BUG: destroy后initialized应为false", () => {
            plugin.init();
            expect(plugin.initialized).toBe(true);

            plugin.destroy();

            expect(plugin.initialized).toBe(false);
        });

        it("BUG: destroy后enabled应为false", () => {
            plugin.init();
            plugin.destroy();

            expect(plugin.enabled).toBe(false);
        });

        it("BUG: 多次destroy不应报错", () => {
            plugin.init();
            plugin.destroy();

            expect(() => plugin.destroy()).not.toThrow();
        });
    });

    describe("addDOMEvent - DOM事件管理", () => {
        it("BUG: destroy应移除所有注册的DOM事件", () => {
            const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
            plugin.init();

            plugin.addDOMEvent(target, "click", vi.fn());
            plugin.addDOMEvent(target, "keydown", vi.fn());

            plugin.destroy();

            expect(target.removeEventListener).toHaveBeenCalledTimes(2);
        });

        it("BUG: addDOMEvent应正确传递options", () => {
            const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
            const handler = vi.fn();
            const options = { capture: true };

            plugin.init();
            plugin.addDOMEvent(target, "click", handler, options);

            plugin.destroy();

            expect(target.removeEventListener).toHaveBeenCalledWith("click", handler, options);
        });
    });

    describe("enable/disable - 状态切换", () => {
        it("BUG: disable后enabled应为false", () => {
            plugin.init();
            plugin.disable();

            expect(plugin.enabled).toBe(false);
        });

        it("BUG: enable后enabled应为true", () => {
            plugin.init();
            plugin.disable();
            plugin.enable();

            expect(plugin.enabled).toBe(true);
        });

        it("BUG: 未init时enabled应为true（默认启用）", () => {
            expect(plugin.enabled).toBe(true);
        });
    });

    describe("getPlugin - 插件间通信", () => {
        it("BUG: getPlugin应委托给workbook.getPlugin", () => {
            workbook.getPlugin.mockReturnValue({ name: "other" });

            const result = plugin.getPlugin("otherPlugin");

            expect(workbook.getPlugin).toHaveBeenCalledWith("otherPlugin");
            expect(result.name).toBe("other");
        });

        it("BUG: workbook为null时getPlugin不应报错", () => {
            const nullPlugin = new TestPlugin(null);
            expect(() => nullPlugin.getPlugin("test")).not.toThrow();
        });
    });
});