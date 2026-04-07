import React, { useState, useEffect } from "react";

const steps = [
  "Loading keystore...",
  "Connecting to node...",
  "Syncing state...",
  "Launching...",
];

interface SplashScreenProps {
  nodeOnline: boolean;
  blockHeight?: number;
  onDone: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ nodeOnline, blockHeight, onDone }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((i) => {
        if (i >= steps.length - 1) {
          clearInterval(interval);
          setTimeout(() => {
            setFadeOut(true);
            setTimeout(onDone, 300);
          }, 500);
          return i;
        }
        return i + 1;
      });
    }, 350);
    return () => clearInterval(interval);
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50 transition-opacity duration-300"
      style={{ background: "#0D1F33", opacity: fadeOut ? 0 : 1 }}
    >
      {/* Logo */}
      <div className="text-7xl font-bold tracking-widest mb-4" style={{ color: "#C9A84C" }}>
        INGRION
      </div>
      <p className="text-gray-400 text-sm mb-10">Blockchain Capital Markets Platform</p>

      {/* Spinner */}
      <div className="relative w-16 h-16 mb-8">
        <svg className="w-16 h-16 animate-spin-slow" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="28" stroke="#C9A84C" strokeWidth="2" strokeOpacity="0.2" />
          <path
            d="M32 4 A28 28 0 0 1 60 32"
            stroke="#C9A84C"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Status text */}
      <p className="text-gray-300 text-sm animate-pulse">{steps[stepIndex]}</p>

      {/* Block height */}
      {blockHeight && (
        <p className="text-gray-500 text-xs mt-2 font-mono">Block #{blockHeight.toLocaleString()}</p>
      )}

      {/* Offline warning */}
      {!nodeOnline && (
        <div className="mt-4 bg-amber-900/30 border border-amber-700 rounded-lg px-4 py-2">
          <p className="text-amber-400 text-xs text-center">
            ⚠️ Node offline — working in read-only mode
          </p>
        </div>
      )}
    </div>
  );
};

export default SplashScreen;
