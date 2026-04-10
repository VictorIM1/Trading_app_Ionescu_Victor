import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  handleCreateMarket,
  handleListMarkets,
  handleGetMarket,
  handleGetMarketOddsHistory,
  handleResolveMarket,
  handleArchiveMarket,
  handlePlaceBet,
} from "./handlers";

export const marketRoutes = new Elysia({ prefix: "/api/markets" })
  .use(authMiddleware)
  .get("/", handleListMarkets, {
    query: t.Object({
      status: t.Optional(
        t.Union([t.Literal("all"), t.Literal("active"), t.Literal("resolved"), t.Literal("archived")]),
      ),
      sortBy: t.Optional(
        t.Union([t.Literal("createdAt"), t.Literal("totalBets"), t.Literal("participants")]),
      ),
      sortOrder: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
      page: t.Optional(t.Numeric()),
      pageSize: t.Optional(t.Numeric()),
    }),
  })
  .get("/:id", handleGetMarket, {
    params: t.Object({
      id: t.Numeric(),
    }),
  })
  .get("/:id/odds-history", handleGetMarketOddsHistory, {
    params: t.Object({
      id: t.Numeric(),
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
        .post("/", handleCreateMarket, {
          body: t.Object({
            title: t.String(),
            description: t.Optional(t.String()),
            outcomes: t.Array(t.String()),
          }),
        })
        .post("/:id/bets", handlePlaceBet, {
          params: t.Object({
            id: t.Numeric(),
          }),
          body: t.Object({
            outcomeId: t.Number(),
            amount: t.Number(),
          }),
        })
        .post("/:id/resolve", handleResolveMarket, {
          params: t.Object({
            id: t.Numeric(),
          }),
          body: t.Object({
            outcomeId: t.Number(),
          }),
        })
        .post("/:id/archive", handleArchiveMarket, {
          params: t.Object({
            id: t.Numeric(),
          }),
        }),
  );
