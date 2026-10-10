import { z } from "zod";
import { ProjectSchema } from "../domain";
export const agentStates = [
  "PENDING",
  "ANALYZING",
  "STORYBOARD",
  "GENERATING",
  "ANIMATING",
  "RENDERING",
  "QUALITY_CHECK",
  "READY_FOR_REVIEW",
  "FAILED",
  "CANCELED",
] as const;
export const specialists = [
  "VisualDesignerAgent",
  "MotionDirectorAgent",
  "StoryContinuityAgent",
  "AudioEngineerAgent",
  "VideoEditorAgent",
  "QualityControlAgent",
] as const;
export type Specialist = (typeof specialists)[number];
export const IssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string(),
  sceneId: z.string().optional(),
  resolved: z.boolean().default(false),
});
export type QualityIssue = z.infer<typeof IssueSchema>;
export const AgentJobSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string(),
  requestKey: z.string(),
  state: z.enum(agentStates),
  progress: z.number().min(0).max(1),
  currentScene: z.number().int().min(0),
  attempts: z.number().int().min(0),
  maxAttempts: z.number().int().min(1).max(5),
  createdAt: z.string(),
  updatedAt: z.string(),
  ownerPid: z.number().optional(),
  ownerStartedAt: z.string().optional(),
  retryAt: z.number().default(0),
  error: z.string().optional(),
  waitingApproval: z.boolean().default(false),
  approvedRevision: z.number().optional(),
  renderJobId: z.string().optional(),
  snapshot: ProjectSchema,
  resumeState: z.enum(agentStates).optional(),
  completedScenes: z.array(z.string()).default([]),
  issues: z.array(IssueSchema).default([]),
  events: z
    .array(
      z.object({
        at: z.string(),
        agent: z.enum(specialists),
        message: z.string(),
      }),
    )
    .default([]),
});
export type AgentJob = z.infer<typeof AgentJobSchema>;
export function agentConfig() {
  return {
    enabled: process.env.ACTIONMOTION_AGENT_ENABLED !== "false",
    mode: process.env.ACTIONMOTION_AGENT_MODE === "AUTO" ? "AUTO" : "SEMI_AUTO",
    requireApproval: process.env.ACTIONMOTION_REQUIRE_APPROVAL !== "false",
    externalPaidCalls: process.env.ACTIONMOTION_EXTERNAL_PAID_CALLS === "true",
  };
}
export function publicAgentJob(job: AgentJob) {
  const { snapshot, ownerPid, ownerStartedAt, requestKey, ...view } = job;
  void snapshot;
  void ownerPid;
  void ownerStartedAt;
  void requestKey;
  return view;
}
