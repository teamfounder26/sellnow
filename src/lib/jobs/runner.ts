import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { aiJobs, type JobStage, type JobStatus } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { AIProviderError } from "@/lib/ai/provider";
import { log } from "@/lib/log";

export type Job = typeof aiJobs.$inferSelect;
export const ACTIVE_STATUSES: JobStatus[] = ["QUEUED", "PROCESSING", "VALIDATING", "RETRYING"];

const LEASE_SECONDS = 120;
const MAX_ATTEMPTS = 3;
/** A job that has not finished this long after creation is failed with a timeout. */
const JOB_TIMEOUT_MS = 15 * 60 * 1000;

export type StageContext = {
  db: DB;
  job: Job;
  /** Outputs of earlier stages (persisted, so available after a resume). */
  outputs: Record<string, unknown>;
};

export type JobDefinition = {
  kind: string;
  stages: { key: string; validating?: boolean; run: (c: StageContext) => Promise<unknown> }[];
  onComplete?: (c: StageContext) => Promise<void>;
  onFail?: (c: StageContext, code: string) => Promise<void>;
};

const registry = new Map<string, JobDefinition>();
export function defineJob(def: JobDefinition) {
  registry.set(def.kind, def);
  return def;
}

/**
 * Enqueue a job. The partial unique index allows only one active job per (workspace, kind):
 * a duplicate request (double click, second tab) returns the job that is already running.
 */
export async function enqueueJob(db: DB, opts: { workspaceId: string; userId: string; kind: string; input: Record<string, unknown> }): Promise<{ job: Job; created: boolean }> {
  const def = registry.get(opts.kind);
  if (!def) throw new Error(`Unknown job kind ${opts.kind}`);
  const stages: JobStage[] = def.stages.map((s) => ({ key: s.key, status: "pending" }));
  const [row] = await db
    .insert(aiJobs)
    .values({ id: newId("job"), workspaceId: opts.workspaceId, userId: opts.userId, kind: opts.kind, input: opts.input, stages })
    .onConflictDoNothing()
    .returning();
  if (row) return { job: row, created: true };
  const active = await getActiveJob(db, opts.workspaceId, opts.kind);
  if (!active) throw new AppError("errors.unexpected");
  return { job: active, created: false };
}

export async function getActiveJob(db: DB, workspaceId: string, kind: string) {
  return (
    (await db.query.aiJobs.findFirst({
      where: and(eq(aiJobs.workspaceId, workspaceId), eq(aiJobs.kind, kind), inArray(aiJobs.status, ACTIVE_STATUSES)),
      orderBy: desc(aiJobs.createdAt),
    })) ?? null
  );
}

export async function getJob(db: DB, workspaceId: string, id: string) {
  return (await db.query.aiJobs.findFirst({ where: and(eq(aiJobs.id, id), eq(aiJobs.workspaceId, workspaceId)) })) ?? null;
}

/** Whether a poller should (re)start this job: queued, waiting to retry, or its worker's lease expired. */
export function needsKick(job: Job, now = new Date()) {
  if (job.status === "QUEUED" || job.status === "RETRYING") return true;
  return (job.status === "PROCESSING" || job.status === "VALIDATING") && (!job.leaseUntil || job.leaseUntil < now);
}

async function patch(db: DB, id: string, p: Partial<typeof aiJobs.$inferInsert>) {
  const [row] = await db.update(aiJobs).set({ ...p, updatedAt: new Date() }).where(eq(aiJobs.id, id)).returning();
  return row!;
}

/**
 * Runs (or resumes) a job. Claiming is an atomic conditional UPDATE, so two concurrent pollers can
 * never execute the same job; stages already marked done are skipped on resume.
 */
