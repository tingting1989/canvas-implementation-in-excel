// 调试通配符转正则
function _matchWildcardDebug(text, pattern) {
    console.log(`Input: text="${text}", pattern="${pattern}"`);
    
    const step1 = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    console.log(`Step 1 (escape special chars): "${step1}"`);
    
    const step2 = step1.replace(/\*/g, '.*');
    console.log(`Step 2 (* -> .*): "${step2}"`);
    
    const step3 = step2.replace(/\?/g, '.');
    console.log(`Step 3 (? -> .): "${step3}"`);
    
    const regexPattern = `^${step3}$`;
    console.log(`Final regex: /${regexPattern}/i`);
    
    const regex = new RegExp(regexPattern, 'i');
    const result = regex.test(text);
    console.log(`Result: ${result}\n`);
    
    return result;
}

console.log('=== Testing *果* ===\n');
_matchWildcardDebug('苹果', '*果*');
_matchWildcardDebug('橙子', '*果*');

console.log('=== Testing 苹* ===\n');
_matchWildcardDebug('苹果', '苹*');