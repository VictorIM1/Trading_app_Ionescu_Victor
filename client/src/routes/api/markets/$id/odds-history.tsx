import { createFileRoute } from "@tanstack/react-router";
import { proxyApiRequest } from "@/lib/api-proxy";

export const Route = createFileRoute("/api/markets/$id/odds-history")({
  server: {
    handlers: {
      GET: ({ request, params }) => proxyApiRequest(request, `/api/markets/${params.id}/odds-history`),
    },
  },
});
