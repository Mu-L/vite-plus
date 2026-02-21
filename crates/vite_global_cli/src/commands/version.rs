//! Version command (Category B: JavaScript Command).

use std::process::ExitStatus;

use vite_path::AbsolutePathBuf;

use crate::error::Error;

/// Execute the `--version` command by delegating to local or global vite-plus.
pub async fn execute(cwd: AbsolutePathBuf) -> Result<ExitStatus, Error> {
    super::delegate::execute(cwd, "--version", &[]).await
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_version_command_module_exists() {
        // Basic test to ensure the module compiles
        assert!(true);
    }
}
