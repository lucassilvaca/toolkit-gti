/**
 * Faixas de rede extras da aba Usuários Online (outras VLANs).
 * Uma faixa por linha, em CIDR; o backend valida e devolve a lista normalizada.
 */
import { useEffect, useState } from "react";
import { Check, Network } from "lucide-react";
import { errorText } from "../../../shared/utils/errorText";
import { PresenceConfig } from "../../presence/services/PresenceConfig";
import { FormField, PrimaryButton, StatusAlert, Textarea } from "../../../shared/components";

const toText = (networks: string[]) => networks.join("\n");

export function ScanNetworksConfig() {
  const [saved, setSaved] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    PresenceConfig.getNetworks()
      .then((networks) => {
        setSaved(networks);
        setText(toText(networks));
      })
      .catch((e) => setStatus({ ok: false, msg: `Erro ao carregar faixas: ${errorText(e)}` }))
      .finally(() => setLoading(false));
  }, []);

  const changed = text.trim() !== toText(saved).trim();

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const networks = await PresenceConfig.setNetworks(text.split(/[\n,;]+/));
      setSaved(networks);
      setText(toText(networks));
      setStatus({
        ok: true,
        msg: networks.length
          ? `${networks.length} faixa(s) salva(s). Entram na próxima varredura.`
          : "Sem faixas extras: a varredura cobre só a sua VLAN.",
      });
    } catch (e) {
      setStatus({ ok: false, msg: errorText(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <FormField label="Faixas extras (uma por linha)" icon={Network} htmlFor="scan-networks">
        <Textarea
          id="scan-networks"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"10.20.31.0/24\n10.20.32.0/25"}
          disabled={loading || saving}
          spellCheck={false}
          className="font-mono"
        />
      </FormField>

      <StatusAlert status={status} />

      <PrimaryButton
        icon={Check}
        loading={saving}
        loadingText="Salvando..."
        onClick={handleSave}
        disabled={loading || !changed}
        className="w-full"
      >
        Salvar faixas
      </PrimaryButton>

      <p className="text-xs leading-5 text-ink-muted">
        A sua VLAN já é varrida automaticamente. Nas faixas extras só aparecem
        máquinas com o Toolkit aberto, e a porta do chat precisa estar liberada
        entre as VLANs nos dois sentidos. Prefixo de /20 a /30; até 4096 hosts no total.
      </p>
    </div>
  );
}
