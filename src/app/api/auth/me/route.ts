import { handler } from "@/lib/http";

export const GET = handler({}, async ({ user }) => user);
