import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { BrandLogo } from "../../../shared/components";
import { getCurrentUser } from "../services/currentUser";
import { errorText } from "../../../shared/utils/errorText";

interface Props {
  onAuthenticated: (username: string, password: string) => Promise<boolean>;
}

/** Nome curto para exibição (parte após domínio\) e inicial do avatar. */
function shortName(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  const afterDomain = v.includes("\\") ? v.split("\\").pop()! : v;
  return afterDomain || v;
}

export function LoginView({ onAuthenticated }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Conta do Windows detectada → login "identity-first". O usuário só digita a
  // senha; pode trocar a conta manualmente se precisar.
  const [detectedUser, setDetectedUser] = useState("");
  const [editingUser, setEditingUser] = useState(false);

  useEffect(() => {
    getCurrentUser()
      .then((u) => {
        const name = (u ?? "").trim();
        setUsername(name);
        setDetectedUser(name);
        if (!name) setEditingUser(true);
      })
      .catch(() => setEditingUser(true));
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password) return;
    setLoading(true);
    setError("");

    try {
      // O backend só aceita sAMAccountName ([A-Za-z0-9._-]); "EMPRESA\fulano"
      // vira "fulano" (o domínio vem da máquina, via PrincipalContext).
      const success = await onAuthenticated(shortName(username), password);
      if (!success) {
        setError("Senha incorreta. Tente novamente.");
        setPassword("");
      }
    } catch (e) {
      console.error("Erro no login:", e);
      setError("Erro na autenticação: " + errorText(e));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !loading && username.trim().length > 0 && password.length > 0;
  const initial = shortName(detectedUser || username).charAt(0).toUpperCase() || "?";

  return (
    <div className="relative flex h-full min-h-0 items-center justify-center overflow-y-auto bg-base px-4 py-6 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 sm:p-8"
      >
        {/* Marca */}
        <div className="mb-6 flex items-center gap-2.5 border-b border-line pb-5">
          <BrandLogo
            className="h-7 w-7 object-contain"
            alt="Logo Toolkit GTI"
          />
          <span className="text-sm font-semibold tracking-tight text-ink-strong">
            Toolkit
          </span>
          <span className="rounded-md border border-line bg-accent-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-strong">
            GTI
          </span>
        </div>

        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-ink-strong">
          Entrar
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          {detectedUser && !editingUser
            ? "Confirme sua senha para continuar."
            : "Acesse o toolkit com sua conta do Windows."}
        </p>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3.5 text-sm"
          >
            <div className="flex items-center gap-2.5 text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="font-medium text-ink-strong">{error}</span>
            </div>
          </motion.div>
        )}

        <div className="mt-6 space-y-4">
          {detectedUser && !editingUser ? (
            /* Conta detectada — identidade em destaque, ação = só a senha. */
            <div className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-surface-raised px-3 py-2.5">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-accent-tint text-sm font-semibold text-accent-strong"
              >
                {initial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-strong">
                  {shortName(detectedUser)}
                </p>
                <p className="truncate text-[11px] text-ink-faint">Conta Windows · {detectedUser}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(true)}
                className="focus-ring shrink-0 rounded px-2 py-1 text-xs font-medium text-accent-soft transition-colors hover:text-accent"
              >
                Trocar
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="login-user" className="block text-xs font-medium text-ink-muted">
                Usuário
              </label>
              <div className="group relative flex min-h-11 items-center rounded-lg border border-line bg-surface-raised pl-3 transition-colors focus-within:border-accent-soft/50 focus-within:bg-surface focus-within:ring-1 focus-within:ring-accent-soft/20">
                <User className="mr-2.5 h-4 w-4 shrink-0 text-ink-faint transition-colors group-focus-within:text-accent-soft" />
                <input
                  id="login-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="domínio\usuário"
                  autoComplete="username"
                  autoFocus
                  className="w-full bg-transparent py-3 pr-3 text-sm text-ink-strong outline-none placeholder:text-ink-faint"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="login-pass" className="block text-xs font-medium text-ink-muted">
              Senha
            </label>
            <div className="group relative flex min-h-11 items-center rounded-lg border border-line bg-surface-raised pl-3 transition-colors focus-within:border-accent-soft/50 focus-within:bg-surface focus-within:ring-1 focus-within:ring-accent-soft/20">
              <Lock className="mr-2.5 h-4 w-4 shrink-0 text-ink-faint transition-colors group-focus-within:text-accent-soft" />
              <input
                id="login-pass"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="••••••••"
                autoComplete="current-password"
                autoFocus={!!detectedUser && !editingUser}
                className="w-full bg-transparent py-3 pr-10 text-sm text-ink-strong outline-none placeholder:text-ink-faint"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="focus-ring absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-faint transition-colors hover:text-ink"
                aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogin}
            disabled={!canSubmit}
            className="btn-accent focus-ring group mt-1 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Autenticando…
              </>
            ) : (
              <>
                Entrar
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </div>

        <p className="mt-7 text-center text-xs text-ink-faint">
          Gestão de Tecnologia da Informação
        </p>
      </motion.div>
    </div>
  );
}
