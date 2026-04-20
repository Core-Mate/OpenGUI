import { Prisma } from "../generated/prisma/client.js";

export * from "../generated/prisma/client.js"; // exports generated types from prisma
export { prisma } from "./client.js"; // exports instance of prisma
export const Decimal = Prisma.Decimal; // backward-compatible Decimal constructor export
