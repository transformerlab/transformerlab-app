import React from 'react';
import Layout from '@theme/Layout';
// @ts-expect-error — papers.js is plain JS (required by the build-time route
// plugin); see src/data/papers.js.
import { papers as rawPapers } from '@site/src/data/papers';
import PaperList from '@site/src/components/Papers/PaperList';
import { type Paper } from '@site/src/components/Papers/types';
import styles from '@site/src/components/Papers/papers.module.css';

const papers = rawPapers as Paper[];

export default function PapersPage(): JSX.Element {
  return (
    <Layout
      title="Papers"
      description="Research papers from Transformer Lab — the open-source platform for AI/ML researchers."
    >
      <main className={styles.page}>
        <header className={styles.header}>
          <h1>Papers</h1>
          <p>Research from the Transformer Lab team.</p>
        </header>
        <PaperList papers={papers} />
      </main>
    </Layout>
  );
}
