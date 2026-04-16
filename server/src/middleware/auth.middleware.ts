import { Elysia } from "elysia";
import { getUserByApiKey, getUserById, touchApiKeyLastUsed } from "../lib/auth";

export const authMiddleware = new Elysia({ name: "auth-middleware" })
  .derive(async ({ headers, jwt }) => {
    const authHeader = headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const apiKey = headers["x-api-key"];
      if (!apiKey) {
        return { user: null };
      }

      const apiKeyUser = await getUserByApiKey(apiKey);
      if (!apiKeyUser) {
        return { user: null };
      }

      await touchApiKeyLastUsed(apiKeyUser.id);
      return { user: apiKeyUser };
    }

    const token = authHeader.substring(7);
    const payload = await jwt.verify(token);
    if (!payload) {
      return { user: null };
    }

    const user = await getUserById(payload.userId);
    return { user };
  })
  .as("plugin");
