/*
 * The homepage at "/" — a first-class Docusaurus React route (no more static
 * custom-index.html + build-time `cp` hack). It deliberately does NOT use the
 * Docusaurus <Layout> (navbar/footer); it keeps its own Computer-Modern styled
 * running head and footer. The scroll scene is rendered declaratively with
 * Framer Motion (see ./_home/Scene), so nothing manipulates the DOM directly.
 */
import React, { useState, useEffect } from 'react';
import Head from '@docusaurus/Head';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { TypeAnimation } from 'react-type-animation';
import Scene from './_home/Scene';
import { Logo } from './_home/visuals';
import './_home/homepage.css';

function RunningHead(): React.ReactElement {
  // The §1–§4 nav targets live inside the pinned, scroll-transformed scene, so
  // their smooth-scroll handler only works after JS hydrates. Until then we
  // withhold the `#id` href so a pre-hydration click can't trigger the broken
  // native jump into the middle of the pinned scene. (#top / #contact are real
  // document positions, so they keep their href and work even without JS.)
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const scene = (href: string) => (ready ? href : undefined);
  return (
    <div className="head">
      <div className="head-in">
        <a href="#top" className="brand">
          <Logo width={20} height={23} />
          Transformer&nbsp;Lab
        </a>
        <nav>
          <a href={scene('#lab')}>1&nbsp;Research</a>
          <a href={scene('#pubs')}>2&nbsp;Publications</a>
          <a href={scene('#tools')} className="opt">
            3&nbsp;Tooling
          </a>
          <a href={scene('#loop')} className="opt">
            4&nbsp;Why
          </a>
          <a href="#contact">Contact</a>
        </nav>
      </div>
    </div>
  );
}

function Hero(): React.ReactElement {
  return (
    <div className="wrap" id="top">
      <section className="hero">
        <h1>
          Our mission is to accelerate the pace of
          <br />
          <span className="swap grn">
            <BrowserOnly fallback={<span>machine&nbsp;learning.</span>}>
              {() => (
                <TypeAnimation
                  sequence={['machine learning.', 1600, 'intelligence.']}
                  speed={60}
                  cursor
                  repeat={0}
                />
              )}
            </BrowserOnly>
          </span>
        </h1>
        <p className="lead">
          We are working to push the limits at the very forefront of machine
          learning and AI research — through our own research lab, and through
          the tools we build{' '}
          <strong>in partnership with some of the world's best labs.</strong>
        </p>
        <div className="hero-actions">
          <a href="/blog" className="btn primary">
            Read the research →
          </a>
          <a href="/for-teams/" className="btn ghost">
            Explore the tooling
          </a>
        </div>
      </section>
    </div>
  );
}

