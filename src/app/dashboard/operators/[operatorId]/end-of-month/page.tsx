'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, Timestamp, onSnapshot, orderBy, getDocs } from 'firebase/firestore';
import { Loader2, Briefcase, Clock, Plus, Plane, UserCheck, Stethoscope } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useParams, useRouter } from 'next/navigation';
import { format, getDay, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const dayIndexToName: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type WorkSchedule = {
    [key in DayOfWeek]?: number;
};

type Operator = {
    id: string;
    username: string;
    workSchedule: WorkSchedule;
};

type Request = {
    id: string;
    type: 'ferie' | 'permesso' | 'malattia' | 'straordinario';
    status: 'approvato';
    startDate: Timestamp;
    endDate: Timestamp;
    hours?: number;
};

type Timbratura = {
    id: string;
    type: 'entrata' | 'pausa' | 'fine_pausa' | 'uscita';
    timestamp: Timestamp;
    status: 'confermata';
    isOvertime?: boolean;
};

type Shift = {
    date: Date;
    events: Timbratura[];
    contractualHours: number;
    workedMinutes: number;
    ordinaryHours: number;
ag, straordinarie, permessi e malattia per il mese selezionato. Visualizza anche il dettaglio giornaliero di ogni turno lavorato.
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent className="space-y-8">
                <div className="flex items-center justify-between gap-2 p-2 border rounded-md">
                    <Button variant="outline" size="sm" onClick={() => handleMonthChange(-1)}>Prec.</Button>
                    <h3 className="text-lg font-semibold text-center capitalize">{format(currentMonth, 'MMMM yyyy', { locale: it })}</h3>
                    <Button variant="outline" size="sm" onClick={() => handleMonthChange(1)}>Succ.</Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <SummaryCard title="Giorni Lavorati" value={monthlySummary.workedDays} icon={Briefcase} />
                    <SummaryCard title="Ore Ordinarie" value={monthlySummary.ordinaryHours.toLocaleString('it-IT')} icon={Clock} />
                    <SummaryCard title="Ore Straordinarie" value={monthlySummary.overtimeHours.toLocaleString('it-IT')} icon={Plus} />
                    <SummaryCard title="Ferie (giorni)" value={monthlySummary.ferieDays} icon={Plane} />
                    <SummaryCard title="Permessi (ore)" value={monthlySummary.permessoHours.toLocaleString('it-IT')} icon={UserCheck} />
                    <SummaryCard title="Malattia (giorni)" value={monthlySummary.malattiaDays} icon={Stethoscope} />
                </div>

                <Separator />

                <div>
                    <h3 className="text-xl font-semibold mb-4">Dettaglio Giornaliero</h3>
                    {workedShifts.length > 0 ? (
                        <div className="space-y-6">
                            {workedShifts.map(shift => (
                                <div key={shift.date.toISOString()} className="border rounded-lg p-4">
                                    <h4 className="font-bold text-lg capitalize">{format(shift.date, 'eeee dd MMMM', { locale: it })}</h4>
                                    <div className="text-sm text-muted-foreground mt-2 mb-4">
                                        {shift.events.map(e => `${e.type.replace('_', ' ')}: ${format(e.timestamp.toDate(), 'HH:mm')}`).join('  |  ')}
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                                        <InfoBox label="Ore Previste" value={`${shift.contractualHours}h`} />
                                        <InfoBox label="Ore Lavorate" value={formatMinutes(shift.workedMinutes)} />
                                        <InfoBox label="Ore Ordinarie" value={`${shift.ordinaryHours}h`} />
                                        <InfoBox label="Straordinario" value={`${shift.overtimeHours}h`} />
                                        <InfoBox label="Permesso" value={`${shift.permissionHours}h`} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">Nessun giorno lavorato in questo mese.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
