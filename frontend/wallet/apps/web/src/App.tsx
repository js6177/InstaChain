import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useThemeStore } from "@openl2/wallet-shared";
import { Toggle } from "@/components/ui/toggle";
import { Moon, Sun } from "lucide-react";
import { useEffect, type React } from "react";
import { WalletPage } from "./pages/WalletPage";
import { ExplorerPage } from "./pages/ExplorerPage";
import { AboutPage } from "./pages/AboutPage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import { Toaster } from "@/components/ui/sonner";

function App(): React.JSX.Element {
  const { theme, toggleTheme } = useThemeStore();
  const location = useLocation();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const navLinkClass = (path: string): string => {
    const isActive = location.pathname.startsWith(path);
    return `text-sm font-medium transition-colors hover:text-primary ${isActive ? 'text-primary' : 'text-muted-foreground'}`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/wallet" className="flex items-center space-x-2">
              <span className="font-bold text-lg text-logo-color">
                OpenL2
              </span>
            </Link>
            <nav className="flex items-center gap-6">
              <Link to="/wallet" className={navLinkClass('/wallet')}>Wallet</Link>
              <Link to="/explorer" className={navLinkClass('/explorer')}>Explorer</Link>
              <Link to="/about" className={navLinkClass('/about')}>About</Link>
            </nav>
          </div>
          <div className="flex items-center">
            <Toggle
              pressed={theme === 'dark'}
              onPressedChange={toggleTheme}
              aria-label="Toggle dark mode"
              className="h-9 w-9 rounded-full"
            >
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Toggle>
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <Routes>
          <Route path="/" element={<Navigate to="/wallet" replace />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/explorer/*" element={<ExplorerPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/oauth2/:service/callback" element={<OAuthCallbackPage />} />
        </Routes>
      </main>
      <Toaster />
    </div>
  );
}

export default App;