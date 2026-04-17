const fs = require('fs');
const content = fs.readFileSync('c:/Users/Utente/Desktop/app/GreenAndClean/src/app/dashboard/operators/[operatorId]/shifts/page.tsx', 'utf8');

let braces = 0;
let brackets = 0;
let parens = 0;
let tags = [];

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '{') braces++;
    if (char === '}') braces--;
    if (char === '[') brackets++;
    if (char === ']') brackets--;
    if (char === '(') parens++;
    if (char === ')') parens--;
}

console.log(`Braces: ${braces}`);
console.log(`Brackets: ${brackets}`);
console.log(`Parens: ${parens}`);
