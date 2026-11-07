import express from 'express';
import type { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { config } from 'dotenv';

config({ path: '.env.local' });

const app = express();
const port = 3001;

app.use(express.json({ limit: '50mb' }));

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
const ai = new GoogleGenAI(apiKey ? { apiKey } : {});

app.post('/api/gemini/generate', async (req: Request, res: Response) => {
  try {
    const { model, contents, config: genConfig } = req.body;
    const response = await ai.models.generateContent({ model, contents, config: genConfig });
    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: String(error) });
  }
});

app.listen(port, () => {
  console.log(`Gemini proxy running on http://localhost:${port}`);
});
