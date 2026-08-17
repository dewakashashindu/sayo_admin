'use client';

import React from 'react';
import Link from 'next/link';

export default function LoginPage() {
  return (
    // Background with correct angle cut (Bottom-Left Dark to Top-Right Light)
    <div className="relative min-h-screen w-full flex items-center justify-center bg-[linear-gradient(150deg,#1d2627_62%,#ffffff_62%)] overflow-hidden p-6">
      
      {/* Top Right Logo */}
      <div className="absolute top-6 right-8 flex flex-col items-center justify-center text-[#d4a359]">
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
          <path d="M12 3c-1.2 2.2-2.8 4.2-4.5 6 1.7 1.8 3.3 3.8 4.5 6 1.2-2.2 2.8-4.2 4.5-6-1.7-1.8-3.3-3.8-4.5-6z" />
        </svg>
        <span className="text-[10px] font-semibold tracking-widest text-[#d4a359] uppercase mt-0.5">SAYO</span>
      </div>

      {/* Main Card Container with inner padding */}
      <div className="w-[880px] max-w-full h-[500px] bg-white rounded-[24px] p-4 flex shadow-2xl">
        
        {/* Left Side - Image Container with Rounded Corners & Padding Effect */}
        <div 
          className="relative w-[45%] h-full rounded-[18px] overflow-hidden bg-cover bg-center p-6 flex flex-col justify-start"
          style={{ 
            backgroundImage: `url('https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=1000&auto=format&fit=crop')` 
          }}
        >
          {/* Overlay Text */}
          <div className="z-10">
            <h2 className="text-[#d4a359] text-xl font-bold tracking-wider uppercase">
              SAYO BEAUTY
            </h2>
            <p className="text-black font-extrabold text-xs tracking-wider mt-0.5">
              ADMIN PORTAL
            </p>
          </div>
        </div>

        {/* Right Side - Form Container */}
        <div className="w-[55%] h-full px-10 py-6 flex flex-col justify-center items-center text-center">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Hi SAYO..!
          </h1>
          <p className="text-gray-500 text-xs mt-1 mb-8 font-medium">
            Welcome to Admin Portal.
          </p>

          <form className="w-full max-w-[300px] space-y-3.5" onSubmit={(e) => e.preventDefault()}>
            {/* Email Field */}
            <div>
              <input
                type="email"
                placeholder="email"
                className="w-full px-4 py-3 rounded-xl bg-[#f8fafc] border border-gray-200 text-sm focus:outline-none focus:border-[#bcd1cb] transition-colors placeholder:text-gray-400"
                required
              />
            </div>

            {/* Password Field */}
            <div>
              <input
                type="password"
                placeholder="password"
                className="w-full px-4 py-3 rounded-xl bg-[#f8fafc] border border-gray-200 text-sm focus:outline-none focus:border-[#bcd1cb] transition-colors placeholder:text-gray-400"
                required
              />
            </div>

            {/* Forgot Password */}
            <div className="text-right">
              <Link href="#" className="text-[12px] text-gray-500 underline hover:text-gray-800">
                Forgot Password
              </Link>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              className="w-full py-3 bg-[#bcd1cb] hover:bg-[#a6bcb6] text-gray-800 font-semibold text-sm rounded-xl transition-all shadow-sm active:scale-[0.98] mt-2"
            >
              Login
            </button>

            {/* Signup Link */}
            <p className="text-[11px] text-gray-500 pt-2">
              Do not have an account?{' '}
              <Link href="#" className="text-[#cb5a5a] font-medium hover:underline">
                Signup
              </Link>
            </p>
          </form>
        </div>

      </div>
    </div>
  );
}