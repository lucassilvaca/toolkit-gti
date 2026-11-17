//! Windows-specific constants and helpers.
//!
//! Single source of truth for `CREATE_NO_WINDOW` and related Windows process flags.

/// Windows process creation flag that prevents a console window from appearing.
///
/// Equivalent to `CREATE_NO_WINDOW` (0x08000000) from the Windows API.
/// Use with `.creation_flags(CREATE_NO_WINDOW)` on `std::process::Command`.
///
/// # Example
///
/// ```ignore
/// use crate::infra::windows::CREATE_NO_WINDOW;
/// use std::os::windows::process::CommandExt;
///
/// let output = Command::new("cmd")
///     .creation_flags(CREATE_NO_WINDOW)
///     .args(["/C", "echo hello"])
///     .output()?;
/// ```
pub const CREATE_NO_WINDOW: u32 = 0x08000000;
