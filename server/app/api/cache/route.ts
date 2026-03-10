import { NextResponse } from "next/server";
import crypto from "crypto";
import { withCORS } from "../_utils/cors";
import prisma from "../_utils/prisma";
import { purgeExpiredFilesForUser } from "../_utils/expiredFiles";

export const runtime = "nodejs";

function makeDemoBlobId(): string {
  return `demo_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * FAST READ-ONLY: /api/cache endpoint
 *
 * Returns precomputed file data from DB. NO corrections, NO background jobs.
 * - Returns files as-is from DB
 * - Returns user-scoped stats only
 * - Never triggers updates or background jobs
 * - Client computes folder paths using its cached folder tree
 *
 * All corrections/updates happen via separate cron endpoint.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const action = searchParams.get("action");
    const starred = searchParams.get("starred");

    if (action === "stats") {
      // Return user-scoped stats only (no global total - too expensive)
      if (!userId) {
        return NextResponse.json(
          { error: "userId required for stats" },
          { status: 400, headers: withCORS(req) },
        );
      }

      // Ensure expired files are purged before computing stats
      await purgeExpiredFilesForUser(userId);

      const [countResult, sumResult] = await Promise.all([
        prisma.file.count({ where: { userId } }),
        prisma.file.aggregate({
          where: { userId },
          _sum: { originalSize: true },
        }),
      ]);
      const totalSizeBytes = sumResult._sum.originalSize ?? 0;

      return NextResponse.json(
        { userTotal: countResult, totalSizeBytes, cached: true },
        { headers: withCORS(req) },
      );
    }

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });

      const isDemoUser = !!user?.username?.startsWith("demo_");

      if (isDemoUser) {
        const demoExpiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        await prisma.file.updateMany({
          where: {
            userId,
            blobId: { startsWith: "demo_" },
            epochs: { in: [50, 365] },
          },
          data: {
            expiresAt: demoExpiry,
            epochs: 3,
            status: "completed",
          },
        });

        // Ensure each demo user has a root-level file visible on Home.
        const rootDemoFile = await prisma.file.findFirst({
          where: {
            userId,
            filename: "home-demo-notes.txt",
            folderId: null,
          },
          select: { id: true },
        });

        if (!rootDemoFile) {
          await prisma.file.create({
            data: {
              userId,
              encryptedUserId: `demo:${userId}`,
              blobId: makeDemoBlobId(),
              filename: "home-demo-notes.txt",
              originalSize: 12_480,
              contentType: "text/plain",
              epochs: 3,
              status: "completed",
              uploadedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
              expiresAt: demoExpiry,
              folderId: null,
              encrypted: false,
              cacheSize: 12_480,
              cached: true,
            },
          });
        }
      } else {
        await purgeExpiredFilesForUser(userId);
      }

      // Fast read: return files as-is, no derived data.
      // Exclude files currently being deleted so a page refresh mid-deletion
      // does not cause them to reappear in the UI.
      const files = await prisma.file.findMany({
        where: {
          userId,
          status: { not: "deleting" },
          ...(starred === "true" && { starred: true }),
        },
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          blobId: true,
          filename: true,
          originalSize: true,
          contentType: true,
          encrypted: true,
          epochs: true,
          uploadedAt: true,
          lastAccessedAt: true,
          status: true,
          s3Key: true,
          folderId: true,
          starred: true,
          expiresAt: true,
        },
      });

      return NextResponse.json(
        { files, count: files.length, cached: true },
        { headers: withCORS(req) },
      );
    }

    return NextResponse.json(
      { error: "Missing userId or action parameter" },
      { status: 400, headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("Cache GET error (DB-backed):", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) },
    );
  }
}

/**
 * Minimal POST handler for legacy client compatibility only.
 * Returns success for all actions (actual work happens elsewhere).
 * - action: 'check' => returns { cached: false, isReadOnly: true }
 * - action: 'delete' => use /api/delete instead
 * - action: 'cleanup' => use cron instead
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body || {};

    switch (action) {
      case "check":
        return NextResponse.json(
          { cached: false, isReadOnly: true },
          { headers: withCORS(req) },
        );
      case "delete":
        return NextResponse.json(
          { message: "Use /api/delete instead" },
          { headers: withCORS(req) },
        );
      case "cleanup":
        return NextResponse.json(
          { message: "Cleanup via cron, not direct requests" },
          { headers: withCORS(req) },
        );
      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400, headers: withCORS(req) },
        );
    }
  } catch (err: any) {
    console.error("Cache POST error (DB-backed):", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) },
    );
  }
}
