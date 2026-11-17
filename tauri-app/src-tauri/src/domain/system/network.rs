use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, UdpSocket};
use windows::Win32::NetworkManagement::IpHelper::{
    GetAdaptersAddresses, GAA_FLAG_INCLUDE_GATEWAYS, IP_ADAPTER_ADDRESSES_LH,
};
use windows::Win32::Networking::WinSock::AF_INET;

/// Network information gathered from Windows API
#[derive(Debug, Clone)]
pub struct NetworkInfo {
    pub local_ip: String,
    pub mac_address: String,
    pub gateway: String,
    pub dns_server: String,
    pub dhcp_enabled: bool,
}

/// Public IP information from external API
#[derive(Debug, Clone)]
pub struct PublicIpInfo {
    pub ip: String,
    pub isp: String,
}

/// Get network info using native Windows API (single call, no PowerShell)
pub fn get_network_info() -> NetworkInfo {
    // Try UDP socket method first for local IP (fastest, most reliable)
    let local_ip = get_local_ip_socket().unwrap_or_else(|| "N/A".to_string());

    // Get MAC, gateway, DNS, and DHCP status from Windows API
    let (mac_address, gateway, dns_server, dhcp_enabled) = get_adapter_info();

    NetworkInfo {
        local_ip,
        mac_address,
        gateway,
        dns_server,
        dhcp_enabled,
    }
}

/// Get local IP using UDP socket trick (no actual connection made)
fn get_local_ip_socket() -> Option<String> {
    local_ip_toward(SocketAddr::from(([8, 8, 8, 8], 80))).map(|ip| ip.to_string())
}

/// IP local que o Windows usa como origem para chegar a `target`.
///
/// `connect` em UDP só consulta a tabela de rotas; nada é enviado. Com VPN
/// split-tunnel a resposta muda conforme o destino: a rota da internet sai
/// pelo Wi-Fi de casa, a rede interna sai pela interface da VPN.
pub fn local_ip_toward(target: SocketAddr) -> Option<IpAddr> {
    let bind = if target.is_ipv4() {
        SocketAddr::from((Ipv4Addr::UNSPECIFIED, 0))
    } else {
        SocketAddr::from((Ipv6Addr::UNSPECIFIED, 0))
    };
    let socket = UdpSocket::bind(bind).ok()?;
    socket.connect(target).ok()?;
    let ip = socket.local_addr().ok()?.ip();
    (!ip.is_unspecified()).then_some(ip)
}

/// Tamanho do prefixo (máscara) da rede do adaptador que tem `ip`
/// (ex.: 10.20.30.145 → 25). `None` se nenhum adaptador tiver esse IPv4.
pub fn local_prefix_len(ip: std::net::Ipv4Addr) -> Option<u8> {
    let family = AF_INET.0 as u32;
    let flags = GAA_FLAG_INCLUDE_GATEWAYS;

    // SAFETY: mesmo protocolo de `get_adapter_info`: 1ª chamada só mede o
    // buffer; a 2ª preenche um Vec<u8> do tamanho pedido; a lista ligada e os
    // ponteiros de endereço apontam para dentro desse buffer ou são nulos.
    unsafe {
        let mut size: u32 = 0;
        let _ = GetAdaptersAddresses(family, flags, None, None, &mut size);
        if size == 0 {
            return None;
        }
        let mut buffer: Vec<u8> = vec![0; size as usize];
        let addresses = buffer.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH;
        if GetAdaptersAddresses(family, flags, None, Some(addresses), &mut size) != 0 {
            return None;
        }

        let wanted = u32::from_ne_bytes(ip.octets());
        let mut current = addresses;
        while !current.is_null() {
            let adapter = &*current;
            let mut unicast = adapter.FirstUnicastAddress;
            while !unicast.is_null() {
                let entry = &*unicast;
                let sockaddr = entry.Address.lpSockaddr;
                if !sockaddr.is_null() && (*sockaddr).sa_family == AF_INET {
                    let sockaddr_in =
                        sockaddr as *const windows::Win32::Networking::WinSock::SOCKADDR_IN;
                    if (*sockaddr_in).sin_addr.S_un.S_addr == wanted {
                        return Some(entry.OnLinkPrefixLength);
                    }
                }
                unicast = entry.Next;
            }
            current = adapter.Next;
        }
    }
    None
}

