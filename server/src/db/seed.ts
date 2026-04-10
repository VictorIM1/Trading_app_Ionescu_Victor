import { Database } from "bun:sqlite";
import { faker } from "@faker-js/faker";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import { hashPassword } from "../lib/auth";

const db = drizzle(new Database(process.env.DB_FILE_NAME || "database.sqlite"), {
  schema,
});

const USER_COUNT = 5_000;
const MARKET_COUNT = 3_000;
const SHARED_PASSWORD = "password123";
const USER_INSERT_BATCH_SIZE = 250;
const BET_INSERT_BATCH_SIZE = 1_000;
const MARKET_CATEGORIES = [
  "crypto",
  "sports",
  "politics",
  "business",
  "science",
  "weather",
] as const;
const YES_NO_OUTCOMES = ["Yes", "No"];
const MARKET_STATUS_OPTIONS = ["active", "active", "active", "resolved"] as const;

type MarketStatus = (typeof MARKET_STATUS_OPTIONS)[number];

type UserInsert = typeof schema.usersTable.$inferInsert;
type UserRow = typeof schema.usersTable.$inferSelect;
type MarketInsert = typeof schema.marketsTable.$inferInsert;
type MarketOutcomeInsert = typeof schema.marketOutcomesTable.$inferInsert;
type BetInsert = typeof schema.betsTable.$inferInsert;

type SeededUser = {
  id: number;
  username: string;
  email: string;
  password: string;
  balance: number;
  remainingBalance: number;
};

type GeneratedMarket = {
  title: string;
  description: string;
  status: MarketStatus;
  outcomes: string[];
};

type CreatedMarket = {
  id: number;
  title: string;
  status: MarketStatus;
  outcomeIds: number[];
};

faker.seed(20260311);

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function createRandomUser(runId: string, index: number): UserInsert {
  const sex = faker.person.sexType();
  const firstName = faker.person.firstName(sex);
  const lastName = faker.person.lastName();
  const usernameBase = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9]+/g, ".");
  const username = `${usernameBase}.${runId}.${index}`;
  const email = faker.internet.email({
    firstName,
    lastName,
    provider: "seed.local",
  });
  const normalizedEmail = `${email.split("@")[0]}.${runId}.${index}@seed.local`.toLowerCase();

  return {
    username,
    email: normalizedEmail,
    passwordHash: "",
  };
}

function createMarketTitle(category: (typeof MARKET_CATEGORIES)[number]) {
  switch (category) {
    case "crypto":
      return `Will ${faker.finance.currencyCode()} trade above ${faker.number.int({ min: 20, max: 250 })} by ${faker.date
        .soon({ days: 180 })
        .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}?`;
    case "sports":
      return `Will the ${faker.helpers.arrayElement(["Lions", "Storm", "Falcons", "Tigers", "Sharks"])} win ${faker.helpers.arrayElement(["their next match", "the division", "the championship"])}?`;
    case "politics":
      return `Will ${faker.location.city()} approve ${faker.helpers.arrayElement(["the housing measure", "the transit bond", "the tax proposal", "the school budget"])} this year?`;
    case "business":
      return `Will ${faker.company.name()} launch ${faker.helpers.arrayElement(["an IPO", "a new AI product", "a mobile app", "a subscription tier"])} before Q${faker.number.int({ min: 2, max: 4 })}?`;
    case "science":
      return `Will ${faker.helpers.arrayElement(["fusion", "gene therapy", "battery tech", "space robotics"])} hit ${faker.helpers.arrayElement(["a public milestone", "commercial rollout", "regulatory approval", "a new record"])} this year?`;
    case "weather":
      return `Will ${faker.location.city()} record ${faker.helpers.arrayElement(["rain", "snow", "temperatures above 35C", "temperatures below -5C"])} this month?`;
  }
}

function createMarketDescription(category: (typeof MARKET_CATEGORIES)[number]) {
  switch (category) {
    case "crypto":
      return "Speculation on a major digital asset crossing a specific price target before the deadline.";
    case "sports":
      return "A sports market based on an upcoming result with plenty of fan-driven volume.";
    case "politics":
      return "A local politics market that resolves using the official public election or vote result.";
    case "business":
      return "A company milestone market focused on launches, capital events, or other business developments.";
    case "science":
      return "A research and innovation market driven by publicly reported breakthroughs and milestones.";
    case "weather":
      return "A weather market tied to publicly recorded local conditions over a defined time window.";
  }
}

