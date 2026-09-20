import React from "react";
import type { AppMode } from "../utils/conversion.js";

interface HeaderProps {
  mode: AppMode;
}

export const Header: React.FC<HeaderProps> = ({ mode }) => {
  const isFaulty = mode !== "correct";
  return (
    <>
      <div className="environment-banner">
        ⚠️ Local Test Environment — Synthetic Assets — Not Real Money
      </div>

      <header className="app-header">
        <h1 className="app-title">StockCheck</h1>
        <span className={`mode-badge ${isFaulty ? "faulty" : "correct"}`}>
          {mode}
        </span>
      </header>
    </>
  );
};
