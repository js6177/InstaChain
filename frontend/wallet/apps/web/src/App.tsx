import { useCounterStore } from '@wallet/shared';
import { Button } from "@/components/ui/button";
import './index.css';

function App() {
  const { count, increment, decrement } = useCounterStore();

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">
          Hello World!
        </h1>
        <div className="flex items-center gap-4">
          <Button onClick={decrement}>-</Button>
          <span className="text-2xl font-semibold">{count}</span>
          <Button onClick={increment}>+</Button>
        </div>
      </div>
    </div>
  );
}

export default App;