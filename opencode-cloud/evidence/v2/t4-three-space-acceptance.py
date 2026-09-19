#!/usr/bin/env python3
"""Run the bounded T4 three-space acceptance against the isolated checkpoint."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import http.client
import json
import pathlib
import re
import socket
import subprocess
import time
import uuid


def run(args: list[str], *, input_text: str | None = None, timeout: float = 90) -> str:
    proc = subprocess.run(args, input=input_text, text=True, capture_output=True, timeout=timeout)
    if proc.returncode:
        raise RuntimeError(f"command failed ({proc.returncode}): {args[0]} {args[1] if len(args) > 1 else ''}")
    return proc.stdout


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


class UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, socket_path: pathlib.Path):
        super().__init__("localhost", timeout=120)
        self.socket_path = str(socket_path)

    def connect(self) -> None:
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.socket_path)


class Acceptance:
    def __init__(self, root: pathlib.Path, evidence: pathlib.Path):
        self.root = root
        self.config = json.loads((root / "lifecycle.json").read_text())
        self.socket = root / "lifecycle/lifecycle.sock"
        self.evidence = evidence
        self.events: list[dict] = []
        self.samples: list[dict] = []
        self.sessions: dict[str, str] = {}
        self.results: dict[str, dict] = {}

    def lifecycle(self, space: str, action: str, request_id: str | None = None) -> dict:
        body: dict[str, str] = {"space": space, "action": action}
        if request_id is not None:
            body["requestId"] = request_id
        payload = json.dumps(body).encode()
        conn = UnixHTTPConnection(self.socket)
        conn.request("POST", "/lifecycle", payload, {"Content-Type": "application/json"})
        response = conn.getresponse()
        raw = response.read()
        conn.close()
        if response.status != 200:
            raise RuntimeError(f"lifecycle {space}/{action} returned {response.status}")
        result = json.loads(raw)
        self.events.append({
            "at": utc(), "space": space, "action": action,
            "result": {k: result.get(k) for k in ("state", "generation", "queuePosition", "runningMembers", "forced") if k in result},
        })
        return result

    def service(self, space: str, role: str) -> str:
        cfg = self.config["spaces"][space]
        defaults = {
            "gateway": "engineer-b-model-gateway", "egress": "engineer-b-web-egress",
            "native": "engineer-b-native", "firewall": "engineer-b-native-firewall",
            "guard": "engineer-b-native-guard",
        }
        service = cfg.get("roles", {}).get(role, defaults[role])
        return cfg["containers"][service]

    def native(self, space: str) -> str:
        return self.service(space, "native")

    def node(self, space: str, source: str, *, timeout: float = 90) -> str:
        return run(["docker", "exec", "-i", self.native(space), "node"], input_text=source, timeout=timeout)

    def submit(self, space: str, prompt: str, session: str | None = None) -> tuple[str, str]:
        message = "msg_t4_" + uuid.uuid4().hex
        source = r"""
const auth='Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64');
const headers={Authorization:auth,'Content-Type':'application/json'};
const base='http://127.0.0.1:4096';
const input=JSON.parse(process.argv[2]);
(async()=>{
 let sid=input.session;
 if(!sid){const r=await fetch(base+'/session?directory=/workspace/project',{method:'POST',headers,body:JSON.stringify({title:input.title})});if(!r.ok)throw Error('create '+r.status);sid=(await r.json()).id;}
 const r=await fetch(base+'/session/'+sid+'/prompt_async?directory=/workspace/project',{method:'POST',headers,body:JSON.stringify({messageID:input.message,model:{providerID:'approved',modelID:'Qwen3.6-35B-A3B'},parts:[{type:'text',text:input.prompt}]})});
 if(r.status!==204)throw Error('submit '+r.status);
 console.log(JSON.stringify({session:sid,message:input.message,status:r.status}));
})().catch(e=>{console.error(e.message);process.exit(1)});
"""
        payload = json.dumps({"session": session, "title": f"T4 {space} acceptance", "message": message, "prompt": prompt})
        result = json.loads(run(["docker", "exec", "-i", self.native(space), "node", "-", payload], input_text=source, timeout=90))
        self.sessions[space] = result["session"]
        self.events.append({"at": utc(), "space": space, "action": "real-qwen-submit", "session": result["session"], "message": message, "status": result["status"]})
        return result["session"], message

    def observe(self, space: str, session: str, message: str) -> dict:
        source = r"""
