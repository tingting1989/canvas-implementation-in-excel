import { describe, it, expect, vi, beforeEach } from "vitest";
import { BasePlugin } from "../../src/plugins/BasePlugin.js";
import { PluginManager } from "../../src/plugins/PluginManager.js";

export function createMockWorkbook(overrides = {}) {
    return {
        activeSheet: "activeSheet" in overrides ? overrides.activeSheet : {
            fixedRowsTop: 0,
            fixedColumnsStart: 0,
            rowColManager: {
                hideRow: vi.fn(),
            showRow: vi.fn(),
            isRowHidden: vi.fn(() => false),
            getHiddenRows: vi.fn(() => []),
            clearHiddenRows: vi.fn(),
            visibleRowCount: 100,
            hideColumn: vi.fn(),
            showColumn: vi.fn(),
            isColumnHidden: vi.fn(() => false),
            getHiddenColumns: vi.fn(() => []),
            clearHiddenColumns: vi.fn(),
            visibleColCount: 26,
                rowCount: 20,
                allocatedRowCount: 20,
                isExplicitlySized: false,
                setPaginationBounds: vi.fn(),
                clearPaginationBounds: vi.fn(),
            },
            selection: {
                getRange: vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 9, bottomCol: 25 })),
                getFocus: vi.fn(() => [0, 0]),
                setRange: vi.fn(),
                setActive: vi.fn(),
            },
            cellStore: {
                getMaxRow: vi.fn(() => -1),
                getMaxCol: vi.fn(() => -1),
                get: vi.fn(() => null),
            },
        },
        renderEngine: overrides.renderEngine || {
            invalidateAll: vi.fn(),
            scrollMgr: {
                setScrollPosition: vi.fn(),
            },
            viewH: 600,
            outerWrap: document.createElement("div"),
            onAfterRender: null,
        },
        eventHandler: overrides.eventHandler || {
            hooks: {
                addHook: vi.fn(),
                removeHook: vi.fn(),
                runHooks: vi.fn(),
            },
            addStrategy: vi.fn(),
            removeStrategy: vi.fn(),
        },
        editor: overrides.editor || {},
        clipboard: overrides.clipboard || null,
        formulaEngine: overrides.formulaEngine || null,
        formulaBar: overrides.formulaBar || null,
        render: vi.fn(),
        getPlugin: vi.fn(),
    };
}

class TestPlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "testPlugin";
    }

    init(options = {}) {
        super.init(options);
    }
}

