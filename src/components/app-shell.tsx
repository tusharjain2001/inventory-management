"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  BarChart3,
  Boxes,
  ChevronRight,
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

function NavLink({ href, title, active, onNavigate }: { href: string; title: string; active: boolean; onNavigate?: () => void }) {
  const Icon = ICONS[href] ?? ReceiptIndianRupee;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {title}
    </Link>
  );
}

// Sections collapse to their heading. The section holding the current page opens by default;
// once the user toggles a section, their choice wins.
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { canAny } = useSession();
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  return (
    <nav className="flex flex-col gap-1 px-3 py-4 text-sm">
      {NAV.map((section, i) => {
        const items = section.items.filter((item) => canAny(item.permission));
        if (!items.length) return null;
        if (!section.title) {
          return (
            <ul key={i} className="mb-2 space-y-0.5">
              {items.map((item) => (
                <li key={item.href}>
                  <NavLink href={item.href} title={item.title} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          );
        }
        const title = section.title;
        const hasActive = items.some((item) => isActive(pathname, item.href));
        const open = toggled[title] ?? hasActive;
        return (
          <div key={title}>
            <button
              type="button"
              onClick={() => setToggled((t) => ({ ...t, [title]: !open }))}
              aria-expanded={open}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left font-semibold transition-colors hover:bg-muted",
                hasActive && !open ? "text-primary" : "text-foreground",
              )}
            >
              <span className="flex-1">{title}</span>
              <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
            </button>
            {open && (
              <ul className="mt-0.5 mb-2 ml-2 space-y-0.5 border-l pl-2">
                {items.map((item) => (
                  <li key={item.href}>
                    <NavLink href={item.href} title={item.title} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex h-16 items-center gap-2.5 border-b px-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-mark.png" alt="" className="h-12 w-auto shrink-0" />
      <div className="leading-tight">
        <div className="text-base font-semibold">Studio Rubina</div>
        <div className="text-xs text-muted-foreground">Inventory &amp; Sales</div>
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
          <div className="h-[calc(100vh-4rem)] overflow-y-auto">
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-5 print:hidden">
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
                  <KeyRound /> Change Password
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={logout}>
                  <LogOut /> Sign Out
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
