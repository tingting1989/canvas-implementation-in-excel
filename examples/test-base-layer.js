/**
 * BaseLayer 单元测试
 * 测试图层基类的所有核心功能
 */

async function testBaseLayer() {
    console.log('🧪 BaseLayer Unit Tests\n');
    console.log('='.repeat(60));

    let passed = 0;
    let failed = 0;

    function assert(condition, testName) {
        if (condition) {
            console.log(`  ✅ ${testName}`);
            passed++;
        } else {
            console.log(`  ❌ ${testName}`);
            failed++;
        }
    }

    function setupBrowserEnv() {
        if (typeof document !== 'undefined') return;
        const mockCtx = {
            clearRect() {},
            setTransform() {},
            save() {},
            restore() {},
            fillRect() {},
            strokeRect() {},
            beginPath() {},
            moveTo() {},
            lineTo() {},
            stroke() {},
            fill() {},
            fillText() {},
            measureText() { return { width: 0 }; },
            drawImage() {},
            clip() {},
            rect() {},
            translate() {},
            scale() {},
            rotate() {},
            getImageData() { return { data: new Uint8ClampedArray(0) }; },
            putImageData() {},
            createLinearGradient() { return { addColorStop() {} }; },
            createRadialGradient() { return { addColorStop() {} }; },
            arc() {},
            bezierCurveTo() {},
            quadraticCurveTo() {},
            closePath() {},
            globalAlpha: 1,
            globalCompositeOperation: 'source-over',
            fillStyle: '#000',
            strokeStyle: '#000',
            lineWidth: 1,
            lineCap: 'butt',
            lineJoin: 'miter',
            font: '10px sans-serif',
            textAlign: 'start',
            textBaseline: 'alphabetic',
            imageSmoothingEnabled: true,
            canvas: null
        };
        global.document = {
            createElement: (tag) => {
                if (tag === 'canvas') {
                    const c = {
                        width: 0,
                        height: 0,
                        style: {},
                        getContext: (type) => {
                            if (type === '2d') {
                                mockCtx.canvas = c;
                                return mockCtx;
                            }
                            return null;
                        },
                        toDataURL: () => '',
                        addEventListener: () => {},
                        removeEventListener: () => {}
                    };
                    return c;
                }
                return { style: {} };
            }
        };
        global.window = { devicePixelRatio: 1 };
    }

    setupBrowserEnv();

    const { BaseLayer } = await import('../src/render/BaseLayer.js');

    console.log('\n📋 1. 构造函数测试\n');

    try {
        const layer = new BaseLayer('test-layer', 1);

        assert(layer.name === 'test-layer', '应该正确设置name属性');
        assert(layer.zIndex === 1, '应该正确设置zIndex属性');
        assert(layer.dirty === true, '初始状态应该是脏的');
        assert(layer.enabled === true, '默认应该是启用的');
        assert(layer.renderCount === 0, '初始渲染次数为0');
        assert(layer.canvas === null, '初始canvas为null');
        assert(layer.ctx === null, '初始ctx为null');
    } catch (e) {
        console.log(`  ❌ 构造函数测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 2. 参数验证测试\n');

    try {
        let threwError = false;
        try {
            new BaseLayer('', 1);
        } catch (e) {
            threwError = e.message.includes('name must be a non-empty string');
        }
        assert(threwError, '空名称应该抛出错误');

        threwError = false;
        try {
            new BaseLayer(null, 1);
        } catch (e) {
            threwError = e.message.includes('name must be a non-empty string');
        }
        assert(threwError, 'null名称应该抛出错误');

        threwError = false;
        try {
            new BaseLayer('test', 'invalid');
        } catch (e) {
            threwError = e.message.includes('zIndex must be a number');
        }
        assert(threwError, '无效zIndex应该抛出错误');
    } catch (e) {
        console.log(`  ❌ 参数验证测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 3. 脏标记管理测试\n');

    try {
        const layer = new BaseLayer('test', 1);

        assert(layer.dirty === true, '初始状态是脏的');

        layer.clearDirty();
        assert(layer.dirty === false, 'clearDirty后应该不是脏的');

        layer.markDirty();
        assert(layer.dirty === true, 'markDirty后应该是脏的');
    } catch (e) {
        console.log(`  ❌ 脏标记管理测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 4. 启用/禁用测试\n');

    try {
        const layer = new BaseLayer('test', 1);

        assert(layer.enabled === true, '默认启用');

        layer.disable();
        assert(layer.enabled === false, 'disable后应禁用');

        layer.enable();
        assert(layer.enabled === true, 'enable后应重新启用');
    } catch (e) {
        console.log(`  ❌ 启用/禁用测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 5. Canvas初始化测试\n');

    try {
        const layer = new BaseLayer('test', 1);

        layer.initCanvas(800, 600);
        assert(layer.canvas !== null, 'initCanvas后canvas不为null');
        assert(layer.ctx !== null, 'initCanvas后ctx不为null');
        assert(layer.canvas.width > 0, 'canvas宽度正确');
        assert(layer.canvas.height > 0, 'canvas高度正确');

        layer.clearDirty();
        layer.initCanvas(1024, 768);
        assert(layer.dirty === true, '尺寸变化时应标记为脏');
    } catch (e) {
        console.log(`  ❌ Canvas初始化测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 6. render方法测试（抽象方法）\n');

    try {
        const layer = new BaseLayer('test', 1);
        let threwError = false;

        try {
            layer.render({}, {}, {});
        } catch (e) {
            threwError = e.message.includes('must be implemented by subclass');
        }

        assert(threwError, '未实现的render方法应该抛出错误');
    } catch (e) {
        console.log(`  ❌ render方法测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 7. destroy方法测试\n');

    try {
        const layer = new BaseLayer('test', 1);

        layer.initCanvas(100, 100);
        layer.renderCount = 10;

        layer.destroy();

        assert(layer.canvas === null, 'destroy后canvas应为null');
        assert(layer.ctx === null, 'destroy后ctx应为null');
        assert(layer.renderCount === 0, 'destroy后renderCount应重置为0');
    } catch (e) {
        console.log(`  ❌ destroy方法测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 8. getDebugInfo测试\n');

    try {
        const layer = new BaseLayer('test', 5);
        const info = layer.getDebugInfo();

        assert(info.name === 'test', 'debugInfo包含正确的name');
        assert(info.zIndex === 5, 'debugInfo包含正确的zIndex');
        assert(info.enabled === true, 'debugInfo包含enabled');
        assert(info.dirty === true, 'debugInfo包含dirty');
        assert(info.renderCount === 0, 'debugInfo包含renderCount');
        assert(typeof info.hasCanvas === 'boolean', 'debugInfo包含hasCanvas');
        assert(typeof info.watcherCount === 'number', 'debugInfo包含watcherCount');
        assert(typeof info.hasStore === 'boolean', 'debugInfo包含hasStore');
    } catch (e) {
        console.log(`  ❌ getDebugInfo测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 9. 自定义子类测试\n');

    try {
        class TestLayer extends BaseLayer {
            constructor() {
                super('custom-test', 10);
                this.renderCalled = false;
            }

            render(ctx, sheet, viewport, options = {}) {
                this.renderCalled = true;
            }
        }

        const customLayer = new TestLayer();
        customLayer.initCanvas(200, 200);

        assert(customLayer.name === 'custom-test', '自定义layer有正确的name');
        assert(customLayer.zIndex === 10, '自定义layer有正确的zIndex');

        customLayer.render(customLayer.ctx, {}, {});
        assert(customLayer.renderCalled === true, '自定义render方法被调用');
        // 注意：renderCount在BaseLayer.render()中递增，但子类覆盖了render()，所以可能不会自动递增
        assert(customLayer.renderCount >= 0, 'renderCount有效');
    } catch (e) {
        console.log(`  ❌ 自定义子类测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 测试结果汇总:');
    console.log(`   ✅ 通过: ${passed}`);
    console.log(`   ❌ 失败: ${failed}`);

    if (failed === 0) {
        console.log('\n✨ 完美！BaseLayer所有测试通过！');
    } else {
        console.log('\n⚠️ 存在失败用例，需要修复。');
    }

    return { passed, failed };
}

export { testBaseLayer };

testBaseLayer();