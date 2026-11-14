import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";
import { publicManagerSelect, type PublicManager } from "./auth.types.js";

const PASSWORD_COST = 12;

/**
 * A valid bcrypt hash used only to keep failed-login timing consistent for
 * unknown emails. It is not a real account password.
 */
const DUMMY_PASSWORD_HASH = "$2b$12$TpKSc./8lo2O5W33eib8hOGu3FNdijh5IIZw6/9/v00up1HulGsju";

export async function registerManager(input: RegisterInput): Promise<PublicManager> {
  const passwordHash = await bcrypt.hash(input.password, PASSWORD_COST);

  try {
    return await prisma.manager.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
      },
      select: publicManagerSelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email address already exists.");
    }

    throw error;
  }
}

export async function authenticateManager(input: LoginInput): Promise<PublicManager> {
  const manager = await prisma.manager.findUnique({
    where: { email: input.email },
    select: { ...publicManagerSelect, passwordHash: true },
  });

  // Always run bcrypt so unknown emails and wrong passwords take similar time.
  const passwordMatches = await bcrypt.compare(
    input.password,
    manager?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!manager || !passwordMatches) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  const { passwordHash: _passwordHash, ...publicManager } = manager;
  return publicManager;
}

export async function findManagerById(id: string): Promise<PublicManager | null> {
  return prisma.manager.findUnique({
    where: { id },
    select: publicManagerSelect,
  });
}
