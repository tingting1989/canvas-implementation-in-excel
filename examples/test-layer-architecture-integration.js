async function testLayerArchitectureIntegration() {
    console.log('\x1b[36m🧪 Layer Architecture Integration Tests\x1b[0m\n');
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
    const { ReactiveStore } = await import('../src/state/ReactiveStore.js');

    class TestTileLayer extends BaseLayer {
        constructor() { super('tiles', 1); this.renderCount = 0; }
        render(ctx, sheet, viewport, options) { this.renderCount++; }
    }
    class TestFrozenLayer extends BaseLayer {
        constructor() { super('frozen', 2.5); this.renderCount = 0; }
        render(ctx, sheet, viewport, options) { this.renderCount++; }
    }
    class TestOverlayLayer extends BaseLayer {
        constructor() { super('overlay', 3); this.renderCount = 0; }
        render(ctx, sheet, viewport, options) { this.renderCount++; }
    }
    class TestHeaderLayer extends BaseLayer {
        constructor() { super('header', 4); this.renderCount = 0; }
        render(ctx, sheet, viewport, options) { this.renderCount++; }
    }
    class TestUILayer extends BaseLayer {
        constructor() { super('ui', 5); this.renderCount = 0; }
        render(ctx, sheet, viewport, options) { this.renderCount++; }
    }

    function createStore() {
        return new ReactiveStore({
            scroll: { x: 0, y: 0 },
            frozen: { rows: 0, cols: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            selection: { ranges: [], activeRange: null, merges: [] },
            editor: { visible: false, row: -1, col: -1, value: '' },
            viewport: { width: 0, height: 0 },
            tile: { size: 256, cacheMax: 512 }
        });
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

    console.log('\n📋 1. 完整系统初始化\n');

    try {
        const store = createStore();

        const compositor = new LayerCompositor();
        compositor.register(new TestTileLayer());
        compositor.register(new TestFrozenLayer());
        compositor.register(new TestOverlayLayer());
        compositor.register(new TestHeaderLayer());
        compositor.register(new TestUILayer());

        assert(compositor.getSortedLayers().length === 5, '注册了5个图层');
        assert(store.state.scroll.x === 0, 'Store初始化正确');
        assert(store.state.frozen.rows === 0, 'frozen.rows初始为0');
        assert(store.state.frozenOffset.colsWidth === 0, 'frozenOffset.colsWidth初始为0');
        assert(store.state.editor.visible === false, 'editor.visible初始为false');
        assert(store.state.viewport.width === 0, 'viewport.width初始为0');
        assert(store.state.tile.size === 256, 'tile.size初始为256');
    } catch (e) {
        console.log(`  ❌ 系统初始化测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 2. Store与Layer绑定\n');

    try {
        const store = createStore();
        const compositor = new LayerCompositor();
        const tileLayer = new TestTileLayer();
        const frozenLayer = new TestFrozenLayer();

        compositor.register(tileLayer);
        compositor.register(frozenLayer);

        compositor.bindAllLayers(store);

        assert(tileLayer._store === store, 'TileLayer绑定了Store');
        assert(frozenLayer._store === store, 'FrozenLayer绑定了Store');
    } catch (e) {
        console.log(`  ❌ Store绑定测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 3. 状态变化自动触发脏标记\n');

    try {
        const store = createStore();
        const compositor = new LayerCompositor();
        const tileLayer = new TestTileLayer();
        const overlayLayer = new TestOverlayLayer();
        const frozenLayer = new TestFrozenLayer();
        const uiLayer = new TestUILayer();
        const headerLayer = new TestHeaderLayer();

        compositor.register(tileLayer);
        compositor.register(overlayLayer);
        compositor.register(frozenLayer);
        compositor.register(uiLayer);
        compositor.register(headerLayer);

        compositor.bindAllLayers(store);

        tileLayer.clearDirty();
        overlayLayer.clearDirty();
        frozenLayer.clearDirty();
        uiLayer.clearDirty();
        headerLayer.clearDirty();

        tileLayer.watch('scroll', () => {});
        overlayLayer.watch('selection', () => {});
        frozenLayer.watch('frozen', () => {});
        uiLayer.watch('frozenOffset', () => {});
        headerLayer.watch('viewport', () => {});

        store.state.scroll.x = 100;
        store.flush();
        assert(tileLayer.dirty === true, 'scroll变化后TileLayer变脏');

        store.state.frozen.rows = 3;
        store.flush();
        assert(frozenLayer.dirty === true, 'frozen变化后FrozenLayer变脏');

        store.state.selection.activeRange = { topRow: 0 };
        store.flush();
        assert(overlayLayer.dirty === true, 'selection变化后OverlayLayer变脏');

        store.state.frozenOffset.colsWidth = 150;
        store.flush();
        assert(uiLayer.dirty === true, 'frozenOffset变化后UILayer变脏');

        store.state.viewport.width = 1024;
        store.flush();
        assert(headerLayer.dirty === true, 'viewport变化后HeaderLayer变脏');
    } catch (e) {
        console.log(`  ❌ 状态变化测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 4. 完整渲染流程\n');

    try {
        const compositor = new LayerCompositor();
        compositor.register(new TestTileLayer());
        compositor.register(new TestFrozenLayer());
        compositor.register(new TestOverlayLayer());
        compositor.register(new TestHeaderLayer());
        compositor.register(new TestUILayer());

        const mockCtx = createMockCtx();

        const mockSheet = {
            frozenColsWidth: 0,
            frozenRowsHeight: 0,
            getHeaderWidth: () => 50,
            getHeaderHeight: () => 30
        };

        const mockViewport = {
            scrollX: 0,
            scrollY: 0,
            viewW: 800,
            viewH: 600
        };

        const stats = compositor.compose(mockCtx, mockSheet, mockViewport, 800, 600);

        assert(stats.totalLayers > 0, '有图层参与渲染');
        assert(typeof stats.frameTime === 'number', '返回帧时间统计');
        assert(stats.dirtyLayers >= 0, '脏图层数量有效');
        assert(stats.cachedLayers >= 0, '缓存命中数有效');
    } catch (e) {
        console.log(`  ❌ 渲染流程测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 5. 冻结功能完整场景\n');

    try {
        const compositor = new LayerCompositor();
        compositor.register(new TestTileLayer());
        compositor.register(new TestFrozenLayer());
        compositor.register(new TestOverlayLayer());
        compositor.register(new TestHeaderLayer());
        compositor.register(new TestUILayer());

        const mockCtx = createMockCtx();

        const mockSheetWithFreeze = {
            frozenColsWidth: 100,
            frozenRowsHeight: 60,
            getHeaderWidth: () => 50,
            getHeaderHeight: () => 30
        };

        const stats = compositor.compose(
            mockCtx,
            mockSheetWithFreeze,
            {},
            800,
            600,
            { isPaginationActive: false }
        );

        assert(stats.totalLayers > 0, '冻结模式下正常渲染');
        console.log(`   📊 冻结模式性能: ${stats.frameTime}ms`);
    } catch (e) {
        console.log(`  ❌ 冻结功能测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 6. 动态启用/禁用图层\n');

    try {
        const compositor = new LayerCompositor();
        const tileLayer = new TestTileLayer();
        const uiLayer = new TestUILayer();
        compositor.register(tileLayer);
        compositor.register(uiLayer);

        const mockCtx = createMockCtx();
        let stats1 = compositor.compose(mockCtx, {}, {}, 100, 100);
        const countWithUI = stats1.totalLayers;

        uiLayer.disable();
        let stats2 = compositor.compose(mockCtx, {}, {}, 100, 100);
        const countWithoutUI = stats2.totalLayers;

        assert(countWithoutUI < countWithUI, '禁用后活跃图层数减少');

        uiLayer.enable();
        let stats3 = compositor.compose(mockCtx, {}, {}, 100, 100);
        const countAfterEnable = stats3.totalLayers;

        assert(countAfterEnable === countWithUI, '重新启用后恢复原状');
    } catch (e) {
        console.log(`  ❌ 动态启禁测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 7. 调试信息输出\n');

    try {
        const compositor = new LayerCompositor();
        compositor.register(new TestTileLayer());
        compositor.register(new TestFrozenLayer());

        const debugInfo = compositor.getDebugInfo();

        assert(Array.isArray(debugInfo), '返回数组');
        assert(debugInfo.length === 2, '包含2个图层的调试信息');
        assert(debugInfo[0].name === 'tiles', '第一个是tiles层');
        assert(debugInfo[1].name === 'frozen', '第二个是frozen层');
    } catch (e) {
        console.log(`  ❌ 调试信息测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 8. 资源清理\n');

    try {
        const compositor = new LayerCompositor();
        compositor.register(new TestTileLayer());
        compositor.register(new TestFrozenLayer());
        compositor.register(new TestOverlayLayer());

        compositor.destroyAll();

        assert(compositor.getSortedLayers().length === 0, '销毁后无图层');
        assert(compositor.layers.size === 0, 'layers Map为空');
    } catch (e) {
        console.log(`  ❌ 资源清理测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 9. computed与图层联动\n');

    try {
        const store = createStore();

        store.computed('hasFrozen', (state) => {
            return state.frozen.rows > 0 || state.frozen.cols > 0;
        });

        const compositor = new LayerCompositor();
        const frozenLayer = new TestFrozenLayer();
        compositor.register(frozenLayer);
        compositor.bindAllLayers(store);

        frozenLayer.clearDirty();
        frozenLayer.watch('frozen', () => {});

        assert(store.state.hasFrozen === false, '初始hasFrozen为false');

        store.state.frozen.rows = 2;
        store.flush();
        assert(store.state.hasFrozen === true, 'frozen变化后hasFrozen为true');
        assert(frozenLayer.dirty === true, 'frozen变化后FrozenLayer变脏');
    } catch (e) {
        console.log(`  ❌ computed联动测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 10. editor状态变化触发UILayer\n');

    try {
        const store = createStore();
        const compositor = new LayerCompositor();
        const uiLayer = new TestUILayer();
        compositor.register(uiLayer);
        compositor.bindAllLayers(store);

        uiLayer.clearDirty();
        uiLayer.watch('editor', () => {});

        store.state.editor.visible = true;
        store.state.editor.row = 0;
        store.state.editor.col = 0;
        store.flush();

        assert(uiLayer.dirty === true, 'editor变化后UILayer变脏');
    } catch (e) {
        console.log(`  ❌ editor状态测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 11. batch同步多个状态域\n');

    try {
        const store = createStore();
        const compositor = new LayerCompositor();
        const tileLayer = new TestTileLayer();
        const frozenLayer = new TestFrozenLayer();
        compositor.register(tileLayer);
        compositor.register(frozenLayer);
        compositor.bindAllLayers(store);

        tileLayer.clearDirty();
        frozenLayer.clearDirty();
        tileLayer.watch('scroll', () => {});
        frozenLayer.watch('frozen', () => {});

        let scrollWatchCount = 0;
        let frozenWatchCount = 0;
        store.watch('scroll', () => { scrollWatchCount++; });
        store.watch('frozen', () => { frozenWatchCount++; });

        store.batch(() => {
            store.state.scroll.x = 200;
            store.state.scroll.y = 300;
            store.state.frozen.rows = 2;
            store.state.frozen.cols = 1;
            store.state.frozenOffset.colsWidth = 80;
            store.state.frozenOffset.rowsHeight = 40;
            store.state.viewport.width = 1024;
            store.state.viewport.height = 768;
        });
        store.flush();

        assert(store.state.scroll.x === 200, 'batch后scroll.x正确');
        assert(store.state.frozen.rows === 2, 'batch后frozen.rows正确');
        assert(store.state.frozenOffset.colsWidth === 80, 'batch后frozenOffset.colsWidth正确');
        assert(store.state.viewport.width === 1024, 'batch后viewport.width正确');
        assert(scrollWatchCount > 0, 'batch后scroll watcher被触发');
        assert(frozenWatchCount > 0, 'batch后frozen watcher被触发');
    } catch (e) {
        console.log(`  ❌ batch同步测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 测试结果汇总:');
    console.log(`   ✅ 通过: ${passed}`);
    console.log(`   ❌ 失败: ${failed}`);

    if (failed === 0) {
        console.log('\n✨ 完美！图层架构集成测试全部通过！');
        console.log('🎉 系统已准备好投入使用！');
    } else {
        console.log('\n⚠️ 存在失败用例，需要修复。');
    }

    return { passed, failed };
}

export { testLayerArchitectureIntegration };