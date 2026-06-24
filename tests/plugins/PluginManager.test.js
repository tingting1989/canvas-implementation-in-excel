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