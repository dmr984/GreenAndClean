const fs = require('fs');
const content = fs.readFileSync('c:/Users/Utente/Desktop/app/GreenAndClean/src/app/dashboard/operators/[operatorId]/shifts/page.tsx', 'utf8');

let braces = 0;
const lines = content.split('\n');
let insideComponent = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevBraces = braces;
    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '{') braces++;
        if (char === '}') braces--;
    }
    
    // Only print around the area where it seems to drop
    if (i + 1 > 1900 && i + 1 < 2100) {
         console.log(`${i + 1}: [${prevBraces} -> ${braces}] ${line.trim()}`);
    }
}
