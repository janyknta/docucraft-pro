import { createFileRoute } from "@tanstack/react-router";
import { DocsApp } from "@/components/docs/DocsApp";

export const Route = createFileRoute("/md-reader")({
  head: () => ({
    meta: [
      { title: "Markdown Reader" },
    ],
  }),
  component: DocsApp,
});
