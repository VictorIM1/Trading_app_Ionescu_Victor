import { eq, and, asc, desc, inArray, sql } from "drizzle-orm";
import db from "../db";
import { usersTable, marketsTable, marketOutcomesTable, betsTable } from "../db/schema";
import { hashPassword, verifyPassword, type AuthTokenPayload } from "../lib/auth";
import {
  validateRegistration,
  validateLogin,
  validateMarketCreation,
  validateBet,
} from "../lib/validation";

type JwtSigner = {
  sign: (payload: AuthTokenPayload) => Promise<string>;
};

export async function handleRegister({
  body,
  jwt,
  set,
}: {
  body: { username: string; email: string; password: string };
  jwt: JwtSigner;
  set: { status: number };
}) {
  const { username, email, password } = body;
  const errors = validateRegistration(username, email, password);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const existingUser = await db.query.usersTable.findFirst({
    where: (users, { or, eq }) => or(eq(users.email, email), eq(users.username, username)),
  });

  if (existingUser) {
    set.status = 409;
    return { errors: [{ field: "email", message: "User already exists" }] };
  }

  const passwordHash = await hashPassword(password);

  const newUser = await db.insert(usersTable).values({ username, email, passwordHash }).returning();

  const token = await jwt.sign({ userId: newUser[0].id });

  set.status = 201;
  return {
    id: newUser[0].id,
    username: newUser[0].username,
    email: newUser[0].email,
    token,
  };
}

export async function handleLogin({
  body,
  jwt,
  set,
}: {
  body: { email: string; password: string };
  jwt: JwtSigner;
  set: { status: number };
}) {
  const { email, password } = body;
  const errors = validateLogin(email, password);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    set.status = 401;
    return { error: "Invalid email or password" };
  }

  const token = await jwt.sign({ userId: user.id });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    token,
  };
}

