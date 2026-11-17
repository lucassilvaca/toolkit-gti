//! Presença na LAN: quais máquinas estão ligadas e onde está cada pessoa.
//!
//! - [`scan`] — varredura da VLAN do técnico + faixas extras (tabela de usuários online).
//! - [`lookup`] — busca de uma pessoa pelo login (ex.: `joao.silva`).
//! - [`probe`] — sondagem de host (ping/TCP/`whoami`), compartilhada pelos dois.
//! - [`smb`] — plano B: usuário logado via SMB (445) em máquinas sem Toolkit.
//! - [`cache`] — "visto por último" persistido em `~/.toolkit_gti/presence_cache.json`.
//! - `matching` — regras puras de nome/rede (testadas em `tests/presence_matching.rs`).
//! - [`networks`] — faixas extras (CIDR) e plano de varredura multi-VLAN.

pub mod cache;
pub mod lookup;
pub mod matching;
pub mod networks;
pub mod probe;
pub mod scan;
pub mod smb;
pub mod types;

pub use lookup::find_user_by_name;
pub use networks::{get_scan_networks, set_scan_networks};
pub use scan::{probe_host_by_ip, scan_online_users};
pub use types::{OnlineUser, ScanResult, UserLookupResult};
