from pathlib import Path
import urllib.request, json, hashlib, tarfile, shutil, base64, io

root=Path(__file__).resolve().parents[1]
tag='v1.18.31'
commit='014614d35b397775e5d397a490fc72368c894ec2'
asset='opencode-linux-x64-baseline.tar.gz'
sha='b283e8dbe9e6fc224bb4b79992ce3bd2174b8b7b0c3e7d1b4e6024a1d11edc84'
def get(url): return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'opencode-cloud-v0'}),timeout=45)
ref=json.load(get('https://api.github.com/repos/anomalyco/opencode/git/ref/tags/'+tag))
if ref['object']['sha']!=commit: raise SystemExit('Upstream tag changed; refusing to build')
release=json.load(get('https://api.github.com/repos/anomalyco/opencode/releases/tags/'+tag))
entry=next(a for a in release['assets'] if a['name']==asset)
if entry.get('digest')!='sha256:'+sha: raise SystemExit('Release digest changed; refusing to build')
vendor=root/'vendor';vendor.mkdir(exist_ok=True)
archive=vendor/asset
if not archive.exists():
 with get(entry['browser_download_url']) as src,archive.open('wb') as dst: shutil.copyfileobj(src,dst)
with archive.open('rb') as f:
 if hashlib.file_digest(f,'sha256').hexdigest()!=sha: raise SystemExit('Binary archive checksum mismatch')
with tarfile.open(archive) as f: f.extractall(vendor,filter='data')
shutil.copy('/etc/ssl/certs/ca-certificates.crt',vendor/'build-ca.crt')
print('Verified fixed upstream',tag,commit,'sha256:'+sha)

# Exact native bun.lock dependency. Place identical embedded library on readonly
# image filesystem because Docker's /tmp noexec prevents Bun FFI extraction.
meta=json.load(get('https://registry.npmjs.org/bun-pty/0.4.8'))
raw=get(meta['dist']['tarball']).read()
expected='rO70Mrbr13+jxHHHu2YBkk2pNqrJE5cJn29WE++PUr+GFA0hq/VgtQPZANJ8dJo6d7XImvBk37Innt8GM7O28w=='
if base64.b64encode(hashlib.sha512(raw).digest()).decode()!=expected:raise SystemExit('Native pty dependency integrity mismatch')
with tarfile.open(fileobj=io.BytesIO(raw)) as t:
 data=t.extractfile('package/rust-pty/target/release/librust_pty.so').read()
if hashlib.sha256(data).hexdigest()!='a135c3d9f41d09a555e3e4609e0c80fa0ba035736c56791b9df3b55e6376438d':raise SystemExit('Native pty library checksum mismatch')
(vendor/'librust_pty.so').write_bytes(data)
print('Verified identical native bun-pty 0.4.8 FFI library')
