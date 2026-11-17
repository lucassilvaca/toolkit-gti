import { invoke } from "@tauri-apps/api/core";
import type { NetworkConfig } from "../../../shared/types/chat";

/**
 * Service for managing network configuration (TCP port for chat)
 */
export class NetworkConfigService {
  private static readonly DEFAULT_PORT = 7890;

  /**
   * Read current network configuration (throws on read/parse failure)
   */
  static async readConfig(): Promise<NetworkConfig> {
    const configStr = await invoke<string>("read_network_config");
    return JSON.parse(configStr);
  }

  /**
   * Get current network configuration
   * Returns default config if file doesn't exist
   */
  static async getConfig(): Promise<NetworkConfig> {
    try {
      return await this.readConfig();
    } catch {
      return this.getDefaultConfig();
    }
  }

  static async getChatPort(): Promise<number> {
    try {
      return await invoke<number>("get_chat_port_from_config");
    } catch {
      const config = await this.getConfig();
      return config.tcp_port;
    }
  }

  /**
   * Get default configuration
   */
  private static getDefaultConfig(): NetworkConfig {
    const now = new Date().toISOString();
    return {
      tcp_port: this.DEFAULT_PORT,
      last_modified: now,
      applied_at: now,
    };
  }

  /**
   * Get the default port number
   */
  static getDefaultPort(): number {
    return this.DEFAULT_PORT;
  }
}
