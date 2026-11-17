import { errorText } from "../../../shared/utils/errorText";

export function normalizeErrorMessage(error: unknown): string {
  const message = errorText(error);

  if (message.includes("IP local ainda não está disponível")) {
    return message;
  }
  if (message.includes("msg.exe")) {
    return "O Toolkit e o fallback nativo do Windows não conseguiram entregar a solicitação. Verifique se o host está online e acessível.";
  }
  if (message.includes("/invite") || message.includes("portas testadas")) {
    return "O app remoto não respondeu ao convite. Confirme se o Toolkit está aberto no usuário e se a porta configurada está liberada.";
  }
  if (message.includes("Acesso negado") || message.includes("Access is denied")) {
    return "A rede recusou a entrega da solicitação. Tente usar IP em vez de hostname e confirme permissões/firewall no destino.";
  }
  if (message.includes("AUTH_REQUIRED")) {
    return "Sua sessão administrativa expirou. Entre novamente para enviar a solicitação.";
  }

  return message;
}
