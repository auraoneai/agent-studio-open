import {
  Bot,
  FileCheck2,
  GitBranch,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

export type AuraOneMarkProps = {
  className?: string;
  size?: number;
  theme?: "light" | "dark";
  title?: string;
};

export function AuraOneMark({
  className,
  size = 32,
  theme = "light",
  title,
}: AuraOneMarkProps) {
  const labelled = Boolean(title);
  return (
    <svg
      aria-hidden={labelled ? undefined : true}
      aria-label={title}
      className={className}
      focusable="false"
      height={size}
      role={labelled ? "img" : undefined}
      style={{ "--pl-mark-size": `${size}px` } as CSSProperties}
      viewBox="0 0 64 64"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <g transform="translate(8 6) scale(.62)">
        <path d="M0 0H46L64 18V28H45L29 12H0V0Z" fill={theme === "dark" ? "#e18aa2" : "#a33955"} />
        <path d="M0 19H42L64 36V46H44L27 31H0V19Z" fill={theme === "dark" ? "#a49ef6" : "#4f46c6"} />
        <path d="M0 38H42L64 54V64H44L27 50H0V38Z" fill={theme === "dark" ? "#6daedb" : "#1769a6"} />
        <path d="M0 57H46L64 72V82H45L29 69H0V57Z" fill={theme === "dark" ? "#64baa2" : "#14785f"} />
        <path d="M64 0H77V82H64V0Z" fill={theme === "dark" ? "#f7fafc" : "#101820"} />
        <path d="M68 10H73V72H68V10Z" fill={theme === "dark" ? "#7bd2d5" : "#007582"} />
      </g>
    </svg>
  );
}

export type ProoflineProduct =
  | "rubric-studio"
  | "agent-studio"
  | "robotics-studio"
  | "evalkit"
  | "trust-toolkit";

export const prooflineProductIcons: Record<ProoflineProduct, LucideIcon> = {
  "rubric-studio": ListChecks,
  "agent-studio": GitBranch,
  "robotics-studio": Bot,
  evalkit: FileCheck2,
  "trust-toolkit": FileCheck2,
};

export function ProoflineProductGlyph({
  product,
  size = 18,
  title,
}: {
  product: ProoflineProduct;
  size?: number;
  title?: string;
}) {
  const Icon = prooflineProductIcons[product];
  return <Icon aria-label={title} aria-hidden={title ? undefined : true} size={size} />;
}
