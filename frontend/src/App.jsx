import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import BuildsFeed from './pages/BuildsFeed';
import AddProject from './pages/AddProject';
import ProjectDetail from './pages/ProjectDetail';
import ProjectSettings from './pages/ProjectSettings';
import AddWorkflow from './pages/AddWorkflow';
import BuildDetail from './pages/BuildDetail';
import InstallPage from './pages/InstallPage';
import WorkflowArchitect from './pages/WorkflowArchitect';

import { useEffect } from 'react';

import { Chatbox } from './components/chat/Chatbox';


function App() {

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/builds" element={<ProtectedRoute><BuildsFeed /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/add-project" element={<ProtectedRoute><AddProject /></ProtectedRoute>} />
              <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
              <Route path="/projects/:id/settings" element={<ProtectedRoute><ProjectSettings /></ProtectedRoute>} />
              <Route path="/projects/:id/add-workflow" element={<ProtectedRoute><AddWorkflow /></ProtectedRoute>} />
              <Route path="/builds/:id" element={<ProtectedRoute><BuildDetail /></ProtectedRoute>} />
              <Route path="/architect" element={<ProtectedRoute><WorkflowArchitect /></ProtectedRoute>} />
              <Route path="/install/:id" element={<InstallPage />} />
              <Route path="/" element={<Navigate to="/builds" replace />} />
              <Route path="*" element={<Navigate to="/builds" replace />} />
            </Routes>
          </AnimatePresence>
          
          <Chatbox />
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
