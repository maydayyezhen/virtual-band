import { createRoot } from 'react-dom/client';
import { LayoutEditorApp } from './LayoutEditorApp';
import './layout-editor.css';

const root = document.getElementById('root');
if (!root) throw new Error('Layout editor root is missing');

createRoot(root).render(<LayoutEditorApp />);
