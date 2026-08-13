#!/usr/bin/env node

/**
 * 校验 fix-dts-paths.js 转换结果是否正确：
 * 1. 确认 dist/types 中不再残留任何 @/ 别名
 * 2. 确认每个相对 import 都能解析到真实存在的 .d.ts 文件
 *    （模拟 TS 模块解析：./foo -> foo.d.ts / foo/index.d.ts；
 *     ./foo.js -> foo.d.ts）
 *
 * 用法：node scripts/verify-dts-paths.js
 */

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const typesDir = path.join(rootDir, "dist", "types");

let fileCount = 0;
let importChecked = 0;
let aliasRemaining = 0;
let unresolved = 0;

function candidatePaths(fromDir, importPath) {
    const abs = path.resolve(fromDir, importPath);
    const list = [
        abs,
        abs + ".d.ts",
        abs + ".ts",
        abs + ".js",
        path.join(abs, "index.d.ts"),
        path.join(abs, "index.ts"),
        path.join(abs, "index.js"),
    ];
    if (importPath.endsWith(".js")) {
        list.push(abs.replace(/\.js$/, ".d.ts"));
    }
    if (importPath.endsWith(".ts")) {
        list.push(abs.replace(/\.ts$/, ".d.ts"));
    }
    return list;
}

function resolveImport(fromDir, importPath) {
    return candidatePaths(fromDir, importPath).some((p) => fs.existsSync(p));
}

function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*/g, "");
}

function checkFile(filePath) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const content = stripComments(raw);
    const fileDir = path.dirname(filePath);
    const relFile = path.relative(rootDir, filePath);

    const aliasRegex = /from\s+["']@\/([^"']+)["']/g;
    let m;
    while ((m = aliasRegex.exec(content)) !== null) {
        aliasRemaining++;
        console.error(`[ALIAS REMAINING] ${relFile} -> @/${m[1]}`);
    }

    const importRegex = /from\s+["'](\.[^"']+)["']/g;
    while ((m = importRegex.exec(content)) !== null) {
        importChecked++;
        if (!resolveImport(fileDir, m[1])) {
            unresolved++;
            console.error(`[UNRESOLVED] ${relFile} -> "${m[1]}"`);
        }
    }
}

function walkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkDir(fullPath);
        } else if (entry.name.endsWith(".d.ts")) {
            fileCount++;
            checkFile(fullPath);
        }
    }
}

if (!fs.existsSync(typesDir)) {
    console.error("No dist/types directory found. Run 'tsc --emitDeclarationOnly' first.");
    process.exit(1);
}

walkDir(typesDir);

console.log("\n===== Verification Summary =====");
console.log(`.d.ts files scanned : ${fileCount}`);
console.log(`Relative imports    : ${importChecked}`);
console.log(`Remaining @/ aliases: ${aliasRemaining}`);
console.log(`Unresolved imports  : ${unresolved}`);

if (aliasRemaining === 0 && unresolved === 0) {
    console.log("\n✓ All paths verified successfully.");
    process.exit(0);
} else {
    console.error(`\n✗ Verification failed (${aliasRemaining} alias(es), ${unresolved} unresolved).`);
    process.exit(1);
}