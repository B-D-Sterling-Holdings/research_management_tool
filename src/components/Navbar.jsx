'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, Search } from 'lucide-react';

const navLinks = [
  { href: '/holdings', label: 'Our Holdings', icon: Briefcase },
  { href: '/research', label: 'Research Management', icon: Search },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-[#1e1e1e]">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#4a9eff] to-[#2563eb] flex items-center justify-center">
            <span className="text-white font-bold text-sm">RM</span>
          </div>
          <span className="text-[#e8e8e8] font-semibold text-lg tracking-tight">
            Research Manager
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium no-underline transition-all
                  ${isActive
                    ? 'bg-[#4a9eff]/12 text-[#4a9eff] border border-[#4a9eff]/25'
                    : 'text-[#a0a0a0] hover:text-[#e8e8e8] hover:bg-[#1a1a1a] border border-transparent'
                  }
                `}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
