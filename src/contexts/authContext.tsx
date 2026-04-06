import React, { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAuth0, Auth0Provider } from '@auth0/auth0-react';
import { apiService } from '../services/apiService';

const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';

interface User {
    id: string;
    email: string;
    name?: string;
    role?: string;
    departments?: string[];
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

// Dev bypass provider — skips Auth0 entirely and uses a mock user
const DevBypassProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const user: User = {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        email: 'admin@greenvalley.com',
        name: 'Sarah Martinez',
        role: 'admin',
        departments: [],
    };

    useEffect(() => {
        // Set a dummy token — backend will also bypass auth when DEV_BYPASS_AUTH=true
        apiService.setAuthToken('dev-bypass-token');
    }, []);

    return (
        <AuthContext.Provider value={{
            user,
            loading: false,
            login: () => console.log('Dev bypass: login skipped'),
            logout: () => console.log('Dev bypass: logout skipped'),
            getToken: async () => 'dev-bypass-token',
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const {
        user: auth0User,
        isAuthenticated,
        isLoading,
        loginWithRedirect,
        logout: auth0Logout,
        getAccessTokenSilently
    } = useAuth0();

    const [tokenReady, setTokenReady] = React.useState(false);
    const [dbRole, setDbRole] = React.useState<string | undefined>();
    const [dbDepartments, setDbDepartments] = React.useState<string[]>([]);

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
        if (isAuthenticated && !isLoading) {
            getToken().then(() => {
                setTokenReady(true);
                // Sync Auth0 profile info to backend and get DB role/departments
                if (auth0User?.name || auth0User?.email) {
                    apiService.syncUser({
                        name: auth0User.name,
                        email: auth0User.email,
                    }).then((res) => {
                        if (res.role) setDbRole(res.role);
                        if (res.departments) setDbDepartments(res.departments);
                    }).catch(() => {});
                }
            });
        } else if (!isLoading) {
            apiService.setAuthToken(null);
            setTokenReady(false);
        }
    }, [isAuthenticated, isLoading, auth0User]);

    // Only expose user once the token has been fetched and set
    const user: User | null = isAuthenticated && auth0User && tokenReady ? {
        id: auth0User.sub || '',
        email: auth0User.email || '',
        name: auth0User.name,
        picture: auth0User.picture,
        role: dbRole || (auth0User['https://trimtracker.com/roles'] as string[])?.[0] || 'admin',
        departments: dbDepartments,
    } : null;

    // Show loading while Auth0 loads OR while we're fetching the token
    const loading = isLoading || (isAuthenticated && !tokenReady);

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

// Wrapper for Auth0Provider
export const Auth0Wrapper: React.FC<{ children: ReactNode }> = ({ children }) => {
    if (DEV_BYPASS) {
        return <DevBypassProvider>{children}</DevBypassProvider>;
    }

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
                scope: 'openid profile email',
            }}
        >
            <AuthProvider>
                {children}
            </AuthProvider>
        </Auth0Provider>
    );
};
