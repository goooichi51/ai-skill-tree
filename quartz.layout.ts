import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [Component.SourceFilter()],
  afterBody: [
    // バックリンクをコンテンツの下に表示（中央寄せ）
    Component.ConditionalRender({
      component: Component.Backlinks(),
      condition: (page) => page.fileData.slug !== "index",
    }),
  ],
  footer: Component.Footer({
    links: {
      "GitHub": "https://github.com",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    // すべてのページでスキルマップを表示
    Component.Graph({
      localGraph: {
        depth: -1,
        scale: 1.5,
        repelForce: 1.5,
        centerForce: 0.2,
        linkDistance: 50,
        fontSize: 0.5,
        opacityScale: 2,
        showTags: false,
      },
      globalGraph: {
        depth: -1,
        scale: 1.2,
        repelForce: 1.2,
        centerForce: 0.2,
        linkDistance: 50,
        fontSize: 0.5,
        opacityScale: 2,
        showTags: false,
      },
    }),
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ConditionalRender({
      component: Component.ArticleTitle(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ConditionalRender({
      component: Component.ContentMeta(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ConditionalRender({
      component: Component.TagList(),
      condition: (page) => page.fileData.slug !== "index",
    }),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer({
      title: "Navigation",
      folderClickBehavior: "collapse",
      folderDefaultState: "open",
      useSavedState: true,
    }),
  ],
  right: [],
}

// components for pages that display lists of pages (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [
    // すべてのページでスキルマップを表示
    Component.Graph({
      localGraph: {
        depth: -1,
        scale: 1.5,
        repelForce: 1.5,
        centerForce: 0.2,
        linkDistance: 50,
        fontSize: 0.5,
        opacityScale: 2,
        showTags: false,
      },
      globalGraph: {
        depth: -1,
        scale: 1.2,
        repelForce: 1.2,
        centerForce: 0.2,
        linkDistance: 50,
        fontSize: 0.5,
        opacityScale: 2,
        showTags: false,
      },
    }),
    Component.Breadcrumbs(),
    Component.ArticleTitle(),
    Component.ContentMeta(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer(),
  ],
  right: [],
}
