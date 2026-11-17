import { useInvokeResource } from "../../../shared/hooks/useInvokeResource";

export interface DiskInfo {
  mountPoint: string;
  name: string;
  totalLabel: string;
  freeLabel: string;
  /** Percentual de uso (0-100). -1 quando o total é desconhecido. */
  usedPercent: number;
  isRemovable: boolean;
  fileSystem: string;
}

interface UseDiskListOptions {
  enabled?: boolean;
}

export function useDiskList(options?: UseDiskListOptions) {
  const { data, loading, error, refresh } = useInvokeResource<DiskInfo[]>({
    command: "list_disks",
    initialData: [],
    fallback: [],
    warnMessage: "[useDiskList] Failed to fetch disks:",
    enabled: options?.enabled ?? true,
  });

  return { disks: data, loading, error, refresh };
}
