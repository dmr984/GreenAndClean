'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Video } from 'lucide-react';

const SceneCard = ({ scene, title, visual, voice }: { scene: number, title: string, visual: string, voice: string }) => (
    <Card className="mb-4">
        <CardHeader>
            <CardTitle>Scena {scene}: {title}</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-6">
            <div>
                <h4 className="font-semibold mb-2 text-primary">🎬 Azione Visiva</h4>
                <p className="text-muted-foreground">{visual}</p>
            </div>
            <div>
                <h4 className="font-semibold mb-2 text-primary">🎙️ Voce Narrante</h4>
                <p className="text-muted-foreground italic">{voice}</p>
            </div>
        </CardContent>
    </Card>
);

const TutorialSection = ({ title, videoId, children }: { title: string, videoId: string | null, children: React.ReactNode }) => (
    <Card className="mb-8">
        <CardHeader>
            <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>
            {videoId ? (
                 <div className="aspect-video mb-6">
                    <iframe
                        className="w-full h-full rounded-lg border"
                        src={`https://www.youtube.com/embed/${videoId}`}
                        title={`Video tutorial: ${title}`}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    ></iframe>
                </div>
            ) : (
                <div className="aspect-video mb-6 flex items-center justify-center bg-muted rounded-lg">
                    <p className="text-muted-foreground">Video non ancora disponibile.</p>
                </div>
            )}
            <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="sceneggiatura">
                    <AccordionTrigger>Mostra/Nascondi Sceneggiatura</AccordionTrigger>
                    <AccordionContent className="pt-4">
                        {children}
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </CardContent>
    </Card>
);


export default function TutorialPage() {

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Video className="h-8 w-8 text-primary" />
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Video Tutorial</h1>
                    <p className="text-muted-foreground">
                        Guarda i video per imparare a usare l'applicazione.
                    </p>
                </div>
            </div>

            <TutorialSection title="1. Guida alla Gestione del Turno" videoId="dQw4w9WgXcQ">
                <SceneCard
                    scene={1}
                    title="Accesso all'App"
                    visual="Inquadratura della pagina di login dell'applicazione. Un dito tocca il campo 'Codice Operatore', inserisce un codice e poi preme il pulsante 'Accedi'."
                    voice="Per iniziare, apri l'applicazione e inserisci il tuo codice operatore personale. Poi, premi 'Accedi' per entrare nella tua dashboard."
                />
                <SceneCard
                    scene={2}
                    title="Inizio del Turno"
                    visual="Schermata della dashboard operatore. In primo piano, il grande pulsante verde 'Inizia Turno'. Un dito tocca il pulsante. Compare brevemente un'icona di caricamento, poi il pulsante scompare per lasciare posto a quello rosso 'Termina Turno'."
                    voice="Una volta dentro, per iniziare la tua giornata lavorativa, premi il pulsante verde 'Inizia Turno'. Il sistema registrerà la tua posizione e l'orario di inizio."
                />
                <SceneCard
                    scene={3}
                    title="Fine del Turno"
                    visual="La dashboard ora mostra il pulsante rosso 'Termina Turno'. Un dito tocca il pulsante. Anche qui, breve icona di caricamento, poi il pulsante scompare e riappare quello verde 'Inizia Turno'."
                    voice="Quando hai finito, apri di nuovo l'app e premi il pulsante rosso 'Termina Turno'. Questo registrerà la tua uscita e completerà il turno di oggi."
                />
                <SceneCard
                    scene={4}
                    title="Verifica Riepilogo Giornaliero"
                    visual="Scorrimento verso il basso della dashboard fino alla sezione 'Riepilogo Turni di Oggi'. Si vede una nuova riga nella tabella con l'orario di inizio e fine appena registrati."
                    voice="Subito dopo aver terminato, puoi vedere il riepilogo del tuo turno nella tabella qui sotto. Mostra l'orario di inizio, fine e la durata totale del lavoro."
                />
                <SceneCard
                    scene={5}
                    title="Consultare la Guida"
                    visual="Il dito tocca l'icona con la 'i' di informazioni in alto a destra nella card 'Gestione Turno'. Si apre la finestra di dialogo con la guida testuale. Il dito scorre lentamente il testo dall'inizio alla fine."
                    voice="Se hai dubbi su come funzionano le timbrature, le pause o il calcolo delle ore, puoi sempre consultare la guida rapida cliccando sull'icona delle informazioni."
                />
                 <SceneCard
                    scene={6}
                    title="Conclusione"
                    visual="Dissolvenza che torna alla dashboard principale pulita, con il logo dell'azienda che appare al centro per un istante."
                    voice="Gestire i tuoi turni è semplice e veloce. Ricorda di timbrare sempre all'inizio e alla fine della tua giornata. Per qualsiasi problema, contatta l'amministrazione."
                />
            </TutorialSection>

            <TutorialSection title="2. Guida alla Richiesta di Ferie e Permessi" videoId={null}>
                 <p className="text-muted-foreground p-4 text-center">La sceneggiatura per questo video tutorial sarà disponibile a breve.</p>
            </TutorialSection>

            <TutorialSection title="3. Guida alla Richiesta Forniture" videoId={null}>
                <p className="text-muted-foreground p-4 text-center">La sceneggiatura per questo video tutorial sarà disponibile a breve.</p>
            </TutorialSection>
        </div>
    );
}
