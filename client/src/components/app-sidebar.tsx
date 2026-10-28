import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Mic, History, UserRound, Settings, LogOut, Briefcase } from "lucide-react";
import { Brand } from "@/components/brand";
import { displayName } from "@/lib/types";

const menuItems = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard, testId: "dashboard" },
  { title: "New interview", url: "/interview/setup", icon: Mic, testId: "start-interview" },
  { title: "Past interviews", url: "/history", icon: History, testId: "session-history" },
  { title: "Hiring", url: "/hiring", icon: Briefcase, testId: "hiring" },
  { title: "Profile", url: "/profile", icon: UserRound, testId: "profile" },
  { title: "Account", url: "/account", icon: Settings, testId: "account" },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { setOpenMobile } = useSidebar();
  const name = displayName(user);
  const initials = (user?.firstName?.[0] ?? "") + (user?.lastName?.[0] ?? "") || name.charAt(0).toUpperCase() || "U";

  return (
    <Sidebar>
      <SidebarHeader className="px-4 pb-2 pt-5">
        <Link href="/dashboard" onClick={() => setOpenMobile(false)} aria-label="Nexora overview">
          <Brand subtitle="Interview rehearsal" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const active =
                  location === item.url ||
                  location.startsWith(item.url + "/") ||
                  (item.url === "/dashboard" && location === "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active} className="h-10">
                      <Link
                        href={item.url}
                        onClick={() => setOpenMobile(false)}
                        aria-current={active ? "page" : undefined}
                        data-testid={`link-sidebar-${item.testId}`}
                      >
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
