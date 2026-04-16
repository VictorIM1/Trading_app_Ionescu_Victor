import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  handleGenerateMyApiKey,
  handleGetCurrentUser,
  handleGetLeaderboard,
  handleGetMyApiKey,
  handleListMyBets,
  handleRevokeMyApiKey,
} from "./handlers";

export const userRoutes = new Elysia({ prefix: "/api/users" })
  .use(authMiddleware)
  .get("/leaderboard", handleGetLeaderboard, {
    query: t.Object({
      page: t.Optional(t.Numeric()),
      pageSize: t.Optional(t.Numeric()),
    }),
  })
  .guard(
    {
      beforeHandle({ user, set }) {
        if (!user) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
      },
    },
    (app) =>
      app
        .get("/me", handleGetCurrentUser)
        .get("/me/api-key", handleGetMyApiKey)
        .post("/me/api-key", handleGenerateMyApiKey)
        .delete("/me/api-key", handleRevokeMyApiKey)
        .get("/me/bets", handleListMyBets, {
          query: t.Object({
            status: t.Optional(t.Union([t.Literal("active"), t.Literal("resolved")])),
            page: t.Optional(t.Numeric()),
            pageSize: t.Optional(t.Numeric()),
          }),
        }),
  );