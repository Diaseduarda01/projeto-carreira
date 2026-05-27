#!/usr/bin/env node
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'template');
const DATA = join(ROOT, 'data');
const OUT_HUB = join(ROOT, 'index.html');
const OUT_CVS = join(ROOT, 'cvs');

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const render = (tpl, vars) =>
  tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : ''));

const matchClass = (n) => (n >= 88 ? 'high' : n >= 65 ? 'mid' : 'low');

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

async function loadVagas() {
  const dir = join(DATA, 'vagas');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  return Promise.all(
    files.map(async (f) => {
      const data = await readJson(join(dir, f));
      return { slug: basename(f, '.json'), ...data };
    }),
  );
}

function renderLinks(links) {
  return links
    .map((l) => `      <a href="${l.url}">${escapeHtml(l.label)}</a>`)
    .join(' •\n');
}

function renderExperiencia(exp) {
  const bullets = exp.bullets
    .map((b) => `        <li>${escapeHtml(b)}</li>`)
    .join('\n');
  return `
    <div class="entry">
      <div class="row">
        <span class="company">${escapeHtml(exp.empresa)}</span>
        <span class="location">${escapeHtml(exp.local)}</span>
      </div>
      <div class="row">
        <span class="position">${escapeHtml(exp.cargo)}</span>
        <span class="date">${escapeHtml(exp.periodo)}</span>
      </div>
      <ul>
${bullets}
      </ul>
    </div>`;
}

function renderEducacao(edu) {
  const bullets = edu.bullets
    .map((b) => `        <li>${escapeHtml(b)}</li>`)
    .join('\n');
  return `
    <div class="entry">
      <div class="row">
        <span class="school">${escapeHtml(edu.curso)}</span>
        <span class="school-info">${escapeHtml(edu.info)}</span>
      </div>
      <ul class="edu-italic">
${bullets}
      </ul>
    </div>`;
}

function renderCertificacao(cert) {
  const items = cert.items
    .map((i) => `        <li>${escapeHtml(i)}</li>`)
    .join('\n');
  return `
    <div class="cert-entry">
      <span class="org">${escapeHtml(cert.org)}</span>
      <ul>
${items}
      </ul>
    </div>`;
}

function renderHabilidades(habs) {
  return habs
    .map((h) => `        <li>${escapeHtml(h)}</li>`)
    .join('\n');
}

function renderHubRow({ slug, empresa, vaga, nivel, match, status }) {
  const klass = matchClass(match);
  const statusLabel = status === 'ready' ? 'Pronto' : 'Pendente';
  const action =
    status === 'ready'
      ? `<a href="cvs/${slug}.html">Baixar CV</a>`
      : `<span class="pending">Em breve</span>`;
  return `      <tr data-status="${status}">
        <td data-label="Empresa">${escapeHtml(empresa)}</td>
        <td data-label="Vaga">${escapeHtml(vaga)}</td>
        <td data-label="Nível"><span class="level">${escapeHtml(nivel)}</span></td>
        <td data-label="Match"><span class="match ${klass}">${match}%</span></td>
        <td data-label="Status"><span class="status-tag ${status}">${statusLabel}</span></td>
        <td class="action" data-label="CV" style="text-align:right">${action}</td>
      </tr>`;
}

function buildCv(perfil, vaga, tpl, styles) {
  const cv = vaga.cv;
  const contato = `${perfil.contato.localidade} • ${perfil.contato.email} • ${perfil.contato.telefone}`;
  return render(tpl, {
    titulo: escapeHtml(cv.titulo),
    nome: escapeHtml(perfil.nome),
    role: escapeHtml(cv.role),
    contato: escapeHtml(contato),
    links: renderLinks(perfil.links),
    sobre: escapeHtml(cv.sobre),
    experiencias: (cv.experiencias ?? perfil.experiencias)
      .map(renderExperiencia)
      .join('\n'),
    educacao: (cv.educacao ?? perfil.educacao).map(renderEducacao).join('\n'),
    habilidades: renderHabilidades(cv.habilidades ?? perfil.habilidades),
    certificacoes: (cv.certificacoes ?? perfil.certificacoes)
      .map(renderCertificacao)
      .join('\n'),
    styles,
  });
}

function buildHub(perfil, allRows, tpl, styles) {
  return render(tpl, {
    nome: escapeHtml(perfil.nome),
    rows: allRows.map(renderHubRow).join('\n'),
    styles,
  });
}

async function main() {
  const [perfil, pendings, vagasReady, cvTpl, cvCss, hubTpl, hubCss] =
    await Promise.all([
      readJson(join(DATA, 'perfil.json')),
      readJson(join(DATA, 'vagas-pending.json')),
      loadVagas(),
      readFile(join(TEMPLATE, 'cv.html'), 'utf8'),
      readFile(join(TEMPLATE, 'cv.css'), 'utf8'),
      readFile(join(TEMPLATE, 'hub.html'), 'utf8'),
      readFile(join(TEMPLATE, 'hub.css'), 'utf8'),
    ]);

  await mkdir(OUT_CVS, { recursive: true });

  const readyRows = vagasReady.map((v) => ({ slug: v.slug, ...v.hub }));
  const pendingRows = pendings.map((p) => ({ ...p, status: 'pending' }));
  const allRows = [...readyRows, ...pendingRows];

  await writeFile(OUT_HUB, buildHub(perfil, allRows, hubTpl, hubCss));
  console.log(`✓ index.html (${allRows.length} vagas)`);

  for (const vaga of vagasReady) {
    if (vaga.hub.status !== 'ready') continue;
    const out = join(OUT_CVS, `${vaga.slug}.html`);
    await writeFile(out, buildCv(perfil, vaga, cvTpl, cvCss));
    console.log(`✓ cvs/${vaga.slug}.html`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
