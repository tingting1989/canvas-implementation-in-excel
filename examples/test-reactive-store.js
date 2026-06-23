async function testReactiveStore() {
    console.log('\x1b[36m🧪 ReactiveStore Unit Tests\x1b[0m\n');
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

    const { ReactiveStore, Scheduler } = await import('../src/state/ReactiveStore.js');

    console.log('\n📋 1. 基本状态访问和修改\n');

    try {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            frozen: { rows: 0, cols: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            selection: { ranges: [], activeRange: null, merges: [] },
            editor: { visible: false, row: -1, col: -1, value: '' },
            viewport: { width: 0, height: 0 },
            tile: { size: 256, cacheMax: 512 }
        });

        assert(store.state.scroll.x === 0, '初始scroll.x为0');
        assert(store.state.scroll.y === 0, '初始scroll.y为0');
        assert(store.state.frozen.rows === 0, '初始frozen.rows为0');
        assert(store.state.frozen.cols === 0, '初始frozen.cols为0');
        assert(store.state.frozenOffset.colsWidth === 0, '初始frozenOffset.colsWidth为0');
        assert(store.state.frozenOffset.rowsHeight === 0, '初始frozenOffset.rowsHeight为0');
        assert(store.state.selection.ranges.length === 0, '初始selection.ranges为空数组');
        assert(store.state.selection.activeRange === null, '初始selection.activeRange为null');
        assert(store.state.editor.visible === false, '初始editor.visible为false');
        assert(store.state.viewport.width === 0, '初始viewport.width为0');
        assert(store.state.tile.size === 256, '初始tile.size为256');

        store.state.scroll.x = 100;
        assert(store.state.scroll.x === 100, '修改scroll.x成功');

        store.state.frozen.rows = 3;
        assert(store.state.frozen.rows === 3, '修改frozen.rows成功');

        store.state.frozenOffset.colsWidth = 150;
        assert(store.state.frozenOffset.colsWidth === 150, '修改frozenOffset.colsWidth成功');

        store.state.editor.visible = true;
        store.state.editor.row = 5;
        store.state.editor.col = 3;
        assert(store.state.editor.visible === true, '修改editor.visible成功');
        assert(store.state.editor.row === 5, '修改editor.row成功');
    } catch (e) {
        console.log(`  ❌ 基本状态测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 2. watch监听器测试\n');

    try {
        const store = new ReactiveStore({ value: 0 });
        let watchCalled = false;
        let receivedNewVal = null;
        let receivedOldVal = null;

        store.watch('value', (newVal, oldVal) => {
            watchCalled = true;
            receivedNewVal = newVal;
            receivedOldVal = oldVal;
        });

        store.state.value = 42;
        store.flush();

        assert(watchCalled === true, 'watch回调被调用');
        assert(receivedNewVal === 42, '接收到正确的新值');
        assert(receivedOldVal === 0, '接收到正确的旧值');
    } catch (e) {
        console.log(`  ❌ watch监听器测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 3. 取消watch监听\n');

    try {
        const store = new ReactiveStore({ value: 0 });
        let callCount = 0;

        const unwatch = store.watch('value', () => {
            callCount++;
        });

        store.state.value = 1;
        store.flush();
        assert(callCount === 1, '第一次修改触发watch');

        unwatch();
        store.state.value = 2;
        store.flush();
        assert(callCount === 1, '取消watch后不再触发');
    } catch (e) {
        console.log(`  ❌ 取消watch测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 4. batch批量更新测试\n');

    try {
        const store = new ReactiveStore({
            x: 0,
            y: 0,
            z: 0
        });
        let triggerCount = 0;

        store.watch('x', () => { triggerCount++; });
        store.watch('y', () => { triggerCount++; });
        store.watch('z', () => { triggerCount++; });

        store.batch(() => {
            store.state.x = 1;
            store.state.y = 2;
            store.state.z = 3;
        });
        store.flush();

        assert(triggerCount > 0, 'batch后有watcher被触发');
    } catch (e) {
        console.log(`  ❌ batch批量更新测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 5. 嵌套对象变化检测\n');

    try {
        const store = new ReactiveStore({
            nested: {
                level1: {
                    level2: {
                        value: 'deep'
                    }
                }
            }
        });
        let deepWatchCalled = false;

        store.watch('nested', (newVal, oldVal) => {
            deepWatchCalled = true;
        });

        store.state.nested.level1.level2.value = 'changed';
        store.flush();

        assert(deepWatchCalled === true, '深层嵌套变化能被检测到');
    } catch (e) {
        console.log(`  ❌ 嵌套对象测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 6. getStateSnapshot快照测试\n');

    try {
        const store = new ReactiveStore({
            data: [1, 2, 3],
            obj: { a: 1 }
        });

        const snapshot = store.getStateSnapshot();

        assert(snapshot.data.length === 3, '快照包含数组数据');
        assert(snapshot.obj.a === 1, '快照包含对象数据');

        store.state.data.push(4);
        assert(snapshot.data.length === 3, '快照是深拷贝，不受后续修改影响');
    } catch (e) {
        console.log(`  ❌ getStateSnapshot测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 7. destroy销毁测试\n');

    try {
        const store = new ReactiveStore({ value: 0 });
        let callCount = 0;

        store.watch('value', () => { callCount++; });

        store.destroy();

        store.state.value = 100;
        store.flush();
        assert(callCount === 0, 'destroy后不再触发watcher');
    } catch (e) {
        console.log(`  ❌ destroy测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 8. 相同值不触发更新\n');

    try {
        const store = new ReactiveStore({ value: 100 });
        let callCount = 0;

        store.watch('value', () => { callCount++; });

        store.state.value = 100;
        store.flush();

        assert(callCount === 0, '相同值不应触发更新');
    } catch (e) {
        console.log(`  ❌ 相同值测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 9. computed计算属性测试\n');

    try {
        const store = new ReactiveStore({
            frozen: { rows: 0, cols: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 }
        });

        let computedWatchCount = 0;
        store.watch('hasFrozen', () => { computedWatchCount++; });

        store.computed('hasFrozen', (state) => {
            return state.frozen.rows > 0 || state.frozen.cols > 0;
        });

        assert(store.state.hasFrozen === false, '初始computed值为false');

        store.state.frozen.rows = 3;
        store.flush();
        assert(store.state.hasFrozen === true, 'frozen.rows变化后computed值为true');
        assert(computedWatchCount > 0, 'computed变化触发了watcher');

        store.state.frozen.rows = 0;
        store.flush();
        assert(store.state.hasFrozen === false, 'frozen.rows归零后computed值为false');
    } catch (e) {
        console.log(`  ❌ computed测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 10. computed依赖追踪测试\n');

    try {
        const store = new ReactiveStore({
            width: 10,
            height: 20
        });

        store.computed('area', (state) => {
            return state.width * state.height;
        });

        assert(store.state.area === 200, '初始computed area=200');

        store.state.width = 15;
        assert(store.state.area === 300, 'width变化后area=300');

        store.state.height = 10;
        assert(store.state.area === 150, 'height变化后area=150');
    } catch (e) {
        console.log(`  ❌ computed依赖追踪测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 11. computed取消测试\n');

    try {
        const store = new ReactiveStore({ value: 1 });

        const uncomputed = store.computed('doubled', (state) => {
            return state.value * 2;
        });

        assert(store.state.doubled === 2, '初始doubled=2');

        uncomputed();

        store.state.value = 5;
        assert(store.state.doubled === 2, '取消computed后不再更新');
    } catch (e) {
        console.log(`  ❌ computed取消测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 12. 完整状态结构验证\n');

    try {
        const store = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            frozen: { rows: 0, cols: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 },
            selection: { ranges: [], activeRange: null, merges: [] },
            editor: { visible: false, row: -1, col: -1, value: '' },
            viewport: { width: 0, height: 0 },
            tile: { size: 256, cacheMax: 512 }
        });

        const snapshot = store.getStateSnapshot();

        assert(typeof snapshot.scroll === 'object', '快照包含scroll对象');
        assert(typeof snapshot.frozen === 'object', '快照包含frozen对象');
        assert(typeof snapshot.frozenOffset === 'object', '快照包含frozenOffset对象');
        assert(typeof snapshot.selection === 'object', '快照包含selection对象');
        assert(typeof snapshot.editor === 'object', '快照包含editor对象');
        assert(typeof snapshot.viewport === 'object', '快照包含viewport对象');
        assert(typeof snapshot.tile === 'object', '快照包含tile对象');

        assert(Object.keys(snapshot).length === 7, '状态结构有7个顶级域');
    } catch (e) {
        console.log(`  ❌ 完整状态结构测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 13. 路径匹配精确性（前缀污染防护）\n');

    try {
        const store = new ReactiveStore({
            frozen: { rows: 0, cols: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 }
        });

        let frozenCount = 0;
        let frozenOffsetCount = 0;

        store.watch('frozen', () => { frozenCount++; });
        store.watch('frozenOffset', () => { frozenOffsetCount++; });

        store.state.frozenOffset.colsWidth = 100;
        store.flush();
        assert(frozenOffsetCount === 1, 'frozenOffset变化触发自身watcher');
        assert(frozenCount === 0, 'frozenOffset变化不触发frozen watcher');

        store.state.frozen.rows = 3;
        store.flush();
        assert(frozenCount === 1, 'frozen变化触发自身watcher');
        assert(frozenOffsetCount === 1, 'frozen变化不触发frozenOffset watcher');

        const store2 = new ReactiveStore({
            scroll: { x: 0, y: 0 },
            scrollBackup: { x: 0, y: 0 }
        });

        let scrollCount = 0;
        let scrollBackupCount = 0;

        store2.watch('scroll', () => { scrollCount++; });
        store2.watch('scrollBackup', () => { scrollBackupCount++; });

        store2.state.scroll.x = 100;
        store2.flush();
        assert(scrollCount === 1, 'scroll.x变化触发scroll watcher');
        assert(scrollBackupCount === 0, 'scroll.x变化不触发scrollBackup watcher');

        store2.state.scrollBackup.x = 50;
        store2.flush();
        assert(scrollBackupCount === 1, 'scrollBackup.x变化触发scrollBackup watcher');
        assert(scrollCount === 1, 'scrollBackup.x变化不触发scroll watcher');
    } catch (e) {
        console.log(`  ❌ 路径匹配精确性测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 14. computed路径匹配精确性\n');

    try {
        const store = new ReactiveStore({
            frozen: { rows: 0, cols: 0 },
            frozenOffset: { colsWidth: 0, rowsHeight: 0 }
        });

        let hasFrozenCount = 0;

        store.computed('hasFrozen', (state) => {
            return state.frozen.rows > 0 || state.frozen.cols > 0;
        });

        store.watch('hasFrozen', () => { hasFrozenCount++; });

        store.state.frozenOffset.colsWidth = 200;
        store.flush();
        assert(hasFrozenCount === 0, 'frozenOffset变化不触发hasFrozen computed');
        assert(store.state.hasFrozen === false, 'hasFrozen值未变');

        store.state.frozen.rows = 2;
        store.flush();
        assert(hasFrozenCount === 1, 'frozen变化触发hasFrozen computed');
        assert(store.state.hasFrozen === true, 'hasFrozen值已变');
    } catch (e) {
        console.log(`  ❌ computed路径匹配测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 15. computed是lazy的（依赖变化不立即重算）\n');

    try {
        let callCount = 0;

        const store = new ReactiveStore({ value: 1 });

        store.computed('doubled', (state) => {
            callCount++;
            return state.value * 2;
        });

        assert(callCount === 1, '创建时执行1次getter');
        assert(store.state.doubled === 2, '初始值正确');

        store.state.value = 5;
        assert(callCount === 1, '依赖变化后getter尚未执行（lazy）');

        assert(store.state.doubled === 10, '读取时才重算');
        assert(callCount === 2, '读取后getter执行了1次');

        store.state.value = 10;
        store.state.value = 20;
        assert(callCount === 2, '多次修改未读取，getter仍只执行2次');

        assert(store.state.doubled === 40, '最终读取时重算');
        assert(callCount === 3, '只多了1次getter调用');
    } catch (e) {
        console.log(`  ❌ lazy computed测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 16. computed链式依赖（不会死循环）\n');

    try {
        const store = new ReactiveStore({ x: 1 });

        store.computed('doubled', (state) => state.x * 2);
        store.computed('quadrupled', (state) => state.doubled * 2);

        assert(store.state.doubled === 2, 'doubled初始=2');
        assert(store.state.quadrupled === 4, 'quadrupled初始=4');

        store.state.x = 3;
        assert(store.state.doubled === 6, 'doubled更新=6');
        assert(store.state.quadrupled === 12, 'quadrupled更新=12');
    } catch (e) {
        console.log(`  ❌ computed链式依赖测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 17. computed依赖变化时通知watcher（lazy权衡）\n');

    try {
        const store = new ReactiveStore({ x: 2 });

        store.computed('isPositive', (state) => state.x > 0);

        let watchCount = 0;
        store.watch('isPositive', () => { watchCount++; });

        assert(store.state.isPositive === true, '初始isPositive=true');

        store.state.x = 5;
        store.flush();
        assert(store.state.isPositive === true, 'x从2变5，isPositive仍为true');
        assert(watchCount === 1, 'lazy模式：依赖变化即通知watcher');

        store.state.x = -1;
        store.flush();
        assert(store.state.isPositive === false, 'x变-1，isPositive变false');
        assert(watchCount === 2, '依赖再次变化，watcher再次触发');
    } catch (e) {
        console.log(`  ❌ computed watcher通知测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 18. WeakMap：多store共享对象不冲突\n');

    try {
        const shared = { count: 0 };

        const store1 = new ReactiveStore({ data: shared });
        const store2 = new ReactiveStore({ data: shared });

        let s1Count = 0;
        let s2Count = 0;

        store1.watch('data', () => { s1Count++; });
        store2.watch('data', () => { s2Count++; });

        store1.state.data.count = 10;
        store1.flush();
        assert(s1Count === 1, 'store1的watcher触发');
        assert(s2Count === 0, 'store2的watcher未触发（隔离）');

        store2.state.data.count = 20;
        store2.flush();
        assert(s2Count === 1, 'store2的watcher触发');
        assert(s1Count === 1, 'store1的watcher未重复触发');
    } catch (e) {
        console.log(`  ❌ 多store共享对象测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 19. WeakMap：原始对象无污染\n');

    try {
        const raw = { x: 1, nested: { y: 2 } };

        const store = new ReactiveStore({ data: raw });

        store.state.data.x;
        store.state.data.nested.y;

        const keys = Object.keys(raw);
        assert(!keys.includes('__proxyRef'), '原始对象无__proxyRef属性');
        assert(!keys.includes('__isProxy'), '原始对象无__isProxy属性');

        const nestedKeys = Object.keys(raw.nested);
        assert(!nestedKeys.includes('__proxyRef'), '嵌套对象无__proxyRef属性');

        const snapshot = store.getStateSnapshot();
        const snapshotKeys = Object.keys(snapshot.data);
        assert(!snapshotKeys.includes('__proxyRef'), '快照无__proxyRef属性');
    } catch (e) {
        console.log(`  ❌ 原始对象无污染测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 20. Scheduler：watcher异步调度\n');

    try {
        const store = new ReactiveStore({ x: 0 });
        let callCount = 0;

        store.watch('x', () => { callCount++; });

        store.state.x = 1;
        assert(callCount === 0, '状态变化后watcher未同步执行');

        store.flush();
        assert(callCount === 1, 'flush后watcher执行');
    } catch (e) {
        console.log(`  ❌ Scheduler异步调度测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 21. Scheduler：同帧多次修改只触发一次watcher\n');

    try {
        const store = new ReactiveStore({ x: 0 });
        let callCount = 0;
        let lastValue = null;

        store.watch('x', (newVal) => { callCount++; lastValue = newVal; });

        store.state.x = 1;
        store.state.x = 2;
        store.state.x = 3;

        assert(callCount === 0, '多次修改后watcher仍未同步执行');

        store.flush();
        assert(callCount === 1, 'flush后只触发1次watcher（去重）');
        assert(lastValue === 3, 'watcher接收到最终值3');
    } catch (e) {
        console.log(`  ❌ Scheduler去重测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 22. Scheduler：独立Scheduler实例\n');

    try {
        const scheduler = new Scheduler();

        let count = 0;
        scheduler.queueJob({ id: 'a', run: () => { count++; } });
        scheduler.queueJob({ id: 'a', run: () => { count++; } });
        scheduler.queueJob({ id: 'b', run: () => { count++; } });

        assert(scheduler.pending === 2, '去重后队列中有2个job');
        assert(count === 0, 'job未同步执行');

        scheduler.flush();
        assert(count === 2, 'flush后2个job执行');
        assert(scheduler.pending === 0, '队列已清空');
    } catch (e) {
        console.log(`  ❌ Scheduler实例测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 23. Scheduler：cancel取消待执行job\n');

    try {
        const scheduler = new Scheduler();

        let count = 0;
        scheduler.queueJob({ id: 'a', run: () => { count++; } });

        scheduler.cancel();
        assert(scheduler.pending === 0, 'cancel后队列为空');

        scheduler.flush();
        assert(count === 0, 'cancel后flush不执行job');
    } catch (e) {
        console.log(`  ❌ Scheduler cancel测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 24. Scheduler：注入自定义scheduler\n');

    try {
        const syncScheduler = new Scheduler();
        const originalQueueJob = syncScheduler.queueJob.bind(syncScheduler);
        syncScheduler.queueJob = (job) => {
            originalQueueJob(job);
            syncScheduler.flush();
        };

        const store = new ReactiveStore({ x: 0 }, { scheduler: syncScheduler });
        let callCount = 0;

        store.watch('x', () => { callCount++; });

        store.state.x = 42;
        assert(callCount === 1, '自定义同步scheduler立即执行watcher');
    } catch (e) {
        console.log(`  ❌ 自定义scheduler注入测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n📋 25. Scheduler：scroll高频模拟\n');

    try {
        const store = new ReactiveStore({ scroll: { x: 0, y: 0 } });
        let renderCount = 0;

        store.watch('scroll', () => { renderCount++; });

        for (let i = 0; i < 100; i++) {
            store.state.scroll.x = i;
        }

        assert(renderCount === 0, '100次scroll修改未触发任何渲染');
        assert(store._scheduler.pending > 0, 'job已入队');

        store.flush();
        assert(renderCount === 1, 'flush后只渲染1次（100次修改合并）');
        assert(store.state.scroll.x === 99, '最终值正确');
    } catch (e) {
        console.log(`  ❌ scroll高频模拟测试异常: ${e.message}`);
        failed++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 测试结果汇总:');
    console.log(`   ✅ 通过: ${passed}`);
    console.log(`   ❌ 失败: ${failed}`);

    if (failed === 0) {
        console.log('\n✨ 完美！ReactiveStore所有测试通过！');
    } else {
        console.log('\n⚠️ 存在失败用例，需要修复。');
    }

    return { passed, failed };
}

export { testReactiveStore };