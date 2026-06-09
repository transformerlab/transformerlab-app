// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion
require('dotenv').config();

const lightCodeTheme = require('prism-react-renderer').themes.github;
const darkCodeTheme = require('prism-react-renderer').themes.dracula;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Transformer Lab',
  tagline:
    'With Transformer Lab, ML engineers, researchers, and developers can all collaborate to build and deploy advanced AI models—with provenance, reproducibility, evals, and transparency included.',
  favicon: 'img/logo2.svg',

  // Set the production url of your site here
  url: 'https://transformerlab.ai',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'transformerlab', // Usually your GitHub org/user name.
  projectName: 'transfomerlab-docs', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  /* we need to add the following using links :
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Comfortaa&display=swap" rel="stylesheet"></link>
*/

  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossorigin: 'true',
      },
    },
    {
      tagName: 'link',
      attributes: {
        href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Instrument+Serif:ital@0;1&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
        rel: 'stylesheet',
      },
    },
  ],

  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/transformerlab/transformerlab-app/tree/main/transformerlab-docs',
        },
        blog: {
          showReadingTime: true,
          blogSidebarCount: 'ALL',
          blogSidebarTitle: 'All posts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/transformerlab/transformerlab-app/tree/main/transformerlab-docs',
        },
        theme: {
          customCss: [
            require.resolve('./src/css/vars.css'),
            require.resolve('./src/css/custom.css'),
            require.resolve('asciinema-player/dist/bundle/asciinema-player.css'),
          ],
        },
        ...(process.env.GTAG_TRACKING_ID && {
          gtag: {
            trackingID: process.env.GTAG_TRACKING_ID,
            anonymizeIP: true,
          },
        }),
        sitemap: {
          lastmod: 'date',
          changefreq: 'weekly',
          priority: 0.5,
          ignorePatterns: ['/tags/**'],
          filename: 'sitemap.xml',
          createSitemapItems: async (params) => {
            const { defaultCreateSitemapItems, ...rest } = params;
            const items = await defaultCreateSitemapItems(rest);
            return items.filter((item) => !item.url.includes('/page/'));
          },
        },
      }),
    ],
  ],
  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'for-teams',
        path: 'for-teams',
        routeBasePath: 'for-teams',
        sidebarPath: require.resolve('./sidebars.js'),
        editUrl:
          'https://github.com/transformerlab/transformerlab-app/tree/main/transformerlab-docs',
      },
    ],
    [
      '@signalwire/docusaurus-plugin-llms-txt',
      {
        siteTitle: 'Transformer Lab — For Teams',
        siteDescription:
          'Self-hosting and team deployment docs for Transformer Lab.',
        depth: 2,
        content: {
          enableMarkdownFiles: true,
          enableLlmsFullTxt: true,
          includeDocs: true,
          includeBlog: false,
          includePages: false,
          includeGeneratedIndex: false,
          excludeRoutes: ['/docs/**', '/search'],
        },
      },
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: 'img/screenshot.png',
      announcementBar: {
        id: 'runpod_support',
        content:
          'New research: INT8 and GGUF quantizations of Ideogram 4 for consumer GPUs. <a href="/blog/quantizing-ideogram-4">Read more</a>',
        backgroundColor: 'rgb(60, 62, 160)',
        textColor: '#ffffff',
        isCloseable: false,
      },
      navbar: {
        title: 'Transformer Lab',
        logo: {
          alt: 'Transfomer Lab Logo',
          src: 'img/logo2.svg',
        },
        items: [
          {
            to: '/',
            label: 'Home',
            position: 'left',
            activeBaseRegex: '^/$',
          },
          { to: '/for-teams', label: 'Documentation', position: 'left' },
          {
            to: '/blog',
            label: 'Blog',
            position: 'left',
          },
          // { to: "/docs/local/download", label: "Download ↓", position: "right" },
          {
            href: 'https://github.com/transformerlab/transformerlab-app',
            label: 'GitHub',
            position: 'right',
          },
          {
            to: 'https://discord.gg/transformerlab',
            label: 'Discord 💬',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'light',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Getting Started',
                to: '/docs',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'Discord',
                href: 'https://discord.gg/transformerlab',
              },
              {
                label: 'Twitter',
                href: 'https://twitter.com/transformerlab',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'Blog',
                to: '/blog',
              },
              {
                label: 'GitHub',
                href: 'https://github.com/transformerlab',
              },
              {
                label: 'About',
                to: '/about',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Transformer Lab`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: ['json5', 'bash', 'yaml'],
      },
      algolia: {
        appId: 'DNW29T8T7Z',
        apiKey: process.env.ALGOLIA_API_KEY || 'API_KEY',
        indexName: 'transformerlab',
        contextualSearch: true,
      },
    }),
};

module.exports = config;
