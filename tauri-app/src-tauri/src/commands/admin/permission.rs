/// Admin permission wrapper for Tauri commands.
/// Provides a way to check admin status before executing sensitive operations.
/// Internal function to check if the user is an admin.
/// Uses Windows API to check group membership.
#[cfg(windows)]
use crate::infra::windows::CREATE_NO_WINDOW;

#[allow(dead_code)] // Used via require_admin! macro - clippy false positive
pub fn is_admin_user() -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        let output = std::process::Command::new("net")
            .args(["localgroup", "administrators"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let username = std::env::var("USERNAME").unwrap_or_default();
            stdout.contains(&username)
        } else {
            false
        }
    }

    #[cfg(not(windows))]
    {
        // On non-Windows platforms, check for root
        unsafe { libc::getuid() == 0 }
    }
}

/// Macro to wrap a command with admin permission check.
/// Usage: require_admin!()
#[macro_export]
macro_rules! require_admin {
    () => {
        if !$crate::commands::admin::permission::is_admin_user() {
            return Err("Unauthorized: Admin privileges required".to_string());
        }
    };
}
