use base32::Alphabet;
use hmac::{Hmac, Mac};
use sha1::Sha1;
use sha2::{Sha256, Sha512};
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha1 = Hmac<Sha1>;
type HmacSha256 = Hmac<Sha256>;
type HmacSha512 = Hmac<Sha512>;

#[derive(Debug, Clone)]
pub struct TotpCode {
    pub code: String,
    pub remaining_seconds: i64,
}

pub fn generate_totp(
    secret_key: &str,
    digits: u32,
    period: u64,
    algorithm: &str,
) -> Result<TotpCode, String> {
    // Decode Base32 secret key
    let secret_bytes = base32::decode(Alphabet::Rfc4648 { padding: true }, secret_key)
        .ok_or("Invalid Base32 secret key")?;

    // Get current time and calculate time step
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Time error: {}", e))?
        .as_secs();

    let time_step = now / period;
    let remaining_seconds = period - (now % period);

    // Convert time step to bytes (big-endian)
    let time_bytes = time_step.to_be_bytes();

    // Generate HMAC based on algorithm
    let hmac_result = match algorithm.to_uppercase().as_str() {
        "SHA256" => {
            let mut mac = HmacSha256::new_from_slice(&secret_bytes)
                .map_err(|e| format!("HMAC error: {}", e))?;
            mac.update(&time_bytes);
            mac.finalize().into_bytes().to_vec()
        }
        "SHA512" => {
            let mut mac = HmacSha512::new_from_slice(&secret_bytes)
                .map_err(|e| format!("HMAC error: {}", e))?;
            mac.update(&time_bytes);
            mac.finalize().into_bytes().to_vec()
        }
        "MD5" => {
            // For MD5, we need to use a different approach
            return Err("MD5 algorithm not supported".to_string());
        }
        _ => {
            // Default to SHA1
            let mut mac = HmacSha1::new_from_slice(&secret_bytes)
                .map_err(|e| format!("HMAC error: {}", e))?;
            mac.update(&time_bytes);
            mac.finalize().into_bytes().to_vec()
        }
    };

    // Dynamic truncation
    let offset = (hmac_result[hmac_result.len() - 1] & 0x0f) as usize;
    let binary = ((hmac_result[offset] & 0x7f) as u32) << 24
        | (hmac_result[offset + 1] as u32) << 16
        | (hmac_result[offset + 2] as u32) << 8
        | (hmac_result[offset + 3] as u32);

    let hotp = binary % 10u32.pow(digits);

    // Format with leading zeros
    let code = format!("{:0width$}", hotp, width = digits as usize);

    Ok(TotpCode {
        code,
        remaining_seconds: remaining_seconds as i64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_totp() {
        // Test with a known secret (Google's test secret)
        let secret = "JBSWY3DPEHPK3PXP";
        let result = generate_totp(secret, 6, 30, "SHA1");
        assert!(result.is_ok());
        assert_eq!(result.unwrap().code.len(), 6);
    }

    #[test]
    fn test_invalid_base32() {
        let result = generate_totp("invalid@#$", 6, 30, "SHA1");
        assert!(result.is_err());
    }
}
