//! Config and profile management (JSON file-based, not DB).

use std::path::Path;

use crate::types::{AppConfig, FilterProfile};

fn get_config_path(db_dir: &Path) -> std::path::PathBuf {
    db_dir.join("config.json")
}

fn default_config() -> AppConfig {
    AppConfig {
        default_currency: Some("USD".to_string()),
        monthly_budget: Some(0),
        theme: Some("default".to_string()),
        notify_days: Some(7),
        profiles: None,
        active_profile: None,
        budgets: None,
        yearly_budget: None,
        notify_channels: None,
        notify_email: None,
        slack_webhook: None,
        webhook_url: None,
    }
}

pub fn load_config_from_file(db_dir: &Path) -> napi::Result<AppConfig> {
    use std::fs;

    let config_path = get_config_path(db_dir);

    if !config_path.exists() {
        return Ok(default_config());
    }

    let raw = fs::read(&config_path)
        .map_err(|e| napi::Error::from_reason(format!("Failed to read config: {}", e)))?;

    // Check for magic header indicating encrypted config (SUBCCFG magic)
    if raw.len() >= 16 && &raw[..8] == b"SUBCCFG\x00" {
        // Config is encrypted, return defaults (decryption handled in TS)
        // The Rust side can't decrypt without the key, so we return defaults
        // and let the caller handle decryption in TS
        let mut cfg = default_config();
        cfg.theme = Some("encrypted".to_string()); // Signal that config exists but is encrypted
        return Ok(cfg);
    }

    // Plain JSON
    let text = String::from_utf8(raw)
        .map_err(|e| napi::Error::from_reason(format!("Config encoding error: {}", e)))?;

    let parsed: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| napi::Error::from_reason(format!("Config parse error: {}", e)))?;

    Ok(AppConfig {
        default_currency: parsed
            .get("defaultCurrency")
            .and_then(|v| v.as_str().map(|s| s.to_string())),
        monthly_budget: parsed.get("monthlyBudget").and_then(|v| v.as_i64()),
        theme: parsed
            .get("theme")
            .and_then(|v| v.as_str().map(|s| s.to_string())),
        notify_days: parsed.get("notifyDays").and_then(|v| v.as_i64()),
        profiles: parsed.get("profiles").map(|v| v.to_string()),
        active_profile: parsed
            .get("activeProfile")
            .and_then(|v| v.as_str().map(|s| s.to_string())),
        budgets: parsed.get("budgets").map(|v| v.to_string()),
        yearly_budget: parsed.get("yearlyBudget").and_then(|v| v.as_i64()),
        notify_channels: parsed.get("notifyChannels").and_then(|v| {
            v.as_array().map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
        }),
        notify_email: parsed
            .get("notifyEmail")
            .and_then(|v| v.as_str().map(|s| s.to_string())),
        slack_webhook: parsed
            .get("slackWebhook")
            .and_then(|v| v.as_str().map(|s| s.to_string())),
        webhook_url: parsed
            .get("webhookUrl")
            .and_then(|v| v.as_str().map(|s| s.to_string())),
    })
}

pub fn save_config_to_file(db_dir: &Path, config: &AppConfig) -> napi::Result<()> {
    use std::fs;

    let config_path = get_config_path(db_dir);

    let mut map = serde_json::Map::new();
    if let Some(ref v) = config.default_currency {
        map.insert(
            "defaultCurrency".to_string(),
            serde_json::Value::String(v.clone()),
        );
    }
    if let Some(v) = config.monthly_budget {
        map.insert("monthlyBudget".to_string(), serde_json::json!(v));
    }
    if let Some(ref v) = config.theme {
        map.insert("theme".to_string(), serde_json::Value::String(v.clone()));
    }
    if let Some(v) = config.notify_days {
        map.insert("notifyDays".to_string(), serde_json::json!(v));
    }
    if let Some(ref v) = config.profiles {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(v) {
            map.insert("profiles".to_string(), val);
        }
    }
    if let Some(ref v) = config.active_profile {
        map.insert(
            "activeProfile".to_string(),
            serde_json::Value::String(v.clone()),
        );
    }
    if let Some(ref v) = config.budgets {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(v) {
            map.insert("budgets".to_string(), val);
        }
    }
    if let Some(v) = config.yearly_budget {
        map.insert("yearlyBudget".to_string(), serde_json::json!(v));
    }
    if let Some(ref v) = config.notify_channels {
        map.insert("notifyChannels".to_string(), serde_json::json!(v));
    }
    if let Some(ref v) = config.notify_email {
        map.insert(
            "notifyEmail".to_string(),
            serde_json::Value::String(v.clone()),
        );
    }
    if let Some(ref v) = config.slack_webhook {
        map.insert(
            "slackWebhook".to_string(),
            serde_json::Value::String(v.clone()),
        );
    }
    if let Some(ref v) = config.webhook_url {
        map.insert(
            "webhookUrl".to_string(),
            serde_json::Value::String(v.clone()),
        );
    }

    let json = serde_json::to_string_pretty(&map)
        .map_err(|e| napi::Error::from_reason(format!("JSON serialize: {}", e)))?;

    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| napi::Error::from_reason(format!("Failed to create config dir: {}", e)))?;
    }

    fs::write(&config_path, json.as_bytes())
        .map_err(|e| napi::Error::from_reason(format!("Failed to write config: {}", e)))?;

    Ok(())
}

