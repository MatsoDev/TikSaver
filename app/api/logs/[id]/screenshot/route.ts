import { NextResponse } from "next/server";
import { getLogById } from "@/lib/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const log = await getLogById(params.id);
  const url = log?.screenshotUrl;

  if (!url) {
    return new NextResponse("Not found", { status: 404 });
  }

  const dataUrl = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(url);
  if (!dataUrl) {
    return NextResponse.redirect(url);
  }

  const body = Buffer.from(dataUrl[2], "base64");
  return new NextResponse(body, {
    headers: {
      "Content-Type": dataUrl[1],
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": "inline",
    },
  });
}
