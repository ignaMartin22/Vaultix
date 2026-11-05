import { requireUser } from "@/lib/server/auth";
import { disputesApi } from "@/lib/server/disputes";
import { withErrors } from "@/lib/server/errors";

type Ctx = { params: Promise<{ pda: string }> };

/**
 * Buyer or seller, while Disputed. Body: `{ kind: "note", note }` or
 * `{ kind: "photo" | "video", contentType, size, note? }` → `{ id, upload? }`
 * (PUT the file to `upload.signedUrl`).
 */
export const POST = withErrors(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req);
  const { pda } = await params;
  const body: unknown = await req.json().catch(() => null);
  return Response.json(await disputesApi().addEvidence(user, pda, body), { status: 201 });
});

/** Buyer, seller or arbiter: `{ items }` with 10-minute signed URLs. */
export const GET = withErrors(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req);
  const { pda } = await params;
  return Response.json(await disputesApi().listEvidence(user, pda));
});
