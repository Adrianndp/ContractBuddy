import { createFileRoute } from "@tanstack/react-router";
import { ContractWorkspace } from "@/components/contract-workspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ContractBuddy — Make sense of your contracts" },
      {
        name: "description",
        content:
          "Ask your personal PDF contracts questions and review exact pages and text sources with your local contract assistant.",
      },
      { property: "og:title", content: "ContractBuddy — Make sense of your contracts" },
      {
        property: "og:description",
        content: "Clear answers to your contract questions, grounded in exact document sources.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContractWorkspace,
});
