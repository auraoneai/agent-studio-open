use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fmt;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum KeychainError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("secret not found")]
    NotFound,
    #[error("crypto operation failed")]
    Crypto,
    #[error("invalid key: {0}")]
    InvalidKey(String),
    #[error("keychain scope is not approved for secret storage: {0}")]
    DisallowedScope(String),
    #[error("native keychain operation failed: {0}")]
    Native(String),
}

pub type Result<T> = std::result::Result<T, KeychainError>;

#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
pub struct KeychainKey {
    pub service: String,
    pub scope: String,
    pub identifier: String,
}

impl KeychainKey {
    pub fn new(
        service: impl Into<String>,
        scope: impl Into<String>,
        identifier: impl Into<String>,
    ) -> Result<Self> {
        let key = Self {
            service: service.into(),
            scope: scope.into(),
            identifier: identifier.into(),
        };
        key.validate()?;
        Ok(key)
    }

    fn storage_key(&self) -> String {
        format!("{}:{}:{}", self.service, self.scope, self.identifier)
    }

    pub fn validate(&self) -> Result<()> {
        for value in [&self.service, &self.scope, &self.identifier] {
            if value.is_empty()
                || !value
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
            {
                return Err(KeychainError::InvalidKey(value.clone()));
            }
        }
        if !is_allowed_secret_scope(&self.scope) {
            return Err(KeychainError::DisallowedScope(self.scope.clone()));
        }
        Ok(())
    }
}

pub const ALLOWED_SECRET_SCOPES: &[&str] = &[
    "byo-api-keys",
    "sentry-token",
    "huggingface-token",
    "auraone-cloud-token",
    "enterprise-mtls-identity",
    "updater-signing-key",
    "intake-install-signing-key",
];

pub fn is_allowed_secret_scope(scope: &str) -> bool {
    ALLOWED_SECRET_SCOPES.contains(&scope)
}

impl fmt::Display for KeychainKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}:<identifier>", self.service, self.scope)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BackendKind {
    MacosKeychain,
    WindowsCredentialManager,
    LinuxSecretService,
    LinuxEncryptedFileFallback,
}

pub trait SecretBackend: Send + Sync {
    fn kind(&self) -> BackendKind;
    fn set(&self, key: &KeychainKey, value: &SecretString) -> Result<()>;
    fn get(&self, key: &KeychainKey) -> Result<Option<SecretString>>;
    fn delete(&self, key: &KeychainKey) -> Result<()>;
    fn list(&self, service: &str, scope: &str) -> Result<Vec<String>>;
}

#[derive(Clone, Eq, PartialEq)]
pub struct SecretString(String);

impl SecretString {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("SecretString(<redacted>)")
    }
}

pub struct Keychain<B: SecretBackend> {
    backend: B,
}

impl<B: SecretBackend> Keychain<B> {
    pub fn new(backend: B) -> Self {
        Self { backend }
    }

    pub fn backend_kind(&self) -> BackendKind {
        self.backend.kind()
    }

    pub fn set(&self, key: &KeychainKey, value: &str) -> Result<()> {
        key.validate()?;
        self.backend.set(key, &SecretString::new(value))
    }

    pub fn get(&self, key: &KeychainKey) -> Result<Option<SecretString>> {
        key.validate()?;
        self.backend.get(key)
    }

    pub fn delete(&self, key: &KeychainKey) -> Result<()> {
        key.validate()?;
        self.backend.delete(key)
    }

    pub fn list(&self, service: &str, scope: &str) -> Result<Vec<String>> {
        self.backend.list(service, scope)
    }
}

#[derive(Clone)]
pub struct EncryptedFileBackend {
    path: PathBuf,
    key: [u8; 32],
}

