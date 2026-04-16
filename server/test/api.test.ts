import { describe, it, expect, beforeAll } from "bun:test";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { app } from "../index";
import db from "../src/db";
import { usersTable } from "../src/db/schema";
import { eq } from "drizzle-orm";

const BASE = "http://localhost";

// Shared state across tests (populated by earlier tests, consumed by later ones)
let authToken: string;
let userId: number;
let regularUserId: number;
let regularUserToken: string;
let marketId: number;
let outcomeId: number;
let archiveMarketId: number;
let archiveOutcomeId: number;
let generatedApiKey: string;

beforeAll(async () => {
  // Run migrations to create tables on the in-memory DB
  await migrate(db, { migrationsFolder: "./drizzle" });
});

describe("Auth", () => {
  const username = "testuser";
  const email = "test@example.com";
  const password = "testpass123";

  it("POST /api/auth/register — creates a new user", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      }),
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.username).toBe(username);
    expect(data.email).toBe(email);
    expect(data.token).toBeDefined();
    expect(data.role).toBe("admin");

    authToken = data.token;
    userId = data.id;
  });

  it("POST /api/auth/register — rejects duplicate user", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      }),
    );

    expect(res.status).toBe(409);
  });

  it("POST /api/auth/register — validates input", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "ab", email: "bad", password: "12" }),
      }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it("POST /api/auth/login — logs in with valid credentials", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(userId);
    expect(data.token).toBeDefined();
  });

  it("POST /api/auth/login — rejects invalid credentials", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com", password: "wrong" }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("POST /api/auth/register — creates regular user after first admin", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "regularuser",
          email: "regular@example.com",
          password: "regularpass123",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.role).toBe("user");
    regularUserId = data.id;
    regularUserToken = data.token;
  });
});

describe("Markets", () => {
  it("POST /api/markets — requires auth", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test market",
          outcomes: ["Yes", "No"],
        }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("POST /api/markets — creates a market", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          title: "Will it rain tomorrow?",
          description: "Weather prediction",
          outcomes: ["Yes", "No"],
        }),
      }),
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.title).toBe("Will it rain tomorrow?");
    expect(data.outcomes).toHaveLength(2);

    marketId = data.id;
    outcomeId = data.outcomes[0].id;
  });

  it("POST /api/markets — validates input", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ title: "Hi", outcomes: ["Only one"] }),
      }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it("GET /api/markets — lists markets", async () => {
    const res = await app.handle(new Request(`${BASE}/api/markets`));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items[0].id).toBeDefined();
    expect(data.items[0].title).toBeDefined();
    expect(data.items[0].outcomes).toBeDefined();
    expect(data.pagination.page).toBeDefined();
    expect(data.pagination.pageSize).toBeDefined();
  });

  it("GET /api/markets/:id — returns market detail", async () => {
    const res = await app.handle(new Request(`${BASE}/api/markets/${marketId}`));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(marketId);
    expect(data.title).toBe("Will it rain tomorrow?");
    expect(data.description).toBe("Weather prediction");
    expect(data.outcomes).toHaveLength(2);
  });

  it("GET /api/markets/:id — 404 for nonexistent market", async () => {
    const res = await app.handle(new Request(`${BASE}/api/markets/99999`));

    expect(res.status).toBe(404);
  });
});

