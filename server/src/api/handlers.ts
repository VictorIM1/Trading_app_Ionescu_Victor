import { eq, and, asc, desc, inArray, sql } from "drizzle-orm";
import db from "../db";
import {
  usersTable,
  marketsTable,
  marketOutcomesTable,
  betsTable,
  marketRefundsTable,
  marketPayoutsTable,
} from "../db/schema";
import {
  generateApiKeyBundle,
  hashPassword,
  verifyPassword,
  type AuthTokenPayload,
} from "../lib/auth";
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

  const existingUsersCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(usersTable);
  const existingUsersCount = Number(existingUsersCountResult[0]?.count ?? 0);
  const role: "user" | "admin" = existingUsersCount === 0 ? "admin" : "user";

  const newUser = await db.insert(usersTable).values({ username, email, passwordHash, role }).returning();

  const token = await jwt.sign({ userId: newUser[0].id });

  set.status = 201;
  return {
    id: newUser[0].id,
    username: newUser[0].username,
    email: newUser[0].email,
    role: newUser[0].role,
    balance: Number(newUser[0].balance),
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

  let role = user.role;
  if (role !== "admin") {
    const adminCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));

    const adminCount = Number(adminCountResult[0]?.count ?? 0);
    if (adminCount === 0) {
      await db.update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, user.id));
      role = "admin";
    }
  }

  const token = await jwt.sign({ userId: user.id });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role,
    balance: Number(user.balance),
    token,
  };
}

export async function handleGetCurrentUser({
  user,
}: {
  user: typeof usersTable.$inferSelect;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    balance: Number(user.balance),
  };
}

export async function handleGetMyApiKey({
  user,
}: {
  user: typeof usersTable.$inferSelect;
}) {
  const hasApiKey = Boolean(user.apiKeyHash && !user.apiKeyRevokedAt);

  return {
    hasApiKey,
    keyId: hasApiKey ? user.apiKeyId : null,
    createdAt: user.apiKeyCreatedAt,
    lastUsedAt: user.apiKeyLastUsedAt,
  };
}

export async function handleGenerateMyApiKey({
  user,
}: {
  user: typeof usersTable.$inferSelect;
}) {
  const { apiKey, apiKeyHash, apiKeyId } = await generateApiKeyBundle();
  const now = new Date();

  await db
    .update(usersTable)
    .set({
      apiKeyId,
      apiKeyHash,
      apiKeyCreatedAt: now,
      apiKeyLastUsedAt: null,
      apiKeyRevokedAt: null,
    })
    .where(eq(usersTable.id, user.id));

  return {
    apiKey,
    keyId: apiKeyId,
    createdAt: now,
    lastUsedAt: null,
  };
}

