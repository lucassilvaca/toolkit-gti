import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { MAX_FILE_SIZE } from "../../../shared/constants/chat";
import { errorText } from "../../../shared/utils/errorText";
import { saveReceivedFile } from "../services/chatFiles";

export type FileAlert = { ok: boolean; msg: string } | null;
type SetFileAlert = (alert: FileAlert) => void;

/** Salva um arquivo recebido e reporta o resultado em `setAlert`. */
export function useSaveReceivedFile(setAlert: SetFileAlert) {
  const [savingFile, setSavingFile] = useState<string | null>(null);

  const save = useCallback(async (fileName: string, fileData: string) => {
    setSavingFile(fileName);
    try {
      const savedPath = await saveReceivedFile(fileName, fileData);
      setAlert({ ok: true, msg: `Salvo em: ${savedPath}` });
    } catch (e) {
      setAlert({ ok: false, msg: `Erro ao salvar: ${errorText(e)}` });
    } finally {
      setSavingFile(null);
    }
  }, [setAlert]);

  return { savingFile, save };
}

/**
 * Seletor de arquivo oculto: valida o tamanho, lê como base64 e envia.
 * `onPick` roda ao escolher um arquivo, antes da validação.
 */
export function useFileAttachment(
  onSendFile: (fileName: string, mimeType: string, fileData: string) => void,
  tooLargeMsg: string,
  setAlert: SetFileAlert,
  onPick?: () => void,
) {
  const inputRef = useRef<HTMLInputElement>(null);

  const open = () => inputRef.current?.click();

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAlert(null);
    onPick?.();

    if (file.size > MAX_FILE_SIZE) {
      setAlert({ ok: false, msg: tooLargeMsg });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      try {
        onSendFile(file.name, file.type || "application/octet-stream", base64);
      } catch (err) {
        setAlert({
          ok: false,
          msg: err instanceof Error ? err.message : "Erro ao enviar arquivo",
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return { inputRef, open, onChange };
}
