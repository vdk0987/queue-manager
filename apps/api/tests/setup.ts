import { afterAll, beforeAll, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma";

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.manager.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
