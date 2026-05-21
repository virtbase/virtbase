#!/usr/bin/perl

use strict;
use warnings;
use LWP::UserAgent;
use HTTP::Request;
use Sys::Hostname;

# ==========================================
# CONFIGURATION & STATIC VARIABLES
# ==========================================
# These values are replaced during the upload to the snippet storage.
# For testing, copy the script and replace the values with the actual values.
my $WEBHOOK_URL = '{{PUBLIC_DOMAIN}}/api/proxmox/webhook';
my $SECRET_AUTH = 'Bearer {{HOOKSCRIPT_SECRET}}';

# ==========================================
# PHASE DOCUMENTATION
# ==========================================
# pre-start:  Executed before the guest is started. Exiting with a code != 0 will abort the start.
# post-start: Executed after the guest successfully started.
# pre-stop:   Executed before stopping the guest via the API. (Not executed if stopped from within).
# post-stop:  Executed after the guest stopped. Runs even if the guest crashes or stops unexpectedly.

# Define the valid phases for validation
my %VALID_PHASES = map { $_ => 1 } ('pre-start', 'post-start', 'pre-stop', 'post-stop');

# ==========================================
# MAIN EXECUTION
# ==========================================
print "GUEST HOOK: " . join(' ', @ARGV). "\n";

my $vmid  = shift;
my $phase = shift;

# Check against the allowed phases. Die if it's an unexpected phase.
if (!$VALID_PHASES{$phase}) {
    die "got unknown phase '$phase'\n";
}

# Fetch the active Proxmox node name
my $nodename = hostname;

# Informational console print
print "Processing phase '$phase' for guest $vmid on node $nodename...\n";

# ==========================================
# WEBHOOK TRANSMISSION
# ==========================================
my $ua = LWP::UserAgent->new;
$ua->timeout(5); # 5-second timeout so it doesn't hang VM transitions

# Construct the JSON payload
my $json_payload = sprintf(
    '{"vmid": "%s", "phase": "%s", "node": "%s"}', 
    $vmid, 
    $phase, 
    $nodename
);

# Create the POST request
my $req = HTTP::Request->new(POST => $WEBHOOK_URL);
$req->header('Content-Type'  => 'application/json');
$req->header('Authorization' => $SECRET_AUTH);
$req->content($json_payload);

# Send the request
my $resp = $ua->request($req);

if ($resp->is_success) {
    print "Webhook sent successfully for $phase.\n";
} else {
    warn "Failed to send webhook: " . $resp->status_line . "\n";
    
    # Optional: If you want a failed pre-start webhook to block the VM from starting, 
    # uncomment the next line.
    # exit(1) if $phase eq 'pre-start';
}

exit(0);