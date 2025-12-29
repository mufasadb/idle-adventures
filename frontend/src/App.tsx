import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { authStore } from './stores/authStore';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';

const ProtectedRoute = observer(({ children }: { children: React.ReactNode }) => {
  if (authStore.isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-amber-400 text-xl">Loading...</div>
      </div>
    );
  }

  if (!authStore.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
});

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
