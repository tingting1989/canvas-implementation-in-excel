/**
 * 公式系统性能基准测试
 *
 * 测试 3 项优化的性能提升：
 * - P0: 范围依赖空间索引 vs 线性扫描
 * - P1: _forEachLeaf 惰性遍历 vs _flatten 临时数组
 * - P2: 拓扑排序 vs 插入顺序
 *
 * 运行: node benchmark/formula-perf.mjs
 */

function _flatten(arr) {
    const result = [];
    const stack = [{ arr, index: 0 }];
    while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        if (frame.index >= frame.arr.length) { stack.pop(); continue; }
        const item = frame.arr[frame.index];
        frame.index++;
        if (Array.isArray(item)) { stack.push({ arr: item, index: 0 }); }
        else { result.push(item); }
    }
    return result;
}

function _toNum(v) {
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "string" && v.trim() !== "") {
        const n = parseFloat(v);
        return isNaN(n) ? NaN : n;
    }
    return NaN;
}

function _forEachLeaf(args, callback) {
    for (let i = 0; i < args.length; i++) {
        const item = args[i];
        if (Array.isArray(item)) {
            for (let j = 0; j < item.length; j++) {
                const row = item[j];
                if (Array.isArray(row)) {
                    for (let k = 0; k < row.length; k++) callback(row[k]);
                } else { callback(row); }
            }
        } else { callback(item); }
    }
}

function _collectNums(args) {
    const nums = [];
    _forEachLeaf(args, (v) => { const n = _toNum(v); if (!isNaN(n)) nums.push(n); });
    return nums;
}

function bench(name, fn, iterations = 1000) {
    for (let i = 0; i < 50; i++) fn();
    const start = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    const elapsed = performance.now() - start;
    return { name, elapsed, perCall: elapsed / iterations };
}

function formatMs(ms) {
    if (ms < 0.001) return `${(ms * 1000).toFixed(2)}µs`;
    if (ms < 1) return `${ms.toFixed(3)}ms`;
    return `${ms.toFixed(2)}ms`;
}

console.log("=".repeat(70));
console.log("公式系统性能基准测试");
console.log("=".repeat(70));

// ============================================================
// P1: _forEachLeaf vs _flatten（聚合函数遍历）
// ============================================================
console.log("\n━━━ P1: 聚合函数遍历性能 ━━━\n");

const sizes = [100, 1000, 10000];
for (const size of sizes) {
    const rows = Math.ceil(size / 10);
    const cols = 10;
    const matrix2D = [];
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) row.push(Math.random() * 100);
        matrix2D.push(row);
    }
    const args = [matrix2D];

    const iter = size <= 100 ? 10000 : size <= 1000 ? 1000 : 100;

    const rFlattenSum = bench(`_flatten SUM [${size}]`, () => {
        const flat = _flatten(args);
        let sum = 0;
        for (const v of flat) { const n = _toNum(v); if (!isNaN(n)) sum += n; }
        return sum;
    }, iter);

    const rForEachSum = bench(`_forEachLeaf SUM [${size}]`, () => {
        let sum = 0;
        _forEachLeaf(args, (v) => { const n = _toNum(v); if (!isNaN(n)) sum += n; });
        return sum;
    }, iter);

    const rFlattenAvg = bench(`_flatten AVG [${size}]`, () => {
        const flat = _flatten(args).map(_toNum).filter(v => !isNaN(v));
        return flat.reduce((a, b) => a + b, 0) / flat.length;
    }, iter);

    const rForEachAvg = bench(`_forEachLeaf AVG [${size}]`, () => {
        let sum = 0, count = 0;
        _forEachLeaf(args, (v) => { const n = _toNum(v); if (!isNaN(n)) { sum += n; count++; } });
        return sum / count;
    }, iter);

    const rFlattenCollect = bench(`_flatten+map+filter [${size}]`, () => {
        return _flatten(args).map(_toNum).filter(v => !isNaN(v));
    }, iter);

    const rCollectNums = bench(`_collectNums [${size}]`, () => {
        return _collectNums(args);
    }, iter);

    const speedupSum = rFlattenSum.perCall / rForEachSum.perCall;
    const speedupAvg = rFlattenAvg.perCall / rForEachAvg.perCall;
    const speedupCollect = rFlattenCollect.perCall / rCollectNums.perCall;

    console.log(`  范围大小: ${size} 单元格 (${rows}行×${cols}列)`);
    console.log(`  ┌─────────────────────┬──────────────┬──────────────┬─────────┐`);
    console.log(`  │ 操作                │ _flatten     │ _forEachLeaf │ 加速比  │`);
    console.log(`  ├─────────────────────┼──────────────┼──────────────┼─────────┤`);
    console.log(`  │ SUM                 │ ${formatMs(rFlattenSum.perCall).padStart(12)} │ ${formatMs(rForEachSum.perCall).padStart(12)} │ ${speedupSum.toFixed(2)}x   │`);
    console.log(`  │ AVERAGE             │ ${formatMs(rFlattenAvg.perCall).padStart(12)} │ ${formatMs(rForEachAvg.perCall).padStart(12)} │ ${speedupAvg.toFixed(2)}x   │`);
    console.log(`  │ collectNums         │ ${formatMs(rFlattenCollect.perCall).padStart(12)} │ ${formatMs(rCollectNums.perCall).padStart(12)} │ ${speedupCollect.toFixed(2)}x   │`);
    console.log(`  └─────────────────────┴──────────────┴──────────────┴─────────┘`);
}

