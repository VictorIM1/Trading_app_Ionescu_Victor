import { createFileRoute } from "@tanstack/react-router";
import { proxyApiRequest } from "@/lib/api-proxy";

export const Route = createFileRoute("/api/users/leaderboard")({
  server: {
    handlers: {
      GET: ({ request }) => proxyApiRequest(request, "/api/users/leaderboard"),
    },
  },
});
