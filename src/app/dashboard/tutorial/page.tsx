'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Video, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createTutorialVideo } from '@/ai/flows/create-tutorial-video-flow';

type TutorialTopic = {
  id: string;
  title: string;
  description: string;
  prompt: string;
};

const tutorialTopics: TutorialTopic[] = [
  {
    id: 'clocking',
    title: 'Come Timbrare un Turno',
    description: 'Genera un video che mostra a un operatore come iniziare e terminare un turno di lavoro.',
    prompt: `Crea un video tutorial per un'app di gestione della forza lavoro. 
    1.  Inizia con una schermata del telefono che mostra l'app Serveco, con il logo ben visibile. 
    2.  Un dito tocca il pulsante verde 'Inizia Turno'. 
    3.  La scena cambia mostrando un operaio sorridente con elmetto in un magazzino, che guarda il suo telefono.
    4.  Torna alla schermata del telefono, dove ora è visibile un orologio che avanza.
    5.  Il dito tocca il pulsante rosso 'Termina Turno'.
    6.  Il video finisce con il logo dell'azienda e il testo 'SERVECO SRL - Semplifica il tuo lavoro'.`
  },
  {
    id: 'requests',
    title: 'Come Fare una Richiesta',
    description: 'Un tutorial per operatori su come inviare una richiesta di ferie o permesso.',
    prompt: `Crea un video tutorial per l'app Serveco.
    1.  Mostra la dashboard dell'operatore.
    2.  Un dito apre il menu laterale e clicca su 'Ferie e Permessi'.
    3.  Nella pagina delle richieste, il dito clicca su 'Nuova Richiesta'.
    4.  Mostra la compilazione del modulo: selezione di 'Ferie', scelta delle date dal calendario.
    5.  Il dito clicca su 'Invia Richiesta'.
    6.  Appare una notifica di successo 'Richiesta Inviata'.
    7.  Il video finisce con il logo dell'azienda e il testo 'SERVECO SRL - Gestisci le tue richieste con un click'.`
  },
   {
    id: 'supplies',
    title: 'Come Richiedere Forniture',
    description: 'Spiega come un operatore può richiedere materiale dal magazzino tramite l\'app.',
    prompt: `Crea un video tutorial per l'app Serveco.
    1.  Dalla dashboard dell'operatore, un dito apre il menu e seleziona 'Richiesta Forniture'.
    2.  Mostra una lista di prodotti (es. 'Guanti da lavoro', 'Detergente multiuso').
    3.  Il dito inserisce '10' nella quantità per 'Guanti da lavoro'.
    4.  Il dito clicca sul pulsante 'Invia Richieste'.
    5.  Appare una notifica di successo.
    6.  Mostra la sezione 'Storico Richieste' con la nuova richiesta in stato 'in attesa'.
    7.  Il video finisce con il logo dell'azienda e il testo 'SERVECO SRL - Il tuo magazzino a portata di mano'.`
  },
];


export default function CreateTutorialPage() {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [revisedPrompt, setRevisedPrompt] = useState<string | null>(null);
  const { toast } = useToast();

  const handleGenerateVideo = async (topic: TutorialTopic) => {
    setIsLoading(topic.id);
    setVideoUrl(null);
    setRevisedPrompt(null);

    try {
      const result = await createTutorialVideo({ prompt: topic.prompt });
      setVideoUrl(result.videoUrl);
      if (result.revisedPrompt) {
        setRevisedPrompt(result.revisedPrompt);
      }
      toast({
        title: 'Video Generato!',
        description: `Il video tutorial "${topic.title}" è pronto.`,
      });
    } catch (error: any) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Errore nella Creazione del Video',
        description: error.message || 'Si è verificato un errore sconosciuto.',
      });
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Video className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl">Crea Video Tutorial con AI</CardTitle>
          </div>
          <CardDescription>
            Seleziona un argomento per generare un video tutorial per i tuoi dipendenti.
            La generazione del video può richiedere fino a 2 minuti.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tutorialTopics.map((topic) => (
              <Card key={topic.id} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg">{topic.title}</CardTitle>
                  <CardDescription>{topic.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow flex items-end">
                  <Button
                    onClick={() => handleGenerateVideo(topic)}
                    disabled={!!isLoading}
                    className="w-full"
                  >
                    {isLoading === topic.id ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        In corso...
                      </>
                    ) : (
                      <>
                        <Wand2 className="mr-2 h-4 w-4" />
                        Genera Video
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {isLoading && (
        <div className="flex flex-col items-center justify-center gap-4 text-center p-8 border-2 border-dashed rounded-lg">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <h3 className="text-xl font-semibold">Generazione del video in corso...</h3>
            <p className="text-muted-foreground">Questa operazione può richiedere fino a due minuti. Non chiudere la pagina.</p>
        </div>
      )}

      {videoUrl && !isLoading && (
        <Card>
          <CardHeader>
            <h3 className="text-xl font-semibold">Anteprima Video</h3>
            {revisedPrompt && (
                <div className="pt-2">
                    <h4 className="font-semibold text-sm">Prompt Migliorato dall'AI:</h4>
                    <p className="text-sm text-muted-foreground italic mt-1">"{revisedPrompt}"</p>
                </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="aspect-video w-full bg-muted rounded-lg overflow-hidden border">
              <video
                src={videoUrl}
                controls
                className="w-full h-full object-contain"
                autoPlay
                playsInline
              >
                Il tuo browser non supporta il tag video.
              </video>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
