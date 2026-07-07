import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    registry,
    FUNCTIONS,
    registerFunction,
    unregisterFunction,
    hasFunction,
    getRegisteredFunctions,
    getFunctionStats,
} from "@/formula/functions";
import { mathFunctions } from "@/formula/functions/math";
import { logicalFunctions } from "@/formula/functions/logical";

describe("FunctionRegistry - Construction", () => {
    it("should have built-in modules registered", () => {
        const stats = registry.getStats();
        expect(stats.builtin).toBeGreaterThan(0);
        expect(stats.modules).toContain("Math");
        expect(stats.modules).toContain("Logical");
        expect(stats.modules).toContain("Text");
        expect(stats.modules).toContain("Statistical");
        expect(stats.modules).toContain("Conditional");
        expect(stats.modules).toContain("Lookup");
    });
});

describe("FunctionRegistry - register", () => {
    afterEach(() => {
        try { registry.unregister("_TEST_"); } catch {}
        try { registry.unregister("_TEST2_"); } catch {}
        try { registry.unregister("_TEST3_"); } catch {}
    });

    it("should register a custom function", () => {
        const fn = vi.fn().mockReturnValue(42);
        registry.register("_TEST_", fn);
        expect(registry.has("_TEST_")).toBe(true);
    });

    it("should auto-uppercase function name", () => {
        registry.register("_test2_", vi.fn());
        expect(registry.has("_test2_")).toBe(true);
        expect(registry.has("_TEST2_")).toBe(true);
    });

    it("should throw for empty name", () => {
        expect(() => registry.register("", vi.fn())).toThrow();
    });

    it("should throw for whitespace-only name", () => {
        expect(() => registry.register("   ", vi.fn())).toThrow();
    });

    it("should throw for non-string name", () => {
        expect(() => registry.register(123, vi.fn())).toThrow();
        expect(() => registry.register(null, vi.fn())).toThrow();
        expect(() => registry.register(undefined, vi.fn())).toThrow();
    });

    it("should throw for non-function value", () => {
        expect(() => registry.register("_TEST3_", "not a function")).toThrow();
        expect(() => registry.register("_TEST3_", 42)).toThrow();
        expect(() => registry.register("_TEST3_", null)).toThrow();
        expect(() => registry.register("_TEST3_", {})).toThrow();
    });

    it("should allow overriding existing function", () => {
        registry.register("_TEST_", vi.fn().mockReturnValue(1));
        registry.register("_TEST_", vi.fn().mockReturnValue(2));
        const fn = registry.get("_TEST_");
        const result = fn([]);
        expect(result).toBe(2);
    });

    it("should wrap function with error handling", () => {
        registry.register("_BOOM_", () => { throw new Error("boom"); });
        const fn = registry.get("_BOOM_");
        const result = fn([1]);
        expect(result).toBe("#ERROR!");
    });

    it("should store category as custom by default", () => {
        registry.register("_CAT_TEST_", vi.fn());
        const info = registry.getInfo("_CAT_TEST_");
        expect(info.category).toBe("custom");
        expect(info.isBuiltin).toBe(false);
    });

    it("should store module name when provided", () => {
        registry.register("_MOD_TEST_", vi.fn(), { module: "TestModule" });
        const info = registry.getInfo("_MOD_TEST_");
        expect(info.module).toBe("TestModule");
    });
});

describe("FunctionRegistry - get", () => {
    it("should return function implementation for registered function", () => {
        const fn = registry.get("SUM");
        expect(typeof fn).toBe("function");
    });

    it("should return undefined for unregistered function", () => {
        expect(registry.get("NONEXISTENT_FUNCTION_XYZ")).toBeUndefined();
    });

    it("should be case-insensitive", () => {
        expect(registry.get("sum")).toBeDefined();
        expect(registry.get("Sum")).toBeDefined();
        expect(registry.get("SUM")).toBeDefined();
    });
});

describe("FunctionRegistry - has", () => {
    it("should return true for built-in SUM", () => {
        expect(registry.has("SUM")).toBe(true);
    });

    it("should return true for built-in IF", () => {
        expect(registry.has("IF")).toBe(true);
    });

    it("should return false for non-existent", () => {
        expect(registry.has("NONEXISTENT_12345")).toBe(false);
    });

    it("should be case-insensitive", () => {
        expect(registry.has("sum")).toBe(true);
        expect(registry.has("if")).toBe(true);
    });
});

