import React from 'react';
import Layout from '@theme/Layout';
import papersData from '@site/src/data/papers.json';
import PaperList from '@site/src/components/Papers/PaperList';
import { type Paper } from '@site/src/components/Papers/types';
import styles from '@site/src/components/Papers/papers.module.css';

// Papers are authored in src/data/papers.json (the single source of truth,
// also read by the build-time route plugin in docusaurus.config.js).
const papers = papersData as Paper[];

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
