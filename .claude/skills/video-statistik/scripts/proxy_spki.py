"""Writes the SPKI hashes of the sandbox proxy CAs for Chromium's --ignore-certificate-errors-spki-list.
usage: python3 scripts/proxy_spki.py <out-file>

Why: in the cloud session HTTPS goes through an inspecting proxy whose CA is in
/root/.ccr/ca-bundle.crt. curl and Python trust it, but Playwright's Chromium does not, so map tiles
fail with ERR_CERT_AUTHORITY_INVALID. Passing exactly these CA keys trusts the same bundle the rest of
the session already trusts; it does not turn certificate checking off for anything else.
Re-run after a container restart: the proxy CA can rotate.
"""
import re
import subprocess
import sys

BUNDLE = "/root/.ccr/ca-bundle.crt"
pem = open(BUNDLE).read()
out = []
for cert in re.findall(r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----", pem, re.S):
    subject = subprocess.run(["openssl", "x509", "-noout", "-subject"], input=cert, capture_output=True, text=True).stdout
    if "Anthropic" not in subject:
        continue
    pub = subprocess.run(["openssl", "x509", "-pubkey", "-noout"], input=cert, capture_output=True, text=True).stdout
    der = subprocess.run(["openssl", "pkey", "-pubin", "-outform", "der"], input=pub.encode(), capture_output=True).stdout
    digest = subprocess.run(["openssl", "dgst", "-sha256", "-binary"], input=der, capture_output=True).stdout
    out.append(subprocess.run(["openssl", "base64"], input=digest, capture_output=True).stdout.decode().strip())
open(sys.argv[1] if len(sys.argv) > 1 else "spki.txt", "w").write(",".join(out))
print(len(out), "proxy CA keys")