const crypto=require('node:crypto');
const auth='Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64');
const h={Authorization:auth};const base='http://127.0.0.1:4096';const input=JSON.parse(process.argv[2]);
(async()=>{
 const sr=await fetch(base+'/session/status?directory=/workspace/project',{headers:h});if(!sr.ok)throw Error('status '+sr.status);const states=await sr.json();
 const mr=await fetch(base+'/session/'+input.session+'/message?directory=/workspace/project',{headers:h});if(!mr.ok)throw Error('messages '+mr.status);const messages=await mr.json();
 const index=messages.findIndex(x=>x.info&&x.info.id===input.message);const scoped=index<0?[]:messages.slice(index);
 const tools=scoped.flatMap(x=>(x.parts||[]).filter(p=>p.type==='tool').map(p=>({tool:p.tool,status:p.state&&p.state.status,exit:p.state&&p.state.metadata&&(p.state.metadata.exit??p.state.metadata.exitCode??null),outputSha256:crypto.createHash('sha256').update((p.state&&p.state.output)||'').digest('hex')})));
 const assistants=scoped.filter(x=>x.info&&x.info.role==='assistant');const last=assistants.at(-1);
 console.log(JSON.stringify({busy:!!states[input.session]&&states[input.session].type!=='idle',messageFound:index>=0,completed:!!(last&&last.info&&last.info.time&&last.info.time.completed),finish:last&&last.info&&last.info.finish,errorName:last&&last.info&&last.info.error&&last.info.error.name,tools}));
})().catch(e=>{console.error(e.message);process.exit(1)});
"""
        payload = json.dumps({"session": session, "message": message})
        return json.loads(run(["docker", "exec", "-i", self.native(space), "node", "-", payload], input_text=source, timeout=45))

    def wait(self, pending: dict[str, tuple[str, str]], timeout: float = 900) -> None:
        deadline = time.monotonic() + timeout
        while pending and time.monotonic() < deadline:
            self.sample("real-model-work")
            for space, (session, message) in list(pending.items()):
                result = self.observe(space, session, message)
                if result.get("errorName"):
                    raise RuntimeError(f"real model failed for {space}: {result['errorName']}")
                if result.get("messageFound") and result.get("completed") and not result.get("busy"):
                    self.results[f"{space}:{message}"] = result
                    self.events.append({"at": utc(), "space": space, "action": "real-qwen-complete", "session": session, "message": message, "finish": result.get("finish"), "tools": result.get("tools", [])})
                    del pending[space]
            if pending:
                time.sleep(3)
        if pending:
            raise RuntimeError("bounded real-model deadline expired: " + ",".join(sorted(pending)))

    @staticmethod
    def memory_bytes(value: str) -> int:
        number, unit = re.match(r"([0-9.]+)([KMG]iB|B)", value.strip()).groups()
        scale = {"B": 1, "KiB": 1024, "MiB": 1024**2, "GiB": 1024**3}[unit]
        return round(float(number) * scale)

    def sample(self, label: str) -> dict:
        names = [x for x in run(["docker", "ps", "--format", "{{.Names}}"]).splitlines() if x.startswith("workbench-v2-checkpoint-")]
        containers = []
        if names:
            raw = run(["docker", "stats", "--no-stream", "--format", "{{json .}}", *names], timeout=45)
            for line in raw.splitlines():
                row = json.loads(line)
                containers.append({"name": row["Name"], "memoryBytes": self.memory_bytes(row["MemUsage"].split("/")[0]), "pids": int(row["PIDs"])})
        private = [x for x in containers if any(f"-{s}-" in x["name"] for s in ("engineer-b", "lazy-c", "lazy-d"))]
        persistent = [x for x in containers if x["name"].endswith("-platform-1") or x["name"].endswith("-shared-model-gateway-1")]
        result = {
            "at": utc(), "label": label, "runningContainers": len(containers),
            "privateMemoryBytes": sum(x["memoryBytes"] for x in private), "privatePids": sum(x["pids"] for x in private),
            "persistentMemoryBytes": sum(x["memoryBytes"] for x in persistent), "persistentPids": sum(x["pids"] for x in persistent),
            "privateContainerCount": len(private), "persistentContainerCount": len(persistent),
        }
        self.samples.append(result)
        return result

    def export(self, space: str) -> dict:
        target = self.root / "t4-private-artifacts"
        target.mkdir(mode=0o700, exist_ok=True)
        state_target = "/state/t4-delivery"
        source = r"""