export async function runJob(db: DB, jobId: string): Promise<Job | null> {
  const [claimed] = await db
    .update(aiJobs)
    .set({
      status: "PROCESSING",
      leaseUntil: sql`now() + interval '${sql.raw(String(LEASE_SECONDS))} seconds'`,
      attempts: sql`${aiJobs.attempts} + 1`,
      startedAt: sql`coalesce(${aiJobs.startedAt}, now())`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiJobs.id, jobId),
        sql`(${aiJobs.status} in ('QUEUED','RETRYING') or (${aiJobs.status} in ('PROCESSING','VALIDATING') and (${aiJobs.leaseUntil} is null or ${aiJobs.leaseUntil} < now())))`,
      ),
    )
    .returning();
  if (!claimed) return null; // someone else is running it, or it is finished
  const def = registry.get(claimed.kind);
  if (!def) return patch(db, jobId, { status: "FAILED", error: "errors.unexpected", completedAt: new Date() });

  let job = claimed;
  const outputs = { ...job.output };
  const ctx = (): StageContext => ({ db, job, outputs });

  if (Date.now() - job.createdAt.getTime() > JOB_TIMEOUT_MS) {
    job = await patch(db, jobId, { status: "FAILED", error: "jobs.timeout", completedAt: new Date(), leaseUntil: null });
    await def.onFail?.(ctx(), "jobs.timeout");
    return job;
  }

  for (const stage of def.stages) {
    const state = job.stages.find((s) => s.key === stage.key);
    if (state?.status === "done" || state?.status === "skipped") continue;
    const stages = job.stages.map((s): JobStage => (s.key === stage.key ? { ...s, status: "running", at: new Date().toISOString() } : s));
    job = await patch(db, jobId, {
      stage: stage.key,
      stages,
      status: stage.validating ? "VALIDATING" : "PROCESSING",
      leaseUntil: sql`now() + interval '${sql.raw(String(LEASE_SECONDS))} seconds'` as unknown as Date,
    });
    try {
      const out = await stage.run(ctx());
      if (out !== undefined) outputs[stage.key] = out;
      job = await patch(db, jobId, {
        output: outputs,
        stages: job.stages.map((s): JobStage => (s.key === stage.key ? { ...s, status: "done", at: new Date().toISOString() } : s)),
      });
    } catch (e) {
      const code = e instanceof AppError ? e.code : e instanceof AIProviderError ? e.code : "errors.unexpected";
      const retryable = (e instanceof AIProviderError && e.retryable) || (!(e instanceof AppError) && !(e instanceof AIProviderError));
      const willRetry = retryable && job.attempts < MAX_ATTEMPTS;
      log(willRetry ? "warn" : "error", "job.stage_failed", { jobId, kind: job.kind, stage: stage.key, code, attempt: job.attempts, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
      job = await patch(db, jobId, {
        status: willRetry ? "RETRYING" : "FAILED",
        error: code,
        leaseUntil: null,
        stages: job.stages.map((s): JobStage => (s.key === stage.key ? { ...s, status: willRetry ? "pending" : "failed", at: new Date().toISOString() } : s)),
        ...(willRetry ? {} : { completedAt: new Date() }),
      });
      if (!willRetry) await def.onFail?.(ctx(), code);
      return job;
    }
  }
  await def.onComplete?.(ctx());
  return patch(db, jobId, { status: "COMPLETED", completedAt: new Date(), leaseUntil: null, error: null });
}

/** Lets a user retry a failed job safely: resets failed stages, keeps outputs of completed ones. */
export async function retryJob(db: DB, workspaceId: string, id: string) {
  const job = await getJob(db, workspaceId, id);
  if (!job) throw new AppError("errors.notFound");
  if (job.status !== "FAILED" && job.status !== "CANCELLED") return job;
  const active = await getActiveJob(db, workspaceId, job.kind);
  if (active) return active;
  return patch(db, id, {
    status: "QUEUED",
    error: null,
    attempts: 0,
    completedAt: null,
    createdAt: new Date(),
    stages: job.stages.map((s): JobStage => (s.status === "done" ? s : { key: s.key, status: "pending" })),
  });
}

export async function cancelJob(db: DB, workspaceId: string, id: string) {
  await db
    .update(aiJobs)
    .set({ status: "CANCELLED", completedAt: new Date(), leaseUntil: null, updatedAt: new Date() })
    .where(and(eq(aiJobs.id, id), eq(aiJobs.workspaceId, workspaceId), inArray(aiJobs.status, ACTIVE_STATUSES)));
}
