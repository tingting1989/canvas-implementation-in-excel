// 测试 _matchWildcard 函数
function _matchWildcard(text, pattern) {
    const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(text);
}

console.log('Testing _matchWildcard:');
console.log('*果* vs 苹果:', _matchWildcard('苹果', '*果*'));
console.log('*果* vs 橙子:', _matchWildcard('橙子', '*果*'));
console.log('*果* vs 香蕉:', _matchWildcard('香蕉', '*果*'));

console.log('\n苹* vs 苹果:', _matchWildcard('苹果', '苹*'));
console.log('*子 vs 橙子:', _matchWildcard('橙子', '*子'));