function createMarketOutcomes(category: (typeof MARKET_CATEGORIES)[number]) {
  if (category === "sports") {
    return faker.helpers.arrayElement([
      ["Win", "Lose"],
      ["Yes", "No"],
      ["Win in regulation", "Win after overtime", "No win"],
    ]);
  }

  if (category === "politics") {
    return faker.helpers.arrayElement([
      ["Pass", "Fail"],
      ["Yes", "No"],
      ["Under 50%", "50%-60%", "Over 60%"],
    ]);
  }

  if (category === "crypto" || category === "business") {
    return faker.helpers.arrayElement([
      YES_NO_OUTCOMES,
      ["Below target", "Hits target", "Exceeds target"],
    ]);
  }

  return faker.helpers.arrayElement([YES_NO_OUTCOMES, ["Yes", "No", "Unclear"]]);
}

function createRandomMarket(): GeneratedMarket {
  const category = faker.helpers.arrayElement(MARKET_CATEGORIES);

  return {
    title: createMarketTitle(category),
    description: createMarketDescription(category),
    status: faker.helpers.arrayElement(MARKET_STATUS_OPTIONS),
    outcomes: createMarketOutcomes(category),
  };
}

async function deleteAllData() {
  console.log("Deleting all data...");

  await db.delete(schema.betsTable);
  await db.delete(schema.marketOutcomesTable);
  await db.delete(schema.marketsTable);
  await db.delete(schema.usersTable);

  console.log("All data deleted.\n");
}

async function insertUsers() {
  console.log(`Creating ${USER_COUNT} users...`);

  const passwordHash = await hashPassword(SHARED_PASSWORD);
  const runId = faker.string.alphanumeric({ length: 6, casing: "lower" });
  const userValues = Array.from({ length: USER_COUNT }, (_, index) => {
    const user = createRandomUser(runId, index + 1);
    return {
      ...user,
      passwordHash,
    };
  });

  const insertedUsers: UserRow[] = [];

  for (const batch of chunkArray(userValues, USER_INSERT_BATCH_SIZE)) {
    const created = await db.insert(schema.usersTable).values(batch).returning();
    insertedUsers.push(...created);
  }

  const seededUsers: SeededUser[] = insertedUsers.map((user) => ({
    balance: faker.number.int({ min: 500, max: 10_000 }),
    id: user.id,
    username: user.username,
    email: user.email,
    password: SHARED_PASSWORD,
    remainingBalance: 0,
  }));

  for (const seededUser of seededUsers) {
    seededUser.remainingBalance = seededUser.balance;
  }

  for (const seededUser of seededUsers) {
    await db
      .update(schema.usersTable)
      .set({ balance: seededUser.balance })
      .where(eq(schema.usersTable.id, seededUser.id));
  }

  console.log(`Created ${seededUsers.length} users.`);

  return seededUsers;
}

async function insertMarkets(users: SeededUser[]) {
  console.log(`\nCreating ${MARKET_COUNT} markets with outcomes...`);

  const createdMarkets: CreatedMarket[] = [];
  let createdOutcomeCount = 0;

  for (let index = 0; index < MARKET_COUNT; index++) {
    const marketData = createRandomMarket();
    const creator = faker.helpers.arrayElement(users);
    const marketInsert: MarketInsert = {
      title: marketData.title,
      description: marketData.description,
      status: marketData.status,
      createdBy: creator.id,
    };

    const [createdMarket] = await db.insert(schema.marketsTable).values(marketInsert).returning();
    const outcomeValues: MarketOutcomeInsert[] = marketData.outcomes.map((title, position) => ({
      marketId: createdMarket.id,
      title,
      position,
    }));
    const createdOutcomes = await db
      .insert(schema.marketOutcomesTable)
      .values(outcomeValues)
      .returning();

    createdOutcomeCount += createdOutcomes.length;

    const outcomeIds = createdOutcomes.map((outcome) => outcome.id);

    if (marketData.status === "resolved") {
      const resolvedOutcomeId = faker.helpers.arrayElement(outcomeIds);

      await db
        .update(schema.marketsTable)
        .set({ resolvedOutcomeId })
        .where(eq(schema.marketsTable.id, createdMarket.id));
    }

    createdMarkets.push({
      id: createdMarket.id,
      title: createdMarket.title,
      status: marketData.status,
      outcomeIds,
    });

    if ((index + 1) % 100 === 0 || index === MARKET_COUNT - 1) {
      console.log(`  ${index + 1}/${MARKET_COUNT} markets created`);
    }
  }

  console.log(`Created ${createdMarkets.length} markets and ${createdOutcomeCount} outcomes.`);

  return {
    createdMarkets,
    createdOutcomeCount,
  };
}

