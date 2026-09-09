import { createRoot } from 'react-dom/client';
import { LayoutEditorApp } from './LayoutEditorApp';
import { installNocturneStaticBackdrop } from './NocturneStaticBackdrop';
import './layout-editor.css';

installNocturneStaticBackdrop();

const root = document.getElementById('root');
if (!root) throw new Error('Layout editor root is missing');

createRoot(root).render(<LayoutEditorApp />);
