import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { MonthlySummary } from './calculations';

export type Operator = {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    workSchedule: any;
    overtimeHalfHourTrigger?: number;
    overtimeHourTrigger?: number;
    salaryType?: 'hourly' | 'fixed';
    hourlyRate?: number;
    overtimeRate?: number;
    fixedSalary?: number;
    sickLeaveRate?: number;
    scheduleType?: 'daily' | 'monthly';
};

export type ManualTotals = {
    ferieDays?: number;
    permessoHours?: number;
    malattiaDays?: number;
    totalDueOverride?: number;
};

export type VisibilitySettings = {
    workedDays: boolean;
    showWorkedHours: boolean;
    ordinaryHours: boolean;
    overtimeHours: boolean;
    ferieDays: boolean;
    permessoHours: boolean;
    malattiaDays: boolean;
    absenceDays: boolean;
    ordinaryCost: boolean;
    overtimeCost: boolean;
    ferieCost: boolean;
    permessoCost: boolean;
    malattiaCost: boolean;
    compactMode: boolean;
};

export const calculateTotalDue = (
    op: Operator,
    summary: MonthlySummary | undefined,
    visibilitySettings: Partial<VisibilitySettings> | undefined,
    overrides?: ManualTotals
) => {
    if (overrides?.totalDueOverride !== undefined) {
        return overrides.totalDueOverride;
    }
    
    if (!summary) return 0;
    
    const finalVisibility = visibilitySettings || {};

    const ordinaryCost = (op.salaryType === 'fixed' 
        ? (op.fixedSalary || 0) 
        : (summary.ordinaryHours || 0) * (op.hourlyRate || 0));
    
    const overtimeCost = (summary.overtimeHours || 0) * (op.overtimeRate || 0);
    const ferieCost = summary.ferieCost || 0;
    const permessoCost = summary.permessoCost || 0;
    const malattiaCost = summary.malattiaCost || 0;

    let total = 0;
    if (finalVisibility.ordinaryCost !== false) total += ordinaryCost;
    if (finalVisibility.overtimeCost !== false) total += overtimeCost;
    if (finalVisibility.ferieCost !== false) total += ferieCost;
    if (finalVisibility.permessoCost !== false) total += permessoCost;
    if (finalVisibility.malattiaCost !== false) total += malattiaCost;
    
    return total;
};

