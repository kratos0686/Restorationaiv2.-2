/**
 * AIRouterClient.ts — browser-side stand-in for IntelligenceRouter.
 *
 * IntelligenceRouter (services/IntelligenceRouter.ts) instantiates the Gemini
 * SDK with the raw API key (`process.env.GEMINI_API_KEY`) and must only ever
 * run on the server — importing it from client code bakes the key into the
 * browser bundle. This class exposes the same public method names so call
 * sites don't change; every call is proxied through POST /api/ai/router/:method
 * (see server.ts), which runs the real IntelligenceRouter server-side and
 * returns { text }, matching the `.text` shape callers already expect from
 * a GenerateContentResponse.
 */
export class AIRouterClient {
  private async call(method: string, args: unknown[]): Promise<{ text: string }> {
    const res = await fetch(`/api/ai/router/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `AI request failed (${res.status})`);
    }
    return data as { text: string };
  }

  execute(...args: unknown[]) {
    return this.call('execute', args);
  }

  parseFieldIntent(...args: unknown[]) {
    return this.call('parseFieldIntent', args);
  }

  generateScope(...args: unknown[]) {
    return this.call('generateScope', args);
  }

  generateTasks(...args: unknown[]) {
    return this.call('generateTasks', args);
  }

  generateDailyDryingNarrative(...args: unknown[]) {
    return this.call('generateDailyDryingNarrative', args);
  }

  generateNarrative(...args: unknown[]) {
    return this.call('generateNarrative', args);
  }

  generateComprehensiveReport(...args: unknown[]) {
    return this.call('generateComprehensiveReport', args);
  }

  analyzeWaterDamageImage(...args: unknown[]) {
    return this.call('analyzeWaterDamageImage', args);
  }

  detectMoistureAnomalies(...args: unknown[]) {
    return this.call('detectMoistureAnomalies', args);
  }

  analyzeMediaMitigationAssessment(...args: unknown[]) {
    return this.call('analyzeMediaMitigationAssessment', args);
  }

  generatePreliminaryDamageReport(...args: unknown[]) {
    return this.call('generatePreliminaryDamageReport', args);
  }
}