impl EncryptedFileBackend {
    pub fn new(path: impl Into<PathBuf>, machine_id: &str, user_id: &str) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(b"auraone-open-keychain-file-v1");
        hasher.update(machine_id.as_bytes());
        hasher.update(user_id.as_bytes());
        let mut key = [0u8; 32];
        key.copy_from_slice(&hasher.finalize());
        Self {
            path: path.into(),
            key,
        }
    }

    fn load(&self) -> Result<BTreeMap<String, String>> {
        if !self.path.exists() {
            return Ok(BTreeMap::new());
        }
        let bytes = fs::read(&self.path)?;
        let value: BTreeMap<String, String> =
            serde_json::from_slice(&bytes).map_err(|_| KeychainError::Crypto)?;
        Ok(value)
    }

    fn save(&self, values: &BTreeMap<String, String>) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let bytes = serde_json::to_vec_pretty(values).map_err(|_| KeychainError::Crypto)?;
        write_private_file(&self.path, &bytes)?;
        Ok(())
    }

    fn encrypt(&self, value: &SecretString) -> Result<String> {
        let cipher = Aes256Gcm::new_from_slice(&self.key).map_err(|_| KeychainError::Crypto)?;
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce_bytes), value.expose().as_bytes())
            .map_err(|_| KeychainError::Crypto)?;
        Ok(format!(
            "{}.{}",
            STANDARD.encode(nonce_bytes),
            STANDARD.encode(ciphertext)
        ))
    }

    fn decrypt(&self, encoded: &str) -> Result<SecretString> {
        let (nonce, ciphertext) = encoded.split_once('.').ok_or(KeychainError::Crypto)?;
        let nonce = STANDARD.decode(nonce).map_err(|_| KeychainError::Crypto)?;
        let ciphertext = STANDARD
            .decode(ciphertext)
            .map_err(|_| KeychainError::Crypto)?;
        let cipher = Aes256Gcm::new_from_slice(&self.key).map_err(|_| KeychainError::Crypto)?;
        let cleartext = cipher
            .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
            .map_err(|_| KeychainError::Crypto)?;
        let text = String::from_utf8(cleartext).map_err(|_| KeychainError::Crypto)?;
        Ok(SecretString::new(text))
    }
}

#[cfg(unix)]
fn write_private_file(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::fs::OpenOptions;
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)?;
    file.write_all(bytes)?;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
fn write_private_file(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    fs::write(path, bytes)
}

impl SecretBackend for EncryptedFileBackend {
    fn kind(&self) -> BackendKind {
        BackendKind::LinuxEncryptedFileFallback
    }

    fn set(&self, key: &KeychainKey, value: &SecretString) -> Result<()> {
        let mut values = self.load()?;
        values.insert(key.storage_key(), self.encrypt(value)?);
        self.save(&values)
    }

    fn get(&self, key: &KeychainKey) -> Result<Option<SecretString>> {
        self.load()?
            .get(&key.storage_key())
            .map(|value| self.decrypt(value))
            .transpose()
    }

    fn delete(&self, key: &KeychainKey) -> Result<()> {
        let mut values = self.load()?;
        values.remove(&key.storage_key());
        self.save(&values)
    }

    fn list(&self, service: &str, scope: &str) -> Result<Vec<String>> {
        let prefix = format!("{service}:{scope}:");
        let mut identifiers = self
            .load()?
            .keys()
            .filter_map(|key| key.strip_prefix(&prefix).map(ToOwned::to_owned))
            .collect::<Vec<_>>();
        identifiers.sort();
        Ok(identifiers)
    }
}

#[derive(Clone)]
pub struct NativeKeychainBackend {
    fallback: EncryptedFileBackend,
    kind: BackendKind,
    use_native: bool,
}

impl NativeKeychainBackend {
    pub fn for_current_os(fallback_path: impl AsRef<Path>) -> Self {
        let kind = if cfg!(target_os = "macos") {
            BackendKind::MacosKeychain
        } else if cfg!(target_os = "windows") {
            BackendKind::WindowsCredentialManager
        } else {
            BackendKind::LinuxSecretService
        };
        Self {
            fallback: EncryptedFileBackend::new(
                fallback_path.as_ref(),
                "native-unavailable-test-machine",
                "current-user",
            ),
            kind,
            use_native: true,
        }
    }

