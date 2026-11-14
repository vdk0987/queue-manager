import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";

const VALID_ACCOUNT = {
  name: "Ada Lovelace",
  email: "ada@queuepilot.test",
  password: "Analytical1",
};

const cookieHeader = (response: request.Response): string => {
  const header = response.headers["set-cookie"];
  return Array.isArray(header) ? header.join("; ") : String(header ?? "");
};

describe("GET /api/health", () => {
  it("reports the service and database as healthy", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      service: "queuepilot-api",
      database: "connected",
    });
  });
});

describe("POST /api/auth/register", () => {
  it("creates a manager, returns a safe payload and starts a session", async () => {
    const agent = request.agent(app);
    const response = await agent.post("/api/auth/register").send(VALID_ACCOUNT);

    expect(response.status).toBe(201);
    expect(response.body.manager).toMatchObject({
      name: VALID_ACCOUNT.name,
      email: VALID_ACCOUNT.email,
    });
    expect(response.body.manager.id).toEqual(expect.any(String));
    expect(response.body.manager).not.toHaveProperty("passwordHash");
    expect(response.body.manager).not.toHaveProperty("password");

    const cookie = cookieHeader(response);
    expect(cookie).toContain("qp_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");

    const meResponse = await agent.get("/api/auth/me");
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.manager.email).toBe(VALID_ACCOUNT.email);
  });

  it("stores a bcrypt hash rather than the plain password", async () => {
    await request(app).post("/api/auth/register").send(VALID_ACCOUNT);
    const manager = await prisma.manager.findUnique({
      where: { email: VALID_ACCOUNT.email },
    });

    expect(manager).not.toBeNull();
    expect(manager?.passwordHash).not.toBe(VALID_ACCOUNT.password);
    expect(manager?.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it("normalises names and email addresses", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        ...VALID_ACCOUNT,
        name: "  Ada   Lovelace  ",
        email: "  ADA@QueuePilot.Test ",
      });

    expect(response.status).toBe(201);
    expect(response.body.manager.name).toBe("Ada Lovelace");
    expect(response.body.manager.email).toBe("ada@queuepilot.test");
  });

  it("rejects a duplicate email address regardless of casing", async () => {
    await request(app).post("/api/auth/register").send(VALID_ACCOUNT);
    const response = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_ACCOUNT, email: "ADA@QUEUEPILOT.TEST" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects invalid input with field-level errors", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "A", email: "not-an-email", password: "short" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details.fieldErrors).toMatchObject({
      name: expect.any(Array),
      email: expect.any(Array),
      password: expect.any(Array),
    });
  });

  it("requires letters and numbers in the password", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_ACCOUNT, password: "onlyletters" });

    expect(response.status).toBe(400);
    expect(response.body.error.details.fieldErrors.password.join(" ")).toMatch(/number/i);
  });
});

describe("POST /api/auth/login", () => {
  it("signs in with normalised credentials", async () => {
    await request(app).post("/api/auth/register").send(VALID_ACCOUNT);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: " ADA@QUEUEPILOT.TEST ", password: VALID_ACCOUNT.password });

    expect(response.status).toBe(200);
    expect(response.body.manager.email).toBe(VALID_ACCOUNT.email);
    expect(cookieHeader(response)).toContain("qp_session=");
  });

  it("rejects an incorrect password without revealing whether the account exists", async () => {
    await request(app).post("/api/auth/register").send(VALID_ACCOUNT);

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: VALID_ACCOUNT.email, password: "WrongPassword1" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@queuepilot.test", password: "WrongPassword1" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("GET /api/auth/me", () => {
  it("rejects unauthenticated requests", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects malformed session tokens", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", "qp_session=definitely-not-a-jwt");

    expect(response.status).toBe(401);
  });

  it("accepts a valid bearer token", async () => {
    const manager = await prisma.manager.create({
      data: {
        name: "Grace Hopper",
        email: "grace@queuepilot.test",
        passwordHash: "$2b$12$TpKSc./8lo2O5W33eib8hOGu3FNdijh5IIZw6/9/v00up1HulGsju",
      },
    });

    const token = jwt.sign({ type: "manager" }, env.jwtSecret, {
      subject: manager.id,
      expiresIn: "1h",
      issuer: "queuepilot-api",
      audience: "queuepilot-web",
    });

    const response = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.manager.email).toBe("grace@queuepilot.test");
  });
});

describe("POST /api/auth/logout", () => {
  it("ends the session and blocks subsequent protected requests", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(VALID_ACCOUNT);

    const logoutResponse = await agent.post("/api/auth/logout");
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body).toEqual({ success: true });

    const meResponse = await agent.get("/api/auth/me");
    expect(meResponse.status).toBe(401);
  });
});

describe("request hardening", () => {
  it("rejects state-changing requests from unknown browser origins", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://evil.example")
      .send({ email: VALID_ACCOUNT.email, password: VALID_ACCOUNT.password });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("returns a consistent error for unknown routes", async () => {
    const response = await request(app).get("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("returns a consistent error for malformed JSON", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });
});
