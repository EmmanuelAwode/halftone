import { useEffect, useState } from 'react';
import { ProjectsScreen } from './ui/ProjectsScreen';
import { EditorScreen } from './ui/EditorScreen';
import { saveProject } from './lib/db';
import { createProject, SIZE_PRESETS } from './lib/project';
import { TEMPLATES, templateObjects } from './editor/templates';
import { loadAllFonts } from './lib/fonts';

type Route = { view: 'home' } | { view: 'edit'; id: string } | { view: 'new'; kind: string };

function parseHash(): Route {
  const edit = location.hash.match(/^#\/edit\/([\w-]+)/);
  if (edit) return { view: 'edit', id: edit[1] };
  const fresh = location.hash.match(/^#\/new\/([\w-]+)/);
  if (fresh) return { view: 'new', kind: fresh[1] };
  return { view: 'home' };
}

/** `#/new/<template-or-preset-id>` creates a design and opens it (handy for shareable links). */
async function createFromLink(kind: string): Promise<string | null> {
  const t = TEMPLATES.find((x) => x.id === kind);
  if (t) {
    await loadAllFonts();
    const doc = createProject({ name: t.label, width: t.width, height: t.height, background: t.background, objects: templateObjects(t) });
    await saveProject(doc);
    return doc.id;
  }
  const p = SIZE_PRESETS.find((x) => x.id === kind);
  if (p) {
    const doc = createProject({ name: `Untitled ${p.label}`, width: p.width, height: p.height });
    await saveProject(doc);
    return doc.id;
  }
  return null;
}

export function App() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    if (route.view !== 'new') return;
    let live = true;
    createFromLink(route.kind).then((id) => {
      if (live) location.replace(id ? `#/edit/${id}` : '#/');
    });
    return () => {
      live = false;
    };
  }, [route]);
  if (route.view === 'new') return <div className="stage-loading full">Creating design…</div>;
  if (route.view === 'edit') return <EditorScreen key={route.id} id={route.id} onExit={() => (location.hash = '#/')} />;
  return <ProjectsScreen open={(id) => (location.hash = `#/edit/${id}`)} />;
}
