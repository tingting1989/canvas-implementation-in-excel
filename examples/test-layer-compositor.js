/**
 * LayerCompositor 单元测试
 * 测试图层合成器的所有核心功能
 */

async function testLayerCompositor() {
    console.log('🧪 LayerCompositor Unit Tests\n');
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
            arc() {},
            bezierCurveTo() {},
            quadraticCurveTo() {},
            closePath() {},
            globalAlpha: 1,
            globalCompositeOperation: 'source-over',
            fillStyle: '#000',
            strokeStyle: '#000',
            lineWidth: 1,
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
    const { LayerCompositor } = await import('../src/render/LayerCompositor.js');

    class CleanTestLayer extends BaseLayer {
        constructor(name, zIndex) {
            super(name, zIndex);
            this.renderCalled = false;
        }
        render() { this.renderCalled = true; }
    }

    class DirtyTestLayer extends BaseLayer {
        constructor(name, zIndex) {
            super(name, zIndex);
            this.renderCalled = false;
            this.dirty = true;
        }
        render() { this.renderCalled = true; }
    }

    function createMockCtx() {
        const calls = { drawImage: [], clearRect: [], setTransform: [] };
        return {
            drawImage: (...args) => calls.drawImage.push(args),
            clearRect: (...args) => calls.clearRect.push(args),
            setTransform: (...args) => calls.setTransform.push(args),
            save: () => {},
            restore: () => {},
            rect: () => {},
            clip: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {},
            fill: () => {},
            fillText: () => {},
            fillRect: () => {},
            calls
        };
    }

    console.log('\n📋 1. 注册和注销图层\n');

    try {
        const compositor = new LayerCompositor();
        const layer1 = new CleanTestLayer('layer-1', 1);

        compositor.register(layer1);
        assert(compositor.getLayer('layer-1') === layer1, '注册后可以获取到layer');
        assert(compositor.getLayer('nonexistent') === undefined, '不存在的layer返回undefined');

        const result = compositor.unregister('layer-1');
        assert(result === true, '注销成功返回true');
        assert(compositor.getLayer('layer-1') === undefined, '注销后获取不到layer');

        const failResult = compositor.unregister('nonexistent');
        assert(failResult === false, '注销不存在的layer返回false');
    } catch (e) {
        console.log(`  ❌ 注册注销测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 2. 重复名称检测\n');

    try {
        const compositor = new LayerCompositor();
        compositor.register(new CleanTestLayer('test', 1));

        let threwError = false;
        try {
            compositor.register(new CleanTestLayer('test', 2));
        } catch (e) {
            threwError = e.message.includes('already registered');
        }
        assert(threwError, '重复名称应该抛出错误');
    } catch (e) {
        console.log(`  ❌ 重复名称测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 3. 无效类型检测\n');

    try {
        const compositor = new LayerCompositor();
        let threwError = false;
        try {
            compositor.register({ name: 'invalid' });
        } catch (e) {
            threwError = e.message.includes('must be an instance of BaseLayer');
        }
        assert(threwError, '非BaseLayer实例应该抛出错误');
    } catch (e) {
        console.log(`  ❌ 无效类型测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 4. 图层排序\n');

    try {
        const compositor = new LayerCompositor();
        compositor.register(new CleanTestLayer('c', 3));
        compositor.register(new CleanTestLayer('a', 1));
        compositor.register(new CleanTestLayer('b', 2));

        const sorted = compositor.getSortedLayers();
        const names = sorted.map(l => l.name);

        assert(names[0] === 'a', '第一个是zIndex最小的');
        assert(names[1] === 'b', '第二个是zIndex中间的');
        assert(names[2] === 'c', '第三个是zIndex最大的');
    } catch (e) {
        console.log(`  ❌ 排序测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 5. compose合成测试（只渲染脏图层）\n');

    try {
        const compositor = new LayerCompositor();
        const cleanLayer = new CleanTestLayer('clean', 1);
        const dirtyLayer = new DirtyTestLayer('dirty', 2);

        compositor.register(cleanLayer);
        compositor.register(dirtyLayer);

        cleanLayer.initCanvas(800, 600);
        cleanLayer.clearDirty();

        const mockCtx = createMockCtx();
        const stats = compositor.compose(mockCtx, {}, {}, 800, 600);

        assert(dirtyLayer.renderCalled === true, '脏图层被渲染');
        assert(cleanLayer.renderCalled === false, '干净图层未被渲染');
        assert(stats.dirtyLayers === 1, '统计显示1个脏图层');
        assert(stats.cachedLayers === 1, '统计显示1个缓存命中');
        assert(stats.totalLayers === 2, '统计显示总共2个图层');
        assert(typeof stats.frameTime === 'number', 'frameTime是数字');
    } catch (e) {
        console.log(`  ❌ compose测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 6. 禁用图层不参与渲染\n');

    try {
        const compositor = new LayerCompositor();
        const disabledLayer = new DirtyTestLayer('disabled', 1);
        disabledLayer.disable();
        compositor.register(disabledLayer);

        const mockCtx = createMockCtx();
        const stats = compositor.compose(mockCtx, {}, {}, 800, 600);

        assert(disabledLayer.renderCalled === false, '禁用的图层不被渲染');
        assert(stats.totalLayers === 0, '统计显示0个活跃图层');
    } catch (e) {
        console.log(`  ❌ 禁用图层测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 7. markAllDirty标记所有图层\n');

    try {
        const compositor = new LayerCompositor();
        const layer1 = new CleanTestLayer('a', 1);
        const layer2 = new CleanTestLayer('b', 2);
        layer1.clearDirty();
        layer2.clearDirty();

        compositor.register(layer1);
        compositor.register(layer2);
        compositor.markAllDirty();

        assert(layer1.dirty === true, 'markAllDirty后layer1为脏');
        assert(layer2.dirty === true, 'markAllDirty后layer2为脏');
    } catch (e) {
        console.log(`  ❌ markAllDirty测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 8. getDebugInfo调试信息\n');

    try {
        const compositor = new LayerCompositor();
        compositor.register(new CleanTestLayer('debug-test', 5));

        const debugInfo = compositor.getDebugInfo();
        assert(Array.isArray(debugInfo), '返回数组');
        assert(debugInfo.length === 1, '包含1个图层的调试信息');
        assert(debugInfo[0].name === 'debug-test', '包含正确的name');
        assert(debugInfo[0].zIndex === 5, '包含正确的zIndex');
    } catch (e) {
        console.log(`  ❌ getDebugInfo测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 9. destroyAll销毁所有图层\n');

    try {
        const compositor = new LayerCompositor();
        compositor.register(new CleanTestLayer('destroy-1', 1));
        compositor.register(new CleanTestLayer('destroy-2', 2));
        compositor.destroyAll();

        assert(compositor.getLayer('destroy-1') === undefined, '销毁后获取不到layer1');
        assert(compositor.getLayer('destroy-2') === undefined, '销毁后获取不到layer2');
        assert(compositor.getSortedLayers().length === 0, '排序后的列表为空');
    } catch (e) {
        console.log(`  ❌ destroyAll测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 10. 性能统计\n');

    try {
        const compositor = new LayerCompositor();
        compositor.register(new DirtyTestLayer('perf', 1));

        const mockCtx = createMockCtx();
        for (let i = 0; i < 10; i++) {
            const dirtyLayer = compositor.getLayer('perf');
            dirtyLayer.markDirty();
            compositor.compose(mockCtx, {}, {}, 800, 600);
        }

        assert(compositor.stats.totalRenders === 10, '总渲染次数为10');
        assert(compositor.stats.dirtyRenders > 0, '有脏图层渲染记录');
        assert(typeof compositor.stats.avgFrameTime === 'number', '平均帧时间是数字');
    } catch (e) {
        console.log(`  ❌ 性能统计测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 测试结果汇总:');
    console.log(`   ✅ 通过: ${passed}`);
    console.log(`   ❌ 失败: ${failed}`);

    if (failed === 0) {
        console.log('\n✨ 完美！LayerCompositor所有测试通过！');
    } else {
        console.log('\n⚠️ 存在失败用例，需要修复。');
    }

    return { passed, failed };
}

export { testLayerCompositor };