pub fn reset_config_file(db_dir: &Path) -> napi::Result<()> {
    use std::fs;

    let config_path = get_config_path(db_dir);
    if config_path.exists() {
        fs::remove_file(&config_path)
            .map_err(|e| napi::Error::from_reason(format!("Failed to remove config: {}", e)))?;
    }
    // Remove SHA256 sidecar if present
    let sha_path = config_path.with_extension("json.sha256");
    if sha_path.exists() {
        fs::remove_file(&sha_path).ok();
    }
    Ok(())
}

// ── Profile operations (stored in config.json) ──

fn parse_profiles(config: &AppConfig) -> std::collections::HashMap<String, FilterProfile> {
    let mut profiles = std::collections::HashMap::new();

    if let Some(ref profiles_json) = config.profiles {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(profiles_json) {
            if let Some(obj) = val.as_object() {
                for (name, data) in obj {
                    let tags = data.get("tags").and_then(|v| v.as_array()).map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    });
                    let status = data
                        .get("status")
                        .and_then(|v| v.as_str().map(|s| s.to_string()));
                    let payment_method = data
                        .get("paymentMethod")
                        .and_then(|v| v.as_str().map(|s| s.to_string()));
                    profiles.insert(
                        name.clone(),
                        FilterProfile {
                            name: name.clone(),
                            tags,
                            status,
                            payment_method,
                        },
                    );
                }
            }
        }
    }

    profiles
}

fn serialize_profiles(profiles: &std::collections::HashMap<String, FilterProfile>) -> String {
    let mut map = serde_json::Map::new();
    for (name, profile) in profiles {
        let mut pm = serde_json::Map::new();
        if let Some(ref tags) = profile.tags {
            pm.insert("tags".to_string(), serde_json::json!(tags));
        }
        if let Some(ref status) = profile.status {
            pm.insert("status".to_string(), serde_json::json!(status));
        }
        if let Some(ref method) = profile.payment_method {
            pm.insert("paymentMethod".to_string(), serde_json::json!(method));
        }
        map.insert(name.clone(), serde_json::Value::Object(pm));
    }
    serde_json::Value::Object(map).to_string()
}

pub fn list_profiles(db_dir: &Path) -> napi::Result<Vec<FilterProfile>> {
    let config = load_config_from_file(db_dir)?;
    let profiles = parse_profiles(&config);
    Ok(profiles.into_values().collect())
}

pub fn show_profile(db_dir: &Path, name: &str) -> napi::Result<Option<FilterProfile>> {
    let config = load_config_from_file(db_dir)?;
    let profiles = parse_profiles(&config);
    Ok(profiles.get(name).cloned())
}

pub fn save_profile(db_dir: &Path, name: &str, profile: &FilterProfile) -> napi::Result<()> {
    let mut config = load_config_from_file(db_dir)?;
    let mut profiles = parse_profiles(&config);

    profiles.insert(
        name.to_string(),
        FilterProfile {
            name: name.to_string(),
            tags: profile.tags.clone(),
            status: profile.status.clone(),
            payment_method: profile.payment_method.clone(),
        },
    );

    config.profiles = Some(serialize_profiles(&profiles));
    save_config_to_file(db_dir, &config)
}

pub fn switch_profile(db_dir: &Path, name: &str) -> napi::Result<AppConfig> {
    let mut config = load_config_from_file(db_dir)?;
    config.active_profile = Some(name.to_string());
    save_config_to_file(db_dir, &config)?;
    Ok(config)
}

pub fn delete_profile(db_dir: &Path, name: &str) -> napi::Result<()> {
    let mut config = load_config_from_file(db_dir)?;
    let mut profiles = parse_profiles(&config);

    if profiles.remove(name).is_none() {
        return Err(napi::Error::from_reason(format!(
            "Profile '{}' not found",
            name
        )));
    }

    if config.active_profile.as_deref() == Some(name) {
        config.active_profile = None;
    }

    config.profiles = Some(serialize_profiles(&profiles));
    save_config_to_file(db_dir, &config)
}
