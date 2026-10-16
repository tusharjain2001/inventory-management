import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Prisma.TransactionClient;
export type DbOrTx = PrismaClient | Prisma.TransactionClient;

export { Prisma };
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

/** Interactive transaction with sane timeouts for multi-row stock/sales work. */
export function transaction<T>(fn: (tx: Tx) => Promise<T>) {
  return db.$transaction(fn, { maxWait: 10_000, timeout: 30_000 });
}