describe("BasePlugin", () => {
    let plugin;
    let workbook;

    beforeEach(() => {
        workbook = createMockWorkbook();
        plugin = new TestPlugin(workbook);
    });

    describe("Constructor & Initialization", () => {
        it("should store workbook reference", () => {
            expect(plugin.workbook).toBe(workbook);
        });

        it("should not be initialized by default", () => {
            expect(plugin.initialized).toBe(false);
        });

        it("should be enabled by default", () => {
            expect(plugin.enabled).toBe(true);
        });

        it("should have empty options by default", () => {
            expect(plugin.options).toEqual({});
        });
    });

    describe("init()", () => {
        it("should mark plugin as initialized", () => {
            plugin.init();
            expect(plugin.initialized).toBe(true);
        });

        it("should store options", () => {
            const options = { customOption: true };
            plugin.init(options);
            expect(plugin.options).toEqual(options);
        });

        it("should accept empty options", () => {
            plugin.init({});
            expect(plugin.initialized).toBe(true);
            expect(plugin.options).toEqual({});
        });
    });

    describe("Property Getters", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should return activeSheet from workbook", () => {
            expect(plugin.sheet).toBe(workbook.activeSheet);
        });

        it("should return renderEngine from workbook", () => {
            expect(plugin.renderEngine).toBe(workbook.renderEngine);
        });

        it("should return eventHandler from workbook", () => {
            expect(plugin.eventHandler).toBe(workbook.eventHandler);
        });

        it("should return hooks from eventHandler", () => {
            expect(plugin.hooks).toBe(workbook.eventHandler.hooks);
        });

        it("should return clipboard from workbook", () => {
            expect(plugin.clipboard).toBe(workbook.clipboard);
        });

        it("should return null for sheet if no activeSheet", () => {
            const wb = createMockWorkbook({ activeSheet: null });
            const p = new TestPlugin(wb);
            p.init();
            expect(p.sheet).toBeNull();
        });
    });

    describe("enable() / disable()", () => {
        it("should enable the plugin", () => {
            plugin.disable();
            expect(plugin.enabled).toBe(false);

            plugin.enable();
            expect(plugin.enabled).toBe(true);
        });

        it("should disable the plugin", () => {
            plugin.init();
            plugin.disable();
            expect(plugin.enabled).toBe(false);
        });
    });

    describe("destroy()", () => {
        it("should clean up registered hooks", () => {
            plugin.init();
            const callback = vi.fn();
            plugin.addHook("testHook", callback);
            plugin.destroy();

            expect(plugin.initialized).toBe(false);
            expect(plugin.enabled).toBe(false);
        });

        it("should clean up registered strategies", () => {
            plugin.init();
            plugin.addStrategy("testStrategy", {});
            plugin.destroy();

            expect(workbook.eventHandler.removeStrategy).toHaveBeenCalledWith("testStrategy");
        });

        it("should clean up registered DOM events", () => {
            plugin.init();
            const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            plugin.addDOMEvent(target, "click", handler1);
            plugin.addDOMEvent(target, "keydown", handler2);
            plugin.destroy();

            expect(target.removeEventListener).toHaveBeenCalledTimes(2);
            expect(target.removeEventListener).toHaveBeenCalledWith("click", handler1, undefined);
            expect(target.removeEventListener).toHaveBeenCalledWith("keydown", handler2, undefined);
        });
    });

    describe("addHook() - Hook Registration", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should register hook with guarded callback", () => {
            const callback = vi.fn();
            plugin.addHook("onCellClick", callback);

            expect(workbook.eventHandler.hooks.addHook).toHaveBeenCalledWith(
                "onCellClick",
                expect.any(Function)
            );
        });

        it("should not execute callback when disabled", () => {
            const callback = vi.fn();
            plugin.addHook("onCellClick", callback);
            plugin.disable();

            const guardedCallback = workbook.eventHandler.hooks.addHook.mock.calls[0][1];
            guardedCallback();

            expect(callback).not.toHaveBeenCalled();
        });

        it("should execute callback when enabled", () => {
            const callback = vi.fn();
            plugin.addHook("onCellClick", callback);

            const guardedCallback = workbook.eventHandler.hooks.addHook.mock.calls[0][1];
            guardedCallback("arg1", "arg2");

            expect(callback).toHaveBeenCalledWith("arg1", "arg2");
        });
    });

    describe("addHookOnce() - One-time Hooks", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should register one-time hook", () => {
            const callback = vi.fn();
            plugin.addHookOnce("onDataChange", callback);

            expect(workbook.eventHandler.hooks.addHook).toHaveBeenCalledWith(
                "onDataChange",
                expect.any(Function)
            );
        });

        it("should only fire once", () => {
            const callback = vi.fn();
            plugin.addHookOnce("onDataChange", callback);

            const onceCallback = workbook.eventHandler.hooks.addHook.mock.calls[0][1];
            onceCallback();
            onceCallback();

            expect(callback).toHaveBeenCalledTimes(1);
        });

        it("should auto-remove after firing", () => {
            const callback = vi.fn();
            plugin.addHookOnce("onDataChange", callback);

            const onceCallback = workbook.eventHandler.hooks.addHook.mock.calls[0][1];
            onceCallback();

            expect(workbook.eventHandler.hooks.removeHook).toHaveBeenCalledWith(
                "onDataChange",
                onceCallback
            );
        });
    });

    describe("clearOwnHooks()", () => {
        it("should remove all registered hooks", () => {
            plugin.init();
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            plugin.addHook("hook1", cb1);
            plugin.addHook("hook2", cb2);

            plugin.clearOwnHooks();

            expect(workbook.eventHandler.hooks.removeHook).toHaveBeenCalledTimes(2);
        });
    });

    describe("addStrategy() - Strategy Registration", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should register strategy to eventHandler", () => {
            const strategy = {};
            plugin.addStrategy("myStrategy", strategy);

            expect(workbook.eventHandler.addStrategy).toHaveBeenCalledWith("myStrategy", strategy);
        });
    });

    describe("removeOwnStrategies()", () => {
        it("should remove all registered strategies", () => {
            plugin.init();
            plugin.addStrategy("strategy1", {});
            plugin.addStrategy("strategy2", {});

            plugin.removeOwnStrategies();

            expect(workbook.eventHandler.removeStrategy).toHaveBeenCalledWith("strategy1");
            expect(workbook.eventHandler.removeStrategy).toHaveBeenCalledWith("strategy2");
        });
    });

    describe("addDOMEvent() - DOM Event Registration", () => {
        beforeEach(() => {
            plugin.init();
        });

        it("should add DOM event listener to target", () => {
            const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
            const handler = vi.fn();
            plugin.addDOMEvent(target, "click", handler);

            expect(target.addEventListener).toHaveBeenCalledWith("click", handler, undefined);
        });

        it("should support event options", () => {
            const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
            const handler = vi.fn();
            plugin.addDOMEvent(target, "keydown", handler, { capture: true });

            expect(target.addEventListener).toHaveBeenCalledWith("keydown", handler, { capture: true });
        });
    });

    describe("removeOwnDOMEvents()", () => {
        it("should remove all registered DOM events", () => {
            plugin.init();
            const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
            plugin.addDOMEvent(target, "click", vi.fn());
            plugin.addDOMEvent(target, "keydown", vi.fn());

            plugin.removeOwnDOMEvents();

            expect(target.removeEventListener).toHaveBeenCalledTimes(2);
        });
    });

    describe("render()", () => {
        it("should call workbook.render()", () => {
            plugin.init();
            plugin.render();

            expect(workbook.render).toHaveBeenCalled();
        });
    });

    describe("getPlugin()", () => {
        it("should call workbook.getPlugin()", () => {
            plugin.init();
            plugin.getPlugin("otherPlugin");

            expect(workbook.getPlugin).toHaveBeenCalledWith("otherPlugin");
        });
    });

    describe("Static PLUGIN_NAME", () => {
        it("should throw error when not overridden in subclass", () => {
            class InvalidPlugin extends BasePlugin {}

            expect(() => InvalidPlugin.PLUGIN_NAME).toThrow();
        });
    });
});

