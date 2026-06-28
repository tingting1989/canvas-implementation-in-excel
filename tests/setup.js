import { vi } from "vitest";

const CHAR_WIDTH_ESTIMATE = 6;
const FONT_SIZE_REGEX = /(\d+(?:\.\d+)?)(px|pt|em|rem)/;

function estimateTextWidth(text, font) {
    let fontSize = 10;
    if (font) {
        const match = font.match(FONT_SIZE_REGEX);
        if (match) {
            fontSize = parseFloat(match[1]);
        }
    }
    let width = 0;
    for (const ch of String(text)) {
        const code = ch.charCodeAt(0);
        if (code > 127) {
            width += fontSize;
        } else {
            width += fontSize * 0.6;
        }
    }
    return width;
}

function createMockCtx() {
    const state = {
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        fillStyle: "#000",
        strokeStyle: "#000",
        lineWidth: 1,
        lineCap: "butt",
        lineJoin: "miter",
        font: "10px sans-serif",
        textAlign: "left",
        textBaseline: "alphabetic",
        shadowColor: "rgba(0, 0, 0, 0)",
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
    };

    const currentPath = [];
    const clipStack = [];
    const saveStack = [];

    const ctx = {
        clearRect: vi.fn(),
        setTransform: vi.fn(),
        save: vi.fn(() => {
            saveStack.push({ ...state });
            clipStack.push([...currentPath]);
        }),
        restore: vi.fn(() => {
            if (saveStack.length > 0) {
                Object.assign(state, saveStack.pop());
            }
            if (clipStack.length > 0) {
                currentPath.length = 0;
                currentPath.push(...clipStack.pop());
            }
        }),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        beginPath: vi.fn(() => {
            currentPath.length = 0;
        }),
        moveTo: vi.fn((x, y) => {
            currentPath.push({ type: "moveTo", x, y });
        }),
        lineTo: vi.fn((x, y) => {
            currentPath.push({ type: "lineTo", x, y });
        }),
        arc: vi.fn((x, y, radius, startAngle, endAngle) => {
            currentPath.push({ type: "arc", x, y, radius, startAngle, endAngle });
        }),
        bezierCurveTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        closePath: vi.fn(),
        rect: vi.fn((x, y, w, h) => {
            currentPath.push({ type: "rect", x, y, w, h });
        }),
        stroke: vi.fn(),
        fill: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn((text) => {
            const width = estimateTextWidth(text, state.font);
            return {
                width,
                actualBoundingBoxAscent: parseFloat(state.font) || 10,
                actualBoundingBoxDescent: 2,
                fontBoundingBoxAscent: parseFloat(state.font) || 10,
                fontBoundingBoxDescent: 2,
            };
        }),
        drawImage: vi.fn(),
        clip: vi.fn(() => {
            clipStack.push([...currentPath]);
        }),
        isPointInPath: vi.fn((x, y) => {
            for (let i = currentPath.length - 1; i >= 0; i--) {
                const seg = currentPath[i];
                if (seg.type === "rect") {
                    if (
                        x >= seg.x &&
                        x <= seg.x + seg.w &&
                        y >= seg.y &&
                        y <= seg.y + seg.h
                    ) {
                        return true;
                    }
                }
                if (seg.type === "arc") {
                    const dx = x - seg.x;
                    const dy = y - seg.y;
                    if (dx * dx + dy * dy <= seg.radius * seg.radius) {
                        return true;
                    }
                }
            }
            return false;
        }),
        translate: vi.fn(),
        scale: vi.fn(),
        rotate: vi.fn(),
        getImageData: vi.fn(() => ({
            data: new Uint8ClampedArray(0),
        })),
        putImageData: vi.fn(),
        createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    };

    Object.defineProperty(ctx, "globalAlpha", {
        get: () => state.globalAlpha,
        set: (v) => {
            state.globalAlpha = v;
        },
        enumerable: true,
        configurable: true,
    });
    Object.defineProperty(ctx, "globalCompositeOperation", {
        get: () => state.globalCompositeOperation,
        set: (v) => {
            state.globalCompositeOperation = v;
        },
        enumerable: true,
        configurable: true,
    });
    Object.defineProperty(ctx, "fillStyle", {
        get: () => state.fillStyle,
        set: (v) => {
            state.fillStyle = v;
        },
        enumerable: true,
        configurable: true,
    });
    Object.defineProperty(ctx, "strokeStyle", {
        get: () => state.strokeStyle,
        set: (v) => {
            state.strokeStyle = v;
        },
        enumerable: true,
        configurable: true,
    });
    Object.defineProperty(ctx, "lineWidth", {
        get: () => state.lineWidth,
        set: (v) => {
            state.lineWidth = v;
        },
        enumerable: true,
        configurable: true,
    });
    Object.defineProperty(ctx, "lineCap", {
        get: () => state.lineCap,
        set: (v) => {
            state.lineCap = v;
        },
        enumerable: true,
        configurable: true,
    });
    Object.defineProperty(ctx, "lineJoin", {
        get: () => state.lineJoin,
        set: (v) => {
            state.lineJoin = v;
        },
        enumerable: true,
        configurable: true,
    });
    Object.defineProperty(ctx, "font", {
        get: () => state.font,
        set: (v) => {
            state.font = v;
        },
        enumerable: true,
        configurable: true,
    });
    Object.defineProperty(ctx, "textAlign", {
        get: () => state.textAlign,
        set: (v) => {
            state.textAlign = v;
        },
        enumerable: true,
        configurable: true,
    });
    Object.defineProperty(ctx, "textBaseline", {
        get: () => state.textBaseline,
        set: (v) => {
            state.textBaseline = v;
        },
        enumerable: true,
        configurable: true,
    });
    Object.defineProperty(ctx, "shadowColor", {
        get: () => state.shadowColor,
        set: (v) => {
            state.shadowColor = v;
        },
        enumerable: true,
        configurable: true,
    });
    Object.defineProperty(ctx, "shadowBlur", {
        get: () => state.shadowBlur,
        set: (v) => {
            state.shadowBlur = v;
        },
        enumerable: true,
        configurable: true,
    });
    Object.defineProperty(ctx, "shadowOffsetX", {
        get: () => state.shadowOffsetX,
        set: (v) => {
            state.shadowOffsetX = v;
        },
        enumerable: true,
        configurable: true,
    });
    Object.defineProperty(ctx, "shadowOffsetY", {
        get: () => state.shadowOffsetY,
        set: (v) => {
            state.shadowOffsetY = v;
        },
        enumerable: true,
        configurable: true,
    });

    return ctx;
}

const _origCreateElement = document.createElement.bind(document);
document.createElement = (tag, options) => {
    if (tag === "canvas") {
        const canvas = _origCreateElement("canvas");
        canvas.width = 800;
        canvas.height = 600;
        canvas._ctx = createMockCtx();
        canvas.getContext = (type) => {
            if (type === "2d") return canvas._ctx;
            return null;
        };
        return canvas;
    }
    try {
        return _origCreateElement(tag, options);
    } catch {
        return { style: {}, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    }
};

global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);