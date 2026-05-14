export interface EvalReport {
  header: string[];
  body: unknown[][];
}

export interface JobReport {
  jobId: string;
  jobTitle: string;
  report: EvalReport;
}

export interface LeaderboardCell {
  mean: number;
  stddev: number;
  count: number;
}

export interface LeaderboardRow {
  jobId: string;
  jobTitle: string;
  cells: Record<string, LeaderboardCell>;
  wins: number;
}

export interface LeaderboardTable {
  rows: LeaderboardRow[];
  metricColumns: string[];
  categoryColumn: string | null;
  droppedColumns: string[];
  incompatibleJobIds: string[];
}

const NUMERIC_FRACTION_THRESHOLD = 0.5;

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function isNumericLike(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') {
    if (value.trim() === '') return false;
    const parsed = parseFloat(value);
    return !Number.isNaN(parsed) && Number.isFinite(parsed);
  }
  return false;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function findScoreColumn(header: string[]): number {
  return header.findIndex((col) => normalize(col) === 'score');
}

export function findCategoryColumn(header: string[]): number {
  const candidates = ['metric', 'task', 'subject', 'category', 'type', 'name'];
  for (const candidate of candidates) {
    const idx = header.findIndex((col) => normalize(col) === candidate);
    if (idx >= 0) return idx;
  }
  return 0;
}

export function detectNumericColumns(report: EvalReport): number[] {
  const { header, body } = report;
  if (body.length === 0) return [];
  const numericCounts = new Array(header.length).fill(0);
  body.forEach((row) => {
    header.forEach((_, colIdx) => {
      if (isNumericLike(row[colIdx])) {
        numericCounts[colIdx] += 1;
      }
    });
  });
  return header
    .map((_, idx) => idx)
    .filter(
      (idx) => numericCounts[idx] / body.length >= NUMERIC_FRACTION_THRESHOLD,
    );
}

export function intersectHeaders(reports: EvalReport[]): {
  common: string[];
  dropped: string[];
} {
  if (reports.length === 0) return { common: [], dropped: [] };
  const firstHeader = reports[0].header;
  const allHeaders = reports.map((r) => new Set(r.header.map(normalize)));
  const common: string[] = [];
  const dropped: string[] = [];
  firstHeader.forEach((col) => {
    const key = normalize(col);
    if (allHeaders.every((s) => s.has(key))) {
      common.push(col);
    } else {
      dropped.push(col);
    }
  });
  reports.slice(1).forEach((r) => {
    r.header.forEach((col) => {
      const key = normalize(col);
      const alreadyDropped = dropped.some((d) => normalize(d) === key);
      const alreadyCommon = common.some((c) => normalize(c) === key);
      if (!alreadyCommon && !alreadyDropped) dropped.push(col);
    });
  });
  return { common, dropped };
}

function colIndexByName(header: string[], name: string): number {
  const target = normalize(name);
  return header.findIndex((c) => normalize(c) === target);
}

function aggregateCell(
  report: EvalReport,
  metricColIdx: number,
  rowFilter?: { col: number; value: string },
): LeaderboardCell {
  const values: number[] = [];
  report.body.forEach((row) => {
    if (rowFilter) {
      if (String(row[rowFilter.col] ?? '') !== rowFilter.value) return;
    }
    const n = toNumber(row[metricColIdx]);
    if (n !== null) values.push(n);
  });
  if (values.length === 0) {
    return { mean: NaN, stddev: NaN, count: 0 };
  }
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return {
    mean: Number(mean.toFixed(4)),
    stddev: Number(Math.sqrt(variance).toFixed(4)),
    count: values.length,
  };
}

export interface BuildLeaderboardOptions {
  /**
   * If provided, only these metric column names (case-insensitive) are used.
   * Otherwise, falls back to "score" if present in every report, else to
   * the intersection of auto-detected numeric columns.
   */
  metricColumns?: string[];
  /**
   * Column name to treat as the row label inside each report (e.g. "metric",
   * "task"). Used both for filtering and breakdown reports.
   */
  categoryColumn?: string;
}

