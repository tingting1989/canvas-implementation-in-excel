/**
 * 数据验证功能演示
 *
 * 本示例展示如何使用 DataValidationPlugin 实现常见的数据验证场景。
 *
 * 运行方式：
 * 1. 在浏览器控制台中执行（需要先加载 Workbook）
 * 2. 或作为 Node.js 脚本运行：node examples/data-validation-demo.js
 */

// ═══════════════════════════════════════════════════════════════
// 示例 1: 基础初始化和规则配置
// ═══════════════════════════════════════════════════════════════

async function example1_BasicSetup() {
    console.log('=== 示例 1: 基础初始化 ===\n');

    // 创建工作簿并启用数据验证插件
    const workbook = new Workbook('grid', {
        plugins: ['dataValidation'],
        pluginOptions: {
            dataValidation: {
                rules: [
                    {
                        range: 'A1:A100',
                        type: 'number',
                        operator: 'between',
                        value: [0, 100],
                        errorMessage: '请输入 0-100 之间的数值'
                    },
                    {
                        range: 'B1:B50',
                        type: 'list',
                        source: ['选项A', '选项B', '选项C'],
                        inputMessage: '请从下拉列表中选择'
                    }
                ]
            }
        }
    });

    const dv = workbook.getPlugin('dataValidation');
    console.log('✅ 插件已初始化');
    console.log(`   已加载 ${dv.getAllRules().length} 条验证规则\n`);

    return { workbook, dv };
}

// ═══════════════════════════════════════════════════════════════
// 示例 2: 运行时动态添加/删除规则
// ═══════════════════════════════════════════════════════════════

async function example2_DynamicRules({ dv }) {
    console.log('=== 示例 2: 动态规则管理 ===\n');

    // 添加新规则
    const ruleId = dv.setValidation({
        range: 'C1:C200',
        type: 'text',
        operator: 'lengthBetween',
        value: [5, 20],
        allowBlank: false,
        errorMessage: '内容长度必须在 5-20 个字符之间'
    });

    console.log('✅ 已添加文本长度规则:', ruleId);

    // 查询规则
    const rulesForCell = dv.getRulesForCell(0, 2); // C1 单元格
    console.log(`   C1 单元格有 ${rulesForCell.length} 条规则`);

    // 移除规则
    const removed = dv.removeValidation(ruleId);
    console.log(`   规则移除结果: ${removed}\n`);
}

// ═══════════════════════════════════════════════════════════════
// 示例 3: 单元格验证
// ═══════════════════════════════════════════════════════════════

async function example3_CellValidation({ dv }) {
    console.log('=== 示例 3: 单元格验证 ===\n');

    // 先添加一个数值范围规则
    dv.setValidation({
        range: 'D1:D10',
        type: 'number',
        operator: 'greaterThan',
        value: 0,
        errorStyle: 'stop'
    });

    // 验证有效值
    const validResult = await dv.validateCell(0, 3, 42);
    console.log('✅ 验证通过 (value=42):', validResult.valid);

    // 验证无效值
    const invalidResult = await dv.validateCell(0, 3, -5);
    console.log('❌ 验证失败 (value=-5):', invalidResult.valid);
    console.log('   错误消息:', invalidResult.message);
    console.log('   错误样式:', invalidResult.errorStyle);
}

// ═══════════════════════════════════════════════════════════════
// 示例 4: 批量验证与报告
// ═══════════════════════════════════════════════════════════════

async function example4_BatchValidation({ dv }) {
    console.log('\n=== 示例 4: 批量验证 ===\n');

    // 对整个区域进行批量验证
    const report = await dv.validateRange('A1:A10');

    console.log('📊 批量验证报告:');
    console.log(`   总计: ${report.total} 个单元格`);
    console.log(`   通过: ${report.valid} 个`);
    console.log(`   失败: ${report.invalid} 个`);

    if (report.invalid > 0) {
        console.log('\n   失败的单元格:');
        report.results
            .filter(r => !r.valid)
            .forEach(r => {
                console.log(`   - (${r.row}, ${r.col}): ${r.message}`);
            });
    }
}

// ═══════════════════════════════════════════════════════════════
// 示例 5: 唯一性校验
// ═══════════════════════════════════════════════════════════════

async function example5_UniqueValidation({ dv }) {
    console.log('\n=== 示例 5: 唯一性校验 ===\n');

    // 添加唯一性规则（如订单号、学号等）
    dv.setValidation({
        range: 'E1:E1000',
        type: 'unique',
        errorMessage: '该值已存在，不能重复！',
        errorStyle: 'warning' // 使用 warning 而非 stop，允许用户确认后继续
    });

    // 验证唯一值
    const uniqueResult1 = await dv.validateCell(0, 4, 'ORD-001');
    console.log('✅ 第一次输入 ORD-001:', uniqueResult1.valid); // 应该为 true

    const uniqueResult2 = await dv.validateCell(1, 4, 'ORD-001'); // 假设第2行已有此值
    console.log('❌ 重复输入 ORD-001:', uniqueResult2.valid); // 应该为 false
    if (!uniqueResult2.valid) {
        console.log('   错误信息:', uniqueResult2.message);
        console.log('   重复次数:', uniqueResult2.metadata?.duplicateCount);
    }
}

// ═══════════════════════════════════════════════════════════════
// 示例 6: 规则导入导出
// ═══════════════════════════════════════════════════════════════

async function example6_ImportExport({ dv }) {
    console.log('\n=== 示例 6: 规则导入导出 ===\n');

    // 导出当前所有规则
    const exportedRules = dv.exportRules();
    console.log(`📤 导出 ${exportedRules.length} 条规则:`);
    exportedRules.forEach((rule, idx) => {
        console.log(`   ${idx + 1}. [${rule.type}] ${rule.range}`);
    });

    // 模拟保存到 localStorage / 发送到服务器
    const jsonStr = JSON.stringify(exportedRules, null, 2);
    console.log('\n   JSON 大小:', (jsonStr.length / 1024).toFixed(2), 'KB');

    // 从 JSON 恢复规则（模拟）
    console.log('\n📥 从 JSON 恢复规则...');
    const importedIds = dv.importRules(exportedRules);
    console.log(`✅ 成功导入 ${importedIds.length} 条规则\n`);
}

// ═══════════════════════════════════════════════════════════════
// 主函数：运行所有示例
// ═══════════════════════════════════════════════════════════════

async function main() {
    console.log('🎉 数据验证功能演示程序');
    console.log('═'.repeat(50) + '\n');

    try {
        // 示例 1: 初始化
        const context = await example1_BasicSetup();

        // 示例 2-6: 其他功能演示
        await example2_DynamicRules(context);
        await example3_CellValidation(context);
        await example4_BatchValidation(context);
        await example5_UniqueValidation(context);
        await example6_ImportExport(context);

        // 清理资源
        context.dv.destroy();
        context.workbook?.destroy?.();

        console.log('═'.repeat(50));
        console.log('✅ 所有示例运行完成！\n');

    } catch (error) {
        console.error('❌ 运行出错:', error);
    }
}

// 如果在 Node.js 环境中运行
if (typeof window === 'undefined') {
    main();
}

// 如果在浏览器中运行，可以手动调用 main()
// 或者将此文件作为模块导入：
// import { main } from './examples/data-validation-demo.js';
// main();