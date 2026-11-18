import { useEffect, useRef, useState } from 'react';
import { importBackup, buildBackup, BACKUP_EXT } from '../lib/backup';
import { deleteProject, listProjects, renameProject, saveProject } from '../lib/db';
import { createProject, MAX_DIM, MIN_DIM, SIZE_PRESETS, type ProjectMeta } from '../lib/project';
import { TEMPLATES, templateObjects } from '../editor/templates';
import { downloadBlob, safeFilename } from '../editor/scene';
import { Icon, Logo } from './icons';
import { useToast } from './toast';
import { useInstallPrompt } from './useInstallPrompt';

function timeAgo(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString();
}

function PresetShape({ w, h }: { w: number; h: number }) {
  const max = 46;
  const s = max / Math.max(w, h);
  return (
    <span className="preset-shape" aria-hidden="true">
      <span style={{ width: w * s, height: h * s }} />
    </span>
  );
}

export function ProjectsScreen({ open }: { open: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [cw, setCw] = useState(1280);
  const [ch, setCh] = useState(720);
  const [renaming, setRenaming] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { canInstall, install } = useInstallPrompt();

  const refresh = () => listProjects().then(setProjects);
  useEffect(() => {
    refresh();
  }, []);

  const create = async (name: string, width: number, height: number, background: string | null = '#ffffff', objects = undefined as any) => {
    const doc = createProject({ name, width, height, background, objects });
    await saveProject(doc);
    open(doc.id);
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const id = await importBackup(f);
      toast('Backup imported', 'info');
      await refresh();
      open(id);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <div className="home">
      <header className="home-bar">
        <div className="brand">
          <Logo />
          <span className="brand-name">Halftone</span>
          <span className="brand-tag">local design studio</span>
        </div>
        <div className="home-bar-actions">
          {canInstall && (
            <button className="btn primary" onClick={install} title="Install Halftone as an app on this computer — it works offline">
              <Icon name="download" /> Install app
            </button>
          )}
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            <Icon name="backup" /> Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={`${BACKUP_EXT},.json,application/json`}
            hidden
            onChange={(e) => {
              onImport(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <main className="home-main">
        <section className="home-section">
          <h2>Start a design</h2>
          <div className="preset-grid">
            {SIZE_PRESETS.map((p) => (
              <button key={p.id} className="preset-card" onClick={() => create(`Untitled ${p.label}`, p.width, p.height)}>
                <PresetShape w={p.width} h={p.height} />
                <span className="preset-label">{p.label}</span>
                <span className="preset-hint">{p.hint}</span>
              </button>
            ))}
            <form
              className="preset-card custom"
              onSubmit={(e) => {
                e.preventDefault();
                create('Untitled custom design', cw, ch);
              }}
            >
              <span className="preset-label">Custom size</span>
              <div className="custom-dims">
                <input
                  type="number"
                  min={MIN_DIM}
                  max={MAX_DIM}
                  value={cw}
                  onChange={(e) => setCw(Number(e.target.value))}
                  aria-label="Custom width in pixels"
                />
                <span>×</span>
                <input
                  type="number"
                  min={MIN_DIM}
                  max={MAX_DIM}
                  value={ch}
                  onChange={(e) => setCh(Number(e.target.value))}
                  aria-label="Custom height in pixels"
                />
                <span className="unit">px</span>
              </div>
              <button className="btn primary sm" type="submit">
                Create
              </button>
            </form>
          </div>
        </section>

        <section className="home-section">
          <h2>Starter templates</h2>
          <div className="template-grid">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                className="template-card"
                onClick={() => create(t.label, t.width, t.height, t.background, templateObjects(t))}
              >
                <span className="template-art" style={{ aspectRatio: `${t.width} / ${t.height}`, background: t.swatch[0] }}>
                  <span className={`tpl tpl-${t.id}`}>
                    <i style={{ background: t.swatch[1] }} />
                    <i style={{ background: t.swatch[2] }} />
                    <b>Photo</b>
                  </span>
                </span>
                <span className="template-meta">
                  <span className="preset-label">{t.label}</span>
                  <span className="preset-hint">
                    {t.width} × {t.height} · {t.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="home-section">
          <h2>
            Your designs <span className="count">{projects?.length ?? ''}</span>
          </h2>
          {projects && projects.length === 0 && (
            <p className="empty">Nothing here yet. Designs are saved automatically in this browser as you work.</p>
          )}
          <div className="project-grid">
            {projects?.map((p) => (
              <article key={p.id} className="project-card">
                <button className="project-thumb" onClick={() => open(p.id)} aria-label={`Open ${p.name}`}>
                  {p.thumbnail ? <img src={p.thumbnail} alt="" /> : <span className="thumb-empty">{p.width}×{p.height}</span>}
                </button>
                <div className="project-meta">
                  {renaming === p.id ? (
                    <input
                      className="rename"
                      autoFocus
                      defaultValue={p.name}
                      aria-label="Design name"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      onBlur={async (e) => {
                        const v = e.target.value.trim();
                        setRenaming(null);
                        if (v && v !== p.name) {
                          await renameProject(p.id, v);
                          refresh();
                        }
                      }}
                    />
                  ) : (
                    <button className="project-name" onDoubleClick={() => setRenaming(p.id)} onClick={() => open(p.id)}>
                      {p.name}
                    </button>
                  )}
                  <span className="preset-hint">
                    {p.width} × {p.height} · {timeAgo(p.updatedAt)}
                  </span>
                </div>
                <div className="project-actions">
                  <button className="icon-btn" title="Rename" aria-label={`Rename ${p.name}`} onClick={() => setRenaming(p.id)}>
                    <Icon name="edit" size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Download editable backup"
                    aria-label={`Download backup of ${p.name}`}
                    onClick={async () => downloadBlob(await buildBackup(p.id), safeFilename(p.name) + BACKUP_EXT)}
                  >
                    <Icon name="download" size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    title="Delete"
                    aria-label={`Delete ${p.name}`}
                    onClick={async () => {
                      if (!confirm(`Delete “${p.name}”? This can’t be undone.`)) return;
                      await deleteProject(p.id);
                      refresh();
                    }}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer className="home-foot">Everything stays in this browser — no account, no uploads. Use backups to move designs between computers.</footer>
    </div>
  );
}
