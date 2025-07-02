import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: "暮月的藏书阁",
  tagline: "暮月的个人小站，收录一些杂记随笔和项目",
  favicon: "img/favicon.ico",

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4

    experimental_faster: true,
  },

  // Set the production url of your site here
  url: "https://duskmoon314.com",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "/",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "duskmoon314", // Usually your GitHub org/user name.
  projectName: "lod", // Usually your repo name.

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "zh",
    locales: ["zh", "en"],
    localeConfigs: {
      zh: {
        htmlLang: "zh-cmn-Hans-CN",
      },
    },
  },

  presets: [
    [
      "classic",
      {
        docs: false,
        blog: {
          blogTitle: "博客",
          blogDescription: "暮月的杂记与随笔",
          blogSidebarTitle: "近期文章",
          showReadingTime: true,
          feedOptions: {
            type: ["rss", "atom"],
            xslt: true,
          },
          // Useful options to enforce blogging best practices
          onInlineTags: "warn",
          onInlineAuthors: "warn",
          onUntruncatedBlogPosts: "warn",
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
        },
        theme: {
          customCss: "./src/css/custom.css",
        },

        sitemap: {
          lastmod: "date",
        },
      } satisfies Preset.Options,
    ],
  ],

  stylesheets: [
    {
      href: "https://cdn.jsdelivr.net/npm/katex@0.13.24/dist/katex.min.css",
      type: "text/css",
      integrity:
        "sha384-odtC+0UGzzFL/6PNoE8rX/SPcQDXBJ+uRepguP4QkPCm2LBxH3FA3y+fKSiJ+AmM",
      crossorigin: "anonymous",
    },
    {
      href: "https://chinese-fonts-cdn.deno.dev/packages/lxgwwenkaibright/dist/LXGWBright-Regular/result.css",
      type: "text/css",
    },
  ],

  plugins: [
    [
      "@docusaurus/plugin-content-docs",
      {
        id: "review",
        path: "review",
        routeBasePath: "review",
        sidebarPath: "src/components/sidebarReview.ts",
      },
    ],
    "./src/plugins/tailwind.ts",
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    image: "img/icon.png",
    navbar: {
      title: "暮月的藏书阁",
      logo: {
        alt: "暮月的藏书阁 Logo",
        src: "img/favicon.ico",
        width: 32,
        height: 32,
      },
      items: [
        { to: "/about", label: "关于我", position: "left" },
        { to: "/blog", label: "博客", position: "left" },
        { to: "/review", label: "杂评", position: "left" },
        {
          type: "localeDropdown",
          position: "right",
        },
        {
          href: "https://github.com/duskmoon314/lod",
          position: "right",
          className: "header--github-link",
          "aria-label": "GitHub repository",
        },
      ],
    },
    footer: {
      logo: {
        alt: "暮月的藏书阁 Logo",
        src: "img/favicon.ico",
        width: 32,
        height: 32,
      },
      style: "dark",
      links: [
        {
          title: "更多",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/duskmoon314",
            },
            {
              label: "Stack Overflow",
              href: "https://stackoverflow.com/users/15766817/campbell-he",
            },
          ],
        },
        {
          title: "友情链接",
          items: [
            {
              label: "EESAST",
              href: "https://eesast.com",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} duskmoon314 (Kp Campbell He). Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "ruby", "rust"],
    },
    algolia: {
      appId: "C3ROG2Z4EZ",
      apiKey: "6fd3ef15fabbd6e4589e820019157865",
      indexName: "duskmoon314",
    },
  } satisfies Preset.ThemeConfig,

  markdown: {
    format: "detect",
  },
};

export default config;