/// Get MAC address, gateway, DNS, and DHCP status from Windows API
fn get_adapter_info() -> (String, String, String, bool) {
    let mut mac_address = "N/A".to_string();
    let mut gateway = "N/A".to_string();
    let mut dns_server = "N/A".to_string();
    let mut dhcp_enabled = false;

    // SAFETY: All unsafe operations in this block interact with Windows APIs that
    // require raw pointers and FFI calls. Each unsafe operation is documented below
    // with its preconditions and safety invariants.
    unsafe {
        // First call to get required buffer size
        let mut size: u32 = 0;
        let flags = GAA_FLAG_INCLUDE_GATEWAYS;
        let family = AF_INET.0 as u32;

        // SAFETY: GetAdaptersAddresses is a Windows FFI call. Passing None for the
        // addresses pointer is explicitly allowed by the API to get the required buffer
        // size. The size out-parameter is a valid mutable reference, properly aligned.
        let _ = GetAdaptersAddresses(family, flags, None, None, &mut size);

        if size == 0 {
            return (mac_address, gateway, dns_server, dhcp_enabled);
        }

        // SAFETY: We allocate exactly the size returned by GetAdaptersAddresses,
        // which guarantees the buffer is large enough for the adapter addresses
        // structures. The vector ensures proper memory management and deallocation.
        let mut buffer: Vec<u8> = vec![0; size as usize];

        // SAFETY: We cast the buffer's mutable pointer to the expected struct pointer.
        // The buffer size (size bytes) matches what the Windows API requires.
        // The pointer is valid for reads/writes of the entire buffer and properly
        // aligned since it comes from a Vec<u8> which has alignment 1.
        let addresses = buffer.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH;

        // SAFETY: GetAdaptersAddresses will write into the provided buffer. We pass
        // the pointer and the original size. The API guarantees not to write beyond
        // the specified size when successful (returns ERROR_SUCCESS/0).
        let result = GetAdaptersAddresses(family, flags, None, Some(addresses), &mut size);

        // ERROR_SUCCESS = 0
        if result != 0 {
            return (mac_address, gateway, dns_server, dhcp_enabled);
        }

        // SAFETY: After successful GetAdaptersAddresses call, the buffer contains
        // valid IP_ADAPTER_ADDRESSES_LH structures in a linked list format.
        // We verified addresses is non-null (buffer allocation succeeded).
        let mut current = addresses;
        while !current.is_null() {
            // SAFETY: We verified current is non-null. GetAdaptersAddresses guarantees
            // that returned pointers point to valid, properly aligned structures within
            // our allocated buffer. We create an immutable reference which is safe
            // as long as we don't modify the data while iterating.
            let adapter = &*current;

            // Skip loopback and non-operational adapters
            // IfOperStatusUp = 1
            if adapter.OperStatus.0 == 1 {
                // Get MAC address
                if adapter.PhysicalAddressLength > 0 {
                    // SAFETY: PhysicalAddressLength indicates the valid length of data
                    // in the PhysicalAddress field (max 8 bytes per Windows API docs).
                    // We slice only up to this length to avoid reading uninitialized bytes.
                    let mac_bytes =
                        &adapter.PhysicalAddress[..adapter.PhysicalAddressLength as usize];
                    mac_address = mac_bytes
                        .iter()
                        .map(|b| format!("{:02X}", b))
                        .collect::<Vec<_>>()
                        .join("-");
                }

                // Check DHCP status - Flags bit 2 (0x04) indicates DHCP enabled
                let flags_value = adapter.Anonymous2.Flags;
                dhcp_enabled = (flags_value & 0x04) != 0;

                // Get gateway
                let mut gw = adapter.FirstGatewayAddress;
                while !gw.is_null() {
                    // SAFETY: gw is non-null and GetAdaptersAddresses guarantees
                    // valid, properly aligned IP_ADAPTER_GATEWAY_ADDRESS_LH structures.
                    let gw_addr = &*gw;

                    // SAFETY: lpSockaddr is a pointer to a socket address structure.
                    // We must check for null before dereferencing as the API may
                    // return null if no address is available.
                    let sockaddr = gw_addr.Address.lpSockaddr;
                    if !sockaddr.is_null() {
                        // SAFETY: sockaddr is non-null and points to valid data.
                        // We read only the sa_family field (first 2 bytes) which is
                        // always valid for any sockaddr structure.
                        let sa_family = (*sockaddr).sa_family;
                        if sa_family == AF_INET {
                            // IPv4 gateway
                            // SAFETY: We verified sa_family is AF_INET, so the socket
                            // address is a SOCKADDR_IN. The cast is valid because
                            // SOCKADDR_IN has the same memory layout prefix as the
                            // generic sockaddr (both start with sa_family).
                            let sockaddr_in =
                                sockaddr as *const windows::Win32::Networking::WinSock::SOCKADDR_IN;

                            // SAFETY: The sockaddr_in pointer is valid and properly
                            // aligned. We read only the sin_addr field which is valid
                            // for IPv4 addresses returned by GetAdaptersAddresses.
                            let addr = (*sockaddr_in).sin_addr.S_un.S_addr;
                            let bytes = addr.to_ne_bytes();
                            gateway =
                                format!("{}.{}.{}.{}", bytes[0], bytes[1], bytes[2], bytes[3]);
                            break;
                        }
                    }
                    // SAFETY: Next pointer is guaranteed by API to be valid or null.
                    // We update our loop variable to continue iteration.
                    gw = gw_addr.Next;
                }

                // Get DNS server
                let mut dns = adapter.FirstDnsServerAddress;
                while !dns.is_null() {
                    // SAFETY: dns is non-null and GetAdaptersAddresses guarantees
                    // valid, properly aligned IP_ADAPTER_DNS_SERVER_ADDRESS structures.
                    let dns_addr = &*dns;

                    // SAFETY: lpSockaddr may be null if no DNS server is configured.
                    // We check for null before dereferencing to avoid undefined behavior.
                    let sockaddr = dns_addr.Address.lpSockaddr;
                    if !sockaddr.is_null() {
                        // SAFETY: sockaddr is non-null. We read sa_family which is
                        // always at a valid offset in any sockaddr structure.
                        let sa_family = (*sockaddr).sa_family;
                        if sa_family == AF_INET {
                            // IPv4 DNS
                            // SAFETY: Verified AF_INET family, so cast to SOCKADDR_IN
                            // is valid. Both structures share the same prefix layout.
                            let sockaddr_in =
                                sockaddr as *const windows::Win32::Networking::WinSock::SOCKADDR_IN;

                            // SAFETY: Pointer is valid for reading sin_addr field.
                            // GetAdaptersAddresses populates this data from system config.
                            let addr = (*sockaddr_in).sin_addr.S_un.S_addr;
                            let bytes = addr.to_ne_bytes();
                            dns_server =
                                format!("{}.{}.{}.{}", bytes[0], bytes[1], bytes[2], bytes[3]);
                            break;
                        }
                    }
                    // SAFETY: Next pointer follows same API guarantees as gateway iteration.
                    dns = dns_addr.Next;
                }

                // Found a valid adapter, stop searching
                if mac_address != "N/A" {
                    break;
                }
            }

            // SAFETY: Next pointer in the linked list is guaranteed by the API
            // to point to the next adapter in our buffer or be null for the last item.
            current = adapter.Next;
        }
    }

    (mac_address, gateway, dns_server, dhcp_enabled)
}

