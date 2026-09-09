import { createRoot } from 'react-dom/client';
import { LayoutEditorApp } from './LayoutEditorApp';
import { installLayoutEditorCameraPan } from './LayoutEditorCameraPan';
import { installNocturneLayoutStage } from './NocturneLayoutStage';
import './layout-editor.css';

installNocturneLayoutStage();
installLayoutEditorCameraPan();

const root = document.getElementById('root');
if (!root) throw new Error('Layout editor root is missing');

createRoot(root).render(<LayoutEditorApp />);
