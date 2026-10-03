const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 同名 function 声明在 JS 中不会报错，后一个会静默覆盖前一个，
// 让前面的版本变成看似可改、实际不执行的死代码。这里禁止顶层重名。
const files = ['dashboard.js', 'background.js'];
const declaration = /^(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)\s*\(/;

for (const file of files) {
  const lines = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').split('\n');
  const seen = new Map();
  const duplicates = [];
  lines.forEach((line, index) => {
    const match = line.match(declaration);
    if (!match) return;
    const name = match[1];
    if (seen.has(name)) duplicates.push(`${name}（第 ${seen.get(name)} 行与第 ${index + 1} 行）`);
    else seen.set(name, index + 1);
  });
  assert.deepStrictEqual(duplicates, [], `${file} 存在重复的顶层函数声明：\n${duplicates.join('\n')}`);
}

console.log('no duplicate top-level functions');
