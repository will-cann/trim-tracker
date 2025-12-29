import React from 'react';
import { useAuth } from '../contexts/authContext';
import { LogIn } from 'lucide-react';

export const Login: React.FC = () => {
    const { login } = useAuth();

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-700">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-8 text-center">
                    <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
                        <span className="text-4xl">✂️</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Trim Tracker</h1>
                    <p className="text-emerald-50 text-sm opacity-90 uppercase tracking-widest font-medium">Elevating Harvest Efficiency</p>
                </div>

                <div className="p-8">
                    <div className="space-y-6">
                        <div className="text-center">
                            <h2 className="text-xl font-semibold text-slate-100 mb-2">Welcome Back</h2>
                            <p className="text-slate-400 text-sm">Please log in to your company dashboard to manage trim sessions.</p>
                        </div>

                        <button
                            onClick={login}
                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] transform hover:-translate-y-0.5 active:translate-y-0"
                        >
                            <LogIn size={20} />
                            Login with Netlify
                        </button>

                        <div className="pt-6 border-t border-slate-700/50">
                            <p className="text-center text-slate-500 text-xs">
                                © {new Date().getFullYear()} Trim Tracker MVP. All rights reserved.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
