import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        const token = localStorage.getItem('token');
        if (token) {
            // Set default header
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            try {
                // Verify token with backend
                // In a real app, you might want to call /api/auth/me here
                // For now, we decode or trust the token if we want fast load, 
                // but calling the API is safer.
                // Let's assume we call the API:
                const response = await axios.get('http://localhost:3001/api/auth/me');
                setUser(response.data.user);
            } catch (error) {
                console.error('Token verification failed', error);
                localStorage.removeItem('token');
                delete axios.defaults.headers.common['Authorization'];
                setUser(null);
            }
        }
        setLoading(false);
    };

    const login = async (username, password) => {
        try {
            const response = await axios.post('http://localhost:3001/api/auth/login', {
                username,
                password
            });

            const { token, user } = response.data;
            localStorage.setItem('token', token);
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            setUser(user);
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || 'Login failed'
            };
        }
    };

    const register = async (username, password) => {
        try {
            await axios.post('http://localhost:3001/api/auth/register', {
                username,
                password
            });
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || 'Registration failed'
            };
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
