import { NextRequest, NextResponse } from "next/server";
import { searchCorpNames } from "@/lib/opendart";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") || "";
  const names = searchCorpNames(query);
  return NextResponse.json({ names });
}
