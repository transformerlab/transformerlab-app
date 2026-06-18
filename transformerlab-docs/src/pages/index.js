import { useEffect } from 'react';

/**
 * The real homepage at "/" is a standalone static file
 * (static/custom-index.html, copied over build/index.html at build time). It is
 * NOT part of the Docusaurus React/SPA bundle, so client-side navigation to "/"
 * from another page (e.g. clicking the navbar logo from the blog) would land on
 * a blank route.
 *
 * This page exists only so "/" is a known route. On the client it forces a full
 * page load, which fetches the real static homepage and replaces the SPA. During
 * the production build it renders nothing — the generated build/index.html is
 * overwritten by the static homepage via the `cp` step in the build script.
 */
export default function Home() {
  useEffect(() => {
    // Full reload of "/" — serves the static homepage, which has no Docusaurus
    // bundle, so the SPA does not re-hijack it.
    window.location.assign('/');
  }, []);
  return null;
}
