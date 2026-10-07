'use client';
import React, { useState, useEffect } from 'react';
import { Bell, Clock, Calendar, Zap, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFirestore } from '@/firebase';
import { useUser } from '@/hooks/use-user';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

interface OperatorNotificationInfo {
  id: string;
  name: string;
  username: string;
  shifts: number;
  requests: number;
  overtime: number;
  total: number;
}

interface NotificationBellProps {
  notificationCount?: number;
}

export function NotificationBell({ notificationCount: externalCount }: NotificationBellProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const router = useRouter();

  const [operatorNotifications, setOperatorNotifications] = useState<OperatorNotificationInfo[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);

  useEffect(() => {
    if (!firestore || !user || user.role !== 'admin') return;

    const operatorsQuery = query(collection(firestore, 'app-users'), where('role', '==', 'operator'));
    const unsubOperators = onSnapshot(operatorsQuery, (snapshot) => {
      const ops = snapshot.docs.map(doc => ({
        id: doc.id,
        name: `${doc.data().firstName || ''} ${doc.data().lastName || ''}`.trim() || doc.data().username || 'Operatore',
        username: doc.data().username || doc.id,
      }));

      // Listen to subcollections for each operator
      const unsubList: (() => void)[] = [];
      const countsMap: { [opId: string]: { shifts: number; requests: number; overtime: number } } = {};

      ops.forEach(op => {
        countsMap[op.id] = { shifts: 0, requests: 0, overtime: 0 };

        // 1. Timbrature sospese
        const qShifts = query(collection(firestore, `app-users/${op.id}/timbrature`), where('status', '==', 'sospesa'));
        const uShifts = onSnapshot(qShifts, (snap) => {
          const distinctDays = new Set(snap.docs.map(d => d.data().timestamp?.toDate()?.toDateString()).filter(Boolean));
          countsMap[op.id].shifts = distinctDays.size;
          updateState();
        }, () => {});
        unsubList.push(uShifts);

        // 2. Richieste in attesa
        const qReqs = query(collection(firestore, `app-users/${op.id}/requests`), where('status', '==', 'in_attesa'));
        const uReqs = onSnapshot(qReqs, (snap) => {
          countsMap[op.id].requests = snap.size;
          updateState();
        }, () => {});
        unsubList.push(uReqs);

        // 3. Straordinari in attesa o in corso
        const qOvt = query(collection(firestore, `app-users/${op.id}/straordinari`), where('status', 'in', ['in_attesa_di_approvazione', 'in_corso']));
        const uOvt = onSnapshot(qOvt, (snap) => {
          countsMap[op.id].overtime = snap.size;
          updateState();
        }, () => {});
        unsubList.push(uOvt);
      });

      function updateState() {
        const list: OperatorNotificationInfo[] = [];
        let grandTotal = 0;

        ops.forEach(op => {
          const counts = countsMap[op.id] || { shifts: 0, requests: 0, overtime: 0 };
          const sum = counts.shifts + counts.requests + counts.overtime;
          if (sum > 0) {
            grandTotal += sum;
            list.push({
              id: op.id,
              name: op.name,
              username: op.username,
              shifts: counts.shifts,
              requests: counts.requests,
              overtime: counts.overtime,
              total: sum,
            });
          }
        });

        list.sort((a, b) => b.total - a.total);
        setOperatorNotifications(list);
        setTotalCount(grandTotal);
      }

      return () => {
        unsubList.forEach(u => u());
      };
    });

    return () => {
      unsubOperators();
    };
  }, [firestore, user]);

  const displayCount = externalCount !== undefined ? externalCount : totalCount;

  const handleSelectOperator = (operatorId: string) => {
    router.push(`/dashboard/operators/${operatorId}/shifts`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button 
          className="relative p-2 rounded-full hover:bg-muted focus:outline-none transition-colors" 
          aria-label="Centro Notifiche"
        >
          <Bell className="h-5 w-5 text-foreground" />
          {displayCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 flex h-5 min-w-[20px] px-1 items-center justify-center rounded-full text-[11px] font-bold"
            >
              {displayCount > 99 ? '99+' : displayCount}
            </Badge>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 sm:w-96 p-0 shadow-lg border rounded-xl overflow-hidden">
        <div className="p-3 bg-muted/40 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Centro Notifiche</span>
          </div>
          {displayCount > 0 ? (
            <Badge variant="destructive" className="text-xs">
              {displayCount} {displayCount === 1 ? 'in sospeso' : 'in sospeso'}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs text-muted-foreground">
              0 in sospeso
            </Badge>
          )}
        </div>

        <div className="max-h-[350px] overflow-y-auto divide-y divide-border/60">
          {operatorNotifications.length > 0 ? (
            operatorNotifications.map((op) => (
              <DropdownMenuItem
                key={op.id}
                onClick={() => handleSelectOperator(op.id)}
                className="p-3 cursor-pointer hover:bg-muted/60 focus:bg-muted/80 flex items-center justify-between gap-3"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-sm truncate text-foreground">{op.name}</span>
                  <span className="text-xs text-muted-foreground truncate">Codice: {op.username}</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {op.shifts > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200">
                        <Clock className="h-3 w-3 mr-1 inline" />
                        {op.shifts} {op.shifts === 1 ? 'turno' : 'turni'}
                      </Badge>
                    )}
                    {op.requests > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200">
                        <Calendar className="h-3 w-3 mr-1 inline" />
                        {op.requests} {op.requests === 1 ? 'richiesta' : 'richieste'}
                      </Badge>
                    )}
                    {op.overtime > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200">
                        <Zap className="h-3 w-3 mr-1 inline" />
                        {op.overtime} straord.
                      </Badge>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </DropdownMenuItem>
            ))
          ) : (
            <div className="py-8 px-4 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-green-500/60" />
              <p className="text-sm font-medium">Nessuna notifica in sospeso.</p>
              <p className="text-xs text-muted-foreground">Tutti i turni e le richieste sono aggiornati!</p>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
