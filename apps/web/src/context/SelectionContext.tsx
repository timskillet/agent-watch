import { createContext, useContext, useState, type ReactNode } from "react";

interface SelectionState {
  selectedSessionId: string | null;
  setSelectedSessionId: (id: string | null) => void;
}

const SelectionContext = createContext<SelectionState>({
  selectedSessionId: null,
  setSelectedSessionId: () => {},
});

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  return (
    <SelectionContext.Provider
      value={{ selectedSessionId, setSelectedSessionId }}
    >
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  return useContext(SelectionContext);
}
