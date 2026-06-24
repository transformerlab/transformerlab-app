import React from 'react';
import Link from '@docusaurus/Link';
import { type Paper, sortByDateDesc, formatDate } from './types';
import styles from './papers.module.css';

const ABSTRACT_PREVIEW_CHARS = 280;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

export default function PaperList({
  papers,
}: {
  papers: Paper[];
}): JSX.Element {
  if (papers.length === 0) {
    return <p className={styles.empty}>No papers yet — check back soon.</p>;
  }

  const sorted = sortByDateDesc(papers);

  return (
    <div className={styles.list}>
      {sorted.map((paper) => (
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
      ))}
    </div>
  );
}
