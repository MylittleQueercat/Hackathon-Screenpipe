/**
 * PipeOps data contract.
 *
 * Convention: `null` means "not present in the evaluation artifacts yet".
 * The UI never fills a null with made-up content; it renders a labeled placeholder
 * that names the JSON path the real value will come from.
 */

export type StageId = string;

export interface StageDef {
  id: StageId;
  name: string;
  /** Short role description shown on the canvas. */
  summary: string | null;
  /** "draft" = UI copy written for the prototype, not taken from the engine. */
  summaryStatus: 'draft' | 'source';
}

export interface EvidenceLens {
  id: string;
  label: string;
}

export interface StageRecord {
  modelRequests: number | null;
  runtimeSeconds: number | null;
  snapshotId: string | null;
  output: string | null;
}

export interface WorkflowRecord {
  id: string;
  title: string;
  steps?: string[] | null;
  /** id of the ground-truth workflow it was matched to, if any */
  matchedTo?: string | null;
  /** Below: only ever present for generated workflows, read straight from catalog.json.
   *  Ground-truth entries (from truth.json) don't carry these — left undefined, not null,
   *  since truth.json simply has no such field to be "missing" from. */
  trigger?: string | null;
  outcome?: string | null;
  variations?: string[] | null;
  limitations?: string[] | null;
  /** The engine's own 1–4 confidence rating for this candidate workflow. */
  confidence?: number | null;
}

export interface CheckRecord {
  id: string;
  name: string | null;
  lens: string | null;
  passed: boolean;
  expected: string | null;
  actual: string | null;
  reason: string | null;
  evidence: string[] | null;
}

export interface RunMetrics {
  qualityPassed: number;
  qualityTotal: number;
  modelRequests: number;
  runtimeSeconds: number;
}

export interface RawRun {
  id: string;
  label: string;
  role: 'baseline' | 'variant';
  status: 'recorded';
  recordedAt: string | null;
  metrics: RunMetrics;
  stages: Record<StageId, StageRecord>;
  recordedActivity: { description: string; sources?: string[] } | null;
  generatedWorkflows: WorkflowRecord[] | null;
  groundTruth: WorkflowRecord[] | null;
  checks: CheckRecord[] | null;
}

export interface RawExperimentBundle {
  schemaVersion: number;
  source: { kind: 'mock' | 'artifact'; file: string; note: string };
  experiment: { id: string; title: string; subject: string; question: string };
  stages: StageDef[];
  evidenceLenses: EvidenceLens[];
  runs: RawRun[];
  comparison: {
    baseline: string;
    variant: string;
    pairing: 'single' | 'multiple';
    verdict: string;
    note: string;
  };
}

/* ---------- normalized shapes used by the UI ---------- */

export interface CheckSlot extends CheckRecord {
  index: number;
  /** true when the slot was synthesized from run totals because per-check records are missing */
  derived: boolean;
}

export interface Run extends Omit<RawRun, 'checks'> {
  checks: CheckSlot[];
  checksLoaded: boolean;
}

export interface Experiment extends Omit<RawExperimentBundle, 'runs'> {
  runs: Run[];
}
