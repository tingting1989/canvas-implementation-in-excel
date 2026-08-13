const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const typesDir = path.join(rootDir, "dist", "types");

function fixAliasesInFile(filePath) {
    let content = fs.readFileSync(filePath, "utf-8");
    const fileDir = path.dirname(filePath);
    let changed = false;

    const regex = /from\s+["']@\/([^"']+)["']/g;
    content = content.replace(regex, (match, importPath) => {
        changed = true;
        const targetPath = path.join(typesDir, importPath);
        let relativePath = path.relative(fileDir, targetPath).replace(/\\/g, "/");
        if (!relativePath.startsWith(".")) {
            relativePath = "./" + relativePath;
        }
        return `from "${relativePath}"`;
    });

    if (changed) {
        fs.writeFileSync(filePath, content, "utf-8");
        console.log(`Fixed: ${path.relative(rootDir, filePath)}`);
    }
}

function walkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkDir(fullPath);
        } else if (entry.name.endsWith(".d.ts")) {
            fixAliasesInFile(fullPath);
        }
    }
}

if (fs.existsSync(typesDir)) {
    walkDir(typesDir);
    console.log("\nDone fixing .d.ts path aliases.");
} else {
    console.log("No dist/types directory found. Run 'tsc --emitDeclarationOnly' first.");
}