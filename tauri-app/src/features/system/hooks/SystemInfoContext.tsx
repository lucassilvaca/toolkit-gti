import { createContext, useContext, type ReactNode } from "react";
import { useSystemInfo } from "./useSystemInfo";

type SystemInfoValue = ReturnType<typeof useSystemInfo>;

const SystemInfoContext = createContext<SystemInfoValue | null>(null);

/**
 * Disponibiliza UMA instância de useSystemInfo para toda a árvore.
 * O App chama o hook uma vez e passa o valor aqui; as views consomem via
 * useSharedSystemInfo, evitando instâncias/efeitos/re-renders paralelos.
 */
export function SystemInfoProvider({
  value,
  children,
}: {
  value: SystemInfoValue;
  children: ReactNode;
}) {
  return (
    <SystemInfoContext.Provider value={value}>
      {children}
    </SystemInfoContext.Provider>
  );
}

export function useSharedSystemInfo(): SystemInfoValue {
  const ctx = useContext(SystemInfoContext);
  if (!ctx) {
    throw new Error("useSharedSystemInfo deve ser usado dentro de SystemInfoProvider");
  }
  return ctx;
}
