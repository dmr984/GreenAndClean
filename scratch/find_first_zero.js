const fs = require('fs');
const content = fs.readFileSync('c:/Users/Utente/Desktop/app/GreenAndClean/src/app/dashboard/operators/[operatorId]/shifts/page.tsx', 'utf8');

let braces = 0;
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '{') braces++;
        if (char === '}') braces--;
    }
    
    if (i + 1 > 139 && braces === 0) {
        console.log(`FIRST CLOSED AT line ${i + 1}: ${line.trim()}`);
        break;
    }
}
