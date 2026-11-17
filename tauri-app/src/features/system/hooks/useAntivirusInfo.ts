import { createInvokeCache, useInvokeResource } from "../../../shared/hooks/useInvokeResource";

const antivirusCache = createInvokeCache<string>();

export function useAntivirusInfo() {
  const { data, loading, error, refresh } = useInvokeResource<string>({
    command: "get_antivirus_details",
    initialData: antivirusCache.value ?? "...",
    initialLoading: !antivirusCache.value,
    fallback: "...",
    warnMessage: "[useAntivirusInfo] Failed to fetch antivirus info:",
    cache: antivirusCache,
  });

  return { antivirus: data, loading, error, refresh };
}
