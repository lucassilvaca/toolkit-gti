//! Regras PURAS de nome e rede usadas pela presença.
//!
//! Sem Tauri, serde nem `crate::` — só `std` — para que
//! `tests/presence_matching.rs` pode incluir este arquivo via `#[path]` e rodar
//! sem linkar o lib do Tauri (mesma técnica de `net_guard.rs`).

use std::net::Ipv4Addr;

/// Grau do casamento entre a busca e o usuário logado numa máquina.
/// A ordem importa: `Exact` < `Partial` (exato vem primeiro na ordenação).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum MatchKind {
    Exact,
    Partial,
}

/// Normaliza um login para comparação: tira espaços, domínio (`EMPRESA\\x`,
/// `x@dominio`) e caixa. `" EMPRESA\\Joao.Silva "` → `"joao.silva"`.
pub fn normalize_username(raw: &str) -> String {
    let trimmed = raw.trim();
    let without_domain = trimmed.rsplit('\\').next().unwrap_or(trimmed);
    let without_upn = without_domain.split('@').next().unwrap_or(without_domain);
    without_upn.trim().to_lowercase()
}

/// Compara a busca (já normalizada) com o usuário reportado por uma máquina.
/// `None` = não casa. Partial = a busca é um pedaço do login (ex.: `joao`).
pub fn match_kind(query: &str, candidate: &str) -> Option<MatchKind> {
    let query = normalize_username(query);
    let candidate = normalize_username(candidate);
    if query.is_empty() || candidate.is_empty() {
        return None;
    }
    if candidate == query {
        Some(MatchKind::Exact)
    } else if candidate.contains(&query) {
        Some(MatchKind::Partial)
    } else {
        None
    }
}

/// Uma resposta encerra a busca quando a pessoa está online agora E o nome
/// bate exatamente — aí não vale a pena varrer a rede.
pub fn is_conclusive(online: bool, kind: MatchKind) -> bool {
    online && kind == MatchKind::Exact
}

/// Domínios de sessões do próprio Windows em `NetWkstaUserEnum` (`UMFD-0`,
/// `DWM-1`, serviços) — não são pessoas.
const SYSTEM_LOGON_DOMAINS: [&str; 4] = [
    "font driver host",
    "window manager",
    "nt authority",
    "nt service",
];

/// A partir das sessões de uma máquina (`(domínio, usuário)`, como devolve
/// `NetWkstaUserEnum`), extrai `(hostname, usuário)`: a conta da máquina
/// (`PC0102$`) dá o hostname; a primeira sessão de pessoa dá o usuário.
/// Campo vazio quando não houver.
pub fn identify_logons(entries: &[(String, String)]) -> (String, String) {
    let hostname = entries
        .iter()
        .find_map(|(_, user)| user.strip_suffix('$'))
        .unwrap_or_default()
        .to_string();
    let username = entries
        .iter()
        .find(|(domain, user)| {
            !user.is_empty()
                && !user.ends_with('$')
                && !SYSTEM_LOGON_DOMAINS.contains(&domain.to_lowercase().as_str())
        })
        .map(|(_, user)| user.clone())
        .unwrap_or_default();
    (hostname, username)
}

/// Menor prefixo aceito numa faixa configurada (/20 = 4094 hosts).
pub const MIN_PREFIX: u8 = 20;
/// Maior prefixo aceito (/30 = 2 hosts; /31 e /32 não têm hosts "normais").
pub const MAX_PREFIX: u8 = 30;
/// A VLAN do técnico é varrida inteira até este tamanho; acima disso (ex.: uma
/// /16), só o bloco /22 em volta do IP dele, para a varredura não levar minutos.
pub const MIN_LOCAL_PREFIX: u8 = 22;

/// Faixa IPv4 em CIDR, sempre guardada pelo endereço de rede.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Ipv4Range {
    network: u32,
    prefix: u8,
}

impl Ipv4Range {
    /// Faixa que contém `ip` com o prefixo dado. `None` fora de `MIN..=MAX_PREFIX`.
    pub fn new(ip: Ipv4Addr, prefix: u8) -> Option<Self> {
        if !(MIN_PREFIX..=MAX_PREFIX).contains(&prefix) {
            return None;
        }
        Some(Self {
            network: u32::from(ip) & Self::mask(prefix),
            prefix,
        })
    }

