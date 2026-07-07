/**
 * 错误提示样式枚举
 * @description 定义数据验证失败时的提示样式级别，用于控制用户输入错误时的反馈方式
 * @constant {Object}
 * @property {string} STOP - 停止样式（最严格），阻止无效输入并强制用户修改后才能继续
 * @property {string} WARNING - 警告样式（中等），提示用户输入可能有问题但允许继续操作
 * @property {string} INFO - 信息样式（最宽松），仅提供信息性提示，不限制用户输入
 */
export const ERROR_STYLE = Object.freeze({
    STOP: "stop",
    WARNING: "warning",
    INFO: "info",
});
