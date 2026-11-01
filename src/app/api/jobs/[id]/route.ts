import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/session";
import { getJob, needsKick } from "@/lib/jobs/runner";
import { kickJob } from "@/lib/jobs/kick";

/**
 * Job status for the processing screens. Polling also resumes jobs whose worker stopped
 * (lease expired) or that are waiting to retry — this is what makes generation survive a refresh.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getWorkspaceContext("viewer");
  if (!ctx.workspace) return NextResponse.json({ error: "errors.forbidden" }, { status: 403 });
  const job = await getJob(ctx.db, ctx.workspace.id, (await params).id);
  if (!job) return NextResponse.json({ error: "errors.notFound" }, { status: 404 });
  if (needsKick(job)) kickJob(job.id);
  return NextResponse.json(
    { id: job.id, kind: job.kind, status: job.status, stage: job.stage, stages: job.stages, error: job.error, completedAt: job.completedAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}
