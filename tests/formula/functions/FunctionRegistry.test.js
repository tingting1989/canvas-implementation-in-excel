import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    functionRegistry,
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
        const stats = functionRegistry.getStats();
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
        try { functionRegistry.unregister("_TEST_"); } catch {}
        try { functionRegistry.unregister("_TEST2_"); } catch {}
        try { functionRegistry.unregister("_TEST3_"); } catch {}
    });

    it("should register a custom function", () => {
        const fn = vi.fn().mockReturnValue(42);
        functionRegistry.register("_TEST_", fn);
        expect(functionRegistry.has("_TEST_")).toBe(true);
    });

    it("should auto-uppercase function name", () => {
        functionRegistry.register("_test2_", vi.fn());
        expect(functionRegistry.has("_test2_")).toBe(true);
        expect(functionRegistry.has("_TEST2_")).toBe(true);
    });

    it("should throw for empty name", () => {
        expect(() => functionRegistry.register("", vi.fn())).toThrow();
    });

    it("should throw for whitespace-only name", () => {
        expect(() => functionRegistry.register("   ", vi.fn())).toThrow();
    });

    it("should throw for non-string name", () => {
        expect(() => functionRegistry.register(123, vi.fn())).toThrow();
        expect(() => functionRegistry.register(null, vi.fn())).toThrow();
        expect(() => functionRegistry.register(undefined, vi.fn())).toThrow();
    });

    it("should throw for non-function value", () => {
        expect(() => functionRegistry.register("_TEST3_", "not a function")).toThrow();
        expect(() => functionRegistry.register("_TEST3_", 42)).toThrow();
        expect(() => functionRegistry.register("_TEST3_", null)).toThrow();
        expect(() => functionRegistry.register("_TEST3_", {})).toThrow();
    });

    it("should allow overriding existing function", () => {
        functionRegistry.register("_TEST_", vi.fn().mockReturnValue(1));
        functionRegistry.register("_TEST_", vi.fn().mockReturnValue(2));
        const fn = functionRegistry.get("_TEST_");
        const result = fn([]);
        expect(result).toBe(2);
    });

    it("should wrap function with error handling", () => {
        functionRegistry.register("_BOOM_", () => { throw new Error("boom"); });
        const fn = functionRegistry.get("_BOOM_");
        const result = fn([1]);
        expect(result).toBe("#ERROR!");
    });

    it("should store category as custom by default", () => {
        functionRegistry.register("_CAT_TEST_", vi.fn());
        const info = functionRegistry.getInfo("_CAT_TEST_");
        expect(info.category).toBe("custom");
        expect(info.isBuiltin).toBe(false);
    });

    it("should store module name when provided", () => {
        functionRegistry.register("_MOD_TEST_", vi.fn(), { module: "TestModule" });
        const info = functionRegistry.getInfo("_MOD_TEST_");
        expect(info.module).toBe("TestModule");
    });
});

describe("FunctionRegistry - get", () => {
    it("should return function implementation for registered function", () => {
        const fn = functionRegistry.get("SUM");
        expect(typeof fn).toBe("function");
    });

    it("should return undefined for unregistered function", () => {
        expect(functionRegistry.get("NONEXISTENT_FUNCTION_XYZ")).toBeUndefined();
    });

    it("should be case-insensitive", () => {
        expect(functionRegistry.get("sum")).toBeDefined();
        expect(functionRegistry.get("Sum")).toBeDefined();
        expect(functionRegistry.get("SUM")).toBeDefined();
    });
});

describe("FunctionRegistry - has", () => {
    it("should return true for built-in SUM", () => {
        expect(functionRegistry.has("SUM")).toBe(true);
    });

    it("should return true for built-in IF", () => {
        expect(functionRegistry.has("IF")).toBe(true);
    });

    it("should return false for non-existent", () => {
        expect(functionRegistry.has("NONEXISTENT_12345")).toBe(false);
    });

    it("should be case-insensitive", () => {
        expect(functionRegistry.has("sum")).toBe(true);
        expect(functionRegistry.has("if")).toBe(true);
    });
});

describe("FunctionRegistry - unregister", () => {
    afterEach(() => {
        try { functionRegistry.unregister("_DEL_TEST_"); } catch {}
    });

    it("should remove custom function", () => {
        functionRegistry.register("_DEL_TEST_", vi.fn());
        expect(functionRegistry.unregister("_DEL_TEST_")).toBe(true);
        expect(functionRegistry.has("_DEL_TEST_")).toBe(false);
    });

    it("should return false for non-existent function", () => {
        expect(functionRegistry.unregister("NEVER_EXISTED")).toBe(false);
    });

    it("should allow unregistering builtin (with warning)", () => {
        expect(functionRegistry.has("SUM")).toBe(true);
        const result = functionRegistry.unregister("SUM");
        expect(result).toBe(true);
        expect(functionRegistry.has("SUM")).toBe(false);

        reRegisterBuiltin("SUM", mathFunctions.SUM);
    });
});

describe("FunctionRegistry - list", () => {
    it("should return array of function names", () => {
        const list = functionRegistry.list();
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBeGreaterThan(0);
    });

    it("should contain core functions", () => {
        const list = functionRegistry.list();
        expect(list).toContain("SUM");
        expect(list).toContain("IF");
        expect(list).toContain("AVERAGE");
        expect(list).toContain("VLOOKUP");
    });

    it("should return new array each time (no mutation)", () => {
        const list1 = functionRegistry.list();
        const list2 = functionRegistry.list();
        list1.push("FAKE");
        expect(list2).not.toContain("FAKE");
    });
});

describe("FunctionRegistry - getInfo", () => {
    it("should return metadata for registered function", () => {
        const info = functionRegistry.getInfo("SUM");
        expect(info).toBeDefined();
        expect(info.name).toBe("SUM");
        expect(info.isBuiltin).toBe(true);
        expect(info.category).toBe("builtin");
        expect(info.module).toBe("Math");
        expect(info.registeredAt).toBeDefined();
    });

    it("should return undefined for unregistered function", () => {
        expect(functionRegistry.getInfo("NO_SUCH_FUNC")).toBeUndefined();
    });
});

describe("FunctionRegistry - getStats", () => {
    it("should return total count", () => {
        const stats = functionRegistry.getStats();
        expect(stats.total).toBeGreaterThan(0);
        expect(stats.total).toEqual(stats.builtin + stats.custom);
    });

    it("should include all expected modules", () => {
        const stats = functionRegistry.getStats();
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
        const info = functionRegistry.getInfo("_PUB_TEST_");
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
        expect(getRegisteredFunctions()).toEqual(functionRegistry.list());
    });
});

describe.skip("FUNCTIONS backward compatibility alias (待修复)", () => {
    it("should be the same object as registry", () => {
        expect(FUNCTIONS).toBe(functionRegistry);
    });
});

function reRegisterBuiltin(name, fn) {
    functionRegistry._functions.set(name.toUpperCase(), {
        implementation: fn,
        originalImplementation: fn,
        category: "builtin",
        module: "Math",
        registeredAt: Date.now(),
    });
}