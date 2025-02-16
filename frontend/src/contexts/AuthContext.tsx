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

  useEffect(() => {
    checkAuth();
  }, []);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

  // Remove /api prefix since it's already in the routes
  const checkAuth = async () => {
    try {
      const response = await fetch(`${API_URL}/auth/check`, {
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
    }
  };
  
  const login = async (username: string, password: string) => {
    const response = await fetch(`${API_URL}/auth/login`, {
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
    const response = await fetch(`${API_URL}/auth/signup`, {
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
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    setIsAuthenticated(false);
    setUser(null);
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