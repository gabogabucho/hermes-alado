// The repo's one-shot server preparer. Kept in a single constant so every
// "Requiere acceso al servidor" card points at the same command (phase 4b).
// The script itself (`provisioner/prepare.sh`) is built in another phase.
export const PREPARER_COMMAND =
  'curl -fsSL https://raw.githubusercontent.com/gabogabucho/hermes-droidbot/main/provisioner/prepare.sh | sudo bash -s -- --all'