const fs=require('node:fs'),crypto=require('node:crypto');
const auth='Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64');
const h={Authorization:auth};const base='http://127.0.0.1:4096';const dir=process.argv[2];fs.mkdirSync(dir,{recursive:true});
(async()=>{const out={};let r=await fetch(base+'/__source',{headers:h});let b=Buffer.from(await r.arrayBuffer());if(!r.ok)throw Error('/__source '+r.status);fs.writeFileSync(dir+'/source.zip',b,{mode:0o600});out['source.zip']={bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};r=await fetch(base+'/__export',{headers:h});b=Buffer.from(await r.arrayBuffer());if(!r.ok)throw Error('/__export '+r.status);const metadata=JSON.parse(b);const patch=Buffer.from(metadata.patch||'');if(!patch.length)throw Error('empty patch');fs.writeFileSync(dir+'/export-response.json',b,{mode:0o600});fs.writeFileSync(dir+'/changes.patch',patch,{mode:0o600});out['changes.patch']={bytes:patch.length,sha256:crypto.createHash('sha256').update(patch).digest('hex'),baseline:metadata.baseline,tree:metadata.tree,metadataSha256:crypto.createHash('sha256').update(b).digest('hex')};console.log(JSON.stringify(out));})().catch(e=>{console.error(e.message);process.exit(1)});
"""
        result = json.loads(run(["docker", "exec", "-i", self.native(space), "node", "-", state_target], input_text=source, timeout=120))
        inspected = json.loads(run(["docker", "inspect", self.native(space)]))[0]
        state_mount = next((x["Source"] for x in inspected["Mounts"] if x["Destination"] == "/state"), None)
        if not state_mount:
            raise RuntimeError("native state mount was not found")
        host_state = pathlib.Path(state_mount) / "t4-delivery"
        for name in ("source.zip", "changes.patch"):
            data = (host_state / name).read_bytes()
            if sha(data) != result[name]["sha256"]:
                raise RuntimeError("export digest changed during capture")
            (target / name).write_bytes(data)
        return {**result, "privateDirectory": str(target)}

    def manifest(self, project: pathlib.Path) -> dict:
        rows = []
        for p in sorted(project.rglob("*")):
            if not p.is_file() or any(x in p.parts for x in (".git", "node_modules", "dist", ".workbench-artifacts")):
                continue
            rows.append((str(p.relative_to(project)), sha(p.read_bytes())))
        encoded = json.dumps(rows, separators=(",", ":")).encode()
        index = project / ".git/index"
        return {"fileCount": len(rows), "manifestSha256": sha(encoded), "indexSha256": sha(index.read_bytes()), "gitStatus": run(["git", "-C", str(project), "status", "--short"]).splitlines()}

    def execute(self) -> dict:
        spaces = ("engineer-b", "lazy-c", "lazy-d")
        before = {s: self.lifecycle(s, "status") for s in spaces}
        if any(x["state"] != "STOPPED" for x in before.values()):
            raise RuntimeError("T4 requires all spaces stopped before the flow")
        engineer_project = self.root / "project"
        engineer_before = self.manifest(engineer_project)
        lazy_allocated_before = {s: int(run(["du", "-s", str(self.root / s)]).split()[0]) * 1024 for s in ("lazy-c", "lazy-d")}
        self.sample("stopped-before")

        cold = {}
        for space in ("engineer-b", "lazy-c"):
            started = time.monotonic()
            result = self.lifecycle(space, "enter", "t4-enter-" + space + "-" + uuid.uuid4().hex[:8])
            cold[space] = {"seconds": round(time.monotonic() - started, 3), "state": result["state"], "generation": result["generation"]}
        self.sample("two-spaces-idle-ready")

        a_session, a_message = self.submit("engineer-b", "Inspect the authorized project and run npm test from /workspace/project/web. Report the exact result. Do not modify files.")
        self.wait({"engineer-b": (a_session, a_message)})
        # The approved llama.cpp backend has one physical slot. Keep both spaces
        # running, but submit B only after A completes rather than manufacturing
        # model concurrency that the real backend does not provide.
        time.sleep(5)
        b_session, b_message = self.submit("lazy-c", "Create /workspace/project/T4_B_WORK.txt containing exactly 'lazy-c real Qwen work completed' plus a newline. Then run npm test from /workspace/project/web. Do not modify other files.")
        self.wait({"lazy-c": (b_session, b_message)})
        queued = self.lifecycle("lazy-d", "enter", "t4-enter-lazy-d-" + uuid.uuid4().hex[:8])
        if queued["state"] != "QUEUED" or queued.get("queuePosition") != 1:
            raise RuntimeError("third space did not enter the one-place queue")

        released = self.lifecycle("engineer-b", "stop", "t4-stop-engineer-b-" + uuid.uuid4().hex[:8])
        if released["state"] != "STOPPED" or released.get("forced"):
            raise RuntimeError("engineer-b did not stop safely")
        promoted = self.lifecycle("lazy-d", "status")
        if promoted["state"] != "READY":
            raise RuntimeError("queued space was not promoted")
        self.sample("lazy-d-promoted-after-a-stop")

        c_session, c_message = self.submit("lazy-d", "Create /workspace/project/T4_C_WORK.txt containing exactly 'lazy-d promoted real Qwen work completed' plus a newline. Then run npm test from /workspace/project/web. Do not modify other files.")
        self.wait({"lazy-d": (c_session, c_message)})
        self.lifecycle("lazy-c", "stop", "t4-stop-lazy-c-" + uuid.uuid4().hex[:8])
        self.lifecycle("lazy-d", "stop", "t4-stop-lazy-d-" + uuid.uuid4().hex[:8])
        self.sample("all-spaces-stopped-mid-flow")

        resumed_at = time.monotonic()
        resumed = self.lifecycle("engineer-b", "enter", "t4-reenter-engineer-b-" + uuid.uuid4().hex[:8])
        reentry_seconds = round(time.monotonic() - resumed_at, 3)
        if resumed["state"] != "READY":
            raise RuntimeError("engineer-b did not resume")
        a2_session, a2_message = self.submit("engineer-b", "Continue this same session. Add a new module /workspace/project/src/t4-label.js exporting normalizeT4Label(value), which converts the value to a string, trims it, collapses internal whitespace to one space, and returns the result. Add /workspace/project/test/t4-label.test.mjs with standard-library node:test coverage for trimming, whitespace collapse, empty input, and a numeric value. Run node --test /workspace/project/test/*.test.mjs and then npm test and npm run build from /workspace/project/web. Do not change existing files.", a_session)
        if a2_session != a_session:
            raise RuntimeError("continuation created a different session")
        self.wait({"engineer-b": (a2_session, a2_message)})
        export = self.export("engineer-b")
        engineer_after = self.manifest(engineer_project)
        self.lifecycle("engineer-b", "stop", "t4-final-stop-engineer-b-" + uuid.uuid4().hex[:8])
        after = {s: self.lifecycle(s, "status") for s in spaces}
        self.sample("stopped-after")
        lazy_allocated_after = {s: int(run(["du", "-s", str(self.root / s)]).split()[0]) * 1024 for s in ("lazy-c", "lazy-d")}

        report = {
            "schemaVersion": 1, "capturedAt": utc(), "environment": "isolated workbench-v2-checkpoint",
            "identityDisclosure": {"engineer-b": "existing real local development identity", "lazy-c": "capacity test identity", "lazy-d": "capacity test identity"},
            "policy": {"maxRunning": self.config["maxRunning"], "maxQueued": self.config["maxQueued"]},
            "before": before, "coldStarts": cold, "reentrySeconds": reentry_seconds,
            "sessions": self.sessions, "events": self.events, "samples": self.samples,
            "modelResults": self.results, "queuedThird": queued, "promotedThird": promoted,
            "engineerBefore": engineer_before, "engineerAfter": engineer_after, "export": export,
            "lazyAllocatedBytesBefore": lazy_allocated_before, "lazyAllocatedBytesAfter": lazy_allocated_after,
            "after": after,
            "assertions": {
                "twoRunningOneQueued": queued["state"] == "QUEUED",
                "safeStopPromotedOne": released["state"] == "STOPPED" and not released.get("forced") and promoted["state"] == "READY",
                "allThreeUsedRealQwen": len(self.results) == 4 and all(x.get("finish") == "stop" for x in self.results.values()),
                "sameSessionContinued": a2_session == a_session,
                "uncommittedWorkRetainedAndExtended": engineer_before["indexSha256"] == engineer_after["indexSha256"] and engineer_before["manifestSha256"] != engineer_after["manifestSha256"],
                "allExecutionGroupsStopped": all(x["state"] == "STOPPED" and x.get("runningMembers", 0) == 0 for x in after.values()),
            },
        }
        self.evidence.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=pathlib.Path, required=True)
    parser.add_argument("--evidence", type=pathlib.Path, required=True)
    args = parser.parse_args()
    report = Acceptance(args.root.resolve(), args.evidence.resolve()).execute()
    if not all(report["assertions"].values()):
        raise SystemExit("T4 assertions did not all pass")
    print(json.dumps({"status": "PASS", "sessions": report["sessions"], "assertions": report["assertions"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
