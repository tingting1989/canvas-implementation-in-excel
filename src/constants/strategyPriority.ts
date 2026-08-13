/**
 * 策略优先级常量定义
 *
 * 设计理念（V3.0 终极版）：
 * - 采用 100 为基准的大间隔线性递增：100 → 200 → 300 → ... → 1100
 * - 百位数直接表示层级编号（1xx=基础层, 2xx=标准层, 3xx=高级层...）
 * - 每个主锚点之间预留 99 个位置，提供极致的扩展能力
 */

export interface StrategyPriority {
    // Layer 1: 基础操作层 (100 - 199)
    /** 基础键盘输入（最低优先级，所有策略的基石） */
    readonly KEYBOARD_BASE: 100;
    /** 快捷键操作（Ctrl+C/V/X/A/Z 等全局快捷键） */
    readonly SHORTCUT_KEY: 200;

    // Layer 2: 标准交互层 (300 - 599)
    /** 默认鼠标行为（选区、点击编辑、滚动等核心交互） */
    readonly MOUSE_DEFAULT: 300;
    /** 单元格类型交互（星级评分、进度条、下拉框等自定义组件） */
    readonly CELL_TYPE_INTERACTION: 400;
    /** 弹出式 UI 组件（筛选器、下拉菜单、右键菜单触发器等） */
    readonly POPUP_UI: 500;

    // Layer 3: 高级功能层 (600 - 899)
    /** 行列拖拽移动 */
    readonly ROW_COLUMN_MOVE: 600;
    /** 自动填充（填充柄拖拽） */
    readonly AUTO_FILL: 700;
    /** 图表选择/移动/缩放 */
    readonly CHART_INTERACTION: 800;
    /** 行列大小调整（Resize） */
    readonly RESIZE_LAYOUT: 900;

    // Layer 4: 关键操作层 (1000+)
    /** 数据验证（数据完整性守卫，可阻止数据写入） */
    readonly DATA_VALIDATION: 950;
    /** 数据排序（改变数据顺序） */
    readonly DATA_SORT: 1000;
    /** 数据筛选（Filter，影响数据显示范围） */
    readonly DATA_FILTER: 1100;
}

export const STRATEGY_PRIORITY: StrategyPriority = Object.freeze({
    KEYBOARD_BASE: 100,
    SHORTCUT_KEY: 200,
    MOUSE_DEFAULT: 300,
    CELL_TYPE_INTERACTION: 400,
    POPUP_UI: 500,
    ROW_COLUMN_MOVE: 600,
    AUTO_FILL: 700,
    CHART_INTERACTION: 800,
    RESIZE_LAYOUT: 900,
    DATA_VALIDATION: 950,
    DATA_SORT: 1000,
    DATA_FILTER: 1100,
});

export type PositionHint = "early" | "middle" | "late";

export interface LayerInfo {
    layer: number;
    name: string;
    range: string;
    description: string;
}

export interface ValidationResult {
    valid: boolean;
    message: string;
}

export const PriorityUtils = {
    /**
     * 在两个主锚点之间生成新的优先级值
     */
    between(lowerPriority: number, higherPriority: number, position: PositionHint = "middle"): number {
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
     */
    validate(priority: number): ValidationResult {
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
     */
    getLayerInfo(priority: number): LayerInfo {
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
