import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Mic, History, UserRound, Settings, LogOut, Briefcase, Users, Mail, BarChart3, Plug, CreditCard, ShieldCheck, type LucideIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { displayName } from "@/lib/types";
import { useOrganization } from "@/lib/hiring";
import type { AccountType } from "@/lib/types";

interface Item {
  title: string;
  url: string;
  icon: LucideIcon;
  testId: string;
}

const hiringItems: Item[] = [
  { title: "Jobs and candidates", url: "/hiring", icon: Briefcase, testId: "hiring" },
  { title: "Analytics", url: "/hiring/analytics", icon: BarChart3, testId: "hiring-analytics" },
];

const companyItems: Item[] = [
  { title: "Team", url: "/hiring/team", icon: Users, testId: "hiring-team" },
  { title: "Email templates", url: "/hiring/templates", icon: Mail, testId: "hiring-templates" },
  { title: "Integrations", url: "/hiring/integrations", icon: Plug, testId: "hiring-integrations" },
  { title: "Privacy and activity", url: "/hiring/privacy", icon: ShieldCheck, testId: "hiring-privacy" },
  { title: "Plan and billing", url: "/hiring/billing", icon: CreditCard, testId: "hiring-billing" },
];

const practiceItems: Item[] = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard, testId: "dashboard" },
  { title: "New interview", url: "/interview/setup", icon: Mic, testId: "start-interview" },
  { title: "Past interviews", url: "/history", icon: History, testId: "session-history" },
];

const profileItem: Item = { title: "Profile", url: "/profile", icon: UserRound, testId: "profile" };
const accountItem: Item = { title: "Account", url: "/account", icon: Settings, testId: "account" };

// Hiring pages with their own nav entry; every other /hiring/... page belongs under "Jobs and candidates".
const OWN_HIRING_PAGES = [...hiringItems, ...companyItems].map((i) => i.url).filter((url) => url !== "/hiring");

function isActive(item: Item, location: string) {
  if (location === item.url) return true;
  if (item.url === "/dashboard") return location === "/";
  if (item.url === "/hiring") return location.startsWith("/hiring/") && !OWN_HIRING_PAGES.some((p) => location.startsWith(p));
  return location.startsWith(item.url + "/");
}

export function AppSidebar({ workspace }: { workspace: AccountType }) {
  return workspace === "employer" ? <HiringSidebar /> : <PracticeSidebar />;
}

function PracticeSidebar() {
  return (
    <WorkspaceSidebar home="/dashboard" subtitle="Interview practice">
      {(nav) => (
        <>
          <NavGroup label="Practice" items={practiceItems} {...nav} />
          <NavGroup label="You" items={[profileItem, accountItem]} {...nav} />
        </>
      )}
    </WorkspaceSidebar>
  );
}

// Before the company exists there's only the page that creates it.
function HiringSidebar() {
  const { data: org } = useOrganization();
  return (
    <WorkspaceSidebar home="/hiring" subtitle={org ? org.name : "Hiring"}>
      {(nav) => (
        <>
          <NavGroup label="Hiring" items={org ? hiringItems : hiringItems.slice(0, 1)} {...nav} />
          {org && <NavGroup label="Company" items={companyItems} {...nav} />}
          <NavGroup label="You" items={[accountItem]} {...nav} />
        </>
      )}
    </WorkspaceSidebar>
  );
}

type Nav = { location: string; onNavigate: () => void };

function WorkspaceSidebar({ home, subtitle, children }: { home: string; subtitle: string; children: (nav: Nav) => React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  const name = displayName(user);
  const initials = (user?.firstName?.[0] ?? "") + (user?.lastName?.[0] ?? "") || name.charAt(0).toUpperCase() || "U";

  return (
    <Sidebar>
      <SidebarHeader className="px-4 pb-2 pt-5">
        <Link href={home} onClick={close} aria-label="Nexora home">
          <Brand subtitle={subtitle} />
        </Link>
      </SidebarHeader>

      <SidebarContent>{children({ location, onNavigate: close })}</SidebarContent>

      <SidebarFooter className="border-t p-3">
        <div className="flex items-center gap-3 rounded-lg p-2">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user?.profileImageUrl || undefined} alt="" className="object-cover" />
            <AvatarFallback className="bg-accent font-semibold text-accent-foreground">{initials.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" data-testid="text-user-name">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <SidebarMenuButton onClick={() => logout()} className="text-muted-foreground" data-testid="button-logout">
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}

function NavGroup({ label, items, location, onNavigate }: { label: string; items: Item[]; location: string; onNavigate: () => void }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActive(item, location);
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={active} className="h-9">
                  <Link href={item.url} onClick={onNavigate} aria-current={active ? "page" : undefined} data-testid={`link-sidebar-${item.testId}`}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
