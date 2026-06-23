import React from 'react';
import Link from '@docusaurus/Link';
import { type Paper, formatDate, pdfUrl } from './types';
import styles from './papers.module.css';

export default function PaperDetail({ paper }: { paper: Paper }): JSX.Element {
  const url = pdfUrl(paper);
  return (
    <div className={styles.detail}>
      <Link to="/papers" className={styles.back}>
        ← All papers
      </Link>
      <h1>{paper.title}</h1>
      <p className={styles.meta}>
        <span className={styles.authors}>{paper.authors.join(', ')}</span>
        <span className={styles.dot}>·</span>
        <span>{formatDate(paper.date)}</span>
      </p>
      <p className={styles.detailAbstract}>{paper.abstract}</p>
      <div className={styles.actions}>
        <a className={styles.download} href={url} download>
          Download PDF ↓
        </a>
      </div>
      <iframe className={styles.pdfFrame} src={url} title={paper.title} />
    </div>
  );
}
