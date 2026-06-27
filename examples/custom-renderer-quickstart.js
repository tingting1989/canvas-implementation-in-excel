/**
 * 自定义渲染器快速入门示例
 *
 * 演示如何：
 * 1. 注册和使用内置渲染器
 * 2. 创建自定义渲染器
 * 3. 在冻结/分页模式下正确使用行列号
 * 4. 与图表引擎协作
 *
 * @module examples/custom-renderer-quickstart
 */

// ============================================================
// 示例1：使用内置渲染器
// ============================================================
console.log('=== 示例1：使用内置渲染器 ===\n');

import { registerRenderer, getRenderer } from '../src/types/index.js';
import {
    BooleanCheckboxType,
    ProgressBarType,
    StarRatingType,
    SparklineType,
    ColorPreviewType,
} from '../src/types/renderers/index.js';

// 注册所有内置渲染器
registerRenderer('checkbox', BooleanCheckboxType);
registerRenderer('progress', ProgressBarType);
registerRenderer('star', StarRatingType);
registerRenderer('sparkline', SparklineType);
registerRenderer('color', ColorPreviewType);

console.log('✅ 已注册5个内置渲染器');
console.log('   - checkbox (复选框)');
console.log('   - progress (进度条)');
console.log('   - star (星级评分)');
console.log('   - sparkline (迷你图)');
console.log('   - color (颜色预览)\n');

// ============================================================
// 示例2：创建自定义渲染器
// ============================================================
console.log('=== 示例2：创建自定义渲染器 ===\n');

import { BaseColumnType } from '../src/types/BaseColumnType.js';

class TrafficLightType extends BaseColumnType {
    get name() { return 'trafficLight'; }

    get editorType() { return 'select'; }

    getEditorOptions() {
        return {
            source: [
                { value: 'green', label: '🟢 正常' },
                { value: 'yellow', label: '🟡 警告' },
                { value: 'red', label: '🔴 危险' }
            ]
        };
    }

    format(value) {
        const map = { green: '正常', yellow: '警告', red: '危险' };
        return map[value] || String(value);
    }

