import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Play,
  History,
  Settings,
  LogOut,
  FileText,
} from "lucide-react";

const menuItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Start Interview",
    url: "/interview/setup",
    icon: Play,
  },
  {
    title: "Session History",
    url: "/history",
    icon: History,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const getUserInitials = () => {
    if (!user) return "U";
    if (user.firstName && user.lastName) {
      return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`;
    }
    if (user.firstName) return user.firstName.charAt(0);
    if (user.email) return user.email.charAt(0).toUpperCase();
    return "U";
  };

  const getUserName = () => {
    if (!user) return "User";
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.firstName) return user.firstName;
    if (user.email) return user.email.split("@")[0];
    return "User";
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary text-primary-foreground font-bold text-lg">
            N
          </div>
          <div>
            <h2 className="font-semibold text-lg">Nexora</h2>
            <p className="text-xs text-muted-foreground">Interview Prep</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url || location.startsWith(item.url + "/")}
                  >
                    <Link href={item.url} data-testid={`link-sidebar-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t">
        <Link href="/profile" className="flex items-center gap-3 mb-4 hover:bg-muted/50 p-2 rounded-md transition-colors cursor-pointer group">
          <Avatar className="w-10 h-10">
            <AvatarImage src={user?.profileImageUrl || undefined} alt={getUserName()} className="object-cover" />
            <AvatarFallback className="bg-primary/10 text-primary font-medium group-hover:bg-primary/20">
              {getUserInitials()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate" data-testid="text-user-name">{getUserName()}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </Link>
        <SidebarMenuButton
          onClick={() => logout()}
          className="w-full justify-start text-muted-foreground"
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out</span>
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
