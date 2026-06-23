// TypeScript view of a paper entry. The runtime data lives in
// src/data/papers.js (plain JS so the build-time route plugin can require it);
// this interface mirrors that file's JSDoc `Paper` typedef for the .tsx
// components.

export interface Paper {
  slug: string;
  title: string;
  authors: string[];
  date: string; // "YYYY-MM" or "YYYY-MM-DD"
  abstract: string;
  pdf: string; // filename in static/papers/ ("" if not uploaded yet)
  tags?: string[]; // optional modality labels, e.g. ["3D", "LLM"]
}

/** Sort papers newest-first by `date` (string compare works for ISO-ish dates). */
export function sortByDateDesc(papers: Paper[]): Paper[] {
  return [...papers].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
}

/** Format a "YYYY-MM" or "YYYY-MM-DD" date as a human-readable string. */
export function formatDate(date: string): string {
  const [year, month, day] = date.split('-');
  if (!month) return year;
  const monthName = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ][Number(month) - 1];
  if (!monthName) return year;
  return day ? `${monthName} ${Number(day)}, ${year}` : `${monthName} ${year}`;
}

/** Public URL of a paper's hosted PDF (served from static/papers/). */
export function pdfUrl(paper: Paper): string {
  return `/papers/${paper.pdf}`;
}
