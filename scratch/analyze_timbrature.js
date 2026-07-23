const fs = require('fs');

const raw = fs.readFileSync('C:\\Users\\Utente\\.gemini\\antigravity\\brain\\348af26c-5bec-47f1-abc8-9d766c3153e5\\.system_generated\\steps\\175\\output.txt', 'utf8');
const data = JSON.parse(raw);

const docs = data.documents;
console.log(`Loaded ${docs.length} documents.`);

// Filter for June 2026
const juneDocs = docs.filter(d => {
    const tsStr = d.fields.timestamp.timestampValue;
    return tsStr.startsWith('2026-06');
});

console.log(`June documents: ${juneDocs.length}`);

// Group by shiftId
const groups = {};
juneDocs.forEach(d => {
    const shiftId = d.fields.shiftId?.stringValue || 'no-shift-id';
    if (!groups[shiftId]) {
        groups[shiftId] = [];
    }
    groups[shiftId].push({
        id: d.name.split('/').pop(),
        type: d.fields.type.stringValue,
        timestamp: d.fields.timestamp.timestampValue,
        status: d.fields.status.stringValue,
        approvedOrdinaryHours: d.fields.approvedOrdinaryHours?.integerValue || d.fields.approvedOrdinaryHours?.doubleValue,
        approvedOvertimeHours: d.fields.approvedOvertimeHours?.integerValue || d.fields.approvedOvertimeHours?.doubleValue
    });
});

console.log('\n--- Grouped Shifts in June 2026 ---');
for (const [shiftId, events] of Object.entries(groups)) {
    console.log(`\nShiftId: ${shiftId}`);
    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    events.forEach(e => {
        console.log(`  ${e.type} at ${e.timestamp} | Status: ${e.status} | ApprovedOrd: ${e.approvedOrdinaryHours || 'none'} | Id: ${e.id}`);
    });
}
