import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import LoginPage from './components/LoginPage';
import ChatLayout from './components/ChatLayout';
import GoogleCallbackPage from './components/GoogleCallbackPage';
import { messageCleanupService } from './services/messageCleanup';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  
  console.log('🔒 ProtectedRoute - isAuthenticated:', isAuthenticated, 'user:', user?.username);
  
  if (!isAuthenticated) {
    console.log('🚫 Not authenticated, redirecting to login');
    return <Navigate to="/login" replace />;
  }
  
  console.log('✅ Authenticated, rendering protected content');
  return <>{children}</>;
};

// Theme Effect Component
const ThemeEffect: React.FC = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [user?.theme]);

  return null;
};

// Main App Component
const AppContent: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  
  console.log('🔍 App - isAuthenticated:', isAuthenticated, 'user:', user?.username);

  return (
    <>
      <ThemeEffect />
      <Routes>
        <Route 
          path="/login" 
          element={
            isAuthenticated ? (
              <Navigate to="/chat" replace />
            ) : (
              <LoginPage />
            )
          } 
        />
        <Route
          path="/auth/callback"
          element={<GoogleCallbackPage />}
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <ChatLayout />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to={isAuthenticated ? "/chat" : "/login"} replace />} />
        <Route path="*" element={<Navigate to={isAuthenticated ? "/chat" : "/login"} replace />} />
      </Routes>
    </>
  );
};

const App: React.FC = () => {
  // Initialize message cleanup service
  useEffect(() => {
    messageCleanupService.start();
    
    // Cleanup on unmount
    return () => {
      messageCleanupService.stop();
    };
  }, []);

  return (
    <ThemeProvider>
      <Router>
        <AuthProvider>
          <div className="App">
            <AppContent />
          </div>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
};

export default App;