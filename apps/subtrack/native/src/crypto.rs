//! AES-256-GCM encryption/decryption with scrypt key derivation.
//!
//! Compatible with the existing Node.js crypto implementation:
//! - Algorithm: aes-256-gcm (OpenSSL, same as Node.js)
//! - IV: 16 bytes (Node.js compatible)
//! - Auth tag: 16 bytes
//! - Key: 32 bytes (stored raw in .key file, or derived via scrypt from passphrase)
//! - scrypt: N=131072 (log2=17), r=8, p=1, dkLen=32, salt=32 bytes
//! - Wire format: [IV 16B][AuthTag 16B][Ciphertext]

use openssl::symm::{Cipher, Crypter, Mode};
use rand::rngs::OsRng;
use rand::RngCore;
use scrypt::{scrypt, Params};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

const KEY_LEN: usize = 32;
const IV_LEN: usize = 16;
const TAG_LEN: usize = 16;
const SALT_LEN: usize = 32;
// scrypt: log2(N), r, p, output length
const SCRYPT_LOG_N: u8 = 17; // 2^17 = 131072
const SCRYPT_R: u32 = 8;
const SCRYPT_P: u32 = 1;
const SQLITE_MAGIC: &[u8; 16] = b"SQLite format 3\0";

/// Key storage and encryption/decryption.
pub struct Crypto {
    key: [u8; KEY_LEN],
    db_dir: PathBuf,
}

impl Crypto {
    /// Initialize crypto. If `passphrase` is set, derive key from it; else use key file.
    pub fn new(db_dir: PathBuf, passphrase: Option<String>) -> napi::Result<Self> {
        use std::fs;

        fs::create_dir_all(&db_dir)
            .map_err(|e| napi::Error::from_reason(format!("Failed to create db dir: {}", e)))?;

        match passphrase {
            Some(p) => Self::from_passphrase(db_dir, p),
            None => Self::from_key_file(db_dir),
        }
    }

    fn from_passphrase(db_dir: PathBuf, passphrase: String) -> napi::Result<Self> {
        use std::fs;

        let salt_path = db_dir.join(".key.salt");
        let salt: [u8; SALT_LEN] = if salt_path.exists() {
            let data = fs::read(&salt_path).map_err(|e| {
                napi::Error::from_reason(format!("Failed to read salt file: {}", e))
            })?;
            if data.len() != SALT_LEN {
                return Err(napi::Error::from_reason(format!(
                    "Salt file has unexpected size ({} bytes, expected {})",
                    data.len(),
                    SALT_LEN
                )));
            }
            let mut arr = [0u8; SALT_LEN];
            arr.copy_from_slice(&data);
            arr
        } else {
            let mut salt = [0u8; SALT_LEN];
            OsRng.fill_bytes(&mut salt);
            fs::write(&salt_path, salt).map_err(|e| {
                napi::Error::from_reason(format!("Failed to write salt file: {}", e))
            })?;
            salt
        };

        let mut key = [0u8; KEY_LEN];
        scrypt(
            passphrase.as_bytes(),
            &salt,
            &Params::new(SCRYPT_LOG_N, SCRYPT_R, SCRYPT_P, KEY_LEN)
                .map_err(|e| napi::Error::from_reason(format!("Invalid scrypt params: {}", e)))?,
            &mut key,
        )
        .map_err(|e| napi::Error::from_reason(format!("scrypt failed: {}", e)))?;

        Ok(Self { key, db_dir })
    }

