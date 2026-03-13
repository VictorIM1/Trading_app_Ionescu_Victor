import { createFileRoute } from "@tanstack/react-router";
import { proxyApiRequest } from "@/lib/api-proxy";

export const Route = createFileRoute("/api/markets/$id/bets")({
  server: {
    handlers: {
      POST: ({ request, params }) => proxyApiRequest(request, `/api/markets/${params.id}/bets`),
    },
  },
});