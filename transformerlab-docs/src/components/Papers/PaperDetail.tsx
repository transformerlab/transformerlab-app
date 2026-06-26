import React, { useMemo, useState } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { type Paper, formatDate, pdfUrl, toBibtex } from './types';
import styles from './papers.module.css';

export default function PaperDetail({ paper }: { paper: Paper }): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  const url = paper.pdf ? pdfUrl(paper) : '';

  const bibtex = useMemo(
    () => toBibtex(paper, siteConfig.url),
    [paper, siteConfig.url],
  );
  const [showBibtex, setShowBibtex] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyBibtex = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(bibtex);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context); the user can still
      // select the text manually.
    }
  };

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
        {paper.tags?.map((tag) => (
          <span key={tag} className={styles.tag}>
            {tag}
          </span>
        ))}
      </p>
      <p className={styles.detailAbstract}>{paper.abstract}</p>

      <div className={styles.actions}>
        {url && (
          <a className={styles.download} href={url} download>
            Download PDF ↓
          </a>
        )}
        <button
          type="button"
          className={styles.cite}
          aria-expanded={showBibtex}
          onClick={() => setShowBibtex((prev) => !prev)}
        >
          Cite (BibTeX)
        </button>
      </div>

      {showBibtex && (
        <div className={styles.bibtexBlock}>
          <button type="button" className={styles.copyBtn} onClick={copyBibtex}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <pre className={styles.bibtexPre}>{bibtex}</pre>
        </div>
      )}

      {url ? (
        // <object> renders the browser's native PDF viewer (an <iframe>
        // with a sandbox would block it) and degrades to the link below.
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
      ) : (
        <p className={styles.pending}>📄 PDF coming soon.</p>
      )}
    </div>
  );
}
