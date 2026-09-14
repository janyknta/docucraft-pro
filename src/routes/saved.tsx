import { createFileRoute } from "@tanstack/react-router";
import { DocsApp } from "@/components/docs/DocsApp";

export const Route = createFileRoute("/saved")({
  head: () => ({
    meta: [{ title: "Saved" }],
  }),
  component: DocsApp,
});
