import { genkit, z } from 'genkit';
import { googleAI, gemini15Flash, gemini15Pro } from '@genkit-ai/googleai';

// Initialize Genkit
export const g = genkit({
  plugins: [
    googleAI({ apiKey: process.env.GEMINI_API_KEY })
  ],
  model: gemini15Flash, // Default model
});

// Define a Flow for parsing field intent (Xactimate style)
export const fieldIntentFlow = g.defineFlow(
  {
    name: 'fieldIntentFlow',
    inputSchema: z.object({
      userInput: z.string(),
      projectContext: z.any().optional(),
    }),
    outputSchema: z.object({
      category: z.enum(['Psychrometrics', 'Equipment', 'Safety', 'General']),
      structuredData: z.record(z.any()),
      summary: z.string(),
      action: z.string().optional(),
    }),
  },
  async (input) => {
    const { output } = await g.generate({
      prompt: `You are a restoration AI assistant. Analyze this field technician's input: "${input.userInput}". 
         Context: ${JSON.stringify(input.projectContext)}.
         Categorize the input into: 'Psychrometrics', 'Equipment', 'Safety', or 'General'.
         Extract structured data if possible (e.g. temp, rh, count).
         Provide a clean, professional summary sentence.`,
      config: {
        responseMimeType: 'application/json',
      },
    });

    try {
        return JSON.parse(output?.text || '{}');
    } catch {
        console.error("Failed to parse Genkit output:", output?.text);
        return {
            category: 'General',
            structuredData: {},
            summary: output?.text || "Could not parse response",
        };
    }
  }
);

// Define a Flow for generating project narratives
export const narrativeFlow = g.defineFlow(
    {
        name: 'narrativeFlow',
        inputSchema: z.object({
            currentStage: z.string(),
            equipmentCount: z.number().optional(),
            readings: z.array(z.any()).optional(),
            complianceIssues: z.string().optional(),
        }),
        outputSchema: z.string(),
    },
    async (input) => {
        const prompt = `Act as a professional IICRC-certified Water Mitigation Technician. 
        Write a formal Daily Project Log.
        - Date: ${new Date().toLocaleDateString()}
        - Status: ${input.currentStage}
        - Equipment: ${input.equipmentCount || 0} units
        - Readings: ${JSON.stringify(input.readings?.slice(-2))}
        - Issues: ${input.complianceIssues || 'None'}
        Keep it professional, past tense, and under 100 words.`;

        const { text } = await g.generate({
            model: gemini15Pro,
            prompt,
        });

        return text;
    }
);
