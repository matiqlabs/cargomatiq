"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen" style={{ background: "#F8FAFC" }}>
      {/* Background aurora blobs — fixed, behind everything */}
      <div aria-hidden className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute -top-24 right-0 w-[600px] h-[500px] rounded-full opacity-[0.055] blur-[80px]"
          style={{ background: "radial-gradient(ellipse, #22D3EE 0%, #8B5CF6 50%, transparent 80%)" }}
        />
        <div
          className="absolute bottom-0 left-[20%] w-[480px] h-[380px] rounded-full opacity-[0.04] blur-[80px]"
          style={{ background: "radial-gradient(ellipse, #2DD4BF 0%, #312E81 60%, transparent 85%)" }}
        />
      </div>

      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      <div
        className="transition-all duration-300 ease-in-out min-h-screen flex flex-col"
        style={{ paddingLeft: collapsed ? 76 : 264 }}
      >
        <TopBar collapsed={collapsed} />
        <main className="relative z-10 flex-1 px-6 py-7">
          <div className="mx-auto w-full max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
