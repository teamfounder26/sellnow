import { defineJob, type StageContext } from "@/lib/jobs/runner";
import { createProject, regenerateBrief } from "./service";

export type PosterBriefJobInput =
  | { mode: "create"; projectId: string; productId: string; settings: unknown; locale: "ms" | "en" }
  | { mode: "regenerate"; projectId: string; settings?: unknown; intel?: unknown; locale: "ms" | "en" };

/**
 * Creative-brief generation as a durable job: a long model call never blocks the page, survives a
 * refresh, and the pre-assigned project id makes a resumed stage idempotent (never two projects).
 */
export const posterBriefJob = defineJob({
  kind: "poster.brief",
  leaseSeconds: 420,
  stages: [
    {
      key: "brief",
      run: async ({ db, job }: StageContext) => {
        const input = job.input as PosterBriefJobInput;
        const ctx = { db, workspaceId: job.workspaceId, userId: job.userId ?? "", locale: input.locale };
        if (input.mode === "create") await createProject(ctx, { id: input.projectId, productId: input.productId, settings: input.settings });
        else await regenerateBrief(ctx, input.projectId, { settings: input.settings, intel: input.intel });
        return { projectId: input.projectId };
      },
    },
  ],
});
