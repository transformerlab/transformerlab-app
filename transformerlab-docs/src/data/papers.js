// @ts-check
//
// papers.js — the single source of truth for the /papers page.
//
// To add a paper:
//   1. Drop the PDF into  static/papers/<file>.pdf
//   2. Add one entry to the `papers` array below.
//
// Per-paper pages at /papers/<slug> are generated automatically at build time
// (see the `papersPlugin` in docusaurus.config.js). The list page lives in
// src/pages/papers.tsx. This file is plain JS (not .ts) so the build-time
// plugin can `require()` it from the CommonJS config.

/**
 * @typedef {Object} Paper
 * @property {string} slug      URL slug -> /papers/<slug> (keep short, stable, unique)
 * @property {string} title     Full paper title
 * @property {string[]} authors Author names, in order
 * @property {string} date      "YYYY-MM" or "YYYY-MM-DD"; used to sort newest-first
 * @property {string} abstract  Abstract text
 * @property {string} pdf       Filename in static/papers/, e.g. "my-paper.pdf"
 */

/** @type {Paper[]} */
const papers = [
  {
    slug: 'example-paper',
    title: 'An Example Transformer Lab Paper',
    authors: ['Jane Researcher', 'John Scientist'],
    date: '2026-06',
    abstract:
      'This is a placeholder entry so the Papers page renders end-to-end. ' +
      'Replace it with a real paper: drop the PDF into static/papers/ and ' +
      'update this entry with the real title, authors, date, abstract, and ' +
      'PDF filename. The abstract can be as long as you like — it is shown in ' +
      'full on the paper’s own page and truncated on the list page.',
    pdf: 'example-paper.pdf',
  },
];

module.exports = { papers };
