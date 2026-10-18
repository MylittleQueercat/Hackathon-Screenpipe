// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
// Typed access to story.json (built by scripts/build-story.py from real wfeval runs).
// Every number on screen is derived here from that file.
import raw from './data/story.json';

export type Side = 'base' | 'stack';
export type Agent = 'discover' | 'maintain' | 'deepen' | 'review';
export const AGENTS: Agent[] = ['discover', 'maintain', 'deepen', 'review'];

export interface Frame { at: string; phase: number; app: string; window: string | null; job: string | null; run: string | null; step: string | null }
export interface Step { text: string; quote: string; at: string | null; app: string | null }
export interface Workflow {
  title: string; job: string | null; trigger: string; outcome: string; confidence: number | null;
  stages: { name: string; steps: Step[] }[]; variations: string[];
  evidence: { at: string; app: string; text: string }[];
}
export interface StreamEvent { t: number; agent: Agent; kind: 'request' | 'tool' | 'workflows' | 'cut'; tool?: string; action?: string; ok?: boolean; reply?: string | null }
export interface Phase {
  phase: number; seconds: number; requests: number; output: number; agents: Record<Agent, number>;
  rejected: number; cut: number; checks: Record<string, boolean | null>; passed: number; scored: number;
  mistakes: Record<string, number>; workflows: Workflow[]; stream: StreamEvent[];
}
export interface JudgeRow { phase: number; job: string; orders: { preferred: Side | 'tie'; strength: string }[]; verdict: Side | 'tie' | 'split'; correctness: Record<Side, number> }
export interface Story {
  suite: string; seed: number; model: string; engine: string;
  history: { frames: Frame[]; jobs: Record<string, string> };
  checks: Record<string, string>;
  base: Phase[]; stack: Phase[];
  pair2Runs: Record<Side, Omit<Phase, 'stream' | 'workflows'>[]>;
  controls: { id: string; label: string; failed: string[]; mistakes: string[] }[];
  judge: { name: string; rows: JudgeRow[] }[];
}

export const story = raw as unknown as Story;

export const SIDE_NAME: Record<Side, string> = { base: 'Baseline', stack: 'Our stack' };
export const PHASE_NAME: Record<number, string> = { 1: 'First week', 2: 'A rule changes', 3: 'Nothing new' };
export const JOB_NAME: Record<string, string> = { receipts: 'Receipt filing', email: 'Email attachments', printer: 'Printer setup (one-off)', noise: 'Everything else' };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export function totals(side: Side) {
  const ps = story[side];
  return {
    requests: sum(ps.map((p) => p.requests)),
    seconds: sum(ps.map((p) => p.seconds)),
    output: sum(ps.map((p) => p.output)),
    cut: sum(ps.map((p) => p.cut)),
    rejected: sum(ps.map((p) => p.rejected)),
    passed: sum(ps.map((p) => p.passed)),
    scored: sum(ps.map((p) => p.scored)),
    idle: ps.find((p) => p.phase === 3)?.requests ?? 0,
  };
}

export const fmtInt = (n: number) => n.toLocaleString('en-US');
export const fmtK = (n: number) => `${(n / 1000).toFixed(1)}k`;
export const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });
};
export const sameCapture = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 1000;
