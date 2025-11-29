'use server';
/**
 * @fileOverview A Genkit flow for creating tutorial videos using Veo.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { googleAI } from '@genkit-ai/google-genai';

const CreateTutorialVideoInputSchema = z.object({
  prompt: z.string().describe('A detailed text description of the video to be generated.'),
});
type CreateTutorialVideoInput = z.infer<typeof CreateTutorialVideoInputSchema>;

const CreateTutorialVideoOutputSchema = z.object({
  videoUrl: z.string().describe('The data URI of the generated MP4 video.'),
  revisedPrompt: z.string().optional().describe('The prompt that was revised by the model.'),
});
type CreateTutorialVideoOutput = z.infer<typeof CreateTutorialVideoOutputSchema>;

// This function will be called from the client-side component.
export async function createTutorialVideo(input: CreateTutorialVideoInput): Promise<CreateTutorialVideoOutput> {
  return createTutorialVideoFlow(input);
}

// Define the Genkit flow
const createTutorialVideoFlow = ai.defineFlow(
  {
    name: 'createTutorialVideoFlow',
    inputSchema: CreateTutorialVideoInputSchema,
    outputSchema: CreateTutorialVideoOutputSchema,
  },
  async (input) => {
    console.log(`Starting video generation with prompt: ${input.prompt}`);

    let { operation } = await ai.generate({
      model: googleAI.model('veo-2.0-generate-001'),
      prompt: input.prompt,
      config: {
        durationSeconds: 8,
        aspectRatio: '16:9',
      },
    });

    if (!operation) {
      throw new Error('Video generation failed to start.');
    }

    console.log('Video generation operation started. Polling for completion...');

    // Poll the operation status until it's done.
    while (!operation.done) {
      // Wait for 5 seconds before checking the status again.
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.log('Checking operation status...');
      operation = await ai.checkOperation(operation);
    }

    console.log('Video generation operation completed.');

    if (operation.error) {
      console.error('Video generation failed:', operation.error);
      throw new Error(`Video generation failed: ${operation.error.message}`);
    }

    const video = operation.output?.message?.content.find((p) => !!p.media);
    if (!video || !video.media?.url) {
      throw new Error('Generated video not found in the operation output.');
    }
    
    // The URL from Veo needs the API key to be downloaded.
    // We fetch it on the server and convert it to a data URI to send to the client.
    const fetch = (await import('node-fetch')).default;
    const videoDownloadResponse = await fetch(
      `${video.media.url}&key=${process.env.GEMINI_API_KEY}`
    );

    if (!videoDownloadResponse.ok) {
        const errorText = await videoDownloadResponse.text();
        console.error(`Failed to download video file. Status: ${videoDownloadResponse.status}, Body: ${errorText}`);
        throw new Error(`Failed to download video file. Status: ${videoDownloadResponse.status}`);
    }
    
    const videoBuffer = await videoDownloadResponse.buffer();
    const videoDataUri = `data:video/mp4;base64,${videoBuffer.toString('base64')}`;

    console.log('Video successfully downloaded and converted to data URI.');

    return {
      videoUrl: videoDataUri,
      revisedPrompt: operation.output?.message?.content.find(p => !!p.text)?.text
    };
  }
);
