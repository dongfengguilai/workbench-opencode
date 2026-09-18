#!/usr/bin/env python3
"""Read-only V1 infrastructure checks. Does not install or authenticate a user.

May also be sent to the target with `python3 -` without installing any files.
Exit 2 means a deployment prerequisite is missing; JSON is emitted to stdout.
Peer certificates are diagnostic information, never automatically trusted.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import ssl
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timezone

INSTALL_PATH = "/home/aisvr/mnt/sda/programs/WorkBench-v1"


def command(args, timeout=12, input_text=None):
    try:
        result = subprocess.run(args, input=input_text, capture_output=True,
                                text=True, timeout=timeout)
        return {"exitCode": result.returncode, "stdout": result.stdout,
                "stderr": result.stderr}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"exitCode": None, "error": str(error)}


def inspect_directory(path):
    """Never create a directory, follow an install-path symlink, or claim ownership."""
    path = Path(path)
    if not path.is_absolute():
        return {"blockers": ["INSTALL_PATH_NOT_ABSOLUTE"]}
    blockers = []
    links = [str(item) for item in [path, *path.parents] if item.is_symlink()]
    if links:
        blockers.append("INSTALL_PATH_SYMLINK")
    ancestor = path
    while not ancestor.exists() and ancestor != ancestor.parent:
        ancestor = ancestor.parent
    entries = None
    try:
        if path.exists():
            if not path.is_dir():
                blockers.append("INSTALL_PATH_NOT_DIRECTORY")
            else:
                entries = sorted(item.name for item in path.iterdir())
                if entries:
                    blockers.append("INSTALL_PATH_NONEMPTY_UNCLAIMED")
        writable = os.access(ancestor, os.W_OK | os.X_OK)
        if not writable:
            blockers.append("INSTALL_PARENT_NOT_WRITABLE")
        free = shutil.disk_usage(ancestor).free
        if free < 10 * 1024**3:
            blockers.append("INSTALL_FREE_SPACE_BELOW_10_GIB")
        return {"path": str(path), "exists": path.exists(),
                "nearestExistingParent": str(ancestor), "symlinks": links,
                "parentWritable": writable, "freeBytes": free,
                "existingEntries": entries, "blockers": blockers}
    except OSError as error:
        return {"path": str(path), "blockers": ["INSTALL_DIRECTORY_UNREADABLE"],
                "error": str(error)}


def get(url, context=None):
    # Direct probe: do not inherit an arbitrary HTTP(S)_PROXY from the SSH shell.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                                        urllib.request.HTTPSHandler(context=context))
    try:
        with opener.open(url, timeout=8) as response:
            body = response.read(128 * 1024 + 1)
            return {"httpStatus": response.status,
                    "responseTruncated": len(body) > 128 * 1024}, body[:128 * 1024]
    except urllib.error.HTTPError as error:
        return {"httpStatus": error.code}, b""
    except (OSError, urllib.error.URLError) as error:
        return {"httpStatus": None, "error": str(error)}, b""


def certificate_metadata(host):
    # s_client without verify_return_error is ONLY to observe the supplied chain.
    # Its zero exit code is NOT a TLS acceptance or an HTTP success result.
    result = command(["openssl", "s_client", "-connect", host + ":443",
                      "-servername", host, "-showcerts"], input_text="", timeout=10)
    certificates = []
    for pem in re.findall(r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----",
                          result.get("stdout", ""), re.S):
        der = base64.b64decode("".join(pem.splitlines()[1:-1]), validate=True)
        meta = command(["openssl", "x509", "-noout", "-subject", "-issuer", "-dates"],
                       input_text=pem)
        certificates.append({"sha256": hashlib.sha256(der).hexdigest(),
                             "metadata": meta.get("stdout", "").strip()})
    return {"purpose": "untrusted_peer_chain_diagnostics_only",
            "certificates": certificates, "verificationDiagnostics": result.get("stderr"),
            "error": result.get("error")}


def ingress_checks(domain, cert, key, hostnames):
    blockers = []
    result = {"baseDomain": domain, "browserAcceptance": "NOT_RUN", "blockers": blockers}
    if not domain:
        blockers.append("HTTPS_BASE_DOMAIN_MISSING")
    elif not re.fullmatch(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", domain):
        blockers.append("HTTPS_BASE_DOMAIN_INVALID")
    if not cert or not key:
        blockers.append("HTTPS_CERTIFICATE_AND_KEY_MISSING")
        return result
    cert, key = Path(cert), Path(key)
    result["certificatePath"], result["keyPath"] = str(cert), str(key)
    if not cert.is_absolute() or not key.is_absolute() or not cert.is_file() or not key.is_file():
        blockers.append("HTTPS_CERTIFICATE_FILES_UNAVAILABLE")
        return result
    if key.stat().st_mode & 0o077:
        blockers.append("HTTPS_KEY_PERMISSIONS_NOT_PRIVATE")
    meta = command(["openssl", "x509", "-in", str(cert), "-noout", "-subject", "-issuer", "-dates", "-fingerprint", "-sha256"])
    result["certificateMetadata"] = meta.get("stdout")
    # Uses the system trust store; never downloads or implicitly trusts an issuer.
    verification = command(["openssl", "verify", "-purpose", "sslserver", "-untrusted", str(cert), str(cert)])
    result["systemTrust"] = verification
    if verification.get("exitCode") != 0:
        blockers.append("HTTPS_CERTIFICATE_NOT_SYSTEM_TRUSTED")
    public = command(["openssl", "x509", "-in", str(cert), "-pubkey", "-noout"])
    key_public = command(["openssl", "pkey", "-in", str(key), "-pubout", "-passin", "pass:"])
    if public.get("exitCode") != 0 or key_public.get("exitCode") != 0 or public.get("stdout") != key_public.get("stdout"):
        blockers.append("HTTPS_CERTIFICATE_KEY_MISMATCH_OR_UNREADABLE")
    if not hostnames:
        blockers.append("HTTPS_WORKBENCH_AND_PREVIEW_HOSTNAMES_MISSING")
    result["hostnameChecks"] = {}
    for hostname in hostnames:
        check = command(["openssl", "x509", "-in", str(cert), "-noout", "-checkhost", hostname])
        result["hostnameChecks"][hostname] = check
        # Some OpenSSL versions return zero even for a hostname mismatch.
        if check.get("exitCode") != 0 or "does match certificate" not in check.get("stdout", ""):
            blockers.append("HTTPS_CERTIFICATE_HOSTNAME_MISMATCH:" + hostname)
    return result


def run(args):
    blockers = []
    directory = inspect_directory(args.install_path)
    blockers.extend(directory["blockers"])
    mount = command(["findmnt", "-J", "-T", directory.get("nearestExistingParent", "/"),
                     "-o", "TARGET,SOURCE,FSTYPE,OPTIONS,PROPAGATION"])
    try:
        mount = json.loads(mount["stdout"])["filesystems"][0]
        if mount.get("propagation") != "shared":
            blockers.append("INSTALL_MOUNT_NOT_SHARED")
        if mount.get("fstype") != "ext4":
            blockers.append("INSTALL_FILESYSTEM_NOT_VALIDATED_EXT4")
    except (KeyError, ValueError, IndexError):
        blockers.append("INSTALL_MOUNT_UNVERIFIED")
    tools = {name: shutil.which(name) for name in
             ["docker", "git", "openssl", "findmnt", "losetup", "mkfs.ext4", "mount"]}
    blockers.extend("TOOL_MISSING:" + name for name, value in tools.items() if not value)
    docker = command(["docker", "version", "--format", "{{.Server.Version}}"])
    compose = command(["docker", "compose", "version", "--short"])
    if docker.get("exitCode") != 0 or compose.get("exitCode") != 0:
        blockers.append("DOCKER_OR_COMPOSE_UNAVAILABLE")
    if not Path("/dev/loop-control").exists():
        blockers.append("LOOP_CONTROL_MISSING")
    containers = command(["docker", "ps", "-q"])
    ids = containers.get("stdout", "").split() if containers.get("exitCode") == 0 else []
    before = command(["docker", "inspect", "--format", "{{.Id}} {{.Name}} {{.Image}} {{.State.StartedAt}}", *ids]) if ids else containers
    model, body = get("http://127.0.0.1:4003/v1/models")
    try:
        model["modelIds"] = [item["id"] for item in json.loads(body)["data"]]
    except (ValueError, KeyError, TypeError):
        model["modelIds"] = []
    model["inferenceAcceptance"] = "NOT_RUN"
    if model.get("httpStatus") != 200 or "Qwen3.6-35B-A3B" not in model["modelIds"]:
        blockers.append("QWEN_MODEL_LIST_UNAVAILABLE_OR_ID_MISMATCH")
    netid, _ = get("http://10.132.17.137:44327/api/app/user/login")
    netid["purpose"] = "GET_route_probe_only_not_password_login"
    netid["loginAcceptance"] = "NOT_RUN"
    ingress = ingress_checks(args.base_domain, args.tls_cert, args.tls_key, args.tls_hostname)
    blockers.extend(ingress["blockers"])
    context = ssl.create_default_context()
    ca = None
    if args.egress_ca:
        path = Path(args.egress_ca)
        try:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            ca = {"path": str(path), "sha256": digest}
            if not args.egress_ca_sha256 or digest != args.egress_ca_sha256:
                blockers.append("EGRESS_CA_MAINTAINER_DIGEST_MISSING_OR_MISMATCH")
            else:
                context.load_verify_locations(cafile=str(path))
        except (OSError, ssl.SSLError) as error:
            ca = {"path": str(path), "error": str(error)}
            blockers.append("EGRESS_CA_FILE_UNAVAILABLE_OR_INVALID")
    https = {}
    for host in ["wttr.in", "playwright.dev"]:
        check, _ = get("https://" + host + "/", context)
        if check.get("httpStatus") is None:
            blockers.append("PUBLIC_HTTPS_UNVERIFIED:" + host)
            check["peerChainDiagnostics"] = certificate_metadata(host)
        https[host] = check
    after = command(["docker", "inspect", "--format", "{{.Id}} {{.Name}} {{.Image}} {{.State.StartedAt}}", *ids]) if ids else containers
    ids_after = command(["docker", "ps", "-q"])
    unchanged = (before.get("exitCode") == 0 and after.get("exitCode") == 0
                 and before.get("stdout") == after.get("stdout")
                 and ids_after.get("stdout") == containers.get("stdout"))
    if not unchanged:
        blockers.append("EXISTING_CONTAINER_INVENTORY_CHANGED_OR_UNVERIFIED")
    return {"time": datetime.now(timezone.utc).isoformat(),
            "kind": "read_only_v1_target_infrastructure_preflight",
            "status": "BLOCKED_PREREQUISITES" if blockers else "INFRASTRUCTURE_CHECKS_PASS",
            "deploymentPerformed": False, "acceptance": "NOT_RUN",
            "intendedDeployment": {"installPath": args.install_path, "composeProject": "workbench-v1",
                                   "netidAllowlist": ["mj33kd"], "adminDailyLimit": 100000,
                                   "model": "Qwen3.6-35B-A3B", "freshData": True},
            "directory": directory, "mount": mount, "tools": tools,
            "docker": docker, "compose": compose, "loopControl": Path("/dev/loop-control").exists(),
            "sudoNoninteractive": command(["sudo", "-n", "true"]),
            "existingContainersBefore": before, "existingContainersAfter": after,
            "existingContainersUnchanged": unchanged, "model": model, "netid": netid,
            "ingress": ingress, "egressApprovedCA": ca, "publicHTTPS": https,
            "blockers": blockers}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--install-path", default=INSTALL_PATH)
    parser.add_argument("--base-domain")
    parser.add_argument("--tls-cert")
    parser.add_argument("--tls-key")
    parser.add_argument("--tls-hostname", action="append", default=[])
    parser.add_argument("--egress-ca")
    parser.add_argument("--egress-ca-sha256", help="Maintainer-confirmed SHA256 of the public CA file")
    result = run(parser.parse_args())
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 2 if result["blockers"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
