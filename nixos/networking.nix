{ ... }:

{
  networking.hostName = "labs-ghuntley-com";

  # Static LAN address on ens18; gateway/DNS are the existing router.
  networking.useDHCP = false;
  networking.interfaces.ens18 = {
    useDHCP = false;
    ipv4.addresses = [
      {
        address = "10.10.10.250";
        prefixLength = 24;
      }
    ];
  };
  networking.defaultGateway = {
    address = "10.10.10.254";
    interface = "ens18";
  };
  networking.nameservers = [ "10.10.10.254" ];
  networking.search = [ "home.local" ];

  # NetworkManager stays available for other interfaces but must not
  # run DHCP on ens18.
  networking.networkmanager.enable = true;
  networking.networkmanager.unmanaged = [ "ens18" ];

  services.tailscale = {
    enable = true;
    openFirewall = true; # UDP 41641 for direct peer connections
  };
}
