import Navbar from "@/components/Navbar";
import { CacheProvider } from "@/lib/CacheContext";
import AuthGate from "@/components/AuthGate";

export default function DashboardLayout({ children }) {
  return (
    <AuthGate>
      <CacheProvider>
        <div className="min-h-screen bg-white">
          <Navbar />
          <main className="pt-20">
            {children}
          </main>
        </div>
      </CacheProvider>
    </AuthGate>
  );
}
