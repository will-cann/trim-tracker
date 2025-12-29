import React, { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAuth0, Auth0Provider } from '@auth0/auth0-react';
import { apiService } from '../services/apiService';

interface User {
    id: string;
    email: string;
    name?: string;
    role?: string;
    picture?: string;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: () => void;
    logout: () => void;
    getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const {
        user: auth0User,
        isAuthenticated,
        isLoading,
        loginWithRedirect,
        logout: auth0Logout,
        getAccessTokenSilently
    } = useAuth0();

    const user: User | null = isAuthenticated && auth0User ? {
        id: auth0User.sub || '',
        email: auth0User.email || '',
        name: auth0User.name,
        picture: auth0User.picture,
        // Role handling might need custom claims from Auth0 later
        role: (auth0User['https://trimtracker.com/roles'] as string[])?.[0] || 'User',
    } : null;

    const login = () => {
        loginWithRedirect();
    };

    const logout = () => {
        auth0Logout({ logoutParams: { returnTo: window.location.origin } });
    };

    const getToken = async (): Promise<string | null> => {
        try {
            const token = await getAccessTokenSilently();
            apiService.setAuthToken(token);
            return token;
        } catch (error) {
            console.error('Error getting Auth0 token:', error);
            apiService.setAuthToken(null);
            return null;
        }
    };

    useEffect(() => {
        console.log('Auth0 State:', { isAuthenticated, isLoading, user: !!auth0User });
        if (isAuthenticated && !isLoading) {
            getToken();
        } else if (!isLoading) {
            apiService.setAuthToken(null);
        }
    }, [isAuthenticated, isLoading, auth0User]);

    return (
        <AuthContext.Provider value={{ user, loading: isLoading, login, logout, getToken }}>
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

// Wrapper for Auth0Provider
export const Auth0Wrapper: React.FC<{ children: ReactNode }> = ({ children }) => {
    const domain = import.meta.env.VITE_AUTH0_DOMAIN;
    const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
    const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

    return (
        <Auth0Provider
            domain={domain}
            clientId={clientId}
            authorizationParams={{
                redirect_uri: window.location.origin,
                audience: audience,
            }}
        >
            <AuthProvider>
                {children}
            </AuthProvider>
        </Auth0Provider>
    );
};
