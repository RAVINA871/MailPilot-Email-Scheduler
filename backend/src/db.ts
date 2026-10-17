import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.js";
import { config } from "./config.js";
export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
export type Db = typeof db;
