import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hooks } from "@/editor/Hooks";

describe("Hooks - init", () => {
    it("should initialize with default hook names", () => {
        const hooks = new Hooks();
        hooks.init();
        expect(hooks.initialized).toBe(true);
    });

    it("should not re-initialize", () => {
        const hooks = new Hooks();
        hooks.init();
        const sizeBefore = hooks.hooks.size;
        hooks.init();
        expect(hooks.hooks.size).toBe(sizeBefore);
    });
});

describe("Hooks - addHook", () => {
    it("should add callback to hook", () => {
        const hooks = new Hooks();
        const cb = vi.fn();
        hooks.addHook("test", cb);
        expect(hooks.getHooks("test")).toContain(cb);
    });

    it("should add multiple callbacks to same hook", () => {
        const hooks = new Hooks();
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        hooks.addHook("test", cb1);
        hooks.addHook("test", cb2);
        expect(hooks.getHooks("test")).toHaveLength(2);
    });

    it("should create hook array if not exists", () => {
        const hooks = new Hooks();
        const cb = vi.fn();
        hooks.addHook("newHook", cb);
        expect(hooks.hooks.has("newHook")).toBe(true);
    });

    it("should throw for non-function callback", () => {
        const hooks = new Hooks();
        expect(() => hooks.addHook("test", "not a function")).toThrow();
    });
});

describe("Hooks - removeHook", () => {
    it("should remove specific callback", () => {
        const hooks = new Hooks();
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        hooks.addHook("test", cb1);
        hooks.addHook("test", cb2);
        hooks.removeHook("test", cb1);
        expect(hooks.getHooks("test")).toHaveLength(1);
        expect(hooks.getHooks("test")).toContain(cb2);
    });

    it("should handle removing non-existent callback", () => {
        const hooks = new Hooks();
        const cb = vi.fn();
        hooks.addHook("test", cb);
        hooks.removeHook("test", vi.fn());
        expect(hooks.getHooks("test")).toHaveLength(1);
    });

    it("should handle removing from non-existent hook", () => {
        const hooks = new Hooks();
        expect(() => hooks.removeHook("nonexistent", vi.fn())).not.toThrow();
    });
});

