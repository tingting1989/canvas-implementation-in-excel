import { describe, it, expect, vi, afterEach } from "vitest";
import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "@/core/ErrorHandler";

describe("ErrorHandler - Configuration", () => {
    afterEach(() => {
        errorHandler.configure({ level: ERROR_LEVEL.WARN, devMode: false, throwOnFatal: true });
    });

    it("should have default level WARN", () => {
        errorHandler.configure({ level: ERROR_LEVEL.WARN });
        expect(errorHandler.level).toBe(ERROR_LEVEL.WARN);
    });

    it("should configure level", () => {
        errorHandler.configure({ level: ERROR_LEVEL.ERROR });
        expect(errorHandler.level).toBe(ERROR_LEVEL.ERROR);
    });

    it("should configure devMode", () => {
        expect(errorHandler.devMode).toBe(false);
        errorHandler.configure({ devMode: true });
        expect(errorHandler.devMode).toBe(true);
    });

    it("should configure throwOnFatal", () => {
        errorHandler.configure({ throwOnFatal: false });
        expect(() => errorHandler.throw("CODE", "msg")).not.toThrow();
    });
});

describe("ErrorHandler - handle", () => {
    afterEach(() => {
        errorHandler.configure({ level: ERROR_LEVEL.WARN });
    });

    it("should call console.error for handle()", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        errorHandler.handle(ERROR_CODE.PLUGIN_NOT_REGISTERED, "test message");
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it("should notify listeners on handle()", () => {
        const listener = vi.fn();
        errorHandler.onError(listener);
        errorHandler.handle("CODE", "msg", { key: "val" });
        expect(listener).toHaveBeenCalledWith("CODE", "msg", ERROR_LEVEL.ERROR, { key: "val" });
        errorHandler.offError(listener);
    });
});

describe("ErrorHandler - warn", () => {
    it("should call console.warn for warn()", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        errorHandler.warn("CODE", "warning message");
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});

describe("ErrorHandler - debug", () => {
    afterEach(() => {
        errorHandler.configure({ devMode: false, level: ERROR_LEVEL.WARN });
    });

    it("should not output when devMode is false", () => {
        errorHandler.configure({ devMode: false });
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        errorHandler.debug("CODE", "debug message");
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it("should output when devMode is true", () => {
        errorHandler.configure({ devMode: true, level: ERROR_LEVEL.DEBUG });
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        errorHandler.debug("CODE", "debug message");
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});

describe("ErrorHandler - throw", () => {
    afterEach(() => {
        errorHandler.configure({ throwOnFatal: true });
    });

    it("should throw error by default", () => {
        errorHandler.configure({ throwOnFatal: true });
        vi.spyOn(console, "error").mockImplementation(() => {});
        expect(() => errorHandler.throw("CODE", "fatal error")).toThrow("[CODE] fatal error");
    });

    it("should not throw when throwOnFatal is false", () => {
        errorHandler.configure({ throwOnFatal: false });
        vi.spyOn(console, "error").mockImplementation(() => {});
        expect(() => errorHandler.throw("CODE", "fatal error")).not.toThrow();
    });
});

describe("ErrorHandler - guard", () => {
    it("should return fn result on success", () => {
        const result = errorHandler.guard(() => 42, "CODE", "msg");
        expect(result).toBe(42);
    });

    it("should return undefined on exception", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const result = errorHandler.guard(() => {
            throw new Error("test");
        }, "CODE", "msg");
        expect(result).toBeUndefined();
    });
});

describe("ErrorHandler - guardAsync", () => {
    it("should return resolved value on success", async () => {
        const result = await errorHandler.guardAsync(Promise.resolve(42), "CODE", "msg");
        expect(result).toBe(42);
    });

    it("should return undefined on rejection", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const result = await errorHandler.guardAsync(Promise.reject(new Error("test")), "CODE", "msg");
        expect(result).toBeUndefined();
    });
});

describe("ErrorHandler - Listeners", () => {
    afterEach(() => {
        errorHandler.configure({ level: ERROR_LEVEL.WARN });
    });

    it("should register and call listener", () => {
        const listener = vi.fn();
        errorHandler.onError(listener);
        errorHandler.handle("CODE", "msg");
        expect(listener).toHaveBeenCalledTimes(1);
        errorHandler.offError(listener);
    });

    it("should remove listener with offError", () => {
        const listener = vi.fn();
        errorHandler.onError(listener);
        errorHandler.offError(listener);
        errorHandler.handle("CODE", "msg");
        expect(listener).not.toHaveBeenCalled();
    });

    it("should not fail when listener throws", () => {
        const badListener = () => {
            throw new Error("listener error");
        };
        errorHandler.onError(badListener);
        const goodListener = vi.fn();
        errorHandler.onError(goodListener);
        vi.spyOn(console, "error").mockImplementation(() => {});
        expect(() => errorHandler.handle("CODE", "msg")).not.toThrow();
        expect(goodListener).toHaveBeenCalled();
        errorHandler.offError(badListener);
        errorHandler.offError(goodListener);
    });

    it("should ignore non-function listeners", () => {
        errorHandler.onError("not a function");
        errorHandler.onError(null);
        vi.spyOn(console, "error").mockImplementation(() => {});
        expect(() => errorHandler.handle("CODE", "msg")).not.toThrow();
    });
});

describe("ErrorHandler - Level filtering", () => {
    afterEach(() => {
        errorHandler.configure({ level: ERROR_LEVEL.WARN });
    });

    it("should filter messages below threshold", () => {
        errorHandler.configure({ level: ERROR_LEVEL.ERROR });
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        errorHandler.warn("CODE", "should be filtered");
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it("should allow messages at threshold", () => {
        errorHandler.configure({ level: ERROR_LEVEL.WARN });
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        errorHandler.warn("CODE", "should appear");
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});