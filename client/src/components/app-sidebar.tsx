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
import { LayoutDashboard, Mic, History, UserRound, Settings, LogOut, Briefcase, Users, Mail, BarChart3, Plug, type LucideIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { displayName } from "@/lib/types";
import { useOrganization } from "@/lib/hiring";

interface Item {
  title: string;
  url: string;
  icon: LucideIcon;
  testId: string;
}

const hiringItems: Item[] = [
  { title: "Jobs and candidates", url: "/hiring", icon: Briefcase, testId: "hiring" },
  { title: "Analytics", url: "/hiring/analytics", icon: BarChart3, testId: "hiring-analytics" },
  { title: "Team", url: "/hiring/team", icon: Users, testId: "hiring-team" },
  { title: "Email templates", url: "/hiring/templates", icon: Mail, testId: "hiring-templates" },
  { title: "Integrations", url: "/hiring/integrations", icon: Plug, testId: "hiring-integrations" },
];

const practiceItems: Item[] = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard, testId: "dashboard" },
  { title: "New interview", url: "/interview/setup", icon: Mic, testId: "start-interview" },
  { title: "Past interviews", url: "/history", icon: History, testId: "session-history" },
];

const accountItems: Item[] = [
  { title: "Profile", url: "/profile", icon: UserRound, testId: "profile" },
  { title: "Account", url: "/account", icon: Settings, testId: "account" },
];

const OWN_HIRING_PAGES = ["/hiring/team", "/hiring/templates", "/hiring/analytics", "/hiring/integrations"];

function isActive(item: Item, location: string) {
  if (location === item.url) return true;
  if (item.url === "/dashboard") return location === "/";
  if (item.url === "/hiring") return location.startsWith("/hiring/") && !OWN_HIRING_PAGES.some((p) => location.startsWith(p));
  return location.startsWith(item.url + "/");
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { setOpenMobile } = useSidebar();
  const { data: org } = useOrganization();
  const hasCompany = !!org;
  const close = () => setOpenMobile(false);
  const name = displayName(user);
  const initials = (user?.firstName?.[0] ?? "") + (user?.lastName?.[0] ?? "") || name.charAt(0).toUpperCase() || "U";

  return (
    <Sidebar>
      <SidebarHeader className="px-4 pb-2 pt-5">
        <Link href={hasCompany ? "/hiring" : "/dashboard"} onClick={close} aria-label="Nexora home">
          <Brand subtitle={org ? org.name : "Interview practice"} />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {hasCompany ? (
          <>
            <NavGroup label="Hiring" items={hiringItems} location={location} onNavigate={close} />
            <NavGroup label="Practice" items={practiceItems} location={location} onNavigate={close} />
          </>
        ) : (
          <>
            <NavGroup label="Practice" items={practiceItems} location={location} onNavigate={close} />
            <NavGroup label="For companies" items={hiringItems.slice(0, 1).map((i) => ({ ...i, title: "Hire with Nexora" }))} location={location} onNavigate={close} />
          </>
        )}
        <NavGroup label="You" items={accountItems} location={location} onNavigate={close} />
      </SidebarContent>

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
