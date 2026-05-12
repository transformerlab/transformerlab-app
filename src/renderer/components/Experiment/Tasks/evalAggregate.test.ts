import {
  buildCategoryBreakdown,
  buildLeaderboard,
  detectNumericColumns,
  intersectHeaders,
  toCsv,
  toMarkdownReport,
  type EvalReport,
  type JobReport,
} from './evalAggregate';

const reportA: EvalReport = {
  header: ['metric', 'score'],
  body: [
    ['mmlu', 0.6],
    ['gsm8k', 0.42],
    ['humaneval', 0.29],
  ],
};

const reportB: EvalReport = {
  header: ['metric', 'score'],
  body: [
    ['mmlu', 0.66],
    ['gsm8k', 0.55],
    ['humaneval', 0.38],
  ],
};

const reportC: EvalReport = {
  // includes an extra column "notes" not present in A/B
  header: ['metric', 'score', 'notes'],
  body: [
    ['mmlu', 0.58, 'baseline'],
    ['gsm8k', 0.38, ''],
    ['humaneval', 0.27, ''],
  ],
};

const jobA: JobReport = { jobId: 'a', jobTitle: 'sft-llama', report: reportA };
const jobB: JobReport = { jobId: 'b', jobTitle: 'sft-qwen', report: reportB };
const jobC: JobReport = { jobId: 'c', jobTitle: 'baseline', report: reportC };

describe('intersectHeaders', () => {
  it('returns common header columns across reports', () => {
    const { common, dropped } = intersectHeaders([reportA, reportB, reportC]);
    expect(common).toEqual(['metric', 'score']);
    expect(dropped).toEqual(['notes']);
  });

  it('is case-insensitive', () => {
    const r1: EvalReport = { header: ['Metric', 'Score'], body: [] };
    const r2: EvalReport = { header: ['metric', 'score'], body: [] };
    const { common } = intersectHeaders([r1, r2]);
    expect(common).toHaveLength(2);
  });

  it('returns empty common when reports share no columns', () => {
    const r1: EvalReport = { header: ['a'], body: [] };
    const r2: EvalReport = { header: ['b'], body: [] };
    const { common, dropped } = intersectHeaders([r1, r2]);
    expect(common).toEqual([]);
    expect(dropped.sort()).toEqual(['a', 'b']);
  });
});

describe('detectNumericColumns', () => {
  it('detects mostly-numeric columns and skips string columns', () => {
    const cols = detectNumericColumns(reportC);
    expect(cols).toEqual([1]);
  });
});

describe('buildLeaderboard', () => {
  it('builds rows with score column when present', () => {
    const lb = buildLeaderboard([jobA, jobB, jobC]);
    expect(lb.metricColumns).toEqual(['score']);
    expect(lb.rows).toHaveLength(3);
    expect(lb.rows.find((r) => r.jobId === 'a')!.cells.score.mean).toBeCloseTo(
      (0.6 + 0.42 + 0.29) / 3,
      3,
    );
  });

  it('marks the per-metric winner with a win', () => {
    const lb = buildLeaderboard([jobA, jobB, jobC]);
    const winner = lb.rows.find((r) => r.wins > 0);
    expect(winner!.jobId).toBe('b');
    expect(winner!.wins).toBe(1);
  });

  it('drops columns not present in every report', () => {
    const lb = buildLeaderboard([jobA, jobC]);
    expect(lb.droppedColumns).toContain('notes');
  });

  it('falls back to auto-detected numeric columns when no score column exists', () => {
    const r1: EvalReport = {
      header: ['task', 'accuracy', 'f1'],
      body: [
        ['a', 0.5, 0.4],
        ['b', 0.6, 0.55],
      ],
    };
    const r2: EvalReport = {
      header: ['task', 'accuracy', 'f1'],
      body: [
        ['a', 0.55, 0.5],
        ['b', 0.62, 0.6],
      ],
    };
    const lb = buildLeaderboard([
      { jobId: 'x', jobTitle: 'X', report: r1 },
      { jobId: 'y', jobTitle: 'Y', report: r2 },
    ]);
    expect(lb.metricColumns).toEqual(['accuracy', 'f1']);
  });

  it('handles empty input', () => {
    const lb = buildLeaderboard([]);
    expect(lb.rows).toEqual([]);
    expect(lb.metricColumns).toEqual([]);
  });

  it('respects explicit metricColumns option', () => {
    const lb = buildLeaderboard([jobA, jobB], { metricColumns: ['score'] });
    expect(lb.metricColumns).toEqual(['score']);
  });
});

describe('buildCategoryBreakdown', () => {
  it('produces one row per category with per-job means', () => {
    const rows = buildCategoryBreakdown([jobA, jobB], 'score', 'metric');
    const mmlu = rows.find((r) => r.category === 'mmlu')!;
    expect(mmlu.cells.a.mean).toBeCloseTo(0.6, 3);
    expect(mmlu.cells.b.mean).toBeCloseTo(0.66, 3);
  });
});

describe('toMarkdownReport', () => {
  it('emits a summary table and per-category breakdowns', () => {
    const lb = buildLeaderboard([jobA, jobB]);
    const md = toMarkdownReport(
      lb,
      lb.categoryColumn
        ? lb.metricColumns.map((m) => ({
            metric: m,
            rows: buildCategoryBreakdown([jobA, jobB], m, lb.categoryColumn!),
          }))
        : [],
      { a: 'sft-llama', b: 'sft-qwen' },
    );
    expect(md).toContain('# Evaluation Leaderboard');
    expect(md).toContain('## Summary');
    expect(md).toContain('sft-llama');
    expect(md).toContain('sft-qwen');
  });
});

describe('toCsv', () => {
  it('emits a header row plus one row per model', () => {
    const lb = buildLeaderboard([jobA, jobB]);
    const csv = toCsv(lb);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('model,score,wins');
    expect(lines).toHaveLength(3);
  });

  it('escapes commas and quotes in titles', () => {
    const jobWeird: JobReport = {
      jobId: 'w',
      jobTitle: 'name, with "quotes"',
      report: reportA,
    };
    const lb = buildLeaderboard([jobWeird]);
    const csv = toCsv(lb);
    expect(csv).toContain('"name, with ""quotes"""');
  });
});
