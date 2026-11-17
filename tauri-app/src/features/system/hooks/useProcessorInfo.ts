import { createInvokeCache, useInvokeResource } from "../../../shared/hooks/useInvokeResource";

export interface ProcessorInfo {
  name: string;
  cores: number;
  threads: number;
  speed: string;
}

interface UseProcessorInfoOptions {
  enabled?: boolean;
}

const processorCache = createInvokeCache<ProcessorInfo[]>();

export function useProcessorInfo(options?: UseProcessorInfoOptions) {
  const { data, loading, error, refresh } = useInvokeResource<ProcessorInfo[]>({
    command: "get_processor_info",
    initialData: [],
    fallback: [],
    warnMessage: "[useProcessorInfo] Failed to fetch processor info:",
    enabled: options?.enabled ?? true,
    cache: processorCache,
  });

  return { processors: data, loading, error, refresh };
}