export async function handleRevokeMyApiKey({
  user,
}: {
  user: typeof usersTable.$inferSelect;
}) {
  const now = new Date();

  await db
    .update(usersTable)
    .set({
      apiKeyId: null,
      apiKeyHash: null,
      apiKeyRevokedAt: now,
    })
    .where(eq(usersTable.id, user.id));

  return {
    success: true,
    revokedAt: now,
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
    status?: "all" | "active" | "resolved" | "archived";
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

export async function handleGetMarketOddsHistory({
  params,
  set,
}: {
  params: { id: number };
  set: { status: number };
}) {
  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, params.id),
    with: {
      outcomes: {
        orderBy: (outcomes, { asc }) => asc(outcomes.position),
      },
    },
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  const betRows = await db
    .select({
      id: betsTable.id,
      outcomeId: betsTable.outcomeId,
      amount: betsTable.amount,
      createdAt: betsTable.createdAt,
    })
    .from(betsTable)
    .where(eq(betsTable.marketId, params.id))
    .orderBy(asc(betsTable.createdAt), asc(betsTable.id));

  const runningTotals = new Map<number, number>();
  for (const outcome of market.outcomes) {
    runningTotals.set(outcome.id, 0);
  }

  const snapshots: Array<{
    timestamp: Date;
    outcomes: Array<{ id: number; title: string; totalBets: number; odds: number }>;
  }> = [];

  const pushSnapshot = (timestamp: Date) => {
    const totalMarketBets = Array.from(runningTotals.values()).reduce((sum, value) => sum + value, 0);

    snapshots.push({
      timestamp,
      outcomes: market.outcomes.map((outcome) => {
        const totalBets = runningTotals.get(outcome.id) || 0;
        const odds =
          totalMarketBets > 0 ? Number(((totalBets / totalMarketBets) * 100).toFixed(2)) : 0;

        return {
          id: outcome.id,
          title: outcome.title,
          totalBets,
          odds,
        };
      }),
    });
  };

  pushSnapshot(market.createdAt);

  for (const bet of betRows) {
    runningTotals.set(bet.outcomeId, (runningTotals.get(bet.outcomeId) || 0) + bet.amount);
    pushSnapshot(bet.createdAt);
  }

  return {
    marketId: market.id,
    snapshots,
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

  if (Number(user.balance) < Number(amount)) {
    set.status = 400;
    return { error: "Insufficient balance" };
  }

  const [bet] = await db.transaction(async (tx) => {
    const created = await tx
      .insert(betsTable)
      .values({
        userId: user.id,
        marketId,
        outcomeId,
        amount: Number(amount),
      })
      .returning();

    await tx
      .update(usersTable)
      .set({ balance: sql`${usersTable.balance} - ${Number(amount)}` })
      .where(eq(usersTable.id, user.id));

    return created;
  });

  set.status = 201;
  return {
    id: bet.id,
    userId: bet.userId,
    marketId: bet.marketId,
    outcomeId: bet.outcomeId,
    amount: bet.amount,
  };
}

export async function handleResolveMarket({
  params,
  body,
  set,
  user,
}: {
  params: { id: number };
  body: { outcomeId: number };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  if (user.role !== "admin") {
    set.status = 403;
    return { error: "Forbidden" };
  }

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, params.id),
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
    where: and(eq(marketOutcomesTable.id, body.outcomeId), eq(marketOutcomesTable.marketId, params.id)),
  });

  if (!outcome) {
    set.status = 404;
    return { error: "Outcome not found" };
  }

  const bets = await db
    .select({
      userId: betsTable.userId,
      outcomeId: betsTable.outcomeId,
      amount: betsTable.amount,
    })
    .from(betsTable)
    .where(eq(betsTable.marketId, params.id));

  const totalPool = Number(bets.reduce((sum, bet) => sum + Number(bet.amount), 0).toFixed(2));
  const winningPool = Number(
    bets
      .filter((bet) => bet.outcomeId === outcome.id)
      .reduce((sum, bet) => sum + Number(bet.amount), 0)
      .toFixed(2),
  );

  const payoutsByUser = new Map<number, number>();
  if (totalPool > 0 && winningPool > 0) {
    for (const bet of bets) {
      if (bet.outcomeId !== outcome.id) {
        continue;
      }

      const proportionalPayout = (Number(bet.amount) * totalPool) / winningPool;
      payoutsByUser.set(
        bet.userId,
        Number(((payoutsByUser.get(bet.userId) || 0) + proportionalPayout).toFixed(2)),
      );
    }
  }

  const payouts = Array.from(payoutsByUser.entries()).map(([userId, amount]) => ({
    userId,
    amount,
  }));

  await db.transaction(async (tx) => {
    await tx
      .update(marketsTable)
      .set({
        status: "resolved",
        resolvedOutcomeId: outcome.id,
      })
      .where(eq(marketsTable.id, params.id));

    if (payouts.length > 0) {
      await tx.insert(marketPayoutsTable).values(
        payouts.map((entry) => ({
          marketId: params.id,
          userId: entry.userId,
          amount: entry.amount,
        })),
      );

      for (const entry of payouts) {
        await tx
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${entry.amount}` })
          .where(eq(usersTable.id, entry.userId));
      }
    }
  });

  return {
    success: true,
    marketId: params.id,
    resolvedOutcomeId: outcome.id,
    totalPool,
    winningPool,
    totalPayout: Number(payouts.reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
    payouts,
  };
}

export async function handleArchiveMarket({
  params,
  set,
  user,
}: {
  params: { id: number };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  if (user.role !== "admin") {
    set.status = 403;
    return { error: "Forbidden" };
  }

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, params.id),
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  if (market.status === "archived") {
    const existingRefunds = await db
      .select({
        userId: marketRefundsTable.userId,
        username: usersTable.username,
        amount: marketRefundsTable.amount,
      })
      .from(marketRefundsTable)
      .innerJoin(usersTable, eq(usersTable.id, marketRefundsTable.userId))
      .where(eq(marketRefundsTable.marketId, params.id));

    const refunds = existingRefunds.map((item) => ({
      userId: item.userId,
      username: item.username,
      amount: Number(item.amount),
    }));

    return {
      success: true,
      marketId: params.id,
      archived: true,
      totalRefunded: Number(refunds.reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
      refunds,
    };
  }

  if (market.status !== "active") {
    set.status = 400;
    return { error: "Only active markets can be archived" };
  }

  const refundsByUser = await db
    .select({
      userId: betsTable.userId,
      username: usersTable.username,
      amount: sql<number>`coalesce(sum(${betsTable.amount}), 0)`,
    })
    .from(betsTable)
    .innerJoin(usersTable, eq(usersTable.id, betsTable.userId))
    .where(eq(betsTable.marketId, params.id))
    .groupBy(betsTable.userId, usersTable.username);

  const refunds = refundsByUser.map((item) => ({
    userId: item.userId,
    username: item.username,
    amount: Number(Number(item.amount ?? 0).toFixed(2)),
  }));

  await db.transaction(async (tx) => {
    if (refunds.length > 0) {
      await tx.insert(marketRefundsTable).values(
        refunds.map((item) => ({
          marketId: params.id,
          userId: item.userId,
          amount: item.amount,
        })),
      );

      for (const item of refunds) {
        await tx
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${item.amount}` })
          .where(eq(usersTable.id, item.userId));
      }
    }

    await tx
      .update(marketsTable)
      .set({
        status: "archived",
        resolvedOutcomeId: null,
      })
      .where(eq(marketsTable.id, params.id));
  });

  return {
    success: true,
    marketId: params.id,
    archived: true,
    totalRefunded: Number(refunds.reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
    refunds,
  };
}

