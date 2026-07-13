/**
 * Worker 初始化脚本
 *
 * 放置位置：在应用启动的最早期执行（如 main.js 顶部、index.html 中）
 *
 * 功能：
 * - 创建全局 WorkerManager 实例
 * - 预注册所有需要的 Worker 类型
 * - 预热关键 Worker
 * - 设置性能监控
 */

// ============================================
// 方式 A：在 ES Module 入口文件中（推荐）
// ============================================

// src/main.js 或 src/index.js 的最顶部
import { globalWorkerManager } from "./WorkerManager.js";

// 1️⃣ 配置全局 WorkerManager（可选，使用默认配置也可）
// globalWorkerManager 已经在 WorkerManager.js 中创建为单例

console.log("🚀 Initializing Workers...");

// 2️⃣ 预注册所有 Worker 类型（DataExtractor 会自动注册 chartData，但也可以提前注册）
if (!globalWorkerManager.hasWorker("chartData")) {
    globalWorkerManager.register("chartData", {
        worker: () => new Worker(new URL("./workers/ChartDataExtractor.worker.js", import.meta.url), { type: "module" }),
        maxInstances: Math.min(4, (navigator.hardwareConcurrency || 4) - 1),
        priority: "high",
        timeout: 8000,
        retryCount: 2,
        lazyInit: true,
    });

}

// 3️⃣ 可选：预热关键 Worker（用户首次操作前就准备好）
// 注意：这会增加初始加载时间约 100-200ms，但后续操作会更快
globalWorkerManager
    .warmup("chartData", 1)
    .then(() => {
        console.log("✅ chartData worker warmed up and ready");
    })
    .catch((err) => {
        console.warn("⚠️ Warmup failed (non-critical):", err.message);
    });

// 4️⃣ 设置全局监控（可选）
const unsubscribeStats = globalWorkerManager.onStateChange((event, stats) => {
    if (event === "statsUpdated" && stats.totalTasks > 0) {
        // 每 100 个任务输出一次统计
        if (stats.totalTasks % 100 === 0) {
            console.log(
                `📊 [Worker Stats] Tasks: ${stats.totalTasks}, Success: ${stats.completedTasks}, Failed: ${stats.failedTasks}, Avg: ${stats.avgExecutionTime.toFixed(1)}ms`,
            );
        }

        // 失败率过高时告警
        if (stats.totalTasks > 20 && stats.failedTasks / stats.totalTasks > 0.15) {
            console.error("⚠️ High worker failure rate:", stats);
        }
    }
});

// 5️⃣ 应用关闭时清理（可选）
window.addEventListener("beforeunload", async () => {
    console.log("🧹 Cleaning up workers...");

    unsubscribeStats(); // 取消监控

    // 不需要手动 destroy，浏览器关闭时会自动清理
    // 但如果需要在 SPA 路由切换时清理：
    // await globalWorkerManager.destroyPool('chartData');
});

// ============================================
// 方式 B：在 HTML 文件中通过 script 标签引入（UMD/IIFE 场景）
// ============================================
/*
<script type="module">
    import { globalWorkerManager } from './WorkerManager.js';
    
    // 注册 workers...
    window.workerManager = globalWorkerManager;  // 挂载到全局对象供其他模块使用
</script>
*/

// ============================================
// 方式 C：在现有代码中的最小化集成
// ============================================

/*
// 只需确保在使用 ChartPlugin 之前导入一次即可：

import './workers/WorkerManager.js';  // 这行就够了！

// DataExtractor 会自动检测并注册 chartData worker
// 无需其他额外代码
*/

export default globalWorkerManager; // 导出供其他模块使用
