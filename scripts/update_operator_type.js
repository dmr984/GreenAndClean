const fs = require("fs");
const path = require("path");

const newAttrs = `    entryTolerance?: number;
    ordinaryHalfHourTrigger?: number;
    ordinaryHourTrigger?: number;
    scheduleType?: 'daily' | 'monthly';
    monthlyContractualHours?: number;`;

function processFile(filePath) {
    let content = fs.readFileSync(filePath, "utf-8");
    let originalContent = content;
    
    // There are several variations of Operator type across files depending if they have id/firstName/username or not.
    // They all have `workSchedule: WorkSchedule;` followed by `overtimeHalfHourTrigger`.
    // So we can do a regex replace.
    
    // We want to insert the properties right after `workSchedule: WorkSchedule;`
    // Regex: /(workSchedule:\s*WorkSchedule;)/
    if (content.includes("type Operator = {") && content.includes("workSchedule: WorkSchedule;")) {
        // First check if already injected
        if (!content.includes("entryTolerance?: number;")) {
            content = content.replace(/(workSchedule:\s*WorkSchedule;)/, "$1\n" + newAttrs);
        }
    }
    
    if (originalContent !== content) {
        fs.writeFileSync(filePath, content, "utf-8");
        console.log("Updated " + filePath);
    }
}

function walkDir(dir) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        if (fs.statSync(dirPath).isDirectory()) {
            walkDir(dirPath);
        } else if (dirPath.endsWith(".ts") || dirPath.endsWith(".tsx")) {
            processFile(dirPath);
        }
    });
}

walkDir("./src");
