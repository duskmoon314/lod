import type { ReactNode } from "react";
import clsx from "clsx";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";
import Translate, { translate } from "@docusaurus/Translate";
import { Icon } from "@iconify/react";

import styles from "./index.module.css";

function HomepageHeader() {
  // const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx("hero hero--primary", styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          <Translate id="site.title">暮月的藏书阁</Translate>
        </Heading>
        <p className="hero__subtitle">
          <Translate id="site.tagline">
            暮月的个人小站，收录一些杂记随笔和项目
          </Translate>
        </p>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  // const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={translate({ id: "site.title", message: "暮月的藏书阁" })}
      description={translate({
        id: "site.tagline",
        message: "暮月的个人小站，收录一些杂记随笔和项目",
      })}
    >
      <HomepageHeader />
      <main>
        <div className="flex flex-col lg:flex-row items-center gap-16 py-12 place-content-center">
          <div>
            <img
              src="img/icon.png"
              alt="Logo"
              className="w-32 h-32 rounded-full shadow-2xl"
            />
          </div>

          <div className="w-4/5 lg:w-2/5 flex flex-col">
            <div
              className="text p-6"
              dangerouslySetInnerHTML={{
                __html: translate({
                  id: "home.intro",
                  message:
                    "<h2>你好，我是暮月</h2><p>欢迎来到我的个人小站“<b>暮月的藏书阁</b>”。</p><p>我是清华大学的在读博士生，也是在尝试积极参与开源社区的菜鸟。</p><p>这里收录的是我的一些杂记、随笔和维护的项目的介绍。</p>",
                }),
              }}
            />

            <div className="divider" />

            <div className="flex flex-col lg:flex-row px-6 py-2">
              <div className="w-full lg:w-1/2 flex flex-row justify-between">
                <p>
                  <Translate id="home.who-am-i">我是谁</Translate>
                </p>
                <Link to="/about">
                  <Translate id="home.who-am-i.link">关于我</Translate>
                </Link>
              </div>

              <div className="divider lg:divider-horizontal" />

              <div className="w-full lg:w-1/2 flex flex-row justify-between">
                <p>
                  <Translate id="home.contact-me">联系我</Translate>
                </p>

                <div className="flex justify-between gap-4">
                  <Link to="mailto:kp.campbell.he@duskmoon314.com">
                    <Icon icon="icon-park-outline:mail-edit" width="1.5rem" />
                  </Link>
                  <Link to="https://github.com/duskmoon314">
                    <Icon icon="icon-park-outline:github-one" width="1.5rem" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
