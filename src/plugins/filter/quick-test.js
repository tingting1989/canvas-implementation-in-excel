// ════════════════════════════════════════════════════════
//  FilterPlugin 快速测试脚本
//  在浏览器控制台中运行此代码
// ════════════════════════════════════════════════════════

(function() {
    console.log("🔍 开始 FilterPlugin 诊断...");
    console.log("".padEnd(60, "═"));

    // 1. 检查全局变量
    if (typeof wb === "undefined") {
        console.error("❌ 错误: wb (Workbook) 未定义！");
        console.log("   请确保在正确的页面运行此脚本");
        return;
    }

    console.log("✅ Workbook 实例存在:", wb);

    // 2. 获取 FilterPlugin
    const filterPlugin = wb.getPlugin?.("filter") || wb.plugins?.get?.("filter");

    if (!filterPlugin) {
        console.error("❌ 错误: FilterPlugin 未注册！");
        console.log("");
        console.log("📋 解决方案:");
        console.log("   1. 检查 main.js 中的 plugins 数组是否包含 'filter'");
        console.log("   2. 确保插件文件路径正确");
        console.log("   3. 重启开发服务器");
        return;
    }

    console.log("✅ FilterPlugin 已加载:", filterPlugin);
    console.log("");

    // 3. 检查启用状态
    const isEnabled = filterPlugin.enabled;
    console.log(`📊 插件状态: ${isEnabled ? "✅ 已启用" : "❌ 已禁用"}`);

    if (!isEnabled) {
        console.log("");
        console.log("⚠️  正在尝试启用...");
        filterPlugin.enable();
        console.log(`   启用后状态: ${filterPlugin.enabled ? "✅ 成功" : "❌ 失败"}`);
    }

    console.log("");

    // 4. 检查 UI Manager
    const uiManager = filterPlugin.getFilterUIManager?.();
    console.log(`UI Manager: ${uiManager ? "✅ 存在" : "❌ 未创建"}`);

    if (uiManager) {
        console.log("   - 引擎:", uiManager.filterEngine ? "✅" : "❌");
        console.log("   - 下拉面板:", uiManager.dropdown ? "✅" : "⚪ 未打开");
    }

    console.log("");

    // 5. 检查策略注册
    try {
        const strategies = wb.eventHandler?._strategies || new Map();
        const hasFilterStrategy = strategies.has("filterClick");

        console.log(`事件策略: ${hasFilterStrategy ? "✅ 已注册" : "❌ 未注册"}`);

        if (hasFilterStrategy) {
            const strategy = strategies.get("filterClick");
            console.log("   - 类型:", strategy.constructor.name);
            console.log("   - 优先级:", strategy.priority);
            console.log("   - 启用:", strategy.enabled);

            // 检查事件处理器
            const handlers = strategy.getEventHandlers?.();
            if (handlers) {
                console.log("   - 事件处理器数量:", Object.keys(handlers).length);
                Object.keys(handlers).forEach((key) => {
                    console.log(`     • ${key}`);
                });
            }
        }
    } catch (e) {
        console.log("⚠️  无法访问策略信息:", e.message);
    }

    console.log("");

    // 6. 检查渲染器
    const renderEngine = filterPlugin.renderEngine;
    const headerRenderer = renderEngine?.headerRenderer;

    console.log(`渲染引擎: ${renderEngine ? "✅ 存在" : "❌ 未找到"}`);
    console.log(`表头渲染器: ${headerRenderer ? "✅ 存在" : "❌ 未找到"}`);

    if (headerRenderer) {
        // 检查是否有自定义渲染器（我们的筛选图标）
        const renderers = headerRenderer._columnHeaderRenderers || [];
        console.log(`自定义列头渲染器: ${renderers.length} 个`);
        renderers.forEach((renderer, index) => {
            console.log(`   [${index}] ${renderer.name || "匿名函数"}`);
        });
    }

    console.log("");

    // 7. 测试手动打开下拉面板
    console.log("🧪 测试功能:");

    try {
        // 尝试打开 A 列的筛选面板
        console.log("   打开第 0 列筛选面板...");
        filterPlugin.openDropdown(0, {
            x: window.innerWidth / 2,
            y: 100,
        });

        setTimeout(() => {
            const isOpen = filterPlugin.isDropdownOpen?.();
            console.log(`   面板状态: ${isOpen ? "✅ 成功打开" : "❌ 打开失败"}`);

            if (!isOpen) {
                console.log("");
                console.log("⚠️  面板无法打开，可能的原因:");
                console.log("   1. UI Manager 未正确初始化");
                console.log("   2. FilterDropdown 组件未加载");
                console.log("   3. DOM 元素创建失败");
            } else {
                console.log("   ✅ 关闭测试面板...");
                filterPlugin.closeDropdown();
            }

            console.log("");
            console.log("".padEnd(60, "═"));
            console.log("🎉 诊断完成！请根据上方输出排查问题");
        }, 500);
    } catch (e) {
        console.error("   ❌ 测试失败:", e.message);
        console.error("   堆栈:", e.stack);
    }
})();
