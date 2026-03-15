import Navbar from "@/components/Navbar";
import { CacheProvider } from "@/lib/CacheContext";
import AuthGate from "@/components/AuthGate";

export default function DashboardLayout({ children }) {
  return (
    <AuthGate>
      <CacheProvider>
        <Navbar />
        <main className="pt-20">
          {children}
        </main>
      </CacheProvider>
    </AuthGate>
  );
}
