import { describe, it, expect, vi, beforeEach } from "vitest";
import { BasePlugin } from "../../src/plugins/BasePlugin.js";
import { PluginManager } from "../../src/plugins/PluginManager.js";

class TestPlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "test";
    }

    init(options = {}) {
        super.init(options);
    }
}

describe("BasePlugin", () => {
    let workbook;

    beforeEach(() => {
        workbook = {
            renderEngine: { requestRender: vi.fn() },
            eventHandler: {
                hooks: {
                    addHook: vi.fn(),
                    removeHook: vi.fn(),
                },
                addStrategy: vi.fn(),
                removeStrategy: vi.fn(),
            },
        };
    });

    it("should throw if PLUGIN_NAME not overridden", () => {
        expect(() => BasePlugin.PLUGIN_NAME).toThrow();
    });

    it("should have correct PLUGIN_NAME", () => {
        expect(TestPlugin.PLUGIN_NAME).toBe("test");
    });

    it("should initialize with options", () => {
        const plugin = new TestPlugin(workbook);
        plugin.init({ key: "value" });
        expect(plugin.initialized).toBe(true);
        expect(plugin.options.key).toBe("value");
    });

    it("should enable and disable", () => {
        const plugin = new TestPlugin(workbook);
        plugin.init();
        expect(plugin.enabled).toBe(true);
        plugin.disable();
        expect(plugin.enabled).toBe(false);
        plugin.enable();
        expect(plugin.enabled).toBe(true);
    });

    it("should destroy and clean up", () => {
        const plugin = new TestPlugin(workbook);
        plugin.init();
        plugin.destroy();
        expect(plugin.initialized).toBe(false);
        expect(plugin.enabled).toBe(false);
    });

    it("should add hook with enabled guard", () => {
        const plugin = new TestPlugin(workbook);
        plugin.init();
        const cb = vi.fn();
        plugin.addHook("onCellClick", cb);

        const registeredCb = workbook.eventHandler.hooks.addHook.mock.calls[0][1];
        registeredCb(1, 2);
        expect(cb).toHaveBeenCalledWith(1, 2);
    });

    it("should skip hook callback when disabled", () => {
        const plugin = new TestPlugin(workbook);
        plugin.init();
        const cb = vi.fn();
        plugin.addHook("onCellClick", cb);
        plugin.disable();

        const registeredCb = workbook.eventHandler.hooks.addHook.mock.calls[0][1];
        registeredCb(1, 2);
        expect(cb).not.toHaveBeenCalled();
    });

    it("should add strategy", () => {
        const plugin = new TestPlugin(workbook);
        plugin.init();
        const strategy = { enable: vi.fn(), disable: vi.fn() };
        plugin.addStrategy("myStrategy", strategy);
        expect(workbook.eventHandler.addStrategy).toHaveBeenCalledWith("myStrategy", strategy);
    });

    it("should add DOM event", () => {
        const plugin = new TestPlugin(workbook);
        plugin.init();
        const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
        const handler = vi.fn();
        plugin.addDOMEvent(target, "click", handler);
        expect(target.addEventListener).toHaveBeenCalledWith("click", handler, undefined);
    });

    it("should remove DOM events on destroy", () => {
        const plugin = new TestPlugin(workbook);
        plugin.init();
        const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
        const handler = vi.fn();
        plugin.addDOMEvent(target, "click", handler);
        plugin.destroy();
        expect(target.removeEventListener).toHaveBeenCalledWith("click", handler, undefined);
    });

    it("should remove strategies on destroy", () => {
        const plugin = new TestPlugin(workbook);
        plugin.init();
        const strategy = { enable: vi.fn(), disable: vi.fn() };
        plugin.addStrategy("myStrategy", strategy);
        plugin.destroy();
        expect(workbook.eventHandler.removeStrategy).toHaveBeenCalledWith("myStrategy");
    });

    it("should clear hooks on destroy", () => {
        const plugin = new TestPlugin(workbook);
        plugin.init();
        const cb = vi.fn();
        plugin.addHook("onCellClick", cb);
        plugin.destroy();
        expect(workbook.eventHandler.hooks.removeHook).toHaveBeenCalled();
    });

    it("should addHookOnce that fires only once", () => {
        const plugin = new TestPlugin(workbook);
        plugin.init();
        const cb = vi.fn();
        plugin.addHookOnce("onCellClick", cb);

        const registeredCb = workbook.eventHandler.hooks.addHook.mock.calls[0][1];
        registeredCb(1, 2);
        expect(cb).toHaveBeenCalledWith(1, 2);

        registeredCb(3, 4);
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it("should skip addHookOnce callback when disabled", () => {
        const plugin = new TestPlugin(workbook);
        plugin.init();
        const cb = vi.fn();
        plugin.addHookOnce("onCellClick", cb);
        plugin.disable();

        const registeredCb = workbook.eventHandler.hooks.addHook.mock.calls[0][1];
        registeredCb(1, 2);
        expect(cb).not.toHaveBeenCalled();
    });

    it("should expose workbook getters", () => {
        const wb = {
            activeSheet: { name: "Sheet1" },
            renderEngine: { id: "re" },
            eventHandler: { id: "eh", hooks: { addHook: vi.fn(), removeHook: vi.fn() } },
            editor: { id: "ed" },
            clipboard: { id: "cb" },
        };
        const plugin = new TestPlugin(wb);
        plugin.init();

        expect(plugin.sheet).toBe(wb.activeSheet);
        expect(plugin.renderEngine).toBe(wb.renderEngine);
        expect(plugin.eventHandler).toBe(wb.eventHandler);
        expect(plugin.editor).toBe(wb.editor);
        expect(plugin.clipboard).toBe(wb.clipboard);
        expect(plugin.hooks).toBe(wb.eventHandler.hooks);
    });

    it("should call render on workbook", () => {
        const wb = {
            render: vi.fn(),
            eventHandler: { hooks: { addHook: vi.fn(), removeHook: vi.fn() } },
        };
        const plugin = new TestPlugin(wb);
        plugin.init();
        plugin.render();
        expect(wb.render).toHaveBeenCalled();
    });

    it("should get other plugin by name", () => {
        class OtherPlugin extends BasePlugin {
            static get PLUGIN_NAME() { return "other"; }
            init(opts = {}) { super.init(opts); }
        }

        const wb = {
            getPlugin: vi.fn(() => new OtherPlugin(wb)),
            eventHandler: { hooks: { addHook: vi.fn(), removeHook: vi.fn() } },
        };
        const plugin = new TestPlugin(wb);
        plugin.init();
        const other = plugin.getPlugin("other");
        expect(wb.getPlugin).toHaveBeenCalledWith("other");
    });

    it("should add DOM event with options", () => {
        const plugin = new TestPlugin(workbook);
        plugin.init();
        const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
        const handler = vi.fn();
        plugin.addDOMEvent(target, "keydown", handler, { passive: true });
        expect(target.addEventListener).toHaveBeenCalledWith("keydown", handler, { passive: true });
    });

    it("should handle null workbook gracefully", () => {
        const plugin = new TestPlugin(null);
        plugin.init();
        expect(plugin.sheet).toBeUndefined();
        expect(plugin.renderEngine).toBeUndefined();
        expect(plugin.eventHandler).toBeUndefined();
        expect(plugin.editor).toBeUndefined();
        expect(plugin.clipboard).toBeUndefined();
    });
});

describe("PluginManager", () => {
    beforeEach(() => {
        const names = PluginManager.getRegisteredNames();
        for (const name of names) {
            PluginManager.unregister(name);
        }
    });

    it("should register and load plugin", () => {
        PluginManager.register("test", TestPlugin);
        const workbook = {};
        const pm = new PluginManager(workbook);
        const plugin = pm.loadPlugin("test");
        expect(plugin).toBeInstanceOf(TestPlugin);
        expect(plugin.initialized).toBe(true);
    });

    it("should throw if registering non-BasePlugin class", () => {
        expect(() => PluginManager.register("bad", class {})).toThrow();
    });

    it("should return null for unregistered plugin", () => {
        const pm = new PluginManager({});
        const result = pm.loadPlugin("nonexistent");
        expect(result).toBeNull();
    });

    it("should unload plugin", () => {
        PluginManager.register("test", TestPlugin);
        const pm = new PluginManager({});
        pm.loadPlugin("test");
        pm.unloadPlugin("test");
        expect(pm.getPlugin("test")).toBeNull();
    });

    it("should enable and disable plugin", () => {
        PluginManager.register("test", TestPlugin);
        const pm = new PluginManager({});
        pm.loadPlugin("test");
        pm.disablePlugin("test");
        expect(pm.getPlugin("test").enabled).toBe(false);
        pm.enablePlugin("test");
        expect(pm.getPlugin("test").enabled).toBe(true);
    });

    it("should load plugin class directly", () => {
        const pm = new PluginManager({});
        const plugin = pm.loadPluginClass(TestPlugin);
        expect(plugin).toBeInstanceOf(TestPlugin);
        expect(pm.hasPlugin("test")).toBe(true);
    });

    it("should destroy all plugins", () => {
        PluginManager.register("test", TestPlugin);
        const pm = new PluginManager({});
        pm.loadPlugin("test");
        pm.destroyAll();
        expect(pm.getPlugin("test")).toBeNull();
    });
});