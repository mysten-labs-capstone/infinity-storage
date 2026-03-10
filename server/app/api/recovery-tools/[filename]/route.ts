import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const VALID_FILES = new Set([
  "file-recovery-tool-macos-arm64",
  "file-recovery-tool-macos-x64",
  "file-recovery-tool-win-x64.exe",
  "file-recovery-tool-linux-x64",
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

    const isExe = filename.endsWith(".exe");
    const contentType = isExe
      ? "application/vnd.microsoft.portable-executable"
      : "application/octet-stream";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
