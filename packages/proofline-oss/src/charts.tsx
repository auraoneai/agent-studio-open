import type { ReactNode } from "react";
import { clampPercent, classes } from "./utils";

export type ProoflineChartDatum = {
  label: string;
  value: number;
  formattedValue?: string;
  color?: string;
};

export function ProoflineLegend({
  items,
  className,
}: {
  items: Array<{ label: string; color?: string }>;
  className?: string;
}) {
  return (
    <ul aria-label="Legend" className={classes("pl-legend", className)}>
      {items.map((item, index) => (
        <li key={item.label}>
          <span
            aria-hidden="true"
            className="pl-legend__swatch"
            style={{ backgroundColor: item.color ?? `var(--pl-chart-${(index % 8) + 1})` }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function ProoflineChartFrame({
  title,
  description,
  children,
  legend,
  table,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  legend?: ReactNode;
  table: ReactNode;
  className?: string;
}) {
  return (
    <figure className={classes("pl-chart-frame", className)}>
      <figcaption>
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </figcaption>
      <div aria-hidden="true" className="pl-chart-frame__visual">{children}</div>
      {legend}
      <details className="pl-chart-frame__table">
        <summary>View data table</summary>
        {table}
      </details>
    </figure>
  );
}

export function ProoflineBarChart({
  data,
  maxValue,
  className,
}: {
  data: ProoflineChartDatum[];
  maxValue?: number;
  className?: string;
}) {
  const maximum = maxValue ?? Math.max(...data.map((datum) => datum.value), 1);
  return (
    <div className={classes("pl-bar-chart", className)}>
      {data.map((datum, index) => (
        <div className="pl-bar-chart__row" key={datum.label}>
          <span>{datum.label}</span>
          <div>
            <span
              style={{
                backgroundColor: datum.color ?? `var(--pl-chart-${(index % 8) + 1})`,
                width: `${clampPercent((datum.value / maximum) * 100)}%`,
              }}
            />
          </div>
          <strong>{datum.formattedValue ?? datum.value}</strong>
        </div>
      ))}
    </div>
  );
}
