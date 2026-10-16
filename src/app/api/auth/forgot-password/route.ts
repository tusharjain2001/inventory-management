import { z } from "zod";
import { db } from "@/lib/db";
import { body, publicHandler } from "@/lib/http";
import { newToken, sha256 } from "@/lib/auth";
import { sendMail } from "@/lib/mail";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email") });
const TOKEN_MINUTES = 30;

// Always answers the same way so the form cannot be used to discover which emails exist.
export const POST = publicHandler(async (req) => {
  const { email } = await body(req, schema);
  const user = await db.user.findUnique({ where: { email } });
  if (user?.isActive) {
    const token = newToken();
    await db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TOKEN_MINUTES * 60_000) },
    });
    const base = process.env.APP_URL || req.nextUrl.origin;
    const link = `${base}/reset-password?token=${token}`;
    await sendMail(
      user.email,
      "Reset your password",
      `Hi ${user.name},\n\nUse this link to set a new password (valid for ${TOKEN_MINUTES} minutes):\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
      `<p>Hi ${user.name},</p><p>Use this link to set a new password (valid for ${TOKEN_MINUTES} minutes):</p><p><a href="${link}">${link}</a></p><p>If you did not ask for this, you can ignore this email.</p>`,
    );
  }
  return { ok: true, message: "If that email is registered, a reset link has been sent." };
});
