const fs = require('fs');

const raw = fs.readFileSync('C:\\Users\\Utente\\.gemini\\antigravity\\brain\\348af26c-5bec-47f1-abc8-9d766c3153e5\\.system_generated\\steps\\110\\output.txt', 'utf8');
const data = JSON.parse(raw);

const docs = data.documents;
console.log(`Total documents: ${docs.length}`);

const parsedDocs = docs.map(d => {
    return {
        id: d.name.split('/').pop(),
        type: d.fields.type.stringValue,
        timestamp: d.fields.timestamp.timestampValue,
        status: d.fields.status.stringValue,
        shiftId: d.fields.shiftId?.stringValue
    };
});

parsedDocs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

parsedDocs.forEach(d => {
    console.log(`${d.timestamp} | Type: ${d.type} | Status: ${d.status} | ShiftId: ${d.shiftId || 'none'} | Id: ${d.id}`);
});
