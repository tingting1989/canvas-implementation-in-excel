// 测试正则表达式
const regex = /^.*果.*$/i;

const testStrings = ['苹果', '橙子', '香蕉', '芒果'];

console.log('Regex: /^.*果.*$/i\n');

for (const str of testStrings) {
    const result = regex.test(str);
    const codes = [...str].map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
    console.log(`"${str}" [${codes}] -> ${result}`);
}

// 直接测试字符
console.log('\n=== Direct char test ===');
console.log('果 charCode:', '果'.charCodeAt(0));
console.log('橙 charCode:', '橙'.charCodeAt(0));
console.log('子 charCode:', '子'.charCodeAt(0));

const 橙子 = '橙子';
console.log('\n橙子 includes 果?', 橙子.includes('果'));
console.log('橙子 matches /果/?', /果/.test(橙子));

// 测试是否是编码问题
const pattern = '*果*';
console.log('\nPattern chars:', [...pattern].map(c => c.charCodeAt(0)));