import { ClockWidget } from "@/components/dashboard/clock-widget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone, CheckCircle } from "lucide-react";

const announcements = [
  {
    title: "Nuovo Protocollo di Pulizia per la Zona C",
    date: "2 giorni fa",
    content: "Si prega di prendere visione dei nuovi protocolli di pulizia per tutte le aree della Zona C, con effetto immediato. Domani alle 8:00 si terrà una breve sessione di formazione."
  },
  {
    title: "Aggiornamento Calendario Festività",
    date: "5 giorni fa",
    content: "È stato pubblicato il calendario delle festività per il prossimo mese. Si prega di controllare i turni assegnati e di segnalare eventuali conflitti entro la fine della settimana."
  },
  {
    title: "Rifornimento Scorte Completato",
    date: "1 settimana fa",
    content: "Il magazzino è stato rifornito di tutti i materiali di pulizia standard. Si prega di aggiornare il proprio inventario di conseguenza."
  },
];

export default function Dashboard() {
  return (
    <>
    <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pannello di Controllo Operatore</h2>
      </div>
    <div className="grid gap-4 md:gap-8 lg:grid-cols-3">
      <div className="lg:col-span-1">
         <ClockWidget />
      </div>

      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Megaphone className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl">Annunci</CardTitle>
          </div>
          <CardDescription>
            Aggiornamenti e avvisi importanti dall'amministrazione.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-6">
            {announcements.map((ann, index) => (
              <li key={index} className="flex items-start gap-4">
                <div className="p-1 rounded-full bg-secondary mt-1">
                  <CheckCircle className="h-5 w-5 text-secondary-foreground" />
                </div>
                <div className="grid gap-1">
                  <p className="text-base font-medium leading-none">
                    {ann.title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {ann.content}
                  </p>
                  <p className="text-xs text-muted-foreground pt-1">{ann.date}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
    </>
  );
}
