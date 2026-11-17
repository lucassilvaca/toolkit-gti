import { useInvokeResource } from "../../../shared/hooks/useInvokeResource";

interface BrowserInfo {
  name: string;
  version: string;
}

interface BrowserInfoResult {
  browsers: BrowserInfo[];
  defaultBrowser: string;
}

const INITIAL_BROWSER_INFO: BrowserInfoResult = { browsers: [], defaultBrowser: "..." };

export function useBrowserInfo() {
  const { data, loading, error, refresh } = useInvokeResource<BrowserInfoResult>({
    command: "get_browser_info",
    initialData: INITIAL_BROWSER_INFO,
    fallback: INITIAL_BROWSER_INFO,
    warnMessage: "[useBrowserInfo] Failed to fetch browser info:",
    clearErrorOnStart: true,
  });

  return { browsers: data.browsers, defaultBrowser: data.defaultBrowser, loading, error, refresh };
}
