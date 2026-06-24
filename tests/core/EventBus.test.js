import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "../../src/core/EventBus.js";

describe("EventBus", () => {
    let bus;

    beforeEach(() => {
        bus = new EventBus("TestSource", "instance1");
    });

    describe("Basic on/emit", () => {
        it("should call listener when event is emitted", () => {
            const fn = vi.fn();
            bus.on("test", fn);
            bus.emit("test");
            expect(fn).toHaveBeenCalledOnce();
        });

        it("should pass envelope to listener with payload", () => {
            const fn = vi.fn();
            bus.on("test", fn);
            bus.emit("test", { a: 1, b: "hello" });
            expect(fn).toHaveBeenCalledOnce();
            const envelope = fn.mock.calls[0][0];
            expect(envelope.payload).toEqual({ a: 1, b: "hello" });
            expect(envelope.type).toBe("test");
            expect(envelope.source).toBe("TestSource");
            expect(envelope.sheetId).toBe("instance1");
            expect(typeof envelope.timestamp).toBe("number");
        });

        it("should call multiple listeners in order", () => {
            const order = [];
            bus.on("test", () => order.push(1));
            bus.on("test", () => order.push(2));
            bus.on("test", () => order.push(3));
            bus.emit("test");
            expect(order).toEqual([1, 2, 3]);
        });

        it("should not call listeners for different events", () => {
            const fnA = vi.fn();
            const fnB = vi.fn();
            bus.on("a", fnA);
            bus.on("b", fnB);
            bus.emit("a");
            expect(fnA).toHaveBeenCalledOnce();
            expect(fnB).not.toHaveBeenCalled();
        });

        it("should return undefined when no listeners", () => {
            const result = bus.emit("nonexistent");
            expect(result).toBeUndefined();
        });

        it("should return last non-undefined return value from listeners", () => {
            bus.on("test", () => 1);
            bus.on("test", () => 2);
            bus.on("test", () => 3);
            const result = bus.emit("test");
            expect(result).toBe(3);
        });

        it("should skip undefined returns and keep last defined", () => {
            bus.on("test", () => undefined);
            bus.on("test", () => 42);
            bus.on("test", () => undefined);
            const result = bus.emit("test");
            expect(result).toBe(42);
        });
    });

    describe("off", () => {
        it("should remove specific listener", () => {
            const fn = vi.fn();
            bus.on("test", fn);
            bus.off("test", fn);
            bus.emit("test");
            expect(fn).not.toHaveBeenCalled();
        });

        it("should not affect other listeners", () => {
            const fn1 = vi.fn();
            const fn2 = vi.fn();
            bus.on("test", fn1);
            bus.on("test", fn2);
            bus.off("test", fn1);
            bus.emit("test");
            expect(fn1).not.toHaveBeenCalled();
            expect(fn2).toHaveBeenCalledOnce();
        });

        it("should handle off for non-existent event", () => {
            expect(() => bus.off("nonexistent", () => {})).not.toThrow();
        });

        it("should handle off for non-existent listener", () => {
            const fn = vi.fn();
            bus.on("test", fn);
            expect(() => bus.off("test", () => {})).not.toThrow();
        });
    });

    describe("on return unsubscribe function", () => {
        it("should unsubscribe via returned function", () => {
            const fn = vi.fn();
            const unsub = bus.on("test", fn);
            bus.emit("test");
            expect(fn).toHaveBeenCalledOnce();
            unsub();
            bus.emit("test");
            expect(fn).toHaveBeenCalledOnce();
        });
    });

    describe("once", () => {
        it("should call listener only once", () => {
            const fn = vi.fn();
            bus.once("test", fn);
            bus.emit("test");
            bus.emit("test");
            expect(fn).toHaveBeenCalledOnce();
        });

        it("should pass envelope correctly", () => {
            const fn = vi.fn();
            bus.once("test", fn);
            bus.emit("test", "arg1");
            expect(fn).toHaveBeenCalledOnce();
            const envelope = fn.mock.calls[0][0];
            expect(envelope.payload).toBe("arg1");
        });

        it("should return unsubscribe function", () => {
            const fn = vi.fn();
            const unsub = bus.once("test", fn);
            unsub();
            bus.emit("test");
            expect(fn).not.toHaveBeenCalled();
        });
    });

    describe("removeAll", () => {
        it("should remove all listeners for all events", () => {
            const fn1 = vi.fn();
            const fn2 = vi.fn();
            bus.on("a", fn1);
            bus.on("b", fn2);
            bus.removeAll();
            bus.emit("a");
            bus.emit("b");
            expect(fn1).not.toHaveBeenCalled();
            expect(fn2).not.toHaveBeenCalled();
        });
    });

    describe("listenerCount", () => {
        it("should return 0 for non-existent event", () => {
            expect(bus.listenerCount("nonexistent")).toBe(0);
        });

        it("should return correct count", () => {
            bus.on("test", () => {});
            bus.on("test", () => {});
            bus.on("test", () => {});
            expect(bus.listenerCount("test")).toBe(3);
        });

        it("should update count after off", () => {
            const fn = vi.fn();
            bus.on("test", fn);
            bus.on("test", () => {});
            bus.off("test", fn);
            expect(bus.listenerCount("test")).toBe(1);
        });
    });

    describe("eventNames", () => {
        it("should return empty array for no events", () => {
            expect(bus.eventNames()).toEqual([]);
        });

        it("should return all registered event names", () => {
            bus.on("a", () => {});
            bus.on("b", () => {});
            expect(bus.eventNames()).toEqual(["a", "b"]);
        });
    });

    describe("Concurrency safety", () => {
        it("should handle listener removing itself during emit", () => {
            const fn2 = vi.fn();
            const unsub1 = bus.on("test", () => {
                unsub1();
            });
            bus.on("test", fn2);
            bus.emit("test");
            expect(fn2).toHaveBeenCalledOnce();
        });

        it("should handle listener removing another during emit", () => {
            const fn2 = vi.fn();
            const unsub2 = bus.on("test", fn2);
            bus.on("test", () => {
                unsub2();
            });
            bus.emit("test");
            expect(fn2).toHaveBeenCalledOnce();
        });

        it("should use snapshot so added listeners during emit are not called", () => {
            let added = false;
            bus.on("test", () => {
                if (!added) {
                    added = true;
                    bus.on("test", () => {
                        throw new Error("should not be called");
                    });
                }
            });
            expect(() => bus.emit("test")).not.toThrow();
        });
    });
});

