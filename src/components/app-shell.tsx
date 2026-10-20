"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  BarChart3,
  Boxes,
  ClipboardList,
  FileMinus,
  FileText,
  FolderTree,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ReceiptIndianRupee,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Truck,
  TriangleAlert,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/components/session-provider";
import { GlobalSearch } from "@/components/global-search";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { NAV } from "@/lib/nav";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/": LayoutDashboard,
  "/sales/orders": ClipboardList,
  "/sales/invoices": FileText,
  "/sales/payments": Wallet,
  "/sales/credit-notes": FileMinus,
  "/customers": Users,
  "/products": Package,
  "/inventory": Boxes,
  "/inventory/stock-in": ArrowDownToLine,
  "/inventory/display": Store,
  "/inventory/adjustments": SlidersHorizontal,
  "/inventory/losses": TriangleAlert,
  "/inventory/ledger": History,
  "/suppliers": Truck,
  "/reports": BarChart3,
  "/admin/users": UserCog,
  "/admin/roles": ShieldCheck,
  "/admin/categories": FolderTree,
  "/admin/settings": Settings,
  "/admin/audit": ScrollText,
  "/admin/login-activity": KeyRound,
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/inventory") return pathname === "/inventory";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { canAny } = useSession();
  return (
    <nav className="flex flex-col gap-4 px-3 py-4 text-sm">
      {NAV.map((section, i) => {
        const items = section.items.filter((item) => canAny(item.permission));
        if (!items.length) return null;
        return (
          <div key={section.title ?? i}>
            {section.title && (
              <div className="mb-1 px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {section.title}
              </div>
            )}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = ICONS[item.href] ?? ReceiptIndianRupee;
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground/80 hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex h-14 items-center gap-2 border-b px-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-mark.png" alt="" className="h-9 w-auto shrink-0" />
      <div className="leading-tight">
        <div className="text-sm font-semibold">Studio Rubina</div>
        <div className="text-[11px] text-muted-foreground">Inventory &amp; Sales</div>
      </div>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  async function logout() {
    await api.post("/api/auth/logout").catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar lg:flex print:hidden">
        <Brand />
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Brand />
          <div className="h-[calc(100vh-3.5rem)] overflow-y-auto">
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-5 print:hidden">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <GlobalSearch />
          <div className="ml-auto shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {user.name
                      .split(" ")
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </span>
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block text-sm">{user.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{user.roleName}</span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setPwOpen(true)}>
                  <KeyRound /> Change password
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={logout}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6 print:p-0">{children}</main>
      </div>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  );
}
