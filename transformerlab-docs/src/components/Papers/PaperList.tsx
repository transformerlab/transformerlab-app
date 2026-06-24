import React, { useMemo, useState } from 'react';
import Link from '@docusaurus/Link';
import { type Paper, sortByDateDesc, formatDate } from './types';
import styles from './papers.module.css';

const ABSTRACT_PREVIEW_CHARS = 280;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

/** Unique tags across all papers, ordered by frequency (desc) then name. */
function collectTags(papers: Paper[]): string[] {
  const counts = new Map<string, number>();
  for (const paper of papers) {
    for (const tag of paper.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.keys()].sort((a, b) => {
    const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}

function matchesQuery(paper: Paper, query: string): boolean {
  const haystack = [
    paper.title,
    paper.authors.join(' '),
    paper.abstract,
    (paper.tags ?? []).join(' '),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export default function PaperList({
  papers,
}: {
  papers: Paper[];
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const allTags = useMemo(() => collectTags(papers), [papers]);

  const toggleTag = (tag: string): void => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const clearFilters = (): void => {
    setQuery('');
    setActiveTags([]);
  };

  const trimmedQuery = query.trim().toLowerCase();
  const isFiltering = trimmedQuery !== '' || activeTags.length > 0;

  const visible = useMemo(() => {
    const filtered = papers.filter((paper) => {
      if (trimmedQuery && !matchesQuery(paper, trimmedQuery)) return false;
      if (
        activeTags.length > 0 &&
        !activeTags.some((tag) => paper.tags?.includes(tag))
      ) {
        return false;
      }
      return true;
    });
    return sortByDateDesc(filtered);
  }, [papers, trimmedQuery, activeTags]);

  if (papers.length === 0) {
    return <p className={styles.empty}>No papers yet — check back soon.</p>;
  }

  return (
    <div className={styles.list}>
      <div className={styles.controls}>
        <input
          type="search"
          className={styles.search}
          placeholder="Search papers…"
          aria-label="Search papers"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {allTags.length > 0 && (
          <div className={styles.tagFilters}>
            {allTags.map((tag) => {
              const active = activeTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  className={
                    active
                      ? `${styles.tagChip} ${styles.tagChipActive}`
                      : styles.tagChip
                  }
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}
        <p className={styles.count}>
          {isFiltering
            ? `Showing ${visible.length} of ${papers.length} papers`
            : `${papers.length} papers`}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>
          No papers match your filters.{' '}
          <button
            type="button"
            className={styles.clearFilters}
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </p>
      ) : (
        visible.map((paper) => (
          <Link
            key={paper.slug}
            to={`/papers/${paper.slug}`}
            className={styles.card}
          >
            <h2 className={styles.cardTitle}>{paper.title}</h2>
            <p className={styles.meta}>
              <span className={styles.authors}>{paper.authors.join(', ')}</span>
              <span className={styles.dot}>·</span>
              <span>{formatDate(paper.date)}</span>
              {paper.tags?.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </p>
            <p className={styles.abstract}>
              {truncate(paper.abstract, ABSTRACT_PREVIEW_CHARS)}
            </p>
          </Link>
        ))
      )}
    </div>
  );
}
