import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function runBackend(args: string[], overrides: Record<string,string> = {}, detached = false) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const botRoot = process.env.GRAMALYZER_BOT_DIR ?? resolve(root, '../GramalyzerBot');
  if (!existsSync(resolve(botRoot, 'pom.xml'))) throw new Error('GramalyzerBot source with pom.xml is required. See README.md or set GRAMALYZER_BOT_DIR.');
  const tooling = '/workspace/tools';
  const maven = process.env.MAVEN_BIN ?? (existsSync(`${tooling}/apache-maven-3.9.11/bin/mvn`) ? `${tooling}/apache-maven-3.9.11/bin/mvn` : 'mvn');
  const env = {...process.env, ...overrides};
  const java = process.env.GRAMALYZER_JAVA_HOME ?? (existsSync(tooling) ? readdirSync(tooling).filter(x => x.startsWith('jdk-21') && existsSync(`${tooling}/${x}/bin/javac`)).map(x => `${tooling}/${x}`)[0] : undefined);
  if (java) env.JAVA_HOME = java;
  const extra: string[] = [];
  if (existsSync('/workspace/tools')) extra.push('-Dmaven.repo.local=/workspace/.m2/repository');
  if (existsSync('/etc/ssl/certs/java/cacerts')) {
    extra.push('-Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts');
    if (args.includes('spring-boot:run')) extra.push('-Dspring-boot.run.jvmArguments=-Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts');
  }
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (proxy) {
    const url = new URL(proxy);
    if (url.username || url.password) throw new Error('Configure authenticated Maven proxy settings through your runtime; credentials will not be copied into project files.');
    const directory = resolve(root, '.data'); mkdirSync(directory, {recursive: true});
    const xml = (s: string) => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    const settings = resolve(directory, 'maven-settings.xml');
    writeFileSync(settings, `<settings><proxies><proxy><id>runtime</id><active>true</active><protocol>http</protocol><host>${xml(url.hostname)}</host><port>${url.port || '80'}</port><nonProxyHosts>localhost|127.0.0.1</nonProxyHosts></proxy></proxies></settings>`, {mode: 0o600});
    extra.push('-s', settings);
  }
  return spawn(maven, ['-B','-ntp',...extra,...args], {cwd: botRoot, env, stdio: 'inherit', detached});
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const child = runBackend(process.argv.slice(2));
  child.on('error', error => {console.error(error.message); process.exitCode = 1;});
  child.on('exit', code => {process.exitCode = code ?? 1;});
  process.on('SIGINT', () => child.kill('SIGINT')); process.on('SIGTERM', () => child.kill('SIGTERM'));
}
