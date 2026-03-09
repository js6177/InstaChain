import { customInstance } from '@wallet/api-layer2ledger';
import type { CommonResponse } from '@wallet/api-layer2ledger';
import { useState, useEffect } from 'react';
import { useThemeStore } from '@wallet/shared';
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Moon, Sun } from "lucide-react";
import './index.css';

function App() {
  const [apiResponse, setApiResponse] = useState<CommonResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { theme, toggleTheme } = useThemeStore();

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await customInstance<CommonResponse>({
        url: '/',
        method: 'GET'
      });
      setApiResponse(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setApiResponse(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Apply theme to document element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="bg-card text-card-foreground p-8 rounded-lg shadow-md max-w-2xl w-full border border-border">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">API Response from http://0.0.0.0:8080</h2>
          <div className="flex items-center gap-2">
            <Toggle
              pressed={theme === 'dark'}
              onPressedChange={toggleTheme}
              aria-label="Toggle dark mode"
              className="h-9 w-9"
            >
              {theme === 'dark' ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </Toggle>
            <Button onClick={fetchData} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {loading && (
          <div className="text-muted-foreground">Loading...</div>
        )}

        {error && (
          <div className="bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
            <strong>Error:</strong> {error}
          </div>
        )}

        {apiResponse && !loading && (
          <div className="bg-muted p-4 rounded border border-border">
            <pre className="text-sm overflow-auto">
              {JSON.stringify(apiResponse, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;