describe("PluginManager", () => {
    let manager;
    let workbook;

    beforeEach(() => {
        workbook = createMockWorkbook();
        manager = new PluginManager(workbook);
    });

    afterEach(() => {
        PluginManager.unregister("testPlugin");
        manager.destroyAll();
    });

    describe("Constructor", () => {
        it("should store workbook reference (verified via loaded plugin)", () => {
            PluginManager.register("testPlugin", TestPlugin);
            const instance = manager.loadPlugin("testPlugin");

            expect(instance.workbook).toBe(workbook);
        });

        it("should initialize with empty plugins map", () => {
            expect(manager.getLoadedNames()).toEqual([]);
        });
    });

    describe("static register()", () => {
        it("should register a plugin class globally", () => {
            PluginManager.register("testPlugin", TestPlugin);

            expect(PluginManager.getRegisteredNames()).toContain("testPlugin");
        });

        it("should reject non-BasePlugin classes", () => {
            class NotAPlugin {}

            expect(() => {
                PluginManager.register("invalid", NotAPlugin);
            }).toThrow();
        });
    });

    describe("static unregister()", () => {
        it("should unregister a plugin class", () => {
            PluginManager.register("testPlugin", TestPlugin);
            PluginManager.unregister("testPlugin");

            expect(PluginManager.getRegisteredNames()).not.toContain("testPlugin");
        });
    });

    describe("static getRegisteredNames()", () => {
        it("should return all registered plugin names", () => {
            PluginManager.register("plugin1", TestPlugin);
            PluginManager.register("plugin2", TestPlugin);

            const names = PluginManager.getRegisteredNames();
            expect(names).toContain("plugin1");
            expect(names).toContain("plugin2");
            expect(names.length).toBe(2);
        });
    });

    describe("loadPlugin()", () => {
        beforeEach(() => {
            PluginManager.register("testPlugin", TestPlugin);
        });

        it("should load and initialize a plugin", () => {
            const instance = manager.loadPlugin("testPlugin");

            expect(instance).toBeInstanceOf(TestPlugin);
            expect(instance.initialized).toBe(true);
            expect(manager.hasPlugin("testPlugin")).toBe(true);
        });

        it("should pass options to plugin init", () => {
            const instance = manager.loadPlugin("testPlugin", { custom: true });

            expect(instance.options.custom).toBe(true);
        });

        it("should return existing instance if already loaded", () => {
            const first = manager.loadPlugin("testPlugin");
            const second = manager.loadPlugin("testPlugin");

            expect(first).toBe(second);
        });

        it("should return null for unregistered plugin", () => {
            const result = manager.loadPlugin("nonexistent");

            expect(result).toBeNull();
        });
    });

    describe("loadPluginClass()", () => {
        it("should load plugin class directly without registration", () => {
            const instance = manager.loadPluginClass(TestPlugin);

            expect(instance).toBeInstanceOf(TestPlugin);
            expect(instance.initialized).toBe(true);
        });

        it("should use PLUGIN_NAME as key", () => {
            manager.loadPluginClass(TestPlugin);

            expect(manager.hasPlugin("testPlugin")).toBe(true);
        });
    });

    describe("unloadPlugin()", () => {
        it("should destroy and remove plugin", () => {
            PluginManager.register("testPlugin", TestPlugin);
            manager.loadPlugin("testPlugin");

            manager.unloadPlugin("testPlugin");

            expect(manager.hasPlugin("testPlugin")).toBe(false);
        });

        it("should handle unloading nonexistent plugin gracefully", () => {
            expect(() => manager.unloadPlugin("nonexistent")).not.toThrow();
        });
    });

    describe("getPlugin()", () => {
        it("should return loaded plugin instance", () => {
            PluginManager.register("testPlugin", TestPlugin);
            manager.loadPlugin("testPlugin");

            const plugin = manager.getPlugin("testPlugin");

            expect(plugin).toBeInstanceOf(TestPlugin);
        });

        it("should return null for unloaded plugin", () => {
            const plugin = manager.getPlugin("nonexistent");

            expect(plugin).toBeNull();
        });
    });

    describe("getLoadedNames()", () => {
        it("should return all loaded plugin names", () => {
            PluginManager.register("p1", TestPlugin);
            PluginManager.register("p2", TestPlugin);
            manager.loadPlugin("p1");
            manager.loadPlugin("p2");

            const names = manager.getLoadedNames();
            expect(names).toContain("p1");
            expect(names).toContain("p2");
        });
    });

    describe("enablePlugin() / disablePlugin()", () => {
        beforeEach(() => {
            PluginManager.register("testPlugin", TestPlugin);
            manager.loadPlugin("testPlugin");
        });

        it("should enable a loaded plugin", () => {
            manager.disablePlugin("testPlugin");
            manager.enablePlugin("testPlugin");

            const plugin = manager.getPlugin("testPlugin");
            expect(plugin.enabled).toBe(true);
        });

        it("should disable a loaded plugin", () => {
            manager.disablePlugin("testPlugin");

            const plugin = manager.getPlugin("testPlugin");
            expect(plugin.enabled).toBe(false);
        });
    });

    describe("destroyAll()", () => {
        it("should destroy all loaded plugins", () => {
            PluginManager.register("p1", TestPlugin);
            PluginManager.register("p2", TestPlugin);
            manager.loadPlugin("p1");
            manager.loadPlugin("p2");

            manager.destroyAll();

            expect(manager.getLoadedNames()).toEqual([]);
        });
    });

    describe("hasPlugin()", () => {
        it("should return true for loaded plugin", () => {
            PluginManager.register("testPlugin", TestPlugin);
            manager.loadPlugin("testPlugin");

            expect(manager.hasPlugin("testPlugin")).toBe(true);
        });

        it("should return false for unloaded plugin", () => {
            expect(manager.hasPlugin("nonexistent")).toBe(false);
        });
    });
});