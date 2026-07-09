/**
 * 验证 v1.0.13 发布前的所有准备工作
 *
 * 运行方式：node verify-release-1.0.13.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🔍 验证 v1.0.13 发布准备...\n');

let allPassed = true;

// 1. 检查 package.json 版本号
console.log('1️⃣  检查 package.json 版本号');
try {
    const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
    if (pkg.version === '1.0.13') {
        console.log('   ✅ package.json 版本号正确: 1.0.13\n');
    } else {
        console.log(`   ❌ package.json 版本号错误: ${pkg.version} (期望: 1.0.13)\n`);
        allPassed = false;
    }
} catch (error) {
    console.log(`   ❌ 无法读取 package.json: ${error.message}\n`);
    allPassed = false;
}

// 2. 检查 CHANGELOG.md 是否包含 v1.0.13
console.log('2️⃣  检查 CHANGELOG.md 是否包含 v1.0.13 条目');
try {
    const changelog = readFileSync(join(__dirname, 'CHANGELOG.md'), 'utf8');
    if (changelog.includes('[1.0.13]') && changelog.includes('2026-07-09')) {
        console.log('   ✅ CHANGELOG.md 包含 v1.0.13 发布条目\n');
    } else {
        console.log('   ❌ CHANGELOG.md 缺少 v1.0.13 条目或日期错误\n');
        allPassed = false;
    }

    // 检查关键特性是否记录
    const keyFeatures = [
        '8-Layer Style Priority System',
        'Nested Headers Export',
        'Conditional Format Export',
        'toArgb',
        'CONFIG.GRID_COLOR',
        'errorHandler'
    ];

    console.log('   📋 检查关键特性记录:');
    for (const feature of keyFeatures) {
        if (changelog.includes(feature)) {
            console.log(`      ✅ ${feature}`);
        } else {
            console.log(`      ❌ 缺少: ${feature}`);
            allPassed = false;
        }
    }
    console.log('');
} catch (error) {
    console.log(`   ❌ 无法读取 CHANGELOG.md: ${error.message}\n`);
    allPassed = false;
}

// 3. 检查 ExportFilePlugin.js 关键代码
console.log('3️⃣  检查 ExportFilePlugin.js 关键实现');
try {
    const pluginCode = readFileSync(join(__dirname, 'src/plugins/ExportFilePlugin.js'), 'utf8');

    const checks = [
        { name: 'DEFAULT_BORDER_COLOR 使用 toArgb', test: () => pluginCode.includes('DEFAULT_BORDER_COLOR = toArgb(CONFIG.GRID_COLOR') },
        { name: 'createThinBorder 包含颜色', test: () => pluginCode.includes("color: { argb: DEFAULT_BORDER_COLOR }") },
        { name: '8层样式体系实现', test: () => pluginCode.includes('第 6 层：cells()') && pluginCode.includes('第 7 层：条件格式') },
        { name: 'errorHandler 集成', test: () => pluginCode.includes('import { errorHandler }') },
        { name: '无 console.warn/error', test: () => !pluginCode.includes('console.warn') && !pluginCode.includes('console.error') },
    ];

    for (const check of checks) {
        if (check.test()) {
            console.log(`   ✅ ${check.name}`);
        } else {
            console.log(`   ❌ ${check.name}`);
            allPassed = false;
        }
    }
    console.log('');
} catch (error) {
    console.log(`   ❌ 无法读取 ExportFilePlugin.js: ${error.message}\n`);
    allPassed = false;
}

// 4. 检查测试文件是否存在
console.log('4️⃣  检查测试文件完整性');
const requiredTestFile = 'tests/plugins/ExportFilePlugin.test.js';
const optionalTestFile = 'tests/plugins/ExportFilePlugin.complete.test.js';

try {
    readFileSync(join(__dirname, requiredTestFile), 'utf8');
    console.log(`   ✅ ${requiredTestFile} 存在 (必需)`);
} catch {
    console.log(`   ❌ ${requiredTestFile} 不存在 (必需)`);
    allPassed = false;
}

try {
    readFileSync(join(__dirname, optionalTestFile), 'utf8');
    console.log(`   ✅ ${optionalTestFile} 存在 (可选 - 完整功能测试)`);
} catch {
    console.log(`   ⚠️  ${optionalTestFile} 不存在 (可选 - 建议添加)`);
}
console.log('');

// 5. 检查文档文件
console.log('5️⃣  检查文档完整性');
const docFiles = [
    'CHANGELOG.md',
    'docs/CHANGELOG_GUIDE.md',
];

for (const docFile of docFiles) {
    try {
        readFileSync(join(__dirname, docFile), 'utf8');
        console.log(`   ✅ ${docFile} 存在`);
    } catch {
        console.log(`   ❌ ${docFile} 不存在`);
        allPassed = false;
    }
}
console.log('');

// 最终结果
console.log('═'.repeat(50));
if (allPassed) {
    console.log('🎉 所有检查通过！v1.0.13 可以安全发布。\n');
    console.log('下一步操作:');
    console.log('  1. npm run test          # 运行完整测试');
    console.log('  2. npm run build:lib       # 构建生产版本');
    console.log('  3. npm version patch       # 创建版本标签');
    console.log('  4. git push --tags         # 推送标签');
    console.log('  5. npm run publish:npm     # 发布到 NPM');
    process.exit(0);
} else {
    console.log('⚠️  存在问题，请修复后再发布。\n');
    process.exit(1);
}