describe("Hooks - addHookOnce", () => {
    it("should fire callback only once", () => {
        const hooks = new Hooks();
        const cb = vi.fn();
        hooks.addHookOnce("test", cb);
        hooks.runHooks("test");
        hooks.runHooks("test");
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it("should remove itself after firing", () => {
        const hooks = new Hooks();
        const cb = vi.fn();
        hooks.addHookOnce("test", cb);
        hooks.runHooks("test");
        expect(hooks.getHooks("test")).toHaveLength(0);
    });

    it("should not interfere with regular hooks", () => {
        const hooks = new Hooks();
        const regularCb = vi.fn();
        const onceCb = vi.fn();
        hooks.addHook("test", regularCb);
        hooks.addHookOnce("test", onceCb);
        hooks.runHooks("test");
        hooks.runHooks("test");
        expect(regularCb).toHaveBeenCalledTimes(2);
        expect(onceCb).toHaveBeenCalledTimes(1);
    });

    it("should throw for non-function callback", () => {
        const hooks = new Hooks();
        expect(() => hooks.addHookOnce("test", "not a function")).toThrow();
    });
});

describe("Hooks - runHooks", () => {
    it("should call all callbacks in order", () => {
        const hooks = new Hooks();
        const order = [];
        hooks.addHook("test", () => order.push(1));
        hooks.addHook("test", () => order.push(2));
        hooks.addHook("test", () => order.push(3));
        hooks.runHooks("test");
        expect(order).toEqual([1, 2, 3]);
    });

    it("should return last callback result", () => {
        const hooks = new Hooks();
        hooks.addHook("test", () => "a");
        hooks.addHook("test", () => "b");
        const result = hooks.runHooks("test");
        expect(result).toBe("b");
    });

    it("should return undefined for empty hook", () => {
        const hooks = new Hooks();
        expect(hooks.runHooks("nonexistent")).toBeUndefined();
    });

    it("should pass arguments to callbacks", () => {
        const hooks = new Hooks();
        const cb = vi.fn();
        hooks.addHook("test", cb);
        hooks.runHooks("test", 1, 2, 3);
        expect(cb).toHaveBeenCalledWith(1, 2, 3);
    });

    it("should continue after callback error", () => {
        const hooks = new Hooks();
        const cb1 = vi.fn(() => {
            throw new Error("test error");
        });
        const cb2 = vi.fn();
        hooks.addHook("test", cb1);
        hooks.addHook("test", cb2);
        hooks.runHooks("test");
        expect(cb2).toHaveBeenCalled();
    });
});

describe("Hooks - runHooksUntil", () => {
    it("should return first non-undefined result", () => {
        const hooks = new Hooks();
        hooks.addHook("test", () => undefined);
        hooks.addHook("test", () => "found");
        hooks.addHook("test", () => "ignored");
        const result = hooks.runHooksUntil("test");
        expect(result).toBe("found");
    });

    it("should return undefined if all callbacks return undefined", () => {
        const hooks = new Hooks();
        hooks.addHook("test", () => undefined);
        hooks.addHook("test", () => undefined);
        expect(hooks.runHooksUntil("test")).toBeUndefined();
    });

    it("should return undefined for empty hook", () => {
        const hooks = new Hooks();
        expect(hooks.runHooksUntil("nonexistent")).toBeUndefined();
    });

    it("should stop at first non-undefined result", () => {
        const hooks = new Hooks();
        const cb2 = vi.fn(() => "found");
        const cb3 = vi.fn();
        hooks.addHook("test", () => undefined);
        hooks.addHook("test", cb2);
        hooks.addHook("test", cb3);
        hooks.runHooksUntil("test");
        expect(cb3).not.toHaveBeenCalled();
    });
});

describe("Hooks - clearHook / clearAllHooks", () => {
    it("clearHook should remove all callbacks for a hook", () => {
        const hooks = new Hooks();
        hooks.addHook("test", vi.fn());
        hooks.addHook("test", vi.fn());
        hooks.clearHook("test");
        expect(hooks.getHooks("test")).toHaveLength(0);
    });

    it("clearAllHooks should remove all callbacks for all hooks", () => {
        const hooks = new Hooks();
        hooks.addHook("test1", vi.fn());
        hooks.addHook("test2", vi.fn());
        hooks.clearAllHooks();
        expect(hooks.getHooks("test1")).toHaveLength(0);
        expect(hooks.getHooks("test2")).toHaveLength(0);
    });

    it("clearHook should handle non-existent hook", () => {
        const hooks = new Hooks();
        expect(() => hooks.clearHook("nonexistent")).not.toThrow();
    });
});

describe("Hooks - hasHook", () => {
    it("should return true if hook has callbacks", () => {
        const hooks = new Hooks();
        hooks.addHook("test", vi.fn());
        expect(hooks.hasHook("test")).toBe(true);
    });

    it("should return false if hook has no callbacks", () => {
        const hooks = new Hooks();
        expect(hooks.hasHook("test")).toBe(false);
    });

    it("should return false after all callbacks removed", () => {
        const hooks = new Hooks();
        const cb = vi.fn();
        hooks.addHook("test", cb);
        hooks.removeHook("test", cb);
        expect(hooks.hasHook("test")).toBe(false);
    });
});

describe("Hooks - getHookNames", () => {
    it("should return all registered hook names", () => {
        const hooks = new Hooks();
        hooks.addHook("test1", vi.fn());
        hooks.addHook("test2", vi.fn());
        const names = hooks.getHookNames();
        expect(names).toContain("test1");
        expect(names).toContain("test2");
    });
});

describe("Hooks - getHooks", () => {
    it("should return empty array for non-existent hook", () => {
        const hooks = new Hooks();
        expect(hooks.getHooks("nonexistent")).toEqual([]);
    });
});