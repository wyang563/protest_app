import React, { createContext, useState, useContext, useEffect } from 'react';

interface User {
  user_id: number;
  username: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://protest.morelos.dev'
  : 'http://localhost:5001';

  const checkAuth = async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/check`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setIsAuthenticated(true);
        setUser({
          user_id: data.user_id,
          username: data.username
        });
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  const login = async (username: string, password: string) => {
    const response = await fetch(`${API_URL}/api/auth/login`, {  // Add /api prefix
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });
  
    if (response.ok) {
      const data = await response.json();
      setIsAuthenticated(true);
      setUser({
        user_id: data.user_id,
        username: data.username
      });
    } else {
      const error = await response.json();
      throw new Error(error.error);
    }
  };

  const signup = async (username: string, password: string) => {
    const response = await fetch(`${API_URL}/api/auth/signup`, {  // Add /api prefix
      method: 'POST',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });
      
    if (response.ok) {
      const data = await response.json();
      setIsAuthenticated(true);
      setUser({
        user_id: data.user_id,
        username: data.username
      });
    } else {
      const error = await response.json();
      throw new Error(error.error);
    }
  };

const logout = async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (response.ok) {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};