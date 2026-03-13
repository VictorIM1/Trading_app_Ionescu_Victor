import { createFileRoute } from "@tanstack/react-router";
import { proxyApiRequest } from "@/lib/api-proxy";

export const Route = createFileRoute("/api/users/me/bets")({
  server: {
    handlers: {
      GET: ({ request }) => proxyApiRequest(request, "/api/users/me/bets"),
    },
  },
});