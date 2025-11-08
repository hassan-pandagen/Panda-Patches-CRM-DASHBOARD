import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';
import './index.css'; // Make sure this file includes your Tailwind imports

// Create the query client once at the top level
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: process.env.NODE_ENV === 'production' } },
});

// Create a root and render your main App component
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Providers are now at the absolute root, ensuring they mount only once */}
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
