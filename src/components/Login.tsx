import React from 'react';
import { useAuth } from '../contexts/authContext';
import { LogIn } from 'lucide-react';
import logo from '../assets/logo.png';

export const Login: React.FC = () => {
    const { login } = useAuth();

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="max-w-sm w-full">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mx-auto mb-5 shadow-sm overflow-hidden">
                        <img src={logo} alt="Trim Tracker Logo" className="w-full h-full object-contain p-2" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">Trim Tracker</h1>
                    <p className="text-xs text-gray-400 uppercase tracking-widest font-medium">Elevating Harvest Efficiency</p>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
                    <div className="space-y-6">
                        <div className="text-center">
                            <h2 className="text-lg font-semibold text-gray-900 mb-1">Welcome back</h2>
                            <p className="text-gray-500 text-sm">Sign in to manage your trim sessions.</p>
                        </div>

                        <button
                            onClick={() => login()}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <LogIn size={18} />
                            Sign in
                        </button>

                        <p className="text-center text-gray-400 text-xs">
                            © {new Date().getFullYear()} Trim Tracker
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
