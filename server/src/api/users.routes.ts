import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth.middleware";
import { handleListMyBets } from "./handlers";

export const userRoutes = new Elysia({ prefix: "/api/users" })
  .use(authMiddleware)
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
      app.get("/me/bets", handleListMyBets, {
        query: t.Object({
          status: t.Optional(t.Union([t.Literal("active"), t.Literal("resolved")])),
          page: t.Optional(t.Numeric()),
          pageSize: t.Optional(t.Numeric()),
        }),
      }),
  );