// 内存分配测试
console.log("\n  内存分配测试 (GC 压力):");
for (const size of [1000, 10000]) {
    const rows = Math.ceil(size / 10);
    const matrix2D = [];
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < 10; c++) row.push(Math.random() * 100);
        matrix2D.push(row);
    }
    const args = [matrix2D];
    const iter = 500;

    const memBefore = process.memoryUsage().heapUsed;
    for (let i = 0; i < iter; i++) { _flatten(args); }
    const memAfterFlatten = process.memoryUsage().heapUsed;
    global.gc?.();
    const memAfterGC = process.memoryUsage().heapUsed;

    const memBefore2 = process.memoryUsage().heapUsed;
    for (let i = 0; i < iter; i++) { let sum = 0; _forEachLeaf(args, v => { sum += v; }); }
    const memAfterForEach = process.memoryUsage().heapUsed;
    global.gc?.();

    console.log(`    [${size}] _flatten 堆增量: ${((memAfterFlatten - memBefore) / 1024).toFixed(0)}KB, GC后: ${((memAfterGC - memBefore) / 1024).toFixed(0)}KB`);
    console.log(`    [${size}] _forEachLeaf 堆增量: ${((memAfterForEach - memBefore2) / 1024).toFixed(0)}KB`);
}

// ============================================================
// P0: 空间索引 vs 线性扫描
// ============================================================
console.log("\n━━━ P0: 范围依赖查找性能 ━━━\n");

const CELL_KEY_RE = /^(.+)!(\d+),(\d+)$/;
const RANGE_KEY_RE = /^(.+)!(\d+),(\d+):(\d+),(\d+)$/;

function parseRangeKey(key) {
    const match = key.match(RANGE_KEY_RE);
    if (!match) return null;
    return { sheetName: match[1], topRow: +match[2], topCol: +match[3], bottomRow: +match[4], bottomCol: +match[5] };
}

function isCellInRangeLinear(sheetName, row, col, rangeDependents) {
    const matched = [];
    for (const [rangeKey] of rangeDependents) {
        const range = parseRangeKey(rangeKey);
        if (!range || range.sheetName !== sheetName) continue;
        if (row >= range.topRow && row <= range.bottomRow && col >= range.topCol && col <= range.bottomCol) {
            matched.push(rangeKey);
        }
    }
    return matched;
}

function findRangeDependentsSpatial(sheetName, row, col, spatialIndex, bucketSize, rangeDependents) {
    const matched = [];
    const bucketIndex = Math.floor(row / bucketSize);
    const bucketKey = `${sheetName}:${bucketIndex}`;
    const bucket = spatialIndex.get(bucketKey);
    if (!bucket) return matched;
    for (const [rangeKey, rangeInfo] of bucket) {
        if (row >= rangeInfo.topRow && row <= rangeInfo.bottomRow &&
            col >= rangeInfo.topCol && col <= rangeInfo.bottomCol) {
            matched.push(rangeKey);
        }
    }
    return matched;
}

const rangeCounts = [50, 200, 500];
for (const rangeCount of rangeCounts) {
    const rangeDependents = new Map();
    const spatialIndex = new Map();
    const bucketSize = 256;
    const sheetName = "Sheet1";

    for (let i = 0; i < rangeCount; i++) {
        const topRow = Math.floor(Math.random() * 1000);
        const topCol = Math.floor(Math.random() * 20);
        const bottomRow = topRow + Math.floor(Math.random() * 50);
        const bottomCol = topCol + Math.floor(Math.random() * 5);
        const rangeKey = `${sheetName}!${topRow},${topCol}:${bottomRow},${bottomCol}`;
        rangeDependents.set(rangeKey, new Set([`formula_${i}`]));

        const startBucket = Math.floor(topRow / bucketSize);
        const endBucket = Math.floor(bottomRow / bucketSize);
        for (let b = startBucket; b <= endBucket; b++) {
            const bk = `${sheetName}:${b}`;
            let bucket = spatialIndex.get(bk);
            if (!bucket) { bucket = new Map(); spatialIndex.set(bk, bucket); }
            bucket.set(rangeKey, { topRow, bottomRow, topCol, bottomCol });
        }
    }

    const testRow = 500;
    const testCol = 5;
    const iter = 10000;

    const rLinear = bench(`线性扫描 [${rangeCount}范围]`, () => {
        isCellInRangeLinear(sheetName, testRow, testCol, rangeDependents);
    }, iter);

    const rSpatial = bench(`空间索引 [${rangeCount}范围]`, () => {
        findRangeDependentsSpatial(sheetName, testRow, testCol, spatialIndex, bucketSize, rangeDependents);
    }, iter);

    const speedup = rLinear.perCall / rSpatial.perCall;

    console.log(`  范围数量: ${rangeCount}`);
    console.log(`  ┌──────────────┬──────────────┬──────────────┬─────────┐`);
    console.log(`  │ 方法         │ 单次耗时     │ 每秒调用数   │ 加速比  │`);
    console.log(`  ├──────────────┼──────────────┼──────────────┼─────────┤`);
    console.log(`  │ 线性扫描     │ ${formatMs(rLinear.perCall).padStart(12)} │ ${Math.round(1000 / rLinear.perCall).toString().padStart(12)} │ ${speedup.toFixed(2)}x   │`);
    console.log(`  │ 空间索引     │ ${formatMs(rSpatial.perCall).padStart(12)} │ ${Math.round(1000 / rSpatial.perCall).toString().padStart(12)} │         │`);
    console.log(`  └──────────────┴──────────────┴──────────────┴─────────┘`);
}

