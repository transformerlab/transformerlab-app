// TypeScript view of a paper entry. The runtime data lives in
// src/data/papers.json (the single source of truth); this interface describes
// the shape of each entry in that file for the .tsx components.

export interface Paper {
  slug: string;
  title: string;
  authors: string[];
  date: string; // "YYYY-MM" or "YYYY-MM-DD"
  abstract: string;
  pdf: string; // filename in static/papers/ ("" if not uploaded yet)
  tags?: string[]; // optional modality labels, e.g. ["3D", "LLM"]
  bibtex?: string; // optional verbatim BibTeX; auto-generated when absent
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

const BIBTEX_MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

/** Build a BibTeX citation key from the first author's last name + year. */
function bibtexKey(paper: Paper): string {
  const [year] = paper.date.split('-');
  const firstAuthor = paper.authors[0];
  if (!firstAuthor) return paper.slug;
  const lastName = firstAuthor.trim().split(/\s+/).pop() ?? '';
  const normalized = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized ? `${normalized}${year}` : paper.slug;
}

/**
 * BibTeX for a paper. Returns `paper.bibtex` verbatim when present; otherwise
 * generates a `@misc` entry from the available fields. `siteUrl` is the site's
 * canonical origin (from Docusaurus `siteConfig.url`) used to build the paper's
 * public URL.
 */
export function toBibtex(paper: Paper, siteUrl: string): string {
  if (paper.bibtex) return paper.bibtex;

  const [year, month] = paper.date.split('-');
  const url = `${siteUrl.replace(/\/$/, '')}/papers/${paper.slug}`;
  const fields: [string, string][] = [
    ['author', paper.authors.join(' and ')],
    ['title', paper.title],
    ['year', year],
  ];
  const monthName = month ? BIBTEX_MONTHS[Number(month) - 1] : undefined;
  if (monthName) fields.push(['month', monthName]);
  fields.push(['howpublished', `\\url{${url}}`]);
  fields.push(['note', 'Transformer Lab']);

  const body = fields
    .map(([key, value]) => `  ${key.padEnd(12)} = {${value}}`)
    .join(',\n');
  return `@misc{${bibtexKey(paper)},\n${body}\n}`;
}
