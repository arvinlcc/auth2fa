use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtpAuthData {
    pub namespace: String,
    pub account_name: String,
    pub secret_key: String,
    pub algorithm: Option<String>,
    pub digits: Option<i32>,
    pub period: Option<i32>,
}

/// Parse otpauth://totp/ URL
/// Format: otpauth://totp/Label:Account?secret=...&issuer=...
pub fn parse_otpauth_url(input: &str) -> Result<OtpAuthData, String> {
    let url = Url::parse(input)
        .map_err(|_| "Invalid URL format".to_string())?;

    if url.scheme() != "otpauth" {
        return Err("Not an otpauth URL".to_string());
    }

    if url.host_str() != Some("totp") {
        return Err("Only TOTP is supported".to_string());
    }

    // Get the label (format: issuer:account or just account)
    let label = url.path().trim_start_matches('/');
    let (namespace, account_name) = if let Some(pos) = label.find(':') {
        let issuer = &label[..pos];
        let account = &label[pos + 1..];
        (issuer.to_string(), account.to_string())
    } else {
        ("DEFAULT".to_string(), label.to_string())
    };

    // Parse query parameters
    let query_pairs: std::collections::HashMap<_, _> =
        url.query_pairs().into_owned().collect();

    let secret_key = query_pairs
        .get("secret")
        .ok_or("Missing secret parameter")?
        .to_uppercase();

    // Use issuer from query if available, otherwise use parsed label
    let namespace = query_pairs
        .get("issuer")
        .map(|s| s.to_string())
        .unwrap_or(namespace);

    Ok(OtpAuthData {
        namespace,
        account_name,
        secret_key,
        algorithm: query_pairs.get("algorithm").map(|s| s.to_string()),
        digits: query_pairs.get("digits").and_then(|s| s.parse().ok()),
        period: query_pairs.get("period").and_then(|s| s.parse().ok()),
    })
}

/// Try to parse input as otpauth URL or extract Base32 secret
pub fn parse_clipboard_content(input: &str) -> Result<OtpAuthData, String> {
    let input = input.trim();

    // Try otpauth URL first
    if input.starts_with("otpauth://") {
        return parse_otpauth_url(input);
    }

    // Check if it looks like a Base32 secret (uppercase, alphanumeric, padding)
    if input.len() >= 16 && input.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '=') {
        return Ok(OtpAuthData {
            namespace: "DEFAULT".to_string(),
            account_name: "Imported Account".to_string(),
            secret_key: input.to_uppercase(),
            algorithm: None,
            digits: None,
            period: None,
        });
    }

    Err("Could not recognize clipboard content as otpauth URL or Base32 secret".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_otpauth_url() {
        let url = "otpauth://totp/Google:test@gmail.com?secret=JBSWY3DPEHPK3PXP&issuer=Google";
        let result = parse_otpauth_url(url).unwrap();
        assert_eq!(result.namespace, "Google");
        assert_eq!(result.account_name, "test@gmail.com");
        assert_eq!(result.secret_key, "JBSWY3DPEHPK3PXP");
    }

    #[test]
    fn test_parse_base32_secret() {
        let secret = "JBSWY3DPEHPK3PXP";
        let result = parse_clipboard_content(secret).unwrap();
        assert_eq!(result.namespace, "DEFAULT");
        assert_eq!(result.secret_key, "JBSWY3DPEHPK3PXP");
    }
}
