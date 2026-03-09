import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";
import { hashAuthKey } from "../../_utils/password";

export const runtime = "nodejs";

const DEMO_STARTING_BALANCE = 250;

function randomHex(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

function makeDemoBlobId(): string {
  return `demo_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: NextRequest) {
  try {
    const now = new Date();
    const demoFileExpiry = new Date(now.getTime() + 50 * 24 * 60 * 60 * 1000);
    const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e5)
      .toString(36)
      .padStart(3, "0")}`;
    const username = `demo_${suffix}`.toLowerCase();

    const privateKey = randomHex(32);
    const authKey = randomHex(32);
    const salt = randomHex(32);

    const authKeyHash = await hashAuthKey(authKey);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          authKeyHash,
          salt,
          encryptedMasterKey: `demo-master-${randomHex(24)}`,
          balance: DEMO_STARTING_BALANCE,
        },
        select: {
          id: true,
          username: true,
          salt: true,
          encryptedMasterKey: true,
        },
      });

      await tx.transaction.create({
        data: {
          userId: user.id,
          amount: DEMO_STARTING_BALANCE,
          type: "credit",
          description: "Demo credits",
          balanceAfter: DEMO_STARTING_BALANCE,
        },
      });

      const projectsFolder = await tx.folder.create({
        data: {
          userId: user.id,
          name: "Projects",
          color: "#14b8a6",
        },
      });

      const receiptsFolder = await tx.folder.create({
        data: {
          userId: user.id,
          name: "Receipts",
          color: "#3b82f6",
        },
      });

      const q1Folder = await tx.folder.create({
        data: {
          userId: user.id,
          name: "Q1 Reports",
          parentId: projectsFolder.id,
          color: "#22c55e",
        },
      });

      const demoEncryptedUserId = `demo:${user.id}`;
      const strategyDeck = await tx.file.create({
        data: {
          userId: user.id,
          encryptedUserId: demoEncryptedUserId,
          blobId: makeDemoBlobId(),
          filename: "strategy-deck.txt",
          originalSize: 8_192,
          contentType: "text/plain",
          epochs: 50,
          status: "completed",
          uploadedAt: now,
          expiresAt: demoFileExpiry,
          folderId: projectsFolder.id,
          encrypted: false,
          cacheSize: 8_192,
          cached: true,
        },
      });

      await tx.file.create({
        data: {
          userId: user.id,
          encryptedUserId: demoEncryptedUserId,
          blobId: makeDemoBlobId(),
          filename: "q1-financials.txt",
          originalSize: 10_240,
          contentType: "text/plain",
          epochs: 50,
          status: "completed",
          uploadedAt: now,
          expiresAt: demoFileExpiry,
          folderId: q1Folder.id,
          encrypted: false,
          cacheSize: 10_240,
          cached: true,
          starred: true,
        },
      });

      await tx.file.create({
        data: {
          userId: user.id,
          encryptedUserId: demoEncryptedUserId,
          blobId: makeDemoBlobId(),
          filename: "invoice-mar-2026.txt",
          originalSize: 5_120,
          contentType: "text/plain",
          epochs: 50,
          status: "completed",
          uploadedAt: now,
          expiresAt: demoFileExpiry,
          folderId: receiptsFolder.id,
          encrypted: false,
          cacheSize: 5_120,
          cached: true,
        },
      });

      await tx.file.create({
        data: {
          userId: user.id,
          encryptedUserId: demoEncryptedUserId,
          blobId: makeDemoBlobId(),
          filename: "home-demo-notes.txt",
          originalSize: 12_480,
          contentType: "text/plain",
          epochs: 50,
          status: "completed",
          uploadedAt: now,
          expiresAt: demoFileExpiry,
          folderId: null,
          encrypted: false,
          cacheSize: 12_480,
          cached: true,
        },
      });

      await tx.share.create({
        data: {
          fileId: strategyDeck.id,
          blobId: strategyDeck.blobId,
          createdBy: user.id,
          expiresAt: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
          maxDownloads: 25,
        },
      });

      return user;
    });

    return NextResponse.json(
      {
        success: true,
        demo: true,
        user: created,
        privateKey,
      },
      { status: 201, headers: withCORS(req) },
    );
  } catch (error) {
    console.error("[POST /api/auth/demo] Error:", error);
    return NextResponse.json(
      { error: "Failed to create demo account" },
      { status: 500, headers: withCORS(req) },
    );
  }
}
