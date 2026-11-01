import "server-only";
import { after } from "next/server";
import { getDb } from "@/lib/db";
import { runJob } from "./runner";
import "./registry";

/**
 * Runs a job after the response is sent (keeps the request fast). If the process dies mid-job the
 * lease expires and the next status poll resumes it from the last completed stage.
 */
export function kickJob(jobId: string) {
  after(async () => {
    await runJob(await getDb(), jobId);
  });
}