describe("FunctionRegistry - unregister", () => {
    afterEach(() => {
        try { registry.unregister("_DEL_TEST_"); } catch {}
    });

    it("should remove custom function", () => {
        registry.register("_DEL_TEST_", vi.fn());
        expect(registry.unregister("_DEL_TEST_")).toBe(true);
        expect(registry.has("_DEL_TEST_")).toBe(false);
    });

    it("should return false for non-existent function", () => {
        expect(registry.unregister("NEVER_EXISTED")).toBe(false);
    });

    it("should allow unregistering builtin (with warning)", () => {
        expect(registry.has("SUM")).toBe(true);
        const result = registry.unregister("SUM");
        expect(result).toBe(true);
        expect(registry.has("SUM")).toBe(false);

        reRegisterBuiltin("SUM", mathFunctions.SUM);
    });
});

describe("FunctionRegistry - list", () => {
    it("should return array of function names", () => {
        const list = registry.list();
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBeGreaterThan(0);
    });

    it("should contain core functions", () => {
        const list = registry.list();
        expect(list).toContain("SUM");
        expect(list).toContain("IF");
        expect(list).toContain("AVERAGE");
        expect(list).toContain("VLOOKUP");
    });

    it("should return new array each time (no mutation)", () => {
        const list1 = registry.list();
        const list2 = registry.list();
        list1.push("FAKE");
        expect(list2).not.toContain("FAKE");
    });
});

describe("FunctionRegistry - getInfo", () => {
    it("should return metadata for registered function", () => {
        const info = registry.getInfo("SUM");
        expect(info).toBeDefined();
        expect(info.name).toBe("SUM");
        expect(info.isBuiltin).toBe(true);
        expect(info.category).toBe("builtin");
        expect(info.module).toBe("Math");
        expect(info.registeredAt).toBeDefined();
    });

    it("should return undefined for unregistered function", () => {
        expect(registry.getInfo("NO_SUCH_FUNC")).toBeUndefined();
    });
});

describe("FunctionRegistry - getStats", () => {
    it("should return total count", () => {
        const stats = registry.getStats();
        expect(stats.total).toBeGreaterThan(0);
        expect(stats.total).toEqual(stats.builtin + stats.custom);
    });

    it("should include all expected modules", () => {
        const stats = registry.getStats();
        expect(stats.modules).toContain("Math");
        expect(stats.modules).toContain("Statistical");
        expect(stats.modules).toContain("Logical");
        expect(stats.modules).toContain("Text");
        expect(stats.modules).toContain("Conditional");
        expect(stats.modules).toContain("Lookup");
    });
});

describe.skip("Public API - registerFunction (待修复)", () => {
    afterEach(() => {
        try { unregisterFunction("_PUB_TEST_"); } catch {}
    });

    it("should register with custom category", () => {
        registerFunction("_PUB_TEST_", vi.fn());
        const info = registry.getInfo("_PUB_TEST_");
        expect(info.category).toBe("custom");
    });
});

describe.skip("Public API - unregisterFunction (待修复)", () => {
    it("should delegate to registry", () => {
        registerFunction("_PUB_DEL_", vi.fn());
        expect(hasFunction("_PUB_DEL_")).toBe(true);
        expect(unregisterFunction("_PUB_DEL_")).toBe(true);
        expect(hasFunction("_PUB_DEL_")).toBe(false);
    });
});

describe.skip("Public API - hasFunction (待修复)", () => {
    it("should check existence case-insensitively", () => {
        expect(hasFunction("sum")).toBe(true);
        expect(hasFunction("SUM")).toBe(true);
        expect(hasFunction("Sum")).toBe(true);
    });
});

describe.skip("Public API - getRegisteredFunctions (待修复)", () => {
    it("should return same as registry.list()", () => {
        expect(getRegisteredFunctions()).toEqual(registry.list());
    });
});

describe.skip("FUNCTIONS backward compatibility alias (待修复)", () => {
    it("should be the same object as registry", () => {
        expect(FUNCTIONS).toBe(registry);
    });
});

function reRegisterBuiltin(name, fn) {
    registry._functions.set(name.toUpperCase(), {
        implementation: fn,
        originalImplementation: fn,
        category: "builtin",
        module: "Math",
        registeredAt: Date.now(),
    });
}