    render(context) {
        const { ctx, x, y, width, height, value } = context;

        const size = Math.min(width, height) * 0.6;
        const cx = context.getCenterX();
        const cy = context.getCenterY();
        const radius = size / 2;

        const colors = {
            green: '#4caf50',
            yellow: '#ff9800',
            red: '#f44336'
        };

        ctx.fillStyle = colors[value] || '#ccc';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // 发光效果（选中状态）
        if (context.isSelected) {
            ctx.strokeStyle = colors[value] || '#999';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

// 注册自定义渲染器
registerRenderer('trafficLight', TrafficLightType);
console.log('✅ 已注册自定义渲染器: trafficLight (交通灯)\n');

// ============================================================
// 示例3：在冻结场景下正确使用行列号
// ============================================================
console.log('=== 示例3：冻结场景下的行列号使用 ===\n');

class FrozenAwareDataType extends BaseColumnType {
    get name() { return 'frozenData'; }

    render(context) {
        const { realRow, sheet, pageInfo } = context;

        console.log(`[单元格信息]`);
        console.log(`  - 页面行号: ${context.row}`);
        console.log(`  - 实际行号: ${realRow}`);
        console.log(`  - 是否在冻结区域: ${pageInfo?.isInFrozenArea ? '是' : '否'}`);

        // ✅ 正确：使用实际行号访问数据
        if (sheet?.cellStore) {
            const cellData = sheet.cellStore.get(realRow, context.realCol);
            console.log(`  - 单元格数据: ${cellData?.value ?? '(空)'}`);

            // ✅ 访问相邻单元格（也用实际行号）
            const neighborData = sheet.cellStore.get(realRow, context.realCol + 1);
            if (neighborData) {
                console.log(`  - 相邻列数据: ${neighborData.value}`);
            }
        }

        // 根据冻结状态调整样式
        if (pageInfo?.isInFrozenArea) {
            console.log(`  ⚠️  当前在冻结区域，应用特殊样式`);
            context.ctx.globalAlpha = 0.85;
        }
    }
}

console.log('✅ 已创建冻结感知渲染器: frozenData\n');
console.log('核心原则:');
console.log('  1. 使用 realRow 访问数据（不受冻结影响）');
console.log('  2. 使用 row 进行视觉定位（受冻结影响）');
console.log('  3. 检查 pageInfo.isInFrozenArea 判断位置\n');

// ============================================================
// 示例4：与图表引擎协作
// ============================================================
console.log('=== 示例4：与图表引擎协作 ===\n');

class ChartGeneratorType extends BaseColumnType {
    get name() { return 'chartGenerator'; }

    render(context) {
        const { realRow, realCol, sheet, value } = context;

        // 当值为特殊标记时，自动创建图表
        if (value === '[CHART]') {
            console.log(`[生成图表] 在 (${realRow}, ${realCol}) 创建图表`);

            // ✅ 使用实际行号定义数据范围（与图表引擎一致）
            const chartConfig = {
                type: 'bar',
                anchorRow: realRow,           // 实际行号 ⭐
                anchorCol: realCol + 5,       // 实际列号 ⭐
                dataRange: {
                    startRow: realRow,       // 实际行号 ⭐
                    endRow: realRow + 10,
                    startCol: realCol,
                    endCol: realCol + 3
                }
            };

            console.log('  图表配置:');
            console.log(`    - 锚定位置: (${chartConfig.anchorRow}, ${chartConfig.anchorCol})`);
            console.log(`    - 数据范围: 行 ${chartConfig.dataRange.startRow}-${chartConfig.dataRange.endRow}`);
            console.log(`                 列 ${chartConfig.dataRange.startCol}-${chartConfig.dataRange.endCol}\n`);

            // 这里会调用 sheet.chartManager.createChart(chartConfig)
            // if (sheet?.chartManager) {
            //     sheet.chartManager.createChart(chartConfig);
            // }
        }
    }
}

console.log('✅ 已创建图表生成器渲染器: chartGenerator\n');
console.log('关键点:');
console.log('  - 所有数据范围都使用 actual row/col（实际行号）');
console.log('  - 图表锚定位置使用实际行号');
console.log('  - 与图表引擎的行列号约定完全一致\n');

// ============================================================
// 示例5：高级用法 - 跨单元格依赖
// ============================================================
console.log('=== 示例5：跨单元格依赖渲染器 ===\n');

class ConditionalHighlightType extends BaseColumnType {
    get name() { return 'conditionalHighlight'; }

    render(context) {
        const { realRow, realCol, sheet } = context;

        // 读取当前值和相邻列的值进行条件判断
        const currentValue = context.value;
        const neighborValue = sheet?.cellStore?.get(realRow, realCol + 1)?.value;

        console.log(`[条件高亮]`);
        console.log(`  - 当前值: ${currentValue}`);
        console.log(`  - 右侧列值: ${neighborValue ?? '(无)'}`);

        // 基于多列数据的复杂条件判断
        let highlightColor = null;

        if (typeof currentValue === 'number' && typeof neighborValue === 'number') {
            const ratio = currentValue / (neighborValue || 1);

            if (ratio > 1.5) {
                highlightColor = '#4caf50';  // 绿色：超额完成
                console.log(`  ✓ 超额 ${(ratio - 1).toFixed(1)}%，显示绿色`);
            } else if (ratio < 0.8) {
                highlightColor = '#f44336';  // 红色：未达标
                console.log(`  ✗ 未达标 ${(1 - ratio).toFixed(1)}%，显示红色`);
            } else {
                highlightColor = '#ff9800';  // 橙色：接近目标
                console.log(`  ≈ 接近目标，显示橙色`);
            }
        }

        if (highlightColor) {
            context.ctx.fillStyle = highlightColor;
            context.ctx.fillRect(
                context.x + 2,
                context.y + 2,
                context.width - 4,
                context.height - 4
            );
        }
    }
}

console.log('✅ 已创建条件高亮渲染器: conditionalHighlight\n');
console.log('能力展示:');
console.log('  - 通过 Sheet 引用访问其他单元格数据');
console.log('  - 支持复杂的业务逻辑判断');
console.log('  - 动态样式调整\n');

// ============================================================
// 总结
// ============================================================
console.log('='.repeat(60));
console.log('📚 快速入门示例总结');
console.log('='.repeat(60));
console.log('');
console.log('✅ 你已经学会了:');
console.log('  1. 注册和使用5种内置渲染器');
console.log('  2. 创建自定义渲染器（TrafficLight）');
console.log('  3. 冻结场景下的双轨行列号体系');
console.log('  4. 与图表引擎的数据范围对齐');
console.log('  5. 高级跨单元格依赖渲染');
console.log('');
console.log('📖 下一步:');
console.log('  - 查看 tests/CustomRenderer.test.js 了解完整测试');
console.log('  - 阅读 designDocument/custom-renderer-api.md 设计文档');
console.log('  - 运行 npm test 执行测试套件');
console.log('');
console.log('💡 提示:');
console.log('  - 始终使用 realRow/realCol 进行数据访问');
console.log('  - 仅在需要UI定位时使用 row/col');
console.log('  - 利用 Sheet 引用实现高级功能');
console.log('');

export {
    TrafficLightType,
    FrozenAwareDataType,
    ChartGeneratorType,
    ConditionalHighlightType,
};