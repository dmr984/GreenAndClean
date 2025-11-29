'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Video, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createTutorialVideo } from '@/ai/flows/create-tutorial-video-flow';

export default function CreateTutorialPage() {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [revisedPrompt, setRevisedPrompt] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      toast({
        variant: 'destructive',
        title: 'Prompt mancante',
        description: 'Per favore, inserisci una descrizione per il video.',
      });
      return;
    }

    setIsLoading(true);
    setVideoUrl(null);
    setRevisedPrompt(null);

    try {
      const result = await createTutorialVideo({ prompt });
      setVideoUrl(result.videoUrl);
      if (result.revisedPrompt) {
        setRevisedPrompt(result.revisedPrompt);
      }
      toast({
        title: 'Video Generato!',
        description: 'Il tuo video tutorial è pronto.',
      });
    } catch (error: any) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Errore nella Creazione del Video',
        description: error.message || 'Si è verificato un errore sconosciuto.',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleExamplePrompt = () => {
    setPrompt("Crea un video tutorial per un'app di gestione della forza lavoro. Mostra un primo piano di uno smartphone con l'interfaccia dell'app. Un dito tocca il pulsante 'Inizia Turno'. La scena cambia mostrando un operaio sorridente con l'elmetto in un magazzino. La scena torna sullo smartphone dove il dito tocca il pulsante 'Termina Turno'. Il video finisce con il logo dell'azienda e il testo 'Semplifica il tuo lavoro'.");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Video className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl">Crea Video Tutorial con AI</CardTitle>
          </div>
          <CardDescription>
            Descrivi il video tutorial che vuoi creare. L'AI genererà un video basato sulla tua descrizione.
            La generazione del video può richiedere fino a 2 minuti.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid w-full gap-1.5">
              <Label htmlFor="prompt">Descrizione del Video</Label>
              <Textarea
                id="prompt"
                placeholder="Esempio: Un video che mostra come un operatore timbra l'inizio e la fine del suo turno..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                disabled={isLoading}
              />
              <Button type="button" variant="link" className="p-0 h-auto justify-start" onClick={handleExamplePrompt}>
                Usa un prompt di esempio
              </Button>
            </div>
            <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generazione in corso...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Genera Video
                </>
              )}
            </Button>
          </form>

          {revisedPrompt && (
            <div className="mt-6 p-4 bg-muted rounded-lg">
                <h4 className="font-semibold text-sm">Prompt Migliorato dall'AI:</h4>
                <p className="text-sm text-muted-foreground italic mt-1">"{revisedPrompt}"</p>
            </div>
          )}

          {videoUrl && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">Il Tuo Video Tutorial</h3>
              <div className="aspect-video w-full bg-muted rounded-lg overflow-hidden">
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