/// Serviços de IP público em ordem de tentativa: (URL, ponteiro JSON do IP,
/// ponteiro JSON da operadora). Só HTTPS: a rede corporativa reseta o HTTP puro
/// do ip-api.com, e o ipinfo.io devolve 429 pelo NAT compartilhado da empresa.
const PUBLIC_IP_SOURCES: [(&str, &str, &str); 2] = [
    (
        "https://ipwho.is/?fields=ip,connection",
        "/ip",
        "/connection/isp",
    ),
    (
        "https://free.freeipapi.com/api/json",
        "/ipAddress",
        "/asnOrganization",
    ),
];

/// Timeout de cada serviço — o painel espera no máximo a soma deles.
const PUBLIC_IP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

/// Get public IP and ISP info using external API (async)
pub async fn get_public_ip_info() -> PublicIpInfo {
    let unknown = || PublicIpInfo {
        ip: "N/A".to_string(),
        isp: "N/A".to_string(),
    };
    let Ok(client) = reqwest::Client::builder()
        .timeout(PUBLIC_IP_TIMEOUT)
        .build()
    else {
        return unknown();
    };
    for (url, ip_ptr, isp_ptr) in PUBLIC_IP_SOURCES {
        if let Some(info) = fetch_public_ip(&client, url, ip_ptr, isp_ptr).await {
            return info;
        }
    }
    unknown()
}