describe("Bets", () => {
  it("POST /api/markets/:id/bets — requires auth", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/bets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcomeId, amount: 100 }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("POST /api/markets/:id/bets — places a bet", async () => {
    const userBefore = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });
    expect(userBefore).not.toBeNull();

    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ outcomeId, amount: 50 }),
      }),
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.userId).toBe(userId);
    expect(data.marketId).toBe(marketId);
    expect(data.outcomeId).toBe(outcomeId);
    expect(data.amount).toBe(50);

    const userAfter = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });
    expect(userAfter).not.toBeNull();
    expect(Number(userAfter!.balance)).toBe(Number((userBefore!.balance - 50).toFixed(2)));
  });

  it("POST /api/markets/:id/bets — validates amount", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ outcomeId, amount: -10 }),
      }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it("POST /api/markets/:id/bets — rejects when balance is insufficient", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${regularUserToken}`,
        },
        body: JSON.stringify({ outcomeId, amount: 999999 }),
      }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Insufficient balance");
  });

  it("POST /api/markets/:id/resolve — forbids regular users", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${regularUserToken}`,
        },
        body: JSON.stringify({ outcomeId }),
      }),
    );

    expect(res.status).toBe(403);
  });

  it("POST /api/markets/:id/resolve — allows admin users", async () => {
    const userBefore = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });
    expect(userBefore).not.toBeNull();

    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ outcomeId }),
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.resolvedOutcomeId).toBe(outcomeId);
    expect(data.totalPool).toBe(50);
    expect(data.winningPool).toBe(50);
    expect(data.totalPayout).toBe(50);
    expect(data.payouts.length).toBe(1);
    expect(data.payouts[0].userId).toBe(userId);

    const userAfter = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });
    expect(userAfter).not.toBeNull();
    expect(Number(userAfter!.balance)).toBe(Number((userBefore!.balance + 50).toFixed(2)));
  });

  it("POST /api/markets/:id/archive — prepares a market with multiple bettors", async () => {
    const createRes = await app.handle(
      new Request(`${BASE}/api/markets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          title: "Archived market candidate",
          description: "Will be archived and refunded",
          outcomes: ["Option A", "Option B"],
        }),
      }),
    );

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    archiveMarketId = created.id;
    archiveOutcomeId = created.outcomes[0].id;

    const adminBetRes = await app.handle(
      new Request(`${BASE}/api/markets/${archiveMarketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ outcomeId: archiveOutcomeId, amount: 30 }),
      }),
    );

    expect(adminBetRes.status).toBe(201);

    const regularBetRes = await app.handle(
      new Request(`${BASE}/api/markets/${archiveMarketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${regularUserToken}`,
        },
        body: JSON.stringify({ outcomeId: archiveOutcomeId, amount: 20 }),
      }),
    );

    expect(regularBetRes.status).toBe(201);
  });

  it("POST /api/markets/:id/archive — forbids regular users", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${archiveMarketId}/archive`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${regularUserToken}`,
        },
      }),
    );

    expect(res.status).toBe(403);
  });

  it("POST /api/markets/:id/archive — archives and refunds bettors", async () => {
    const adminBefore = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });
    const regularBefore = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, regularUserId),
    });
    expect(adminBefore).not.toBeNull();
    expect(regularBefore).not.toBeNull();

    const res = await app.handle(
      new Request(`${BASE}/api/markets/${archiveMarketId}/archive`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.archived).toBe(true);
    expect(data.marketId).toBe(archiveMarketId);
    expect(data.totalRefunded).toBe(50);
    expect(data.refunds.length).toBe(2);

    const adminAfter = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });
    const regularAfter = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, regularUserId),
    });
    expect(adminAfter).not.toBeNull();
    expect(regularAfter).not.toBeNull();
    expect(Number(adminAfter!.balance)).toBe(Number((adminBefore!.balance + 30).toFixed(2)));
    expect(Number(regularAfter!.balance)).toBe(Number((regularBefore!.balance + 20).toFixed(2)));

    const detailRes = await app.handle(new Request(`${BASE}/api/markets/${archiveMarketId}`));
    expect(detailRes.status).toBe(200);
    const detailData = await detailRes.json();
    expect(detailData.status).toBe("archived");
  });

  it("GET /api/markets/:id/odds-history — returns snapshots", async () => {
    const res = await app.handle(new Request(`${BASE}/api/markets/${marketId}/odds-history`));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.marketId).toBe(marketId);
    expect(Array.isArray(data.snapshots)).toBe(true);
    expect(data.snapshots.length).toBeGreaterThan(1);
  });
});

describe("User Profile Bets", () => {
  it("GET /api/users/me — returns current user with balance", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/users/me`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(userId);
    expect(data.balance).toBeDefined();
  });

  it("GET /api/users/me/bets — returns active bets with pagination", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/users/me/bets?status=active&page=1&pageSize=20`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.pageSize).toBe(20);
  });

  it("GET /api/users/me/bets — returns resolved bets with win/loss", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/users/me/bets?status=resolved&page=1&pageSize=20`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items[0].didWin).toBeDefined();
  });

  it("GET /api/users/leaderboard — returns paginated ranking", async () => {
    const res = await app.handle(new Request(`${BASE}/api/users/leaderboard?page=1&pageSize=20`));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.pageSize).toBe(20);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items[0].rank).toBeDefined();
    expect(data.items[0].netProfit).toBeDefined();
  });
});

describe("API Keys", () => {
  it("POST /api/users/me/api-key — generates a key", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/users/me/api-key`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.apiKey).toBeDefined();
    expect(data.keyId).toBeDefined();
    generatedApiKey = data.apiKey;
  });

  it("GET /api/users/me — accepts x-api-key", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/users/me`, {
        headers: {
          "x-api-key": generatedApiKey,
        },
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(userId);
  });

  it("POST /api/markets — accepts x-api-key", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": generatedApiKey,
        },
        body: JSON.stringify({
          title: "API key market",
          description: "Created with x-api-key",
          outcomes: ["Yes", "No"],
        }),
      }),
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
  });

  it("DELETE /api/users/me/api-key — revokes key", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/users/me/api-key`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("GET /api/users/me — rejects revoked x-api-key", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/users/me`, {
        headers: {
          "x-api-key": generatedApiKey,
        },
      }),
    );

    expect(res.status).toBe(401);
  });
});

describe("Error handling", () => {
  it("returns 404 JSON for unknown routes", async () => {
    const res = await app.handle(new Request(`${BASE}/nonexistent`));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Not found");
  });
});
