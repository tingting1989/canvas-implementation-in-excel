import { JSDOM } from "jsdom";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join, resolve } from "path";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let nodeCreateCanvas, nodeLoadImage;
try {
    const canvasPkg = require("canvas");
    nodeCreateCanvas = canvasPkg.createCanvas;
    nodeLoadImage = canvasPkg.loadImage;
} catch (e) {
    console.log("⚠️  canvas 包未安装，使用 mock Canvas");
    nodeCreateCanvas = () => ({ getContext: () => null });
    nodeLoadImage = () => Promise.resolve({});
}

function resolveImportPath(specifier) {
    if (specifier.startsWith(".") || specifier.startsWith("/")) {
        const resolved = resolve(__dirname, specifier);
        if (!resolved.match(/\.[m]?[jt]s$/) && !resolved.endsWith("/")) {
            return resolved + ".js";
        }
    }
    return specifier;
}

global.__resolveImport = resolveImportPath;

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div id="wrap" style="position:relative">
    <canvas id="grid" width="800" height="600"></canvas>
    <canvas id="__test_canvas__" width="800" height="600"></canvas>
  </div></body></html>`, {
    url: "http://localhost",
    pretendToBeVisual: true,
});

global.document = dom.window.document;
global.window = dom.window;
global.HTMLCanvasElement = class HTMLCanvasElement {
    constructor() {
        this._internal = null;
        this.width = 0;
        this.height = 0;
        this.style = {};
        this.toDataURL = () => "";
        this.addEventListener = () => {};
        this.removeEventListener = () => {};
    }
    getContext(type) {
        if (type === "2d") {
            if (!this._internal || this._internalWidth !== this.width || this._internalHeight !== this.height) {
                try {
                    this._internal = nodeCreateCanvas(this.width || 1, this.height || 1).getContext("2d");
                } catch (e) {
                    return null;
                }
                this._internalWidth = this.width;
                this._internalHeight = this.height;
            }
            return this._internal;
        }
        return null;
    }
};
global.CanvasRenderingContext2D = (function() {
    try {
        const tmp = nodeCreateCanvas(1, 1).getContext("2d");
        return Object.getPrototypeOf(tmp).constructor;
    } catch (e) {
        return function() {};
    }
})();
global.Image = class Image {
    constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
    set src(v) { nodeLoadImage(v).then(img => { Object.assign(this, img); this.complete = true; if (this.onload) this.onload(); }).catch(() => {}); }
};
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.CONFIG = { DPR: 1, TILE_SIZE: 256, TILE_CACHE_MAX: 512 };
global.devicePixelRatio = 1;

let totalPassed = 0;
let totalFailed = 0;

async function runTest(name, importPath) {
    console.log(`\n${"═".repeat(60)}`);
    try {
        const fullPath = join(__dirname, importPath);
        const url = pathToFileURL(fullPath + (fullPath.endsWith(".js") ? "" : ".js")).href;
        const mod = await import(url);
        const fnName = Object.keys(mod).find(k => k.startsWith("test"));
        if (!fnName) throw new Error("No test function found");
        const result = await mod[fnName]();
        totalPassed += result.passed;
        totalFailed += result.failed;
        return result;
    } catch (e) {
        console.log(`\n  💥 ${name} 测试套件异常:`);
        console.log(`     ${e.message}`);
        if (e.stack) console.log(e.stack.split("\n").slice(0, 4).join("\n     "));
        totalFailed++;
        return { passed: 0, failed: 1 };
    }
}

const startTime = performance.now();
console.log("🚀 Canvas Spreadsheet — 全部单元测试 (Node.js + canvas)\n");
console.log("═".repeat(60));

await runTest("BaseLayer", "./test-base-layer.js");
await runTest("Tile", "./test-tile.js");
await runTest("TileCache", "./test-tile-cache.js");
await runTest("ViewportTransform", "./test-viewport-transform.js");
await runTest("ResizeHandleRenderer", "./test-resize-handle-renderer.js");
await runTest("DragIndicatorRenderer", "./test-drag-indicator-renderer.js");
await runTest("OverlayRenderer", "./test-overlay-renderer.js");
await runTest("HeaderRenderer", "./test-header-renderer.js");
await runTest("TileRenderer", "./test-tile-renderer.js");
await runTest("RenderEngine", "./test-render-engine.js");
await runTest("FrozenLayer", "./test-frozen-layer.js");

const elapsed = (performance.now() - startTime).toFixed(1);

console.log(`\n${"═".repeat(60)}`);
console.log("\n🏁 全部测试完成\n");
console.log("┌────────────────────────────────────┐");
console.log(`│  总通过: ${String(totalPassed).padStart(4)}                     │`);
console.log(`│  总失败: ${String(totalFailed).padStart(4)}                     │`);
console.log(`│  耗时:   ${elapsed.padStart(6)} ms                │`);
console.log("└────────────────────────────────────┘");

if (totalFailed === 0) console.log("\n✨🎉 所有测试全部通过！🎉✨");
else console.log(`\n⚠️  有 ${totalFailed} 个测试用例失败`);

process.exit(totalFailed > 0 ? 1 : 0);