export async function handleCreateMarket({
  body,
  set,
  user,
}: {
  body: { title: string; description?: string; outcomes: string[] };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  const { title, description, outcomes } = body;
  const errors = validateMarketCreation(title, description || "", outcomes);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const market = await db
    .insert(marketsTable)
    .values({
      title,
      description: description || null,
      createdBy: user.id,
    })
    .returning();

  const outcomeIds = await db
    .insert(marketOutcomesTable)
    .values(
      outcomes.map((title: string, index: number) => ({
        marketId: market[0].id,
        title,
        position: index,
      })),
    )
    .returning();

  set.status = 201;
  return {
    id: market[0].id,
    title: market[0].title,
    description: market[0].description,
    status: market[0].status,
    outcomes: outcomeIds,
  };
}

export async function handleListMarkets({
  query,
}: {
  query: {
    status?: "all" | "active" | "resolved";
    sortBy?: "createdAt" | "totalBets" | "participants";
    sortOrder?: "asc" | "desc";
    page?: number;
    pageSize?: number;
  };
}) {
  const status = query.status === "all" ? undefined : query.status || "active";
  const sortBy = query.sortBy || "createdAt";
  const sortOrder = query.sortOrder || "desc";
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
  const offset = (page - 1) * pageSize;

  const whereClause = status ? eq(marketsTable.status, status) : undefined;

  const totalResult = whereClause
    ? await db
        .select({ count: sql<number>`count(*)` })
        .from(marketsTable)
        .where(whereClause)
    : await db.select({ count: sql<number>`count(*)` }).from(marketsTable);

  const total = Number(totalResult[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const totalMarketBetsExpr = sql<number>`coalesce(sum(${betsTable.amount}), 0)`;
  const participantsCountExpr = sql<number>`count(distinct ${betsTable.userId})`;

  let marketsQuery = db
    .select({
      id: marketsTable.id,
      title: marketsTable.title,
      description: marketsTable.description,
      status: marketsTable.status,
      createdAt: marketsTable.createdAt,
      creator: usersTable.username,
      totalMarketBets: totalMarketBetsExpr,
      participantsCount: participantsCountExpr,
    })
    .from(marketsTable)
    .leftJoin(usersTable, eq(usersTable.id, marketsTable.createdBy))
    .leftJoin(betsTable, eq(betsTable.marketId, marketsTable.id))
    .groupBy(
      marketsTable.id,
      marketsTable.title,
      marketsTable.description,
      marketsTable.status,
      marketsTable.createdAt,
      usersTable.username,
    );

  if (whereClause) {
    marketsQuery = marketsQuery.where(whereClause);
  }

  if (sortBy === "totalBets") {
    marketsQuery =
      sortOrder === "asc"
        ? marketsQuery.orderBy(asc(totalMarketBetsExpr), asc(marketsTable.createdAt))
        : marketsQuery.orderBy(desc(totalMarketBetsExpr), desc(marketsTable.createdAt));
  } else if (sortBy === "participants") {
    marketsQuery =
      sortOrder === "asc"
        ? marketsQuery.orderBy(asc(participantsCountExpr), asc(marketsTable.createdAt))
        : marketsQuery.orderBy(desc(participantsCountExpr), desc(marketsTable.createdAt));
  } else {
    marketsQuery =
      sortOrder === "asc"
        ? marketsQuery.orderBy(asc(marketsTable.createdAt))
        : marketsQuery.orderBy(desc(marketsTable.createdAt));
  }

  const marketRows = await marketsQuery.limit(pageSize).offset(offset);

  const marketIds = marketRows.map((market) => market.id);

  if (marketIds.length === 0) {
    return {
      items: [],
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  const outcomeRows = await db
    .select({
      id: marketOutcomesTable.id,
      marketId: marketOutcomesTable.marketId,
      title: marketOutcomesTable.title,
      position: marketOutcomesTable.position,
      totalBets: sql<number>`coalesce(sum(${betsTable.amount}), 0)`,
    })
    .from(marketOutcomesTable)
    .leftJoin(betsTable, eq(betsTable.outcomeId, marketOutcomesTable.id))
    .where(inArray(marketOutcomesTable.marketId, marketIds))
    .groupBy(
      marketOutcomesTable.id,
      marketOutcomesTable.marketId,
      marketOutcomesTable.title,
      marketOutcomesTable.position,
    )
    .orderBy(asc(marketOutcomesTable.marketId), asc(marketOutcomesTable.position));

  const outcomesByMarket = new Map<
    number,
    Array<{ id: number; title: string; totalBets: number; position: number }>
  >();

  for (const outcome of outcomeRows) {
    const list = outcomesByMarket.get(outcome.marketId) || [];
    list.push({
      id: outcome.id,
      title: outcome.title,
      totalBets: Number(outcome.totalBets ?? 0),
      position: outcome.position,
    });
    outcomesByMarket.set(outcome.marketId, list);
  }

  const items = marketRows.map((market) => {
    const totalMarketBets = Number(market.totalMarketBets ?? 0);
    const rawOutcomes = outcomesByMarket.get(market.id) || [];

    return {
      id: market.id,
      title: market.title,
      description: market.description,
      status: market.status,
      creator: market.creator || undefined,
      createdAt: market.createdAt,
      participantsCount: Number(market.participantsCount ?? 0),
      outcomes: rawOutcomes.map((outcome) => ({
        id: outcome.id,
        title: outcome.title,
        totalBets: outcome.totalBets,
        odds: totalMarketBets > 0 ? Number(((outcome.totalBets / totalMarketBets) * 100).toFixed(2)) : 0,
      })),
      totalMarketBets,
    };
  });

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
}

export async function handleGetMarket({
  params,
  set,
}: {
  params: { id: number };
  set: { status: number };
}) {
  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, params.id),
    with: {
      creator: {
        columns: { username: true },
      },
      outcomes: {
        orderBy: (outcomes, { asc }) => asc(outcomes.position),
      },
    },
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  const betsPerOutcome = await Promise.all(
    market.outcomes.map(async (outcome) => {
      const totalBets = await db
        .select()
        .from(betsTable)
        .where(eq(betsTable.outcomeId, outcome.id));

      const totalAmount = totalBets.reduce((sum, bet) => sum + bet.amount, 0);
      return { outcomeId: outcome.id, totalBets: totalAmount };
    }),
  );

  const totalMarketBets = betsPerOutcome.reduce((sum, b) => sum + b.totalBets, 0);

  return {
    id: market.id,
    title: market.title,
    description: market.description,
    status: market.status,
    creator: market.creator?.username,
    outcomes: market.outcomes.map((outcome) => {
      const outcomeBets = betsPerOutcome.find((b) => b.outcomeId === outcome.id)?.totalBets || 0;
      const odds =
        totalMarketBets > 0 ? Number(((outcomeBets / totalMarketBets) * 100).toFixed(2)) : 0;

      return {
        id: outcome.id,
        title: outcome.title,
        odds,
        totalBets: outcomeBets,
      };
    }),
    totalMarketBets,
  };
}

export async function handlePlaceBet({
  params,
  body,
  set,
  user,
}: {
  params: { id: number };
  body: { outcomeId: number; amount: number };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  const marketId = params.id;
  const { outcomeId, amount } = body;
  const errors = validateBet(amount);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, marketId),
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  if (market.status !== "active") {
    set.status = 400;
    return { error: "Market is not active" };
  }

  const outcome = await db.query.marketOutcomesTable.findFirst({
    where: and(eq(marketOutcomesTable.id, outcomeId), eq(marketOutcomesTable.marketId, marketId)),
  });

  if (!outcome) {
    set.status = 404;
    return { error: "Outcome not found" };
  }

  const bet = await db
    .insert(betsTable)
    .values({
      userId: user.id,
      marketId,
      outcomeId,
      amount: Number(amount),
    })
    .returning();

  set.status = 201;
  return {
    id: bet[0].id,
    userId: bet[0].userId,
    marketId: bet[0].marketId,
    outcomeId: bet[0].outcomeId,
    amount: bet[0].amount,
  };
}
