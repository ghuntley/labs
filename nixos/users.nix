{ ... }:

{
  users.users.ghuntley = {
    isNormalUser = true;
    description = "ghuntley";
    extraGroups = [
      "networkmanager"
      "wheel"
    ];
    linger = true; # keep user services running without a login session
    openssh.authorizedKeys.keys = [
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFiX7qvQS3QjzL8y31KxMPn5EOyufjgz2YuRD3GNWcuR"
    ];
  };

  security.sudo.wheelNeedsPassword = false;
}