export const generateDetailedOperatorPdf = async (
    currentMonth: Date,
    op: Operator,
    summary: MonthlySummary,
    details: any[], // DailyDetail[]
    visibility: Partial<VisibilitySettings>,
    overrides: ManualTotals = {}
): Promise<{ blob: Blob; fileName: string } | null> => {
    try {
        const { default: jsPDF } = await import('jspdf');
        const autoTableModule = await import('jspdf-autotable');
        const autoTable = autoTableModule.default ? autoTableModule.default : autoTableModule;

        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 15;
        let y = 20;

        const totalDue = calculateTotalDue(op, summary, visibility, overrides);
        
        // 1. Header with Logo
        try {
            const logoUrl = "https://i.postimg.cc/GhwM2hg1/1764199658760.png";
            // In a real environment, we'd fetch this or use a base64 version.
            // For now, let's keep the logic from PrintClient.tsx
            const img = new Image();
            img.src = logoUrl;
            img.crossOrigin = "Anonymous";
            await new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve; // Continue even if logo fails
            });
            if (img.complete && img.naturalWidth > 0) {
                doc.addImage(img, 'PNG', margin, y - 5, 20, 20);
            }
        } catch (e) {
            console.error("Could not load logo for PDF", e);
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`${op.firstName} ${op.lastName}`, pageWidth - margin, y, { align: 'right' });
        y += 7;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text(`Riepilogo di ${format(currentMonth, 'MMMM yyyy', { locale: it })}`, pageWidth - margin, y, { align: 'right' });
        y += 15;

        // 2. Statistics Summary
        const finalFerieDays = overrides.ferieDays ?? summary.ferieDays ?? 0;
        const finalPermessoHours = overrides.permessoHours ?? summary.permessoHours ?? 0;
        const finalMalattiaDays = overrides.malattiaDays ?? summary.malattiaDays ?? 0;

        const isMonthly = op.scheduleType === 'monthly';
        const showPermessi = !(isMonthly && finalPermessoHours === 0);

        const summaryBody = [
            [`GIORNI LAVORATI: ${summary.workedDays}`, { content: `FERIE: ${finalFerieDays}`, styles: { halign: 'right' }} ],
            [`ORE ORDINARIE: ${summary.ordinaryHours}`, { content: showPermessi ? `ORE PERMESSI: ${finalPermessoHours}` : '', styles: { halign: 'right' }}],
            [`ORE STRAORDINARIE: ${summary.overtimeHours}`, { content: `GIORNI MALATTIA: ${finalMalattiaDays}`, styles: { halign: 'right' }}],
        ];

        autoTable(doc, {
            startY: y,
            theme: 'plain',
            body: summaryBody,
            styles: { fontSize: 10, textColor: [0, 0, 0], cellPadding: 1 },
        });
        y = (doc as any).lastAutoTable.finalY + 5;

        // 3. Costs
        const ordinaryCost = (op.salaryType === 'fixed' 
            ? (op.fixedSalary || 0) 
            : (summary.ordinaryHours || 0) * (op.hourlyRate || 0));
        const overtimeCost = (summary.overtimeHours || 0) * (op.overtimeRate || 0);

        doc.setDrawColor(200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 5;

        const costBody = [
            [`${op.salaryType === 'fixed' ? 'FISSO MENSILE' : 'COSTO ORDINARIE'}: ${ordinaryCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`, { content: `COSTO STRAORDINARI: ${overtimeCost.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`, styles: { halign: 'right' }}]
        ];
        
        if (summary.ferieCost || summary.permessoCost || summary.malattiaCost) {
            costBody.push([
                `COSTO FERIE/PERM/MAL: ${((summary.ferieCost || 0) + (summary.permessoCost || 0) + (summary.malattiaCost || 0)).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`,
                { content: '', styles: { halign: 'right' } }
            ]);
        }

        autoTable(doc, {
            startY: y,
            theme: 'plain',
            body: costBody,
            styles: { fontSize: 10, textColor: [0, 0, 0], cellPadding: 1 },
        });
        y = (doc as any).lastAutoTable.finalY + 5;

        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`TOTALE DOVUTO: ${totalDue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`, pageWidth - margin, y, { align: 'right' });
        y += 15;

        // 4. Daily Details
        doc.setFontSize(14);
        doc.text("Dettaglio Giornaliero", margin, y);
        y += 3;
        doc.setLineWidth(0.2);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;

        details.forEach(detail => {
            if (y > pageHeight - 30) {
                doc.addPage();
                y = 20;
            }

            const dayName = format(detail.date, 'eeee', { locale: it });
            const restOfDate = format(detail.date, 'dd MMMM', { locale: it });
            const dateStr = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${restOfDate}`;

            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(dateStr, margin, y);
            y += 5;

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');

            if (detail.note) {
                doc.setFont('helvetica', 'italic');
                const splitNote = doc.splitTextToSize(`"${detail.note.note}"`, pageWidth - margin * 2);
                doc.text(splitNote, margin, y);
                y += (splitNote.length * 5);
                doc.setFont('helvetica', 'normal');
            }

            if (detail.shift && detail.shift.allShifts) {
                detail.shift.allShifts.forEach((shiftBlock: any, idx: number) => {
                    const timbratureString = shiftBlock.events.map((e: any) => {
                        const originalTime = format(e.timestamp.toDate(), 'HH:mm');
                        let refTime = '';
                        if (e.type === 'entrata' && shiftBlock.calculationStart) {
                            refTime = `(${format(shiftBlock.calculationStart, 'HH:mm')})`;
                        } else if (e.type === 'uscita' && shiftBlock.calculationEnd) {
                            refTime = `(${format(shiftBlock.calculationEnd, 'HH:mm')})`;
                        }
                        const typeLabel = e.type.charAt(0).toUpperCase() + e.type.slice(1);
                        return `${typeLabel}: ${originalTime} ${refTime}`.trim();
                    }).join(' | ');

                    doc.text(`Turno ${idx + 1}: ${timbratureString}`, margin, y);
                    y += 5;
                });
                
                const stats = `Ore Previste: ${detail.shift.contractualHours}h | Ordinarie: ${detail.shift.ordinaryHours}h | Straordinario: ${detail.shift.overtimeHours}h${showPermessi ? ` | Permesso: ${detail.shift.permissionHours}h` : ''}`;
                doc.text(stats, margin, y);
                y += 6;
            } else if (!detail.note) {
                let statusText = '';
                switch (detail.status) {
                    case 'mancata_timbratura': statusText = 'Assente'; break;
                    case 'ferie': statusText = 'Giorno di Ferie'; break;
                    case 'malattia': statusText = 'Giorno di Malattia'; break;
                    case 'festa': statusText = 'Giorno Festivo'; break;
                    case 'riposo': statusText = 'Giorno di Riposo'; break;
                }
                if (statusText) {
                    doc.text(statusText, margin, y);
                    y += 5;
                }
            }

            doc.setDrawColor(220);
            doc.setLineWidth(0.1);
            doc.line(margin, y, pageWidth - margin, y);
            y += 6;
        });

        const blob = doc.output('blob');
        const safeFirstName = op.firstName.trim();
        const safeLastName = op.lastName.trim();
        const fileName = `${safeFirstName}_${safeLastName}_${format(currentMonth, 'yyyy-MM')}.pdf`;

        return { blob, fileName };
    } catch (error) {
        console.error("Error generating detailed PDF:", error);
        return null;
    }
};