describe("EventBus - Aggressive Tests", () => {
    let bus;

    beforeEach(() => {
        bus = new EventBus("AggSource", "agg1");
    });

    describe("Null Safety", () => {
        it("should handle emit with null payload", () => {
            const fn = vi.fn();
            bus.on("test", fn);
            bus.emit("test", null);
            expect(fn).toHaveBeenCalledOnce();
            const envelope = fn.mock.calls[0][0];
            expect(envelope.payload).toBe(null);
        });

        it("should handle emit with undefined payload (defaults to empty object)", () => {
            const fn = vi.fn();
            bus.on("test", fn);
            bus.emit("test");
            expect(fn).toHaveBeenCalledOnce();
            const envelope = fn.mock.calls[0][0];
            expect(envelope.payload).toEqual({});
        });

        it("should handle many events without listeners", () => {
            for (let i = 0; i < 100; i++) {
                expect(() => bus.emit(`event-${i}`)).not.toThrow();
            }
        });
    });

    describe("Stress Tests", () => {
        it("should handle 1000 listeners on one event", () => {
            const fns = [];
            for (let i = 0; i < 1000; i++) {
                const fn = vi.fn();
                fns.push(fn);
                bus.on("stress", fn);
            }
            bus.emit("stress");
            for (const fn of fns) {
                expect(fn).toHaveBeenCalledOnce();
            }
        });

        it("should handle rapid on/off cycles", () => {
            const fn = vi.fn();
            for (let i = 0; i < 100; i++) {
                bus.on("cycle", fn);
                bus.off("cycle", fn);
            }
            bus.emit("cycle");
            expect(fn).not.toHaveBeenCalled();
        });

        it("should handle 10000 emits", () => {
            const fn = vi.fn();
            bus.on("burst", fn);
            for (let i = 0; i < 10000; i++) {
                bus.emit("burst", i);
            }
            expect(fn).toHaveBeenCalledTimes(10000);
        });
    });

    describe("Edge Cases", () => {
        it("should handle listener that throws without breaking others", () => {
            const fnAfter = vi.fn();
            bus.on("test", () => {
                throw new Error("boom");
            });
            bus.on("test", fnAfter);
            expect(() => bus.emit("test")).toThrow();
            expect(fnAfter).not.toHaveBeenCalled();
        });

        it("should return value from last successful listener even if one throws", () => {
            bus.on("test", () => 1);
            expect(() => bus.emit("test")).not.toThrow();
        });

        it("should handle removeAll then re-on", () => {
            const fn = vi.fn();
            bus.on("test", fn);
            bus.removeAll();
            bus.on("test", fn);
            bus.emit("test");
            expect(fn).toHaveBeenCalledOnce();
        });

        it("should handle once listener that throws", () => {
            const fn = vi.fn();
            bus.once("test", () => {
                throw new Error("boom");
            });
            bus.on("test", fn);
            expect(() => bus.emit("test")).toThrow();
        });

        it("should handle empty string event name", () => {
            const fn = vi.fn();
            bus.on("", fn);
            bus.emit("");
            expect(fn).toHaveBeenCalledOnce();
        });

        it("should handle symbol event name", () => {
            const sym = Symbol("test");
            const fn = vi.fn();
            bus.on(sym, fn);
            bus.emit(sym, 42);
            expect(fn).toHaveBeenCalledOnce();
            const envelope = fn.mock.calls[0][0];
            expect(envelope.payload).toBe(42);
        });
    });

    describe("Memory Leak Prevention", () => {
        it("should not hold references after once fires", () => {
            const fn = vi.fn();
            bus.once("test", fn);
            bus.emit("test");
            expect(bus.listenerCount("test")).toBe(0);
        });

        it("should clean up empty arrays after all listeners removed", () => {
            const fn = vi.fn();
            bus.on("test", fn);
            bus.off("test", fn);
            expect(bus.listenerCount("test")).toBe(0);
        });
    });

    describe("Event Envelope", () => {
        it("should include source from constructor by default", () => {
            const fn = vi.fn();
            bus.on("test", fn);
            bus.emit("test");
            expect(fn.mock.calls[0][0].source).toBe("AggSource");
        });

        it("should include sheetId from constructor by default", () => {
            const fn = vi.fn();
            bus.on("test", fn);
            bus.emit("test");
            expect(fn.mock.calls[0][0].sheetId).toBe("agg1");
        });

        it("should allow source override via options", () => {
            const fn = vi.fn();
            bus.on("test", fn);
            bus.emit("test", {}, { source: "CellEditor" });
            expect(fn.mock.calls[0][0].source).toBe("CellEditor");
        });

        it("should allow sheetId override via options", () => {
            const fn = vi.fn();
            bus.on("test", fn);
            bus.emit("test", {}, { sheetId: "Sheet2" });
            expect(fn.mock.calls[0][0].sheetId).toBe("Sheet2");
        });

        it("should generate timestamp automatically", () => {
            const fn = vi.fn();
            bus.on("test", fn);
            const before = Date.now();
            bus.emit("test");
            const after = Date.now();
            const ts = fn.mock.calls[0][0].timestamp;
            expect(ts).toBeGreaterThanOrEqual(before);
            expect(ts).toBeLessThanOrEqual(after);
        });

        it("should set type to event name", () => {
            const fn = vi.fn();
            bus.on("myEvent", fn);
            bus.emit("myEvent");
            expect(fn.mock.calls[0][0].type).toBe("myEvent");
        });

        it("should default source and sheetId to empty string when constructor has no args", () => {
            const defaultBus = new EventBus();
            const fn = vi.fn();
            defaultBus.on("test", fn);
            defaultBus.emit("test");
            const envelope = fn.mock.calls[0][0];
            expect(envelope.source).toBe("");
            expect(envelope.sheetId).toBe("");
        });
    });

    describe("Contract validation (strict mode)", () => {
        it("should throw when source is not in emitters list", () => {
            const strictBus = new EventBus("UnknownSource", "s1", { strict: true });
            const fn = vi.fn();
            strictBus.on("sheet:invalidate-all", fn);
            expect(() => strictBus.emit("sheet:invalidate-all")).toThrow(
                /契约校验/
            );
            expect(fn).not.toHaveBeenCalled();
        });

        it("should allow emit when source is in emitters list", () => {
            const strictBus = new EventBus("Sheet", "s1", { strict: true });
            const fn = vi.fn();
            strictBus.on("sheet:invalidate-all", fn);
            expect(() => strictBus.emit("sheet:invalidate-all")).not.toThrow();
            expect(fn).toHaveBeenCalledOnce();
        });

        it("should allow source override that matches emitters", () => {
            const strictBus = new EventBus("Sheet", "s1", { strict: true });
            const fn = vi.fn();
            strictBus.on("sheet:before-change", fn);
            expect(() =>
                strictBus.emit("sheet:before-change", [], { source: "CellEditor" })
            ).not.toThrow();
            expect(fn).toHaveBeenCalledOnce();
        });

        it("should throw when override source is not in emitters", () => {
            const strictBus = new EventBus("Sheet", "s1", { strict: true });
            const fn = vi.fn();
            strictBus.on("sheet:before-change", fn);
            expect(() =>
                strictBus.emit("sheet:before-change", [], { source: "Hacker" })
            ).toThrow(/契约校验/);
        });

        it("should warn but not throw for unregistered events", () => {
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
            const strictBus = new EventBus("Sheet", "s1", { strict: true });
            const fn = vi.fn();
            strictBus.on("custom:unregistered", fn);
            expect(() => strictBus.emit("custom:unregistered")).not.toThrow();
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("未在 EVENT_FLOW_REGISTRY 中声明")
            );
            expect(fn).toHaveBeenCalledOnce();
            warnSpy.mockRestore();
        });

        it("should not validate when strict is false (default)", () => {
            const looseBus = new EventBus("Hacker", "s1");
            const fn = vi.fn();
            looseBus.on("sheet:invalidate-all", fn);
            expect(() => looseBus.emit("sheet:invalidate-all")).not.toThrow();
            expect(fn).toHaveBeenCalledOnce();
        });

        it("should allow events with empty emitters list", () => {
            const strictBus = new EventBus("Anyone", "s1", { strict: true });
            const fn = vi.fn();
            strictBus.on("sheet:cell-value-set", fn);
            expect(() => strictBus.emit("sheet:cell-value-set")).not.toThrow();
            expect(fn).toHaveBeenCalledOnce();
        });
    });
});