async fn fetch_public_ip(
    client: &reqwest::Client,
    url: &str,
    ip_ptr: &str,
    isp_ptr: &str,
) -> Option<PublicIpInfo> {
    let body: serde_json::Value = client
        .get(url)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .json()
        .await
        .ok()?;
    parse_public_ip(&body, ip_ptr, isp_ptr)
}

/// Resposta de serviço externo: só aceita se o IP for um endereço de verdade.
fn parse_public_ip(body: &serde_json::Value, ip_ptr: &str, isp_ptr: &str) -> Option<PublicIpInfo> {
    let field = |ptr: &str| {
        body.pointer(ptr)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
    };
    let ip = field(ip_ptr)?.parse::<IpAddr>().ok()?;
    Some(PublicIpInfo {
        ip: ip.to_string(),
        isp: field(isp_ptr).unwrap_or("N/A").to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_ip_toward_uses_route_to_target() {
        // Loopback sai pela própria interface de loopback, em qualquer máquina.
        let ip = local_ip_toward(SocketAddr::from(([127, 0, 0, 1], 7890)));
        assert_eq!(ip, Some(IpAddr::V4(Ipv4Addr::LOCALHOST)));
    }

    #[test]
    fn parse_public_ip_le_os_dois_servicos() {
        let ipwho = serde_json::json!({
            "ip": "200.146.201.193",
            "connection": { "isp": "ALGAR TELECOM S/A" }
        });
        let info = parse_public_ip(&ipwho, "/ip", "/connection/isp").unwrap();
        assert_eq!(
            (info.ip.as_str(), info.isp.as_str()),
            ("200.146.201.193", "ALGAR TELECOM S/A")
        );

        let freeipapi = serde_json::json!({ "ipAddress": "200.146.201.193" });
        let info = parse_public_ip(&freeipapi, "/ipAddress", "/asnOrganization").unwrap();
        assert_eq!(info.isp, "N/A");
    }

    #[test]
    fn parse_public_ip_recusa_resposta_sem_ip_valido() {
        let erro = serde_json::json!({ "success": false, "message": "rate limit" });
        assert!(parse_public_ip(&erro, "/ip", "/connection/isp").is_none());
        let lixo = serde_json::json!({ "ip": "<script>" });
        assert!(parse_public_ip(&lixo, "/ip", "/connection/isp").is_none());
    }

    /// Rede real: `cargo test -- --ignored public_ip_real`.
    #[tokio::test]
    #[ignore]
    async fn public_ip_real() {
        let info = get_public_ip_info().await;
        assert_ne!(info.ip, "N/A", "nenhum serviço respondeu");
        println!("{} · {}", info.ip, info.isp);
    }
}
