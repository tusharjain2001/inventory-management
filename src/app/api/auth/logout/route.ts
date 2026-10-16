import { publicHandler } from "@/lib/http";
import { destroySession, getSessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

export const POST = publicHandler(async () => {
  const user = await getSessionUser();
  await destroySession();
  if (user) {
    await audit(db, { userId: user.id, action: "LOGOUT", entity: "User", entityId: user.id, summary: `${user.name} signed out` });
  }
  return { ok: true };
});
