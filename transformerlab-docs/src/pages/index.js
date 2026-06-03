import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './index.module.css';
import Content from './homepage-components/homepage-content.mdx';
import AllFeatures from './homepage-components/AllFeatures';
import './style.css';
import GithubStar from '../components/GithubStar';
import BigWhy from './homepage-components/bigwhy.mdx';
import CloudVSLocalPage from './homepage-components/cloudvslocal.jsx';
import UserValidation from './homepage-components/uservalidation.jsx';
import { FaArrowRight } from 'react-icons/fa';

function HomepageHeader() {
  const [rotation, setRotation] = useState(0);

  // Configurable constants
  const rotationSpeed = 0.03; // Degrees per frame
  const rotationPoint = '50% 50%'; // Point of rotation

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((prev) => (prev + rotationSpeed) % 360);
    }, 16); // ~60 FPS
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container homepage">
      <div className="row" style={{ paddingTop: '1.5rem' }}>
        <div className="col col--4">
          <div
            id="milkyway-outer-container"
            style={{
              display: 'flex',
              alignItems: 'center',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            <div
              id="milkyway-container"
              style={{
                display: 'flex',
                alignItems: 'center',
                mask: 'url(/img/logo2.svg) no-repeat center / contain',
                overflow: 'none',
              }}
            >
              <div
                style={{
                  backgroundColor: 'black',
                }}
              >
                <img
                  src="/img/milkyway.webp"
                  alt=""
                  style={{
                    maxWidth: 'none',
                    objectFit: 'none',
                    opacity: 1,
                    translate: '-800px -10%',
                    transformOrigin: rotationPoint, // Set rotation point
                    transform: `rotate(${rotation}deg)`, // Apply rotation
                    xborder: '15px solid red',
                  }}
                ></img>
              </div>
            </div>
          </div>
        </div>
        <div className="col col--8">
          <h1 className={clsx('hero__title', styles.hero__title)}>
            We're here for the <span style={{ color: '#666' }}>Era of Research</span>
          </h1>
          <h2 className={clsx('hero__subtitle', styles.hero__subtitle)}>
            Transformer Lab is a Machine Learning Research Platform designed for frontier AI/ML workflows. Works seamlessly with agents. Local, on-prem, or in the cloud. Open source.
          </h2>
          <div
            className={styles.buttons}
            style={{ gap: '1.5rem', display: 'flex', flexWrap: 'wrap' }}
          >
            <div className="block">
              <a
                href="/get-started"
                className="button button--primary button--lg"
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  width: 'fit-content',
                  border: '2px solid var(--ifm-color-primary)',
                }}
              >
                Get Started &nbsp;
                <FaArrowRight />
              </a>
            </div>
            <div className="block">
              <a
                href="/for-teams/install"
                className="button button--secondary button--lg"
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  width: 'fit-content',
                  border: '2px solid var(--ifm-color-primary)',
                }}
              >
                Self Install &nbsp;
                <FaArrowRight />
              </a>
            </div>
          </div>
        </div>
      </div>
      <div className="row">
        <div className="col col--12">
          <div className="spacer" />

          <video
            src="https://gallery.transformerlab.net/transformerlab-for-teams-video01.mp4"
            className={clsx('video_container', styles.video_container)}
            autoPlay
            muted
            loop
            playsInline
            style={{ width: '100%' }}
          />
        </div>
      </div>
      <div className="row">
        <div className="col col--12">
          <section className={styles.bigWhy}>
            <BigWhy />
          </section>
        </div>
      </div>
      <AllFeatures />
      <UserValidation />
    </div>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`Hello from ${siteConfig.title}`}
      description="Documentation for Transformer Lab, the open source platform for AI/ML researchers."
    >
      <HomepageHeader />
      <main>
        <div className="container"></div>
      </main>
    </Layout>
  );
}
