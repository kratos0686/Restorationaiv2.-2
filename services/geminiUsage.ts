/**
 * geminiUsage.ts — token + cost logging for the Restoration AI Express proxy.
 *
 * Drop-in: wrap your existing Gemini calls with trackGeminiCall().
 * Goal is answering "what does one job actually cost me" with real data
 * instead of estimates, before you set subscription tiers.
 */

// ---------------------------------------------------------------------------
// Price table — USD per 1M tokens. Verify against ai.google.dev before trusting
// these for billing decisions; Google reprices more often than you'd expect.
// ---------------------------------------------------------------------------

type Rate = {
  input: number;
  output: number;
  cachedInput: number;
  /** Pro models bill higher above 200K prompt tokens. */
  longContext?: { threshold: number; input: number; output: number };
};

const RATES: Record<string, Rate> = {
  'gemini-3.1-pro': {
    input: 2.0,
    output: 12.0,
    cachedInput: 0.2,
    longContext: { threshold: 200_000, input: 4.0, output: 18.0 },
  },
  'gemini-3.6-flash': { input: 1.5, output: 7.5, cachedInput: 0.15 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5, cachedInput: 0.03 },
};

// ---------------------------------------------------------------------------
// Gemini's usageMetadata shape
// ---------------------------------------------------------------------------

export type UsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  /** Thinking tokens. Billed at OUTPUT rates — this is the line item that
   *  blows up budgets, so it gets its own column. */
  thoughtsTokenCount?: number;
  /** Subset of promptTokenCount that hit cache, billed ~10%. */
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
};

export type UsageRecord = {
  ts: string;
  customerId: string;
  jobId: string;
  /** 'triage' | 'report' | whatever pipeline steps you add. */
  step: string;
  model: string;
  promptTokens: number;
  cachedTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  costUsd: number;
  latencyMs: number;
  ok: boolean;
};

// ---------------------------------------------------------------------------
// Cost math
// ---------------------------------------------------------------------------

export function computeCost(model: string, u: UsageMetadata): number {
  const rate = RATES[model];
  if (!rate) {
    console.warn(`[usage] no rate for model "${model}" — logging cost as 0`);
    return 0;
  }

  const cached = u.cachedContentTokenCount ?? 0;
  const thinking = u.thoughtsTokenCount ?? 0;
  const billableInput = Math.max(0, (u.promptTokenCount ?? 0) - cached);

  // Thinking tokens bill as output. candidatesTokenCount does not include them.
  const billableOutput = (u.candidatesTokenCount ?? 0) + thinking;

  const tier =
    rate.longContext && (u.promptTokenCount ?? 0) > rate.longContext.threshold
      ? rate.longContext
      : rate;

  const per = (tokens: number, perMillion: number) =>
    (tokens / 1_000_000) * perMillion;

  return (
    per(billableInput, tier.input) +
    per(cached, rate.cachedInput) +
    per(billableOutput, tier.output)
  );
}

// ---------------------------------------------------------------------------
// Sink — swap this for a Postgres/Supabase insert once you're past beta.
// Keep it fire-and-forget: logging must never fail a customer's request.
// ---------------------------------------------------------------------------

export type UsageSink = (r: UsageRecord) => void | Promise<void>;

let sink: UsageSink = (r) => console.log('[usage]', JSON.stringify(r));

export function setUsageSink(fn: UsageSink) {
  sink = fn;
}

async function emit(r: UsageRecord) {
  try {
    await sink(r);
  } catch (err) {
    console.error('[usage] sink failed (ignored):', err);
  }
}

// ---------------------------------------------------------------------------
// The wrapper
// ---------------------------------------------------------------------------

export type CallContext = {
  customerId: string;
  jobId: string;
  step: string;
  model: string;
};

interface UsageMeta {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
}

/**
 * Wrap any Gemini call. The fn must resolve to a response carrying
 * usageMetadata (the standard @google/genai response does).
 */
function isRetryableGeminiError(err: unknown): boolean {
  const errObj = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : null;
  const status = (errObj?.status ?? errObj?.code ?? (errObj?.response as Record<string, unknown> | undefined)?.status) as number | undefined;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;
  const message = String(errObj?.message ?? err ?? '').toLowerCase();
  return (
    message.includes('rate limit') ||
    message.includes('resource_exhausted') ||
    message.includes('overloaded') ||
    message.includes('unavailable') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('fetch failed')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function trackGeminiCall<T extends { usageMetadata?: UsageMeta }>(
  ctx: CallContext,
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  const started = Date.now();
  let ok = false;
  let usage: UsageMeta | undefined;
  let attempt = 0;

  try {
    let lastErr: unknown;
    while (attempt <= maxRetries) {
      try {
        const res = await fn();
        usage = res.usageMetadata;
        ok = true;
        return res;
      } catch (err) {
        lastErr = err;
        if (attempt === maxRetries || !isRetryableGeminiError(err)) {
          throw err;
        }
        const delayMs = Math.min(8000, 500 * 2 ** attempt) + Math.random() * 250;
        console.warn(`[usage] Gemini call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delayMs)}ms:`, err);
        await sleep(delayMs);
        attempt++;
      }
    }
    throw lastErr;
  } finally {
    const u = usage ?? { promptTokenCount: 0, candidatesTokenCount: 0 };
    void emit({
      ts: new Date().toISOString(),
      customerId: ctx.customerId,
      jobId: ctx.jobId,
      step: ctx.step,
      model: ctx.model,
      promptTokens: u.promptTokenCount ?? 0,
      cachedTokens: u.cachedContentTokenCount ?? 0,
      outputTokens: u.candidatesTokenCount ?? 0,
      thinkingTokens: u.thoughtsTokenCount ?? 0,
      costUsd: Number(computeCost(ctx.model, u).toFixed(6)),
      latencyMs: Date.now() - started,
      ok,
    });
  }
}
// ---------------------------------------------------------------------------
// Express glue — pulls customer/job off the request so call sites stay clean.
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    usageCtx?: { customerId: string; jobId: string };
  }
}

export function usageContext() {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.usageCtx = {
      // Replace with your real auth subject once wired up.
      customerId: (req.header('x-customer-id') || 'unknown').slice(0, 64),
      jobId: (req.body?.jobId || req.header('x-job-id') || 'adhoc').slice(0, 64),
    };
    next();
  };
}
