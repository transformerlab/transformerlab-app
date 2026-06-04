import React from 'react';
import Layout from '@theme/Layout';

export default function GetStarted() {
  return (
    <Layout
      title="Help Getting Started"
      description="Get started with Transformer Lab, the open source platform for AI/ML researchers."
    >
      <main style={{ background: '#191919', padding: '2rem 1rem' }}>
        <div className="container">
          <iframe
            src="https://smart-griffin-2ee.notion.site/ebd//284b42f9f91380798a13fabf0fce687d"
            title="Get Started with Transformer Lab"
            width="100%"
            height="1200"
            frameBorder="0"
            allowFullScreen
            style={{ border: 'none' }}
          />
        </div>
      </main>
    </Layout>
  );
}
