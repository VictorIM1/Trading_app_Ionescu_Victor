import { createFileRoute } from "@tanstack/react-router";
import { proxyApiRequest } from "@/lib/api-proxy";

export const Route = createFileRoute("/api/markets")({
  server: {
    handlers: {
      GET: ({ request }) => proxyApiRequest(request, "/api/markets"),
      POST: ({ request }) => proxyApiRequest(request, "/api/markets"),
    },
  },
});