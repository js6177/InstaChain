import type { ConfigInterface } from "models/config_models/Config";


export function loadConfig(filepath: string): ConfigInterface {
    // Load the configuration file
    return require(filepath);
}