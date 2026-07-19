import React from 'react';
import { Link, useLocation } from 'wouter';
import { 
  Home, 
  Briefcase, 
  Archive, 
  History, 
  ListTodo, 
  Users
} from 'lucide-react';
import avatarUrl from '@assets/1783969794751_1784416923551.png';

const navItems = [
  { href: '/', icon: Home, label: 'Companion' },
  { href: '/dashboard', icon: Briefcase, label: 'Portfolio Dashboard' },
  { href: '/vault', icon: Archive, label: 'Master Vault' },
  { href: '/audit', icon: History, label: 'Change Audit' },
  { href: '/tasks', icon: ListTodo, label: 'Task Queue' },
  { href: '/council', icon: Users, label: 'AI Council' },
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const [location] = useLocation();

  return (
    <div className="w-64 flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      <div className="flex flex-col items-center pt-8 pb-6 px-6 border-b border-sidebar-border">
        <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/20 shadow-md">
          <img src={avatarUrl} alt="Kee Avatar" className="w-full h-full object-cover" />
        </div>
        <h1 className="mt-4 font-serif text-xl font-medium tracking-wide text-primary">Kee</h1>
        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider font-semibold">Private Intelligence</p>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
          return (
            <Link 
              key={item.href} 
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-200 ${
                isActive 
                  ? 'bg-primary/10 text-primary font-medium' 
                  : 'text-sidebar-foreground/70 hover:bg-black/5 hover:text-sidebar-foreground'
              }`}
            >
              <item.icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-sidebar-foreground/50'}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border mt-auto">
        <p className="text-[10px] text-muted-foreground text-center uppercase tracking-widest font-mono">
          Kee v1.0 &mdash; Restricted
        </p>
      </div>
    </div>
  );
}
