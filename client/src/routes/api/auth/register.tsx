import { createFileRoute } from "@tanstack/react-router";
import { proxyApiRequest } from "@/lib/api-proxy";

export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: ({ request }) => proxyApiRequest(request, "/api/auth/register"),
    },
  },
});