// §1–§4 + publications + tools: the foreground that scrolls over the papers
function SceneForeground(): React.ReactElement {
  return (
    <>
      {/* §1 THE LAB */}
      <section id="lab">
        <span className="sec-no">§1</span>
        <h2 className="sec">Research</h2>
        <p className="body">
          Transformer&nbsp;Lab is dedicated to exploring the frontier of
          artificial intelligence. We conduct research across diverse domains in
          machine learning and publish our findings in the open.
        </p>
        <p className="body">
          The defining property of the lab is velocity and versatility. We
          pursue diverse challenges across distinct domains of machine learning,
          with a bias toward novelty and a deep love for the technically
          intriguing.
        </p>
      </section>

      {/* §2 PUBLICATIONS */}
      <section id="pubs">
        <span className="sec-no">§2</span>
        <h2 className="sec">Publications</h2>
        <p className="body">Selected results from our lab's recent work.</p>

        <ol className="refs">
          <li className="pub-row">
            <div className="pub-fig" />
            <div className="pub-info">
              Asaria, Salomone, Gandhi.{' '}
              <span className="ti">
                A Cross-Model VLM-Judge Protocol for Single-Image 3D Mesh
                Quality (and Why Cheap Proxies Fall Short).
              </span>{' '}
              <span className="venue">arXiv preprint, Jun 2026.</span>{' '}
              <span className="mod">[3D]</span> &nbsp;
              <a className="url" href="https://arxiv.org/abs/2606.18451">
                arXiv:2606.18451
              </a>
              <div className="ds">
                A standardized evaluation protocol for single-image-to-3D mesh
                generators, using 24-view rendering and position-bias correction
                — and showing that common proxies like CLIP similarity and
                geometry-validity metrics don't substitute for a VLM judge.
              </div>
            </div>
          </li>
          <li className="pub-row">
            <div className="pub-fig" />
            <div className="pub-info">
              Asaria, Salomone, Gandhi.{' '}
              <span className="ti">
                Reliable Neural-Codec Text-to-Speech by ASR Self-Verification
                and Distillation: Near-Zero Catastrophic Failures Across Models
                and Codecs.
              </span>{' '}
              <span className="venue">arXiv preprint, Jun 2026.</span>{' '}
              <span className="mod">[AUDIO]</span> &nbsp;
              <a className="url" href="https://arxiv.org/abs/2606.18323">
                arXiv:2606.18323
              </a>
              <div className="ds">
                ASR-based self-verification drives catastrophic failures
                (silence, early termination, repetition) to near zero in
                autoregressive neural-codec TTS, then distills the behavior for
                inference-time efficiency — generalizing across four TTS systems
                and three codecs.
              </div>
            </div>
          </li>
          <li className="pub-row">
            <div className="pub-fig" />
            <div className="pub-info">
              Asaria, Salomone, Gandhi.{' '}
              <span className="ti">
                Neither Parallel Nor Sequential: How DiffusionGemma Actually
                Commits Tokens.
              </span>{' '}
              <span className="venue">arXiv preprint, Jun 2026.</span>{' '}
              <span className="mod">[LLM]</span> &nbsp;
              <a className="url" href="https://arxiv.org/abs/2606.14620">
                arXiv:2606.14620
              </a>
              <div className="ds">
                A close look at token-commitment patterns in DiffusionGemma 26B.
                Contrary to parallel-decoding marketing, the behavior is neither
                parallel nor block-autoregressive — weak left-to-right bias and
                substantial within-batch ordering ambiguity.
              </div>
            </div>
          </li>
          <li className="pub-row">
            <div className="pub-fig" />
            <div className="pub-info">
              Asaria, Salomone, Gandhi.{' '}
              <span className="ti">
                Realizing Native INT8 Compute for Diffusion Transformers on
                Consumer GPUs: A Fused INT8 GEMM Kernel for Ideogram 4.0.
              </span>{' '}
              <span className="venue">arXiv preprint, Jun 2026.</span>{' '}
              <span className="mod">[SYSTEMS]</span> &nbsp;
              <a className="url" href="https://arxiv.org/abs/2606.14598">
                arXiv:2606.14598
              </a>
              <div className="ds">
                A fused Triton kernel that properly drives the INT8 tensor cores
                on consumer Ampere GPUs — ~1.1× end-to-end speedup, making
                1024px generation feasible on a single RTX 3090.
              </div>
            </div>
          </li>
          <li className="pub-row">
            <div className="pub-fig" />
            <div className="pub-info">
              Gandhi, Asaria, Salomone.{' '}
              <span className="ti">
                Holding the FP8 Quality Ceiling at 8-Bit Weights and
                Activations: INT8 and GGUF Post-Training Quantization of
                Ideogram 4.0 for Consumer GPUs.
              </span>{' '}
              <span className="venue">arXiv preprint, Jun 2026.</span>{' '}
              <span className="mod">[VISION]</span> &nbsp;
              <a className="url" href="https://arxiv.org/abs/2606.12280">
                arXiv:2606.12280
              </a>
              <div className="ds">
                Post-training quantization of Ideogram 4.0 where INT8 W8A8 comes
                out statistically indistinguishable from FP8 on key quality
                metrics, with INT8 and GGUF Q4_K both cutting compute for
                consumer-GPU deployment.
              </div>
            </div>
          </li>
        </ol>

        <p className="body" style={{ marginTop: '2em' }}>
          <a href="/blog" className="url">
            → Read all of our research
          </a>
        </p>
      </section>

      {/* §3 TOOLING */}
      <section id="tools">
        <span className="sec-no">§3</span>
        <h2 className="sec">Research Tooling</h2>
        <p className="body">
          Our lab doesn't just release papers and code, we also partner with the
          world's best labs, across academia and industry, to unlock velocity
          for their researchers <em>(and their researchers' agents)</em>. The
          tools we build are designed to accelerate the entire research loop,
          from planning to publication.
        </p>

        <div className="tools">
          <div className="tool">
            <div className="k">platform</div>
            <h3>Transformer Lab</h3>
            <p>
              The workbench our researchers live in: train, tune, evaluate, and
              inspect models across modalities from one interface.
            </p>
            <div className="meta">open source · self-hostable</div>
          </div>
          <div className="tool">
            <div className="k">orchestration</div>
            <h3>GPU-cluster coordination</h3>
            <p>
              Hundreds of distributed jobs across RunPod, Lambda, AWS, Azure,
              GCP, and in-house hardware — coordinated automatically.
            </p>
            <div className="meta">multi-cloud · autoscaling</div>
          </div>
          <div className="tool">
            <div className="k">announcing soon</div>
            <h3>Intelligence collection</h3>
            <p>
              A new approach to gathering and grounding knowledge — not quite
              ready to reveal. For now we're sharing it only with our closest
              partners.
            </p>
            <div className="meta">stay tuned</div>
          </div>
          <div className="tool">
            <div className="k">announcing soon</div>
            <h3>Intelligence orchestration</h3>
            <p>
              Still under wraps — for now we're sharing it only with our closest
              partners.
            </p>
            <div className="meta">stay tuned</div>
          </div>
        </div>
      </section>

      {/* §4 THE LOOP */}
      <section id="loop">
        <div className="loop-row">
          <div className="loop-text">
            <span className="sec-no">§4</span>
            <h2 className="sec">Research at Maximum Velocity</h2>
            <p className="body">
              Science is, fundamentally, a search algorithm through the infinite
              space of possible truths. Our goal is to transform research from a
              highly manual, sequential bottleneck into a massively parallel
              utility you can dial up, empowering scientists to act as
              conductors of an intellectual orchestra that can discover paths
              previously uncharted.{' '}
              <em style={{ color: 'var(--green-d)' }}>
                Let's discover the unknown together!
              </em>
            </p>
          </div>
          <div className="loop-fig" aria-hidden="true" />
        </div>
      </section>
    </>
  );
}

function Footer(): React.ReactElement {
  return (
    <footer id="contact">
      <div className="wrap f-in">
        <div>
          <span className="brand">
            <Logo width={20} height={23} />
            Transformer&nbsp;Lab
          </span>
          <h2>Explore. Discover. Faster.</h2>
        </div>
        <div className="links">
          <div>
            <h5>Lab</h5>
            <a href="/blog">Publications</a>
          </div>
          <div>
            <h5>Tools</h5>
            <a href="https://lab.cloud/for-teams">Transformer Lab Workbench</a>
          </div>
          <div>
            <h5>Contact</h5>
            <a href="https://github.com/transformerlab">GitHub</a>
          </div>
        </div>
      </div>
      <div className="wrap colophon" />
    </footer>
  );
}

export default function Home(): React.ReactElement {
  return (
    <div className="tlab-home">
      <Head>
        <html lang="en" />
        <title>Transformer Lab — Research Velocity at the AI Frontier</title>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/aaaakshat/cm-web-fonts@latest/fonts.css"
        />
        <link rel="icon" href="/img/logo2.svg" />
      </Head>
      <RunningHead />
      <Hero />
      <hr className="divider" style={{ marginTop: '48px' }} />
      <Scene>
        <SceneForeground />
      </Scene>
      <Footer />
    </div>
  );
}
