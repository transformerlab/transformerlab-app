import React from 'react';
import Link from '@docusaurus/Link';
import { type Paper, formatDate, pdfUrl } from './types';
import styles from './papers.module.css';

export default function PaperDetail({ paper }: { paper: Paper }): JSX.Element {
  const url = paper.pdf ? pdfUrl(paper) : '';
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
        {paper.tag && <span className={styles.tag}>{paper.tag}</span>}
      </p>
      <p className={styles.detailAbstract}>{paper.abstract}</p>
      {url ? (
        <>
          <div className={styles.actions}>
            <a className={styles.download} href={url} download>
              Download PDF ↓
            </a>
          </div>
          {/* <object> renders the browser's native PDF viewer (an <iframe>
              with a sandbox would block it) and degrades to the link below. */}
          <object
            className={styles.pdfFrame}
            data={url}
            type="application/pdf"
            aria-label={paper.title}
          >
            <p className={styles.pending}>
              Your browser can’t display the PDF inline.{' '}
              <a href={url} download>
                Download it instead.
              </a>
            </p>
          </object>
        </>
      ) : (
        <p className={styles.pending}>📄 PDF coming soon.</p>
      )}
    </div>
  );
}