    /// Faixa da VLAN do técnico: prefixo real do adaptador (ou /24 se não
    /// veio), limitado a `MIN_LOCAL_PREFIX` para não varrer redes enormes.
    pub fn local(ip: Ipv4Addr, prefix: Option<u8>) -> Self {
        let prefix = prefix.unwrap_or(24).clamp(MIN_LOCAL_PREFIX, MAX_PREFIX);
        Self {
            network: u32::from(ip) & Self::mask(prefix),
            prefix,
        }
    }

    fn mask(prefix: u8) -> u32 {
        u32::MAX << (32 - u32::from(prefix))
    }

    /// Quantidade de hosts utilizáveis (sem rede e broadcast).
    pub fn host_count(&self) -> u32 {
        (1u32 << (32 - u32::from(self.prefix))) - 2
    }

    /// Hosts utilizáveis, em ordem.
    pub fn hosts(&self) -> impl Iterator<Item = Ipv4Addr> {
        let first = self.network + 1;
        (first..first + self.host_count()).map(Ipv4Addr::from)
    }

    pub fn contains(&self, ip: Ipv4Addr) -> bool {
        u32::from(ip) & Self::mask(self.prefix) == self.network
    }

    /// Forma canônica `"rede/prefixo"` (ex.: `"10.20.30.128/25"`).
    pub fn to_cidr(&self) -> String {
        format!("{}/{}", Ipv4Addr::from(self.network), self.prefix)
    }
}

/// Lê uma faixa configurada. Aceita CIDR (`"10.20.31.0/25"`), IP com prefixo
/// (`"10.20.31.77/25"` → rede `.0/25`) e o formato antigo /24 (`"10.20.31"`,
/// `"10.20.31.0"`). `None` se inválida ou fora de `/20`–`/30`.
pub fn parse_range(entry: &str) -> Option<Ipv4Range> {
    let e = entry.trim();
    if e.is_empty() || e.contains(':') {
        return None;
    }
    let (base, prefix) = match e.split_once('/') {
        Some((base, prefix)) => (base.trim(), prefix.trim().parse::<u8>().ok()?),
        None => (e, 24),
    };
    let ip: Ipv4Addr = if base.split('.').count() == 3 {
        format!("{base}.0").parse().ok()?
    } else {
        base.parse().ok()?
    };
    Ipv4Range::new(ip, prefix)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_range_aceita_cidr_e_formato_antigo() {
        let cidr = |s: &str| parse_range(s).map(|r| r.to_cidr());
        assert_eq!(cidr("10.20.31"), Some("10.20.31.0/24".into()));
        assert_eq!(cidr("10.20.31.0/25"), Some("10.20.31.0/25".into()));
        assert_eq!(cidr(" 10.20.31.200/25 "), Some("10.20.31.128/25".into()));
        for bad in [
            "",
            "10.0",
            "fe80::1",
            "300.1.1",
            "a.b.c",
            "10.0.0.0/8",
            "10.0.0.0/31",
        ] {
            assert_eq!(parse_range(bad), None, "{bad}");
        }
    }

    #[test]
    fn normaliza_dominio_e_caixa() {
        assert_eq!(normalize_username(" EMPRESA\\Joao.Silva "), "joao.silva");
        assert_eq!(normalize_username("joao.silva@empresa.com"), "joao.silva");
    }

    #[test]
    fn exato_antes_de_parcial() {
        assert!(MatchKind::Exact < MatchKind::Partial);
        assert_eq!(match_kind("joao", "Joao.Silva"), Some(MatchKind::Partial));
        assert_eq!(
            match_kind("joao.silva", "JOAO.SILVA"),
            Some(MatchKind::Exact)
        );
        assert_eq!(match_kind("maria", "joao.silva"), None);
        assert_eq!(match_kind("joao", ""), None);
    }

    #[test]
    fn faixa_25_tem_126_hosts_sem_rede_e_broadcast() {
        let r = parse_range("10.20.30.128/25").unwrap();
        let hosts: Vec<Ipv4Addr> = r.hosts().collect();
        assert_eq!(hosts.len(), 126);
        assert_eq!(hosts[0], Ipv4Addr::new(10, 20, 30, 129));
        assert_eq!(hosts[125], Ipv4Addr::new(10, 20, 30, 254));
        assert!(r.contains(Ipv4Addr::new(10, 20, 30, 145)));
        assert!(!r.contains(Ipv4Addr::new(10, 20, 30, 10)));
    }
}
