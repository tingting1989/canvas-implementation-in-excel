/**
 * 通配符和特殊场景调试
 */

async function testWildcard() {
    const { FormulaEngine } = await import('../src/formula/FormulaEngine.js');

    class Cell { constructor(v) { this.value = v; } }
    class Store {
        constructor() { this.d = new Map(); }
        get(r, c) { return this.d.get(`${r},${c}`); }
        set(r, c, cell) { this.d.set(`${r},${c}`, cell); }
    }

    class Sheet { constructor() { this.name = 'S1'; this.cellStore = new Store(); } }
    class WB {
        constructor() { this.s = new Map([['S1', new Sheet()]]); this.formulaEngine = null; }
    }

    const wb = new WB();
    const s = wb.s.get('S1');
    const e = new FormulaEngine(wb);
    wb.formulaEngine = e;

    // 产品名称数据
    const products = ['苹果', '香蕉', '苹果', '橙子', '香蕉', '苹果', '橙子', '苹果', '香蕉', '橙子'];
    const sales = [1000, 2000, 1500, 3000, 1200, 1800, 1600, 3500, 1100, 1900];

    for (let i = 0; i < 10; i++) {
        s.cellStore.set(i, 0, new Cell(products[i]));
        s.cellStore.set(i, 1, new Cell(sales[i]));
    }

    console.log('Products:', products);
    console.log('Sales:', sales);

    // 测试通配符 *果*
    let r1 = e.setFormula(s, 20, 0, '=SUMIF(A1:A10,"*果*",B1:B10)');
    console.log('\n*果* (包含"果"):');
    console.log('  Result:', r1);
    console.log('  Expected: 苹果(1000+1500+1800+3500=7800) + 橙子(3000+1600+1900=6500) = 14300');

    // 测试通配符 苹*
    let r2 = e.setFormula(s, 21, 0, '=SUMIF(A1:A10,"苹*",B1:B10)');
    console.log('\n苹* (以"苹"开头):');
    console.log('  Result:', r2);
    console.log('  Expected: 苹果(1000+1500+1800+3500) = 7800');

    // 测试通配符 *子
    let r3 = e.setFormula(s, 22, 0, '=SUMIF(A1:A10,"*子",B1:B10)');
    console.log('\n*子 (以"子"结尾):');
    console.log('  Result:', r3);
    console.log('  Expected: 橙子(3000+1600+1900) = 6500');

    // 精确匹配 "苹果"
    let r4 = e.setFormula(s, 23, 0, '=SUMIF(A1:A10,"苹果",B1:B10)');
    console.log('\n"苹果" (精确匹配):');
    console.log('  Result:', r4);
    console.log('  Expected: 7800');
}

testWildcard().catch(console.error);