/**
 * SUMIF 调试测试
 */

async function debugTest() {
    const { FormulaEngine } = await import('../src/formula/FormulaEngine.js');

    class Cell {
        constructor(value) { this.value = value; }
    }

    // 模拟 ChunkedCellStore 的结构
    class SimpleCellStore {
        constructor() { this.data = new Map(); }

        get(row, col) {
            return this.data.get(`${row},${col}`);
        }

        set(row, col, cell) {
            this.data.set(`${row},${col}`, cell);
        }
    }

    class Sheet {
        constructor() {
            this.name = 'Sheet1';
            this.cellStore = new SimpleCellStore();
        }
    }

    class Workbook {
        constructor() {
            this.sheets = new Map([['Sheet1', new Sheet()]]);
            this.formulaEngine = null;
        }
    }

    const wb = new Workbook();
    const sheet = wb.sheets.get('Sheet1');
    const engine = new FormulaEngine(wb);
    wb.formulaEngine = engine;

    // 简单数据
    sheet.cellStore.set(0, 0, new Cell(10));   // A1
    sheet.cellStore.set(1, 0, new Cell(150));  // A2
    sheet.cellStore.set(2, 0, new Cell(50));   // A3

    console.log('Test Data:');
    console.log('A1 =', sheet.cellStore.get(0, 0)?.value);
    console.log('A2 =', sheet.cellStore.get(1, 0)?.value);
    console.log('A3 =', sheet.cellStore.get(2, 0)?.value);

    // 测试基本 SUM
    console.log('\n=== Basic Tests ===');
    let r1 = engine.setFormula(sheet, 10, 0, '=SUM(A1:A3)');
    console.log('SUM(A1:A3) =', r1, '(expected: 210)', r1 === 210 ? '✅' : '❌');

    // 测试 SUMIF >100
    console.log('\n=== SUMIF Tests ===');
    let r2 = engine.setFormula(sheet, 11, 0, '=SUMIF(A1:A3,">100")');
    console.log('SUMIF(A1:A3,">100") =', r2, '(expected: 150)', r2 === 150 ? '✅' : '❌');

    // 测试 SUMIF <100
    let r3 = engine.setFormula(sheet, 12, 0, '=SUMIF(A1:A3,"<60")');
    console.log('SUMIF(A1:A3,"<60") =', r3, '(expected: 60)', r3 === 60 ? '✅' : '❌');

    // 测试 SUMIF 精确匹配
    let r4 = engine.setFormula(sheet, 13, 0, '=SUMIF(A1:A3,150)');
    console.log('SUMIF(A1:A3,150) =', r4, '(expected: 150)', r4 === 150 ? '✅' : '❌');

    console.log('\n=== Summary ===');
    if (r1 === 210 && r2 === 150 && r3 === 60 && r4 === 150) {
        console.log('✨ All tests passed!');
    } else {
        console.log('❌ Some tests failed');
    }
}

debugTest().catch(console.error);