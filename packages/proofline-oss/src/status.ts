export const prooflineStatusTones = [
  "neutral",
  "success",
  "info",
  "review",
  "warning",
  "danger",
  "blocked",
] as const;

export type ProoflineStatusTone = (typeof prooflineStatusTones)[number];

export const prooflineStatusLabels: Record<ProoflineStatusTone, string> = {
  neutral: "Not started",
  success: "Passed",
  info: "In progress",
  review: "Needs review",
  warning: "Attention required",
  danger: "Failed",
  blocked: "Blocked",
};
