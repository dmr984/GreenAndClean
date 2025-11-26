'use client';
import React, { createContext, useState, useContext, ReactNode } from 'react';

type PrintDataContextType = {
  printData: any;
  setPrintData: (data: any) => void;
};

const PrintContext = createContext<PrintDataContextType | undefined>(undefined);

export const PrintProvider = ({ children }: { children: ReactNode }) => {
  const [printData, setPrintData] = useState<any>(null);

  return (
    <PrintContext.Provider value={{ printData, setPrintData }}>
      {children}
    </PrintContext.Provider>
  );
};

export const usePrint = () => {
  const context = useContext(PrintContext);
  if (context === undefined) {
    throw new Error('usePrint must be used within a PrintProvider');
  }
  return context;
};
