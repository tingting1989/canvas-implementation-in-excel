/**
 * 策略优先级常量定义
 *
 * 设计理念（V3.0 终极版）：
 * - 采用 100 为基准的大间隔线性递增：100 → 200 → 300 → ... → 1100
 * - 从 100 开始（避免 0 的特殊性，符合"正整数优先级"的直觉）
 * - 百位数直接表示层级编号（1xx=基础层, 2xx=标准层, 3xx=高级层...）
 * - 每个主锚点之间预留 99 个位置，提供极致的扩展能力
 *
 * 核心优势：
 * 1. 极致可读性：数值大小直观反映优先级高低
 * 2. 完美数学美感：纯线性递增，无任何不规则
 * 3. 超强扩展性：支持 100+ 个策略在同一层级内共存
 * 4. 零学习成本：新人看到数字立刻理解层级关系
 *
 * 扩展方式：
 * 在任意两个主锚点之间插入中间值即可
 * 例如在 MOUSE_DEFAULT(300) 和 CELL_TYPE_INTERACTION(400) 之间，
 * 可以使用 320, 340, 350, 360, 380 等
 *
 * 使用示例：
 * ```javascript
 * import { STRATEGY_PRIORITY } from '@/constants/strategyPriority.js';
 *
 * export class MyStrategy extends EventStrategy {
 *   priority = STRATEGY_PRIORITY.MOUSE_DEFAULT; // = 300
 * }
 *
 * // 未来新增策略时，在间隔中插入即可：
 * // 例如在 300 和 400 之间，可以使用 310-390 等
 * ```
 */

export const STRATEGY_PRIORITY = Object.freeze({
    // ════════════════════════════════════════════════
    // 📍 Layer 1: 基础操作层 (100 - 199)
    // 适用场景：键盘输入、基础快捷键、辅助功能
    // 特征：所有策略的基础依赖项，优先级最低
    // ════════════════════════════════════════════════

    /** 基础键盘输入（最低优先级，所有策略的基石） */
    KEYBOARD_BASE: 100,

    /** 快捷键操作（Ctrl+C/V/X/A/Z 等全局快捷键） */
    SHORTCUT_KEY: 200,

    // ════════════════════════════════════════════════
    // 📍 Layer 2: 标准交互层 (300 - 599)
    // 适用场景：默认鼠标行为、UI 组件、单元格类型交互
    // 特征：用户日常交互的核心功能层
    // ════════════════════════════════════════════════

    /** 默认鼠标行为（选区、点击编辑、滚动等核心交互） */
    MOUSE_DEFAULT: 300,

    /** 单元格类型交互（星级评分、进度条、下拉框等自定义组件） */
    CELL_TYPE_INTERACTION: 400,

    /** 弹出式 UI 组件（筛选器、下拉菜单、右键菜单触发器等） */
    POPUP_UI: 500,

    // ════════════════════════════════════════════════
    // 📍 Layer 3: 高级功能层 (600 - 899)
    // 适用场景：拖拽操作、智能功能、特殊对象交互
    // 特征：需要精确区域检测或复杂状态管理的功能
    // ════════════════════════════════════════════════

    /** 行列拖拽移动 */
    ROW_COLUMN_MOVE: 600,

    /** 自动填充（填充柄拖拽） */
    AUTO_FILL: 700,

    /** 图表选择/移动/缩放 */
    CHART_INTERACTION: 800,

    /** 行列大小调整（Resize） */
    RESIZE_LAYOUT: 900,

    // ════════════════════════════════════════════════
    // 📍 Layer 4: 关键操作层 (1000+)
    // 适用场景：数据结构变更、全局性影响操作
    // 特征：影响范围大或不可逆的操作
    // ════════════════════════════════════════════════

    /** 数据验证（数据完整性守卫，可阻止数据写入） */
    DATA_VALIDATION: 950,

    /** 数据排序（改变数据顺序） */
    DATA_SORT: 1000,

    /** 数据筛选（Filter，影响数据显示范围） */
    DATA_FILTER: 1100,
});

/**
 * 优先级工具函数集
 *
 * 提供优先级的查询、验证和动态生成能力
 */
export const PriorityUtils = {
    /**
     * 在两个主锚点之间生成新的优先级值
     *
     * @param {number} lowerPriority - 较低的优先级基准
     * @param {number} higherPriority - 较高的优先级基准
     * @param {'early'|'middle'|'late'} [position='middle'] - 相对位置
     * @returns {number} 计算出的优先级值
     */
    between(lowerPriority, higherPriority, position = "middle") {
        const range = higherPriority - lowerPriority;

        switch (position) {
            case "early":
                return lowerPriority + Math.floor(range * 0.25);
            case "middle":
                return lowerPriority + Math.floor(range * 0.5);
            case "late":
                return lowerPriority + Math.floor(range * 0.75);
            default:
                return lowerPriority + Math.floor(range * 0.5);
        }
    },

    /**
     * 验证优先级值是否合法
     *
     * @param {number} priority - 待验证的优先级值
     * @returns {{ valid: boolean, message: string }} 验证结果
     */
    validate(priority) {
        if (!Number.isInteger(priority)) {
            return { valid: false, message: `优先级必须是整数，当前值: ${priority}` };
        }

        if (priority < 100 || priority > 2000) {
            return { valid: false, message: `优先级必须在 100-2000 范围内，当前值: ${priority}` };
        }

        return { valid: true, message: "优先级值合法" };
    },

    /**
     * 获取优先级所属的层级信息
     *
     * @param {number} priority - 优先级值
     * @returns {{ layer: number, name: string, range: string, description: string }} 层级信息
     */
    getLayerInfo(priority) {
        if (priority < 300) {
            return {
                layer: 1,
                name: "BASE",
                range: "100-299",
                description: "基础操作层（键盘输入、快捷键）",
            };
        } else if (priority < 600) {
            return {
                layer: 2,
                name: "STANDARD",
                range: "300-599",
                description: "标准交互层（鼠标行为、UI 组件）",
            };
        } else if (priority < 1000) {
            return {
                layer: 3,
                name: "ADVANCED",
                range: "600-999",
                description: "高级功能层（拖拽、智能功能）",
            };
        } else {
            return {
                layer: 4,
                name: "CRITICAL",
                range: "1000+",
                description: "关键操作层（数据排序、结构调整）",
            };
        }
    },
};
