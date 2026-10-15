#!/usr/bin/env bash
set -euo pipefail
cd /workspace/GramalyzerVibe
mkdir -p /workspace/tools
setup_tmp=$(mktemp -d /tmp/gramalyzer-tools.XXXXXX)
trap 'rm -rf "$setup_tmp"' EXIT
if [ ! -x /workspace/tools/apache-maven-3.9.11/bin/mvn ]; then
  curl --fail --silent --show-error --location https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.11/apache-maven-3.9.11-bin.tar.gz -o "$setup_tmp/maven.tar.gz"
  curl --fail --silent --show-error https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.11/apache-maven-3.9.11-bin.tar.gz.sha512 -o "$setup_tmp/maven.sha512"
  python - "$setup_tmp" <<'PY'
import hashlib,sys
from pathlib import Path
p=Path(sys.argv[1])
assert hashlib.file_digest((p/'maven.tar.gz').open('rb'),'sha512').hexdigest()==(p/'maven.sha512').read_text().split()[0], 'Maven checksum verification failed'
PY
  tar -xzf "$setup_tmp/maven.tar.gz" -C /workspace/tools
fi
if ! find /workspace/tools -maxdepth 3 -path '*/jdk-21*/bin/javac' -type f | rg -q .; then
  curl --fail --silent --show-error --location https://download.oracle.com/java/21/latest/jdk-21_linux-x64_bin.tar.gz -o "$setup_tmp/jdk.tar.gz"
  curl --fail --silent --show-error https://download.oracle.com/java/21/latest/jdk-21_linux-x64_bin.tar.gz.sha256 -o "$setup_tmp/jdk.sha256"
  python - "$setup_tmp" <<'PY'
import hashlib,sys
from pathlib import Path
p=Path(sys.argv[1])
assert hashlib.file_digest((p/'jdk.tar.gz').open('rb'),'sha256').hexdigest()==(p/'jdk.sha256').read_text().split()[0], 'JDK checksum verification failed'
PY
  tar -xzf "$setup_tmp/jdk.tar.gz" -C /workspace/tools
fi
npm ci --cache /workspace/.npm-cache
npm run build
npm run build:api