// ============================================================
// P2: 拓扑排序 vs 插入顺序
// ============================================================
console.log("\n━━━ P2: 拓扑排序重算性能 ━━━\n");

function topoSort(formulaKeys, dependsOn) {
    const keySet = new Set(formulaKeys);
    const inDegree = new Map();
    const adj = new Map();
    for (const key of formulaKeys) { inDegree.set(key, 0); adj.set(key, []); }
    for (const key of formulaKeys) {
        const deps = dependsOn.get(key);
        if (!deps) continue;
        for (const dep of deps) {
            if (keySet.has(dep)) {
                inDegree.set(key, inDegree.get(key) + 1);
                adj.get(dep).push(key);
            }
        }
    }
    const queue = [];
    for (const [key, degree] of inDegree) { if (degree === 0) queue.push(key); }
    const sorted = [];
    while (queue.length > 0) {
        const key = queue.shift();
        sorted.push(key);
        for (const dep of adj.get(key)) {
            const nd = inDegree.get(dep) - 1;
            inDegree.set(dep, nd);
            if (nd === 0) queue.push(dep);
        }
    }
    for (const key of formulaKeys) { if (!sorted.includes(key)) sorted.push(key); }
    return sorted;
}

function simulateEvalInsertionOrder(formulaKeys, dependsOn, cellValues) {
    let evalCount = 0;
    for (const key of formulaKeys) {
        const deps = dependsOn.get(key);
        if (deps) {
            for (const dep of deps) {
                if (cellValues.has(dep)) { cellValues.get(dep); }
            }
        }
        evalCount++;
        cellValues.set(key, Math.random());
    }
    return evalCount;
}

function simulateEvalTopoOrder(sortedKeys, dependsOn, cellValues) {
    let evalCount = 0;
    for (const key of sortedKeys) {
        const deps = dependsOn.get(key);
        if (deps) {
            for (const dep of deps) {
                if (cellValues.has(dep)) { cellValues.get(dep); }
            }
        }
        evalCount++;
        cellValues.set(key, Math.random());
    }
    return evalCount;
}

const formulaCounts = [50, 200, 500];
for (const count of formulaCounts) {
    const formulaKeys = [];
    const dependsOn = new Map();
    const cellValues = new Map();

    for (let i = 0; i < count; i++) {
        const key = `Sheet1!${i},0`;
        formulaKeys.push(key);
        const deps = new Set();
        if (i > 0) {
            deps.add(`Sheet1!${i - 1},0`);
            if (i > 1 && Math.random() > 0.5) deps.add(`Sheet1!${i - 2},0`);
        }
        dependsOn.set(key, deps);
        cellValues.set(key, Math.random());
    }

    const sortedKeys = topoSort(formulaKeys, dependsOn);

    const iter = 1000;

    const rInsertion = bench(`插入顺序 [${count}公式]`, () => {
        const cv = new Map(cellValues);
        simulateEvalInsertionOrder([...formulaKeys], dependsOn, cv);
    }, iter);

    const rTopo = bench(`拓扑排序 [${count}公式]`, () => {
        const cv = new Map(cellValues);
        simulateEvalTopoOrder(sortedKeys, dependsOn, cv);
    }, iter);

    const sortTime = bench(`拓扑排序构建 [${count}公式]`, () => {
        topoSort(formulaKeys, dependsOn);
    }, iter);

    console.log(`  公式数量: ${count} (链式依赖 A→B→C→...)`);
    console.log(`  ┌──────────────────────┬──────────────┬──────────────┐`);
    console.log(`  │ 方法                 │ 单次耗时     │ 排序构建耗时 │`);
    console.log(`  ├──────────────────────┼──────────────┼──────────────┤`);
    console.log(`  │ 插入顺序遍历         │ ${formatMs(rInsertion.perCall).padStart(12)} │ ${"N/A".padStart(12)} │`);
    console.log(`  │ 拓扑排序遍历         │ ${formatMs(rTopo.perCall).padStart(12)} │ ${formatMs(sortTime.perCall).padStart(12)} │`);
    console.log(`  └──────────────────────┴──────────────┴──────────────┘`);
}

// ============================================================
// 汇总
// ============================================================
console.log("\n" + "=".repeat(70));
console.log("测试完成");
console.log("=".repeat(70));