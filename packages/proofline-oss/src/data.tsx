import { ChevronLeft, ChevronRight, Filter, Search } from "lucide-react";
import type { ReactNode } from "react";
import { ProoflineIconButton } from "./actions";
import { ProoflineInput, ProoflineSelect } from "./forms";
import { classes } from "./utils";

export type ProoflineColumn<Row> = {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  align?: "start" | "center" | "end";
};

export function ProoflineDataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  empty = "No data available.",
  className,
}: {
  caption: string;
  columns: Array<ProoflineColumn<Row>>;
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <div className={classes("pl-table-wrap", className)}>
      <table className="pl-data-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" style={{ textAlign: column.align }}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => (
                <td key={column.key} style={{ textAlign: column.align }}>{column.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <div className="pl-table-empty">{empty}</div> : null}
    </div>
  );
}

export function ProoflineFilterBar({
  query,
  onQueryChange,
  placeholder = "Search",
  children,
  className,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div aria-label="Filters" className={classes("pl-filter-bar", className)} role="search">
      <label className="pl-filter-bar__search">
        <Search aria-hidden="true" size={16} />
        <span className="pl-visually-hidden">{placeholder}</span>
        <ProoflineInput
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder={placeholder}
          type="search"
          value={query}
        />
      </label>
      {children}
      <Filter aria-hidden="true" className="pl-filter-bar__icon" size={16} />
    </div>
  );
}

export function ProoflineSavedViewControl({
  label = "Saved view",
  value,
  views,
  onChange,
}: {
  label?: string;
  value: string;
  views: Array<{ id: string; label: string }>;
  onChange: (id: string) => void;
}) {
  return (
    <label className="pl-saved-view">
      <span>{label}</span>
      <ProoflineSelect value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {views.map((view) => <option key={view.id} value={view.id}>{view.label}</option>)}
      </ProoflineSelect>
    </label>
  );
}

export function ProoflinePagination({
  page,
  pageCount,
  onPageChange,
  label = "Pagination",
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  return (
    <nav aria-label={label} className="pl-pagination">
      <ProoflineIconButton
        disabled={page <= 1}
        label="Previous page"
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft aria-hidden="true" size={18} />
      </ProoflineIconButton>
      <span aria-live="polite">Page {page} of {pageCount}</span>
      <ProoflineIconButton
        disabled={page >= pageCount}
        label="Next page"
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight aria-hidden="true" size={18} />
      </ProoflineIconButton>
    </nav>
  );
}