    pub fn for_backend_kind(kind: BackendKind, fallback_path: impl AsRef<Path>) -> Self {
        Self {
            fallback: EncryptedFileBackend::new(
                fallback_path.as_ref(),
                "native-unavailable-test-machine",
                "current-user",
            ),
            kind,
            use_native: false,
        }
    }

    fn marker_value() -> SecretString {
        SecretString::new("__auraone_native_keychain_entry__")
    }

    fn marker_to_option(value: Option<SecretString>) -> Option<SecretString> {
        value.filter(|secret| secret.expose() != Self::marker_value().expose())
    }

    fn allow_native_failure_fallback(&self) -> bool {
        matches!(self.kind, BackendKind::LinuxSecretService)
    }

    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    fn native_entry(key: &KeychainKey) -> std::result::Result<keyring::Entry, keyring::Error> {
        keyring::Entry::new_with_target(&key.scope, &key.service, &key.identifier)
    }

    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    fn set_native(&self, key: &KeychainKey, value: &SecretString) -> Result<bool> {
        if !self.use_native || self.kind == BackendKind::LinuxEncryptedFileFallback {
            return Ok(false);
        }
        let entry =
            Self::native_entry(key).map_err(|error| KeychainError::Native(error.to_string()))?;
        entry
            .set_password(value.expose())
            .map_err(|error| KeychainError::Native(error.to_string()))?;
        self.fallback.set(key, &Self::marker_value())?;
        Ok(true)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    fn set_native(&self, _key: &KeychainKey, _value: &SecretString) -> Result<bool> {
        Ok(false)
    }

    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    fn get_native(&self, key: &KeychainKey) -> Result<Option<SecretString>> {
        if !self.use_native || self.kind == BackendKind::LinuxEncryptedFileFallback {
            return Ok(None);
        }
        let entry =
            Self::native_entry(key).map_err(|error| KeychainError::Native(error.to_string()))?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(SecretString::new(secret))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(KeychainError::Native(error.to_string())),
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    fn get_native(&self, _key: &KeychainKey) -> Result<Option<SecretString>> {
        Ok(None)
    }

    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    fn delete_native(&self, key: &KeychainKey) -> Result<()> {
        if !self.use_native || self.kind == BackendKind::LinuxEncryptedFileFallback {
            return Ok(());
        }
        let entry =
            Self::native_entry(key).map_err(|error| KeychainError::Native(error.to_string()))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(KeychainError::Native(error.to_string())),
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    fn delete_native(&self, _key: &KeychainKey) -> Result<()> {
        Ok(())
    }
}

impl SecretBackend for NativeKeychainBackend {
    fn kind(&self) -> BackendKind {
        self.kind.clone()
    }

    fn set(&self, key: &KeychainKey, value: &SecretString) -> Result<()> {
        match self.set_native(key, value) {
            Ok(true) => Ok(()),
            Ok(false) => self.fallback.set(key, value),
            Err(_error) if self.allow_native_failure_fallback() => self.fallback.set(key, value),
            Err(error) => Err(error),
        }
    }

    fn get(&self, key: &KeychainKey) -> Result<Option<SecretString>> {
        match self.get_native(key) {
            Ok(Some(secret)) => Ok(Some(secret)),
            Ok(None) => Ok(Self::marker_to_option(self.fallback.get(key)?)),
            Err(_error) if self.allow_native_failure_fallback() => {
                Ok(Self::marker_to_option(self.fallback.get(key)?))
            }
            Err(error) => Err(error),
        }
    }

    fn delete(&self, key: &KeychainKey) -> Result<()> {
        match self.delete_native(key) {
            Ok(()) => self.fallback.delete(key),
            Err(_error) if self.allow_native_failure_fallback() => self.fallback.delete(key),
            Err(error) => Err(error),
        }
    }

    fn list(&self, service: &str, scope: &str) -> Result<Vec<String>> {
        self.fallback.list(service, scope)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> KeychainKey {
        KeychainKey {
            service: "rubric-studio-open".into(),
            scope: "byo-api-keys".into(),
            identifier: "anthropic".into(),
        }
    }

    #[test]
    fn file_backend_round_trip_redacts_debug() {
        let dir = tempfile::tempdir().unwrap();
        let backend =
            EncryptedFileBackend::new(dir.path().join("credentials.dat"), "machine", "1000");
        let keychain = Keychain::new(backend);
        keychain.set(&key(), "sk-test-value").unwrap();
        let secret = keychain.get(&key()).unwrap().unwrap();
        assert_eq!(secret.expose(), "sk-test-value");
        assert_eq!(format!("{secret:?}"), "SecretString(<redacted>)");
        assert_eq!(
            keychain.list("rubric-studio-open", "byo-api-keys").unwrap(),
            vec!["anthropic"]
        );
        keychain.delete(&key()).unwrap();
        assert!(keychain.get(&key()).unwrap().is_none());
    }

    #[test]
    fn invalid_key_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let backend =
            EncryptedFileBackend::new(dir.path().join("credentials.dat"), "machine", "1000");
        let keychain = Keychain::new(backend);
        let bad = KeychainKey {
            service: "rubric studio".into(),
            scope: "scope".into(),
            identifier: "id".into(),
        };
        assert!(keychain.set(&bad, "secret").is_err());
    }

    #[test]
    fn user_content_scope_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let backend =
            EncryptedFileBackend::new(dir.path().join("credentials.dat"), "machine", "1000");
        let keychain = Keychain::new(backend);
        let content_key = KeychainKey {
            service: "rubric-studio-open".into(),
            scope: "project-content".into(),
            identifier: "rubric-body".into(),
        };
        assert!(matches!(
            keychain.set(&content_key, "user-authored rubric text"),
            Err(KeychainError::DisallowedScope(scope)) if scope == "project-content"
        ));
    }

    #[test]
    fn platform_backend_contracts_share_the_same_api() {
        let dir = tempfile::tempdir().unwrap();
        for kind in [
            BackendKind::MacosKeychain,
            BackendKind::WindowsCredentialManager,
            BackendKind::LinuxSecretService,
            BackendKind::LinuxEncryptedFileFallback,
        ] {
            let backend = NativeKeychainBackend::for_backend_kind(
                kind.clone(),
                dir.path().join(format!("{kind:?}.dat")),
            );
            let keychain = Keychain::new(backend);
            keychain.set(&key(), "sk-test-value").unwrap();
            assert_eq!(keychain.backend_kind(), kind);
            assert_eq!(
                keychain.get(&key()).unwrap().unwrap().expose(),
                "sk-test-value"
            );
        }
    }

    #[test]
    fn current_os_backend_kind_matches_native_target() {
        let dir = tempfile::tempdir().unwrap();
        let backend = NativeKeychainBackend::for_current_os(dir.path().join("native.dat"));
        let expected = if cfg!(target_os = "macos") {
            BackendKind::MacosKeychain
        } else if cfg!(target_os = "windows") {
            BackendKind::WindowsCredentialManager
        } else {
            BackendKind::LinuxSecretService
        };

        assert_eq!(backend.kind(), expected);
    }

    #[test]
    #[ignore = "requires an interactive/native OS keychain service on the runner"]
    fn native_backend_round_trip_on_current_os() {
        assert_eq!(
            std::env::var("AURAONE_RUN_NATIVE_KEYCHAIN_SMOKE").as_deref(),
            Ok("1"),
            "set AURAONE_RUN_NATIVE_KEYCHAIN_SMOKE=1 to run native keychain smoke tests"
        );

        let dir = tempfile::tempdir().unwrap();
        let backend = NativeKeychainBackend::for_current_os(dir.path().join("native.dat"));
        let keychain = Keychain::new(backend);
        let key = KeychainKey::new(
            "auraone-open-studio-platform-smoke",
            "byo-api-keys",
            format!("native-smoke-{}", std::process::id()),
        )
        .unwrap();

        keychain.set(&key, "sk-native-smoke-value").unwrap();
        assert_eq!(
            keychain.get(&key).unwrap().unwrap().expose(),
            "sk-native-smoke-value"
        );
        keychain.delete(&key).unwrap();
        assert!(keychain.get(&key).unwrap().is_none());
    }
}