function createBetAmount(user: SeededUser) {
  if (user.remainingBalance <= 5) {
    return 0;
  }

  const maxAmount = Math.min(user.remainingBalance, 250);
  const minAmount = Math.min(5, maxAmount);

  return faker.number.int({
    min: minAmount,
    max: maxAmount,
    multipleOf: 5,
  });
}

async function insertBets(users: SeededUser[], markets: CreatedMarket[]) {
  console.log("\nCreating bets...");

  const betValues: BetInsert[] = [];

  for (const market of markets) {
    const participantCount = faker.number.int({ min: 8, max: 40 });
    const participants = faker.helpers.arrayElements(
      users.filter((user) => user.remainingBalance >= 5),
      participantCount,
    );

    for (const user of participants) {
      const betCountForUser = faker.number.int({ min: 1, max: 3 });

      for (let index = 0; index < betCountForUser; index++) {
        if (user.remainingBalance < 5) {
          break;
        }

        const amount = createBetAmount(user);

        if (amount < 5) {
          break;
        }

        const outcomeId = faker.helpers.arrayElement(market.outcomeIds);
        const createdAt = faker.date.between({
          from: new Date("2025-01-01T00:00:00.000Z"),
          to: new Date(),
        });

        betValues.push({
          userId: user.id,
          marketId: market.id,
          outcomeId,
          amount,
          createdAt,
        });

        user.remainingBalance -= amount;
      }
    }
  }

  for (const batch of chunkArray(betValues, BET_INSERT_BATCH_SIZE)) {
    await db.insert(schema.betsTable).values(batch);
  }

  console.log(`Created ${betValues.length} bets.`);

  return betValues.length;
}

function printSeedSummary(
  users: SeededUser[],
  marketCount: number,
  outcomeCount: number,
  betCount: number,
) {
  console.log("\n============================================================");
  console.log("SEEDING COMPLETE");
  console.log("============================================================");
  console.log(`Users:    ${users.length}`);
  console.log(`Markets:  ${marketCount}`);
  console.log(`Outcomes: ${outcomeCount}`);
  console.log(`Bets:     ${betCount}`);

  console.log("\nSample login credentials:");
  for (const user of users.slice(0, 5)) {
    console.log(`  ${user.email} / ${user.password}`);
  }

  console.log("\nShared password for all seeded users:");
  console.log(`  ${SHARED_PASSWORD}`);
  console.log("============================================================\n");
}

async function seedDatabase() {
  console.log("Seeding database...\n");

  const users = await insertUsers();
  const { createdMarkets, createdOutcomeCount } = await insertMarkets(users);
  const betCount = await insertBets(users, createdMarkets);

  printSeedSummary(users, createdMarkets.length, createdOutcomeCount, betCount);
}

async function main() {
  const command = process.argv[2];

  if (command === "reset") {
    await deleteAllData();
    await seedDatabase();
  } else if (command === "seed") {
    await seedDatabase();
  } else if (command === "delete") {
    await deleteAllData();
  } else {
    console.log("Usage:");
    console.log("  bun run db:seed        # Seed with generated fake data");
    console.log("  bun run db:reset       # Delete all and reseed");
    console.log("  bun run db:delete      # Delete all data");
  }
}

main().catch(console.error);
