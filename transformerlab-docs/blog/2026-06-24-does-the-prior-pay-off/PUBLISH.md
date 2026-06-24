# Publishing this post

This bundle already lives in `transformerlab-docs/blog/2026-06-24-does-the-prior-pay-off/`.

**Ships (keep):** `index.mdx`, `ScaleFlipDiagram.tsx` + `.module.css`, `WinByBudgetDiagram.tsx` + `.module.css`, `images/` (empty).
**Do NOT ship (delete or leave un-copied if moving):** `evidence.md`, `reviews/`, `PUBLISH.md`.

Authors `ali`, `tony`, `deep` already exist in `blog/authors.yml` (no new author entry needed).

The companion paper is added separately: `static/papers/does-the-prior-pay-off.pdf` + an entry in
`src/data/papers.json` (shows at `/papers/does-the-prior-pay-off`, which the post links to).

## Preview

```
cd transformerlab-docs
yarn start          # then open http://localhost:3000/blog/does-the-prior-pay-off
                    # and http://localhost:3000/papers
```

## Notes

- The two diagrams are SSR-safe (no Math.random / Date.now at module scope) and theme-aware
  (var(--ifm-color-primary)).
- Diagram components were not typechecked against a project tsconfig here; bare `tsc` only flags the
  `.module.css` imports, which is the expected false positive (every existing blog component uses the
  same CSS-module pattern and Docusaurus resolves it at build). `yarn build` is the real check.
