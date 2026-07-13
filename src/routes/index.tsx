import { createFileRoute } from "@tanstack/react-router";
import { DocsApp } from "@/components/docs/DocsApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Markdown Docs — Drop-in documentation reader" },
      {
        name: "description",
        content:
          "Drop markdown files to instantly render a beautifully navigable documentation site with search, sidebar, and syntax highlighting.",
      },
      { property: "og:title", content: "Markdown Docs" },
      {
        property: "og:description",
        content: "Turn markdown files into a polished documentation experience.",
      },
    ],
  }),
  component: DocsApp,
});
