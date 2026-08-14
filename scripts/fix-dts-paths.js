const fs = require("fs");
const path = require("path");

const DIST_TYPES = path.resolve(__dirname, "..", "dist", "types");

function walkDir(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkDir(fullPath));
        } else if (entry.isFile() && entry.name.endsWith(".d.ts")) {
            results.push(fullPath);
        }
    }
    return results;
}

function fixDtsPaths() {
    if (!fs.existsSync(DIST_TYPES)) {
        console.warn(`[fix-dts-paths] 目录不存在: ${DIST_TYPES}`);
        console.warn("[fix-dts-paths] 请先运行 tsc --emitDeclarationOnly");
        return;
    }

    const dtsFiles = walkDir(DIST_TYPES);
    let totalFixes = 0;
    let filesModified = 0;

    for (const filePath of dtsFiles) {
        const content = fs.readFileSync(filePath, "utf-8");

        const newContent = content.replace(
            /((?:export\s+(?:\*\s+from|{[^}]*}\s+from)|import\s+(?:.*\s+from)?)\s+["'])([^"']+)\.d\.ts(["'])/g,
            (match, prefix, modulePath, suffix) => {
                return `${prefix}${modulePath}.js${suffix}`;
            }
        );

        if (newContent !== content) {
            const fixCount = (content.match(/\.d\.ts["']/g) || []).length;
            totalFixes += fixCount;
            filesModified++;
            fs.writeFileSync(filePath, newContent, "utf-8");
        }
    }

    console.log(`[fix-dts-paths] 处理了 ${dtsFiles.length} 个 .d.ts 文件，修改了 ${filesModified} 个，修复了 ${totalFixes} 处路径`);
}

fixDtsPaths();