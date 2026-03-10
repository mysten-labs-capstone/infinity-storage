import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const VALID_FILES = new Set([
  "file-recovery-tool-macos-arm64.zip",
  "file-recovery-tool-macos-x64.zip",
  "file-recovery-tool-win-x64.zip",
  "file-recovery-tool-linux-x64.zip",
]);

export async function GET(
  _request: NextRequest,
  { params }: { params: { filename: string } },
) {
  const { filename } = params;

  if (!VALID_FILES.has(filename)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = path.join(
    process.cwd(),
    "public",
    "recovery-tools",
    filename,
  );

  try {
    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
