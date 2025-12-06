import { customInstance } from '@wallet/api-layer2ledger';
import type { CommonResponse } from '@wallet/api-layer2ledger';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import './index.css';

function App() {
  const [apiResponse, setApiResponse] = useState<CommonResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-2xl w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">API Response from http://0.0.0.0:8000/</h2>
          <Button onClick={fetchData} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        {loading && (
          <div className="text-gray-600">Loading...</div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <strong>Error:</strong> {error}
          </div>
        )}

        {apiResponse && !loading && (
          <div className="bg-gray-50 p-4 rounded border">
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