export async function handleListMyBets({
  query,
  user,
}: {
  query: {
    status?: "active" | "resolved";
    page?: number;
    pageSize?: number;
  };
  user: typeof usersTable.$inferSelect;
}) {
  const status = query.status || "active";
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
  const offset = (page - 1) * pageSize;

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(betsTable)
    .innerJoin(marketsTable, eq(marketsTable.id, betsTable.marketId))
    .where(and(eq(betsTable.userId, user.id), eq(marketsTable.status, status)));

  const total = Number(totalResult[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rows = await db
    .select({
      betId: betsTable.id,
      amount: betsTable.amount,
      createdAt: betsTable.createdAt,
      marketId: marketsTable.id,
      marketTitle: marketsTable.title,
      marketStatus: marketsTable.status,
      resolvedOutcomeId: marketsTable.resolvedOutcomeId,
      outcomeId: marketOutcomesTable.id,
      outcomeTitle: marketOutcomesTable.title,
    })
    .from(betsTable)
    .innerJoin(marketsTable, eq(marketsTable.id, betsTable.marketId))
    .innerJoin(marketOutcomesTable, eq(marketOutcomesTable.id, betsTable.outcomeId))
    .where(and(eq(betsTable.userId, user.id), eq(marketsTable.status, status)))
    .orderBy(desc(betsTable.createdAt))
    .limit(pageSize)
    .offset(offset);

  const marketIds = Array.from(new Set(rows.map((row) => row.marketId)));

  const totalsRows = marketIds.length
    ? await db
        .select({
          marketId: marketOutcomesTable.marketId,
          outcomeId: marketOutcomesTable.id,
          totalBets: sql<number>`coalesce(sum(${betsTable.amount}), 0)`,
        })
        .from(marketOutcomesTable)
        .leftJoin(betsTable, eq(betsTable.outcomeId, marketOutcomesTable.id))
        .where(inArray(marketOutcomesTable.marketId, marketIds))
        .groupBy(marketOutcomesTable.marketId, marketOutcomesTable.id)
    : [];

  const totalsByMarket = new Map<number, Array<{ outcomeId: number; totalBets: number }>>();

  for (const row of totalsRows) {
    const list = totalsByMarket.get(row.marketId) || [];
    list.push({ outcomeId: row.outcomeId, totalBets: Number(row.totalBets ?? 0) });
    totalsByMarket.set(row.marketId, list);
  }

  const items = rows.map((row) => {
    const marketTotals = totalsByMarket.get(row.marketId) || [];
    const totalMarketBets = marketTotals.reduce((sum, item) => sum + item.totalBets, 0);
    const outcomeTotal = marketTotals.find((item) => item.outcomeId === row.outcomeId)?.totalBets || 0;
    const currentOdds =
      totalMarketBets > 0 ? Number(((outcomeTotal / totalMarketBets) * 100).toFixed(2)) : 0;

    const isResolved = row.marketStatus === "resolved";
    const didWin = isResolved ? row.resolvedOutcomeId === row.outcomeId : null;

    return {
      id: row.betId,
      marketId: row.marketId,
      marketTitle: row.marketTitle,
      outcomeId: row.outcomeId,
      outcomeTitle: row.outcomeTitle,
      amount: row.amount,
      placedAt: row.createdAt,
      currentOdds,
      status: row.marketStatus,
      didWin,
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

export async function handleGetLeaderboard({
  query,
}: {
  query: {
    page?: number;
    pageSize?: number;
  };
}) {
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));

  const rows = await db
    .select({
      userId: usersTable.id,
      username: usersTable.username,
      marketId: marketsTable.id,
      resolvedOutcomeId: marketsTable.resolvedOutcomeId,
      outcomeId: betsTable.outcomeId,
      amount: betsTable.amount,
    })
    .from(betsTable)
    .innerJoin(usersTable, eq(usersTable.id, betsTable.userId))
    .innerJoin(marketsTable, eq(marketsTable.id, betsTable.marketId))
    .where(eq(marketsTable.status, "resolved"));

  const marketPools = new Map<number, { totalPool: number; winningPool: number }>();

  for (const row of rows) {
    const pool = marketPools.get(row.marketId) || { totalPool: 0, winningPool: 0 };
    pool.totalPool += row.amount;
    if (row.resolvedOutcomeId === row.outcomeId) {
      pool.winningPool += row.amount;
    }
    marketPools.set(row.marketId, pool);
  }

  const statsByUser = new Map<
    number,
    {
      userId: number;
      username: string;
      settledBets: number;
      wins: number;
      losses: number;
      totalStaked: number;
      totalPayout: number;
    }
  >();

  for (const row of rows) {
    const stats = statsByUser.get(row.userId) || {
      userId: row.userId,
      username: row.username,
      settledBets: 0,
      wins: 0,
      losses: 0,
      totalStaked: 0,
      totalPayout: 0,
    };

    stats.settledBets += 1;
    stats.totalStaked += row.amount;

    if (row.resolvedOutcomeId === row.outcomeId) {
      const pool = marketPools.get(row.marketId);
      const payout = pool && pool.winningPool > 0 ? (row.amount * pool.totalPool) / pool.winningPool : 0;
      stats.wins += 1;
      stats.totalPayout += payout;
    } else {
      stats.losses += 1;
    }

    statsByUser.set(row.userId, stats);
  }

  const ranking = Array.from(statsByUser.values())
    .map((stats) => {
      const totalPayout = Number(stats.totalPayout.toFixed(2));
      const totalStaked = Number(stats.totalStaked.toFixed(2));
      return {
        ...stats,
        totalPayout,
        totalWinnings: totalPayout,
        totalStaked,
        netProfit: Number((totalPayout - totalStaked).toFixed(2)),
      };
    })
    .sort((a, b) => {
      if (b.totalWinnings !== a.totalWinnings) return b.totalWinnings - a.totalWinnings;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.username.localeCompare(b.username);
    });

  const total = ranking.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const offset = (page - 1) * pageSize;

  const items = ranking.slice(offset, offset + pageSize).map((entry, index) => ({
    rank: offset + index + 1,
    userId: entry.userId,
    username: entry.username,
    settledBets: entry.settledBets,
    wins: entry.wins,
    losses: entry.losses,
    totalWinnings: entry.totalWinnings,
    totalStaked: entry.totalStaked,
    totalPayout: entry.totalPayout,
    netProfit: entry.netProfit,
  }));

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