export function buildLeaderboard(
  jobReports: JobReport[],
  options: BuildLeaderboardOptions = {},
): LeaderboardTable {
  const validReports = jobReports.filter((j) => j.report.header.length > 0);
  if (validReports.length === 0) {
    return {
      rows: [],
      metricColumns: [],
      categoryColumn: null,
      droppedColumns: [],
      incompatibleJobIds: [],
    };
  }

  const { common, dropped } = intersectHeaders(
    validReports.map((j) => j.report),
  );

  let metricNames: string[];
  if (options.metricColumns && options.metricColumns.length > 0) {
    metricNames = options.metricColumns.filter((name) =>
      common.some((c) => normalize(c) === normalize(name)),
    );
  } else {
    const scoreInCommon = common.find((c) => normalize(c) === 'score');
    if (scoreInCommon) {
      metricNames = [scoreInCommon];
    } else {
      const perReportNumeric = validReports.map(
        (j) =>
          new Set(
            detectNumericColumns(j.report).map((idx) =>
              normalize(j.report.header[idx]),
            ),
          ),
      );
      metricNames = common.filter((c) =>
        perReportNumeric.every((s) => s.has(normalize(c))),
      );
    }
  }

  const categoryName =
    options.categoryColumn ??
    common.find(
      (c) =>
        !metricNames.some((m) => normalize(m) === normalize(c)) &&
        ['metric', 'task', 'subject', 'category', 'type', 'name'].includes(
          normalize(c),
        ),
    ) ??
    null;

  const rows: LeaderboardRow[] = validReports.map((j) => {
    const cells: Record<string, LeaderboardCell> = {};
    metricNames.forEach((metric) => {
      const colIdx = colIndexByName(j.report.header, metric);
      if (colIdx < 0) {
        cells[metric] = { mean: NaN, stddev: NaN, count: 0 };
      } else {
        cells[metric] = aggregateCell(j.report, colIdx);
      }
    });
    return {
      jobId: j.jobId,
      jobTitle: j.jobTitle,
      cells,
      wins: 0,
    };
  });

  metricNames.forEach((metric) => {
    let best = -Infinity;
    rows.forEach((r) => {
      const v = r.cells[metric]?.mean;
      if (Number.isFinite(v) && v > best) best = v;
    });
    if (Number.isFinite(best)) {
      rows.forEach((r) => {
        if (r.cells[metric]?.mean === best) r.wins += 1;
      });
    }
  });

  return {
    rows,
    metricColumns: metricNames,
    categoryColumn: categoryName,
    droppedColumns: dropped,
    incompatibleJobIds: jobReports
      .filter((j) => j.report.header.length === 0)
      .map((j) => j.jobId),
  };
}

export interface CategoryBreakdownRow {
  category: string;
  cells: Record<string, Record<string, number>>;
}

export function buildCategoryBreakdown(
  jobReports: JobReport[],
  metric: string,
  categoryColumn: string,
): CategoryBreakdownRow[] {
  const categories = new Set<string>();
  jobReports.forEach((j) => {
    const catIdx = colIndexByName(j.report.header, categoryColumn);
    if (catIdx < 0) return;
    j.report.body.forEach((row) => {
      categories.add(String(row[catIdx] ?? ''));
    });
  });
  const result: CategoryBreakdownRow[] = [];
  Array.from(categories)
    .sort()
    .forEach((cat) => {
      const cells: Record<string, Record<string, number>> = {};
      jobReports.forEach((j) => {
        const catIdx = colIndexByName(j.report.header, categoryColumn);
        const metricIdx = colIndexByName(j.report.header, metric);
        if (catIdx < 0 || metricIdx < 0) return;
        const agg = aggregateCell(j.report, metricIdx, {
          col: catIdx,
          value: cat,
        });
        cells[j.jobId] = { mean: agg.mean, count: agg.count };
      });
      result.push({ category: cat, cells });
    });
  return result;
}

export function toMarkdownReport(
  table: LeaderboardTable,
  breakdowns: { metric: string; rows: CategoryBreakdownRow[] }[],
  jobLookup: Record<string, string>,
): string {
  const lines: string[] = [];
  lines.push('# Evaluation Leaderboard\n');
  lines.push(`_Generated ${new Date().toISOString()}_\n`);
  if (table.droppedColumns.length > 0) {
    lines.push(
      `> Columns dropped (not present in every job): ${table.droppedColumns.join(', ')}\n`,
    );
  }

  lines.push('## Summary\n');
  const header = ['Model', ...table.metricColumns, 'Wins'];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);
  table.rows.forEach((r) => {
    const cells = table.metricColumns.map((m) => {
      const c = r.cells[m];
      if (!c || !Number.isFinite(c.mean)) return '—';
      return c.stddev > 0
        ? `${c.mean.toFixed(3)} ± ${c.stddev.toFixed(3)}`
        : c.mean.toFixed(3);
    });
    lines.push(`| ${[r.jobTitle, ...cells, String(r.wins)].join(' | ')} |`);
  });
  lines.push('');

  if (breakdowns.length > 0 && table.categoryColumn) {
    lines.push(`## Per-${table.categoryColumn} breakdown\n`);
    breakdowns.forEach(({ metric, rows }) => {
      lines.push(`### ${metric}\n`);
      const jobIds = table.rows.map((r) => r.jobId);
      const titles = jobIds.map((id) => jobLookup[id] ?? id);
      lines.push(`| ${[table.categoryColumn, ...titles].join(' | ')} |`);
      lines.push(
        `| ${[table.categoryColumn, ...titles].map(() => '---').join(' | ')} |`,
      );
      rows.forEach((row) => {
        const cells = jobIds.map((id) => {
          const cell = row.cells[id];
          if (!cell || !Number.isFinite(cell.mean)) return '—';
          return cell.mean.toFixed(3);
        });
        lines.push(`| ${[row.category, ...cells].join(' | ')} |`);
      });
      lines.push('');
    });
  }

  return lines.join('\n');
}

export function toCsv(table: LeaderboardTable): string {
  const header = ['model', ...table.metricColumns, 'wins'];
  const escape = (s: string) =>
    /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lines = [header.map(escape).join(',')];
  table.rows.forEach((r) => {
    const cells = table.metricColumns.map((m) => {
      const c = r.cells[m];
      return c && Number.isFinite(c.mean) ? String(c.mean) : '';
    });
    lines.push([r.jobTitle, ...cells, String(r.wins)].map(escape).join(','));
  });
  return lines.join('\n');
}
