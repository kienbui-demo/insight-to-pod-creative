import Link from "next/link";
import type { ReactNode } from "react";

const MOCK_CARD_ID = "trend-retro-halloween-cats";

const navigation = [
  { href: "/", label: "Discover" },
  { href: `/trends/${MOCK_CARD_ID}`, label: "Trend Card" },
  { href: `/studio/${MOCK_CARD_ID}`, label: "Design Studio" },
  { href: `/deep-dive/${MOCK_CARD_ID}`, label: "Deep-dive" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <Link className="font-bold tracking-tight text-slate-950" href="/">
            Printerval <span className="text-[#4F46E5]">Intelligence</span>
          </Link>
          <nav aria-label="Product areas" className="flex flex-wrap gap-2 text-sm">
            {navigation.map((item) => (
              <Link
                className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}
