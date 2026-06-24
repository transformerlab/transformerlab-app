import React from 'react';
import Layout from '@theme/Layout';
import PaperDetail from './PaperDetail';
import { type Paper } from './types';
import styles from './papers.module.css';

// Route component for /papers/<slug>. The `paper` prop is injected by the
// `papersPlugin` in docusaurus.config.js via the route's `modules`.
export default function PaperDetailPage({
  paper,
}: {
  paper: Paper;
}): JSX.Element {
  return (
    <Layout title={paper.title} description={paper.abstract.slice(0, 160)}>
      <main className={styles.page}>
        <PaperDetail paper={paper} />
      </main>
    </Layout>
  );
}
