// @ts-check
//
// papers.js — the single source of truth for the /papers page.
//
// To finish wiring up a paper:
//   1. Drop the PDF into  static/papers/<file>.pdf
//   2. Set that paper's `pdf` field below to "<file>.pdf"
//
// Entries with an empty `pdf` still render (title, authors, date, abstract);
// the paper's page shows a "PDF coming soon" note instead of the viewer until
// a file is added.
//
// Per-paper pages at /papers/<slug> are generated automatically at build time
// (see the `papersPlugin` in docusaurus.config.js). The list page lives in
// src/pages/papers.tsx. This file is plain JS (not .ts) so the build-time
// plugin can `require()` it from the CommonJS config.

/**
 * @typedef {Object} Paper
 * @property {string} slug      URL slug -> /papers/<slug> (keep short, stable, unique)
 * @property {string} title     Full paper title
 * @property {string[]} authors Author names, in order
 * @property {string} date      "YYYY-MM" or "YYYY-MM-DD"; used to sort newest-first
 * @property {string} abstract  Abstract text
 * @property {string} pdf       Filename in static/papers/, e.g. "my-paper.pdf" ("" if not uploaded yet)
 * @property {string} [tag]     Optional modality label, e.g. "3D", "LLM", "VISION"
 */

/** @type {Paper[]} */
const papers = [
  {
    slug: 'judging-to-improve',
    title:
      'Judging to Improve: A De-biased VLM-as-3D-Judge Protocol for Single-Image 3D Generation',
    authors: ['Asaria', 'Salomone', 'Gandhi'],
    date: '2026-06-18',
    tag: '3D',
    abstract:
      'A trainable, de-biased VLM-as-judge for single-image 3D generation — one VLM family labels training pairs, a different family scores, and verdicts only count when they survive an order swap. Used to test cheap label-free adaptation of a strong base: six methods reach only parity (0.50 win-rate), never the 0.65 bar — the durable artifact is the judge protocol, not a model.',
    pdf: 'judging-to-improve.pdf',
  },
  {
    slug: 'train-retrieve-or-both',
    title:
      'Train, Retrieve, or Both? A Four-Arm Head-to-Head for Correct Statutory Citation on the Ontario Residential Tenancies Act',
    authors: ['Asaria', 'Salomone', 'Gandhi'],
    date: '2026-06-18',
    tag: 'LLM',
    abstract:
      'A four-arm head-to-head (base, LoRA SFT, RAG, SFT+RAG) for correct statutory citation on Ontario tenancy law. The base model hallucinates 81% of its citations; retrieval is the decisive lever, driving hallucinations to zero by construction and lifting citation exact-match to 0.44, with the SFT+RAG hybrid best at 0.481.',
    pdf: 'train-retrieve-or-both.pdf',
  },
  {
    slug: 'cross-model-vlm-judge',
    title:
      'A Cross-Model VLM-Judge Protocol for Single-Image 3D Mesh Quality (and Why Cheap Proxies Fall Short)',
    authors: ['Asaria', 'Salomone', 'Gandhi'],
    date: '2026-06-16',
    tag: '3D',
    abstract:
      "A standardized evaluation protocol for single-image-to-3D mesh generators, using 24-view rendering and position-bias correction — and showing that common proxies like CLIP similarity and geometry-validity metrics don't substitute for a VLM judge.",
    pdf: 'cross-model-vlm-judge.pdf',
  },
  {
    slug: 'reliable-neural-codec-tts',
    title:
      'Reliable Neural-Codec Text-to-Speech by ASR Self-Verification and Distillation: Near-Zero Catastrophic Failures Across Models and Codecs',
    authors: ['Asaria', 'Salomone', 'Gandhi'],
    date: '2026-06-16',
    tag: 'AUDIO',
    abstract:
      'ASR-based self-verification drives catastrophic failures (silence, early termination, repetition) to near zero in autoregressive neural-codec TTS, then distills the behavior for inference-time efficiency — generalizing across four TTS systems and three codecs.',
    pdf: 'reliable-neural-codec-tts.pdf',
  },
  {
    slug: 'diffusiongemma-token-commitment',
    title:
      'Neither Parallel Nor Sequential: How DiffusionGemma Actually Commits Tokens',
    authors: ['Asaria', 'Salomone', 'Gandhi'],
    date: '2026-06-12',
    tag: 'LLM',
    abstract:
      'A close look at token-commitment patterns in DiffusionGemma 26B. Contrary to parallel-decoding marketing, the behavior is neither parallel nor block-autoregressive — weak left-to-right bias and substantial within-batch ordering ambiguity.',
    pdf: 'diffusiongemma-token-commitment.pdf',
  },
  {
    slug: 'int8-gemm-ideogram',
    title:
      'Realizing Native INT8 Compute for Diffusion Transformers on Consumer GPUs: A Fused INT8 GEMM Kernel for Ideogram 4.0',
    authors: ['Asaria', 'Salomone', 'Gandhi'],
    date: '2026-06-12',
    tag: 'SYSTEMS',
    abstract:
      'A fused Triton kernel that properly drives the INT8 tensor cores on consumer Ampere GPUs — ~1.1× end-to-end speedup, making 1024px generation feasible on a single RTX 3090.',
    pdf: 'int8-gemm-ideogram.pdf',
  },
  {
    slug: 'fp8-quality-ceiling-ideogram',
    title:
      'Holding the FP8 Quality Ceiling at 8-Bit Weights and Activations: INT8 and GGUF Post-Training Quantization of Ideogram 4.0 for Consumer GPUs',
    authors: ['Gandhi', 'Asaria', 'Salomone'],
    date: '2026-06-10',
    tag: 'VISION',
    abstract:
      'Post-training quantization of Ideogram 4.0 where INT8 W8A8 comes out statistically indistinguishable from FP8 on key quality metrics, with INT8 and GGUF Q4_K both cutting compute for consumer-GPU deployment.',
    pdf: 'fp8-quality-ceiling-ideogram.pdf',
  },
];

module.exports = { papers };
