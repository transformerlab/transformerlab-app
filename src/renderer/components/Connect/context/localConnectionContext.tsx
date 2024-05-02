import { createContext, useContext, useState } from 'react';

interface LocalConnectionContext {
  children?: React.ReactNode;
  activeStep: number;
  setActiveStep: React.Dispatch<React.SetStateAction<number>>;
}

const LocalConnectionContext = createContext<LocalConnectionContext>({
  activeStep: 0,
  setActiveStep: (_val) => {},
});

const LocalConnectionProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [activeStep, setActiveStep] = useState<number>(0);
  return (
    <LocalConnectionContext.Provider value={{ activeStep, setActiveStep }}>
      {children}
    </LocalConnectionContext.Provider>
  );
};

const useLocalConnectionContext = () => {
  const context = useContext(LocalConnectionContext);
  if (!context) {
    throw new Error(
      'useLocalConnectionContext must be used within a LocalConnectionProvider'
    );
  }
  return context;
};

export { LocalConnectionProvider, useLocalConnectionContext };
