"use client";

import { createContext, useContext } from "react";
import { hasAnyPermission, hasPermission, type Permission, type SessionUser } from "@/lib/permissions";

const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** The signed-in user plus permission helpers. Only usable inside the (app) layout. */
export function useSession() {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useSession must be used inside SessionProvider");
  return {
    user,
    can: (perm: Permission) => hasPermission(user, perm),
    canAny: (perms: Permission[]) => hasAnyPermission(user, perms),
  };
}

/** Renders children only if the user has the permission (any of, when an array). */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission | Permission[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { canAny } = useSession();
  return <>{canAny(Array.isArray(permission) ? permission : [permission]) ? children : fallback}</>;
}
