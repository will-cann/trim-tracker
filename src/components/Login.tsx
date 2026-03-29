import React from 'react';
import { useAuth } from '../contexts/authContext';
import { ArrowRight, Scissors, Sprout, Map, ClipboardList } from 'lucide-react';
import logo from '../assets/logo.png';

const FEATURES = [
    { icon: Scissors, text: 'Track trimmer productivity in real-time' },
    { icon: Sprout, text: 'Manage harvests from wet weight to cure' },
    { icon: Map, text: 'Monitor plant health across every room' },
    { icon: ClipboardList, text: 'AI-powered task management for your team' },
];

export const Login: React.FC = () => {
    const { login } = useAuth();

    return (
        <div className="min-h-screen bg-[#fafafa] flex">
            {/* Left — brand + value prop */}
            <div className="hidden lg:flex flex-col justify-between flex-1 p-12 xl:p-16">
                <div>
                    <div className="flex items-center gap-3 mb-16">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center overflow-hidden">
                            <img src={logo} alt="" className="w-6 h-6 object-contain brightness-0 invert" />
                        </div>
                        <span className="text-lg font-semibold text-gray-900 tracking-tight">Trim Tracker</span>
                    </div>

                    <div className="max-w-lg">
                        <h1 className="text-4xl xl:text-5xl font-bold text-gray-900 leading-[1.1] tracking-tight mb-4">
                            Operations,<br />
                            <span className="text-emerald-600">simplified.</span>
                        </h1>
                        <p className="text-lg text-gray-500 leading-relaxed mb-12 max-w-md">
                            The cultivation management platform built for teams that move fast and measure everything.
                        </p>

                        <div className="space-y-4">
                            {FEATURES.map(({ icon: Icon, text }) => (
                                <div key={text} className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                                        <Icon size={16} className="text-emerald-600" />
                                    </div>
                                    <span className="text-sm text-gray-600">{text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <p className="text-xs text-gray-300">
                    &copy; {new Date().getFullYear()} Trim Tracker
                </p>
            </div>

            {/* Right — sign in */}
            <div className="flex flex-col items-center justify-center w-full lg:w-[480px] xl:w-[520px] lg:border-l border-gray-200 bg-white p-8 lg:p-16">
                {/* Mobile logo */}
                <div className="lg:hidden flex items-center gap-3 mb-12">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center overflow-hidden">
                        <img src={logo} alt="" className="w-6 h-6 object-contain brightness-0 invert" />
                    </div>
                    <span className="text-lg font-semibold text-gray-900 tracking-tight">Trim Tracker</span>
                </div>

                <div className="w-full max-w-sm">
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h2>
                        <p className="text-sm text-gray-400">Sign in to your workspace</p>
                    </div>

                    <button
                        onClick={() => login()}
                        className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 group"
                    >
                        Continue
                        <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                    </button>

                    <p className="text-center text-gray-300 text-xs mt-8">
                        Secure authentication powered by Auth0
                    </p>

                    {/* Mobile features */}
                    <div className="lg:hidden mt-12 pt-8 border-t border-gray-100">
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">What you can do</p>
                        <div className="space-y-3">
                            {FEATURES.map(({ icon: Icon, text }) => (
                                <div key={text} className="flex items-center gap-2.5">
                                    <Icon size={14} className="text-emerald-500 shrink-0" />
                                    <span className="text-xs text-gray-500">{text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
