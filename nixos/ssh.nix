# Remote access: key-only OpenSSH plus mosh.
{ ... }:

{
  services.openssh = {
    enable = true;
    settings = {
      PasswordAuthentication = false;
      KbdInteractiveAuthentication = false;
    };
  };

  programs.mosh.enable = true; # also opens UDP 60000-61000
}