    fn from_key_file(db_dir: PathBuf) -> napi::Result<Self> {
        use std::fs;

        let key_path = db_dir.join(".key");
        let integrity_path = db_dir.join(".key.sha256");

        if key_path.exists() {
            let key_data = fs::read(&key_path)
                .map_err(|e| napi::Error::from_reason(format!("Failed to read key file: {}", e)))?;
            if key_data.len() != KEY_LEN {
                return Err(napi::Error::from_reason(format!(
                    "Key file has unexpected size ({} bytes, expected {})",
                    key_data.len(),
                    KEY_LEN
                )));
            }

            // Verify key integrity
            let expected_hex = hex::encode(Sha256::digest(&key_data));
            if integrity_path.exists() {
                let stored = fs::read_to_string(&integrity_path).map_err(|e| {
                    napi::Error::from_reason(format!("Failed to read key integrity file: {}", e))
                })?;
                let stored = stored.trim();
                if stored != expected_hex {
                    return Err(napi::Error::from_reason(
                        "Encryption key integrity check FAILED. The key file may have been tampered with."
                    ));
                }
            } else {
                fs::write(&integrity_path, format!("{}\n", expected_hex)).map_err(|e| {
                    napi::Error::from_reason(format!("Failed to write key integrity file: {}", e))
                })?;
            }

            let mut key = [0u8; KEY_LEN];
            key.copy_from_slice(&key_data);
            Ok(Self { key, db_dir })
        } else {
            // Generate new key
            let mut key = [0u8; KEY_LEN];
            OsRng.fill_bytes(&mut key);

            fs::write(&key_path, key).map_err(|e| {
                napi::Error::from_reason(format!("Failed to write key file: {}", e))
            })?;

            let hash = hex::encode(Sha256::digest(&key));
            fs::write(&integrity_path, format!("{}\n", hash)).map_err(|e| {
                napi::Error::from_reason(format!("Failed to write key integrity file: {}", e))
            })?;

            Ok(Self { key, db_dir })
        }
    }

    /// Encrypt plaintext: returns [IV 16B][AuthTag 16B][Ciphertext].
    pub fn encrypt(&self, plaintext: &[u8]) -> Vec<u8> {
        let cipher = Cipher::aes_256_gcm();
        let mut iv = [0u8; IV_LEN];
        OsRng.fill_bytes(&mut iv);

        let mut crypter = Crypter::new(cipher, Mode::Encrypt, &self.key, Some(&iv))
            .expect("OpenSSL crypter init");

        // Max output size: plaintext + tag
        let mut out = vec![0u8; plaintext.len() + TAG_LEN];
        let mut count = crypter.update(plaintext, &mut out).expect("encrypt update");
        count += crypter
            .finalize(&mut out[count..])
            .expect("encrypt finalize");
        out.truncate(count);

        let mut tag = vec![0u8; TAG_LEN];
        crypter.get_tag(&mut tag).expect("get auth tag");

        // Format: [IV 16B][Tag 16B][Ciphertext]
        let mut result = Vec::with_capacity(IV_LEN + TAG_LEN + out.len());
        result.extend_from_slice(&iv);
        result.extend_from_slice(&tag);
        result.extend_from_slice(&out);
        result
    }

    /// Decrypt: input is [IV 16B][AuthTag 16B][Ciphertext].
    pub fn decrypt(&self, data: &[u8]) -> napi::Result<Vec<u8>> {
        let min_len = IV_LEN + TAG_LEN;
        if data.len() < min_len {
            return Err(napi::Error::from_reason(format!(
                "Ciphertext too short: expected at least {} bytes, got {}",
                min_len,
                data.len()
            )));
        }

        let iv = &data[..IV_LEN];
        let tag = &data[IV_LEN..IV_LEN + TAG_LEN];
        let ct = &data[IV_LEN + TAG_LEN..];

        let cipher = Cipher::aes_256_gcm();
        let mut crypter = Crypter::new(cipher, Mode::Decrypt, &self.key, Some(iv))
            .map_err(|e| napi::Error::from_reason(format!("Failed to init decrypt: {}", e)))?;

        crypter
            .set_tag(tag)
            .map_err(|e| napi::Error::from_reason(format!("Failed to set auth tag: {}", e)))?;

        let mut out = vec![0u8; ct.len() + TAG_LEN];
        let mut count = crypter
            .update(ct, &mut out)
            .map_err(|e| napi::Error::from_reason(format!("Decrypt error: {}", e)))?;
        count += crypter
            .finalize(&mut out[count..])
            .map_err(|e| napi::Error::from_reason(format!("Decrypt finalize error: {}", e)))?;
        out.truncate(count);

        Ok(out)
    }

    /// Check if a buffer looks encrypted (doesn't start with SQLite magic).
    pub fn is_encrypted(buf: &[u8]) -> bool {
        if buf.len() < 16 {
            return false;
        }
        &buf[..16] != SQLITE_MAGIC
    }
}
