/**
 * Canvas 2D Context Mock 工具
 *
 * 提供完整的 Canvas 2D API 模拟，用于测试渲染器。
 * 支持所有常用的绘图方法、属性和渐变操作。
 *
 * @module tests/utils/canvas-mock
 */

export function createMockCanvasContext() {
    const calls = [];

    const ctx = {
        /**
         * 记录所有调用的方法调用历史
         * 用于断言验证
         */
        calls,

        // ========== 绘制矩形 ==========
        fillRect(x, y, w, h) {
            calls.push({ method: 'fillRect', args: [x, y, w, h] });
        },

        strokeRect(x, y, w, h) {
            calls.push({ method: 'strokeRect', args: [x, y, w, h] });
        },

        clearRect(x, y, w, h) {
            calls.push({ method: 'clearRect', args: [x, y, w, h] });
        },

        // ========== 路径方法 ==========
        beginPath() {
            calls.push({ method: 'beginPath', args: [] });
        },

        closePath() {
            calls.push({ method: 'closePath', args: [] });
        },

        moveTo(x, y) {
            calls.push({ method: 'moveTo', args: [x, y] });
        },

        lineTo(x, y) {
            calls.push({ method: 'lineTo', args: [x, y] });
        },

        fill() {
            calls.push({ method: 'fill', args: [] });
        },

        stroke() {
            calls.push({ method: 'stroke', args: [] });
        },

        clip(fillRule) {
            calls.push({ method: 'clip', args: fillRule ? [fillRule] : [] });
        },

        // ========== 圆弧和曲线（关键！解决 Bug #1）==========
        arc(x, y, radius, startAngle, endAngle, anticlockwise) {
            calls.push({
                method: 'arc',
                args: [x, y, radius, startAngle, endAngle, anticlockwise]
            });
        },

        arcTo(x1, y1, x2, y2, radius) {
            calls.push({ method: 'arcTo', args: [x1, y1, x2, y2, radius] });
        },

        /**
         * 二次贝塞尔曲线（关键方法！用于圆角矩形）
         */
        quadraticCurveTo(cpx, cpy, x, y) {
            calls.push({ method: 'quadraticCurveTo', args: [cpx, cpy, x, y] });
        },

        /**
         * 三次贝塞尔曲线
         */
        bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
            calls.push({
                method: 'bezierCurveTo',
                args: [cp1x, cp1y, cp2x, cp2y, x, y]
            });
        },

        ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise) {
            calls.push({
                method: 'ellipse',
                args: [x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise]
            });
        },

        rect(x, y, w, h) {
            calls.push({ method: 'rect', args: [x, y, w, h] });
        },

        // ========== 变换方法 ==========
        save() {
            calls.push({ method: 'save', args: [] });
        },

        restore() {
            calls.push({ method: 'restore', args: [] });
        },

        translate(x, y) {
            calls.push({ method: 'translate', args: [x, y] });
        },

        rotate(angle) {
            calls.push({ method: 'rotate', args: [angle] });
        },

        scale(x, y) {
            calls.push({ method: 'scale', args: [x, y] });
        },

        transform(a, b, c, d, e, f) {
            calls.push({ method: 'transform', args: [a, b, c, d, e, f] });
        },

        setTransform(a, b, c, d, e, f) {
            calls.push({ method: 'setTransform', args: [a, b, c, d, e, f] });
        },

        resetTransform() {
            calls.push({ method: 'resetTransform', args: [] });
        },

        // ========== 渐变和图案 ==========
        createLinearGradient(x0, y0, x1, y1) {
            calls.push({ method: 'createLinearGradient', args: [x0, y0, x1, y1] });

            return {
                addColorStop(offset, color) {
                    calls.push({ method: 'addColorStop', args: [offset, color] });
                }
            };
        },

        createRadialGradient(x0, y0, r0, x1, y1, r1) {
            calls.push({ method: 'createRadialGradient', args: [x0, y0, r0, x1, y1, r1] });

            return {
                addColorStop(offset, color) {
                    calls.push({ method: 'addColorStop', args: [offset, color] });
                }
            };
        },

        createPattern(image, repetition) {
            calls.push({ method: 'createPattern', args: [image, repetition] });
            return {};
        },

        // ========== 文本绘制 ==========
        fillText(text, x, y, maxWidth) {
            calls.push({
                method: 'fillText',
                args: maxWidth ? [text, x, y, maxWidth] : [text, x, y]
            });
        },

        strokeText(text, x, y, maxWidth) {
            calls.push({
                method: 'strokeText',
                args: maxWidth ? [text, x, y, maxWidth] : [text, x, y]
            });
        },

        measureText(text) {
            calls.push({ method: 'measureText', args: [text] });
            return { width: text.length * 8 };
        },

        // ========== 像素操作 ==========
        getImageData(sx, sy, sw, sh) {
            calls.push({ method: 'getImageData', args: [sx, sy, sw, sh] });
            return { data: new Uint8ClampedArray(sw * sh * 4), width: sw, height: sh };
        },

        putImageData(imageData, dx, dy) {
            calls.push({ method: 'putImageData', args: [imageData, dx, dy] });
        },

        // ========== 其他实用方法 ==========
        isPointInPath(x, y, fillRule) {
            calls.push({ method: 'isPointInPath', args: fillRule ? [x, y, fillRule] : [x, y] });
            return false;
        },

        isPointInStroke(x, y) {
            calls.push({ method: 'isPointInStroke', args: [x, y] });
            return false;
        },

        /**
         * 重置调用记录
         */
        resetCalls() {
            calls.length = 0;
        },

        /**
         * 获取特定方法的调用次数
         */
        getCallCount(methodName) {
            return calls.filter(c => c.method === methodName).length;
        }
    };

    // ========== 属性定义 ==========
    const props = [
        'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit',
        'globalAlpha', 'font', 'textAlign', 'textBaseline', 'direction',
        'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY',
        'imageSmoothingEnabled'
    ];

    const defaults = {
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        miterLimit: 10,
        globalAlpha: 1.0,
        font: '12px sans-serif',
        textAlign: 'start',
        textBaseline: 'alphabetic',
        direction: 'inherit',
        shadowBlur: 0,
        shadowColor: 'rgba(0, 0, 0, 0)',
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        imageSmoothingEnabled: true
    };

    props.forEach(prop => {
        const privateProp = `_${prop}`;
        ctx[privateProp] = defaults[prop];

        Object.defineProperty(ctx, prop, {
            get() {
                return ctx[privateProp];
            },
            set(value) {
                ctx[privateProp] = value;
                calls.push({ prop, value });
            },
            configurable: true,
            enumerable: true
        });
    });

    return ctx;
}

/**
 * 创建简化的 Mock Canvas Context（仅包含基础功能）
 * 用于不需要完整 API 的简单测试场景
 */
export function createSimpleMockContext() {
    return {
        fillRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        fill: () => {},
        stroke: () => {},
        save: () => {},
        restore: () => {},
        clip: () => {},
        arc: () => {},
        translate: () => {},
        scale: () => {},
        rect: () => {},
        quadraticCurveTo: () => {},  // 关键！
        bezierCurveTo: () => {},     // 关键！
        createLinearGradient: () => ({
            addColorStop: () => {}
        }),
        fillText: () => {},
    };
}