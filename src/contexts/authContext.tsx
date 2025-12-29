import React, { createContext, useContext, useEffect, useState } from 'react';
import netlifyIdentity from 'netlify-identity-widget';

interface User {
    id: string;
    email: string;
    name?: string;
    role?: string;
    token?: string;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: () => void;
    logout: () => void;
    getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        netlifyIdentity.init();

        const currentUser = netlifyIdentity.currentUser();
        if (currentUser) {
            updateUser(currentUser);
        }

        netlifyIdentity.on('login', (u) => {
            updateUser(u);
            netlifyIdentity.close();
        });

        netlifyIdentity.on('logout', () => {
            setUser(null);
        });

        setLoading(false);
    }, []);

    const updateUser = (u: netlifyIdentity.User) => {
        setUser({
            id: u.id,
            email: u.email,
            name: u.user_metadata?.full_name,
            role: u.app_metadata?.roles?.[0], // Assuming single role for now
        });
    };

    const login = () => {
        netlifyIdentity.open();
    };

    const logout = () => {
        netlifyIdentity.logout();
    };

    const getToken = async (): Promise<string | null> => {
        const u = netlifyIdentity.currentUser();
        if (!u) return null;
        try {
            // use any cast to avoid type issues with netlify-identity-widget types
            const token = await (u as any).jwt(true);
            return token;
        } catch (error) {
            console.error('Error getting JWT token:', error);
            return null;
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, getToken }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
