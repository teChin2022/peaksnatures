"use client";

import { createContext, useContext } from "react";

const ThemeContext = createContext<string>("#16a34a");

export function ThemeProvider({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return <ThemeContext.Provider value={color}>{children}</ThemeContext.Provider>;
}

export function useThemeColor() {
  return useContext(ThemeContext);
}
