import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import SearchDetail from './pages/SearchDetail';
import NewSearch from './pages/NewSearch/NewSearch';

import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-50">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route path="/" element={
              <ProtectedRoute>
                <Navbar />
                <main className="container mx-auto px-4 py-8">
                  <Dashboard />
                </main>
              </ProtectedRoute>
            } />

            <Route path="/search/:id" element={
              <ProtectedRoute>
                <Navbar />
                <main className="container mx-auto px-4 py-8">
                  <SearchDetail />
                </main>
              </ProtectedRoute>
            } />

            <Route path="/new" element={
              <ProtectedRoute>
                <Navbar />
                <main className="container mx-auto px-4 py-8">
                  <NewSearch />
                </main>
              </ProtectedRoute>
            } />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;

